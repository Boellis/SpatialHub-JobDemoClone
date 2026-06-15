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
    assert set(run_data) == {"run_id", "difficulty", "crew_size", "pilot"}
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


def test_poll_command_noop_when_relay_unset(monkeypatch):
    monkeypatch.setattr(server, "SURVIVAL_RELAY_URL", "")
    monkeypatch.setattr(server, "SURVIVAL_RELAY_TOKEN", "")

    def _boom(*a, **k):
        raise AssertionError("requests.get must not be called when relay is unset")

    monkeypatch.setattr(server.requests, "get", _boom)
    assert server.poll_command()["command"] is None


def test_poll_command_returns_pending(monkeypatch):
    monkeypatch.setattr(server, "SURVIVAL_RELAY_URL", "http://relay")
    monkeypatch.setattr(server, "SURVIVAL_RELAY_TOKEN", "tok")
    import types
    monkeypatch.setattr(server.requests, "get",
                        lambda *a, **k: types.SimpleNamespace(
                            status_code=200, json=lambda: {"command": "new_session"}))
    assert server.poll_command()["command"] == "new_session"


def test_poll_command_flags_stale_token_on_401(monkeypatch):
    monkeypatch.setattr(server, "SURVIVAL_RELAY_URL", "http://relay")
    monkeypatch.setattr(server, "SURVIVAL_RELAY_TOKEN", "stale")
    import types
    monkeypatch.setattr(server.requests, "get",
                        lambda *a, **k: types.SimpleNamespace(status_code=401, json=lambda: {}))
    out = server.poll_command()
    assert out["command"] is None
    assert "stale" in out["error"].lower()


def test_poll_command_swallows_network_error(monkeypatch):
    monkeypatch.setattr(server, "SURVIVAL_RELAY_URL", "http://relay")
    monkeypatch.setattr(server, "SURVIVAL_RELAY_TOKEN", "tok")

    def _raise(*a, **k):
        raise OSError("connection refused")

    monkeypatch.setattr(server.requests, "get", _raise)
    out = server.poll_command()
    assert out["command"] is None
    assert "error" in out


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
# Habitat plan: farm layout + crew food plan (Claude-generated, published as `plan`)

def test_generate_farm_layout_computes_totals_and_feeds_crew():
    _fresh()
    with _Capture() as cap:
        out = server.generate_farm_layout(crops=[
            {"crop": "Potato", "area_m2": 60, "yield_kcal_per_day": 22000,
             "zone": "Grow Bay A", "purpose": "calorie staple"},
            {"crop": "Soybean", "area_m2": 40, "yield_kcal_per_day": 19000},
        ], crew_size=15)
    assert out["total_area_m2"] == 100.0
    assert out["total_kcal_per_day"] == 41000
    assert out["crew_kcal_need_per_day"] == 15 * 2700      # 40500
    assert out["feeds_crew"] is True                        # 41000 >= 40500
    assert out["crops"][0]["crop"] == "Potato"
    assert out["crops"][1]["zone"] == "Grow Bay"            # default filled
    plan = [d for t, d in cap.events if t == "plan"]
    assert len(plan) == 1 and plan[0]["farm_layout"]["total_kcal_per_day"] == 41000
    assert plan[0]["food_plan"] is None


def test_generate_farm_layout_flags_shortfall():
    _fresh()
    out = server.generate_farm_layout(
        crops=[{"crop": "Lettuce", "area_m2": 10, "yield_kcal_per_day": 1000}], crew_size=15)
    assert out["feeds_crew"] is False                       # 1000 < 40500


def test_generate_food_plan_sums_and_meets_target():
    _fresh()
    with _Capture() as cap:
        out = server.generate_food_plan(meals=[
            {"meal": "Breakfast", "items": ["Porridge", "Soy milk"], "kcal": 700, "protein_g": 20},
            {"meal": "Lunch", "items": ["Bean stew"], "kcal": 1100, "protein_g": 40},
            {"meal": "Dinner", "items": ["Potato mash"], "kcal": 1000, "protein_g": 25},
        ], crew_size=15)
    assert out["total_kcal_per_day"] == 2800
    assert out["total_protein_g"] == 85
    assert out["meets_target"] is True                      # 2800 >= 2700
    assert out["meals"][0]["items"] == ["Porridge", "Soy milk"]
    plan = [d for t, d in cap.events if t == "plan"]
    assert plan[0]["food_plan"]["total_kcal_per_day"] == 2800


