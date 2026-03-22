---
phase: 18-zone-cards-static-grid
plan: 01
subsystem: ui
tags: [react, typescript, zustand, vitest, space-mono, tv-dashboard]

requires:
  - phase: 17-tv-scaffold-priority-foundation
    provides: "TvDashboardView scaffold, useHabitatStore, usePriorityRanking, habitatStore"

provides:
  - "History ring buffer cap bumped to 60 in engine.ts and biosimMapper.ts"
  - "src/components/tv/constants.ts — STATUS_COLORS, STATUS_LABELS, BADGE_CONFIG shared across TV components"
  - "src/components/tv/StatusBar.tsx — full-width TV status strip with worst-zone alert, sol counter, connection badge"

affects:
  - "18-02 (ZoneCard) — imports STATUS_COLORS, STATUS_LABELS from tv/constants.ts"
  - "18-03 (PriorityGrid) — StatusBar rendered inside TV layout"

tech-stack:
  added: []
  patterns:
    - "TV constants extracted into shared tv/constants.ts — HabitatHUD and ConnectionBadge keep their own copies, TV components import from tv/constants"
    - "StatusBar worst-zone derivation: iterate zones, red beats yellow beats green, first-seen wins per level"
    - "Zustand selector pattern for StatusBar: three separate useHabitatStore calls (zones, solElapsed) + selectSimSource"

key-files:
  created:
    - "spatialhub-frontend/src/components/tv/constants.ts"
    - "spatialhub-frontend/src/components/tv/StatusBar.tsx"
    - "spatialhub-frontend/src/__tests__/StatusBar.test.tsx"
  modified:
    - "spatialhub-frontend/src/simulation/engine.ts — MAX_HISTORY 30 -> 60"
    - "spatialhub-frontend/src/simulation/biosimMapper.ts — HISTORY_CAP 30 -> 60"
    - "spatialhub-frontend/src/__tests__/biosimMapper.test.ts — updated literal assertion + loop count"

key-decisions:
  - "biosimMapper.test.ts 'never exceeds cap' test iterated 50 times — insufficient for new cap of 60. Auto-fixed loop to 80 (Rule 1 - Bug) to correctly exercise the ring buffer past capacity."
  - "StatusBar uses three separate useHabitatStore selectors (not one destructured) — matches granular selector pattern established for PERF-02 in ConnectionBadge"
  - "StatusBar alert text color is #9ca3af (muted) when all nominal, status color when any zone non-nominal — matches UI-SPEC color contract"

patterns-established:
  - "TV component inline-styles only — no Tailwind, no CSS modules, no class names"
  - "Shared TV constants live in src/components/tv/constants.ts; non-TV components (HabitatHUD, ConnectionBadge) keep own copies"
  - "TDD RED/GREEN for TV components: write tests importing not-yet-existing component, confirm failure, create component, confirm all pass"

requirements-completed: [DATA-02, DATA-03, DATA-04, STAT-01]

duration: 12min
completed: 2026-03-22
---

# Phase 18 Plan 01: StatusBar Foundation Summary

**TV StatusBar with worst-zone alert messaging, SOL counter, and inline connection badge — plus history cap bump to 60 and shared TV constants extracted from HabitatHUD/ConnectionBadge**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-22T12:30:00Z
- **Completed:** 2026-03-22T12:42:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- History ring buffer cap bumped to 60 in both `engine.ts` and `biosimMapper.ts`, unblocking 60-point sparklines in Plan 02
- `src/components/tv/constants.ts` created with `STATUS_COLORS`, `STATUS_LABELS`, `BADGE_CONFIG` — shared source of truth for all TV components
- `StatusBar.tsx` renders worst-zone alert (ALL SYSTEMS NOMINAL / ZONE: CRITICAL / ZONE: CAUTION), SOL NNN counter, and static connection badge — zero animation, zero interaction

## Task Commits

1. **Task 1: Bump history cap + extract TV constants** - `bee4df6` (feat)
2. **Task 2: StatusBar component + tests** - `935cb61` (feat)

## Files Created/Modified

- `spatialhub-frontend/src/components/tv/constants.ts` — STATUS_COLORS, STATUS_LABELS, BADGE_CONFIG for TV components
- `spatialhub-frontend/src/components/tv/StatusBar.tsx` — TV status strip component
- `spatialhub-frontend/src/__tests__/StatusBar.test.tsx` — 11 TDD tests (RED/GREEN)
- `spatialhub-frontend/src/simulation/engine.ts` — MAX_HISTORY bumped to 60
- `spatialhub-frontend/src/simulation/biosimMapper.ts` — HISTORY_CAP bumped to 60
- `spatialhub-frontend/src/__tests__/biosimMapper.test.ts` — updated cap assertion + loop count

## Decisions Made

- Three separate `useHabitatStore` selector calls in StatusBar (not one destructured object) — matches the granular PERF-02 selector pattern established in ConnectionBadge
- StatusBar alert text uses `#9ca3af` (muted) when all nominal, transitions to status color for any non-nominal state — per UI-SPEC color contract

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed biosimMapper.test.ts ring buffer test with insufficient iteration count**
- **Found during:** Task 1 (Bump history cap)
- **Issue:** "never exceeds HISTORY_CAP when filled past cap" test iterated 50 times then asserted `length === HISTORY_CAP` (60). With cap=60, 50 iterations never reaches cap — the test would always fail after the bump.
- **Fix:** Changed loop from `i < 50` to `i < 80` so the buffer is filled past cap before the assertion
- **Files modified:** `spatialhub-frontend/src/__tests__/biosimMapper.test.ts`
- **Verification:** All 20 biosimMapper tests pass
- **Committed in:** `bee4df6` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary correctness fix for the test suite; no scope creep.

## Issues Encountered

None beyond the auto-fixed test bug above.

## Next Phase Readiness

- `constants.ts` is ready for ZoneCard (Plan 02) to import `STATUS_COLORS`, `STATUS_LABELS`
- `StatusBar.tsx` is ready to be mounted in `TvDashboardView` (Plan 03 / PriorityGrid integration)
- History cap at 60 unblocks sparkline history arrays in ZoneCard

---
*Phase: 18-zone-cards-static-grid*
*Completed: 2026-03-22*
