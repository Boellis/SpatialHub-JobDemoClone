"""biosim MCP server — pilot the NASA BioSim Mars habitat from an MCP client.

Exposes BioSim life-support control as MCP tools so a Claude session (e.g. Claude
Code on a subscription) can *be* the survival bot: start a run, read rich
telemetry (store levels, runway, per-resource flow balances, trends), set flow
rates (server-clamped to the same ceilings the deployed bot uses), advance time
sol by sol, and inject malfunctions.

Single source of truth: reuses ``sensor_data.survival.{biosim_control, state,
config}`` so the human-driven operator sees identical physics and constraints to
the deployed API bot. Whatever strategy wins here transfers verbatim.

Run:  python mcp_biosim/server.py     (stdio transport; launched by the MCP client)
Env:  BIOSIM_URL  — BioSim REST base (default the competition VM).
"""

import json
import os
import queue
import secrets
import sys
import threading
from pathlib import Path

import requests

# Self-locating import of the Django-free survival modules. Works regardless of
# the cwd the MCP client launches us from.
_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO / "django_backend"))

from sensor_data.survival.biosim_control import BiosimControl, BiosimError  # noqa: E402
from sensor_data.survival.config import build_survival_config  # noqa: E402
from sensor_data.survival.state import (  # noqa: E402
    CONTROLLABLE,
    TICKS_PER_SOL,
    summarize_state,
)

from mcp.server.fastmcp import FastMCP  # noqa: E402

BIOSIM_URL = os.environ.get("BIOSIM_URL", "http://34.66.244.62:8009")
TREND_LEN = 12  # sols of per-store % history exposed in telemetry
DIFFICULTIES = {"off", "malfunctions"}
DIFFICULTY_MALF_MODULE = "Grey_Water_Store"

# Pilot-context gauge. The web app can't read Claude Code's true context window, but
# the MCP CAN tally what it feeds the pilot — that's the dominant driver of context
# growth during a run. We estimate tokens from the size of each tool RETURN value
# (what actually enters the pilot's context) and count tool calls. Both reset at the
# post-compaction boundary (start_run / resume_run), so the gauge drops after a
# /compact + resume, making "compact recommended" actionable.
_CONTEXT_BUDGET = int(os.environ.get("SURVIVAL_CONTEXT_BUDGET", "120000"))
_SESSION = {"tool_calls": 0, "est_tokens": 0}

# Optional live-telemetry relay: when both are set, every survival event is
# POSTed to the Django relay so the web app renders the run in real time. This
# is a pure server-side side-effect — it never enters any tool's return payload
# (zero extra Claude tokens) and never blocks or breaks a tool call.
SURVIVAL_RELAY_URL = os.environ.get("SURVIVAL_RELAY_URL", "").rstrip("/")
SURVIVAL_RELAY_TOKEN = os.environ.get("SURVIVAL_RELAY_TOKEN", "")

mcp = FastMCP("biosim-habitat")


# ---------------------------------------------------------------------------
# Non-blocking telemetry relay (background daemon worker)
# ---------------------------------------------------------------------------

_PUBLISH_QUEUE: "queue.Queue[dict]" = queue.Queue(maxsize=1000)
_PUBLISH_WORKER = None
_PUBLISH_LOCK = threading.Lock()


def _relay_enabled() -> bool:
    return bool(SURVIVAL_RELAY_URL and SURVIVAL_RELAY_TOKEN)


def _publish_worker():
    """Daemon loop: drain the queue and POST each event, swallowing everything.
    Network errors, timeouts, bad responses — none of them must ever surface."""
    url = f"{SURVIVAL_RELAY_URL}/api/survival/ingest"
    headers = {"Authorization": f"Bearer {SURVIVAL_RELAY_TOKEN}"}
    while True:
        event = _PUBLISH_QUEUE.get()
        try:
            requests.post(url, json=event, headers=headers, timeout=3)
        except Exception:
            pass
        finally:
            _PUBLISH_QUEUE.task_done()


def _ensure_worker():
    """Lazily start the single daemon publisher thread on first publish."""
    global _PUBLISH_WORKER
    if _PUBLISH_WORKER is not None:
        return
    with _PUBLISH_LOCK:
        if _PUBLISH_WORKER is None:
            _PUBLISH_WORKER = threading.Thread(
                target=_publish_worker, name="survival-relay", daemon=True)
            _PUBLISH_WORKER.start()


