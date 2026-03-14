---
phase: 04-anomaly-system
plan: 01
subsystem: ui
tags: [zustand, typescript, simulation, react, vite]

# Dependency graph
requires:
  - phase: 03-ui-panels-and-live-data
    provides: habitatStore Zustand store, simulation engine, HabitatState interface, sensor reading infrastructure
provides:
  - AnomalyPhase, AnomalyScenarioState, ScenarioAnnouncement types in habitat.ts
  - ANOMALY_SCENARIOS array (4 scenarios) with sensor bias deltas in anomalies.ts
  - getAnomalyBias() pure function for multi-scenario additive bias accumulation
  - triggerAnomaly/cancelAnomaly/tickAnomalies/dismissAnnouncement Zustand actions
  - anomalyBias parameter in engine computeNewValue() injected before value clamp
  - Automatic onset/peak/recovery/idle phase state machine with 30s total arc
affects:
  - 04-02 (anomaly UI controls — reads ANOMALY_SCENARIOS, calls triggerAnomaly/cancelAnomaly, subscribes to anomalies state)
  - Any phase adding new sensor types must add entries to ANOMALY_SCENARIOS if crisis scenarios are desired

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure bias accumulation function: getAnomalyBias() takes anomaly state as parameter, no store access — easy to test and compose"
    - "AnomalyPhase state machine: onset->peak->recovery->idle with explicit ticksInPhase counter and biasFactor lerp"
    - "Toggle trigger: calling triggerAnomaly on an already-active anomaly delegates to cancelAnomaly (graceful early recovery)"
    - "Critical tick ordering: anomalies read at tick() top, bias applied during sensor computation, tickAnomalies() called after state.tick()"

key-files:
  created:
    - spatialhub-frontend/src/simulation/anomalies.ts
  modified:
    - spatialhub-frontend/src/types/habitat.ts
    - spatialhub-frontend/src/store/habitatStore.ts
    - spatialhub-frontend/src/simulation/engine.ts

key-decisions:
  - "AnomalyPhase type annotation required on newPhase variable in tickAnomalies() — tsc -b (project references) is stricter than --noEmit on type widening for union assignments"
  - "tickAnomalies() ordering: advance ticks THEN compute biasFactor THEN check transitions — prevents first-tick bias skip and frame-boundary jumps"
  - "Toggle trigger pattern: re-triggering active anomaly cancels it (moves to recovery) rather than restarting from onset — preserves current biasFactor as recovery start"

patterns-established:
  - "Pure simulation helpers: anomaly bias functions receive state as parameters — no store access, composable and testable"
  - "Phase timer pattern: ticksInPhase + phase string + biasFactor in AnomalyScenarioState — encodes full lerp state in three fields"

requirements-completed: [ANOM-01, ANOM-02, ANOM-03]

# Metrics
duration: 20min
completed: 2026-03-13
---

# Phase 4 Plan 01: Anomaly State Machine Summary

**Zustand anomaly state machine with 4 crisis scenarios (co2-spike, pump-failure, nutrient-crash, power-fluctuation) that ramp sensor values into red thresholds via onset/peak/recovery phase lerp over a 30-second arc**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-13T00:00:00Z
- **Completed:** 2026-03-13T00:20:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Four anomaly scenarios defined with research-validated crisisDeltas that push sensors deep into red threshold ranges
- Zustand store extended with anomaly state machine: onset (5 ticks, 0->1 biasFactor), peak (7 ticks at 1.0, auto-timeout), recovery (5 ticks, 1->0)
- Engine tick now reads anomalies state, calls getAnomalyBias() per sensor, and advances phase timers via tickAnomalies() after sensor values are committed
- Production build passes; calling `__habitatStore.getState().triggerAnomaly('co2-spike')` from DevTools will drive gb-co2 toward ~4300ppm over 10s

## Task Commits

1. **Task 1: Define anomaly types and scenario configuration** - `122b285` (feat)
2. **Task 2: Extend store with anomaly actions and inject bias into engine tick** - `71ccbad` (feat)

## Files Created/Modified
- `spatialhub-frontend/src/simulation/anomalies.ts` - Created: ANOMALY_SCENARIOS array, AnomalyScenario/SensorBias interfaces, getAnomalyBias() pure function
- `spatialhub-frontend/src/types/habitat.ts` - Added AnomalyPhase, AnomalyScenarioState, ScenarioAnnouncement types; extended HabitatState with anomaly fields and action signatures
- `spatialhub-frontend/src/store/habitatStore.ts` - Added anomalies/scenarioAnnouncements initial state; implemented triggerAnomaly, cancelAnomaly, tickAnomalies, dismissAnnouncement
- `spatialhub-frontend/src/simulation/engine.ts` - Added getAnomalyBias import, anomalyBias param to computeNewValue, anomalies destructuring in tick(), tickAnomalies() call after state.tick()

## Decisions Made
- `tsc -b` (project references) is stricter than `--noEmit` on type narrowing: explicit `AnomalyPhase` annotation on `newPhase` was required in `tickAnomalies()` to allow assigning `'idle'` within the recovery case
- Toggle trigger: re-triggering an active anomaly gracefully cancels it (transitions to recovery from current biasFactor) rather than resetting to onset — better UX for demo panel use
- Tick ordering is critical: anomaly state read at top of tick, bias applied per-sensor during computation, tickAnomalies() called last — ensures current tick's biasFactor is applied before incrementing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript `tsc -b` type error on AnomalyPhase assignment**
- **Found during:** Task 2 (production build verification)
- **Issue:** `tsc -b` narrowed `newPhase` to `'onset' | 'peak' | 'recovery'` from the switch discriminant, making `newPhase = 'idle'` in the recovery case fail type check
- **Fix:** Added `AnomalyPhase` to the import list and explicitly typed `let newPhase: AnomalyPhase = entry.phase`
- **Files modified:** spatialhub-frontend/src/store/habitatStore.ts
- **Verification:** `npm run build` passes with zero TypeScript errors
- **Committed in:** 71ccbad (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix was necessary for production build correctness. `--noEmit` masked the issue; `tsc -b` caught it. No scope creep.

## Issues Encountered
- `npx tsc --noEmit` reported zero errors after Task 2 changes, but `npm run build` (which uses `tsc -b` for project references) caught a type narrowing issue in `tickAnomalies()`. The fix was a one-line type annotation.

## User Setup Required
None - no external service configuration required. Anomaly system is fully client-side.

## Next Phase Readiness
- Anomaly state machine is complete and ready for UI controls (04-02)
- `triggerAnomaly(scenarioId)` / `cancelAnomaly(scenarioId)` are the only public API surface the UI panel needs to call
- `ANOMALY_SCENARIOS` is exported from anomalies.ts for the panel to enumerate available scenarios and display labels/icons
- All existing reactive infrastructure (dome pulsing, alert banners, sparklines) responds automatically via sensor value changes — no 04-02 wiring needed for those

---
*Phase: 04-anomaly-system*
*Completed: 2026-03-13*

## Self-Check: PASSED

- anomalies.ts: FOUND
- habitat.ts: FOUND
- habitatStore.ts: FOUND
- engine.ts: FOUND
- 04-01-SUMMARY.md: FOUND
- Commit 122b285: FOUND
- Commit 71ccbad: FOUND
