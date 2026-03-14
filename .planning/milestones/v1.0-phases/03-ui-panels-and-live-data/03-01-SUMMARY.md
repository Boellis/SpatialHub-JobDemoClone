---
phase: 03-ui-panels-and-live-data
plan: 01
subsystem: ui
tags: [react, zustand, r3f, typescript, sparkline, overlay, glassmorphism]

# Dependency graph
requires:
  - phase: 02-3d-scene-and-zone-interaction
    provides: HabitatStructure with dome click/selection, CameraController, HabitatDome, ZONE_ACCENT_COLORS

provides:
  - selectedZoneId in Zustand store (shared between R3F scene and HTML overlay)
  - HTML overlay layer in HabitatView (pointer-events: none, z-index: 10)
  - ZonePanel right sidebar with live sensor readings (glassmorphism, accent bar, close button)
  - Sparkline inline SVG component (30-point polyline, status-reactive color)
  - useAnimatedValue hook (rAF lerp for smooth number transitions)
  - formatSensorValue helper (sensor-type-aware decimal precision)
  - Main nav hidden on /habitat via AppContent + useLocation pattern

affects:
  - 03-02-live-data (will extend ZonePanel or HabitatHUD in the same overlay layer)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - HTML overlay as sibling to R3F Canvas (pointer-events: none container, pointer-events: auto on interactive children)
    - Zustand store as bridge between R3F scene graph and HTML overlay layer
    - useAnimatedValue hook using requestAnimationFrame for smooth instrument-style readouts
    - key={zoneId} on inner content wrapper for cross-fade via React remount + CSS animation

key-files:
  created:
    - spatialhub-frontend/src/components/habitat/Sparkline.tsx
    - spatialhub-frontend/src/components/habitat/ZonePanel.tsx
  modified:
    - spatialhub-frontend/src/types/habitat.ts
    - spatialhub-frontend/src/store/habitatStore.ts
    - spatialhub-frontend/src/components/habitat/HabitatStructure.tsx
    - spatialhub-frontend/src/pages/HabitatView.tsx
    - spatialhub-frontend/src/App.tsx

key-decisions:
  - "selectedZoneId lifted to Zustand store — only way for R3F scene graph and HTML overlay to share state without prop-drilling through Canvas boundary"
  - "ZonePanel uses key={zoneId} on inner content for cross-fade — React remount triggers slideInRight animation automatically on zone switch"
  - "useAnimatedValue hook with rAF lerp — makes numeric readouts feel like real instruments rather than discrete jumps"
  - "App split into Router + AppContent to enable useLocation for conditional nav — useLocation must be called inside Router"
  - "formatSensorValue maps sensor type to precision — co2/power/tds are integers, everything else 1 decimal place"

patterns-established:
  - "Overlay pattern: fixed div with pointer-events:none as sibling to Canvas, interactive children set pointer-events:auto"
  - "Zone color consistency: ZONE_ACCENT_COLORS exported from HabitatStructure, imported by ZonePanel and Sparkline"
  - "Animated sensor values: useAnimatedValue(target, duration) hook for any numeric display that needs smooth transitions"

requirements-completed: [UI-01, SIM-03]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 3 Plan 01: Zone Panel and Overlay Infrastructure Summary

**Zustand-backed HTML overlay with ZonePanel sidebar (glassmorphism, animated readouts, SVG sparklines) and hidden nav on /habitat — the 2D display layer that communicates with the R3F scene graph via shared Zustand state.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-13T21:39:47Z
- **Completed:** 2026-03-13T21:43:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Lifted selectedZoneId from HabitatStructure useState to Zustand store, making it accessible across the Canvas boundary to the HTML overlay layer
- Built ZonePanel right sidebar with glassmorphism styling, zone accent color bar, animated sensor values (rAF lerp), status dots with glow, and SVG sparklines
- Created Sparkline SVG component with proper min/max normalization and flat-line fallback for sparse data
- Added HTML overlay infrastructure in HabitatView and hid main nav on /habitat via AppContent pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Lift selectedZoneId to Zustand and create overlay infrastructure** - `7a1306a` (feat)
2. **Task 2: Create ZonePanel and Sparkline components** - `c594406` (feat)

**Plan metadata:** `[pending docs commit]` (docs: complete plan)

## Files Created/Modified
- `spatialhub-frontend/src/components/habitat/Sparkline.tsx` - Inline SVG sparkline with normalized y-axis, 30-point polyline
- `spatialhub-frontend/src/components/habitat/ZonePanel.tsx` - Right sidebar panel with glassmorphism, SensorRow, useAnimatedValue, formatSensorValue
- `spatialhub-frontend/src/types/habitat.ts` - Added selectedZoneId and setSelectedZoneId to HabitatState interface
- `spatialhub-frontend/src/store/habitatStore.ts` - Added selectedZoneId state, setSelectedZoneId action, selectSelectedZoneId selector
- `spatialhub-frontend/src/components/habitat/HabitatStructure.tsx` - Replaced useState with Zustand store reads; exported ZONE_ACCENT_COLORS
- `spatialhub-frontend/src/pages/HabitatView.tsx` - Added overlay div, ZonePanel, hint text, setSelectedZoneId from store
- `spatialhub-frontend/src/App.tsx` - Split into Router + AppContent; useLocation hides nav on /habitat

## Decisions Made
- **selectedZoneId to Zustand:** R3F Canvas creates a rendering boundary — local useState in HabitatStructure cannot be read from sibling HTML elements. Zustand is the only clean bridge.
- **key={zoneId} for cross-fade:** Rather than managing enter/exit animations explicitly, keying the inner content wrapper on zoneId causes React to remount it, which re-triggers the slideInRight CSS animation naturally.
- **App split for useLocation:** useLocation must be called inside Router. The cleanest pattern is an AppContent inner component rather than manually tracking location state.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled clean, Vite build succeeded on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ZonePanel and overlay layer are complete — Plan 03-02 can extend the overlay with HabitatHUD, AlertBanner, or additional data displays
- The overlay pointer-events pattern is established and documented — any future overlay components follow the same container/children approach
- Sparkline and ZonePanel are ready for visual review via `npm run dev` at localhost:5173/habitat

---
*Phase: 03-ui-panels-and-live-data*
*Completed: 2026-03-13*
