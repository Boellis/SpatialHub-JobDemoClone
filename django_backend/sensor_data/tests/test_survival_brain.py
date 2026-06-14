from sensor_data.survival.bot_brain import BotBrain, ACTION_TOOL_NAME

SNAP = {"stores": [{"name": "O2_Store", "pct": 30.0}], "warnings": [],
        "controllable": [{"module": "OGS", "kind": "consumers", "type": "Power",
                          "max": [1000.0], "desired": [500.0]}]}


class _Tool:
    type = "tool_use"; name = ACTION_TOOL_NAME
    def __init__(self, p): self.input = p
class _Msg:
    def __init__(self, p): self.content = [_Tool(p)]; self.usage = type("U", (), {"input_tokens": 5, "output_tokens": 5})()
class _Client:
    def __init__(self, p): self._p = p; self.messages = self
    def create(self, **k): return _Msg(self._p)


def test_parses_and_clamps():
    b = BotBrain(_Client({"reasoning": "x", "actions": [
        {"module": "OGS", "kind": "consumers", "type": "Power", "desired_rates": [5000.0]}]}), "m")
    out = b.decide(SNAP)
    assert out["actions"][0]["desired_rates"] == [1000.0]


def test_drops_unknown_and_negatives():
    b = BotBrain(_Client({"reasoning": "x", "actions": [
        {"module": "OGS", "kind": "consumers", "type": "Power", "desired_rates": [-5.0]},
        {"module": "NOPE", "kind": "consumers", "type": "Power", "desired_rates": [1.0]}]}), "m")
    out = b.decide(SNAP)
    assert out["actions"][0]["desired_rates"] == [0.0]
    assert all(a["module"] != "NOPE" for a in out["actions"])


def test_tokens_summed():
    b = BotBrain(_Client({"reasoning": "x", "actions": []}), "m"); b.decide(SNAP)
    assert b.tokens_used == 10
