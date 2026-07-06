"""doctrine_controller.py -- deterministic ECLSS doctrine controller (ported).

This is the in-repo copy of the deterministic doctrine controller from
``_bench/controller.py`` so the always-on ``survival_autopilot`` feeder needs no
Anthropic API and no dependency on the out-of-tree bench harness. It encodes the
survival-pilot doctrine (reserve bands + accumulated lessons) as pure, explainable
rules:

    decide(snapshot) -> {"actions": [...], "trace": [str, ...], "mode": str}

Given one sol's ``summarize_state(raw)`` snapshot it:

  1. RESERVE-BAND GUARDRAILS -- drive each life-critical store's PRODUCER toward
     its ceiling when low (pct/runway), ease it off when banked. Priority:
     POWER -> O2 -> WATER.
  2. CONTINGENCY (grey-water defense) -- when grey-water recycling is failing and
     potable is threatened, cut non-essential potable SINKS (BiomassPS draw, OGS
     surplus-O2 electrolysis) to defend the crew potable reserve.
  3. FAILSAFE -- if telemetry is missing/degenerate, drive ALL producers to max.

Pure / no I/O: ``decide`` takes a snapshot dict and returns actions. The feeder
(``management/commands/survival_autopilot.py``) talks to BioSim.

VALIDATED (2026-06-17, live local BioSim @ localhost:8009, survival_hard.biosim,
cap 120, off): this controller reaches **77 sols** (ended_reason=crew_death) vs.
passive ~31 -- byte-for-byte the same survival as the bench's _bench/controller.py.
The decisive move is sol 1: General_Power_Store runway is ~0.1 sols (Nuclear is
de-rated to 700 < ~3000 demand), so the RESERVE-BAND guardrail drives Nuclear
Power -> 3000, which keeps the bus up so the air loop (VCCR/OGS) runs and cabin O2
holds. The earlier "feeder only reaches ~36" symptom was NOT a decide() defect --
the feeder was building from the lenient survival_defensible base; pointed at
survival_hard (the autopilot --config default now) the SAME decide() reaches 77.
"""
from __future__ import annotations

from .state import CONTROLLABLE

# --- Doctrine reserve bands ----------------------------------------------------
RESERVE_BANDS = {
    "General_Power_Store": {"floor": 20.0, "target": 40.0, "ease_off": 85.0},
    "O2_Store":            {"floor": 20.0, "target": 40.0, "ease_off": 80.0},
    "CO2_Store":           {"floor": None, "target": None, "ease_off": None},  # vent buffer
    "Potable_Water_Store": {"floor": 30.0, "target": 40.0, "ease_off": 90.0},
    "Food_Store":          {"floor": 15.0, "target": 30.0, "ease_off": 80.0},
}

RUNWAY_URGENT_SOLS = 30.0

GREY_WATER_STORE = "Grey_Water_Store"
GREY_LOW_PCT = 15.0
GREY_RUNWAY_URGENT = 20.0
BIOMASS_BANKED_PCT = 90.0

STORE_PRODUCER = {
    "General_Power_Store": ("Nuclear_Source", "producers", "Power"),
    "O2_Store":            ("OGS", "producers", "O2"),
    "Potable_Water_Store": ("Water_RS", "producers", "PotableWater"),
}

POTABLE_SINKS = [
    ("BiomassPS", "consumers", "PotableWater"),
    ("OGS", "producers", "O2"),
]


def _ceiling(module, kind, ftype):
    return CONTROLLABLE.get((module, kind, ftype))


def _live_set(snapshot):
    return {(c["module"], c["kind"], c["type"]) for c in snapshot.get("controllable", [])}


def _stores_by_name(snapshot):
    return {s["name"]: s for s in snapshot.get("stores", [])}


def _net_by_resource(snapshot):
    return {b["resource"]: b.get("net", 0.0) for b in snapshot.get("balances", [])}


def _set(actions, key, value, live):
    module, kind, ftype = key
    if key not in live:
        return
    ceiling = _ceiling(module, kind, ftype)
    if ceiling is None:
        return
    rate = max(0.0, min(float(value), float(ceiling)))
    actions[key] = {"module": module, "kind": kind, "type": ftype, "rates": [rate]}


