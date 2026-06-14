# Habitat Survival Bot — Implementation Plan (v3.0-grounded)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Structured for **Workflow (multi-agent) orchestration** — see "Workflow Orchestration Map".

**Goal:** Add a "Habitat Survival" tab where an autonomous Claude bot drives a fresh BioSim sim and survives as many sols as possible, streamed via Django SSE and visualized by **reusing** the existing habitat zone store + components.

**Architecture:** `SurvivalView` opens an `EventSource` to a new Django SSE endpoint. Django runs a per-sol loop: read BioSim → Claude (tool-use, server-clamped) → apply flows (+optional malfunctions) → tick ×24 → yield `{sol, alive, modules, reasoning, actions}`. The tab feeds each event's `modules` through the existing `mapBioSimToHabitatReadings` into `useHabitatStore.tick()`, rendering the existing `ZonePanel`/`HabitatHUD`/`AlertBanner`, plus a SOL counter + bot-reasoning overlay.

**Tech Stack:** Django 5.2 + DRF, `requests` (already in stack — matches `control_loop.py`), `anthropic` SDK, React 19 + TS + Vite + Vitest, native `EventSource`, Zustand. BioSim VM `34.66.244.62:8009`.

**Spec:** `docs/superpowers/specs/2026-06-13-habitat-survival-bot-design.md`
**Branch:** `feat/survival-bot` (off `v3.0`).

---

## ⚠️ Prerequisite P0 — BLOCKER (infra; blocks live integration only)

Fresh-sim start on the VM returns `No space left on device` (disk full). Clear `/app/logs`,
disable tick-logging, or resize the disk. **Unit tests + the full build do NOT need P0** (Claude
+ BioSim are mocked). Only Task 16 (live) does.
Verify cleared: `curl -s -X POST http://34.66.244.62:8009/api/simulation/start -H "Content-Type: text/plain" --data-binary @django_backend/sensor_data/survival/configs/survival.biosim` → `{"simId":N}`.

---

## Task 0 — Confirm reuse surfaces (read-only, do first; no commit)

Before writing code, confirm these by reading the v3.0 tree (paths relative to repo root):
- [ ] `spatialhub-frontend/src/store/habitatStore.ts` — confirm `tick(readings)` signature and
  that `ZonePanel`/`HabitatHUD`/`AlertBanner` read zone state from `useHabitatStore` (so feeding
  `tick()` is sufficient to render them). Note any required `startSimulation()` lifecycle.
- [ ] `spatialhub-frontend/src/components/habitat/{ZonePanel,HabitatHUD,AlertBanner}.tsx` —
  confirm props (store-driven vs prop-driven). If prop-driven, pass the mapped zone state.
- [ ] `spatialhub-frontend/src/simulation/biosimMapper.ts` — `mapBioSimToHabitatReadings(modules, ts?, history?)` (already confirmed).
- [ ] `django_backend/sensor_data/biosim_ingest.py` — reuse `discover_sim_id` (REST helpers).
- [ ] `django_backend/sensor_data/management/commands/control_loop.py` — reuse malfunction
  POST/DELETE shape (`{"intensity":"SEVERE_MALF","length":"TEMPORARY_MALF"}` → `malfunctionID`).
- [ ] `django_backend/spatialhub_backend/settings.py` — confirm `INSTALLED_APPS`, env pattern;
  `BIOSIM_URL` already referenced by `control_loop`.
- [ ] Live: confirm flow-update body shape:
  `curl -s -X POST "http://34.66.244.62:8009/api/simulation/1/modules/OGS/consumers/Power" -H "Content-Type: application/json" -d '{"desiredFlowRates":[900]}'`. Adjust `set_flows` if rejected.

If any reuse assumption is wrong, note it in the task you're about to do and adapt the code.

---

## Workflow Orchestration Map

