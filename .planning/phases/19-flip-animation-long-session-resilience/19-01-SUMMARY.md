---
phase: 19-flip-animation-long-session-resilience
plan: 01
subsystem: ui
tags: [motion, flip-animation, layout-animation, react, tv-dashboard, vitest]

# Dependency graph
requires:
  - phase: 18-tv-dashboard-data-rendering
    provides: PriorityGrid and ZoneCard components with static grid layout

provides:
  - motion@12.38.0 pinned dependency for React 19 concurrent-mode FLIP animation
  - PriorityGrid with LayoutGroup + motion.div wrappers (layoutId=zone-{zoneId}, layout, 500ms easeOut)
  - ZoneCard with motion.div/motion.span on all direct children for scale distortion correction
  - PriorityGrid tests verifying layoutId uses zoneId not index
  - ZoneCard tests verifying motion children render without crash

affects:
  - 19-02 (long-session resilience — visibilitychange probe recovery)
  - 20-parallax (cosmetic animations in R3F Canvas)

# Tech tracking
tech-stack:
  added:
    - "motion@12.38.0 (pinned) — FLIP layout animation via motion/react import"
  patterns:
    - "LayoutGroup scoped to PriorityGrid (not TvDashboardView) to avoid cross-tree layout group contamination"
    - "layoutId uses zoneId string (zone-{id}), not array index — required for stable FLIP identity across reorders"
    - "layout (full, not layout=position) on motion.div wrappers — animates both position AND size for hero/secondary transitions"
    - "FLIP_TRANSITION constant shared across all motion.div wrappers in PriorityGrid for consistent timing"
    - "ZoneCard outer container stays plain div — motion.div with layoutId lives in PriorityGrid only"
    - "All direct ZoneCard children (header row, zone name span, status badge, sensor rows, left/right groups) get layout prop for scale distortion correction"
    - "motion/react mock in test files: passes through all props with data-layout-id and data-layout attributes for structural verification"

key-files:
  modified:
    - spatialhub-frontend/package.json
    - spatialhub-frontend/src/components/tv/PriorityGrid.tsx
    - spatialhub-frontend/src/components/tv/ZoneCard.tsx
    - spatialhub-frontend/src/__tests__/PriorityGrid.test.tsx
    - spatialhub-frontend/src/__tests__/ZoneCard.test.tsx

key-decisions:
  - "layout (full) not layout=position on motion.div wrappers — hero/secondary size change must animate, not snap"
  - "LayoutGroup placed inside PriorityGrid wrapping the grid div — not in TvDashboardView (avoids cross-tree contamination)"
  - "ZoneCard style prop removed — grid positioning now lives on motion.div wrapper in PriorityGrid"
  - "motion@12.38.0 pinned without caret — React 19 concurrent stability requires exact version"
  - "Import from motion/react not framer-motion — framer-motion shim works in v12 but breaks in v13"

patterns-established:
  - "FLIP pattern: LayoutGroup > plain grid div > motion.div[layoutId, layout, transition] > ZoneCard"
  - "Scale distortion fix: every direct child of a layout-animating motion.div also gets layout prop"
  - "Test strategy: mock motion/react to expose data-layout-id and data-layout attributes; test structural correctness not animation interpolation"

requirements-completed: [LAYOUT-04]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 19 Plan 01: FLIP Animation — PriorityGrid + ZoneCard Summary

**motion@12.38.0 FLIP animation wired to PriorityGrid via LayoutGroup + motion.div wrappers with layoutId=zone-{id}, and ZoneCard direct children converted to motion elements for scale distortion correction**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T14:47:29Z
- **Completed:** 2026-03-22T14:51:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Installed motion@12.38.0 pinned (no caret), importing from `motion/react`
- PriorityGrid now wraps all 4 card slots in LayoutGroup + motion.div with `layout`, `layoutId=zone-{zoneId}`, and 500ms easeOut transition — FLIP triggers automatically when `usePriorityRanking` reorders
- ZoneCard internal direct children (header row, zone name, status badge container, sensor rows, left/right groups) converted to motion.div/motion.span with `layout` — prevents scale distortion during hero/secondary size transitions
- Test suite expanded from 147 to 150 tests — all pass; PriorityGrid tests verify zoneId-based layoutId (not index-based), ZoneCard tests verify motion children render without crash

## Task Commits

1. **Task 1: Install motion + FLIP-wrap PriorityGrid + update PriorityGrid tests** - `be08876` (feat)
2. **Task 2: Convert ZoneCard children to motion elements + update ZoneCard tests** - `24fbaae` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `spatialhub-frontend/package.json` - motion@12.38.0 added (pinned, no caret)
- `spatialhub-frontend/package-lock.json` - lockfile updated
- `spatialhub-frontend/src/components/tv/PriorityGrid.tsx` - LayoutGroup + motion.div FLIP wrappers; FLIP_TRANSITION const; style prop removed from ZoneCard passthrough
- `spatialhub-frontend/src/components/tv/ZoneCard.tsx` - motion import; direct children -> motion.div/motion.span with layout; style prop removed from interface
- `spatialhub-frontend/src/__tests__/PriorityGrid.test.tsx` - motion/react mock; 4 new tests for layoutId structural correctness
- `spatialhub-frontend/src/__tests__/ZoneCard.test.tsx` - motion/react mock; 3 new tests for motion child rendering

## Decisions Made

- Used `layout` (full) not `layout="position"` — the CONTEXT.md decision "card shrinks/grows as it slides" requires both position and size to animate, not snap
- LayoutGroup scoped to PriorityGrid only — placing it in TvDashboardView would contaminate all motion.div elements in the tree
- ZoneCard `style` prop removed — positioning responsibility shifted to PriorityGrid's motion.div wrappers where it belongs for FLIP to work correctly

## Deviations from Plan

None — plan executed exactly as written. The one deviation noted (npm adding caret to motion version) was anticipated in the plan with explicit instructions to manually remove it.

## Issues Encountered

npm install added `^12.38.0` (caret) to package.json instead of the pinned `12.38.0`. Plan anticipated this and specified manual removal — handled automatically without any deviation from plan intent.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- FLIP animation infrastructure complete — when `usePriorityRanking` reorders zones, cards will smoothly transition between hero (full-width) and secondary (1/3-width) slots over 500ms easeOut
- Phase 19-02 (visibilitychange probe recovery) can proceed — no FLIP dependencies in that task
- Phase 20 (parallax) gates on GPU geometry count verification — R3F Canvas is still empty, geometries = 0 expected

---
*Phase: 19-flip-animation-long-session-resilience*
*Completed: 2026-03-22*