def _publish(event_type: str, data: dict) -> None:
    """Enqueue a survival event for the background relay. No-op (silent, no
    network) when the relay env vars are unset. Returns instantly; if the queue
    is full the event is dropped rather than blocking the tool call."""
    if not _relay_enabled():
        return
    _ensure_worker()
    try:
        _PUBLISH_QUEUE.put_nowait({"type": event_type, "data": data})
    except queue.Full:
        pass


class Run:
    """Server-held state for the single active survival run."""

    def __init__(self):
        self.client = BiosimControl(BIOSIM_URL)
        self.sim_id = None
        self.run_id = None
        self.sols = 0
        self.difficulty = "off"
        self.alive = True
        self.ended_reason = None
        self.trend = {}          # store name -> [pct, ...]
        self.last_actions = []
        _load_state_into(self)   # survive a full MCP restart (Claude Code restart)

    def reset(self, difficulty):
        self.sim_id = None
        self.run_id = None
        self.sols = 0
        self.difficulty = difficulty
        self.alive = True
        self.ended_reason = None
        self.trend = {}
        self.last_actions = []


# ---------------------------------------------------------------------------
# Run-state persistence — so a long endurance run survives a Claude context
# compaction AND a full Claude Code / MCP restart.
#
# Context compaction alone does NOT need this: the MCP process keeps RUN in memory,
# so get_status resumes. But a Claude Code restart kills this process (while the
# BioSim sim keeps running), so we mirror the live sim id + sol count to a small
# local file and reload it on boot. resume_run() then re-attaches and verifies.
# ---------------------------------------------------------------------------
_STATE_FILE = _REPO / "mcp_biosim" / ".run_state.json"


def _save_state():
    try:
        _STATE_FILE.write_text(json.dumps({
            "sim_id": RUN.sim_id, "run_id": RUN.run_id,
            "sols": RUN.sols, "difficulty": RUN.difficulty,
        }))
    except Exception:
        pass


def _load_state_into(run):
    try:
        d = json.loads(_STATE_FILE.read_text())
        run.sim_id = d.get("sim_id")
        run.run_id = d.get("run_id")
        run.sols = int(d.get("sols", 0) or 0)
        run.difficulty = d.get("difficulty", "off")
    except Exception:
        pass


RUN = Run()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clamp(actions):
    """Clamp a batch of flow actions to the CONTROLLABLE ceilings and drop
    surfaces the bot is not allowed to touch. Returns (applied, rejected).

    Each action: {"module", "kind", "type", "rates"|"desired_rates": [float,...]}.
    """
    applied, rejected = [], []
    for a in actions or []:
        key = (a.get("module"), a.get("kind"), a.get("type"))
        ceiling = CONTROLLABLE.get(key)
        raw_rates = a.get("rates")
        if raw_rates is None:
            raw_rates = a.get("desired_rates", [])
        if ceiling is None:
            rejected.append({
                "module": key[0], "kind": key[1], "type": key[2],
                "reason": "not a controllable surface",
            })
            continue
        rates = [max(0.0, min(float(r), ceiling)) for r in raw_rates]
        applied.append({
            "module": key[0], "kind": key[1], "type": key[2], "rates": rates,
        })
    return applied, rejected


def _record_trend(stores):
    """Append each store's current pct to a rolling history. Returns
    name -> delta (pct change since the previous reading) for compact telemetry."""
    deltas = {}
    for s in stores:
        h = RUN.trend.setdefault(s["name"], [])
        prev = h[-1] if h else s["pct"]
        h.append(s["pct"])
        if len(h) > TREND_LEN:
            del h[0]
        deltas[s["name"]] = round(s["pct"] - prev, 2)
    return deltas


def _compact_stores(stores, deltas):
    """Decision-essential store view: pct, per-reading delta, and runway when
    draining. Drops absolute level/capacity and the full trend array."""
    out = []
    for s in stores:
        e = {"name": s["name"], "pct": s["pct"], "delta": deltas.get(s["name"], 0.0)}
        if "runway_sols" in s:
            e["runway_sols"] = s["runway_sols"]
        out.append(e)
    return out


def _compact_balances(balances):
    """Net flow per resource — the actionable signal (negative = draining).
    Drops produced/consumed (recoverable via detail='full')."""
    return [{"resource": b["resource"], "net": b["net"]} for b in balances]


