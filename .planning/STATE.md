---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 03-ui-panels-and-live-data 03-02-PLAN.md
last_updated: "2026-03-13T21:48:52.366Z"
last_activity: 2026-03-09 — Roadmap created, ready to begin Phase 1 planning
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** 3D habitat visualization with live sensor data that feels real, responsive, and impressive enough to make someone say "this could actually run a Mars greenhouse."
**Current focus:** Phase 1 — Data Foundation

## Current Position

Phase: 1 of 4 (Data Foundation)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-09 — Roadmap created, ready to begin Phase 1 planning

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-data-foundation P01 | 3 | 2 tasks | 9 files |
| Phase 01-data-foundation P02 | 5min | 2 tasks | 5 files |
| Phase 02-3d-scene-and-zone-interaction P01 | 15min | 2 tasks | 6 files |
| Phase 02-3d-scene-and-zone-interaction P02 | 15min | 2 tasks | 3 files |
| Phase 02-3d-scene-and-zone-interaction P03 | 4min | 2 tasks | 5 files |
| Phase 02-3d-scene-and-zone-interaction P04 | 1min | 1 tasks | 1 files |
| Phase 03-ui-panels-and-live-data P01 | 3 | 2 tasks | 7 files |
| Phase 03-ui-panels-and-live-data P02 | 3min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: R3F + Zustand + drei chosen over raw Three.js (research-backed, React 19 compatible)
- Roadmap: All simulated telemetry runs client-side — Django serves zone/sensor config only, no WebSocket needed
- Roadmap: `/habitat` route code-split with React.lazy() — 3D stack adds ~300-350KB gzipped
- [Phase 01-data-foundation]: Used venv_local (macOS unix venv) for Django commands — committed venv is Windows-style and unusable on Mac
- [Phase 01-data-foundation]: HabitatZoneListView uses ListAPIView pattern (not APIView) — zone list is static read-only collection
- [Phase 01-data-foundation]: Seed command uses update_or_create for idempotency — safe to re-run without creating duplicates
- [Phase 01-02]: Dynamic import in startSimulation() breaks store->engine->store circular dep without runtime cost
- [Phase 01-02]: Engine stored at module scope (activeEngine) not in Zustand state — prevents interval leak and serialization issues
- [Phase 01-02]: Sol cycle: temperature +/-2C, power +/-15kW, others +/-2-3% nominal — visible rhythm without dominating experience
- [Phase 02-3d-scene-and-zone-interaction]: R3F ecosystem (fiber@9.5/drei@10.7/postprocessing@3.0/three@0.183) installs cleanly with React 19 — no --legacy-peer-deps needed
- [Phase 02-3d-scene-and-zone-interaction]: HabitatView lazy-loaded as separate Vite chunk (242KB gzip) — R3F bundle isolated from main app, only loads on /habitat
- [Phase 02-3d-scene-and-zone-interaction]: Camera at [0, 25, 35] fov:50 provides full habitat overview covering zone positions x:-8..8 z:-4..4
- [Phase 02-3d-scene-and-zone-interaction]: Emissive rim as separate TorusGeometry mesh — bloom luminanceThreshold targets rim only, leaves dome body un-bloomed for surgical cinematic glow
- [Phase 02-3d-scene-and-zone-interaction]: Simulation engine started on HabitatView mount via useEffect (outside Canvas) — React hooks must live outside R3F scene graph nodes
- [Phase 02-3d-scene-and-zone-interaction]: CameraController owns OrbitControls ref (not HabitatView) — direct controls.target access for lerp-based orbit pivot transition without prop drilling
- [Phase 02-3d-scene-and-zone-interaction]: selectedZoneId state lifted to HabitatStructure — 3D scene concern shared between CameraController and HabitatDome, not a page-level concern
- [Phase 02-3d-scene-and-zone-interaction]: useFrame lerp factor 0.04 for camera transitions: ~1s ease-out at 60fps — no external animation library needed
- [Phase 02-3d-scene-and-zone-interaction]: raycast no-op makes dome mesh invisible to R3F raycasts; separate flat ring at base captures dome hover/click without occluding orbs
- [Phase 03-ui-panels-and-live-data]: selectedZoneId lifted to Zustand store — R3F Canvas boundary requires shared store for HTML overlay communication
- [Phase 03-ui-panels-and-live-data]: App split into Router + AppContent for useLocation — enables conditional nav hide on /habitat without Router context error
- [Phase 03-ui-panels-and-live-data]: key={zoneId} on ZonePanel inner content triggers CSS slideInRight animation on zone switch — natural cross-fade via React remount
- [Phase 03-ui-panels-and-live-data]: Alert cooldown uses Map ref not state — avoids re-render cascade; 10s floor prevents same-sensor spam on every 2s tick
- [Phase 03-ui-panels-and-live-data]: CSS keyframe animations injected as style tag — Tailwind purges custom keyframe names; DOM injection at mount survives the purge

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: React 19 + R3F v9 exact version compatibility must be verified with `npm view` before installing — do not use `^` ranges
- [Phase 2]: Post-processing bloom on integrated GPUs needs early testing (MacBook Air class), not deferred to final polish
- [Phase 1]: Fix double `/api/api/` path bug before adding new habitat endpoints to avoid propagating the pattern

## Session Continuity

Last session: 2026-03-13T21:48:52.358Z
Stopped at: Completed 03-ui-panels-and-live-data 03-02-PLAN.md
Resume file: None
