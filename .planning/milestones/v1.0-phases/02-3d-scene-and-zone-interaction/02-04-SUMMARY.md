---
phase: 02-3d-scene-and-zone-interaction
plan: "04"
subsystem: ui
tags: [react, three.js, r3f, drei, raycasting, pointer-events, sensor-orb, tooltip]

# Dependency graph
requires:
  - phase: 02-3d-scene-and-zone-interaction
    provides: SensorOrb component with hover tooltip logic and HabitatDome wrapping it

provides:
  - HabitatDome with raycast-transparent dome mesh so pointer events reach sensor orbs inside
  - Invisible interaction ring (ringGeometry) at dome base preserving hover highlight and click-to-zoom
  - Working sensor orb tooltips showing sensor name, value (1 decimal), and unit on hover

affects:
  - 02-3d-scene-and-zone-interaction
  - Any future 3D interaction work involving nested raycasting or pointer event propagation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "raycast={() => {}} no-op to make a mesh invisible to R3F pointer events without affecting rendering or ref access"
    - "Separate invisible interaction mesh (visible=false) as pointer event target when primary mesh must be raycast-transparent"
    - "Flat ring geometry at base plane as non-occluding interaction surface for a convex shell"

key-files:
  created: []
  modified:
    - spatialhub-frontend/src/components/habitat/HabitatDome.tsx

key-decisions:
  - "Use raycast no-op (not CSS pointer-events) to make dome event-transparent — R3F/Three.js has no CSS, this is the Three.js idiomatic approach"
  - "Interaction ring inner radius 3.5 chosen to not overlap orb footprint at base plane (orbs at y=1.5-3.0, ring at y=0.01)"
  - "visible={false} on interaction ring — hides it visually, R3F still raycasts against it by default"

patterns-established:
  - "Nested interactive meshes in R3F: outer shell uses raycast no-op, a thin interaction surface at the perimeter captures outer-mesh events"

requirements-completed: [INT-03]

# Metrics
duration: 1min
completed: 2026-03-10
---

# Phase 02 Plan 04: Sensor Orb Tooltip Fix Summary

**Dome mesh made raycast-transparent via no-op override, enabling pointer events to reach sensor orbs inside — tooltips now render on hover with sensor name, value, and unit**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-10T05:56:46Z
- **Completed:** 2026-03-10T05:57:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Diagnosed root cause: dome sphereGeometry (radius 5) encloses all orbs (magnitude ~1.5-3.5), dome's `onPointerOver` called `stopPropagation()` — orb events starved
- Added `raycast={() => {}}` to dome mesh, stripping event handlers from it entirely
- Added invisible flat ring mesh (ringGeometry 3.5-5.5, y=0.01) to handle dome hover highlight and click-to-zoom, preserving all existing UX
- SensorOrb.tsx untouched — hover/tooltip logic was already correct, just unreachable

## Task Commits

1. **Task 1: Fix dome event architecture so sensor orb tooltips work** - `a41f708` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `spatialhub-frontend/src/components/habitat/HabitatDome.tsx` - Added `raycast={() => {}}` to dome mesh; added invisible ring interaction surface; preserved all existing hover/click/emissive logic

## Decisions Made

- `raycast={() => {}}` is the Three.js idiomatic approach — there is no CSS `pointer-events: none` equivalent in WebGL. The no-op function replaces the default raycasting method on the mesh instance.
- Interaction ring inner radius 3.5 is safe because sensor orb offsets have max XZ component of ~1.2 units (and orbs are at y=1.5-3.0, not at y=0.01 where the ring lives) — no geometric intersection.
- `visible={false}` intentionally chosen over opacity=0 or `renderOrder` tricks. R3F raycasts against invisible meshes by default, matching documented behavior.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Sensor orb tooltips are now functional; the gap from UAT task (02-03) is closed
- Phase 02 is fully complete — all zone interaction goals met: dome hover highlight, camera zoom transitions, sensor orb status glow with bobbing, and sensor tooltips on hover
- Ready for Phase 03 (data integration or polish phase per roadmap)

---
*Phase: 02-3d-scene-and-zone-interaction*
*Completed: 2026-03-10*
