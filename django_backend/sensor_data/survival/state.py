"""state.py — Summarize a BioSim simulation state into the snapshot the bot
brain + survival loop consume.

`summarize_state(raw)` returns:
    {
      "ended":  bool,                       # crew dead / sim stopped
      "stores": [{"name", "pct", "level", "capacity", "runway_sols"?}],
      "balances": [{"resource", "produced", "consumed", "net"}],
      "warnings": [{"sensor", "status"}],   # derived warning surfaces
      "controllable": [{"module", "kind", "type", "max", "desired"}],
    }

CONTROLLABLE is the server-side clamp map for the surfaces the bot may drive.
Each entry's `max` is the per-rate ceiling; `desired` is read live from the
module's current desiredFlowRates (falling back to actualFlowRates).

`balances` and per-store `runway_sols` are the telemetry that let the bot steer
proactively: a resource whose net flow is negative is draining, and a store's
runway is how many sols of life it has left at the current drain. The bot is far
better at keeping the crew alive when it can see the physics, not just the gauge.
"""

# One sol = 24 ticks; flow rates are per-tick, so runway in ticks / 24 = sols.
TICKS_PER_SOL = 24

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
    # Water Recovery System: reclaims dirty/grey water back into potable. The only
    # potable PRODUCER lever — closes the water loop so potable isn't a one-way drain.
    ("Water_RS", "producers", "PotableWater"): 100.0,
}

# Store fill % thresholds that escalate to a warning surface.
WARN_LOW = 15.0
WARN_HIGH = 95.0


def _is_ended(raw):
    """A BioSim run has ended when the crew dies or the sim stops.

    IMPORTANT: in the scottbell/biosim build this stack runs against, crew death
    is NOT surfaced as a top-level crewDead/crewAlive flag. When runTillCrewDeath
    is set and the crew dies (starvation / dehydration / asphyxiation), BioSim:
      * flips ``globals.simulationEnded`` to true, and
      * sets every crewPerson's ``currentActivity.name`` to "dead".
    Reading only the top-level keys (the original behavior) made every run look
    like it "survived" to the sol cap — masking real deaths. We now read both the
    globals end flag and the per-person dead state, so survival-sols are honest.
    """
    if raw.get("crewDead") or raw.get("crew_dead"):
        return True
    if raw.get("simError") or raw.get("error"):
        return True
    # Explicit alive/running flags (when present) win.
    for key in ("crewAlive", "alive", "isRunning"):
        if key in raw and raw[key] is False:
            return True
    # scottbell/biosim: globals.simulationEnded flips true on crew death (with
    # runTillCrewDeath). simulationStarted guards against the pre-run snapshot.
    g = raw.get("globals") or {}
    if g.get("simulationEnded") and g.get("ticksGoneBy", 0):
        return True
    # Fallback: all crew flagged "dead" in their currentActivity.
    crew = ((raw.get("modules") or {}).get("Crew_Quarters_Group") or {})
    people = (crew.get("properties") or {}).get("crewPeople") or []
    if people and all(
        ((p.get("currentActivity") or {}).get("name") == "dead") for p in people
    ):
        return True
    return False


def _desired(surface):
    """Read the current desired (fallback actual) flow rates off a surface."""
    rates = surface.get("rates", {}) or {}
    desired = rates.get("desiredFlowRates")
    if desired is None:
        desired = rates.get("actualFlowRates")
    return list(desired) if desired is not None else []


def _actual_sum(surface):
    """Sum the actual (fallback desired) throughput of a surface — real physics."""
    rates = surface.get("rates", {}) or {}
    actual = rates.get("actualFlowRates")
    if actual is None:
        actual = rates.get("desiredFlowRates")
    return sum(actual) if actual else 0.0


def _balances(modules):
    """Net per-resource flow (produced - consumed) across every module.

    Positive net = surplus (reservoir filling); negative = deficit (draining).
    This is the single most important thing the bot needs to see: whether each
    life-support resource is being made faster than the crew burns it.
    """
    produced, consumed = {}, {}
    for mod in modules.values():
        if not mod:
            continue
        for s in mod.get("producers", []) or []:
            t = s.get("type")
            if t:
                produced[t] = produced.get(t, 0.0) + _actual_sum(s)
        for s in mod.get("consumers", []) or []:
            t = s.get("type")
            if t:
                consumed[t] = consumed.get(t, 0.0) + _actual_sum(s)
    out = []
    for r in sorted(set(produced) | set(consumed)):
        p = round(produced.get(r, 0.0), 3)
        c = round(consumed.get(r, 0.0), 3)
        out.append({"resource": r, "produced": p, "consumed": c, "net": round(p - c, 3)})
    return out


def _norm(s):
    return "".join(ch for ch in s.lower() if ch.isalnum())


def _store_resource(store_name, resources):
    """Best-effort map a store name (e.g. 'General_Power_Store') to a flow
    resource (e.g. 'Power') so we can compute runway from its net balance."""
    n = _norm(store_name).replace("store", "").replace("general", "")
    for r in resources:
        rn = _norm(r)
        if rn and rn in n:
            return r
    return None


def _stores(modules, net_by_resource):
    """Every module exposing currentLevel/currentCapacity becomes a store, with
    absolute level/capacity and a runway estimate when it is draining."""
    resources = list(net_by_resource)
    stores = []
    for name, mod in modules.items():
        props = (mod or {}).get("properties", {}) or {}
        level = props.get("currentLevel")
        capacity = props.get("currentCapacity")
        if level is None or capacity is None or not capacity:
            continue
        entry = {
            "name": name,
            "pct": round((level / capacity) * 100.0, 2),
            "level": round(level, 3),
            "capacity": round(capacity, 3),
        }
        res = _store_resource(name, resources)
        if res is not None:
            net = net_by_resource.get(res, 0.0)
            if net < 0:
                entry["runway_sols"] = round((level / -net) / TICKS_PER_SOL, 2)
        stores.append(entry)
    return stores


def _warnings(stores):
    warnings = []
    for s in stores:
        if s["pct"] <= WARN_LOW or s["pct"] >= WARN_HIGH:
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
        desired = _desired(surface)
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
    balances = _balances(modules)
    net_by_resource = {b["resource"]: b["net"] for b in balances}
    stores = _stores(modules, net_by_resource)
    return {
        "ended": _is_ended(raw),
        "stores": stores,
        "balances": balances,
        "warnings": _warnings(stores),
        "controllable": _controllable(modules),
    }