```
Task 0  reuse confirmation        [read-only, must run first]
Task 1  backend scaffold + deps   [sequential foundation]
  ├── BACKEND TRACK
  │     Task 2 biosim_control ─┐
  │     Task 3 config         ├─→ Task 5 loop ─→ Task 6 views+urls+registry
  │     Task 4 bot_brain  ────┘
  └── FRONTEND TRACK (independent; builds to SSE contract)
        Task 10 api/survival.ts (types) ─┐
        Task 11 survivalZone helper ─────┼─→ Task 12 SurvivalView ─→ Task 13 App wiring
Task 16 INTEGRATION (needs all + P0)     [sequential join]
```

**Workflow stages:**
- **Stage 1 (1 agent):** Task 1 scaffold.
- **Stage 2 (parallel, ~5 agents):** Tasks 2, 3, 4 (backend leaves) ‖ 10, 11 (frontend leaves) — disjoint files, no worktree isolation needed.
- **Stage 3 (parallel ×2):** Task 5→6 (backend join) ‖ Task 12 (page join).
- **Stage 4 (sequential):** Task 13 wiring → Task 16 live.

---

## BACKEND TRACK

### Task 1: Scaffold survival package + deps (Stage 1)

**Files:** Create `django_backend/sensor_data/survival/__init__.py`; Modify `requirements.txt`, `settings.py`.

- [ ] **Step 1: deps** — append to `requirements.txt`:
```
anthropic
```
(`requests` is already present — reuse it; do NOT add httpx.)

- [ ] **Step 2: package** — create empty `django_backend/sensor_data/survival/__init__.py`.

- [ ] **Step 3: settings** — in `settings.py`, after existing config add:
```python
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
SURVIVAL_BIOSIM_URL = os.environ.get("BIOSIM_URL", "http://34.66.244.62:8009")
SURVIVAL_MAX_SOLS = int(os.environ.get("BIOSIM_MAX_SOLS", "200"))
SURVIVAL_TOKEN_BUDGET = int(os.environ.get("BIOSIM_TOKEN_BUDGET", "200000"))
SURVIVAL_CREW_SIZE = int(os.environ.get("BIOSIM_CREW_SIZE", "15"))
```
(Confirm `import os` exists at top of settings.py; it does.)

- [ ] **Step 4: verify** — `cd django_backend && python manage.py check` → no issues.

- [ ] **Step 5: commit**
```bash
git add django_backend/sensor_data/survival/__init__.py requirements.txt django_backend/spatialhub_backend/settings.py
git commit -m "feat(survival): scaffold survival package, anthropic dep, settings"
```

---

### Task 2: BioSim control client (Stage 2)

**Files:** Create `django_backend/sensor_data/survival/biosim_control.py`; Test `django_backend/sensor_data/tests/test_survival_control.py`.

Reuses `requests` (like `control_loop.py`). Wraps: start sim, get state, set flows, tick, malfunction.

- [ ] **Step 1: failing test**
```python
from unittest import mock
from sensor_data.survival.biosim_control import BiosimControl, BiosimError


@mock.patch("sensor_data.survival.biosim_control.requests")
def test_start_sim_returns_id(mreq):
    mreq.post.return_value = mock.Mock(status_code=200, content=b"{}",
                                       json=lambda: {"simId": 5}, raise_for_status=lambda: None)
    c = BiosimControl("http://fake:8009")
    assert c.start_sim("<biosim/>") == 5
    assert mreq.post.call_args.kwargs["headers"]["Content-Type"] == "text/plain"


@mock.patch("sensor_data.survival.biosim_control.requests")
def test_start_sim_raises_on_error_payload(mreq):
    mreq.post.return_value = mock.Mock(status_code=200, content=b"{}",
                                       json=lambda: {"error": "No space left"}, raise_for_status=lambda: None)
    c = BiosimControl("http://fake:8009")
    try:
        c.start_sim("<x/>"); assert False
    except BiosimError as e:
        assert "No space" in str(e)


@mock.patch("sensor_data.survival.biosim_control.requests")
def test_set_flows_posts_to_module_endpoint(mreq):
    mreq.post.return_value = mock.Mock(status_code=200, content=b"{}", json=lambda: {}, raise_for_status=lambda: None)
    BiosimControl("http://fake:8009").set_flows(5, "OGS", "consumers", "Power", [800.0])
    url = mreq.post.call_args.args[0]
    assert url.endswith("/api/simulation/5/modules/OGS/consumers/Power")
    assert mreq.post.call_args.kwargs["json"] == {"desiredFlowRates": [800.0]}


@mock.patch("sensor_data.survival.biosim_control.requests")
def test_tick_calls_endpoint_n_times(mreq):
    mreq.post.return_value = mock.Mock(status_code=200, content=b"", raise_for_status=lambda: None)
    BiosimControl("http://fake:8009").tick(5, 24)
    assert mreq.post.call_count == 24
```

