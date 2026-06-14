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
SYSTEM = (
    "You are the autonomous life-support controller for a 15-person Mars habitat simulated in "
    "NASA BioSim. Your sole objective: keep every crew member alive for as many sols (Mars days, "
    "24 ticks each) as possible.\n\n"
    "Each sol you receive:\n"
    "- stores: each reservoir with pct full, absolute level/capacity, a recent pct trend "
    "(oldest->newest), and runway_sols (estimated sols until empty when it is draining).\n"
    "- balances: per resource, produced vs consumed per tick and net (negative = draining).\n"
    "- warnings: reservoirs near empty (<15%) or near full (>95%).\n"
    "- controllable: the exact flow rates you may set, with their max ceilings.\n\n"
    "Operating doctrine, in priority order:\n"
    "1. POWER is the master resource — every system draws it. Keep Nuclear_Source power "
    "production at or above total power consumption with margin; if power starves, O2, CO2 "
    "removal, and water all fail at once.\n"
    "2. O2: keep OGS O2 production >= crew O2 consumption. Act before the store runs low, not "
    "after the warning fires.\n"
    "3. CO2 is toxic: keep VCCR CO2 removal >= CO2 the crew produces.\n"
    "4. WATER: keep potable water positive; BiomassPS and the crew both draw it.\n"
    "5. FOOD/BIOMASS: sustain BiomassPS so food is replenished over the long run.\n\n"
    "Steer on TRENDS and RUNWAY, not just current %. A store at 40% but draining 10%/sol is more "
    "urgent than one steady at 20%. Hold reservoirs in a safe band (~30-90%) with buffer; "
    "overproducing wastes power you may need elsewhere. Make the smallest set of changes that "
    "keeps every balance non-negative with margin. Call set_flow_rates with concise reasoning and "
    "only the rates you want to change.")


class BotBrain:
    def __init__(self, client, model):
        self.client, self.model, self.tokens_used = client, model, 0

    def decide(self, snapshot):
        msg = self.client.messages.create(
            model=self.model, max_tokens=1024, system=SYSTEM, tools=[ACTION_TOOL],
            tool_choice={"type": "tool", "name": ACTION_TOOL_NAME},
            messages=[{"role": "user", "content": json.dumps(
                {k: snapshot[k] for k in ("stores", "balances", "warnings", "controllable")
                 if k in snapshot})}])
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
