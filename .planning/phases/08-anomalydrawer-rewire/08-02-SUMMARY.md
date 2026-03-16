---
phase: 08-anomalydrawer-rewire
plan: "02"
subsystem: frontend-simulation
tags: [biosim, anomaly, zustand, useSimSource, websocket]
dependency_graph:
  requires: [biosimMalfunctions-service, habitatStore-dual-path]
  provides: [biosimSimId-wiring]
  affects: [useSimSource, habitatStore, triggerAnomaly]
tech_stack:
  added: []
  patterns: [simIdRef-lifecycle, setBiosimSimId-on-WS_OPEN]
key_files:
  created: []
  modified:
    - spatialhub-frontend/src/hooks/useSimSource.ts
    - spatialhub-frontend/src/__tests__/useSimSource.test.ts
decisions:
  - "simIdRef (useRef) captures simId at all 3 probe sites so WS_OPEN handler has the value without closure issues"
  - "setBiosimSimId(null) called on both WS_CLOSE and startFallback — separate clear points cover disconnected-then-fallback path"
metrics:
  duration: "5m"
  completed_date: "2026-03-16"
  tasks_completed: 1
  tasks_total: 2
  files_modified: 2
---

# Phase 8 Plan 02: biosimSimId Wiring in useSimSource Summary

**One-liner:** `simIdRef` lifecycle in useSimSource wires `biosimSimId` into Zustand store on WS_OPEN and clears it on fallback/disconnect — completing the BioSim path activation for `triggerAnomaly`.

## What Was Built

### useSimSource.ts — simIdRef lifecycle

New `simIdRef = useRef<string | null>(null)` captures the simulation ID at all three probe sites:
- Initial probe (`probeBioSim().then(...)`)
- Retry probe (`scheduleRetry` setTimeout callback)
- Background probe (setInterval callback)

On `WS_OPEN`: calls `setBiosimSimId(simIdRef.current)` — the store field goes from `null` to the live simulation ID, enabling the BioSim path in `triggerAnomaly` (which gates on `biosimSimId !== null`).

On `WS_CLOSE`: calls `setBiosimSimId(null)` — clears the ID immediately when the connection drops.

On `startFallback`: calls `setBiosimSimId(null)` — clears the ID when falling back to client-side engine after retries exhausted.

On unmount cleanup: `simIdRef.current = null`.

### useSimSource.test.ts — new mock and tests

Mock setup extended:
- `setBiosimSimIdMock = vi.fn(...)` patches the store's `setBiosimSimId`
- `biosimSimId: null` and `biosimMalfunctionIds: {}` added to store reset state

Two new tests added:
- `'on WS_OPEN, setBiosimSimId is called with the probed simId'` — confirms mock called with `'42'` and store value updated
- `'on startFallback, setBiosimSimId is called with null'` — full disconnect-to-fallback path confirms null clear

## Test Results

| Scope | Tests | Result |
| ----- | ----- | ------ |
| Existing suite (no regressions) | 90 | Pass |
| New: biosimSimId lifecycle | 2 | Pass |
| **Total** | **92** | **All pass** |

TypeScript build: clean (exit 0, no errors).
AnomalyDrawer.tsx: NOT modified (verified via `git diff`).

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | c602ad3 | feat(08-02): wire biosimSimId lifecycle in useSimSource |
| 2 | (pending human verification) | End-to-end anomaly flow checkpoint |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
