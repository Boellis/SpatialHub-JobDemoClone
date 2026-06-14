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


# ---------------------------------------------------------------------------
# Live-telemetry relay: capture published events WITHOUT touching the network.
# ---------------------------------------------------------------------------

class _Capture:
    """Context manager that swaps server._publish for a recorder and restores it."""

    def __init__(self):
        self.events = []
        self._orig = None

    def __enter__(self):
        self._orig = server._publish
        server._publish = lambda t, d: self.events.append((t, d))
        return self

    def __exit__(self, *exc):
        server._publish = self._orig
        return False


def test_start_run_publishes_run_then_sol():
    _fresh()
    with _Capture() as cap:
        server.start_run(crew_size=15, note="boot")
    assert [t for t, _ in cap.events] == ["run", "sol"]
    run_data = cap.events[0][1]
    assert set(run_data) == {"run_id", "difficulty", "crew_size"}
    assert run_data["run_id"] and run_data["difficulty"] == "off"
    assert run_data["crew_size"] == 15
    sol_data = cap.events[1][1]
    assert sol_data["reasoning"] == "boot"
    assert sol_data["sol"] == 0 and sol_data["alive"] is True


def test_advance_publishes_one_sol_event_per_sol():
    _fresh()
    server.RUN.sim_id = 42
    with _Capture() as cap:
        server.advance(3, note="steady")
    sols = [d for t, d in cap.events if t == "sol"]
    assert len(sols) == 3
    assert [d["reasoning"] for d in sols] == ["steady", "", ""]
    assert [d["sol"] for d in sols] == [1, 2, 3]


def test_advance_to_death_publishes_end_event():
    _fresh(death_tick=48)  # dead after 2 sols
    server.RUN.sim_id = 42
    with _Capture() as cap:
        server.advance(10, note="hold")
    types = [t for t, _ in cap.events]
    assert types == ["sol", "sol", "end"]
    end_data = cap.events[-1][1]
    assert end_data["sols_survived"] == 2
    assert end_data["ended_reason"] == "crew_death"


def test_set_flows_publishes_sol_with_actions():
    _fresh()
    server.RUN.sim_id = 42
    with _Capture() as cap:
        server.set_flows(
            [{"module": "OGS", "kind": "producers", "type": "O2", "rates": [123.0]}],
            note="raise O2")
    sols = [d for t, d in cap.events if t == "sol"]
    assert len(sols) == 1
    sol = sols[0]
    assert sol["reasoning"] == "raise O2"
    assert sol["actions"][0]["desired_rates"] == [123.0]
    assert "rates" not in sol["actions"][0]


def test_publish_is_noop_when_relay_unset(monkeypatch):
    # Relay disabled (env unset by default) -> _publish must never POST.
    monkeypatch.setattr(server, "SURVIVAL_RELAY_URL", "")
    monkeypatch.setattr(server, "SURVIVAL_RELAY_TOKEN", "")

    def _boom(*a, **k):
        raise AssertionError("requests.post must not be called when relay is unset")

    monkeypatch.setattr(server.requests, "post", _boom)
    # Should not raise and should not enqueue / post anything.
    server._publish("sol", {"sol": 1})
    server._publish("run", {"run_id": "x", "difficulty": "off", "crew_size": 15})


# ---------------------------------------------------------------------------
# Run-state persistence + resume (survive context compaction / MCP restart)

def test_save_and_load_state_roundtrip(tmp_path):
    orig = server._STATE_FILE
    server._STATE_FILE = tmp_path / "rs.json"
    try:
        _fresh()
        server.RUN.sim_id = 99
        server.RUN.run_id = "abc"
        server.RUN.sols = 7
        server.RUN.difficulty = "malfunctions"
        server._save_state()
        server.RUN.sim_id = None
        server.RUN.sols = 0
        server._load_state_into(server.RUN)
        assert server.RUN.sim_id == 99
        assert server.RUN.sols == 7
        assert server.RUN.difficulty == "malfunctions"
    finally:
        server._STATE_FILE = orig


def test_resume_run_no_saved_state(tmp_path):
    orig = server._STATE_FILE
    server._STATE_FILE = tmp_path / "none.json"
    try:
        _fresh()
        server.RUN.sim_id = None
        out = server.resume_run()
        assert out["resumed"] is False
        assert "hint" in out
    finally:
        server._STATE_FILE = orig


def test_resume_run_reattaches_to_saved_sim(tmp_path):
    orig = server._STATE_FILE
    server._STATE_FILE = tmp_path / "rs.json"
    try:
        _fresh()
        server.RUN.sim_id = 42
        server.RUN.sols = 12
        server._save_state()
        # Simulate restart: clear in-memory sim, then reload from disk + resume.
        server.RUN.sim_id = None
        server._load_state_into(server.RUN)
        out = server.resume_run()
        assert out["resumed"] is True
        assert out["sim_id"] == 42
        assert out["sols_survived"] == 12
    finally:
        server._STATE_FILE = orig
