"""state.py — Summarize a BioSim simulation state into the snapshot the bot
brain + survival loop consume.

`summarize_state(raw)` returns:
    {
      "ended":  bool,                       # crew dead / sim stopped
      "stores": [{"name", "pct"}],          # store fill %
      "warnings": [{"sensor", "status"}],   # derived warning surfaces
      "controllable": [{"module", "kind", "type", "max", "desired"}],
    }

CONTROLLABLE is the server-side clamp map for the surfaces the bot may drive.
Each entry's `max` is the per-rate ceiling; `desired` is read live from the
module's current desiredFlowRates (falling back to actualFlowRates).
"""

# Controllable surfaces: (module, kind, flow_type) -> max ceiling.
CONTROLLABLE = {
    ("Nuclear_Source", "producers", "Power"): 3000.0,
    ("OGS", "consumers", "Power"): 1000.0,
    ("OGS", "producers", "O2"): 1000.0,
    ("VCCR", "consumers", "Power"): 1000.0,
    ("VCCR", "producers", "CO2"): 1000.0,
    ("BiomassPS", "consumers", "Power"): 400.0,
    ("BiomassPS", "consumers", "PotableWater"): 100.0,
    ("BiomassPS", "producers", "Biomass"): 100.0,
    ("Crew_Quarters_Group", "consumers", "Food"): 5.0,
    ("Crew_Quarters_Group", "consumers", "PotableWater"): 3.0,
}

# Store fill % thresholds that escalate to a warning surface.
WARN_LOW = 15.0
WARN_HIGH = 95.0


def _is_ended(raw):
    """A BioSim run has ended when the crew dies or the sim stops."""
    if raw.get("crewDead") or raw.get("crew_dead"):
        return True
    if raw.get("simError") or raw.get("error"):
        return True
    # Explicit alive/running flags (when present) win.
    for key in ("crewAlive", "alive", "isRunning"):
        if key in raw and raw[key] is False:
            return True
    return False


def _flow(surface):
    """Read the current desired (fallback actual) flow rates off a surface."""
    rates = surface.get("rates", {}) or {}
    desired = rates.get("desiredFlowRates")
    if desired is None:
        desired = rates.get("actualFlowRates")
    return list(desired) if desired is not None else []


def _stores(modules):
    """Every module exposing currentLevel/currentCapacity becomes a store %."""
    stores = []
    for name, mod in modules.items():
        props = (mod or {}).get("properties", {}) or {}
        level = props.get("currentLevel")
        capacity = props.get("currentCapacity")
        if level is None or capacity is None or not capacity:
            continue
        pct = (level / capacity) * 100.0
        stores.append({"name": name, "pct": round(pct, 2)})
    return stores


def _warnings(stores):
    warnings = []
    for s in stores:
        if s["pct"] <= WARN_LOW:
            warnings.append({"sensor": s["name"], "status": "warning"})
        elif s["pct"] >= WARN_HIGH:
            warnings.append({"sensor": s["name"], "status": "warning"})
    return warnings


def _controllable(modules):
    out = []
    for (module, kind, flow_type), ceiling in CONTROLLABLE.items():
        mod = modules.get(module)
        if not mod:
            continue
        surface = next(
            (s for s in mod.get(kind, []) if s.get("type") == flow_type), None)
        if surface is None:
            continue
        desired = _flow(surface)
        out.append({
            "module": module,
            "kind": kind,
            "type": flow_type,
            "max": [ceiling] * (len(desired) if desired else 1),
            "desired": desired,
        })
    return out


def summarize_state(raw):
    modules = raw.get("modules", {}) or {}
    stores = _stores(modules)
    return {
        "ended": _is_ended(raw),
        "stores": stores,
        "warnings": _warnings(stores),
        "controllable": _controllable(modules),
    }