- [ ] **Step 2: run → fail** — `cd django_backend && pytest sensor_data/tests/test_survival_control.py -v` → ModuleNotFound.

- [ ] **Step 3: implement** `django_backend/sensor_data/survival/biosim_control.py`:
```python
import requests


class BiosimError(Exception):
    pass


class BiosimControl:
    """BioSim REST control for survival runs. Mirrors control_loop.py's requests usage."""

    def __init__(self, base_url: str, timeout: float = 30.0):
        self.base = base_url.rstrip("/")
        self.timeout = timeout

    def start_sim(self, config_xml: str) -> int:
        r = requests.post(f"{self.base}/api/simulation/start",
                          data=config_xml.encode("utf-8"),
                          headers={"Content-Type": "text/plain"}, timeout=self.timeout)
        r.raise_for_status()
        data = r.json()
        if "simId" not in data:
            raise BiosimError(f"start failed: {data}")
        return int(data["simId"])

    def get_state(self, sim_id: int) -> dict:
        r = requests.get(f"{self.base}/api/simulation/{sim_id}", timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def set_flows(self, sim_id, module, kind, flow_type, desired_rates):
        r = requests.post(
            f"{self.base}/api/simulation/{sim_id}/modules/{module}/{kind}/{flow_type}",
            json={"desiredFlowRates": list(desired_rates)}, timeout=self.timeout)
        r.raise_for_status()
        return r.json() if r.content else {}

    def tick(self, sim_id, n=1):
        for _ in range(n):
            r = requests.post(f"{self.base}/api/simulation/{sim_id}/tick", timeout=self.timeout)
            r.raise_for_status()

    def add_malfunction(self, sim_id, module, intensity="SEVERE_MALF", length="TEMPORARY_MALF"):
        r = requests.post(
            f"{self.base}/api/simulation/{sim_id}/modules/{module}/malfunctions",
            json={"intensity": intensity, "length": length}, timeout=self.timeout)
        r.raise_for_status()
        return r.json().get("malfunctionID")
```

- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** `feat(survival): add BioSim control client (reuses requests stack)`.
- [ ] **Step 6 (live, P0 or sim 1):** confirm `set_flows` body shape via the Task 0 curl; adjust + recommit if needed.

---

### Task 3: Survival config (Stage 2)

**Files:** Create `django_backend/sensor_data/survival/configs/survival.biosim`, `survival/config.py`; Test `tests/test_survival_config.py`.

- [ ] **Step 1:** add `configs/survival.biosim` = `configuration/default.biosim` from
  `github.com/scottbell/biosim` with `<Globals ... runTillCrewDeath="true" ...>` and the single
  `<crewPerson>` left as a marker. (`curl -s https://raw.githubusercontent.com/scottbell/biosim/main/configuration/default.biosim`.)

- [ ] **Step 2: failing test**
```python
from sensor_data.survival.config import build_survival_config


def test_run_till_crew_death_true():
    assert 'runTillCrewDeath="true"' in build_survival_config(15)


def test_injects_crew_count():
    assert build_survival_config(15).count("<crewPerson") == 15


def test_includes_specialists():
    xml = build_survival_config(15)
    assert "Food Systems Engineer" in xml and "Nutrition Specialist" in xml
```

