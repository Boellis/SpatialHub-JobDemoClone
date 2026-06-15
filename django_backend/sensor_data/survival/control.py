"""control.py — server-side manual control of a BioSim survival run, driven from the
web app's control panel.

Mirrors the MCP pilot's capabilities (start / advance / set-flow / inject / stop) but
executes inside Django and publishes telemetry to the relay so every viewer of
``/api/survival/live`` sees it. No Anthropic key — a human clicks the buttons. The
HTTP view that calls this is Bearer-token authenticated (see views.survival_control).

Reuses the exact same survival modules as the MCP pilot, so the physics, the flow
ceilings, and the telemetry shape are identical.
"""

import secrets
import threading

from . import relay
from .biosim_control import BiosimControl
from .config import build_survival_config
from .state import CONTROLLABLE, TICKS_PER_SOL, summarize_state

_LOCK = threading.Lock()          # one web-controlled run at a time
_MALF_MODULE = "Grey_Water_Store"
_MAX_ADVANCE = 50                  # cap sols per request so one call can't run forever


class _Run:
    def __init__(self):
        self.client = None
        self.sim_id = None
        self.run_id = None
        self.sols = 0
        self.crew_size = 15
        self.difficulty = "off"
        self.alive = True
        self.last_actions = []


RUN = _Run()


def _sol_data(raw, reasoning=""):
    snap = summarize_state(raw)
    return {
        "sol": RUN.sols,
        "alive": RUN.alive,
        "modules": raw.get("modules", {}),
        "reasoning": reasoning,
        "actions": [
            {"module": a["module"], "kind": a["kind"], "type": a["type"],
             "desired_rates": a["rates"]}
            for a in RUN.last_actions
        ],
        "warnings": snap["warnings"],
        "stores": [
            {k: s[k] for k in ("name", "pct", "runway_sols") if k in s}
            for s in snap["stores"]
        ],
        "balances": [{"resource": b["resource"], "net": b["net"]} for b in snap["balances"]],
    }


def start(biosim_url, crew_size=15, difficulty="off"):
    with _LOCK:
        from sensor_data.models import SurvivalRun

        if SurvivalRun.objects.filter(ended_at__isnull=True).exists():
            return {"ok": False, "error": "a run is already in progress"}
        RUN.client = BiosimControl(biosim_url)
        RUN.crew_size = max(1, min(int(crew_size), 50))
        RUN.difficulty = difficulty if difficulty in ("off", "malfunctions") else "off"
        RUN.sols = 0
        RUN.alive = True
        RUN.last_actions = []
        RUN.sim_id = RUN.client.start_sim(build_survival_config(RUN.crew_size))
        RUN.run_id = secrets.token_hex(8)
        relay.publish("run", {"run_id": RUN.run_id, "difficulty": RUN.difficulty,
                              "crew_size": RUN.crew_size})
        raw = RUN.client.get_state(RUN.sim_id)
        relay.publish("sol", _sol_data(raw, "Run started from the web control panel."))
        return {"ok": True, "sim_id": RUN.sim_id, "sols": RUN.sols}


def advance(sols=1, note=""):
    with _LOCK:
        if RUN.sim_id is None:
            raise ValueError("no active run")
        sols = max(1, min(int(sols), _MAX_ADVANCE))
        advanced = 0
        for _ in range(sols):
            if relay.is_paused():
                # Paused mid-request: stop ticking and report how far we got. The
                # run stays alive; a resume + advance picks up from here.
                break
            if RUN.difficulty == "malfunctions" and RUN.sols > 0 and RUN.sols % 10 == 0:
                try:
                    RUN.client.add_malfunction(RUN.sim_id, _MALF_MODULE)
                except Exception:
                    pass
            RUN.client.tick(RUN.sim_id, TICKS_PER_SOL)
            RUN.sols += 1
            advanced += 1
            raw = RUN.client.get_state(RUN.sim_id)
            ended = summarize_state(raw)["ended"]
            relay.publish("sol", _sol_data(raw, note if advanced == 1 else ""))
            if ended:
                RUN.alive = False
                relay.publish("end", {"sols_survived": RUN.sols, "ended_reason": "crew_death"})
                break
        return {"ok": True, "sols": RUN.sols, "alive": RUN.alive, "advanced": advanced}


def set_flow(module, kind, ftype, rate):
    with _LOCK:
        if RUN.sim_id is None:
            raise ValueError("no active run")
        ceiling = CONTROLLABLE.get((module, kind, ftype))
        if ceiling is None:
            return {"ok": False, "error": "not a controllable surface"}
        r = max(0.0, min(float(rate), ceiling))
        RUN.client.set_flows(RUN.sim_id, module, kind, ftype, [r])
        RUN.last_actions = [{"module": module, "kind": kind, "type": ftype, "rates": [r]}]
        raw = RUN.client.get_state(RUN.sim_id)
        relay.publish("sol", _sol_data(raw, f"Web control: {module} {ftype} → {r:g}"))
        return {"ok": True, "applied": r, "ceiling": ceiling}


def inject(module=_MALF_MODULE, intensity="SEVERE_MALF", length="TEMPORARY_MALF"):
    with _LOCK:
        if RUN.sim_id is None:
            raise ValueError("no active run")
        mid = RUN.client.add_malfunction(RUN.sim_id, module, intensity, length)
        raw = RUN.client.get_state(RUN.sim_id)
        relay.publish("sol", _sol_data(raw, f"Web control: injected {intensity} into {module}."))
        return {"ok": True, "malfunction_id": mid}


def stop():
    with _LOCK:
        if RUN.sim_id is not None:
            relay.publish("end", {"sols_survived": RUN.sols, "ended_reason": "stopped"})
        RUN.sim_id = None
        return {"ok": True}


def pause():
    """Pause the run: broadcast paused=true to every screen. Honored server-side by
    advance() (won't tick while paused) and by the MCP pilot via its command poll."""
    relay.set_paused(True)
    return {"ok": True, "paused": True}


def resume():
    """Resume a paused run: broadcast paused=false to every screen."""
    relay.set_paused(False)
    return {"ok": True, "paused": False}
