---
phase: 15-frontend-real-sensor-visibility
plan: 01
subsystem: ui
tags: [react, zustand, typescript, vitest, biosim, iot, websocket]

# Dependency graph
requires:
  - phase: 14-closed-loop-control-service
    provides: Pi pH data flowing into Cloud SQL via sensor-ingest endpoint
  - phase: 13-pi-to-cloud-pipeline
    provides: useLiveSensors hook polling /api/enriched/?hub_id=pi-habitat-01

provides:
  - SimSource union with 5th value 'biosim-real'
  - piDataFresh boolean state and setPiDataFresh action in habitatStore
  - STALE_THRESHOLD_MS=30000 exported constant in useLiveSensors
  - Badge upgrade logic: biosim -> biosim-real on successful Pi poll
  - Badge downgrade logic: biosim-real -> biosim when Pi data stale (>30s)
  - ConnectionBadge 5th entry: teal #00ffcc "BioSim + Real Sensor"
  - selectPiDataFresh selector exported from habitatStore

affects: [deploy, nasa-judge-demo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Badge upgrade/downgrade via lastSuccessfulPollRef timestamp + STALE_THRESHOLD_MS comparison"
    - "Staleness check runs at START of poll cycle AND in catch/empty-data branches"
    - "biosim-real preserves biosimMalfunctionIds (same as biosim) — malfunction API still works in upgraded state"

key-files:
  created: []
  modified:
    - spatialhub-frontend/src/types/habitat.ts
    - spatialhub-frontend/src/store/habitatStore.ts
    - spatialhub-frontend/src/hooks/useLiveSensors.ts
    - spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx
    - spatialhub-frontend/src/__tests__/useLiveSensors.test.ts
    - spatialhub-frontend/src/__tests__/ConnectionBadge.test.tsx

key-decisions:
  - "biosim-real preserves biosimMalfunctionIds — triggerAnomaly/cancelAnomaly work identically in upgraded state"
  - "Staleness check runs at poll START (not just on failure) to catch empty-response stale case"
  - "Badge upgrade happens only when readings.length > 0 AND tick() called — empty successful polls don't refresh freshness"
  - "Teal color #00ffcc matches LIVE badge color in ZonePanel (design consistency decision from Phase 14)"

patterns-established:
  - "Freshness tracking: useRef<number>(0) timestamp + STALE_THRESHOLD_MS constant, checked at poll start and error branches"
  - "Badge state machine: simSource drives BADGE_CONFIG lookup — adding a new SimSource value + BADGE_CONFIG entry is all that's needed"

requirements-completed: [UI-01, UI-02]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 15 Plan 01: Frontend Real Sensor Visibility Summary

**5th HUD badge state "BioSim + Real Sensor" (teal) activates when BioSim WS is connected AND Pi pH data polled within 30s, confirming physical hardware is driving the simulation**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-20T18:15:07Z
- **Completed:** 2026-03-20T18:19:44Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- SimSource union extended with 'biosim-real' — full type safety across store, badge, and hook
- habitatStore tracks Pi data freshness (piDataFresh bool + setPiDataFresh action + selectPiDataFresh selector)
- useLiveSensors upgrades badge biosim -> biosim-real on successful Pi poll, downgrades on stale (>30s)
- ConnectionBadge renders 5th state: teal dot + "BioSim + Real Sensor" label
- All 100 tests pass (8 existing + 2 new badge tests + 1 new STALE_THRESHOLD_MS test), production build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: SimSource 5th value, store piDataFresh state, useLiveSensors freshness tracking** - `ca66e01` (feat)
2. **Task 2: 5th BADGE_CONFIG entry to ConnectionBadge and tests** - `0f478bb` (feat)

**Plan metadata:** (docs commit to follow)

_Note: TDD tasks had test-first commits baked into the task commit (RED tests written, implementation followed in same commit per TDD flow)_

## Files Created/Modified
- `spatialhub-frontend/src/types/habitat.ts` - Added 'biosim-real' to SimSource union, piDataFresh + setPiDataFresh to HabitatState interface
- `spatialhub-frontend/src/store/habitatStore.ts` - piDataFresh initial state, setPiDataFresh action, selectPiDataFresh selector, setSimSource/triggerAnomaly/cancelAnomaly updated for biosim-real
- `spatialhub-frontend/src/hooks/useLiveSensors.ts` - STALE_THRESHOLD_MS export, lastSuccessfulPollRef, badge upgrade on success, badge downgrade on stale/error
- `spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx` - 5th BADGE_CONFIG entry 'biosim-real' with teal #00ffcc, header comment updated
- `spatialhub-frontend/src/__tests__/useLiveSensors.test.ts` - STALE_THRESHOLD_MS regression guard test
- `spatialhub-frontend/src/__tests__/ConnectionBadge.test.tsx` - 2 tests for biosim-real label and dot color

## Decisions Made
- biosim-real preserves biosimMalfunctionIds — malfunction API (anomaly drawer) continues working when badge is upgraded
- triggerAnomaly and cancelAnomaly updated to handle biosim-real source alongside biosim
- Staleness check at poll START catches the edge case where successful HTTP responses return empty data
- Badge upgrade only fires when `readings.length > 0` AND `tick()` is called — a poll returning 0 readings doesn't count as "fresh"

## Deviations from Plan

None — plan executed exactly as written. The TypeScript exhaustiveness error in ConnectionBadge after Task 1 was the expected transient state between tasks (adding SimSource value breaks exhaustive Record check until Task 2 adds the corresponding BADGE_CONFIG entry).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UI-02 complete — HUD badge confirms physical hardware connection visually
- UI-01 was already complete from Phase 13/14 (Pi pH annotation in ZonePanel)
- Phase 15 (frontend real sensor visibility) is fully complete
- NASA judge demo path is ready: BioSim connected + Pi polling = teal badge + pH annotation in ZonePanel

---
*Phase: 15-frontend-real-sensor-visibility*
*Completed: 2026-03-20*
