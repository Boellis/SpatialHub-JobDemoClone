---
phase: 20-parallax-polish
plan: 01
subsystem: ui
tags: [react-three-fiber, three.js, instanced-mesh, animation, particles, tv-dashboard]

requires:
  - phase: 17-tv-scaffold-priority-foundation
    provides: R3F Canvas at zIndex:0 with events=null, camera [0,0,5] fov 60, alpha:true
  - phase: 19-flip-animation-long-session-resilience
    provides: GPU memory baseline (geometries:0) confirmed stable for long sessions

provides:
  - "ParallaxBackground R3F component: 80 InstancedMesh spheres, Mars-amber #ff6b35, AdditiveBlending, sine-wave drift via useFrame"
  - "ParallaxBackground wired into TvDashboardView Canvas as sole child"
  - "4 structural tests for ParallaxBackground (named export, render, non-interactive)"
  - "1 new TvDashboardView test verifying canvas containment of parallax layer"

affects: [any future phase touching TvDashboardView Canvas children or GPU memory]

tech-stack:
  added: []
  patterns:
    - "InstancedMesh via declarative JSX for GPU-efficient particle systems in R3F"
    - "Per-instance color seeded on first useFrame frame via instanceColor"
    - "useMemo for particle data + dummy Object3D to avoid per-frame allocations"
    - "Module-level constants for particle system tuning (PARTICLE_COUNT, ranges)"

key-files:
  created:
    - spatialhub-frontend/src/components/tv/ParallaxBackground.tsx
    - spatialhub-frontend/src/__tests__/ParallaxBackground.test.tsx
  modified:
    - spatialhub-frontend/src/pages/TvDashboardView.tsx
    - spatialhub-frontend/src/__tests__/TvDashboardView.test.tsx

key-decisions:
  - "PARTICLE_COUNT=80 within allowed 50-100 range — midpoint balancing visual density and GPU budget"
  - "InstancedMesh chosen for GPU efficiency: single geometry + material shared across 80 instances"
  - "SphereGeometry with 6 segments — low-poly invisible at radius 0.02-0.08, saves vertex budget"
  - "instanceColor seeded on first frame in useFrame (not useEffect) — avoids mount timing issues with R3F"
  - "depthWrite:false + AdditiveBlending — correct transparency stacking on dark background with no z-fighting"
  - "dummy Object3D pattern for matrix updates — reuse single object, no per-frame heap allocation"

patterns-established:
  - "InstancedMesh particle system: JSX-declared geometry/material for auto-disposal, useRef on mesh, useMemo for particle data"
  - "Per-instance color via instanceColor: seed in first useFrame frame, set needsUpdate on instanceColor buffer"

requirements-completed: [VIS-01]

duration: 2min
completed: 2026-03-22
---

# Phase 20 Plan 01: Parallax Polish Summary

**80-particle InstancedMesh parallax layer with Mars-amber sine-wave drift wired into TvDashboardView Canvas behind zone grid**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T15:27:00Z
- **Completed:** 2026-03-22T15:29:18Z
- **Tasks:** 2 of 3 (Task 3 is checkpoint:human-verify — awaiting visual approval)
- **Files modified:** 4

## Accomplishments
- ParallaxBackground component: 80 InstancedMesh spheres, #ff6b35 base with per-particle hue variation, AdditiveBlending, depthWrite:false, sine-wave drift via useFrame
- Per-particle independent sine waves (freq 0.03-0.1, amplitude 0.1-0.5, independent x/y phase) — no particle exits viewport
- Wired into TvDashboardView Canvas as the single 3D child (placeholder comment removed)
- 159 total tests passing, 0 regressions (was 158 before this plan)

## Task Commits

1. **Task 1: ParallaxBackground R3F component (TDD)** - `f8fb633` (feat)
2. **Task 2: Wire into TvDashboardView + test update** - `7f640d3` (feat)
3. **Task 3: Visual verification** — awaiting human checkpoint

## Files Created/Modified
- `spatialhub-frontend/src/components/tv/ParallaxBackground.tsx` - 80-particle InstancedMesh with sine-wave drift
- `spatialhub-frontend/src/__tests__/ParallaxBackground.test.tsx` - 4 structural tests (named export, render, non-interactive)
- `spatialhub-frontend/src/pages/TvDashboardView.tsx` - ParallaxBackground import + Canvas child
- `spatialhub-frontend/src/__tests__/TvDashboardView.test.tsx` - ParallaxBackground mock + containment assertion

## Decisions Made
- InstancedMesh pattern chosen over individual meshes: single shared SphereGeometry (6 segments) + MeshBasicMaterial, 80 instances
- instanceColor seeded in first useFrame call rather than useEffect — avoids mount timing edge cases with R3F internals
- dummy Object3D pattern for matrix updates: one reused object, zero per-frame heap allocations
- GPU disposal handled declaratively via R3F JSX (no manual .dispose() needed)

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- ParallaxBackground renders in Canvas; needs visual sign-off at /tv route (Task 3 checkpoint)
- After checkpoint approval: plan complete, VIS-01 fully satisfied
- GPU geometry count should be 1-2 stable (single shared SphereGeometry) — verify in Chrome DevTools

---
*Phase: 20-parallax-polish*
*Completed: 2026-03-22*
