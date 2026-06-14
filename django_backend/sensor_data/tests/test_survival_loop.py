from sensor_data.survival.loop import run_survival, TICKS_PER_SOL
from sensor_data.survival.state import summarize_state


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

def _alive_state(sol):
    """BioSim-style state snapshot that is alive."""
    return {
        "modules": {
            "O2_Store": {"properties": {"currentLevel": 50.0, "currentCapacity": 100.0}},
            "OGS": {"consumers": [
                {"type": "Power", "rates": {"desiredFlowRates": [500.0]}}]},
        },
        "_sol": sol,
    }


def _dead_state():
    state = _alive_state(99)
    state["crewDead"] = True
    return state


class FakeClient:
    """Fake BioSim control client that dies after `die_after` sols."""

    def __init__(self, die_after=None):
        self.die_after = die_after
        self.started = False
        self.set_flows_calls = []
        self.tick_calls = []
        self.malfunctions = []
        self._sol = 0
        self._get_count = 0

    def start_sim(self, config_xml):
        self.started = True
        return 7

    def get_state(self, sim_id):
        # Each sol calls get_state twice (pre + post). Use total ticks as the
        # crew-death trigger: die once the post-tick sol count hits die_after.
        self._get_count += 1
        if self.die_after is not None and self._sol >= self.die_after:
            return _dead_state()
        return _alive_state(self._sol)

    def set_flows(self, sim_id, module, kind, flow_type, desired_rates):
        self.set_flows_calls.append((sim_id, module, kind, flow_type, desired_rates))

    def tick(self, sim_id, n=1):
        self.tick_calls.append((sim_id, n))
        self._sol += 1

    def add_malfunction(self, sim_id, module, **kw):
        self.malfunctions.append((sim_id, module))
        return 1


class FakeBrain:
    def __init__(self):
        self.tokens_used = 0
        self.calls = 0

    def decide(self, snapshot):
        self.calls += 1
        return {
            "reasoning": f"sol decision {self.calls}",
            "actions": [
                {"module": "OGS", "kind": "consumers", "type": "Power",
                 "desired_rates": [800.0]}],
        }


# ---------------------------------------------------------------------------
# loop tests
# ---------------------------------------------------------------------------

def test_event_order_start_sols_end():
    client = FakeClient(die_after=3)
    brain = FakeBrain()
    events = list(run_survival(client, brain, "<x/>", max_sols=200))

    assert events[0]["type"] == "start"
    assert events[-1]["type"] == "end"
    middle = events[1:-1]
    assert all(e["type"] == "sol" for e in middle)
    # Sol numbers are sequential 1..N
    assert [e["data"]["sol"] for e in middle] == list(range(1, len(middle) + 1))


def test_set_flows_applied_each_sol():
    client = FakeClient(die_after=3)
    brain = FakeBrain()
    events = list(run_survival(client, brain, "<x/>", max_sols=200))
    sols = [e for e in events if e["type"] == "sol"]
    # One set_flows call per sol (FakeBrain returns one action).
    assert len(client.set_flows_calls) == len(sols)
    assert client.set_flows_calls[0][1] == "OGS"


def test_tick_24_per_sol():
    client = FakeClient(die_after=2)
    brain = FakeBrain()
    list(run_survival(client, brain, "<x/>", max_sols=200))
    assert all(call[1] == TICKS_PER_SOL for call in client.tick_calls)


def test_each_sol_event_includes_modules():
    client = FakeClient(die_after=3)
    brain = FakeBrain()
    events = list(run_survival(client, brain, "<x/>", max_sols=200))
    sols = [e for e in events if e["type"] == "sol"]
    assert sols
    for e in sols:
        assert "modules" in e["data"]
        assert isinstance(e["data"]["modules"], dict)


def test_end_reason_crew_death():
    client = FakeClient(die_after=2)
    brain = FakeBrain()
    events = list(run_survival(client, brain, "<x/>", max_sols=200))
    assert events[-1]["data"]["ended_reason"] == "crew_death"
    assert events[-1]["data"]["ended_reason"] in {
        "crew_death", "sol_cap", "token_budget", "stopped"}


def test_end_reason_sol_cap():
    client = FakeClient(die_after=None)
    brain = FakeBrain()
    events = list(run_survival(client, brain, "<x/>", max_sols=3))
    assert events[-1]["data"]["ended_reason"] == "sol_cap"
    assert events[-1]["data"]["sols_survived"] == 3


def test_end_reason_token_budget():
    client = FakeClient(die_after=None)
    brain = FakeBrain()
    brain.tokens_used = 999999
    events = list(run_survival(client, brain, "<x/>", max_sols=200,
                               token_budget=100))
    assert events[-1]["data"]["ended_reason"] == "token_budget"


def test_end_reason_stopped():
    client = FakeClient(die_after=None)
    brain = FakeBrain()
    events = list(run_survival(client, brain, "<x/>", max_sols=200,
                               cancel=lambda: True))
    assert events[-1]["data"]["ended_reason"] == "stopped"


