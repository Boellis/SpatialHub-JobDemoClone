---
phase: 17-tv-scaffold-priority-foundation
plan: 02
subsystem: ui
tags: [react, react-three-fiber, vitest, typescript, zustand]

# Dependency graph
requires:
  - phase: 17-01
    provides: usePriorityRanking hook returning ranked zone IDs with 3-tick debounce
provides:
  - TvDashboardView.tsx non-interactive TV page scaffold with R3F Canvas (events=null)
  - /habitat route wired to TvDashboardView via React.lazy
  - Dev debug overlay showing usePriorityRanking ranked zone list with live scores
  - src/components/tv/ directory stub for Phase 18 PriorityGrid landing zone
affects:
  - phase-18-priority-grid
  - phase-20-parallax-background

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TV page hooks pattern: useSimSource and useLiveSensors at component root, NOT inside R3F Canvas"
    - "R3F events=null: cast as null as unknown as undefined to satisfy TypeScript while preserving null at runtime"
    - "Non-interactive overlay: pointerEvents:'none' on all debug UI elements"

key-files:
  created:
    - spatialhub-frontend/src/pages/TvDashboardView.tsx
    - spatialhub-frontend/src/__tests__/TvDashboardView.test.tsx
    - spatialhub-frontend/src/components/tv/.gitkeep
  modified:
    - spatialhub-frontend/src/App.tsx

key-decisions:
  - "R3F events=null cast: null as unknown as undefined satisfies TypeScript without altering runtime behavior — null is still passed, raycaster disabled"
  - "scoreZone duplicated locally in TvDashboardView (not imported from usePriorityRanking) — acceptable dev debug duplication, removed in Phase 18 when PriorityGrid lands"
  - "Variable name HabitatView preserved in App.tsx lazy import — rename deferred, JSX reuse is cleaner"

patterns-established:
  - "TV route lazy-loading: React.lazy + Suspense with #06070b void background matches TvDashboardView bg"
  - "R3F events null pattern: pass null to disable all pointer/raycaster events on Canvas"

requirements-completed: [LAYOUT-01]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 17 Plan 02: TV Dashboard Scaffold Summary

**Non-interactive full-viewport TV page wired to /habitat: R3F Canvas (events=null), useSimSource/useLiveSensors at root, usePriorityRanking dev debug overlay, 114/114 tests green**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-22T02:06:40Z
- **Completed:** 2026-03-22T02:09:00Z
- **Tasks:** 1 of 2 automated (Task 2 is human-verify checkpoint)
- **Files modified:** 4

## Accomplishments

- TvDashboardView.tsx scaffold: fixed black void background, empty R3F Canvas with events=null (no raycaster), useSimSource + useLiveSensors mounted at DOM level (not inside Canvas), usePriorityRanking debug list in top-left corner with live scores
- App.tsx: lazy import swapped from HabitatView to TvDashboardView, Suspense fallback background updated to #06070b, loading text updated to "LOADING HABITAT"
- 5 smoke tests pass: render, Canvas events=null, ranked zone IDs visible, no event handler attributes in rendered HTML, hook invocation verified
- Full test suite: 114/114 passing across 10 test files

## Task Commits

1. **Task 1: TvDashboardView scaffold + route wire + smoke tests** - `0b79c4c` (feat)

## Files Created/Modified

- `spatialhub-frontend/src/pages/TvDashboardView.tsx` - Non-interactive TV dashboard page, 70 lines
- `spatialhub-frontend/src/App.tsx` - Lazy import updated to TvDashboardView, Suspense fallback updated
- `spatialhub-frontend/src/__tests__/TvDashboardView.test.tsx` - 5 smoke tests (jsdom environment)
- `spatialhub-frontend/src/components/tv/.gitkeep` - Phase 18 PriorityGrid landing zone stub

## Decisions Made

- `events={null as unknown as undefined}`: R3F Canvas prop type does not accept `null` directly in TypeScript, but passing null disables the raycaster at runtime. The cast satisfies the compiler while preserving the intended runtime behavior.
- scoreZone function duplicated locally in TvDashboardView rather than exported from usePriorityRanking — it's a dev debug display item slated for removal in Phase 18, duplication is preferable to polluting the hook's public API.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript type error: Canvas events prop rejects null**
- **Found during:** Task 1 (TvDashboardView creation)
- **Issue:** `events={null}` fails tsc with "Type 'null' is not assignable to type '((store: RootStore) => EventManager<HTMLElement>) | undefined'"
- **Fix:** Cast to `null as unknown as undefined` — TypeScript satisfied, null still passed at runtime, raycaster still disabled
- **Files modified:** spatialhub-frontend/src/pages/TvDashboardView.tsx
- **Verification:** tsc -b exits 0; test "Canvas receives events={null}" confirms data-events="null" at runtime
- **Committed in:** 0b79c4c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking TypeScript type mismatch)
**Impact on plan:** Minimal. Cast is invisible to consumers — null behavior preserved. Must-have truth #3 ("R3F Canvas has events={null}") satisfied.

## Issues Encountered

None beyond the TypeScript cast above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- /habitat route delivers TvDashboardView scaffold, pending human visual verification (Task 2 checkpoint)
- src/components/tv/ directory stub ready for Phase 18 PriorityGrid components
- usePriorityRanking debug list visible for immediate zone ranking validation
- Phase 18 can add PriorityGrid into the zIndex:1 div, then remove the dev debug `<ul>`

---
*Phase: 17-tv-scaffold-priority-foundation*
*Completed: 2026-03-22*
