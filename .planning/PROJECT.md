# SpatialHub: Mars Habitat Demo

## What This Is

A visually stunning 3D Mars habitat monitoring system built on top of an existing IoT telemetry platform. Users open `/habitat` and see a procedural 3D Mars greenhouse with four interactive zones (Grow Bays, Atmosphere Control, Water Recycling, Power/Thermal), each streaming simulated real-time sensor telemetry via a client-side simulation engine. A glassmorphism HUD shows system status, zone panels display live readings with sparkline charts, and an anomaly simulator lets users trigger crises and watch the habitat respond with visual drama.

## Core Value

The 3D habitat visualization with live sensor data must feel real, responsive, and visually impressive enough to make someone say "this could actually run a Mars greenhouse."

## Requirements

### Validated

- ✓ Django HabitatZone model + API endpoint (`/api/habitat/zones/`) — v1.0
- ✓ Fixed double `/api/api/` path bug in frontend API client — v1.0
- ✓ Simulation engine: 12 sensors, 4 zones, 2s tick, Mars-realistic ranges — v1.0
- ✓ Zone status derived from sensor thresholds (green/yellow/red) — v1.0
- ✓ 3D procedural habitat with orbit controls on `/habitat` — v1.0
- ✓ Four visually distinct zone meshes with mission-control dark aesthetic — v1.0
- ✓ Environmental lighting with selective bloom post-processing — v1.0
- ✓ Hover highlight and click-to-zoom smooth camera transitions — v1.0
- ✓ Sensor nodes as 3D markers with live tooltips — v1.0
- ✓ Zone detail panel with live sensor readings and sparkline charts — v1.0
- ✓ HUD glassmorphism overlay (sol count, habitat status, active sensors) — v1.0
- ✓ Alert/warning banners during anomalous conditions — v1.0
- ✓ 4 anomaly scenarios with gradual onset/recovery curves — v1.0
- ✓ Visual drama: flashing zones, alert escalation, sensor spikes — v1.0
- ✓ AnomalyDrawer UI for triggering and cancelling scenarios — v1.0

### Active

(None — v1.0 complete. Use `/gsd:new-milestone` to define v1.1 requirements.)

### Out of Scope

- Real hardware integration / actual Raspberry Pi changes — demo only
- Authentication / authorization — not needed for portfolio demo
- Mobile-responsive 3D experience — desktop-first
- Multiplayer / collaborative viewing — single user
- Persistent anomaly history / incident logs — anomalies are transient demo events
- Replacing existing pages — `/habitat` route sits alongside existing views
- Realistic GLTF habitat model — procedural geometry with good materials looks more futuristic
- Physics simulation — zero value for a monitoring dashboard
- WebSocket backend — simulated data runs in-browser
- VR/AR mode — 99% of reviewers use normal browsers
- Custom GLSL shaders — MeshStandardMaterial with good params is sufficient

## Context

- **Shipped:** v1.0 Mars Habitat Demo (2026-03-14)
- **Codebase:** 3,587 LOC TypeScript/TSX (frontend), 3,798 lines added across 28 files
- **Frontend stack:** React 19, Vite, TypeScript, R3F (fiber@9.5, drei@10.7, postprocessing@3.0, three@0.183), Zustand v5
- **Backend stack:** Django 5.2, DRF, PostgreSQL on Cloud SQL
- **Target audience:** Portfolio reviewers, potential employers evaluating full-stack + 3D capability
- **Known tech debt:** `fetchHabitatZones()` dead code (Django endpoint unused by frontend), seed thresholds diverged from constants.ts, sparklines flat for first 60s, fragile z-index stacking in AnomalyDrawer

## Constraints

- **Tech stack:** Django + React + TypeScript + Three.js (R3F)
- **No new cloud infra:** Simulated data runs in-browser
- **Existing routes preserved:** `/raw`, `/enriched`, `/trends`, `/simulate`, `/unity` untouched
- **Branch:** `feature/mars-habitat-demo`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three.js via R3F (not raw Three.js or Unity) | React reconciler, hooks-based, ecosystem (drei/postprocessing) | ✓ Good — clean integration, 242KB gzip isolated chunk |
| New `/habitat` route with React.lazy() | Isolates 3D bundle, preserves existing pages | ✓ Good — zero impact on existing routes |
| Client-side simulation (not Django/WebSocket) | Simulated data doesn't need persistence; in-browser is simpler | ✓ Good — zero backend load, instant start |
| Fix `/api/api/` bug in Phase 1 | Foundation before features | ✓ Good — prevented propagation |
| Zustand over Redux/Context | Zero-dep, React 19 compatible, works across R3F/HTML boundary | ✓ Good — seamless store sharing |
| Procedural geometry (not GLTF models) | Faster iteration, no asset pipeline, looks futuristic | ✓ Good — cinematic result without modeling tools |
| Emissive rim ring + selective bloom | Surgical glow on status indicators without blooming entire scene | ✓ Good — dome body stays crisp |
| raycast no-op on dome mesh | Lets pointer events reach sensor orbs inside dome | ✓ Good — fixed tooltip regression |
| HTML overlay as Canvas sibling | Pointer-events: none container bridges R3F and DOM | ✓ Good — clean separation |
| CSS keyframes via DOM injection | Tailwind purges custom animation names | ✓ Good — survives build |
| Alert cooldown in Map ref | Prevents re-render cascade on every 2s tick | ✓ Good — stable at high frequency |
| Anomaly toggle (re-trigger = cancel) | Graceful recovery from current biasFactor, not restart | ✓ Good — intuitive UX |

---
*Last updated: 2026-03-14 after v1.0 milestone*