def test_farm_and_food_merge_into_one_plan_slot():
    _fresh()
    server.generate_farm_layout(
        crops=[{"crop": "Potato", "area_m2": 60, "yield_kcal_per_day": 41000}], crew_size=15)
    with _Capture() as cap:
        server.generate_food_plan(meals=[{"meal": "Dinner", "items": ["Mash"], "kcal": 2800}], crew_size=15)
    plan = [d for t, d in cap.events if t == "plan"][0]
    # The food-plan call still carries the earlier farm layout — one merged slot.
    assert plan["farm_layout"] is not None and plan["food_plan"] is not None


def test_start_run_clears_prior_plan():
    _fresh()
    server.generate_food_plan(meals=[{"meal": "D", "items": ["x"], "kcal": 1}], crew_size=15)
    assert server.RUN.food_plan is not None
    server.start_run(crew_size=15)                          # fresh run wipes the plan
    assert server.RUN.farm_layout is None and server.RUN.food_plan is None


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


# ---------------------------------------------------------------------------
# Pilot-context gauge

def test_pilot_context_tracks_and_resets():
    _fresh()
    server._reset_session()
    server.RUN.sim_id = 42
    # each tool call bumps tool_calls and est_tokens
    server.get_status()
    server.advance(2)
    s = server._pilot_stat()
    assert s["tool_calls"] >= 2
    assert s["est_tokens"] > 0
    assert s["budget"] == server._CONTEXT_BUDGET
    # resume_run resets the gauge (post-compaction boundary)
    server.resume_run()
    assert server._SESSION["tool_calls"] <= 1   # only resume_run's own call counted
    # start_run also resets it
    server.start_run(crew_size=15)
    assert server._SESSION["tool_calls"] <= 1


def test_sol_event_carries_pilot_stat():
    client = _fresh()
    server.RUN.sim_id = 42
    raw = client.get_state(42)
    ev = server._sol_event(raw, "note")
    assert "pilot" in ev and "est_tokens" in ev["pilot"] and "budget" in ev["pilot"]


def test_status_payload_includes_guardrail_violations(monkeypatch, tmp_path):
    import server
    import doctrine
    # Use a throwaway doctrine file so the test doesn't write the repo's real one.
    monkeypatch.setattr(doctrine, "_DOCTRINE_FILE", tmp_path / "doctrine.json")
    monkeypatch.setattr(doctrine, "_MIRROR_FILE", tmp_path / "doctrine.md")
    doctrine.save(doctrine.bootstrap())

    class FakeClient:
        def get_state(self, sim_id):
            return {"_fake": True}

    monkeypatch.setattr(server.RUN, "client", FakeClient())
    monkeypatch.setattr(server.RUN, "sim_id", 1)
    monkeypatch.setattr(server, "summarize_state", lambda raw: {
        "ended": False,
        "warnings": [],
        "stores": [
            {"name": "Potable_Water_Store", "pct": 0.0},
            {"name": "O2_Store", "pct": 100.0},
        ],
        "balances": [],
        "controllable": [],
    })

    payload = server._status_payload("normal")
    stores = {v["store"] for v in payload["guardrail_violations"]}
    assert "Potable_Water_Store" in stores
    assert "O2_Store" not in stores


def test_record_reserve_updates_min_and_below_floor(monkeypatch, tmp_path):
    import server, doctrine
    monkeypatch.setattr(doctrine, "_DOCTRINE_FILE", tmp_path / "doctrine.json")
    monkeypatch.setattr(doctrine, "_MIRROR_FILE", tmp_path / "doctrine.md")
    doctrine.save(doctrine.bootstrap())
    server.RUN.reset("off")
    # sol 1: potable healthy (>= 30 floor)
    server._record_reserve([{"name": "Potable_Water_Store", "pct": 60.0}])
    # sol 2: potable below 30 floor
    server._record_reserve([{"name": "Potable_Water_Store", "pct": 12.0}])
    assert server.RUN.reserve_min["Potable_Water_Store"] == 12.0
    assert server.RUN.sols_below_floor["Potable_Water_Store"] == 1
