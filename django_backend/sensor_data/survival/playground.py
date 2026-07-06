"""playground.py -- build + run BioSim configs with farmer-supplied overrides.

Backs the ``POST /api/survival/playground/run`` endpoint and is reusable as a
library. Its base is the HARD config (``configs/survival_hard.biosim``) -- the
O2-constrained habitat where survival is the real score -- and it applies a set
of named overrides that tune the SURVIVAL PHYSICS (the air loop + power) plus the
older grow/food knobs, builds an N-crew config with the existing survival crew
builder, and runs it against the live BioSim to death-or-cap.

Two survival stories the physics levers are designed to tell:
  A. RAISE THE O2 CEILING (``o2_producer_max`` / ``o2_store`` / ``vccr_max``):
     bigger air loop -> the cabin-O2 death clock slows -> everyone survives longer.
  B. CONSTRAIN POWER (``nuclear_power_max`` / ``power_store``): cut the power
     budget so maxing every consumer blindly (maxctrl) overruns it and BioSim
     clamps the air loop -- a *prioritizing* controller (doctrine) that feeds
     power first then O2 beats blind max-all. Smart control visibly wins.

Run logic mirrors ``_bench/bench.py`` (passive / maxctrl / doctrine modes,
in-band sols, mars-grown calorie %), kept in-tree so the endpoint has no
out-of-tree dependency.

ONE BioSim instance is assumed -- runs are sequential, one sim each.
"""
from __future__ import annotations

import re
import time
from pathlib import Path

from . import config as cfgmod
from . import doctrine_controller
from .biosim_control import BiosimControl
from .state import CONTROLLABLE, TICKS_PER_SOL, summarize_state

# Playground base = HARD config. This is the O2-constrained habitat the new
# survival-physics levers (air loop + power) are tuned against; the older grow
# knobs still work on it. Callers may still select a whitelisted base via
# `config_name`, but None now means HARD (not defensible) for the playground.
HARD_CONFIG = Path(__file__).parent / "configs" / "survival_hard.biosim"
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
    "PEANUT", "SWEET_POTATO",  # BioSim's full valid set is these 9 (users_manual)
)
DEFAULT_CROP_TYPE = "SOYBEAN"

# Shelf-count bounds: at least one shelf, at most 50.
MIN_SHELVES = 1
MAX_SHELVES = 50

# ── NEW survival-physics overrides: (min, max) clamps, validated server-side. ──
# These move the air loop + power -- the levers that actually drive survival on the
# hard config (crop area / food are insensitive in BioSim). Every value is coerced
# to a number and clamped to its band before it ever touches the XML.
PHYSICS_CLAMPS = {
    "o2_producer_max":   (10.0, 5000.0),   # OGS O2Producer + H2Producer maxFlowRates
    "o2_store":          (200.0, 50000.0),  # O2_Store capacity (and level)
    "vccr_max":          (30.0, 5000.0),    # VCCR airProducer/airConsumer/CO2Producer max
    "nuclear_power_max": (200.0, 10000.0),  # Nuclear powerProducer maxFlowRates
    "power_store":       (1000.0, 500000.0),  # General_Power_Store capacity (and level)
}
CREW_CLAMP = (1, 30)

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


def _set_module_attr_all(xml, module_tag, surface_tags, attr, value):
    """Set ``attr="value"`` on EVERY listed surface inside ``<module_tag>...``.

    Used for the physics levers that must move several surfaces of one module
    together (e.g. OGS O2Producer + H2Producer, or all three VCCR air surfaces),
    so the whole sub-loop is re-rated consistently. Only the named surfaces inside
    the module block are touched; the rest of the XML is untouched.
    """
    block_pat = re.compile(r"(<" + module_tag + r"\b.*?</" + module_tag + r">)", re.DOTALL)
    m = block_pat.search(xml)
    if not m:
        return xml
    block = m.group(1)
    for surf in surface_tags:
        surf_pat = re.compile(
            r"(<" + surf + r"\b[^>]*?\b" + attr + r'=")[^"]*(")')
        block = surf_pat.sub(lambda s: s.group(1) + str(value) + s.group(2), block)
    return xml[:m.start(1)] + block + xml[m.end(1):]


def _set_store_capacity_and_level(xml, store_tag, value):
    """Set both capacity= and level= to ``value`` on a self-closing store element.

    A reserve buffer is only as useful as the level it starts at, so capacity and
    starting level move together (a 50k-capacity store that starts at 600 buys no
    runway). Used for o2_store / power_store.
    """
    xml = _set_store_attr(xml, store_tag, "capacity", value)
    xml = _set_store_attr(xml, store_tag, "level", value)
    return xml


def _set_biomass_shelves(xml, num_shelves, crop_area, crop_type):
    """Replace every <shelf .../> inside <BiomassPS>...</BiomassPS> with
    `num_shelves` identical shelves (same per-shelf cropArea + cropType).

    Mirrors the exact self-closing form BioSim accepts:
        <shelf cropArea="..." cropType="..."/>
    Only the shelves inside the BiomassPS block are touched.
    """
    return _set_biomass_shelf_specs(
        xml, [(crop_area, crop_type)] * num_shelves)