- [ ] **Step 3: run → fail.**
- [ ] **Step 4: implement** `survival/config.py`:
```python
import re
from pathlib import Path

CONFIG = Path(__file__).parent / "configs" / "survival.biosim"
_SCHED = ('<schedule><activity intensity="2" name="leisure" length="12"/>'
          '<activity intensity="0" name="sleep" length="8"/>'
          '<activity intensity="4" name="work" length="4"/></schedule>')


def _person(name, age, sex, weight):
    return f'<crewPerson age="{age}" name="{name}" sex="{sex}" weight="{weight}">{_SCHED}</crewPerson>'


def _crew(n):
    ppl = [("Food Systems Engineer", 42, "FEMALE", 68), ("Nutrition Specialist", 38, "MALE", 80)]
    for i in range(len(ppl), n):
        ppl.append((f"Crew {i+1}", 30 + (i % 20), "FEMALE" if i % 2 else "MALE", 65 + (i % 25)))
    return "".join(_person(*p) for p in ppl[:n])


def build_survival_config(crew_size: int = 15) -> str:
    xml = CONFIG.read_text()
    xml = re.sub(r'runTillCrewDeath="[^"]*"', 'runTillCrewDeath="true"', xml)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", _crew(crew_size), xml, count=1, flags=re.DOTALL)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", "", xml, flags=re.DOTALL)
    return xml
```

- [ ] **Step 5: run → pass.**
- [ ] **Step 6: commit** `feat(survival): add survival config builder (15 crew, runTillCrewDeath)`.

---

### Task 4: Bot brain (Stage 2)

**Files:** Create `django_backend/sensor_data/survival/bot_brain.py`; Test `tests/test_survival_brain.py`.

> Invoke the `claude-api` skill before writing — confirm SDK tool-use shape + model id.

Controllable surfaces (server-clamped): `Nuclear_Source` producers/Power(3000); `OGS`
consumers/Power(1000),producers/O2(1000); `VCCR` consumers/Power(1000),producers/CO2(1000);
`BiomassPS` consumers/Power(400),consumers/PotableWater(100),producers/Biomass(100);
`Crew_Quarters_Group` consumers/Food(5),consumers/PotableWater(3).

- [ ] **Step 1: failing test** (Claude client injected + faked) — identical structure to the
  earlier draft's `test_bot_brain.py`: assert reasoning+actions parsed, rates clamped to the
  surface `max`, negatives→0, unknown modules dropped, token usage summed. Build `CONTROLLABLE`
  from the live state snapshot (module/kind/type/max), exactly as below.

```python
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
```

- [ ] **Step 2: run → fail.**
- [ ] **Step 3: implement** `survival/bot_brain.py` — same `BotBrain` as the earlier draft
  (tool schema `set_flow_rates`; `decide()` calls `client.messages.create(...)`, extracts the
  `tool_use` block, `_validate()` clamps each rate to the matching `controllable.max` and drops
  unknown surfaces; sums `usage.input_tokens+output_tokens` into `self.tokens_used`). Reproduce
  the full implementation from `docs/superpowers/specs` history or write fresh per the schema.

```python
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
```

- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** `feat(survival): add Claude bot brain with server-side clamping`.

---

### Task 5: Survival loop generator (Stage 3 — needs 2,3,4)

**Files:** Create `django_backend/sensor_data/survival/loop.py`; Test `tests/test_survival_loop.py`.

`summarize_state(modules)` lives here (or a small `survival/state.py`): from a BioSim state,
produce `{ended, stores[pct], warnings[status], controllable[module/kind/type/max/desired]}`
using the confirmed module map. Events carry the **raw `modules`** too (frontend maps them).

- [ ] **Step 1: failing test** — fake client (dies after N sols) + fake brain; assert event
  order `start … sol×N … end`, `set_flows` applied each sol, `tick(24)` per sol, and
  `ended_reason ∈ {crew_death, sol_cap, token_budget, stopped}`. (Same shape as earlier draft's
  `test_survival_loop.py`, with the added assertion that each `sol` event includes `modules`.)