def _compact_controllable(controllable):
    """Current set rates per surface. Drops the static max ceilings — those live
    once in the survival_doctrine prompt, not in every payload."""
    return [{"module": c["module"], "kind": c["kind"], "type": c["type"],
             "desired": c["desired"]} for c in controllable]


def _status_payload(detail="normal"):
    if RUN.sim_id is None:
        return {"started": False, "hint": "Call start_run to begin a survival run."}
    raw = RUN.client.get_state(RUN.sim_id)
    snap = summarize_state(raw)
    deltas = _record_trend(snap["stores"])
    RUN.alive = not snap["ended"]
    if not RUN.alive and RUN.ended_reason is None:
        RUN.ended_reason = "crew_death"

    payload = {
        "started": True,
        "sim_id": RUN.sim_id,
        "sols_survived": RUN.sols,
        "alive": RUN.alive,
        "ended_reason": RUN.ended_reason,
        "difficulty": RUN.difficulty,
        "warnings": snap["warnings"],
        "last_actions": RUN.last_actions,
    }
    if detail == "full":
        # Full physics: absolute levels, trend arrays, produced/consumed, ceilings.
        for s in snap["stores"]:
            s["trend"] = list(RUN.trend.get(s["name"], [s["pct"]]))
        payload["stores"] = snap["stores"]
        payload["balances"] = snap["balances"]
        payload["controllable"] = snap["controllable"]
    else:
        payload["detail"] = "normal"
        payload["stores"] = _compact_stores(snap["stores"], deltas)
        payload["balances"] = _compact_balances(snap["balances"])
        payload["controllable"] = _compact_controllable(snap["controllable"])
    return payload


def _track_call(payload):
    """Tally pilot-context pressure: +1 tool call and a rough token estimate of the
    telemetry returned to the pilot (≈ chars/4). Reset at start_run / resume_run."""
    _SESSION["tool_calls"] += 1
    try:
        _SESSION["est_tokens"] += max(1, len(json.dumps(payload)) // 4)
    except Exception:
        pass


def _pilot_stat():
    return {"tool_calls": _SESSION["tool_calls"],
            "est_tokens": _SESSION["est_tokens"],
            "budget": _CONTEXT_BUDGET}


def _reset_session():
    _SESSION["tool_calls"] = 0
    _SESSION["est_tokens"] = 0


def _sol_event(raw, reasoning):
    """Build the relay `sol` event data from a raw BioSim state dict.

    Carries the canonical loop fields (sol/alive/modules/reasoning/actions/warnings)
    PLUS the compact `stores` and `balances` telemetry so the web app renders clean
    resource cards without re-parsing raw BioSim modules. The frontend computes its
    own per-store delta across successive events."""
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
        "balances": [{"resource": b["resource"], "net": b["net"]}
                     for b in snap["balances"]],
        "pilot": _pilot_stat(),
    }


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def start_run(crew_size: int = 15, difficulty: str = "off", note: str = "") -> dict:
    """Start a fresh Mars-habitat survival simulation and return initial telemetry.

    The sim runs until the crew dies (runTillCrewDeath). crew_size defaults to the
    15-person competition crew. difficulty is 'off' or 'malfunctions' (periodic
    equipment failures every 10 sols). Resets any prior run.

    note: optional one-line reasoning shown live in the web app.
    """
    difficulty = difficulty if difficulty in DIFFICULTIES else "off"
    RUN.reset(difficulty)
    _reset_session()  # fresh run = fresh context baseline
    config = build_survival_config(crew_size)
    RUN.sim_id = RUN.client.start_sim(config)
    RUN.run_id = secrets.token_hex(8)
    _save_state()
    payload = _status_payload()
    _publish("run", {"run_id": RUN.run_id, "difficulty": RUN.difficulty,
                     "crew_size": crew_size, "pilot": _pilot_stat()})
    try:
        raw = RUN.client.get_state(RUN.sim_id)
        _publish("sol", _sol_event(raw, note))
    except Exception:
        pass
    _track_call(payload)
    return payload


