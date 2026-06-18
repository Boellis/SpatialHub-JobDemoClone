"""playground.py -- build + run BioSim configs with farmer-supplied overrides.

Backs the ``POST /api/survival/playground/run`` endpoint and is reusable as a
library. It takes the defensible config (``configs/survival_defensible.biosim``),
applies a small set of named overrides (store levels/capacities, BiomassPS
power/water budgets, crop area, food store), builds an N-crew config with the
existing survival crew builder, and runs it against the live BioSim to death-or-cap.

Run logic mirrors ``_bench/bench.py`` (passive / maxctrl modes, in-band sols,
mars-grown calorie %), kept in-tree so the endpoint has no out-of-tree dependency.

ONE BioSim instance is assumed -- runs are sequential, one sim each.
"""
from __future__ import annotations

import re
import time
from pathlib import Path

from . import config as cfgmod
from .biosim_control import BiosimControl
from .state import CONTROLLABLE, TICKS_PER_SOL, summarize_state

DEFENSIBLE_CONFIG = Path(__file__).parent / "configs" / "survival_defensible.biosim"

# Life-critical safe bands (store fill %); a store is in-band when low <= pct <= high.
# Mirrors bench.py: low is the danger for these four; CO2 is excluded (vent buffer).
BANDS = {
    "O2_Store":            (15.0, 100.0),
    "Potable_Water_Store": (15.0, 100.0),
    "General_Power_Store": (15.0, 100.0),
    "Food_Store":          (15.0, 100.0),
}

MALF_MODULE = "Grey_Water_Store"

# Crop types BioSim accepts (matches the crop enum used in <shelf cropType="...">).
# Anything outside this whitelist is rejected and we fall back to the default.
CROP_TYPES = (
    "SOYBEAN", "WHEAT", "WHITE_POTATO", "RICE", "DRY_BEAN", "LETTUCE", "TOMATO",
)
DEFAULT_CROP_TYPE = "SOYBEAN"

# Shelf-count bounds: at least one shelf, at most 50.
MIN_SHELVES = 1
MAX_SHELVES = 50

# Named overrides -> how to rewrite the .biosim XML. Each handler takes (xml, value)
# and returns the new xml. Keys are the public override names accepted in the request.
#   dirty_water_level  -> DirtyWaterStore level=
#   nuclear_power      -> Nuclear_Source powerProducer desiredFlowRates=
#   biomass_power      -> BiomassPS powerConsumer desiredFlowRates=
#   biomass_water      -> BiomassPS potableWaterConsumer desiredFlowRates=
#   crop_area          -> BiomassPS <shelf cropArea=
#   crop_type          -> BiomassPS <shelf cropType= (validated against CROP_TYPES)
#   num_shelves        -> count of <shelf .../> entries inside BiomassPS
#   food_store         -> FoodStore level= (and capacity bumped to >= level)


def _set_store_attr(xml, store_tag, attr, value):
    """Set attr=value on a self-closing store element matching <StoreTag ... />."""
    pat = re.compile(r"(<" + store_tag + r"\b[^>]*?\b" + attr + r'=")[^"]*(")')
    if pat.search(xml):
        return pat.sub(lambda m: m.group(1) + str(value) + m.group(2), xml, count=1)
    return xml


def _set_module_surface_rate(xml, module_tag, surface_tag, value):
    """Set desiredFlowRates="value" on <surface_tag .../> within <module_tag>...</module_tag>."""
    block_pat = re.compile(r"(<" + module_tag + r"\b.*?</" + module_tag + r">)", re.DOTALL)
    m = block_pat.search(xml)
    if not m:
        return xml
    block = m.group(1)
    surf_pat = re.compile(r"(<" + surface_tag + r"\b[^>]*?\bdesiredFlowRates=\")[^\"]*(\")")
    if not surf_pat.search(block):
        return xml
    new_block = surf_pat.sub(lambda s: s.group(1) + str(value) + s.group(2), block, count=1)
    return xml[:m.start(1)] + new_block + xml[m.end(1):]


