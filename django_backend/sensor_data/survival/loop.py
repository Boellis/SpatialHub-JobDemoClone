"""loop.py — Per-sol survival generator.

Drives a fresh BioSim sim through the Claude bot brain: read state → decide →
apply flows (+optional malfunctions) → tick ×24 → yield a `sol` event. Yields
`start`/`sol`/`end` events; terminates on crew death, sol cap, token budget, or
cooperative stop.
"""

from .state import summarize_state

TICKS_PER_SOL = 24
TREND_LEN = 6  # sols of per-store % history handed to the bot (oldest -> newest)


def _ev(t, d):
    return {"type": t, "data": d}


def _attach_trend(stores, history):
    """Append each store's current pct to a rolling per-store history and expose
    the recent window as `trend` so the bot can steer on direction, not just the
    instantaneous gauge. Mutates `history` and the store dicts in place."""
    for s in stores:
        h = history.setdefault(s["name"], [])
        h.append(s["pct"])
        if len(h) > TREND_LEN:
            del h[0]
        s["trend"] = list(h)


def run_survival(client, brain, config_xml, max_sols=200, token_budget=None,
                 difficulty="off", malfunction_module="Grey_Water_Store",
                 cancel=lambda: False):
    sim_id = client.start_sim(config_xml)
    yield _ev("start", {"sim_id": sim_id, "max_sols": max_sols})
    sol, reason = 0, "sol_cap"
    trend_history = {}
    while sol < max_sols:
        if cancel():
            reason = "stopped"
            break
        raw = client.get_state(sim_id)
        snap = summarize_state(raw)
        if snap["ended"]:
            reason = "crew_death"
            break
        _attach_trend(snap["stores"], trend_history)
        decision = brain.decide(snap)
        for a in decision["actions"]:
            client.set_flows(sim_id, a["module"], a["kind"], a["type"], a["desired_rates"])
        if difficulty == "malfunctions" and sol > 0 and sol % 10 == 0:
            try:
                client.add_malfunction(sim_id, malfunction_module)
            except Exception:
                pass
        client.tick(sim_id, TICKS_PER_SOL)
        sol += 1
        raw = client.get_state(sim_id)
        snap = summarize_state(raw)
        alive = not snap["ended"]
        yield _ev("sol", {"sol": sol, "alive": alive, "modules": raw.get("modules", {}),
                          "reasoning": decision["reasoning"], "actions": decision["actions"],
                          "warnings": snap["warnings"]})
        if not alive:
            reason = "crew_death"
            break
        if token_budget is not None and getattr(brain, "tokens_used", 0) >= token_budget:
            reason = "token_budget"
            break
    yield _ev("end", {"sols_survived": sol, "ended_reason": reason})