- [ ] **Step 2: run → fail.**
- [ ] **Step 3: implement** `survival/loop.py`:
```python
from .state import summarize_state  # or inline summarize in this module

TICKS_PER_SOL = 24


def _ev(t, d):
    return {"type": t, "data": d}


def run_survival(client, brain, config_xml, max_sols=200, token_budget=None,
                 difficulty="off", malfunction_module="Grey_Water_Store",
                 cancel=lambda: False):
    sim_id = client.start_sim(config_xml)
    yield _ev("start", {"sim_id": sim_id, "max_sols": max_sols})
    sol, reason = 0, "sol_cap"
    while sol < max_sols:
        if cancel():
            reason = "stopped"; break
        raw = client.get_state(sim_id)
        snap = summarize_state(raw)
        if snap["ended"]:
            reason = "crew_death"; break
        decision = brain.decide(snap)
        for a in decision["actions"]:
            client.set_flows(sim_id, a["module"], a["kind"], a["type"], a["desired_rates"])
        if difficulty == "malfunctions" and sol > 0 and sol % 10 == 0:
            try:
                client.add_malfunction(sim_id, malfunction_module)
            except Exception:
                pass
        client.tick(sim_id, TICKS_PER_SOL)
        sol += 1
        raw = client.get_state(sim_id)
        snap = summarize_state(raw)
        alive = not snap["ended"]
        yield _ev("sol", {"sol": sol, "alive": alive, "modules": raw.get("modules", {}),
                          "reasoning": decision["reasoning"], "actions": decision["actions"],
                          "warnings": snap["warnings"]})
        if not alive:
            reason = "crew_death"; break
        if token_budget is not None and getattr(brain, "tokens_used", 0) >= token_budget:
            reason = "token_budget"; break
    yield _ev("end", {"sols_survived": sol, "ended_reason": reason})
```
Also create `survival/state.py` with `summarize_state(raw)` (CONTROLLABLE map + WARN_STATUSES,
as in the earlier draft's `state.py`, returning `ended/stores/warnings/controllable`).

- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** `feat(survival): add per-sol loop + state summarizer`.

---

### Task 6: SSE views + URLs + registry (Stage 3 — needs 5)

**Files:** Create `survival/run_registry.py`; Modify `sensor_data/views.py`, `sensor_data/urls.py`; Test `tests/test_survival_views.py`.

- [ ] **Step 1:** `survival/run_registry.py` — threadsafe `new_run_id/request_stop/is_cancelled/clear` (uuid + set + Lock), as in the earlier draft.
- [ ] **Step 2: failing test** — `Client().get("/api/survival/stream")` returns
  `text/event-stream` with `event: start/sol/end` frames (patch `views.run_survival` with a fake
  generator); `POST /api/survival/stop` → 200.
- [ ] **Step 3:** add to `sensor_data/views.py` `survival_stream`/`survival_stop` functions
  (module-level `@csrf_exempt`, not DRF APIView — SSE needs `StreamingHttpResponse`). They build
  `BiosimControl(settings.SURVIVAL_BIOSIM_URL)`, `BotBrain(anthropic.Anthropic(...), settings.ANTHROPIC_MODEL)`,
  `build_survival_config(settings.SURVIVAL_CREW_SIZE)`, then stream `run_survival(...)` framed as
  `event: {type}\ndata: {json}\n\n`, wrapping the loop in try/except→`event: error` and
  `finally: run_registry.clear(run_id)`. Headers `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
- [ ] **Step 4:** add to `sensor_data/urls.py`:
```python
    path('survival/stream', views.survival_stream, name='survival-stream'),
    path('survival/stop', views.survival_stop, name='survival-stop'),
```
(import `from . import views` or reference functions; note existing file imports view classes by name — add the two functions to that import list or switch to `from . import views`.)
- [ ] **Step 5: run → pass.**
- [ ] **Step 6: commit** `feat(survival): add SSE stream + stop endpoints`.

---

## FRONTEND TRACK

### Task 10: api/survival.ts (Stage 2)

**Files:** Create `spatialhub-frontend/src/api/survival.ts`.

- [ ] **Step 1:** define types + helpers:
```typescript
const SURVIVAL_API = import.meta.env.VITE_SURVIVAL_API ?? "/api/survival";

export type SurvivalSolEvent = {
  sol: number; alive: boolean;
  modules: Record<string, unknown>;           // raw BioSim modules -> mapBioSimToHabitatReadings
  reasoning: string;
  actions: { module: string; kind: string; type: string; desired_rates: number[] }[];
  warnings: { sensor: string; status: string }[];
};
export type SurvivalEndEvent = { sols_survived: number; ended_reason: string };

export function survivalStreamUrl(difficulty: "off" | "malfunctions"): string {
  return `${SURVIVAL_API}/stream?difficulty=${difficulty}`;
}
export async function stopSurvival(runId: string): Promise<void> {
  await fetch(`${SURVIVAL_API}/stop`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  });
}
```
- [ ] **Step 2:** `cd spatialhub-frontend && npx tsc --noEmit` → clean.
- [ ] **Step 3: commit** `feat(survival-ui): add survival SSE types + helpers`.

---

### Task 11: survivalZone helper (Stage 2)

**Files:** Create `spatialhub-frontend/src/simulation/survivalZone.ts`; Test `src/__tests__/survivalZone.test.ts`.

Thin wrapper that turns a sol event's `modules` into the readings `habitatStore.tick` wants —
**reusing** `mapBioSimToHabitatReadings`. Keeps `SurvivalView` dumb.

- [ ] **Step 1: failing test**
```typescript
import { describe, it, expect } from "vitest";
import { solEventToReadings } from "../simulation/survivalZone";