def test_malfunctions_difficulty_injects():
    client = FakeClient(die_after=None)
    brain = FakeBrain()
    list(run_survival(client, brain, "<x/>", max_sols=11,
                      difficulty="malfunctions"))
    # malfunction injected at sol 10 (sol>0 and sol%10==0)
    assert client.malfunctions
    assert client.malfunctions[0][1] == "Grey_Water_Store"


# ---------------------------------------------------------------------------
# summarize_state tests
# ---------------------------------------------------------------------------

def test_summarize_state_detects_crew_death():
    assert summarize_state(_dead_state())["ended"] is True
    assert summarize_state(_alive_state(1))["ended"] is False


def test_summarize_state_builds_controllable_from_map():
    raw = {"modules": {
        "Nuclear_Source": {"producers": [
            {"type": "Power", "rates": {"desiredFlowRates": [2000.0]}}]},
        "OGS": {
            "consumers": [{"type": "Power", "rates": {"desiredFlowRates": [500.0]}}],
            "producers": [{"type": "O2", "rates": {"desiredFlowRates": [300.0]}}],
        },
    }}
    snap = summarize_state(raw)
    idx = {(c["module"], c["kind"], c["type"]): c for c in snap["controllable"]}
    assert idx[("Nuclear_Source", "producers", "Power")]["max"] == [3000.0]
    assert idx[("OGS", "consumers", "Power")]["max"] == [1000.0]
    assert idx[("OGS", "producers", "O2")]["max"] == [1000.0]


def test_summarize_state_stores_pct():
    raw = {"modules": {
        "O2_Store": {"properties": {"currentLevel": 30.0, "currentCapacity": 100.0}}}}
    snap = summarize_state(raw)
    o2 = next(s for s in snap["stores"] if s["name"] == "O2_Store")
    assert o2["pct"] == 30.0


# ---------------------------------------------------------------------------
# telemetry: balances, absolute levels, runway, trend
# ---------------------------------------------------------------------------

def test_balances_net_from_actual_flow():
    raw = {"modules": {
        "OGS": {"producers": [{"type": "O2", "rates": {"actualFlowRates": [800.0]}}]},
        "Crew_Quarters_Group": {
            "consumers": [{"type": "O2", "rates": {"actualFlowRates": [900.0]}}]},
    }}
    o2 = next(b for b in summarize_state(raw)["balances"] if b["resource"] == "O2")
    assert o2["produced"] == 800.0
    assert o2["consumed"] == 900.0
    assert o2["net"] == -100.0  # deficit -> O2 draining


def test_stores_include_level_and_capacity():
    raw = {"modules": {
        "O2_Store": {"properties": {"currentLevel": 30.0, "currentCapacity": 120.0}}}}
    o2 = next(s for s in summarize_state(raw)["stores"] if s["name"] == "O2_Store")
    assert o2["level"] == 30.0
    assert o2["capacity"] == 120.0


def test_runway_sols_when_draining():
    # O2 store 240 units, net -10/tick -> 24 ticks -> 1.0 sol of runway.
    raw = {"modules": {
        "O2_Store": {"properties": {"currentLevel": 240.0, "currentCapacity": 1000.0}},
        "OGS": {"producers": [{"type": "O2", "rates": {"actualFlowRates": [0.0]}}]},
        "Crew_Quarters_Group": {
            "consumers": [{"type": "O2", "rates": {"actualFlowRates": [10.0]}}]},
    }}
    o2 = next(s for s in summarize_state(raw)["stores"] if s["name"] == "O2_Store")
    assert o2["runway_sols"] == 1.0


def test_no_runway_when_not_draining():
    raw = {"modules": {
        "O2_Store": {"properties": {"currentLevel": 240.0, "currentCapacity": 1000.0}},
        "OGS": {"producers": [{"type": "O2", "rates": {"actualFlowRates": [50.0]}}]},
        "Crew_Quarters_Group": {
            "consumers": [{"type": "O2", "rates": {"actualFlowRates": [10.0]}}]},
    }}
    o2 = next(s for s in summarize_state(raw)["stores"] if s["name"] == "O2_Store")
    assert "runway_sols" not in o2  # surplus -> filling, not draining


def test_loop_attaches_growing_trend_to_stores():
    seen = []

    class RecBrain(FakeBrain):
        def decide(self, snapshot):
            # capture the per-store trend the bot actually sees this sol
            o2 = next(s for s in snapshot["stores"] if s["name"] == "O2_Store")
            seen.append(list(o2["trend"]))
            return super().decide(snapshot)

    client = FakeClient(die_after=4)
    list(run_survival(client, RecBrain(), "<x/>", max_sols=200))
    assert seen[0] == [50.0]                     # first sol: one sample
    assert seen[-1] == [50.0] * len(seen)        # grows one sample per sol