def _set_biomass_shelves(xml, num_shelves, crop_area, crop_type):
    """Replace every <shelf .../> inside <BiomassPS>...</BiomassPS> with
    `num_shelves` identical shelves (same per-shelf cropArea + cropType).

    Mirrors the exact self-closing form BioSim accepts:
        <shelf cropArea="..." cropType="..."/>
    Only the shelves inside the BiomassPS block are touched.
    """
    block_pat = re.compile(r"(<BiomassPS\b.*?</BiomassPS>)", re.DOTALL)
    m = block_pat.search(xml)
    if not m:
        return xml
    block = m.group(1)
    shelf = '<shelf cropArea="{}" cropType="{}"/>'.format(crop_area, crop_type)
    shelves = "\n\t\t\t\t".join([shelf] * num_shelves)
    # Replace the first run of <shelf .../> entries with the rebuilt set.
    new_block, n = re.subn(r"(?:\s*<shelf\b[^>]*/>)+",
                           "\n\t\t\t\t" + shelves, block, count=1)
    if n == 0:
        return xml
    return xml[:m.start(1)] + new_block + xml[m.end(1):]


def _apply_override(xml, name, value):
    if name == "dirty_water_level":
        return _set_store_attr(xml, "DirtyWaterStore", "level", value)
    if name == "nuclear_power":
        return _set_module_surface_rate(xml, "PowerPS", "powerProducer", value)
    if name == "biomass_power":
        return _set_module_surface_rate(xml, "BiomassPS", "powerConsumer", value)
    if name == "biomass_water":
        return _set_module_surface_rate(xml, "BiomassPS", "potableWaterConsumer", value)
    if name == "crop_area":
        return re.sub(r'(<shelf\b[^>]*?\bcropArea=")[^"]*(")',
                      lambda m: m.group(1) + str(value) + m.group(2), xml, count=1)
    if name == "food_store":
        xml = _set_store_attr(xml, "FoodStore", "level", value)
        # keep capacity >= level so the store can actually hold the override.
        xml = _set_store_attr(xml, "FoodStore", "capacity", value)
        return xml
    return xml  # unknown override: ignored (caller may report it)


# crop_area / crop_type / num_shelves are handled together (they all rebuild the
# BiomassPS shelves), so they live here but are applied in build_config, not via
# the per-override _apply_override dispatch.
SHELF_OVERRIDES = ("crop_area", "crop_type", "num_shelves")

SUPPORTED_OVERRIDES = (
    "dirty_water_level", "nuclear_power", "biomass_power",
    "biomass_water", "crop_area", "crop_type", "num_shelves", "food_store",
)


def build_config(overrides, crew_size=15, config_name=None):
    """Build a crewed config with overrides applied.

    `config_name` selects a whitelisted base config (validated via
    config.resolve_config_path); None keeps the defensible base (the playground's
    farmer-tuning sandbox default). Returns (xml, applied, ignored) where
    applied/ignored are override-name lists."""
    base = (cfgmod.resolve_config_path(config_name)
            if config_name is not None else DEFENSIBLE_CONFIG)
    xml = base.read_text()
    xml = re.sub(r'runTillCrewDeath="[^"]*"', 'runTillCrewDeath="true"', xml)
    overrides = overrides or {}
    applied, ignored = [], []
    for name, value in overrides.items():
        if name not in SUPPORTED_OVERRIDES:
            ignored.append(name)
            continue
        if name in SHELF_OVERRIDES:
            continue  # applied together below
        xml = _apply_override(xml, name, value)
        applied.append(name)

    # Shelf overrides (crop_area / crop_type / num_shelves) rebuild the BiomassPS
    # shelves as one unit. Validate/clamp each; only rebuild if at least one was
    # supplied so configs that don't touch shelves keep the base shelf verbatim.
    if any(k in overrides for k in SHELF_OVERRIDES):
        crop_area = overrides.get("crop_area", 1)
        crop_type = overrides.get("crop_type", DEFAULT_CROP_TYPE)
        if not isinstance(crop_type, str) or crop_type not in CROP_TYPES:
            crop_type = DEFAULT_CROP_TYPE
        try:
            num_shelves = int(overrides.get("num_shelves", 1))
        except (TypeError, ValueError):
            num_shelves = 1
        num_shelves = max(MIN_SHELVES, min(num_shelves, MAX_SHELVES))
        xml = _set_biomass_shelves(xml, num_shelves, crop_area, crop_type)
        for k in SHELF_OVERRIDES:
            if k in overrides:
                applied.append(k)
    # Crew builder (same marker dance as config.build_survival_config).
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", cfgmod._CREW_MARKER, xml,
                 count=1, flags=re.DOTALL)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", "", xml, flags=re.DOTALL)
    xml = xml.replace(cfgmod._CREW_MARKER, cfgmod._crew(crew_size))
    return xml, applied, ignored


def _store_pct(raw):
    out = {}
    for name, mod in (raw.get("modules") or {}).items():
        props = (mod or {}).get("properties", {}) or {}
        lvl, cap = props.get("currentLevel"), props.get("currentCapacity")
        if lvl is not None and cap:
            out[name] = (lvl / cap) * 100.0
    return out