def _failsafe(snapshot):
    live = _live_set(snapshot)
    actions = {}
    for (module, kind, ftype), ceiling in CONTROLLABLE.items():
        if kind != "producers":
            continue
        if (module, kind, ftype) not in live:
            continue
        actions[(module, kind, ftype)] = {
            "module": module, "kind": kind, "type": ftype, "rates": [ceiling]}
    trace = ["FAILSAFE: telemetry missing/degenerate -> driving all producers to max."]
    return {"actions": list(actions.values()), "trace": trace, "mode": "failsafe"}


def _clamp_pct(value, default):
    """Coerce a band percentage to a float in [0, 100]; default on non-numeric."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(v, 100.0))


def _clamp_runway(value, default):
    """Coerce the urgent-runway threshold to a float in [1, 200]; default else."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    return max(1.0, min(v, 200.0))


# Only these three life-critical stores have a tunable producer guardrail; CO2
# (vent buffer) and Food are intentionally NOT operator-tunable from here.
_TUNABLE_STORES = ("General_Power_Store", "O2_Store", "Potable_Water_Store")


def _effective_bands(bands=None):
    """Return ``(reserve_bands, runway_urgent)`` merged over the defaults + clamped.

    ``bands`` is an optional operator override (e.g. from the Playground) shaped
    like::

        {"General_Power_Store": {"floor":.., "target":.., "ease_off":..},
         "O2_Store": {...}, "Potable_Water_Store": {...},
         "runway_urgent_sols": ..}

    The module-level ``RESERVE_BANDS`` / ``RUNWAY_URGENT_SOLS`` defaults are
    DEEP-COPIED (never mutated), so the always-on feeder's bands-less
    ``decide(snap)`` call and any concurrent call are unaffected. Each pct is
    clamped to [0, 100]; per store the three thresholds are ordered so
    floor <= target <= ease_off is enforced loosely (a mis-ordered submission
    can't invert the guardrail); runway is clamped to [1, 200]. Unknown keys and
    non-numeric values fall back to the default, so a partial/garbage dict is safe.
    """
    merged = {name: dict(b) for name, b in RESERVE_BANDS.items()}
    runway = RUNWAY_URGENT_SOLS
    if isinstance(bands, dict):
        runway = _clamp_runway(bands.get("runway_urgent_sols"), runway)
        for name in _TUNABLE_STORES:
            override = bands.get(name)
            if not isinstance(override, dict):
                continue
            base = merged[name]
            floor = _clamp_pct(override.get("floor"), base["floor"])
            target = _clamp_pct(override.get("target"), base["target"])
            ease_off = _clamp_pct(override.get("ease_off"), base["ease_off"])
            # Order the three so floor <= target <= ease_off always holds, however
            # the operator submitted them -- the doctrine rules assume this ordering.
            floor, target, ease_off = sorted((floor, target, ease_off))
            base["floor"], base["target"], base["ease_off"] = floor, target, ease_off
    return merged, runway


def _telemetry_ok(snapshot):
    if snapshot.get("ended"):
        return True
    stores = _stores_by_name(snapshot)
    if not stores:
        return False
    for name, band in RESERVE_BANDS.items():
        if band["floor"] is None:
            continue
        if name not in stores:
            return False
    return True


