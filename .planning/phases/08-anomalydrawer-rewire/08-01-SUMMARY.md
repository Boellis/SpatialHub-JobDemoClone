---
phase: 08-anomalydrawer-rewire
plan: "01"
subsystem: frontend-simulation
tags: [biosim, anomaly, zustand, tdd, service-layer]
dependency_graph:
  requires: []
  provides: [biosimMalfunctions-service, habitatStore-dual-path]
  affects: [AnomalyDrawer, habitatStore, useSimSource]
tech_stack:
  added: []
  patterns: [optimistic-sentinel-guard, dual-path-branching, fire-and-forget-delete]
key_files:
  created:
    - spatialhub-frontend/src/simulation/biosimMalfunctions.ts
    - spatialhub-frontend/src/__tests__/biosimMalfunctions.test.ts
  modified:
    - spatialhub-frontend/src/types/habitat.ts
    - spatialhub-frontend/src/store/habitatStore.ts
decisions:
  - "Optimistic sentinel pattern: set anomalies[id]={phase:peak} and biosimMalfunctionIds[id]=-1 immediately on triggerAnomaly; update to real ID on POST success, rollback both on failure"
  - "AnomalyDrawer isActive check (phase !== idle) works without JSX changes because sentinel phase is 'peak'"
  - "biosimMalfunctionIds cleared on setSimSource transition away from biosim (cleanup invariant)"
  - "deleteMalfunction is fire-and-forget — UI clears optimistically, no rollback needed for cancel"
metrics:
  duration: "5m"
  completed_date: "2026-03-16"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
---

# Phase 8 Plan 01: BioSim Malfunction Service Layer + Store Branching Summary

**One-liner:** BioSim malfunction REST integration via dual-path triggerAnomaly/cancelAnomaly in Zustand store — optimistic sentinel guard for zero-JSX AnomalyDrawer compatibility.

## What Was Built

### biosimMalfunctions.ts
New service module providing the BioSim malfunction REST API wrappers:
- `BIOSIM_MALFUNCTION_MAP`: maps all 4 scenario IDs to BioSim module names (VCCR, Grey_Water_Store, Dirty_Water_Store, Nuclear_Source)
- `postMalfunction(simId, moduleName, intensity, length, tickToOccur?)`: POST to `/api/simulation/{simId}/modules/{moduleName}/malfunctions`; returns malfunctionID or null; omits `tickToOccur` when undefined or zero
- `deleteMalfunction(simId, moduleName, malfunctionId)`: DELETE to the malfunction URL; returns boolean

### habitat.ts type extensions
Three new fields added to `HabitatState` interface:
- `biosimSimId: string | null` — current BioSim simulation ID
- `biosimMalfunctionIds: Record<string, number>` — scenarioId -> malfunctionID map
- `setBiosimSimId: (id: string | null) => void` — setter for Plan 02

### habitatStore.ts dual-path logic
- `setSimSource` now clears `biosimMalfunctionIds` when transitioning away from `'biosim'`
- `triggerAnomaly`: BioSim path uses optimistic sentinel (`phase: 'peak'`, id: `-1`), fires POST, updates with real ID on success, rolls back on POST failure
- `triggerAnomaly`: fallback path preserves existing onset/bias-curve logic byte-for-byte (ANOM-04)
- `cancelAnomaly`: BioSim path resets to idle immediately, fires DELETE fire-and-forget
- `cancelAnomaly`: fallback path preserves existing recovery transition logic byte-for-byte (ANOM-04)

## Test Results

| Scope | Tests | Result |
| ----- | ----- | ------ |
| BIOSIM_MALFUNCTION_MAP | 4 | Pass |
| postMalfunction | 6 | Pass |
| deleteMalfunction | 4 | Pass |
| store: triggerAnomaly BioSim | 4 | Pass |
| store: cancelAnomaly BioSim | 3 | Pass |
| store: triggerAnomaly fallback | 3 | Pass |
| store: cancelAnomaly fallback | 1 | Pass |
| store: setSimSource clears IDs | 2 | Pass |
| **Existing suite (no regressions)** | 63 | Pass |
| **Total** | **90** | **All pass** |

TypeScript build: clean (exit 0, no errors).
AnomalyDrawer.tsx: NOT modified (verified via git diff).

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | b84f672 | feat(08-01): biosimMalfunctions service module + extended HabitatState types |
| 2 | ef1cff8 | feat(08-01): habitatStore dual-path triggerAnomaly/cancelAnomaly + store branch tests |
| 3 | (no files changed) | Verified: 90 tests pass, tsc clean, AnomalyDrawer unchanged |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `vi.waitFor` race condition in store branch test**
- **Found during:** Task 2 (first test run)
- **Issue:** `vi.waitFor` polling resolved before the `fetch` mock's `.json()` async chain completed, catching the sentinel `-1` value instead of the real `42` ID
- **Fix:** Replaced `vi.waitFor(...)` with `await new Promise(resolve => setTimeout(resolve, 0))` — flushes all pending microtasks deterministically in jsdom
- **Files modified:** `spatialhub-frontend/src/__tests__/biosimMalfunctions.test.ts`
- **Commit:** ef1cff8

## Self-Check: PASSED