describe("solEventToReadings", () => {
  it("maps modules to zone readings via biosimMapper", () => {
    const modules = {
      Crew_Quarters_Environment: { properties: { temperature: 22, relativeHumidity: 40, totalPressure: 101 } },
    };
    const r = solEventToReadings(modules, {});
    expect(r["grow-bays"]["gb-temp"].value).toBe(22);
  });
});
```
- [ ] **Step 2: run → fail** — `npx vitest run src/__tests__/survivalZone.test.ts`.
- [ ] **Step 3: implement**
```typescript
import { mapBioSimToHabitatReadings } from "./biosimMapper";
import type { SensorReading } from "../types/habitat";

export function solEventToReadings(
  modules: Record<string, unknown>,
  history?: Record<string, Record<string, number[]>>,
): Record<string, Record<string, SensorReading>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mapBioSimToHabitatReadings(modules as any, Date.now(), history);
}
```
- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** `feat(survival-ui): add solEventToReadings (reuses biosimMapper)`.

---

### Task 12: SurvivalView page (Stage 3 — needs 10,11; reuse confirmed in Task 0)

**Files:** Create `spatialhub-frontend/src/pages/SurvivalView.tsx`; Test `src/__tests__/SurvivalView.test.tsx`.

Drives the **existing** `useHabitatStore` from the SSE stream and renders **reused**
`ZonePanel`/`HabitatHUD`/`AlertBanner` (exact components/props per Task 0) plus a SOL counter +
bot-reasoning overlay + Run/Stop + difficulty + result card.

- [ ] **Step 1: failing test** — mock `EventSource`, click Run, emit `run` + a `sol` event with
  a `Crew_Quarters_Environment` module, assert the SOL counter shows `5`, the reasoning appears,
  and (if store-driven) `useHabitatStore.getState().zones["grow-bays"]` updated; emit `end` →
  "Survived 5 sols" card. (Structure mirrors the earlier draft's `HabitatSurvival.test.tsx`,
  swapping in `solEventToReadings` + store assertion.)
- [ ] **Step 2: run → fail.**
- [ ] **Step 3: implement** `SurvivalView.tsx` — on `sol`: `useHabitatStore.getState().tick(solEventToReadings(d.modules, history))`, update local `sol`/`reasoning log`/`warnings`; render reused zone components + overlay; on `end`: result card; Run opens `new EventSource(survivalStreamUrl(difficulty))`, Stop calls `stopSurvival(runId)` + `es.close()`. (If Task 0 finds the zone components are prop-driven rather than store-driven, pass the mapped zone state as props instead of using the store.)
- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** `feat(survival-ui): add SurvivalView tab (reuses habitat store + zone UI)`.

---

### Task 13: Wire tab into App (Stage 4 — needs 12)

**Files:** Modify `spatialhub-frontend/src/App.tsx`.

- [ ] **Step 1:** lazy-import like `HabitatView`:
```tsx
const SurvivalView = React.lazy(() => import("./pages/SurvivalView"));
```
Add nav link after Mars Habitat: `<NavLink to="/survival" className="nav-link--habitat">Survival</NavLink>`.
Add route (wrap in the same `<Suspense>` fallback pattern as `/habitat`):
```tsx
<Route path="/survival" element={<Suspense fallback={<div className="loading-state"><div className="loading-spinner" /><div className="loading-text">LOADING SURVIVAL</div></div>}><SurvivalView /></Suspense>} />
```
(Ensure `SurvivalView` has a default export for `React.lazy`.)
- [ ] **Step 2:** `npx tsc --noEmit && npm run build` → succeeds.
- [ ] **Step 3: commit** `feat(survival-ui): add Survival tab to nav + routes`.

---

## INTEGRATION

### Task 16: Live end-to-end (Stage 4 — needs all + P0)

- [ ] **Step 1:** clear P0 (VM disk); verify start curl returns `{"simId":N}`.
- [ ] **Step 2:** backend env — `ANTHROPIC_API_KEY` (Cloud Run secret), `BIOSIM_URL`,
  `BIOSIM_MAX_SOLS`, `BIOSIM_TOKEN_BUDGET`. Raise SSE timeout:
  `gcloud run services update spatialhub-backend --timeout=3600 --region us-central1 --project nasa-comp-demo`.
  Confirm `CORS_ALLOWED_ORIGINS` includes the frontend origin + `http://localhost:5173`.
