---
phase: 02-3d-scene-and-zone-interaction
plan: 03
subsystem: ui
tags: [react-three-fiber, drei, three.js, zustand, camera-animation, raycasting, tooltip, useFrame]

# Dependency graph
requires:
  - phase: 02-02
    provides: HabitatDome meshes in scene, HabitatStructure layout, Bloom post-processing, simulation started on mount

provides:
  - CameraController component with smooth lerp-based zone focus/deselect transitions
  - Dome hover emissive highlight and cursor-change pointer feedback
  - Dome click-to-focus: camera lerps to zone in ~1s with ease-out feel
  - Escape key and background-click deselect returning camera to overview
  - SensorOrb component: 12 glowing status-reactive spheres (3 per dome) with tooltip
  - Hover tooltips showing live sensor name, value, and unit from Zustand store

affects:
  - Phase 3 (data panel / sidebar) — SensorOrb positions and zoneId/sensorId props are
    the click targets that will open detailed zone panels

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useFrame lerp pattern: targetPos/targetLookAt as mutable refs updated by useEffect,
      consumed by useFrame at factor 0.04 — gives ~1s ease-out without external tween lib"
    - "isTransitioning ref guards lerp from fighting user drag after convergence (distance < 0.01)"
    - "onPointerMissed on group wrapping interactive meshes — fires when clicking anything outside
      the group, giving background-click-to-deselect without an invisible plane"
    - "SensorOrb phaseOffset from charCode: hash sensorId to unique float, passed to Math.sin
      as phase — ensures 12 orbs animate asynchronously for organic feel"
    - "Conditional Html rendering on hover — 12 always-present DOM overlays would hurt perf;
      only the hovered orb renders its Html tooltip"

key-files:
  created:
    - spatialhub-frontend/src/components/habitat/CameraController.tsx
    - spatialhub-frontend/src/components/habitat/SensorOrb.tsx
  modified:
    - spatialhub-frontend/src/components/habitat/HabitatDome.tsx
    - spatialhub-frontend/src/components/habitat/HabitatStructure.tsx
    - spatialhub-frontend/src/pages/HabitatView.tsx

key-decisions:
  - "CameraController owns OrbitControls (not HabitatView) — gives the controller direct ref
    access to controls.target without prop drilling; HabitatView drops its OrbitControls import"
  - "selectedZoneId state lifted to HabitatStructure (not HabitatView) — it's a 3D scene
    concern shared between CameraController and HabitatDome, not a page-level concern"
  - "Lerp factor 0.04 per frame (~60fps) gives ~1s convergence with exponential ease-out —
    avoids external animation library dependency while meeting the 0.8-1.2s spec"
  - "SensorOrb onClick stopPropagation prevents orb clicks from triggering dome selection —
    critical so users can read tooltips without accidentally zooming in"

patterns-established:
  - "Camera transition via ref-based lerp in useFrame: update targetPos in useEffect, consume
    in useFrame — keeps animation out of React state and avoids re-render cascade"
  - "THREE.Event cast to { stopPropagation } for R3F pointer handlers — TypeScript-safe way
    to call stopPropagation without losing the native THREE.Event typing"

requirements-completed: [INT-01, INT-02, INT-03]

# Metrics
duration: ~4min
completed: 2026-03-10
---

# Phase 2 Plan 03: Zone Interaction, Camera Transitions, and Sensor Orbs Summary

**Hover highlights and click-to-zoom camera transitions on all 4 domes, plus 12 live-data SensorOrb spheres with bobbing animation and status-reactive tooltips — the habitat scene is now a navigable monitoring interface**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-10T05:41:08Z
- **Completed:** 2026-03-10T05:44:44Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `CameraController.tsx` (87 lines): owns `OrbitControls` ref, animates camera via `useFrame` lerp (factor 0.04) toward a mutable `targetPos`/`targetLookAt` updated by `useEffect` on zone selection change — produces ~1s ease-out transition; Escape key calls `onDeselect()` via `window` event listener; convergence guard (`distance < 0.01`) stops lerping so user can freely orbit after focus
- Created `SensorOrb.tsx` (132 lines): 0.25-radius emissive sphere (`emissiveIntensity 2.0`) colored by live Zustand `SensorStatus`; `useFrame` bobs orb on `Math.sin(elapsedTime * 1.5 + phaseOffset)` with per-sensor phase from `charCode` hash; hover renders `Html` tooltip with sensor name, value (1dp), and unit — tooltip only rendered on hover (not 12 permanent DOM nodes)
- Updated `HabitatDome.tsx`: added `isSelected`/`onSelect` props, dome body emissive boost on hover/select (`emissiveIntensity 0.15`), rim intensity multiplied by `1.5` on hover/select, `cursor: pointer` on hover, `onClick` with `stopPropagation`; renders 3 `SensorOrb` at fixed `SENSOR_OFFSETS`
- Updated `HabitatStructure.tsx`: lifted `selectedZoneId` state here, renders `CameraController`, wraps dome group in `onPointerMissed` for background deselect
- Updated `HabitatView.tsx`: removed `OrbitControls` (now owned by `CameraController`)
- Build: zero TypeScript errors, `tsc -b && vite build` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: CameraController, HabitatDome hover/click, HabitatStructure state lift, HabitatView cleanup** - `9623213` (feat)
2. **Task 2: SensorOrb component** - `f2c6a97` (feat)

## Files Created/Modified

- `spatialhub-frontend/src/components/habitat/CameraController.tsx` — Smooth lerp-based camera transitions, OrbitControls ownership, Escape key deselect
- `spatialhub-frontend/src/components/habitat/SensorOrb.tsx` — Live-status glowing sphere, bobbing animation, hover tooltip
- `spatialhub-frontend/src/components/habitat/HabitatDome.tsx` — Added hover/select highlight, click handler, renders 3 SensorOrbs per dome
- `spatialhub-frontend/src/components/habitat/HabitatStructure.tsx` — Added selectedZoneId state, CameraController, onPointerMissed background deselect
- `spatialhub-frontend/src/pages/HabitatView.tsx` — Removed OrbitControls (moved to CameraController)

## Decisions Made

- `CameraController` owns `OrbitControls` rather than `HabitatView` — the controller needs direct ref access to `controls.target` to lerp the orbit pivot point; having it in `HabitatView` would require passing the ref down through `HabitatStructure`
- `selectedZoneId` state in `HabitatStructure` not `HabitatView` — it's a 3D scene state shared between camera and dome rendering, not a page concern
- Lerp factor `0.04` per frame: at 60fps, `(1 - 0.04)^60 = ~0.085` remaining after 1s — exponential ease-out that settles in ~0.8-1.2s depending on distance, no tween library needed
- `SensorOrb` tooltip only rendered on hover — 12 always-present `Html` nodes with Three.js DOM projection would add measurable overhead; conditional keeps it to max 1 at a time

## Deviations from Plan

None — plan executed exactly as written. All must_haves, artifacts, and key_links match implementation.

## Issues Encountered

- Pre-existing chunk size warning for HabitatView bundle (~265KB gzip) — expected, Three.js is large, code-splitting already isolates it. Not an error.

## User Setup Required

None.

## Next Phase Readiness

- All 4 domes are now interactive with hover highlights and click-to-zoom camera transitions
- 12 sensor orbs are visible inside domes with live status colors and hover tooltips
- The scene is ready for Phase 3: clicking a dome or sensor orb could open a detail panel/sidebar
- No blockers

---
*Phase: 02-3d-scene-and-zone-interaction*
*Completed: 2026-03-10*