@mcp.tool()
def get_status(detail: str = "normal") -> dict:
    """Return current survival telemetry — your dashboard.

    detail='normal' (default, compact, token-lean) returns: sols survived, alive
    flag, each store (pct, `delta` = pct change since last reading, runway_sols when
    draining), per-resource net flow balances (negative = draining), warnings, and
    the controllable surfaces with their current `desired` rates. Max ceilings are in
    the survival_doctrine prompt, not repeated here.

    detail='full' additionally returns absolute store level/capacity, full pct trend
    arrays, produced/consumed per balance, and the max ceiling per surface. Use it
    occasionally when you need the raw physics; prefer 'normal' to conserve context.
    """
    payload = _status_payload("full" if detail == "full" else "normal")
    _track_call(payload)
    return payload


@mcp.tool()
def resume_run() -> dict:
    """Re-attach to the active survival run after a context compaction or restart.

    Within-session compaction needs nothing — this MCP process keeps the run in
    memory, so get_status already resumes. Use this after a FULL Claude Code / MCP
    restart: it reloads the saved sim id from disk and verifies the BioSim sim is
    still alive, then returns current telemetry. If there's no live saved run it
    hints to call start_run. Idempotent and safe to call any time you're unsure of
    the run state (e.g. right after a compaction summary).
    """
    _reset_session()  # post-compaction boundary — the gauge restarts from here
    if RUN.sim_id is None:
        _load_state_into(RUN)
    if RUN.sim_id is None:
        return {"resumed": False, "hint": "No saved run found. Call start_run to begin."}
    try:
        raw = RUN.client.get_state(RUN.sim_id)
    except Exception as e:
        return {"resumed": False, "error": str(e),
                "hint": "Saved sim is unreachable. Call start_run for a fresh run."}
    snap = summarize_state(raw)
    RUN.alive = not snap["ended"]
    if not RUN.alive and RUN.ended_reason is None:
        RUN.ended_reason = "crew_death"
    payload = _status_payload()
    payload["resumed"] = True
    payload["sim_id"] = RUN.sim_id
    _track_call(payload)
    return payload


@mcp.tool()
def set_flows(actions: list[dict], note: str = "") -> dict:
    """Set life-support flow rates (does NOT advance time — call advance after).

    `actions` is a list of:
      {"module": str, "kind": "consumers"|"producers", "type": str, "rates": [float, ...]}
    Each rate is clamped to [0, max] for that surface; surfaces not in the
    controllable set are rejected (returned under "rejected"). Returns what was
    actually applied and what was rejected.

    note: optional one-line reasoning shown live in the web app.
    """
    if RUN.sim_id is None:
        raise ValueError("No active run. Call start_run first.")
    applied, rejected = _clamp(actions)
    for a in applied:
        RUN.client.set_flows(RUN.sim_id, a["module"], a["kind"], a["type"], a["rates"])
    RUN.last_actions = applied
    _save_state()
    try:
        raw = RUN.client.get_state(RUN.sim_id)
        _publish("sol", _sol_event(raw, note))
    except Exception:
        pass
    result = {"applied": applied, "rejected": rejected}
    _track_call(result)
    return result


@mcp.tool()
def advance(sols: int = 1, detail: str = "normal", note: str = "") -> dict:
    """Advance the simulation by `sols` Mars days (24 ticks each), one sol at a time.

    Advance in CHUNKS to conserve context — e.g. advance(3) while learning the
    dynamics, advance(10) or more once the balances are stable. It is safe: each sol
    is checked and the run stops the moment the crew dies (so you never overshoot a
    crisis). When difficulty='malfunctions', injects a malfunction every 10th sol.
    Returns telemetry after advancing (compact by default; detail='full' for raw
    physics) plus `sols_advanced_this_call` and the alive flag. Score = sols_survived.

    note: optional one-line reasoning shown live in the web app (applied to the
    first advanced sol only).
    """
    if RUN.sim_id is None:
        raise ValueError("No active run. Call start_run first.")
    sols = max(1, sols)
    advanced = 0
    for _ in range(sols):
        if (RUN.difficulty == "malfunctions"
                and RUN.sols > 0 and RUN.sols % 10 == 0):
            try:
                RUN.client.add_malfunction(RUN.sim_id, DIFFICULTY_MALF_MODULE)
            except Exception:
                pass
        RUN.client.tick(RUN.sim_id, TICKS_PER_SOL)
        RUN.sols += 1
        advanced += 1
        # Reuse this single state read for both the ended-check and the relay
        # publish — do NOT add extra BioSim calls.
        raw = RUN.client.get_state(RUN.sim_id)
        if summarize_state(raw)["ended"]:
            RUN.alive = False
            RUN.ended_reason = "crew_death"
            _publish("sol", _sol_event(raw, note if advanced == 1 else ""))
            _publish("end", {"sols_survived": RUN.sols,
                             "ended_reason": RUN.ended_reason or "crew_death"})
            break
        _publish("sol", _sol_event(raw, note if advanced == 1 else ""))
    _save_state()
    payload = _status_payload("full" if detail == "full" else "normal")
    payload["sols_advanced_this_call"] = advanced
    _track_call(payload)
    return payload


