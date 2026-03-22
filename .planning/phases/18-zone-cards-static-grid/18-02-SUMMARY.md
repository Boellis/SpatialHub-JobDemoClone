---
phase: 18-zone-cards-static-grid
plan: 02
subsystem: ui
tags: [react, zustand, vitest, css-grid, sparkline, animation, tv-dashboard]

# Dependency graph
requires:
  - phase: 18-01
    provides: StatusBar, usePriorityRanking, TV constants (STATUS_COLORS, STATUS_LABELS, BADGE_CONFIG)
  - phase: 17-02
    provides: TvDashboardView scaffold, R3F Canvas, useSimSource, useLiveSensors hooks
provides:
  - ZoneCard component with sensor rows, sparklines, status badges, critical pulse animation
  - PriorityGrid CSS Grid layout (hero + 3 secondary slots) driven by usePriorityRanking
  - TvDashboardView rewired to production layout (StatusBar + PriorityGrid, no debug overlay)
  - 17 new tests covering ZoneCard (11), PriorityGrid (6) + updated TvDashboardView tests (6)
affects: [19-flip-animation, 20-parallax-background]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS keyframe injection via id-guarded style tag (tv-zone-animations) — same pattern as ConnectionBadge"
    - "Per-zone Zustand selector: selectZone(zoneId) prevents cascade re-renders when unrelated zones update"
    - "ZONE_MAP sensor iteration for stable ordering across renders"
    - "zoneId as React key in PriorityGrid (not index) — required for Phase 19 FLIP animation"
    - "minHeight: 0 on flex child to prevent PriorityGrid overflow past StatusBar"

key-files:
  created:
    - spatialhub-frontend/src/components/tv/ZoneCard.tsx
    - spatialhub-frontend/src/components/tv/PriorityGrid.tsx
    - spatialhub-frontend/src/__tests__/ZoneCard.test.tsx
    - spatialhub-frontend/src/__tests__/PriorityGrid.test.tsx
  modified:
    - spatialhub-frontend/src/pages/TvDashboardView.tsx
    - spatialhub-frontend/src/__tests__/TvDashboardView.test.tsx

key-decisions:
  - "ZoneCard border tests use getAttribute('style') + regex match instead of toHaveStyle() — jsdom normalizes rgba() with spaces, making exact string match unreliable"
  - "TvDashboardView no longer imports usePriorityRanking or reads zones — fully delegated to PriorityGrid and StatusBar respectively"
  - "PriorityGrid does not subscribe to zones store — only rankedIds from hook, preventing unnecessary re-renders"

patterns-established:
  - "TV component sensor rendering: ZONE_MAP provides stable SensorConfig ordering, zone.sensors[cfg.sensorId] provides live readings"
  - "Hero/secondary distinction via isHero boolean prop — single component handles both sizes"
  - "gridColumn: '1 / -1' hero pattern for CSS Grid full-width first row"

requirements-completed: [LAYOUT-02, DATA-01, DATA-02, STAT-02]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 18 Plan 02: Zone Cards + Priority Grid Summary

**ZoneCard with TV-safe 48/28px sensor values, sparklines, and critical pulse animation; PriorityGrid CSS Grid hero/secondary layout wired to TvDashboardView replacing the Phase 17 debug overlay**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T07:29:32Z
- **Completed:** 2026-03-22T07:33:08Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- ZoneCard renders all sensors per zone with name, value, status dot, sparkline — hero at 48px bold, secondary at 28px bold
- Red zones pulse with zoneCriticalPulse CSS keyframe animation; yellow zones have static amber border; green zones near-invisible border
- PriorityGrid places rankedIds[0] as full-width hero (gridColumn: 1/-1, row 1), remaining 3 as secondary (row 2) in 3-column CSS Grid
- TvDashboardView cleaned: scoreZone duplicate removed, debug ul removed, rewired to StatusBar + PriorityGrid
- 143 tests passing (full suite green)

## Task Commits

1. **Task 1: ZoneCard component + tests** - `41f0bcb` (feat)
2. **Task 2: PriorityGrid + TvDashboardView rewire + integration tests** - `888659a` (feat)

## Files Created/Modified

- `spatialhub-frontend/src/components/tv/ZoneCard.tsx` - Zone card with sensor rows, sparklines, status badge, critical pulse animation
- `spatialhub-frontend/src/components/tv/PriorityGrid.tsx` - CSS Grid hero/secondary layout driven by usePriorityRanking
- `spatialhub-frontend/src/pages/TvDashboardView.tsx` - Rewired to StatusBar + PriorityGrid; all debug artifacts removed
- `spatialhub-frontend/src/__tests__/ZoneCard.test.tsx` - 11 TDD tests covering rendering, sizing, border styles, badge labels
- `spatialhub-frontend/src/__tests__/PriorityGrid.test.tsx` - 6 tests covering hero/secondary split, grid styles, zoneId keys
- `spatialhub-frontend/src/__tests__/TvDashboardView.test.tsx` - Updated mocks; removed debug overlay test; added StatusBar/PriorityGrid tests

## Decisions Made

- ZoneCard border style tests use `getAttribute('style')` with regex instead of `toHaveStyle()` — jsdom normalizes rgba color values with spaces, making exact string comparison unreliable for border checks. Red test still checks `style` attribute string directly since animation name is unique.
- TvDashboardView fully delegates zone ranking to PriorityGrid and zone status to StatusBar — no direct store reads in the page component.
- PriorityGrid intentionally has no zones subscription — only consumes ranked IDs from hook to avoid unnecessary re-renders on every sensor tick.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

`toHaveStyle()` matcher from @testing-library/jest-dom normalizes CSS color strings (adds spaces inside rgba()), causing border style assertions to fail. Resolved by using `getAttribute('style')` + regex matching for border color assertions. This is a test infrastructure quirk, not a component bug.

## Next Phase Readiness

- ZoneCard, PriorityGrid, and TvDashboardView are production-ready
- Phase 19 (FLIP animation) can begin: zoneId keys are stable in PriorityGrid, hero/secondary positions are CSS Grid properties that can animate via Framer Motion layout
- Phase 19 concern: inspect `biosimWorker.ts` message protocol before planning (noted in STATE.md blockers)

---
*Phase: 18-zone-cards-static-grid*
*Completed: 2026-03-22*