def _set_biomass_shelf_specs(xml, specs):
    """Replace every <shelf .../> inside <BiomassPS>...</BiomassPS> with one
    shelf per ``(crop_area, crop_type)`` entry in ``specs`` (mixed crops OK).

    Mirrors the exact self-closing form BioSim accepts:
        <shelf cropArea="..." cropType="..."/>
    Only the shelves inside the BiomassPS block are touched. A falsy/empty
    ``specs`` is a no-op (the base shelf run is left verbatim).
    """
    if not specs:
        return xml
    block_pat = re.compile(r"(<BiomassPS\b.*?</BiomassPS>)", re.DOTALL)
    m = block_pat.search(xml)
    if not m:
        return xml
    block = m.group(1)
    shelves = "\n\t\t\t\t".join(
        '<shelf cropArea="{}" cropType="{}"/>'.format(area, ctype)
        for area, ctype in specs)
    # Replace the first run of <shelf .../> entries with the rebuilt set.
    new_block, n = re.subn(r"(?:\s*<shelf\b[^>]*/>)+",
                           "\n\t\t\t\t" + shelves, block, count=1)
    if n == 0:
        return xml
    return xml[:m.start(1)] + new_block + xml[m.end(1):]


# Per-shelf cropArea clamp (a sane planted-area band; mirrors the UI's 0–400 m²).
CROP_AREA_CLAMP = (0.0, 400.0)


def _coerce_crop_type(value):
    """Validate a crop type against CROP_TYPES, falling back to the default."""
    if isinstance(value, str) and value in CROP_TYPES:
        return value
    return DEFAULT_CROP_TYPE


