import json

ACTION_TOOL_NAME = "set_flow_rates"
ACTION_TOOL = {
    "name": ACTION_TOOL_NAME,
    "description": "Adjust BioSim flow rates to keep the Mars crew alive as long as possible.",
    "input_schema": {"type": "object", "properties": {
        "reasoning": {"type": "string"},
        "actions": {"type": "array", "items": {"type": "object", "properties": {
            "module": {"type": "string"},
            "kind": {"type": "string", "enum": ["consumers", "producers"]},
            "type": {"type": "string"},
            "desired_rates": {"type": "array", "items": {"type": "number"}}},
            "required": ["module", "kind", "type", "desired_rates"]}}},
        "required": ["reasoning", "actions"]}}
SYSTEM = ("You are the autonomous life-support controller for a Mars habitat (BioSim). Each sol "
          "you get store levels (% full), sensor warnings, and the flow rates you may change. "
          "Keep the crew alive as many sols as possible. Call set_flow_rates with concise "
          "reasoning and only the changes you want.")


class BotBrain:
    def __init__(self, client, model):
        self.client, self.model, self.tokens_used = client, model, 0

    def decide(self, snapshot):
        msg = self.client.messages.create(
            model=self.model, max_tokens=1024, system=SYSTEM, tools=[ACTION_TOOL],
            tool_choice={"type": "tool", "name": ACTION_TOOL_NAME},
            messages=[{"role": "user", "content": json.dumps(
                {k: snapshot[k] for k in ("stores", "warnings", "controllable")})}])
        u = getattr(msg, "usage", None)
        if u:
            self.tokens_used += getattr(u, "input_tokens", 0) + getattr(u, "output_tokens", 0)
        payload = {"reasoning": "", "actions": []}
        for b in msg.content:
            if getattr(b, "type", None) == "tool_use" and b.name == ACTION_TOOL_NAME:
                payload = b.input
                break
        return {"reasoning": payload.get("reasoning", ""),
                "actions": self._validate(payload.get("actions", []), snapshot)}

    @staticmethod
    def _validate(actions, snapshot):
        idx = {(c["module"], c["kind"], c["type"]): c for c in snapshot["controllable"]}
        out = []
        for a in actions:
            key = (a.get("module"), a.get("kind"), a.get("type"))
            ctrl = idx.get(key)
            if not ctrl:
                continue
            maxes = ctrl.get("max") or []
            rates = []
            for i, r in enumerate(a.get("desired_rates", [])):
                hi = maxes[i] if i < len(maxes) else r
                rates.append(max(0.0, min(float(r), float(hi))))
            out.append({"module": key[0], "kind": key[1], "type": key[2], "desired_rates": rates})
        return out