def _in_band(pcts):
    for name, (lo, hi) in BANDS.items():
        if name not in pcts:
            return False
        if not (lo <= pcts[name] <= hi):
            return False
    return True


def _food_flows(raw):
    m = raw.get("modules") or {}
    produced = 0.0
    fp = m.get("FoodProcessor")
    if fp:
        for s in fp.get("producers", []) or []:
            if s.get("type") == "Food":
                r = s.get("rates", {}) or {}
                produced += sum(r.get("actualFlowRates") or r.get("desiredFlowRates") or [])
    consumed = 0.0
    crew = m.get("Crew_Quarters_Group")
    if crew:
        for s in crew.get("consumers", []) or []:
            if s.get("type") == "Food":
                r = s.get("rates", {}) or {}
                consumed += sum(r.get("actualFlowRates") or r.get("desiredFlowRates") or [])
    return produced, consumed, (fp is not None)


def _maxctrl_actions(raw):
    snap = summarize_state(raw)
    live = {(c["module"], c["kind"], c["type"]) for c in snap["controllable"]}
    actions = []
    for (module, kind, ftype), ceiling in CONTROLLABLE.items():
        if kind != "producers":
            continue
        if (module, kind, ftype) not in live:
            continue
        actions.append({"module": module, "kind": kind, "type": ftype, "rates": [ceiling]})
    return actions


def run_config(biosim_url, xml, mode="passive", cap=200, difficulty="off",
               crew_size=15, timeout=30.0):
    """Run a built config against BioSim to death-or-cap.

    Returns {sols, in_band_sols, mars_grown_cal_pct, ended_reason}.
    mode: 'passive' (config desired rates) | 'maxctrl' (producers to max each sol).
    difficulty: 'off' | 'malfunctions' (SEVERE grey-water malf every 10th sol).
    """
    client = BiosimControl(biosim_url, timeout=timeout)
    sim_id = client.start_sim(xml)

    sols = 0
    in_band_sols = 0
    food_prod_sum = food_cons_sum = 0.0
    has_fp = False
    ended_reason = None

    raw = client.get_state(sim_id)
    if _in_band(_store_pct(raw)):
        in_band_sols += 1

    while sols < cap:
        if difficulty == "malfunctions" and sols > 0 and sols % 10 == 0:
            try:
                client.add_malfunction(sim_id, MALF_MODULE)
            except Exception:
                pass
        if mode == "maxctrl":
            raw = client.get_state(sim_id)
            for a in _maxctrl_actions(raw):
                try:
                    client.set_flows(sim_id, a["module"], a["kind"], a["type"], a["rates"])
                except Exception:
                    pass

        client.tick(sim_id, TICKS_PER_SOL)
        sols += 1

        raw = client.get_state(sim_id)
        snap = summarize_state(raw)
        if _in_band(_store_pct(raw)):
            in_band_sols += 1
        fprod, fcons, fp_present = _food_flows(raw)
        has_fp = has_fp or fp_present
        food_prod_sum += fprod
        food_cons_sum += fcons

        if snap["ended"]:
            ended_reason = "crew_death"
            break

    if ended_reason is None:
        ended_reason = "sol_cap"
    cal_pct = (round(100.0 * food_prod_sum / food_cons_sum, 1)
               if has_fp and food_cons_sum > 0 else None)

    return {
        "sols": sols,
        "in_band_sols": in_band_sols,
        "mars_grown_cal_pct": cal_pct,
        "ended_reason": ended_reason,
    }


def run_playground(biosim_url, overrides, mode="passive", difficulty="off",
                   cap=200, crew_size=15, config_name=None):
    """Top-level: build the override config + a baseline (no overrides), run both,
    and return {sols, in_band_sols, mars_grown_cal_pct, ended_reason, baseline,
    applied_overrides, ignored_overrides}.

    `config_name` selects a whitelisted base config (default = defensible).
    `baseline` is that same base config with NO overrides, run the same way -- the
    comparison point for the farmer's tweaks.
    """
    xml, applied, ignored = build_config(overrides, crew_size, config_name)
    result = run_config(biosim_url, xml, mode, cap, difficulty, crew_size)

    base_xml, _, _ = build_config({}, crew_size, config_name)
    baseline = run_config(biosim_url, base_xml, mode, cap, difficulty, crew_size)

    result["baseline"] = baseline
    result["applied_overrides"] = applied
    result["ignored_overrides"] = ignored
    return result
