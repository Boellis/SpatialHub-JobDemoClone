---
phase: 02-3d-scene-and-zone-interaction
plan: 02
subsystem: ui
tags: [react-three-fiber, drei, postprocessing, three.js, zustand, emissive, bloom, habitat-dome]

# Dependency graph
requires:
  - phase: 02-01
    provides: R3F Canvas pipeline at /habitat, MarsEnvironment, OrbitControls, ZONE_CONFIGS positions

provides:
  - HabitatDome component with status-reactive emissive glow and floating HTML labels
  - HabitatStructure with 4 domes + 4 connecting corridors + selective Bloom post-processing
  - Live simulation engine auto-started on /habitat mount

affects:
  - 02-03 (zone interaction — raycasting will target these dome meshes)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useFrame + Math.sin for smooth sine-wave pulsing on red status — no external animation library needed"
    - "THREE.Color.lerp() for runtime color blending (accent -> red shift on alert)"
    - "EffectComposer + Bloom with luminanceThreshold 0.8 — only emissive intensity >0.8 blooms, ground and dome body stay crisp"
    - "torusGeometry at y=0.05 as the emissive 'rim ring' — bloom source decoupled from dome body"
    - "createCorridor() helper: atan2 for Y-rotation, midpoint position, trimmed cylinder length"

key-files:
  created:
    - spatialhub-frontend/src/components/habitat/HabitatDome.tsx
    - spatialhub-frontend/src/components/habitat/HabitatStructure.tsx
  modified:
    - spatialhub-frontend/src/pages/HabitatView.tsx

key-decisions:
  - "Emissive rim as a separate TorusGeometry mesh rather than dome base mesh — allows bloom luminance threshold to target rim only, leaving the dome body material un-bloomed"
  - "cyliderGeometry length = (corridor length - 10) trims 5 units from each end so tubes connect at dome perimeters rather than centers"
  - "Simulation engine started on HabitatView mount via useEffect (not inside Canvas) — React hooks must live outside R3F scene graph nodes"
  - "accentRef for inner ring kept as visual depth layer but emissive animation only on rimRef — one ref = one source of truth for intensity"

requirements-completed: [SCENE-02, SCENE-04]

# Metrics
duration: 15min
completed: 2026-03-10
---

# Phase 2 Plan 02: Habitat Dome Geometry and Status-Reactive Emissive Materials Summary

**Four geodesic half-sphere domes with unique accent colors (green/blue/purple/orange), emissive rim rings producing selective bloom, semi-transparent tube corridors, floating HTML zone labels, and live simulation startup on /habitat mount**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-10
- **Completed:** 2026-03-10
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `HabitatDome.tsx` (151 lines): half-sphere dome with `sphereGeometry` upper hemisphere, dark metallic base material, emissive `torusGeometry` rim ring at y=0, `useFrame` animation for status-reactive intensity (green=1.5, yellow=3.0, red=pulsing 2.0-5.0 sine), `THREE.Color.lerp` shifts emissive toward `#ff2200` on red, `Html` floating label with status dot badge
- Created `HabitatStructure.tsx` (108 lines): maps ZONE_CONFIGS to 4 `HabitatDome` instances with per-zone accent colors, `createCorridor()` helper computing cylinder position/rotation/length for 4 connecting tubes, `EffectComposer + Bloom` with `luminanceThreshold=0.8` for selective emissive bloom
- Updated `HabitatView.tsx`: imports `HabitatStructure`, calls `startSimulation()` on mount via `useEffect` so dome glow reacts to live data from the first frame
- Build passes with zero TypeScript errors — `tsc -b && vite build` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: HabitatDome component** - `a84b663` (feat)
2. **Task 2: HabitatStructure + HabitatView update** - `aad0c2f` (feat)

## Files Created/Modified

- `spatialhub-frontend/src/components/habitat/HabitatDome.tsx` — Single dome with emissive rim, status-reactive useFrame, floating Html label
- `spatialhub-frontend/src/components/habitat/HabitatStructure.tsx` — Full habitat layout: 4 domes + 4 corridors + Bloom effect
- `spatialhub-frontend/src/pages/HabitatView.tsx` — Added HabitatStructure import, simulation start on mount

## Decisions Made

- Emissive rim as a separate `TorusGeometry` mesh rather than on the dome's `meshStandardMaterial` itself — the bloom `luminanceThreshold=0.8` targets highly-emissive materials only; if dome body had emissive set, the entire dark dome would glow and ruin the aesthetic. Separating it keeps the bloom surgical.
- Cylinder length trimmed by 10 units (`length - 10`) so corridors connect at dome perimeters (radius ~5) rather than boring through dome centers.
- Simulation start hook lives in `HabitatView` (React component), not inside the Canvas — R3F scene nodes aren't React components and can't use React hooks like `useEffect`.

## Deviations from Plan

None — plan executed exactly as written. All must_haves, artifacts, and key_links match implementation.

## Issues Encountered

- Chunk size warning for HabitatView (986KB unminified, 264KB gzip) — expected and pre-existing from Plan 02-01. Three.js is large; the code-splitting via React.lazy already isolates it. Not an error, not actionable.

## User Setup Required

None.

## Next Phase Readiness

- Dome meshes are in the scene and targetable by raycasting — Plan 02-03 (zone interaction) can hook into them immediately
- `startSimulation()` is already called on mount — 02-03 can read zone statuses from the store without additional setup
- `OrbitControls makeDefault` is in place — 02-03 can use `useThree().controls` for camera manipulation on zone click

---
*Phase: 02-3d-scene-and-zone-interaction*
*Completed: 2026-03-10*
