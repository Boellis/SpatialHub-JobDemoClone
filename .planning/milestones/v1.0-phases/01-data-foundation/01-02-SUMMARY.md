---
phase: 01-data-foundation
plan: "02"
subsystem: ui
tags: [zustand, simulation, typescript, react, mars-habitat]

requires: []

provides:
  - Zustand store (useHabitatStore) with 12 sensors across 4 zones initialized at nominal values
  - TypeScript type contracts for the entire simulation data model (SensorConfig, ZoneConfig, SensorReading, ZoneState, HabitatState)
  - Simulation constants: 4 zones x 3 sensors with Mars-realistic thresholds and drift parameters
  - Simulation engine: 2s tick, Brownian drift, sol cycle, intra-zone correlations, status derivation
  - Window DevTools exposure (__habitatStore) for console verification

affects:
  - 02-habitat-scene (reads from useHabitatStore for 3D zone coloring)
  - 03-sensor-panels (reads sensor readings and history arrays for panel display)
  - 04-anomaly-system (reads zone/sensor status for alert triggering)

tech-stack:
  added:
    - zustand v5 (zero-dep state management, React 19 compatible)
  patterns:
    - Zustand store with lazy engine import to break circular dependency
    - Engine stored at module scope (not in store state) to avoid serialization
    - Selector functions exported separately for component performance
    - Dynamic import of engine in startSimulation() — prevents circular dep at init

key-files:
  created:
    - spatialhub-frontend/src/types/habitat.ts
    - spatialhub-frontend/src/simulation/constants.ts
    - spatialhub-frontend/src/simulation/engine.ts
    - spatialhub-frontend/src/store/habitatStore.ts
  modified:
    - spatialhub-frontend/package.json (zustand added)

key-decisions:
  - "Dynamic import in startSimulation() breaks store->engine->store circular dependency without runtime cost"
  - "Engine stored at module scope (activeEngine variable) not in Zustand state — avoids serialization issues and prevents interval leak on stop"
  - "Sol cycle amplitude varies by sensor type: temperature +/-2C, power +/-15kW, others +/-2-3% of nominal"
  - "Intra-zone correlations are one-way nudges (~5-10% of deviation), not full physical simulation — keeps engine simple and values stable"
  - "Red threshold range used as physical clamp bounds — values cannot exceed critical limits"

patterns-established:
  - "Lazy dynamic import pattern: store uses import('../simulation/engine') inside action to avoid circular deps"
  - "Module-scope engine reference: let activeEngine: SimulationEngine | null outside Zustand create()"
  - "Selector factory functions: selectZone(zoneId) returns (state) => state.zones[zoneId] for stable refs"
  - "Threshold-derived status: green > yellow > red with symmetric bounds (both too-high and too-low trigger)"

requirements-completed: [SIM-01, SIM-02]

duration: 5min
completed: "2026-03-10"
---

# Phase 1 Plan 2: Simulation Engine Summary

**Zustand store + 2s simulation engine producing Mars-realistic telemetry across 12 sensors in 4 zones with Brownian drift, sol cycle, and intra-zone correlations**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-10T04:33:03Z
- **Completed:** 2026-03-10T04:38:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Full TypeScript type system for habitat simulation: `SensorConfig`, `ZoneConfig`, `SensorReading`, `ZoneState`, `HabitatState`, `ThresholdConfig`, `HabitatZone`
- Mars-realistic sensor configuration: 4 zones (Grow Bays, Atmosphere Control, Water Recycling, Power/Thermal), 3 sensors each — thresholds calibrated so normal drift occasionally reaches yellow
- Simulation engine running at 2s intervals: drift (mean-reverting Brownian, 0.02 pull factor), noise (per-sensor amplitude), sinusoidal sol cycle (10min period), intra-zone correlations (temp/humidity in grow bays, O2/pressure in atmosphere, pH/TDS in water, power/coolant in thermal)
- History arrays (30 values) ready for Phase 3 sparklines
- Verifiable from browser DevTools: `__habitatStore.getState().startSimulation()`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Zustand, create habitat types, zone constants, store skeleton** - `571dabb` (feat)
2. **Task 2: Build simulation engine with drift, noise, correlation, sol cycle** - `394760c` (feat)

## Files Created/Modified

- `spatialhub-frontend/src/types/habitat.ts` - Full type contracts for simulation data model
- `spatialhub-frontend/src/simulation/constants.ts` - ZONE_CONFIGS with 4 zones, 12 sensors, Mars thresholds, ZONE_MAP, SENSOR_MAP lookup maps
- `spatialhub-frontend/src/simulation/engine.ts` - SimulationEngine factory with full tick algorithm
- `spatialhub-frontend/src/store/habitatStore.ts` - Zustand store with start/stop/tick actions, zone status selectors, DevTools exposure
- `spatialhub-frontend/package.json` - zustand v5 added

## Decisions Made

- **Dynamic import for circular dep**: `startSimulation()` uses `import('../simulation/engine')` lazily — engine can import store at module scope safely since the dynamic import only resolves after both modules initialize
- **Module-scope engine reference**: `activeEngine: SimulationEngine | null` lives outside Zustand state — prevents serialization issues and ensures `stop()` correctly clears the setInterval inside the engine's closure
- **Sol cycle amplitudes**: Temperature +/-2C, Power +/-15kW, Battery +/-5%, CO2/humidity/O2 ~2-3% of nominal — creates visible but not overwhelming environmental rhythm
- **Correlation strength ~5-10%**: Keeps values stable while creating the appearance of coupled physics without actual simulation complexity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed interval leak in store stopSimulation()**
- **Found during:** Task 2 (engine wiring review)
- **Issue:** Original store stub stored only the interval handle (`engineInterval`), not the engine instance. `stopSimulation` would clear the module-level interval reference but NOT call `engine.stop()` — meaning the engine's internal closure `interval` variable would keep firing
- **Fix:** Changed store to hold `activeEngine: SimulationEngine | null` reference and call `activeEngine.stop()` on stop, which correctly calls `clearInterval` inside the engine's closure
- **Files modified:** `spatialhub-frontend/src/store/habitatStore.ts`
- **Verification:** TypeScript compiled clean, `stop()` trace confirms interval cleared
- **Committed in:** `394760c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Memory leak fix essential for correctness. No scope creep.

## Issues Encountered

- Pre-existing ESLint errors in 6 files unrelated to this plan (`any` types, unused `page` variable). Confirmed pre-existing via git stash verification. Logged to `deferred-items.md` — not fixed as they are out of scope per deviation rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Store is ready: `useHabitatStore.getState().startSimulation()` starts the engine
- Phase 2 (habitat scene) can read zone statuses via `selectAllZoneStatuses()` for 3D coloring
- Phase 3 (sensor panels) can read `SensorReading.history` arrays for sparklines
- No blockers

---
*Phase: 01-data-foundation*
*Completed: 2026-03-10*
