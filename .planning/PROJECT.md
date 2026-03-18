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
- ✓ BioSim Docker integration (NASA life support simulator as physics engine) — v2.0
- ✓ Frontend WebSocket client connecting directly to BioSim for live data — v2.0
- ✓ Django bridge service ingesting BioSim ticks into enriched_sensor_data — v2.0
- ✓ AnomalyDrawer rewired to POST real malfunctions to BioSim API — v2.0
- ✓ Fallback mode: auto-detect BioSim availability, fall back to client-side sim — v2.0
- ✓ Full docker-compose stack (Django + BioSim + Open MCT + PostgreSQL) — v2.0
- ✓ Open MCT route/link alongside 3D habitat — v2.0
- ✓ Existing /api/enriched/ and /trends serve real BioSim historical data — v2.0

### Active

- [ ] Raspberry Pi with Atlas Scientific pH sensor feeds real data into BioSim simulation
- [ ] Closed-loop control: real pH divergence triggers BioSim water recycling malfunctions
- [ ] Hubcode rewrite: config-driven, no GCP dependency, direct REST to Docker stack
- [ ] Real sensor data visible in 3D habitat alongside BioSim physics
- [ ] Reproducible setup: anyone with a Pi + Atlas I2C sensor can follow a guide and run it

## Current Milestone: v3.0 Physical Sensor Integration

**Goal:** Connect a real Raspberry Pi with an Atlas Scientific pH sensor to the BioSim simulation — real pH readings drive BioSim's water recycling system via a closed-loop control service. Reproducible for anyone with a Pi and Atlas I2C hardware.

**Target features:**
- Hubcode rewrite: config-driven Python client, no GCP dependency, posts directly to Docker stack over WiFi
- Django API endpoint to receive real sensor data from the Pi
- Control service comparing real pH to BioSim simulated pH, triggering malfunctions on divergence
- Real sensor data overlaid in the 3D habitat's water recycling zone
- Reproducible Pi setup guide with configuration, wiring, and first-run instructions

### Out of Scope

- Authentication / authorization — not needed for portfolio demo
- Mobile-responsive 3D experience — desktop-first
- Multiplayer / collaborative viewing — single user
- GCP Pub/Sub pipeline — replaced by direct REST to Docker stack for v3.0
- Multiple sensor types — pH only for this milestone (extensible for future)
- Custom PCB or enclosure design — standard breadboard setup
- VR/AR mode — 99% of reviewers use normal browsers

## Context

- **Shipped:** v2.0 BioSim Integration (2026-03-16), v1.0 Mars Habitat Demo (2026-03-14)
- **Codebase:** 3,587 LOC TypeScript/TSX (frontend), 3,798 lines added across 28 files
- **Frontend stack:** React 19, Vite, TypeScript, R3F (fiber@9.5, drei@10.7, postprocessing@3.0, three@0.183), Zustand v5
- **Backend stack:** Django 5.2, DRF, PostgreSQL on Cloud SQL
- **Target audience:** Portfolio reviewers, potential employers evaluating full-stack + 3D capability
- **Known tech debt:** `fetchHabitatZones()` dead code (Django endpoint unused by frontend), seed thresholds diverged from constants.ts, sparklines flat for first 60s, fragile z-index stacking in AnomalyDrawer

## Constraints

- **Tech stack:** Django + React + TypeScript + Three.js (R3F)
- **No new cloud infra:** Local Docker stack + Pi over WiFi, no GCP dependency
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

| BioSim via Docker + REST/WebSocket (not embedded) | GPL v3 copyleft — network API boundary avoids code linking | ✓ Good — clean API boundary, 5-service compose |
| Full docker-compose (Django + BioSim + Open MCT + PostgreSQL) | One command to start entire stack, best for scale and onboarding | ✓ Good — includes bridge service |
| Both paths: direct WS for live + Django ingest for history | Real-time 3D + proper data pipeline, most impressive architecture | ✓ Good — frontend WS + Django bridge both working |
| Pi bypasses GCP, posts directly to Docker stack | Reproducibility — no service accounts, no cloud dependency | — Pending |
| Closed-loop: real pH drives BioSim malfunctions | Most impressive demo — real hardware influencing simulation | — Pending |

---
*Last updated: 2026-03-18 after v3.0 milestone started*
