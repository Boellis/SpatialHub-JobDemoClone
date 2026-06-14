"""Tests for the biosim MCP server. Uses a fake BioSim control client so nothing
touches a live VM. Run with the server's venv:

    mcp_biosim/.venv/bin/python -m pytest mcp_biosim/tests -q
"""

import os
import sys

# Import the server module (sibling of the tests/ dir).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server  # noqa: E402


class FakeClient:
    """Mimics BiosimControl: O2 runs a deficit (800 produced < 900 consumed),
    and the crew dies once total ticks reach `death_tick`."""

    def __init__(self, death_tick=None):
        self.death_tick = death_tick
        self.ticks = 0
        self.set_flows_calls = []
        self.malfunctions = []
        self.started = False

    def start_sim(self, config_xml):
        self.started = True
        return 42

    def get_state(self, sim_id):
        state = {"modules": {
            "O2_Store": {"properties": {"currentLevel": 50.0, "currentCapacity": 100.0}},
            "General_Power_Store": {"properties": {"currentLevel": 80.0, "currentCapacity": 100.0}},
            "OGS": {
                "producers": [{"type": "O2", "rates": {"actualFlowRates": [800.0]}}],
                "consumers": [{"type": "Power", "rates": {"desiredFlowRates": [500.0]}}],
            },
            "Crew_Quarters_Group": {
                "consumers": [{"type": "O2", "rates": {"actualFlowRates": [900.0]}}]},
        }}
        if self.death_tick is not None and self.ticks >= self.death_tick:
            state["crewDead"] = True
        return state

    def set_flows(self, sim_id, module, kind, flow_type, rates):
        self.set_flows_calls.append((module, kind, flow_type, rates))

    def tick(self, sim_id, n=1):
        self.ticks += n

    def add_malfunction(self, sim_id, module, intensity="SEVERE_MALF", length="TEMPORARY_MALF"):
        self.malfunctions.append((module, intensity, length))
        return 7


def _fresh(death_tick=None):
    server.RUN.reset("off")
    client = FakeClient(death_tick=death_tick)
    server.RUN.client = client
    return client


# ---------------------------------------------------------------------------

def test_start_run_returns_telemetry():
    _fresh()
    out = server.start_run(crew_size=15)
    assert out["started"] is True and out["sim_id"] == 42
    assert out["sols_survived"] == 0 and out["alive"] is True
    assert any(s["name"] == "O2_Store" for s in out["stores"])
    o2 = next(b for b in out["balances"] if b["resource"] == "O2")
    assert o2["net"] == -100.0  # 800 produced - 900 consumed


def test_set_flows_clamps_and_rejects():
    client = _fresh()
    server.RUN.sim_id = 42
    out = server.set_flows([
        {"module": "OGS", "kind": "consumers", "type": "Power", "rates": [5000.0]},
        {"module": "NOPE", "kind": "consumers", "type": "Power", "rates": [1.0]},
    ])
    assert out["applied"][0]["rates"] == [1000.0]            # clamped to ceiling
    assert any(r["module"] == "NOPE" for r in out["rejected"])
    assert client.set_flows_calls == [("OGS", "consumers", "Power", [1000.0])]


def test_set_flows_negatives_to_zero():
    _fresh()
    server.RUN.sim_id = 42
    out = server.set_flows([
        {"module": "OGS", "kind": "producers", "type": "O2", "rates": [-9.0]}])
    assert out["applied"][0]["rates"] == [0.0]


def test_set_flows_requires_run():
    _fresh()  # sim_id stays None
    try:
        server.set_flows([])
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_advance_ticks_24_per_sol_and_counts():
    client = _fresh()
    server.RUN.sim_id = 42
    out = server.advance(3)
    assert out["sols_advanced_this_call"] == 3
    assert out["sols_survived"] == 3
    assert client.ticks == 72


def test_advance_stops_at_crew_death():
    _fresh(death_tick=48)  # dead after 2 sols
    server.RUN.sim_id = 42
    out = server.advance(10)
    assert out["alive"] is False
    assert out["ended_reason"] == "crew_death"
    assert out["sols_advanced_this_call"] == 2
    assert out["sols_survived"] == 2


def test_compact_status_is_lean_by_default():
    _fresh()
    server.RUN.sim_id = 42
    out = server.get_status()
    assert out["detail"] == "normal"
    # stores carry pct + delta (+runway when draining), NOT level/capacity/trend
    o2 = next(s for s in out["stores"] if s["name"] == "O2_Store")
    assert "delta" in o2 and "pct" in o2
    assert "level" not in o2 and "capacity" not in o2 and "trend" not in o2
    # balances carry net only; controllable carries desired but not max
    assert all(set(b) == {"resource", "net"} for b in out["balances"])
    assert all("max" not in c for c in out["controllable"])


def test_delta_tracks_pct_change_across_readings():
    _fresh()
    server.RUN.sim_id = 42
    server.advance(1)             # first reading: delta 0 (no prior)
    out = server.advance(1)       # pct is constant in the fake -> delta 0
    o2 = next(s for s in out["stores"] if s["name"] == "O2_Store")
    assert o2["delta"] == 0.0     # 50% -> 50%, no change


def test_full_detail_restores_raw_physics():
    _fresh()
    server.RUN.sim_id = 42
    server.advance(1)
    out = server.get_status(detail="full")
    assert "detail" not in out
    o2 = next(s for s in out["stores"] if s["name"] == "O2_Store")
    assert "level" in o2 and "capacity" in o2 and "trend" in o2
    assert all({"produced", "consumed", "net"} <= set(b) for b in out["balances"])
    assert all("max" in c for c in out["controllable"])


def test_malfunction_difficulty_injects_at_sol_10():
    client = _fresh()
    server.RUN.difficulty = "malfunctions"
    server.RUN.sim_id = 42
    server.advance(11)
    assert client.malfunctions
    assert client.malfunctions[0][0] == "Grey_Water_Store"


def test_inject_malfunction_tool():
    client = _fresh()
    server.RUN.sim_id = 42
    out = server.inject_malfunction("OGS", "MEDIUM_MALF", "PERMANENT_MALF")
    assert out["malfunction_id"] == 7
    assert client.malfunctions[0] == ("OGS", "MEDIUM_MALF", "PERMANENT_MALF")