def decide(snapshot, bands=None):
    """Deterministic doctrine decision for one sol.

    Returns {"actions": [{module,kind,type,rates}], "trace": [str], "mode": str}.
    `mode` is one of: nominal | contingency | failsafe.

    ``bands`` (optional) overrides the reserve bands for the three tunable
    life-critical stores + the urgent-runway threshold -- see ``_effective_bands``.
    It is backward-compatible: ``decide(snap)`` with no bands (the always-on
    feeder + every legacy caller) flies the exact stock doctrine.
    """
    if not _telemetry_ok(snapshot):
        return _failsafe(snapshot)

    reserve_bands, runway_urgent = _effective_bands(bands)
    live = _live_set(snapshot)
    stores = _stores_by_name(snapshot)
    net = _net_by_resource(snapshot)
    actions: dict = {}
    trace: list = []
    mode = "nominal"

    # ---- 1. RESERVE-BAND GUARDRAILS (POWER -> O2 -> WATER) -------------------
    for store_name in ("General_Power_Store", "O2_Store", "Potable_Water_Store"):
        band = reserve_bands[store_name]
        prod_key = STORE_PRODUCER.get(store_name)
        if prod_key is None or prod_key not in live:
            continue
        s = stores.get(store_name)
        if s is None:
            continue
        pct = s["pct"]
        runway = s.get("runway_sols")
        ceiling = _ceiling(*prod_key)
        resource = prod_key[2]
        res_net = net.get(resource if resource != "PotableWater" else "PotableWater",
                          net.get("Water", 0.0))

        low_pct = pct < band["floor"]
        low_runway = runway is not None and runway < runway_urgent
        high_pct = band["ease_off"] is not None and pct >= band["ease_off"]

        if low_pct or low_runway:
            _set(actions, prod_key, ceiling, live)
            why = []
            if low_pct:
                why.append(f"pct {pct:.1f}<{band['floor']:.0f} floor")
            if low_runway:
                why.append(f"runway {runway:.1f}<{runway_urgent:.0f} sols")
            trace.append(
                f"RAISE {prod_key[0]} {resource} -> max {ceiling:.0f} "
                f"({store_name} {'; '.join(why)}; net={res_net:+.2f}).")
        elif high_pct:
            ease_rate = round(ceiling * 0.25, 1)
            _set(actions, prod_key, ease_rate, live)
            trace.append(
                f"EASE  {prod_key[0]} {resource} -> {ease_rate:.0f} "
                f"({store_name} pct {pct:.1f}>={band['ease_off']:.0f} banked; "
                f"net={res_net:+.2f}).")
        else:
            trace.append(
                f"HOLD  {store_name} in band (pct {pct:.1f}, "
                f"floor {band['floor']:.0f}, net={res_net:+.2f}).")

    # ---- 2. CONTINGENCY: grey-water recycling defense ------------------------
    grey = stores.get(GREY_WATER_STORE)
    grey_pct = grey["pct"] if grey else None
    grey_runway = grey.get("runway_sols") if grey else None

    grey_failing = False
    grey_reasons = []
    if grey_pct is not None and grey_pct <= GREY_LOW_PCT:
        grey_failing = True
        grey_reasons.append(f"Grey_Water_Store {grey_pct:.1f}%<= {GREY_LOW_PCT:.0f}%")
    if grey_runway is not None and grey_runway <= GREY_RUNWAY_URGENT:
        grey_failing = True
        grey_reasons.append(f"grey runway {grey_runway:.1f}<= {GREY_RUNWAY_URGENT:.0f} sols")

    potable = stores.get("Potable_Water_Store")
    potable_pct = potable["pct"] if potable else None
    potable_net = net.get("PotableWater", net.get("Water", 0.0))
    potable_threatened = (
        potable_pct is not None
        and (potable_pct < reserve_bands["Potable_Water_Store"]["ease_off"]
             or potable_net < 0)
    )

    if grey_failing:
        if potable_threatened:
            mode = "contingency"
            trace.append(
                "CONTINGENCY grey-water recycling failing ("
                + "; ".join(grey_reasons)
                + f") AND potable threatened (pct={potable_pct:.1f}, "
                f"net={potable_net:+.2f}) -> defend potable: cut non-essential draws.")
            biomass = stores.get("Biomass_Store")
            bio_pct = biomass["pct"] if biomass else None
            for sink_key in POTABLE_SINKS:
                if sink_key not in live:
                    continue
                if sink_key == ("BiomassPS", "consumers", "PotableWater"):
                    _set(actions, sink_key, 0.0, live)
                    note = (f"Biomass_Store {bio_pct:.1f}% banked"
                            if bio_pct is not None and bio_pct >= BIOMASS_BANKED_PCT
                            else "non-essential under contingency")
                    trace.append(f"  CUT BiomassPS PotableWater draw -> 0 ({note}).")
                elif sink_key == ("OGS", "producers", "O2"):
                    o2 = stores.get("O2_Store")
                    o2_pct = o2["pct"] if o2 else 0.0
                    if o2_pct >= reserve_bands["O2_Store"]["target"]:
                        _set(actions, sink_key, 0.0, live)
                        trace.append(
                            f"  CUT OGS O2 electrolysis -> 0 (O2 banked {o2_pct:.1f}%"
                            f">= target; stops surplus potable draw).")
                    else:
                        trace.append(
                            f"  KEEP OGS O2 (O2 {o2_pct:.1f}% below target -> O2 "
                            "priority outranks potable defense).")
        else:
            trace.append(
                "MONITOR grey-water failing (" + "; ".join(grey_reasons)
                + f") but potable safe (pct={potable_pct}, net={potable_net:+.2f}) "
                "via ISRU+Water_RS -> no cut needed.")

    return {"actions": list(actions.values()), "trace": trace, "mode": mode}


__all__ = ["decide", "RESERVE_BANDS", "STORE_PRODUCER", "POTABLE_SINKS"]
