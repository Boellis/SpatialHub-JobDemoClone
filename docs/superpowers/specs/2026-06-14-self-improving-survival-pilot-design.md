# Self-Improving Survival Pilot — Design Spec

**Date:** 2026-06-14
**Status:** Approved design (pre-implementation)
**Component:** `mcp_biosim/` (MCP server) + `.claude/agents/` (pilot + reviewer) + orchestration

---

## 1. Problem

The BioSim survival pilot's strategy is **static hand-written text** in `.claude/agents/survival-pilot.md` (the "Operating doctrine" + "Hard-won strategy" sections). Nothing feeds a run's outcome back into that strategy. Two concrete failures this caused:

- The doctrine says *"keep potable water positive"* — so the pilot ran potable water to **0% reserve** (a fragile knife-edge) and never corrected, because zero is still "positive." The user had to point this out manually.
- A later run **flatlined** (all store deltas = 0, all recoverable balances = 0 across many sols) and the pilot initially read it as a healthy equilibrium instead of a stalled engine.

**Goal:** Close the loop so the pilot's judgment compounds across runs *and* self-corrects within a run — without the user babysitting it.

## 2. Goals / Non-Goals

**Goals**
- Pilot self-corrects **mid-run** against learned guardrails (reserve bands, margin rules) surfaced live.
- Each run ends with an **after-action review** that derives new lessons + guardrail adjustments and persists them for the next run.
- Learned state is durable, server-side (reachable by the tool-only pilot), and mirrored to a **human-readable, version-controlled** file (NASA Human-in-the-Loop mandate).
- Auto-applies improvements; user can audit/veto via the mirror file.

**Non-Goals (YAGNI)**
- No ML / statistical model. No per-scenario set-point optimizer.
- No change to BioSim itself or the Django backend relay.
- The pilot agent gains **no** file/DB tools — it stays tool-only; all learning reaches it through the MCP payload.

## 3. Architecture

```
                ┌─────────────────────── doctrine.json (canonical) ───────────────────────┐
                │  guardrails: reserve bands + margin rules   lessons: [ {text, run_id…} ] │
                └───────────▲───────────────────────────────────────────────▲─────────────┘
                            │ read each tick                                 │ merge on review
   ┌────────────────────────┴─────────┐                          ┌──────────┴───────────────┐
   │ MCP server (server.py)           │   get_run_review()        │ survival-reviewer agent  │
   │  • get_status / advance:         │◄──────────────────────────┤  (file + biosim tools)   │
   │    append guardrail_violations   │   update_doctrine(...)     │  • reads run metrics     │
   │  • track per-run reserve stats   │──────────────────────────►│  • derives lessons       │
   └────────────────────┬─────────────┘                          │  • writes doctrine.md    │
                        │ status payload (warnings + violations)  └──────────────────────────┘
                        ▼
   ┌──────────────────────────────────┐     run ends     ┌──────────────────────────────────┐
   │ survival-pilot agent (tool-only)  │─────────────────►│ orchestrator spawns reviewer,     │
   │  • reads violations, self-corrects│                  │ then next pilot reads new doctrine │
   └──────────────────────────────────┘                  └──────────────────────────────────┘
```

## 4. Components

### 4.1 Doctrine store — `mcp_biosim/doctrine.py` + `doctrine.json`
Canonical persisted state, loaded at server start and on each read (cheap; small file). Schema:

```json
{
  "version": 3,
  "updated_at": "2026-06-14T...",
  "guardrails": {
    "reserve_bands": {
      "Potable_Water_Store": { "floor_pct": 30, "target_pct": 40 },
      "O2_Store":            { "floor_pct": 20, "target_pct": 40 },
      "Food_Store":          { "floor_pct": 15, "target_pct": 30 },
      "General_Power_Store": { "floor_pct": 20, "target_pct": 40 }
    },
    "rules": [
      "Survival is necessary but not sufficient — hold every life-critical store inside its band.",
      "If all store deltas == 0 AND all recoverable balances == 0 across >2 sols, the engine has stalled — report, do not treat as equilibrium."
    ]
  },
  "lessons": [
    { "id": 1, "run_id": "...", "sol": 903, "text": "Potable held at 0% reserve survives in BioSim (per-tick flow check) but is fragile; raise floor to 30%.", "source": "after-action" }
  ]
}
```

- **Bootstrap:** ship `doctrine.json` seeded with the bands + two rules above (encodes the two failures already observed).
- `doctrine.py` exposes: `load()`, `save(doc)`, `merge(guardrails?, lessons?) -> doc`, `render_markdown(doc) -> str`.
- **Concurrency:** single-writer (review runs between runs, not during). Write is atomic (temp file + rename). No locking needed beyond that.

