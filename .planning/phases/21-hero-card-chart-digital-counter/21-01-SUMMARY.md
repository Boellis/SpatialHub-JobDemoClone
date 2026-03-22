---
phase: 21-hero-card-chart-digital-counter
plan: 01
subsystem: ui
tags: [react, svg, animation, css-transitions, vitest]

# Dependency graph
requires:
  - phase: 18-tv-dashboard-zones
    provides: ZoneCard component, STATUS_COLORS constants, SensorReading.history array
  - phase: 19-flip-animation
    provides: ZoneCard motion.div FLIP wrappers, isHero prop pattern
provides:
  - SVG area chart with gradient fill and status-reactive color (AreaChart.tsx)
  - Per-digit mechanical roll animation counter (DigitRoll.tsx)
  - Hero ZoneCard integration — area chart + digit roll behind isHero guard
affects: [22, tv-dashboard, zone-card]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useId() for SVG gradient ID uniqueness — avoids ID collisions when multiple charts render"
    - "CSS keyframe injection via document.createElement('style') — matches ConnectionBadge pattern established in Phase 18"
    - "isHero conditional rendering for hero-only visual components — additive, no secondary card changes"
    - "Worst-status sensor selection (red>yellow>green) for primary sensor in hero card"

key-files:
  created:
    - spatialhub-frontend/src/components/tv/AreaChart.tsx
    - spatialhub-frontend/src/components/tv/DigitRoll.tsx
  modified:
    - spatialhub-frontend/src/components/tv/ZoneCard.tsx
    - spatialhub-frontend/src/__tests__/ZoneCard.test.tsx

key-decisions:
  - "AreaChart uses CSS transition on path d attribute rather than requestAnimationFrame — same approach as mission-control telemetry strips, zero JS animation loop overhead"
  - "DigitRoll animation via @keyframes digitRollIn injected once at module level — translateY(100%) to translateY(0) with 30ms per-digit stagger"
  - "Primary sensor for hero area chart = worst-status sensor (red>yellow>green) — most dramatic telemetry at a glance"
  - "DigitRoll inline styles override parent span fontSize/color — parent span remains as layout wrapper only"

patterns-established:
  - "SVG gradient uniqueness: useId() from React generates unique IDs per instance"
  - "CSS keyframe injection: module-level document.createElement check (DIGIT_ROLL_STYLE_ID guard)"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 21 Plan 01: Hero Card Chart + Digital Counter Summary

**SVG area chart with gradient fill and per-digit mechanical roll counter wired into hero ZoneCard only — secondary cards completely untouched**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-22T22:59:43Z
- **Completed:** 2026-03-22T23:03:00Z
- **Tasks:** 2 of 2 (Task 3 is checkpoint:human-verify — awaiting visual sign-off)
- **Files modified:** 4

## Accomplishments
- Created AreaChart.tsx: SVG with linearGradient fill, polyline stroke, CSS transitions on path `d` attribute for smooth data append, useId() for gradient ID uniqueness, flat line fallback for <2 data points
- Created DigitRoll.tsx: per-digit CSS keyframe roll animation (translateY 100%->0), 200ms transition with 30ms stagger per changed digit, unchanged digits stay static, non-digit characters (decimal point) render static
- Wired both into ZoneCard.tsx behind `isHero` guards — area chart between header and sensor rows, DigitRoll wrapping sensor values for hero only
- 5 new ZoneCard tests + 13 existing all pass (19 total ZoneCard, 158 total suite)

## Task Commits

1. **Task 1: Create AreaChart and DigitRoll components** - `ada5e34` (feat)
2. **Task 2: Wire AreaChart and DigitRoll into hero ZoneCard + update tests** - `4192dcf` (feat)

## Files Created/Modified
- `spatialhub-frontend/src/components/tv/AreaChart.tsx` — SVG area chart: gradient fill, stroke polyline, CSS-transitioned path, useId gradient uniqueness
- `spatialhub-frontend/src/components/tv/DigitRoll.tsx` — Per-digit mechanical roll counter: keyframe animation, 30ms stagger, static non-digit chars
- `spatialhub-frontend/src/components/tv/ZoneCard.tsx` — Added imports, primarySensor/primaryReading selection, AreaChart in hero, DigitRoll conditional on isHero
- `spatialhub-frontend/src/__tests__/ZoneCard.test.tsx` — Mocks for AreaChart + DigitRoll, 5 new tests

## Decisions Made
- AreaChart uses CSS transition on SVG path `d` attribute recalculation rather than requestAnimationFrame — clean, zero JS animation loop, browsers interpolate path changes smoothly
- Primary sensor for hero area chart selected as worst-status sensor (red>yellow>green priority) — most alarming signal gets the prominent chart
- DigitRoll uses @keyframes injection (ConnectionBadge/TV_ANIMATIONS pattern) rather than framer-motion — keeps animation self-contained, no dependency addition

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 3 (checkpoint:human-verify) requires visual sign-off: hero card shows area chart with gradient + digit roll animation, secondary cards unchanged
- After visual approval, phase 21 is complete
- TypeScript compiles clean, all 158 tests pass

---
*Phase: 21-hero-card-chart-digital-counter*
*Completed: 2026-03-22*