- [ ] **Step 3:** frontend env — `VITE_SURVIVAL_API` → backend `/api/survival` (or same-origin).
- [ ] **Step 4:** local E2E — `python manage.py runserver` + `npm run dev`; open `/survival`,
  click Run; verify SOL advances, zones update via reused components, Claude reasoning streams,
  result card on death.
- [ ] **Step 5:** `cd django_backend && pytest sensor_data/tests/test_survival_*.py -v` and
  `cd spatialhub-frontend && npx vitest run` → green.
- [ ] **Step 6: commit** any integration config.

---

## Self-Review

**Spec coverage:** autonomous Claude bot → T4/T5; live BioSim (real surfaces/config) → T2/T3 +
Task 0 live checks; SSE loop → T5/T6; reuse mapper+store+zone UI → T11/T12; reuse malfunction
shape → T2 `add_malfunction` (control_loop parity) + T5 difficulty; termination (4 reasons) →
T5; secrets server-side → T1/T6; new tab → T13; leaderboard/3D dome → spec phase-2, not planned. ✅

**Placeholder scan:** Task 0 read-confirmations are deliberate (reuse verification), not gaps.
`set_flows` body + zone-component prop-vs-store are explicit confirm-and-adapt steps. No silent TODOs. ✅

**Type consistency:** `summarize_state` keys (`ended/stores/warnings/controllable`) feed
`bot_brain._validate` + `loop`; event `{type,data}` produced in `loop`, framed in `views`,
parsed by name (`run/sol/end/error`) in `SurvivalView`. `modules` flows loop→SSE→`solEventToReadings`→`mapBioSimToHabitatReadings` (existing). `BotAction` fields match across brain/loop/`api/survival.ts`. ✅
```