### 4.2 Human-readable mirror — `mcp_biosim/doctrine.md`
Regenerated from `doctrine.json` on every `update_doctrine`. Contains the current reserve bands table, the rules list, and the lessons log (newest first). This is the review/veto surface and is committed to git.

### 4.3 Server changes — `mcp_biosim/server.py`
1. **Per-run reserve stats** in run state: for each life-critical store track `min_pct_seen` and `sols_below_floor` (incremented per advanced sol when `pct < floor`).
2. **`guardrail_violations`** computed from `doctrine.guardrails.reserve_bands` vs current store pcts, appended to **both** `get_status` and the `advance` return payload (alongside existing `warnings`):
   ```json
   "guardrail_violations": [
     { "store": "Potable_Water_Store", "kind": "reserve_floor", "value": 0.0, "floor": 30, "msg": "below reserve floor — rebuild" }
   ]
   ```
   `detail='normal'` includes violations (they're action-critical); keep them compact.
3. **New tool `get_run_review()`** → returns computed end-of-run metrics: `sols_survived`, `alive`, `ended_reason`, `per_store: {min_pct, sols_below_floor, final_pct}`, `malfunctions_seen`, `final_flows`, plus the current `guardrails` for context. Read-only.
4. **New tool `update_doctrine(guardrails?, lessons?)`** → `doctrine.merge(...)`, bumps `version`/`updated_at`, writes `doctrine.json`, regenerates `doctrine.md`. Returns the new doc. Validates: floor ≤ target ≤ 100, floors ≥ 0, store names known.

### 4.4 Pilot doctrine update — `.claude/agents/survival-pilot.md`
Add a **"Reserve discipline"** section to the operating doctrine:
- Survival is necessary but **not sufficient**; hold every life-critical store inside its reserve band.
- Treat `guardrail_violations` in the status/advance payload as **actionable** — rebuild a store that's below floor before chasing distance.
- Recognize the flatline failure mode (rule #2 above) and report it instead of coasting.
- Replace the absolute ceiling-only guidance with band-aware tuning (net-positive to rebuild toward target, net-zero to hold).

### 4.5 Reviewer agent — `.claude/agents/survival-reviewer.md`
New subagent, tools: `mcp__biosim__get_run_review`, `mcp__biosim__update_doctrine`, `Read`, `Write`, `Edit`. Invoked when a run ends. Procedure:
1. `get_run_review()` → metrics.
2. Compare outcome vs guardrails: which floors were breached, for how long; which stores had excess margin (tunable down); whether the run flatlined or died and why.
3. Derive **lessons** (freeform, with provenance) + **proposed guardrail deltas** (e.g., raise a floor that was chronically breached, relax one never approached).
4. `update_doctrine(guardrails, lessons)` (auto-apply).
5. Append a one-line memory note pointer.
6. Return a concise summary of what changed in the doctrine.

### 4.6 Orchestration
The background pilot returns a "run ended" result (death / stop / target). The **main loop (orchestrator) spawns the reviewer agent on run-end, before launching the next pilot.** The next pilot, spawned fresh, reads the updated `doctrine.json` via the server payload. (No new daemon; orchestration is the existing spawn flow.)

## 5. Data Flow (one cycle)
1. Pilot runs; each loop reads `guardrail_violations` from status → self-corrects to hold bands.
2. Run ends; server has accumulated per-run reserve stats.
3. Orchestrator spawns reviewer → `get_run_review()` → derives lessons + guardrail deltas → `update_doctrine()` → `doctrine.json` + `doctrine.md` updated, committed.
4. Next run: server serves the new guardrails; pilot reads the new doctrine. Loop compounds.

## 6. Error Handling
- Missing/corrupt `doctrine.json` → server logs a warning and loads the bootstrap default (never hard-fails a run).
- `update_doctrine` validation failure → reject the bad field, keep prior doctrine, return an error the reviewer surfaces.
- Reviewer agent failure → run is unaffected; doctrine simply isn't updated this cycle (logged). The system degrades to "no learning this run," never to a broken run.
- Atomic writes prevent a half-written doctrine from being read.

## 7. Testing
- `doctrine.py`: load/save round-trip, merge semantics (guardrail override + lesson append), markdown render, atomic write, corrupt-file fallback.
- `server.py`: `guardrail_violations` computed correctly for below/within/above floor; per-run reserve stat tracking; `get_run_review` shape; `update_doctrine` validation (floor≤target≤100, unknown store rejected).
- Integration: simulate a run that breaches potable floor → `get_run_review` reports `sols_below_floor > 0` → a doctrine update raising the floor round-trips into the next `get_status`'s violations.

## 8. Out of Scope / Future
- Auto-committing `doctrine.md` from the reviewer (initially the orchestrator commits; can move into reviewer later).
- Per-difficulty doctrine profiles.
- Propose-and-confirm gating mode (current design auto-applies; gating is a future toggle).
