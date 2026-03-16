---
phase: 06-data-mapping-layer
plan: 01
subsystem: ui
tags: [vitest, typescript, biosim, sensor-mapping, tdd, ring-buffer]

# Dependency graph
requires:
  - phase: 05-docker-infrastructure
    provides: Live BioSim fixture (biosim_module_state.json) and module structure verified at tick 191

provides:
  - Pure mapBioSimToHabitatReadings function: BioSim module JSON -> Record<zoneId, Record<sensorId, SensorReading>>
  - appendRingBuffer helper capped at HISTORY_CAP=30 for sparkline history
  - BIOSIM_SENSOR_THRESHOLDS in constants.ts for 12 sensors across 4 zones
  - Vitest test infrastructure for frontend unit tests
  - 20 fixture-pinned unit tests verifying all 12 sensor conversions

affects:
  - phase-07-websocket-hook (calls mapBioSimToHabitatReadings on every BioSim message)
  - phase-09-live-dashboard (consumes SensorReading shape from mapper)

# Tech tracking
tech-stack:
  added: [vitest@4.1.0]
  patterns:
    - TDD with fixture-pinned tests before implementation
    - Omit-on-missing pattern (optional chaining, isFinite guard, no zero-fills)
    - Fixed ring buffer via array slide (no unbounded growth)
    - Separate BioSim thresholds from client-sim thresholds (BIOSIM_SENSOR_THRESHOLDS vs ZONE_CONFIGS)

key-files:
  created:
    - spatialhub-frontend/src/simulation/biosimMapper.ts
    - spatialhub-frontend/src/__tests__/biosimMapper.test.ts
    - spatialhub-frontend/vitest.config.ts
  modified:
    - spatialhub-frontend/src/simulation/constants.ts (added BIOSIM_SENSOR_THRESHOLDS)
    - spatialhub-frontend/package.json (added vitest, test script)
    - spatialhub-frontend/tsconfig.app.json (added resolveJsonModule)

key-decisions:
  - "BIOSIM_SENSOR_THRESHOLDS are separate from ZONE_CONFIGS/SENSOR_MAP — BioSim operates at different ranges (e.g., gb-humidity green 15-35% vs client-sim 45-65%)"
  - "deriveBioSimStatus is unexported — only biosimMapper.ts uses it; avoids leaking BioSim logic into the rest of the app"
  - "existingHistory parameter is optional on mapBioSimToHabitatReadings — keeps mapper pure; Phase 7 hook manages state and passes history on each call"
  - "appendRingBuffer uses array slide (not Array.slice) for O(n) but avoids allocating new arrays beyond cap size"
  - "vitest environment: node (not jsdom) — mapper is pure TS, no DOM APIs needed"

patterns-established:
  - "BioSim mapper pattern: extract via optional chaining, validate with isFinite, omit on invalid (never zero-fill)"
  - "Ring buffer pattern: appendRingBuffer(history, value) -> slides window at cap, grows freely below cap"

requirements-completed: [TELE-02, PERF-03]

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 6 Plan 1: BioSim Data Mapping Layer Summary

**Pure TypeScript mapper translating BioSim physics module JSON to SensorReading records via 12 fixture-verified unit conversions, with a fixed-cap ring buffer for PERF-03 sparkline history**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-16T03:24:01Z
- **Completed:** 2026-03-16T03:28:41Z
- **Tasks:** 2 (RED phase + GREEN phase)
- **Files modified:** 6

## Accomplishments

- Installed and configured vitest with node environment; all tests run against the live Phase 5 fixture
- Implemented mapBioSimToHabitatReadings covering all 12 sensors across 4 zones with correct unit conversions verified by 20 fixture-pinned tests
- BIOSIM_SENSOR_THRESHOLDS added to constants.ts so all 12 steady-state BioSim values derive green status
- appendRingBuffer caps at HISTORY_CAP=30, satisfying PERF-03 (no unbounded array growth)
- Omit-on-missing pattern ensures missing BioSim modules produce sensor omission, never zero-fills

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vitest, configure test runner, add BIOSIM_SENSOR_THRESHOLDS, write failing tests** - `e83a294` (test)
2. **Task 2: Implement biosimMapper.ts to make all tests pass** - `d76ae60` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks have two commits (test RED -> feat GREEN). No REFACTOR commit needed — implementation was clean on first pass._

## Files Created/Modified

- `spatialhub-frontend/src/simulation/biosimMapper.ts` - Pure mapping function; exports mapBioSimToHabitatReadings, appendRingBuffer, HISTORY_CAP
- `spatialhub-frontend/src/__tests__/biosimMapper.test.ts` - 20 fixture-pinned tests (all sensors, ring buffer, omit-on-missing)
- `spatialhub-frontend/vitest.config.ts` - Vitest config with @vitejs/plugin-react and node environment
- `spatialhub-frontend/src/simulation/constants.ts` - Added BIOSIM_SENSOR_THRESHOLDS (12 sensors), ThresholdConfig import
- `spatialhub-frontend/package.json` - Added vitest devDependency and test script
- `spatialhub-frontend/tsconfig.app.json` - Added resolveJsonModule for JSON fixture imports

## Decisions Made

- BIOSIM_SENSOR_THRESHOLDS are separate from ZONE_CONFIGS/SENSOR_MAP — BioSim operates at different ranges (e.g., gb-humidity green 15-35% vs client-sim 45-65%)
- deriveBioSimStatus is unexported local function — avoids leaking BioSim threshold logic into the rest of the app
- existingHistory parameter is optional — mapper stays pure; Phase 7 hook manages state continuity
- vitest environment: node (not jsdom) — mapper is pure TypeScript, no DOM APIs needed

## Deviations from Plan

None — plan executed exactly as written. All sensor mappings, thresholds, and ring buffer logic matched the specified implementation precisely.

## Issues Encountered

None. All 20 tests passed on first implementation attempt. `npm run build` passes cleanly (chunk size warning for Three.js is pre-existing, unrelated to this plan).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- biosimMapper.ts is ready to be imported by Phase 7's WebSocket hook
- Phase 7 hook should call `mapBioSimToHabitatReadings(message.modules, Date.now(), prevHistory)` where prevHistory is tracked in component/store state
- All 12 sensor IDs and zone IDs are established as the canonical mapping contract
- The `appendRingBuffer` helper is also available for Phase 7 to maintain history across ticks

## Self-Check: PASSED

- biosimMapper.ts: FOUND
- biosimMapper.test.ts: FOUND
- vitest.config.ts: FOUND
- 06-01-SUMMARY.md: FOUND
- Commit e83a294 (test RED): FOUND
- Commit d76ae60 (feat GREEN): FOUND

---
*Phase: 06-data-mapping-layer*
*Completed: 2026-03-16*
