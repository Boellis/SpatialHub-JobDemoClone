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

import os
import sys
from pathlib import Path

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

mcp = FastMCP("biosim-habitat")


class Run:
    """Server-held state for the single active survival run."""

    def __init__(self):
        self.client = BiosimControl(BIOSIM_URL)
        self.sim_id = None
        self.sols = 0
        self.difficulty = "off"
        self.alive = True
        self.ended_reason = None
        self.trend = {}          # store name -> [pct, ...]
        self.last_actions = []

    def reset(self, difficulty):
        self.sim_id = None
        self.sols = 0
        self.difficulty = difficulty
        self.alive = True
        self.ended_reason = None
        self.trend = {}
        self.last_actions = []


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


def _attach_trend(stores):
    """Append each store's current pct to a rolling history and expose the
    recent window as `trend` (oldest -> newest)."""
    for s in stores:
        h = RUN.trend.setdefault(s["name"], [])
        h.append(s["pct"])
        if len(h) > TREND_LEN:
            del h[0]
        s["trend"] = list(h)


def _status_payload():
    if RUN.sim_id is None:
        return {"started": False, "hint": "Call start_run to begin a survival run."}
    raw = RUN.client.get_state(RUN.sim_id)
    snap = summarize_state(raw)
    _attach_trend(snap["stores"])
    RUN.alive = not snap["ended"]
    if not RUN.alive and RUN.ended_reason is None:
        RUN.ended_reason = "crew_death"
    return {
        "started": True,
        "sim_id": RUN.sim_id,
        "sols_survived": RUN.sols,
        "alive": RUN.alive,
        "ended_reason": RUN.ended_reason,
        "difficulty": RUN.difficulty,
        "stores": snap["stores"],
        "balances": snap["balances"],
        "warnings": snap["warnings"],
        "controllable": snap["controllable"],
        "last_actions": RUN.last_actions,
    }


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def start_run(crew_size: int = 15, difficulty: str = "off") -> dict:
    """Start a fresh Mars-habitat survival simulation and return initial telemetry.

    The sim runs until the crew dies (runTillCrewDeath). crew_size defaults to the
    15-person competition crew. difficulty is 'off' or 'malfunctions' (periodic
    equipment failures every 10 sols). Resets any prior run.
    """
    difficulty = difficulty if difficulty in DIFFICULTIES else "off"
    RUN.reset(difficulty)
    config = build_survival_config(crew_size)
    RUN.sim_id = RUN.client.start_sim(config)
    return _status_payload()


@mcp.tool()
def get_status() -> dict:
    """Return current survival telemetry — your dashboard.

    Includes: sols survived, alive flag, every store (pct, absolute level/capacity,
    runway_sols when draining, and a recent pct trend), per-resource flow balances
    (produced/consumed/net per tick; negative net = draining), active warnings, and
    the controllable flow surfaces with their current desired rates and max ceilings.
    """
    return _status_payload()


@mcp.tool()
def set_flows(actions: list[dict]) -> dict:
    """Set life-support flow rates (does NOT advance time — call advance after).

    `actions` is a list of:
      {"module": str, "kind": "consumers"|"producers", "type": str, "rates": [float, ...]}
    Each rate is clamped to [0, max] for that surface; surfaces not in the
    controllable set are rejected (returned under "rejected"). Returns what was
    actually applied and what was rejected.
    """
    if RUN.sim_id is None:
        raise ValueError("No active run. Call start_run first.")
    applied, rejected = _clamp(actions)
    for a in applied:
        RUN.client.set_flows(RUN.sim_id, a["module"], a["kind"], a["type"], a["rates"])
    RUN.last_actions = applied
    return {"applied": applied, "rejected": rejected}


@mcp.tool()
def advance(sols: int = 1) -> dict:
    """Advance the simulation by `sols` Mars days (24 ticks each), one sol at a time.

    Stops early if the crew dies. When difficulty='malfunctions', injects a
    malfunction every 10th sol. Returns telemetry after advancing, plus
    `sols_advanced_this_call` and the alive flag. Score = sols_survived.
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
        if summarize_state(RUN.client.get_state(RUN.sim_id))["ended"]:
            RUN.alive = False
            RUN.ended_reason = "crew_death"
            break
    payload = _status_payload()
    payload["sols_advanced_this_call"] = advanced
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
    return {"malfunction_id": mid, "module": module,
            "intensity": intensity, "length": length}


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
        "Loop: call start_run, then repeatedly get_status -> reason -> set_flows -> "
        "advance. Read the telemetry, not your assumptions:\n"
        "- balances: produced vs consumed per tick, net (negative = draining).\n"
        "- stores: pct, level/capacity, runway_sols (sols until empty if draining), "
        "and trend (recent pct, oldest->newest).\n\n"
        "Operating doctrine, in priority order:\n"
        "1. POWER is the master resource — every system draws it. Keep Nuclear_Source "
        "power production >= total power consumption with margin; if power starves, "
        "O2, CO2 removal, and water all fail at once.\n"
        "2. O2: keep OGS O2 production >= crew O2 consumption. Act on falling runway, "
        "not after the warning fires.\n"
        "3. CO2 is toxic: keep VCCR CO2 removal >= CO2 the crew produces.\n"
        "4. WATER: keep potable water positive; BiomassPS and the crew both draw it.\n"
        "5. FOOD/BIOMASS: sustain BiomassPS so food is replenished long-term.\n\n"
        "Steer on TRENDS and RUNWAY, not just current %. Hold reservoirs in a safe "
        "band (~30-90%) with buffer; overproducing wastes power you may need "
        "elsewhere. Advance a few sols at a time early to learn the dynamics, then "
        "longer once the balances are stable. Make the smallest set of changes that "
        "keeps every balance non-negative with margin."
    )


if __name__ == "__main__":
    mcp.run()
