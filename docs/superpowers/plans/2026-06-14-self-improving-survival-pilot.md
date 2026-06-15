# Self-Improving Survival Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BioSim survival pilot self-improving — it self-corrects mid-run against learned reserve guardrails surfaced through the MCP, and an after-action review updates those guardrails + lessons after every run.

**Architecture:** A canonical `doctrine.json` (reserve bands + lessons) lives beside the MCP server. `get_status`/`advance` compute live `guardrail_violations` from it so the tool-only pilot self-corrects in-run. The server tracks per-run reserve stats; new tools `get_run_review` and `update_doctrine` let a `survival-reviewer` agent close the loop after each run. A `doctrine.md` mirror is auto-generated for human audit.

**Tech Stack:** Python 3 (FastMCP server in `mcp_biosim/server.py`), pytest, Markdown agent definitions in `.claude/agents/`.

**Test command:** from `mcp_biosim/`, run `python -m pytest tests/ -v` (use the MCP server's own venv — see `mcp_biosim/README.md`).

---

### Task 1: Doctrine store module (`doctrine.py`)

Pure, file-backed store for guardrails + lessons, with atomic writes and corrupt-file fallback. No server imports yet — fully unit-testable.

**Files:**
- Create: `mcp_biosim/doctrine.py`
- Test: `mcp_biosim/tests/test_doctrine.py`

- [ ] **Step 1: Write the failing tests**

```python
# mcp_biosim/tests/test_doctrine.py
import json
import importlib
import pytest

import doctrine as d  # mcp_biosim is on sys.path for the server's own tests


@pytest.fixture
def tmp_doctrine(tmp_path, monkeypatch):
    monkeypatch.setattr(d, "_DOCTRINE_FILE", tmp_path / "doctrine.json")
    monkeypatch.setattr(d, "_MIRROR_FILE", tmp_path / "doctrine.md")
    return tmp_path


def test_load_missing_returns_bootstrap(tmp_doctrine):
    doc = d.load()
    assert doc["version"] >= 1
    assert "Potable_Water_Store" in doc["guardrails"]["reserve_bands"]
    assert doc["guardrails"]["reserve_bands"]["Potable_Water_Store"]["floor_pct"] == 30
    assert doc["lessons"] == []


def test_save_then_load_roundtrip(tmp_doctrine):
    doc = d.bootstrap()
    d.save(doc)
    assert (tmp_doctrine / "doctrine.json").exists()
    assert (tmp_doctrine / "doctrine.md").exists()
    assert d.load()["guardrails"] == doc["guardrails"]


def test_load_corrupt_falls_back_to_bootstrap(tmp_doctrine):
    (tmp_doctrine / "doctrine.json").write_text("{not json")
    doc = d.load()
    assert doc["guardrails"]["reserve_bands"]["O2_Store"]["floor_pct"] == 20


def test_merge_overrides_band_and_appends_lesson(tmp_doctrine):
    d.save(d.bootstrap())
    doc = d.merge(
        guardrails={"reserve_bands": {"Potable_Water_Store": {"floor_pct": 35, "target_pct": 45}}},
        lessons=[{"run_id": "abc", "sol": 100, "text": "raised potable floor", "source": "after-action"}],
        now="2026-06-14T00:00:00Z",
    )
    assert doc["guardrails"]["reserve_bands"]["Potable_Water_Store"] == {"floor_pct": 35, "target_pct": 45}
    assert doc["lessons"][-1]["id"] == 1
    assert doc["lessons"][-1]["text"] == "raised potable floor"
    assert doc["version"] == d.bootstrap()["version"] + 1
    assert doc["updated_at"] == "2026-06-14T00:00:00Z"


def test_merge_rejects_unknown_store(tmp_doctrine):
    d.save(d.bootstrap())
    with pytest.raises(ValueError):
        d.merge(guardrails={"reserve_bands": {"Nope_Store": {"floor_pct": 10, "target_pct": 20}}})


def test_merge_rejects_floor_above_target(tmp_doctrine):
    d.save(d.bootstrap())
    with pytest.raises(ValueError):
        d.merge(guardrails={"reserve_bands": {"O2_Store": {"floor_pct": 80, "target_pct": 40}}})


def test_violations_flags_below_floor_only(tmp_doctrine):
    d.save(d.bootstrap())
    v = d.violations([
        {"name": "Potable_Water_Store", "pct": 0.0},
        {"name": "O2_Store", "pct": 100.0},
        {"name": "Food_Store", "pct": 10.0},
        {"name": "Biomass_Store", "pct": 0.0},  # not life-critical → ignored
    ])
    flagged = {x["store"] for x in v}
    assert flagged == {"Potable_Water_Store", "Food_Store"}
    pot = next(x for x in v if x["store"] == "Potable_Water_Store")
    assert pot["kind"] == "reserve_floor" and pot["floor"] == 30
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mcp_biosim && python -m pytest tests/test_doctrine.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'doctrine'`

- [ ] **Step 3: Implement `doctrine.py`**

```python
# mcp_biosim/doctrine.py
"""Self-improving pilot doctrine: reserve-band guardrails + accumulated lessons.

Canonical state lives in doctrine.json beside this module; a human-readable
doctrine.md mirror is regenerated on every save (audit / Human-in-the-Loop).
Pure and file-backed — no server imports, so it is unit-testable in isolation.
"""
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

_DOCTRINE_FILE = Path(__file__).parent / "doctrine.json"
_MIRROR_FILE = Path(__file__).parent / "doctrine.md"

# Stores whose reserve we defend. Order is the display order in the mirror.
LIFE_CRITICAL = ["Potable_Water_Store", "O2_Store", "Food_Store", "General_Power_Store"]


def bootstrap() -> dict:
    """Seed doctrine — encodes the two failures already observed in real runs."""
    return {
        "version": 1,
        "updated_at": None,
        "guardrails": {
            "reserve_bands": {
                "Potable_Water_Store": {"floor_pct": 30, "target_pct": 40},
                "O2_Store": {"floor_pct": 20, "target_pct": 40},
                "Food_Store": {"floor_pct": 15, "target_pct": 30},
                "General_Power_Store": {"floor_pct": 20, "target_pct": 40},
            },
            "rules": [
                "Survival is necessary but not sufficient — hold every life-critical "
                "store inside its reserve band.",
                "If all store deltas == 0 AND all recoverable balances == 0 across "
                ">2 sols, the engine has stalled — report it, do not treat it as "
                "equilibrium.",
            ],
        },
        "lessons": [],
    }


def load() -> dict:
    try:
        return json.loads(_DOCTRINE_FILE.read_text())
    except Exception:
        return bootstrap()


def _atomic_write(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(path.parent))
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.replace(tmp, str(path))
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def save(doc: dict) -> None:
    _atomic_write(_DOCTRINE_FILE, json.dumps(doc, indent=2))
    _atomic_write(_MIRROR_FILE, render_markdown(doc))


def _validate_band(store: str, band: dict) -> None:
    if store not in LIFE_CRITICAL:
        raise ValueError(f"unknown life-critical store: {store}")
    floor = band.get("floor_pct")
    target = band.get("target_pct")
    if floor is None or target is None:
        raise ValueError(f"{store}: band needs floor_pct and target_pct")
    if not (0 <= floor <= target <= 100):
        raise ValueError(f"{store}: require 0 <= floor({floor}) <= target({target}) <= 100")


def merge(guardrails: dict | None = None, lessons: list | None = None,
          now: str | None = None) -> dict:
    """Merge guardrail overrides + new lessons into the doctrine, persist, return it."""
    doc = load()
    if guardrails:
        rb = doc["guardrails"]["reserve_bands"]
        for store, band in (guardrails.get("reserve_bands") or {}).items():
            _validate_band(store, band)
            rb[store] = {"floor_pct": band["floor_pct"], "target_pct": band["target_pct"]}
        if guardrails.get("rules") is not None:
            doc["guardrails"]["rules"] = list(guardrails["rules"])
    if lessons:
        next_id = max((l.get("id", 0) for l in doc["lessons"]), default=0)
        for l in lessons:
            next_id += 1
            doc["lessons"].append({
                "id": next_id,
                "run_id": l.get("run_id"),
                "sol": l.get("sol"),
                "text": l.get("text", ""),
                "source": l.get("source", "after-action"),
            })
    doc["version"] = doc.get("version", 0) + 1
    doc["updated_at"] = now or datetime.now(timezone.utc).isoformat()
    save(doc)
    return doc


def violations(stores: list) -> list:
    """Given [{name, pct}, ...], return reserve_floor violations vs current bands."""
    bands = load()["guardrails"]["reserve_bands"]
    out = []
    for s in stores:
        band = bands.get(s["name"])
        if band is not None and s["pct"] < band["floor_pct"]:
            out.append({
                "store": s["name"],
                "kind": "reserve_floor",
                "value": round(s["pct"], 2),
                "floor": band["floor_pct"],
                "msg": "below reserve floor — rebuild",
            })
    return out


def render_markdown(doc: dict) -> str:
    rb = doc["guardrails"]["reserve_bands"]
    lines = [
        "# Survival Pilot Doctrine (auto-generated mirror)",
        "",
        f"_Version {doc.get('version')} · updated {doc.get('updated_at')}_",
        "",
        "> Canonical source is `doctrine.json`. Edit there (or via the reviewer); "
        "this file is regenerated on every update. Audit/veto surface for the "
        "self-improving loop.",
        "",
        "## Reserve bands (life-critical stores)",
        "",
        "| Store | Floor % | Target % |",
        "|---|---:|---:|",
    ]
    for store in LIFE_CRITICAL:
        b = rb.get(store)
        if b:
            lines.append(f"| {store} | {b['floor_pct']} | {b['target_pct']} |")
    lines += ["", "## Rules", ""]
    for r in doc["guardrails"]["rules"]:
        lines.append(f"- {r}")
    lines += ["", "## Lessons (newest first)", ""]
    if not doc["lessons"]:
        lines.append("_None yet._")
    for l in reversed(doc["lessons"]):
        prov = f"run {l.get('run_id')}, sol {l.get('sol')}"
        lines.append(f"- **#{l['id']}** ({prov}): {l['text']}")
    return "\n".join(lines) + "\n"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp_biosim && python -m pytest tests/test_doctrine.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add mcp_biosim/doctrine.py mcp_biosim/tests/test_doctrine.py
git commit -m "feat(survival-mcp): doctrine store (reserve bands + lessons + violations)"
```

---

### Task 2: Surface `guardrail_violations` in status payloads

Wire the doctrine into `_status_payload` so every `get_status`/`advance` return includes live floor violations — the channel the tool-only pilot reads to self-correct in-run.

**Files:**
- Modify: `mcp_biosim/server.py` (import + `_status_payload`, lines ~260-292)
- Test: `mcp_biosim/tests/test_server.py`

- [ ] **Step 1: Write the failing test**

```python
# append to mcp_biosim/tests/test_server.py
def test_status_payload_includes_guardrail_violations(monkeypatch):
    import server
    import doctrine
    doctrine.save(doctrine.bootstrap())  # ensure known bands (uses real file; see note)

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
```

> Note: this test writes the real `doctrine.json`; if that is undesirable, monkeypatch `doctrine._DOCTRINE_FILE`/`_MIRROR_FILE` to `tmp_path` first (same pattern as Task 1).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp_biosim && python -m pytest tests/test_server.py::test_status_payload_includes_guardrail_violations -v`
Expected: FAIL with `KeyError: 'guardrail_violations'`

- [ ] **Step 3: Add the import and populate the field**

In `mcp_biosim/server.py`, add to the imports near the top (after the other survival imports, ~line 35):

```python
import doctrine  # noqa: E402
```

In `_status_payload`, immediately before `return payload` (currently line ~292), add:

```python
    payload["guardrail_violations"] = doctrine.violations(snap["stores"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp_biosim && python -m pytest tests/test_server.py::test_status_payload_includes_guardrail_violations -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcp_biosim/server.py mcp_biosim/tests/test_server.py
git commit -m "feat(survival-mcp): surface guardrail_violations in status/advance payloads"
```

---

### Task 3: Per-run reserve statistics

Track per-store minimum reserve, sols-below-floor, and malfunction count across a run so the after-action review has real metrics.

**Files:**
- Modify: `mcp_biosim/server.py` — `Run.__init__`/`Run.reset` (lines ~128-152), `advance` loop (lines ~500-520)
- Test: `mcp_biosim/tests/test_server.py`

- [ ] **Step 1: Write the failing test**

```python
# append to mcp_biosim/tests/test_server.py
def test_record_reserve_updates_min_and_below_floor(monkeypatch):
    import server, doctrine
    doctrine.save(doctrine.bootstrap())
    server.RUN.reset("off")
    # sol 1: potable healthy
    server._record_reserve([{"name": "Potable_Water_Store", "pct": 60.0}])
    # sol 2: potable below 30 floor
    server._record_reserve([{"name": "Potable_Water_Store", "pct": 12.0}])
    assert server.RUN.reserve_min["Potable_Water_Store"] == 12.0
    assert server.RUN.sols_below_floor["Potable_Water_Store"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp_biosim && python -m pytest tests/test_server.py::test_record_reserve_updates_min_and_below_floor -v`
Expected: FAIL with `AttributeError: module 'server' has no attribute '_record_reserve'`

- [ ] **Step 3: Add reserve fields + the `_record_reserve` helper + wire into advance**

In `Run.__init__` (after `self.last_actions = []`, ~line 137) add:

```python
        self.reserve_min = {}        # store name -> lowest pct seen this run
        self.sols_below_floor = {}   # store name -> count of sols below its floor
        self.malfunctions = 0        # malfunctions injected this run
```

In `Run.reset` (after `self.last_actions = []`, ~line 150) add the same three resets:

```python
        self.reserve_min = {}
        self.sols_below_floor = {}
        self.malfunctions = 0
```

Add this module-level helper near the other `_record_*` helpers (after `_record_trend`, ~line 233):

```python
def _record_reserve(stores):
    """Update per-run reserve stats from a sol's stores ([{name, pct}, ...])."""
    bands = doctrine.load()["guardrails"]["reserve_bands"]
    for s in stores:
        name, pct = s["name"], s["pct"]
        prev = RUN.reserve_min.get(name)
        if prev is None or pct < prev:
            RUN.reserve_min[name] = pct
        band = bands.get(name)
        if band is not None and pct < band["floor_pct"]:
            RUN.sols_below_floor[name] = RUN.sols_below_floor.get(name, 0) + 1
```

In `advance`, refactor the per-sol body so the state is summarized once and reserve stats recorded. Replace lines ~512-520 (from `raw = RUN.client.get_state(RUN.sim_id)` through the non-ended `_publish("sol", ...)`) with:

```python
        raw = RUN.client.get_state(RUN.sim_id)
        snap = summarize_state(raw)
        _record_reserve(snap["stores"])
        if snap["ended"]:
            RUN.alive = False
            RUN.ended_reason = "crew_death"
            _publish("sol", _sol_event(raw, note if advanced == 1 else ""))
            _publish("end", {"sols_survived": RUN.sols,
                             "ended_reason": RUN.ended_reason or "crew_death"})
            break
        _publish("sol", _sol_event(raw, note if advanced == 1 else ""))
```

Also bump the malfunction counter: in `advance`, inside the `if RUN.difficulty == "malfunctions" ...` block, after the successful `RUN.client.add_malfunction(...)` line, add:

```python
                RUN.malfunctions += 1
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp_biosim && python -m pytest tests/test_server.py::test_record_reserve_updates_min_and_below_floor -v`
Expected: PASS

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `cd mcp_biosim && python -m pytest tests/ -v`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add mcp_biosim/server.py mcp_biosim/tests/test_server.py
git commit -m "feat(survival-mcp): track per-run reserve min, sols-below-floor, malfunctions"
```

---

### Task 4: `get_run_review` tool

Expose computed end-of-run metrics for the reviewer agent.

**Files:**
- Modify: `mcp_biosim/server.py` (new tool near the other `@mcp.tool()` defs)
- Test: `mcp_biosim/tests/test_server.py`

- [ ] **Step 1: Write the failing test**

```python
# append to mcp_biosim/tests/test_server.py
def test_get_run_review_reports_metrics(monkeypatch):
    import server, doctrine
    doctrine.save(doctrine.bootstrap())
    server.RUN.reset("malfunctions")
    server.RUN.run_id = "rev1"
    server.RUN.sim_id = 1
    server.RUN.sols = 50
    server.RUN.alive = False
    server.RUN.ended_reason = "crew_death"
    server.RUN.malfunctions = 5
    server.RUN.reserve_min = {"Potable_Water_Store": 0.0}
    server.RUN.sols_below_floor = {"Potable_Water_Store": 40}

    class FakeClient:
        def get_state(self, sim_id):
            return {"_fake": True}

    monkeypatch.setattr(server.RUN, "client", FakeClient())
    monkeypatch.setattr(server, "summarize_state", lambda raw: {
        "ended": True, "warnings": [], "balances": [], "controllable": [],
        "stores": [{"name": "Potable_Water_Store", "pct": 0.0}],
    })

    r = server.get_run_review()
    assert r["sols_survived"] == 50
    assert r["ended_reason"] == "crew_death"
    assert r["malfunctions_seen"] == 5
    ps = r["per_store"]["Potable_Water_Store"]
    assert ps["min_pct"] == 0.0 and ps["sols_below_floor"] == 40 and ps["final_pct"] == 0.0
    assert "reserve_bands" in r["guardrails"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp_biosim && python -m pytest tests/test_server.py::test_get_run_review_reports_metrics -v`
Expected: FAIL with `AttributeError: module 'server' has no attribute 'get_run_review'`

- [ ] **Step 3: Implement the tool**

Add after the `advance` tool (~line 526) in `mcp_biosim/server.py`:

```python
@mcp.tool()
def get_run_review() -> dict:
    """After-action metrics for the just-finished (or in-progress) run, for the
    survival-reviewer agent to derive lessons + guardrail adjustments.

    Returns sols_survived, alive, ended_reason, malfunctions_seen, final flow
    set-points, the live guardrails, and per-store {min_pct, sols_below_floor,
    final_pct}. Read-only — does not advance or mutate the sim.
    """
    final_pct = {}
    final_flows = list(RUN.last_actions)
    if RUN.sim_id is not None:
        try:
            snap = summarize_state(RUN.client.get_state(RUN.sim_id))
            final_pct = {s["name"]: s["pct"] for s in snap["stores"]}
            final_flows = snap.get("controllable", final_flows)
        except Exception:
            pass
    names = set(RUN.reserve_min) | set(RUN.sols_below_floor) | set(final_pct)
    per_store = {
        name: {
            "min_pct": RUN.reserve_min.get(name),
            "sols_below_floor": RUN.sols_below_floor.get(name, 0),
            "final_pct": final_pct.get(name),
        }
        for name in sorted(names)
    }
    result = {
        "run_id": RUN.run_id,
        "difficulty": RUN.difficulty,
        "sols_survived": RUN.sols,
        "alive": RUN.alive,
        "ended_reason": RUN.ended_reason,
        "malfunctions_seen": RUN.malfunctions,
        "per_store": per_store,
        "final_flows": final_flows,
        "guardrails": doctrine.load()["guardrails"],
    }
    _track_call(result)
    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp_biosim && python -m pytest tests/test_server.py::test_get_run_review_reports_metrics -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcp_biosim/server.py mcp_biosim/tests/test_server.py
git commit -m "feat(survival-mcp): get_run_review tool (after-action metrics)"
```

---

### Task 5: `update_doctrine` tool

Let the reviewer persist guardrail deltas + lessons (auto-apply), regenerating the mirror.

**Files:**
- Modify: `mcp_biosim/server.py` (new tool)
- Test: `mcp_biosim/tests/test_server.py`

- [ ] **Step 1: Write the failing test**

```python
# append to mcp_biosim/tests/test_server.py
def test_update_doctrine_persists_and_round_trips(monkeypatch, tmp_path):
    import server, doctrine
    monkeypatch.setattr(doctrine, "_DOCTRINE_FILE", tmp_path / "doctrine.json")
    monkeypatch.setattr(doctrine, "_MIRROR_FILE", tmp_path / "doctrine.md")
    doctrine.save(doctrine.bootstrap())

    out = server.update_doctrine(
        guardrails={"reserve_bands": {"Potable_Water_Store": {"floor_pct": 35, "target_pct": 45}}},
        lessons=[{"run_id": "rev1", "sol": 50, "text": "potable chronically below floor; raise to 35"}],
    )
    assert out["ok"] is True
    reloaded = doctrine.load()
    assert reloaded["guardrails"]["reserve_bands"]["Potable_Water_Store"]["floor_pct"] == 35
    assert reloaded["lessons"][-1]["text"].startswith("potable chronically")


def test_update_doctrine_rejects_bad_band(monkeypatch, tmp_path):
    import server, doctrine
    monkeypatch.setattr(doctrine, "_DOCTRINE_FILE", tmp_path / "doctrine.json")
    monkeypatch.setattr(doctrine, "_MIRROR_FILE", tmp_path / "doctrine.md")
    doctrine.save(doctrine.bootstrap())
    out = server.update_doctrine(guardrails={"reserve_bands": {"O2_Store": {"floor_pct": 90, "target_pct": 10}}})
    assert out["ok"] is False
    assert "error" in out
    # unchanged
    assert doctrine.load()["guardrails"]["reserve_bands"]["O2_Store"]["floor_pct"] == 20
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mcp_biosim && python -m pytest tests/test_server.py::test_update_doctrine_persists_and_round_trips tests/test_server.py::test_update_doctrine_rejects_bad_band -v`
Expected: FAIL with `AttributeError: module 'server' has no attribute 'update_doctrine'`

- [ ] **Step 3: Implement the tool**

Add after `get_run_review` in `mcp_biosim/server.py`:

```python
@mcp.tool()
def update_doctrine(guardrails: dict | None = None, lessons: list | None = None) -> dict:
    """Persist learned guardrail adjustments and/or new lessons (auto-apply).

    guardrails: {"reserve_bands": {"<Store>": {"floor_pct", "target_pct"}}, "rules": [...]}
    lessons: [{"run_id", "sol", "text", "source"}].
    Validates bands (0 <= floor <= target <= 100, known store) and regenerates the
    human-readable doctrine.md mirror. Returns {ok, version, doctrine} or {ok:False, error}.
    """
    try:
        doc = doctrine.merge(guardrails=guardrails, lessons=lessons)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "version": doc["version"], "doctrine": doc}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp_biosim && python -m pytest tests/test_server.py::test_update_doctrine_persists_and_round_trips tests/test_server.py::test_update_doctrine_rejects_bad_band -v`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `cd mcp_biosim && python -m pytest tests/ -v`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add mcp_biosim/server.py mcp_biosim/tests/test_server.py
git commit -m "feat(survival-mcp): update_doctrine tool (auto-apply guardrail/lesson deltas)"
```

---

### Task 6: Generate the initial committed doctrine files

Materialize `doctrine.json` + `doctrine.md` so the first improved run has a doctrine and the mirror is in git.

**Files:**
- Create: `mcp_biosim/doctrine.json`, `mcp_biosim/doctrine.md`

- [ ] **Step 1: Generate from bootstrap**

Run: `cd mcp_biosim && python -c "import doctrine; doctrine.save(doctrine.bootstrap())"`

- [ ] **Step 2: Verify the files exist and look right**

Run: `cd mcp_biosim && cat doctrine.md`
Expected: a markdown table listing the four reserve bands (Potable floor 30, O2 20, Food 15, Power 20), the two rules, and "Lessons (newest first): None yet."

- [ ] **Step 3: Commit**

```bash
git add mcp_biosim/doctrine.json mcp_biosim/doctrine.md
git commit -m "feat(survival-mcp): seed bootstrap doctrine (reserve bands + base rules)"
```

---

### Task 7: Pilot doctrine — add "Reserve discipline"

Teach the pilot to act on `guardrail_violations` and hold reserve bands, replacing the "keep water positive" framing that caused the zero-reserve failure.

**Files:**
- Modify: `.claude/agents/survival-pilot.md` (the "Operating doctrine" + "Hard-won strategy" sections, lines ~47-74)

- [ ] **Step 1: Insert the Reserve discipline section**

In `.claude/agents/survival-pilot.md`, immediately after the "## Operating doctrine (priority order)" list (after line 54, before "Controllable ceilings:"), insert:

```markdown

## Reserve discipline (read this every loop)
**Survival is necessary but NOT sufficient.** The status/advance payload now includes
a `guardrail_violations` array driven by the server-side doctrine (learned reserve
bands per life-critical store). Treat every violation as actionable:
- A store below its reserve floor must be **rebuilt** (tune that loop net-positive
  toward the target band) before you chase distance — do not coast on a store at 0%.
- Hold each life-critical store **inside its band** (≥ floor, around target), then
  balance to net ~0 to hold it there.
- **Flatline check:** if all store deltas are 0 AND all recoverable balances
  (PotableWater/GreyWater/DirtyWater/O2/CO2/Biomass) are 0 across >2 sols despite
  your flow changes, the engine has stalled — report it; do not mistake it for a
  healthy equilibrium.
```

- [ ] **Step 2: Soften the old "keep potable water positive" line**

In the "## Operating doctrine" list, change line 53 from:

```markdown
4. **Water** — keep potable water positive.
```

to:

```markdown
4. **Water** — hold potable water inside its reserve band (see Reserve discipline),
   not merely positive.
```

- [ ] **Step 3: Verify**

Run: `grep -n "Reserve discipline\|inside its reserve band\|Flatline check" .claude/agents/survival-pilot.md`
Expected: matches for all three phrases.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/survival-pilot.md
git commit -m "feat(survival-pilot): reserve-band discipline + flatline check in doctrine"
```

---

### Task 8: `survival-reviewer` agent

The after-action reviewer that reads run metrics and updates the doctrine each run.

**Files:**
- Create: `.claude/agents/survival-reviewer.md`

- [ ] **Step 1: Write the agent definition**

```markdown
---
name: survival-reviewer
description: >-
  After-action reviewer for a finished BioSim survival run. Reads the run's metrics
  via the biosim MCP, derives lessons and reserve-guardrail adjustments, and updates
  the pilot doctrine so the next run starts smarter. Spawn once when a run ends.
tools: mcp__biosim__get_run_review, mcp__biosim__update_doctrine, Read, Write, Edit
model: inherit
---

You are the **after-action reviewer** for the BioSim Mars-habitat survival run. A run
just ended (crew death, stop, or sol target). Your job: turn what happened into
durable improvements to the pilot's doctrine, so the next run does better without a
human prompting it.

## Procedure
1. Call `get_run_review()` to get the run's metrics: sols_survived, alive,
   ended_reason, malfunctions_seen, final_flows, the current `guardrails`, and
   `per_store` {min_pct, sols_below_floor, final_pct}.
2. Diagnose against the guardrails:
   - **Chronic floor breach** — a store with `sols_below_floor` large relative to
     `sols_survived` (e.g. >20%) or `min_pct` far under its floor → the band was not
     respected. Propose raising that floor and/or note the operating fix.
   - **Excess margin** — a store whose `min_pct` stayed well above its floor all run →
     the band may be loosened (free up resources) — but be conservative.
   - **Cause of death** — if the crew died, which store/limit drove it? Capture the
     lesson.
   - **Flatline** — if balances were all zero / stores never moved, record that the
     engine stalled (don't reward the long sol count).
3. Call `update_doctrine(guardrails=..., lessons=...)` to apply:
   - `guardrails.reserve_bands` only for stores you're actually changing (floor ≤
     target ≤ 100).
   - `lessons` as short, specific, provenance-tagged entries (include run_id + sol):
     e.g. "Potable below floor 412/903 sols; raised floor 30→35 and prioritized WRS
     net-positive before distance."
   Make the **smallest** change that encodes the lesson. Don't rewrite bands that
   behaved well.
4. Append a one-line pointer to the auto-memory index at
   `/Users/nickdemari/.claude/projects/-Users-nickdemari-dev-SpatialHub-JobDemoClone/memory/MEMORY.md`
   summarizing what changed (only if something changed).

## Output
Return a concise summary: the metrics that drove your decision, the exact guardrail
deltas applied, and the lessons recorded. Data, not prose. If nothing warranted a
change, say so and apply nothing.
```

- [ ] **Step 2: Verify**

Run: `grep -n "name: survival-reviewer\|get_run_review\|update_doctrine" .claude/agents/survival-reviewer.md`
Expected: matches for the name and both MCP tools.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/survival-reviewer.md
git commit -m "feat(survival): survival-reviewer agent closes the learning loop"
```

---

## Orchestration note (not a code task)

The loop is closed by the existing agent-spawn flow: when the background `survival-pilot`
reports a run ended, the orchestrator (the main Claude session driving these runs)
spawns the `survival-reviewer` agent once, then launches the next pilot — which reads
the updated doctrine via the server payload. No daemon. After a reviewer run, the
orchestrator commits any changed `doctrine.json`/`doctrine.md`.

## Manual verification (after all tasks)

1. `cd mcp_biosim && python -m pytest tests/ -v` → all pass.
2. Start a short run, advance a few sols, call `get_status` → confirm `guardrail_violations`
   appears and reflects any store below its floor.
3. Call `get_run_review` mid-run → confirm `per_store` min/below-floor populate.
4. Spawn `survival-reviewer` → confirm `doctrine.json` version bumps and `doctrine.md`
   gains a lessons entry.
