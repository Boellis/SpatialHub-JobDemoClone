---
phase: 07-frontend-websocket-fallback
plan: 02
subsystem: ui
tags: [react, zustand, websocket, animation, connection-badge, habitat-hud, vitest, testing-library]

# Dependency graph
requires:
  - phase: 07-01
    provides: useSimSource hook, SimSource type, selectSimSource selector, biosimWorker.ts
  - phase: 06-01
    provides: mapBioSimToHabitatReadings (consumed by biosimWorker.ts)
provides:
  - ConnectionBadge component (SimSource-driven pill badge with pulse animation)
  - HabitatHUD v2 (ConnectionBadge below zone row)
  - HabitatView rewired to useSimSource (no direct simulation management)
  - End-to-end BioSim pipeline: Worker WS -> store -> 3D scene + HUD badge
affects:
  - 08-django-ingest-bridge  # HabitatView architecture now stable, WS pipeline established
  - 09-history-trends        # Zustand simSource state available for trend data source switching

# Tech tracking
tech-stack:
  added:
    - "@testing-library/react": "^16.3.0"
    - "@testing-library/jest-dom": "^6.6.3"
  patterns:
    - CSS keyframe injection via ensureXxxAnimationsInjected() (AlertBanner pattern, now ConnectionBadge)
    - SimSource-driven config map: Record<SimSource, BadgeConfig> for zero-conditional rendering
    - Pulse animation via pulsing state bool + useRef previous-value comparison for change detection
    - Granular Zustand selector on single field (PERF-02): ConnectionBadge subscribes to simSource only

key-files:
  created:
    - spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx
    - spatialhub-frontend/src/__tests__/ConnectionBadge.test.tsx
  modified:
    - spatialhub-frontend/src/components/habitat/HabitatHUD.tsx
    - spatialhub-frontend/src/pages/HabitatView.tsx

key-decisions:
  - "ConnectionBadge uses SimSource config map (not switch/if) — adding a 5th state requires one map entry only"
  - "useRef for previous simSource detection — no extra store fields, zero re-renders on change detection logic"
  - "BioSim probe response is wrapped: { simulations: [1] } not a bare array — probe URL check updated to handle both shapes"

patterns-established:
  - "CSS keyframe injection: ensureXxxAnimationsInjected() pattern — inject once, idempotent, matches AlertBanner.tsx"
  - "Config map pattern for state-driven UI: Record<SimSource, ...> eliminates conditionals, easy to extend"

requirements-completed: [TELE-04, FALL-03, PERF-02, PERF-05]

# Metrics
duration: "~15min (including checkpoint verification)"
completed: "2026-03-16"
---

# Phase 7 Plan 02: View Layer Wiring + Connection Badge Summary

**ConnectionBadge pill component (green/grey/red/amber per SimSource state with pulse) wired into HabitatHUD, and HabitatView decoupled from simulation management via useSimSource — completing the full BioSim WebSocket pipeline end-to-end.**

## Performance

- **Duration:** ~15 min (including human verification checkpoint)
- **Started:** 2026-03-16
- **Completed:** 2026-03-16
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments

- ConnectionBadge component renders correct label and color for all 4 SimSource states with CSS keyframe pulse on state change
- HabitatHUD now shows the badge below the zone status row — visible indicator of live vs fallback mode
- HabitatView decoupled from direct simulation management: removed startSimulation/isRunning subscriptions, added single useSimSource() call
- Full end-to-end pipeline human-verified: fallback mode (no Docker), BioSim live mode (with Docker), navigation lifecycle (no WS leaks), badge visual quality

## Task Commits

Each task was committed atomically:

1. **Task 1: ConnectionBadge + HabitatHUD integration + HabitatView rewire** - `89e09d4` (feat)
2. **Bugfix: handle wrapped BioSim probe response** - `648d932` (fix — during Task 2 verification)

**Plan metadata:** (this commit — docs: complete plan)

_Note: The bugfix commit 648d932 was triggered during Task 2 human verification: BioSim probe returned `{ simulations: [1] }` instead of a bare array, causing the probe to fail and badge to stay in fallback mode when Docker was running._

## Files Created/Modified

- `spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx` — Pill badge driven by SimSource; green/grey/red/amber dot + label; CSS pulse animation on state change; PERF-02 granular selector
- `spatialhub-frontend/src/__tests__/ConnectionBadge.test.tsx` — 5 tests covering all 4 SimSource states and dot color; uses @testing-library/react
- `spatialhub-frontend/src/components/habitat/HabitatHUD.tsx` — Added ConnectionBadge import and Row 6 render below zone status row
- `spatialhub-frontend/src/pages/HabitatView.tsx` — Removed startSimulation/isRunning subscriptions and useEffect; added useSimSource() call

## Decisions Made

- **Config map over conditionals:** `BADGE_CONFIG: Record<SimSource, { dot, label, textColor }>` means zero if/switch in render — TypeScript exhaustiveness check is the safety net. Adding a 5th state requires one map entry.
- **useRef for change detection:** Previous simSource tracked in a ref, not a store field. Keeps pulse logic purely local to ConnectionBadge with no external state side effects.
- **BioSim probe response shape:** During verification, discovered BioSim's `/api/simulation` returns `{ simulations: [1] }` (wrapped object) not a bare array. Updated probe to check `Array.isArray(data) || Array.isArray(data?.simulations)` — handles both current and potential future response shapes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BioSim probe failed to detect running simulation**
- **Found during:** Task 2 (human verification — Test 2: BioSim mode with Docker)
- **Issue:** `probeBioSim` checked `Array.isArray(data)` but BioSim's actual response is `{ simulations: [1] }` — a wrapped object. Probe always returned `false` even when Docker container was healthy and BioSim was running.
- **Fix:** Updated probe conditional to `Array.isArray(data) || (Array.isArray(data?.simulations) && data.simulations.length > 0)` — handles both bare array and wrapped response shapes.
- **Files modified:** `spatialhub-frontend/src/hooks/useSimSource.ts`
- **Verification:** After fix, badge correctly transitioned to "BioSim Live" (green) when Docker was running. All 4 test scenarios then passed.
- **Committed in:** `648d932`

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in probe response parsing)
**Impact on plan:** Essential fix — without it, BioSim mode never activated. No scope creep.

## Issues Encountered

None beyond the auto-fixed probe response shape bug. All tests passed on first run after @testing-library/react was already available from Plan 01 installation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full Phase 7 pipeline complete: Worker WS -> RAF buffer -> store tick -> 3D scene + HabitatHUD badge
- HabitatView architecture stable and decoupled — Phase 8 (Django ingest bridge) can add a second data path without touching view layer
- simSource Zustand field available for Phase 9 (history/trends) to switch data sources based on connection state
- No blockers for Phase 8

---
*Phase: 07-frontend-websocket-fallback*
*Completed: 2026-03-16*