@mcp.tool()
def inject_malfunction(
    module: str = "Grey_Water_Store",
    intensity: str = "SEVERE_MALF",
    length: str = "TEMPORARY_MALF",
) -> dict:
    """Manually inject a BioSim malfunction into a module (stress test resilience).

    intensity: SEVERE_MALF | MEDIUM_MALF | LOW_MALF. length: TEMPORARY_MALF |
    PERMANENT_MALF. Returns the malfunction id.
    """
    if RUN.sim_id is None:
        raise ValueError("No active run. Call start_run first.")
    mid = RUN.client.add_malfunction(RUN.sim_id, module, intensity, length)
    result = {"malfunction_id": mid, "module": module,
              "intensity": intensity, "length": length}
    _track_call(result)
    return result


# ---------------------------------------------------------------------------
# Prompt: the operating doctrine (load this before piloting)
# ---------------------------------------------------------------------------

@mcp.prompt()
def survival_doctrine() -> str:
    """Load the life-support operating doctrine for piloting the habitat to win."""
    return (
        "You are the life-support controller for a 15-person Mars habitat (NASA "
        "BioSim). Goal: keep every crew member alive for as many sols (Mars days, "
        "24 ticks) as possible. Score = sols survived.\n\n"
        "LOOP: call start_run, then repeatedly get_status -> reason -> set_flows -> "
        "advance(chunk). Telemetry is COMPACT by default to save context:\n"
        "- balances: [{resource, net}] — net per tick, NEGATIVE means draining.\n"
        "- stores: [{pct, delta, runway_sols?}] — delta = pct change since your last "
        "reading (negative = falling); runway_sols = sols until empty when draining.\n"
        "- controllable: [{module, kind, type, desired}] — the rates you have set.\n"
        "Call get_status(detail='full') ONLY when you need raw physics (absolute "
        "level/capacity, full trend arrays, produced/consumed). Default to compact.\n\n"
        "CONTROLLABLE SURFACES and their max ceilings (set within [0, max]):\n"
        "  Nuclear_Source producers/Power <= 3000\n"
        "  OGS consumers/Power <= 1000, producers/O2 <= 1000\n"
        "  VCCR consumers/Power <= 1000, producers/CO2 <= 1000\n"
        "  BiomassPS consumers/Power <= 400, consumers/PotableWater <= 100, "
        "producers/Biomass <= 100\n"
        "  Crew_Quarters_Group consumers/Food <= 5, consumers/PotableWater <= 3\n\n"
        "DOCTRINE, in priority order:\n"
        "1. POWER is the master resource — every system draws it. Keep Nuclear_Source "
        "power production >= total power consumption with margin; if power starves, "
        "O2, CO2 removal, and water all fail at once.\n"
        "2. O2: keep OGS O2 production >= crew O2 consumption. Act on falling runway, "
        "not after the warning fires.\n"
        "3. CO2 is toxic: keep VCCR CO2 removal >= CO2 the crew produces.\n"
        "4. WATER: keep potable water positive; BiomassPS and the crew both draw it.\n"
        "5. FOOD/BIOMASS: sustain BiomassPS so food is replenished long-term.\n\n"
        "Steer on DELTA and RUNWAY, not just current %. Hold reservoirs in a safe band "
        "(~30-90%) with buffer; overproducing wastes power you may need elsewhere. "
        "ADVANCE IN CHUNKS to conserve context: advance(3) while learning, advance(10) "
        "or more once balances are stable — advance stops automatically at crew death, "
        "so larger chunks never overshoot a crisis. Make the smallest set of changes "
        "that keeps every balance non-negative with margin."
    )


if __name__ == "__main__":
    mcp.run()