def _coerce_crop_area(value, default=1.0):
    """Coerce to float + clamp to CROP_AREA_CLAMP; default on non-numeric."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        v = float(default)
    lo, hi = CROP_AREA_CLAMP
    return max(lo, min(v, hi))


def _crops_to_shelf_specs(crops):
    """Turn a ``crops`` override (list of {crop_type, num_shelves, crop_area})
    into a flat list of (crop_area, crop_type) shelf specs.

    Validation/clamping mirrors the legacy single-crop path:
      • crop_type validated against CROP_TYPES (fallback DEFAULT_CROP_TYPE),
      • crop_area coerced + clamped to CROP_AREA_CLAMP,
      • each entry's num_shelves >= MIN_SHELVES,
      • the TOTAL shelf count across all entries clamped to MAX_SHELVES.
    Returns ``[]`` for an empty/invalid list so the caller leaves shelves as-is.
    """
    if not isinstance(crops, (list, tuple)):
        return []
    specs = []
    for entry in crops:
        if not isinstance(entry, dict):
            continue
        crop_type = _coerce_crop_type(entry.get("crop_type"))
        crop_area = _coerce_crop_area(entry.get("crop_area", 1))
        try:
            n = int(entry.get("num_shelves", 1))
        except (TypeError, ValueError):
            n = 1
        n = max(MIN_SHELVES, n)
        specs.extend([(crop_area, crop_type)] * n)
    # Clamp the TOTAL shelf count across every row to the hard cap.
    return specs[:MAX_SHELVES]


# ── Data-driven override tables — the comprehensive BioSim config surface. ──
# Each maps a public override name to the exact XML it rewrites. Numeric values are
# clamped (CLAMPS) before dispatch; bools coerced true/false. Existing named levers
# (o2_producer_max, vccr_max, nuclear_power(_max), o2_store, power_store,
# biomass_power, biomass_water, dirty_water_level, food_store, crop_*) keep their
# bespoke handlers below for back-compat; everything new is table-driven.

# name -> (module_tag, (surface_tags...), attr): set attr on those surface(s).
SURFACE_OVERRIDES = {
    # Air loop — OGS (O2 generator)
    "o2_producer_desired": ("OGS", ("O2Producer", "H2Producer"), "desiredFlowRates"),
    "ogs_power_max":       ("OGS", ("powerConsumer",), "maxFlowRates"),
    "ogs_power_desired":   ("OGS", ("powerConsumer",), "desiredFlowRates"),
    # Air loop — VCCR (cabin air recycler)
    "vccr_desired":       ("VCCR", ("airProducer", "airConsumer", "CO2Producer"), "desiredFlowRates"),
    "vccr_power_max":     ("VCCR", ("powerConsumer",), "maxFlowRates"),
    "vccr_power_desired": ("VCCR", ("powerConsumer",), "desiredFlowRates"),
    # Water loop — Water_RS
    "waterrs_potable_max":     ("WaterRS", ("potableWaterProducer",), "maxFlowRates"),
    "waterrs_potable_desired": ("WaterRS", ("potableWaterProducer",), "desiredFlowRates"),
    "waterrs_power_max":       ("WaterRS", ("powerConsumer",), "maxFlowRates"),
    "waterrs_power_desired":   ("WaterRS", ("powerConsumer",), "desiredFlowRates"),
    # Greenhouse — BiomassPS
    "biomass_power_max":    ("BiomassPS", ("powerConsumer",), "maxFlowRates"),
    "biomass_water_max":    ("BiomassPS", ("potableWaterConsumer",), "maxFlowRates"),
    "biomass_prod_desired": ("BiomassPS", ("biomassProducer",), "desiredFlowRates"),
    "biomass_prod_max":     ("BiomassPS", ("biomassProducer",), "maxFlowRates"),
    # Food processor
    "foodproc_food_desired":    ("FoodProcessor", ("foodProducer",), "desiredFlowRates"),
    "foodproc_food_max":        ("FoodProcessor", ("foodProducer",), "maxFlowRates"),
    "foodproc_power_desired":   ("FoodProcessor", ("powerConsumer",), "desiredFlowRates"),
    "foodproc_power_max":       ("FoodProcessor", ("powerConsumer",), "maxFlowRates"),
    "foodproc_biomass_desired": ("FoodProcessor", ("biomassConsumer",), "desiredFlowRates"),
    "foodproc_biomass_max":     ("FoodProcessor", ("biomassConsumer",), "maxFlowRates"),
    # Crew demand (CrewGroup)
    "crew_food_desired":  ("CrewGroup", ("foodConsumer",), "desiredFlowRates"),
    "crew_food_max":      ("CrewGroup", ("foodConsumer",), "maxFlowRates"),
    "crew_water_desired": ("CrewGroup", ("potableWaterConsumer",), "desiredFlowRates"),
    "crew_water_max":     ("CrewGroup", ("potableWaterConsumer",), "maxFlowRates"),
}

# name -> store_tag: set BOTH capacity + level (a reserve that starts full).
STORE_CAPLEVEL_OVERRIDES = {
    "potable_store":     "PotableWaterStore",
    "grey_water_store":  "GreyWaterStore",
    "dirty_water_store": "DirtyWaterStore",
    "biomass_store":     "BiomassStore",
}
# name -> store_tag: set capacity only (buffers that start empty, e.g. CO2/H2).
STORE_CAP_OVERRIDES = {
    "co2_store": "CO2Store",
    "h2_store":  "H2Store",
}
# name -> (element_tag, attr): set one attribute on a self-closing element.
SCALAR_ATTR_OVERRIDES = {
    "cabin_volume": ("SimEnvironment", "initialVolume"),  # cabin air volume (L)
}
# name -> (module_tag, attr): boolean toggle on a module element.
BOOL_OVERRIDES = {
    "auto_harvest": ("BiomassPS", "autoHarvestAndReplant"),
}

# Numeric clamps for the NEW table-driven overrides (existing ones = PHYSICS_CLAMPS).
NUMERIC_CLAMPS = {
    "o2_producer_desired": (0.0, 5000.0),
    "ogs_power_max": (0.0, 5000.0), "ogs_power_desired": (0.0, 5000.0),
    "vccr_desired": (0.0, 5000.0),
    "vccr_power_max": (0.0, 5000.0), "vccr_power_desired": (0.0, 5000.0),
    "waterrs_potable_max": (0.0, 2000.0), "waterrs_potable_desired": (0.0, 2000.0),
    "waterrs_power_max": (0.0, 5000.0), "waterrs_power_desired": (0.0, 5000.0),
    "biomass_power_max": (0.0, 2000.0), "biomass_water_max": (0.0, 1000.0),
    "biomass_prod_desired": (0.0, 1000.0), "biomass_prod_max": (0.0, 1000.0),
    "foodproc_food_desired": (0.0, 2000.0), "foodproc_food_max": (0.0, 2000.0),
    "foodproc_power_desired": (0.0, 2000.0), "foodproc_power_max": (0.0, 2000.0),
    "foodproc_biomass_desired": (0.0, 2000.0), "foodproc_biomass_max": (0.0, 2000.0),
    "crew_food_desired": (0.0, 50.0), "crew_food_max": (0.0, 50.0),
    "crew_water_desired": (0.0, 50.0), "crew_water_max": (0.0, 50.0),
    "potable_store": (200.0, 100000.0), "grey_water_store": (0.0, 100000.0),
    "dirty_water_store": (0.0, 50000.0), "biomass_store": (0.0, 100000.0),
    "co2_store": (0.0, 50000.0), "h2_store": (0.0, 50000.0),
    "cabin_volume": (10000.0, 10000000.0),
}
# All numeric clamps: existing physics levers + the new comprehensive surface.
CLAMPS = {**PHYSICS_CLAMPS, **NUMERIC_CLAMPS}

# Periodic-malfunction targets exposed to the resilience sim (difficulty=malfunctions).
# Maps a friendly value to the BioSim module/store the fault is injected on.
MALF_MODULES = (
    "Grey_Water_Store", "Dirty_Water_Store", "Potable_Water_Store",
    "O2_Store", "General_Power_Store", "Nuclear_Source", "VCCR", "OGS", "Water_RS",
)
# BioSim malfunction enums (users_manual). Intensity = how degraded; length =
# self-clears (TEMPORARY) vs persists (PERMANENT).
MALF_INTENSITIES = ("SEVERE_MALF", "MEDIUM_MALF", "LOW_MALF")
MALF_LENGTHS = ("TEMPORARY_MALF", "PERMANENT_MALF")


def _normalize_malfunctions(malfunctions, malf_module=MALF_MODULE, malf_interval=10):
    """Validate a list of malfunction specs into
    ``[{module, interval, intensity, length}]``.

    BioSim supports MULTIPLE concurrent malfunctions (one per module, each with its
    own intensity/length), injected at runtime — so the resilience sim accepts a
    list and fires each on its own cadence. Falls back to a single SEVERE/TEMPORARY
    fault on ``malf_module`` every ``malf_interval`` sols (the legacy behavior) when
    the list is empty/invalid.
    """
    out = []
    for mf in (malfunctions or []):
        if not isinstance(mf, dict):
            continue
        mod = mf.get("module")
        if mod not in MALF_MODULES:
            continue
        try:
            iv = max(1, min(int(mf.get("interval", 10)), 500))
        except (TypeError, ValueError):
            iv = 10
        inten = mf.get("intensity") if mf.get("intensity") in MALF_INTENSITIES else "SEVERE_MALF"
        length = mf.get("length") if mf.get("length") in MALF_LENGTHS else "TEMPORARY_MALF"
        out.append({"module": mod, "interval": iv, "intensity": inten, "length": length})
    if not out:
        mod = malf_module if malf_module in MALF_MODULES else MALF_MODULE
        try:
            iv = max(1, int(malf_interval or 10))
        except (TypeError, ValueError):
            iv = 10
        out = [{"module": mod, "interval": iv,
                "intensity": "SEVERE_MALF", "length": "TEMPORARY_MALF"}]
    return out


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
    # ── survival-physics levers (already clamped before dispatch) ──
    if name == "o2_producer_max":
        # OGS O2 + H2 generation ceiling -> raises the cabin-O2 supply (story A).
        return _set_module_attr_all(
            xml, "OGS", ("O2Producer", "H2Producer"), "maxFlowRates", value)
    if name == "o2_store":
        return _set_store_capacity_and_level(xml, "O2Store", value)
    if name == "vccr_max":
        # VCCR is the cabin air recycler (returns O2, scrubs CO2) -- the primary
        # death-clock lever. Re-rate all three air surfaces together.
        return _set_module_attr_all(
            xml, "VCCR", ("airProducer", "airConsumer", "CO2Producer"),
            "maxFlowRates", value)
    if name == "nuclear_power_max":
        # Nuclear power ceiling -> the power budget (story B). Lower it and maxing
        # every consumer overruns the bus, so a prioritizing pilot wins.
        return _set_module_attr_all(
            xml, "PowerPS", ("powerProducer",), "maxFlowRates", value)
    if name == "power_store":
        return _set_store_capacity_and_level(xml, "PowerStore", value)
    # ── data-driven tables (the comprehensive new surface) ──
    spec = SURFACE_OVERRIDES.get(name)
    if spec:
        module, surfaces, attr = spec
        return _set_module_attr_all(xml, module, surfaces, attr, value)
    store = STORE_CAPLEVEL_OVERRIDES.get(name)
    if store:
        return _set_store_capacity_and_level(xml, store, value)
    store = STORE_CAP_OVERRIDES.get(name)
    if store:
        return _set_store_attr(xml, store, "capacity", value)
    scalar = SCALAR_ATTR_OVERRIDES.get(name)
    if scalar:
        tag, attr = scalar
        return _set_store_attr(xml, tag, attr, value)
    boolspec = BOOL_OVERRIDES.get(name)
    if boolspec:
        tag, attr = boolspec
        bval = "true" if value in (True, "true", "True", 1, "1", 1.0) else "false"
        return _set_store_attr(xml, tag, attr, bval)
    return xml  # unknown override: ignored (caller may report it)


# crop_area / crop_type / num_shelves are handled together (they all rebuild the
# BiomassPS shelves), so they live here but are applied in build_config, not via
# the per-override _apply_override dispatch.
SHELF_OVERRIDES = ("crop_area", "crop_type", "num_shelves")

# Built from the bespoke legacy names + every table-driven override, so adding a
# table entry automatically makes it accepted (no separate list to keep in sync).
_LEGACY_OVERRIDES = (
    "dirty_water_level", "nuclear_power", "biomass_power", "biomass_water",
    "crop_area", "crop_type", "num_shelves", "food_store", "crops",
    "o2_producer_max", "o2_store", "vccr_max", "nuclear_power_max", "power_store",
)
SUPPORTED_OVERRIDES = tuple(sorted(set(_LEGACY_OVERRIDES)
    | set(SURFACE_OVERRIDES) | set(STORE_CAPLEVEL_OVERRIDES)
    | set(STORE_CAP_OVERRIDES) | set(SCALAR_ATTR_OVERRIDES) | set(BOOL_OVERRIDES)))


def _clamp_physics(name, value):
    """Coerce a numeric override to a float and clamp it to its band.

    Returns None for a non-numeric value so the caller can drop it. Server-side
    validation: the client can never push a surface past its safe band.
    """
    lo, hi = CLAMPS[name]
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return max(lo, min(v, hi))


def build_config(overrides, crew_size=15, config_name=None):
    """Build a crewed config with overrides applied.

    `config_name` selects a whitelisted base config (validated via
    config.resolve_config_path); None now means the HARD base (the playground's
    survival-physics sandbox -- the O2-constrained habitat the levers are tuned
    against). Returns (xml, applied, ignored) where applied/ignored are
    override-name lists. crew_size is clamped to CREW_CLAMP."""
    base = (cfgmod.resolve_config_path(config_name)
            if config_name is not None else HARD_CONFIG)
    xml = base.read_text()
    xml = re.sub(r'runTillCrewDeath="[^"]*"', 'runTillCrewDeath="true"', xml)
    overrides = overrides or {}
    applied, ignored = [], []
    for name, value in overrides.items():
        if name not in SUPPORTED_OVERRIDES:
            ignored.append(name)
            continue
        if name in SHELF_OVERRIDES or name == "crops":
            continue  # applied together below (shelf rebuild)
        if name in CLAMPS:
            clamped = _clamp_physics(name, value)
            if clamped is None:  # non-numeric -> drop, report as ignored
                ignored.append(name)
                continue
            xml = _apply_override(xml, name, clamped)
            applied.append(name)
            continue
        xml = _apply_override(xml, name, value)
        applied.append(name)

    # Shelf rebuild. Two paths, both rebuild the BiomassPS shelf run as one unit:
    #   • `crops` (NEW, preferred): a list of {crop_type, num_shelves, crop_area}
    #     rows -> one shelf per requested copy, mixed crops allowed. Takes priority
    #     when present.
    #   • legacy crop_area / crop_type / num_shelves: one crop across N identical
    #     shelves (back-compat; used only when `crops` is absent).
    # Only rebuild if shelves were actually requested, so configs that don't touch
    # them keep the base shelf run verbatim.
    if "crops" in overrides:
        specs = _crops_to_shelf_specs(overrides.get("crops"))
        if specs:
            xml = _set_biomass_shelf_specs(xml, specs)
            applied.append("crops")
        else:
            ignored.append("crops")
    elif any(k in overrides for k in SHELF_OVERRIDES):
        crop_area = _coerce_crop_area(overrides.get("crop_area", 1))
        crop_type = _coerce_crop_type(overrides.get("crop_type", DEFAULT_CROP_TYPE))
        try:
            num_shelves = int(overrides.get("num_shelves", 1))
        except (TypeError, ValueError):
            num_shelves = 1
        num_shelves = max(MIN_SHELVES, min(num_shelves, MAX_SHELVES))
        xml = _set_biomass_shelves(xml, num_shelves, crop_area, crop_type)
        for k in SHELF_OVERRIDES:
            if k in overrides:
                applied.append(k)
    # Crew builder (same marker dance as config.build_survival_config). Crew size
    # is clamped server-side: a hostile/typo value can never spawn 10k crew.
    try:
        crew_size = int(crew_size)
    except (TypeError, ValueError):
        crew_size = 15
    crew_size = max(CREW_CLAMP[0], min(crew_size, CREW_CLAMP[1]))
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", cfgmod._CREW_MARKER, xml,
                 count=1, flags=re.DOTALL)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", "", xml, flags=re.DOTALL)
    xml = xml.replace(cfgmod._CREW_MARKER, cfgmod._crew(crew_size))
    return xml, applied, ignored


def _store_cap(xml, tag):
    """Read capacity="..." off a self-closing store element <tag .../>."""
    m = re.search(r"<" + tag + r"\b[^>]*\bcapacity=\"([^\"]+)\"", xml)
    return round(float(m.group(1)), 1) if m else None


def _module_surface_max(xml, module_tag, surface_tag):
    """Read the first maxFlowRates value off <surface_tag> inside <module_tag>."""
    block = re.search(r"<" + module_tag + r"\b.*?</" + module_tag + r">", xml, re.DOTALL)
    if not block:
        return None
    m = re.search(r"<" + surface_tag + r"\b[^>]*\bmaxFlowRates=\"([^\"]+)\"", block.group(0))
    if not m:
        return None
    try:
        return round(float(m.group(1).split()[0]), 1)
    except (TypeError, ValueError):
        return None


def _habitat_specs(xml):
    """Deterministic 'habitat as built' spec read straight from the config XML —
    grow area (space), crop, crew, store capacities, and the producer ceilings the
    sliders move. This is the design side of a run (vs. the measured final-state
    telemetry), so a farmer can see WHAT they built, not just how long it survived.
    """
    shelves = re.findall(r"<shelf\b[^>]*/>", xml)
    areas, types = [], []
    for s in shelves:
        a = re.search(r'cropArea="([^"]+)"', s)
        t = re.search(r'cropType="([^"]+)"', s)
        if a:
            try:
                areas.append(float(a.group(1)))
            except ValueError:
                pass
        if t:
            types.append(t.group(1))
    # Per-crop summary so the UI can show a mixed-crop greenhouse honestly. Each
    # entry = {crop_type, num_shelves, area_m2}; ordered by first appearance.
    crop_summary = []
    crop_index = {}
    for i, s in enumerate(shelves):
        ctype = types[i] if i < len(types) else (types[0] if types else None)
        area = areas[i] if i < len(areas) else 0.0
        if ctype not in crop_index:
            crop_index[ctype] = len(crop_summary)
            crop_summary.append({"crop_type": ctype, "num_shelves": 0, "area_m2": 0.0})
        row = crop_summary[crop_index[ctype]]
        row["num_shelves"] += 1
        row["area_m2"] = round(row["area_m2"] + area, 2)
    return {
        "grow_area_m2": round(sum(areas), 2),
        "crop_area_per_shelf_m2": round(areas[0], 2) if areas else 0.0,
        "num_shelves": len(shelves),
        "crop_type": types[0] if types else None,
        "crops": crop_summary,
        "crew_size": len(re.findall(r"<crewPerson\b", xml)),
        "o2_store_capacity": _store_cap(xml, "O2Store"),
        "power_store_capacity": _store_cap(xml, "PowerStore"),
        "food_store_capacity": _store_cap(xml, "FoodStore"),
        "o2_producer_max": _module_surface_max(xml, "OGS", "O2Producer"),
        "vccr_max": _module_surface_max(xml, "VCCR", "airProducer"),
        "nuclear_power_max": _module_surface_max(xml, "PowerPS", "powerProducer"),
    }


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


# ── Doctrine reserve-band tuning ──────────────────────────────────────────────
# The deterministic Doctrine pilot is a DESIGNED, tunable flight controller: its
# reserve bands (per-store floor/target/ease_off + urgent-runway threshold) are
# operator-configurable from the Playground so a user can test how the engineered
# controller responds. The band dict flows run_playground -> run_config ->
# _doctrine_actions -> doctrine_controller.decide, which re-validates/clamps it
# authoritatively. The stock defaults live in doctrine_controller.RESERVE_BANDS.
DOCTRINE_TUNABLE_STORES = ("General_Power_Store", "O2_Store", "Potable_Water_Store")
_DOCTRINE_BAND_KEYS = ("floor", "target", "ease_off")


def _normalize_doctrine_bands(doctrine_bands):
    """Normalize a raw ``doctrine_bands`` request into the shape ``decide`` wants,
    or ``None`` when nothing usable was supplied.

    Keeps only the three tunable stores' floor/target/ease_off (coerced to float)
    and an optional ``runway_urgent_sols``; drops everything else. This is a light
    shape/type filter -- ``doctrine_controller._effective_bands`` still clamps every
    value to its safe range and enforces floor<=target<=ease_off, so a hostile or
    partial dict can never break the guardrail. Returns ``None`` for an
    empty/invalid input so callers pass no override (stock doctrine).
    """
    if not isinstance(doctrine_bands, dict):
        return None
    out = {}
    for store in DOCTRINE_TUNABLE_STORES:
        band = doctrine_bands.get(store)
        if not isinstance(band, dict):
            continue
        cleaned = {}
        for key in _DOCTRINE_BAND_KEYS:
            if key not in band:
                continue
            try:
                cleaned[key] = float(band[key])
            except (TypeError, ValueError):
                continue
        if cleaned:
            out[store] = cleaned
    runway = doctrine_bands.get("runway_urgent_sols")
    if runway is not None:
        try:
            out["runway_urgent_sols"] = float(runway)
        except (TypeError, ValueError):
            pass
    return out or None


def _doctrine_actions(raw, doctrine_bands=None):
    """Doctrine controller's actions for one sol (deterministic, no LLM).

    Delegates to ``doctrine_controller.decide`` -- the same reserve-band /
    contingency / failsafe logic the always-on feeder flies. This is the
    PRIORITIZING pilot: it feeds power first, then O2, then water, so when the
    power budget is constrained (story B) it beats blind max-all.

    ``doctrine_bands`` (optional) overrides the reserve bands so the operator can
    test the tuned controller; ``None`` flies the stock doctrine (feeder parity).
    """
    snap = summarize_state(raw)
    decision = doctrine_controller.decide(snap, doctrine_bands)
    return decision.get("actions", [])


def run_config(biosim_url, xml, mode="passive", cap=200, difficulty="off",
               crew_size=15, timeout=30.0, malfunctions=None, doctrine_bands=None):
    """Run a built config against BioSim to death-or-cap.

    Returns {sols, in_band_sols, mars_grown_cal_pct, ended_reason}.
    mode:
      'passive'  -- coast on the config's desired rates (no control).
      'maxctrl'  -- drive every producer to its ceiling each sol (blind max-all).
      'doctrine' -- the deterministic prioritizing controller (decide()).
    difficulty: 'off' | 'malfunctions'. When on, `malfunctions` is a normalized
    list of {module, interval, intensity, length}; each fault is injected on its own
    cadence (BioSim supports many concurrent malfunctions) -- the resilience test.
    `doctrine_bands` (only used when mode=='doctrine') overrides the tunable reserve
    bands so the engineered controller can be tested; None = stock doctrine.
    """
    client = BiosimControl(biosim_url, timeout=timeout)
    sim_id = client.start_sim(xml)

    sols = 0
    in_band_sols = 0
    food_prod_sum = food_cons_sum = 0.0
    has_fp = False
    ended_reason = None
    malfs = malfunctions if malfunctions is not None else _normalize_malfunctions(None)

    raw = client.get_state(sim_id)
    if _in_band(_store_pct(raw)):
        in_band_sols += 1

    while sols < cap:
        if difficulty == "malfunctions" and sols > 0:
            for mf in malfs:
                if sols % mf["interval"] == 0:
                    try:
                        client.add_malfunction(
                            sim_id, mf["module"], mf["intensity"], mf["length"])
                    except Exception:
                        pass
        if mode in ("maxctrl", "doctrine"):
            raw = client.get_state(sim_id)
            actions = (_doctrine_actions(raw, doctrine_bands) if mode == "doctrine"
                       else _maxctrl_actions(raw))
            for a in actions:
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

    final = summarize_state(raw)
    return {
        "sols": sols,
        "in_band_sols": in_band_sols,
        "mars_grown_cal_pct": cal_pct,
        "ended_reason": ended_reason,
        "final_stores": final["stores"],       # per-reservoir level/capacity/runway at end
        "final_balances": final["balances"],   # per-resource produced/consumed/net at end
    }


# The three deterministic controllers compared on every playground run. All are
# free (no LLM): passive coasts, maxctrl blind-maxes producers, doctrine
# prioritizes (power -> O2 -> water). The 3-way split is the whole point -- it
# shows WHEN smart control wins (story B: constrained power -> doctrine > maxctrl)
# vs. when the config ceiling dominates (story A: raise O2 -> all three rise).
CONTROLLERS = ("passive", "maxctrl", "doctrine")

# Hard ceiling on the OPTIONAL metered LLM controller. The LLM flies one Claude
# call per sol (slow + costs money), and the playground request is synchronous. The
# caller may request any Claude run length up to this ceiling (the full 500-sol
# mission); it defaults to LLM_DEFAULT_SOLS. 500 sols ≈ 20 min + ~$12, but stays
# within the relay's raised request timeout (3600s). The three free controllers
# always honor the caller's full `cap`.
LLM_MAX_SOLS = 500
LLM_DEFAULT_SOLS = 80


def run_config_llm(biosim_url, xml, brain, cap=LLM_MAX_SOLS, difficulty="off",
                   crew_size=15, token_budget=None, timeout=30.0,
                   malfunctions=None):
    """Run a built config flown by the LLM bot brain (metered) to death-or-cap.

    Mirrors ``run_config`` exactly (same in-band / food / death-sol accounting so
    the LLM column is apples-to-apples with passive/maxctrl/doctrine) but swaps the
    per-sol action source for ``brain.decide`` -- one Claude call per sol, steering
    on store trends + runway like the live ``/stream`` pilot. Returns the standard
    run dict plus ``tokens_total`` + ``est_cost_usd_total``. Stops on crew death,
    sol cap, or token budget.
    """
    from .loop import _attach_trend  # reuse the live pilot's trend window

    client = BiosimControl(biosim_url, timeout=timeout)
    sim_id = client.start_sim(xml)

    sols = 0
    in_band_sols = 0
    food_prod_sum = food_cons_sum = 0.0
    has_fp = False
    ended_reason = None
    trend_history = {}
    malfs = malfunctions if malfunctions is not None else _normalize_malfunctions(None)

    raw = client.get_state(sim_id)
    if _in_band(_store_pct(raw)):
        in_band_sols += 1

    while sols < cap:
        if difficulty == "malfunctions" and sols > 0:
            for mf in malfs:
                if sols % mf["interval"] == 0:
                    try:
                        client.add_malfunction(
                            sim_id, mf["module"], mf["intensity"], mf["length"])
                    except Exception:
                        pass

        raw = client.get_state(sim_id)
        snap = summarize_state(raw)
        if snap["ended"]:
            ended_reason = "crew_death"
            break
        _attach_trend(snap["stores"], trend_history)
        try:
            decision = brain.decide(snap)
        except Exception:
            # An LLM/API hiccup mid-run shouldn't crash the whole playground call;
            # coast this sol (no actions) and keep flying.
            decision = {"actions": []}
        for a in decision.get("actions", []):
            try:
                client.set_flows(sim_id, a["module"], a["kind"], a["type"], a["desired_rates"])
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
        if token_budget is not None and getattr(brain, "tokens_used", 0) >= token_budget:
            ended_reason = "token_budget"
            break

    if ended_reason is None:
        ended_reason = "sol_cap"
    cal_pct = (round(100.0 * food_prod_sum / food_cons_sum, 1)
               if has_fp and food_cons_sum > 0 else None)

    final = summarize_state(raw)
    return {
        "sols": sols,
        "in_band_sols": in_band_sols,
        "mars_grown_cal_pct": cal_pct,
        "ended_reason": ended_reason,
        "final_stores": final["stores"],
        "final_balances": final["balances"],
        "tokens_total": getattr(brain, "tokens_used", 0),
        "est_cost_usd_total": getattr(brain, "est_cost_usd_total", 0.0),
    }


def run_playground(biosim_url, overrides, difficulty="off",
                   cap=120, crew_size=15, config_name=None,
                   brain=None, token_budget=None, llm_sols=None,
                   malfunctions=None, malf_module=MALF_MODULE, malf_interval=10,
                   doctrine_bands=None,
                   **_legacy):
    """Top-level: build the farmer's override config and run THREE controllers on
    it (passive / maxctrl / doctrine), plus a `baseline` = the unmodified HARD
    config flown by doctrine. Returns:

        {
          "controllers": {
            "passive":  {sols, in_band_sols, mars_grown_cal_pct, ended_reason},
            "maxctrl":  {...},
            "doctrine": {...},
          },
          "baseline": {...same shape...},      # unmodified hard config, doctrine
          "applied_overrides": [...],
          "ignored_overrides": [...],
          "crew_size": int,                    # the (clamped) crew actually flown
          "cap": int,
        }

    `config_name` selects a whitelisted base config (default = the HARD base). All
    runs are sequential (one BioSim sim at a time). A legacy ``mode=`` kwarg is
    accepted and ignored -- the response always carries all three controllers.

    `doctrine_bands` (optional) tunes the DOCTRINE controller's reserve bands so
    the operator can test the engineered controller. It is applied to the DOCTRINE
    run only -- passive/maxctrl ignore it, and the `baseline` deliberately stays on
    the STOCK bands so it remains a stable reference the tuned run is compared to.
    """
    xml, applied, ignored = build_config(overrides, crew_size, config_name)
    # Normalize the operator's doctrine-band override once (shape/type filter; the
    # controller re-clamps authoritatively). None -> stock doctrine everywhere.
    doctrine_bands = _normalize_doctrine_bands(doctrine_bands)
    # Re-derive the clamped crew so the response reports what was actually flown.
    try:
        flown_crew = max(CREW_CLAMP[0], min(int(crew_size), CREW_CLAMP[1]))
    except (TypeError, ValueError):
        flown_crew = 15

    # Normalize the resilience-malfunction schedule once (BioSim supports many
    # concurrent faults). Accepts a `malfunctions` list, else the legacy single
    # malf_module/malf_interval; every controller flies the SAME schedule.
    malfs = _normalize_malfunctions(malfunctions, malf_module, malf_interval)

    controllers = {}
    for ctrl in CONTROLLERS:
        # Only the DOCTRINE run flies the operator's tuned bands; passive/maxctrl
        # have no reserve bands, so they get None (run_config ignores it anyway).
        controllers[ctrl] = run_config(
            biosim_url, xml, ctrl, cap, difficulty, flown_crew,
            malfunctions=malfs,
            doctrine_bands=doctrine_bands if ctrl == "doctrine" else None)

    # Optional 4th controller: the metered LLM pilot (one Claude call/sol). Only
    # runs when the caller passes a `brain`. The caller may request a Claude run
    # length via `llm_sols` (default LLM_DEFAULT_SOLS, up to the full mission
    # LLM_MAX_SOLS=500 and never beyond the run `cap`). llm_cap is echoed so the UI
    # can note how many sols Claude actually flew vs the free controllers.
    llm_cap = None
    if brain is not None:
        try:
            requested = int(llm_sols) if llm_sols else LLM_DEFAULT_SOLS
        except (TypeError, ValueError):
            requested = LLM_DEFAULT_SOLS
        llm_cap = max(1, min(cap, requested, LLM_MAX_SOLS))
        controllers["llm"] = run_config_llm(
            biosim_url, xml, brain, llm_cap, difficulty, flown_crew,
            token_budget if token_budget is not None else llm_cap * 6000,
            malfunctions=malfs)

    # Baseline: the unmodified hard config (no overrides), flown by doctrine -- the
    # "what the autonomous pilot does on the stock habitat" reference point.
    base_xml, _, _ = build_config({}, flown_crew, config_name)
    baseline = run_config(biosim_url, base_xml, "doctrine", cap, difficulty, flown_crew,
                          malfunctions=malfs)

    return {
        "controllers": controllers,
        "baseline": baseline,
        "habitat": _habitat_specs(xml),   # 'as built' specs of the user's config
        "applied_overrides": applied,
        "ignored_overrides": ignored,
        "crew_size": flown_crew,
        "cap": cap,
        "llm_cap": llm_cap,
    }
