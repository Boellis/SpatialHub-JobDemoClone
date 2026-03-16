---
phase: 07-frontend-websocket-fallback
plan: 01
subsystem: frontend-data-pipeline
tags: [websocket, web-worker, state-machine, raf-buffer, fallback, zustand]
dependency_graph:
  requires:
    - 06-01-SUMMARY.md  # biosimMapper.ts (mapBioSimToHabitatReadings)
  provides:
    - useSimSource hook (BioSim WS pipeline + fallback orchestration)
    - biosimWorker.ts (Worker-owned WebSocket)
    - SimSource type + store field
    - WorkerCommand/WorkerMessage protocol types
  affects:
    - spatialhub-frontend/src/types/habitat.ts
    - spatialhub-frontend/src/store/habitatStore.ts
tech_stack:
  added:
    - "@vitest/web-worker": "^0.4.2"
    - "jsdom": "^26.1.0"
    - "@testing-library/react": "^16.3.0"
    - "@testing-library/jest-dom": "^6.6.3"
  patterns:
    - Module Web Worker (Vite { type: 'module' } pattern)
    - RAF buffer (last-value-wins, single tick per frame)
    - Exponential backoff retry state machine
    - Zustand imperative access (getState()) inside non-React contexts
key_files:
  created:
    - spatialhub-frontend/src/types/habitat.ts  # SimSource + WorkerCommand/WorkerMessage types added
    - spatialhub-frontend/src/store/habitatStore.ts  # simSource field + setSimSource + selectSimSource
    - spatialhub-frontend/src/workers/biosimWorker.ts
    - spatialhub-frontend/src/hooks/useSimSource.ts
    - spatialhub-frontend/src/__tests__/habitatStore.simSource.test.ts
    - spatialhub-frontend/src/__tests__/biosimWorker.test.ts
    - spatialhub-frontend/src/__tests__/useSimSource.test.ts
  modified:
    - spatialhub-frontend/tsconfig.app.json  # added "WebWorker" to lib array
    - spatialhub-frontend/package.json  # added dev deps
decisions:
  - "probeBioSim exported for unit testing — pure async function with no side effects"
  - "vsUrl + RETRY_DELAYS + DISCONNECTED_DISPLAY_MS exported as constants — testable without hook machinery"
  - "Worker logic extracted to testable inline re-implementation in biosimWorker.test.ts — pragmatism over ceremony (as per plan guidance)"
  - "vi.useFakeTimers with advanceTimersByTimeAsync (not runAllTimersAsync) — avoids infinite loop from engine setInterval"
  - "Store startSimulation/stopSimulation patched to no-ops in useSimSource tests — decouples hook tests from engine timing"
metrics:
  duration: "9m 18s"
  completed: "2026-03-16T05:08:01Z"
  tasks_completed: 3
  files_created: 7
  files_modified: 2
  tests_added: 33
  total_tests_passing: 53
---

# Phase 7 Plan 01: BioSim WebSocket Data Pipeline Summary

**One-liner:** Worker-owned WebSocket with RAF-buffered store updates and a probe/fallback/reconnection state machine — all JSON parsing off the render thread, zero blank-screen time.

## What Was Built

The complete BioSim data backbone for Phase 7:

1. **Type contracts** (`habitat.ts`): `SimSource` union type (`'connecting' | 'biosim' | 'fallback' | 'disconnected'`), plus `WorkerCommand` and `WorkerMessage` discriminated union types for the main-thread/Worker protocol.

2. **Store integration** (`habitatStore.ts`): `simSource` field (default `'connecting'`), `setSimSource` action, and `selectSimSource` selector. These surface connection state to UI without any extra subscriptions.

3. **biosimWorker.ts**: Module Worker that owns the full WebSocket lifecycle. Imports `mapBioSimToHabitatReadings` via ESM (runs on Worker thread, not render thread). Handles `CONNECT` / `DISCONNECT` / `SYNC_HISTORY` commands. Posts `READINGS` / `WS_OPEN` / `WS_CLOSE` / `WS_ERROR` messages. Maintains `existingHistory` across reconnections for sparkline continuity. Silently drops malformed JSON frames without crashing.

4. **useSimSource.ts**: Single `useEffect` managing the entire lifecycle — immediate client-side engine start, BioSim probe, Worker creation, RAF loop, exponential backoff reconnection (3 attempts: 1s/2s/4s), 15s background probe for auto-reconnect from fallback, and clean teardown on unmount. FALL-04 invariant enforced: exactly one data source active at any time.

## Test Coverage

| Suite | Tests | Coverage |
|-------|-------|----------|
| habitatStore.simSource | 6 | simSource transitions, selectSimSource, field isolation |
| biosimWorker (inline core) | 11 | WS events, READINGS shape, DISCONNECT, SYNC_HISTORY, history continuity |
| useSimSource (pure) | 8 | probeBioSim formats, wsUrl derivation |
| useSimSource (hook) | 8 | FALL-01/02/04, PERF-05/07, TELE-03, cleanup |
| **Total (plan 01)** | **33** | |
| **Total (suite)** | **53** | (includes 20 existing biosimMapper tests) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] jsdom package not installed**
- **Found during:** Task 1 (first test run with `@vitest-environment jsdom` docblock)
- **Issue:** Vitest couldn't find jsdom for environment switching — the `@vitest-environment jsdom` docblock requires jsdom installed as a dev dependency
- **Fix:** `npm install --save-dev jsdom`
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** baa6aa8

**2. [Rule 1 - Bug] Fake timer infinite loop from sim engine's setInterval**
- **Found during:** Task 3 (first useSimSource hook test run)
- **Issue:** `vi.runAllTimersAsync()` hit the 10,000-timer abort limit because `startSimulation()` dynamically imports and starts the real engine with a 2-second `setInterval`, which fires infinitely under fake timers
- **Fix:** Changed tests to use `vi.advanceTimersByTimeAsync()` with specific durations, and patched `startSimulation`/`stopSimulation` in the store to no-ops before each test (avoids the engine's dynamic import entirely)
- **Files modified:** `src/__tests__/useSimSource.test.ts`
- **Commit:** 0fe4de2

**3. [Rule 1 - Bug] TypeScript error: vi.fn() type incompatible with store action type**
- **Found during:** Task 3 (production build verification)
- **Issue:** `vi.fn()` returns `Mock<Procedure | Constructable>` which doesn't match `() => void` expected by `HabitatState.startSimulation`
- **Fix:** Added `as unknown as () => void` cast when patching store state in tests
- **Files modified:** `src/__tests__/useSimSource.test.ts`
- **Commit:** 0fe4de2

**4. [Rule 3 - Deviation] Worker testability approach**
- **Found during:** Task 2 (test design)
- **Issue:** `@vitest/web-worker` requires a real browser runtime for module Workers with Vite-specific `import.meta.url` paths — not available in the jsdom environment
- **Fix:** Per plan's explicit guidance ("Pragmatism over ceremony"), tested Worker core logic via an inline re-implementation that mirrors `biosimWorker.ts` exactly, using a `MockWebSocket`. The re-implementation is explicitly documented as a mirror of the Worker file.
- **Files modified:** `src/__tests__/biosimWorker.test.ts`
- **Commit:** 27fc2d7

## Self-Check: PASSED

All 8 target files exist on disk. All 3 task commits found in git log:
- `baa6aa8` — Task 1: types, store, tsconfig, deps
- `27fc2d7` — Task 2: biosimWorker.ts
- `0fe4de2` — Task 3: useSimSource.ts

Build: `npm run build` succeeds with Worker bundled by Vite (no errors, size warning only — pre-existing chunk size issue unrelated to this plan).
TypeScript: `npx tsc --noEmit` exits clean.
Tests: 53/53 passing across 4 test files.
