# SpatialHub: Mars Habitat Demo

## What This Is

A 3D Mars habitat monitoring system powered by NASA's BioSim life support simulator and real Raspberry Pi sensor hardware. A judge plugs in a Pi with an Atlas Scientific pH sensor, opens a website, and sees real pH data driving BioSim's water recycling physics in a procedural 3D Mars greenhouse. Dip the sensor in vinegar — the habitat zone turns red. Rinse it — it recovers. Four interactive zones, live sensor telemetry, glassmorphism HUD, sparkline charts, anomaly simulation, and a closed-loop control service connecting real hardware to simulated physics. Fully cloud-deployed: Django on Cloud Run, frontend on Firebase, BioSim on GCE VM, Cloud SQL PostgreSQL.

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

- ✓ Full cloud deployment: Django on Cloud Run, frontend on Firebase Hosting, BioSim on GCE VM, Cloud SQL database — v3.0
- ✓ Raspberry Pi with Atlas Scientific pH sensor posts data to cloud-hosted Django endpoint — v3.0
- ✓ Closed-loop control: real pH divergence triggers BioSim water recycling malfunctions (control loop on GCE VM) — v3.0
- ✓ Real sensor data visible in 3D habitat alongside BioSim physics — v3.0
- ✓ NASA competition package: judge receives SD card + website URL, Pi plugs in and data flows — v3.0

### Active

## Current Milestone: v4.0 Mars Habitat Revamp

**Goal:** Replace the interactive 3D habitat with a non-interactive 2.5D ambient dashboard designed for wall-mounted TV displays — priority-driven grid layout with live charts, Three.js parallax depth, and algorithmic zone reordering based on criticality.

**Target features:**
- Flat grid dashboard replacing the current `/habitat` 3D scene
- Hero slot for most critical zone (large), remaining zones ranked smaller
- Live sensor charts per zone with real-time data
- Algorithmic priority ranking — zones auto-reorder based on criticality thresholds
- Smooth transitions when zone priority shifts
- Three.js parallax depth effects (ambient auto-drift, not mouse-driven)
- Non-interactive: no click, hover, or touch — TV display only
- Glanceable from across the room (large typography, high contrast)

## Shipped Milestones

- **v1.0 Mars Habitat Demo** — 3D procedural habitat with 4 zones, 12 sensors, anomaly system (shipped 2026-03-14)
- **v2.0 BioSim Integration** — NASA BioSim as physics engine, Docker stack, WebSocket live data (shipped 2026-03-16)
- **v3.0 Physical Sensor Integration** — Cloud deployment, real Pi pH sensor, closed-loop control, competition package (shipped 2026-03-20)

**Target features:**
- Cloud deployment: Django on Cloud Run, frontend on Firebase Hosting, BioSim on GCE VM, Cloud SQL PostgreSQL
- Pi hub client posts pH readings to Cloud Run endpoint over WiFi
- BioSim simulation + bridge + control loop running on GCE VM
- Closed-loop control: real pH divergence triggers BioSim malfunctions observable in 3D habitat
- Real sensor data overlaid in the 3D habitat's water recycling zone
- Competition package: SD card prep guide, deployment verification, demo walkthrough

### Out of Scope

- Authentication / authorization — not needed for competition demo
- Mobile-responsive 3D experience — desktop-first
- Multiplayer / collaborative viewing — single user
- Multiple sensor types — pH only for this milestone (extensible for future)
- Custom PCB or enclosure design — standard breadboard setup
- VR/AR mode — 99% of reviewers use normal browsers
- GCP Pub/Sub pipeline for Pi ingest — direct REST to Cloud Run is simpler and hub_client.py already has offline buffer

## Context

- **Shipped:** v2.0 BioSim Integration (2026-03-16), v1.0 Mars Habitat Demo (2026-03-14)
- **Codebase:** 3,587 LOC TypeScript/TSX (frontend), 3,798 lines added across 28 files
- **Frontend stack:** React 19, Vite, TypeScript, R3F (fiber@9.5, drei@10.7, postprocessing@3.0, three@0.183), Zustand v5
- **Backend stack:** Django 5.2, DRF, PostgreSQL on Cloud SQL
- **Target audience:** NASA competition judges, portfolio reviewers evaluating full-stack + 3D + IoT capability
- **Known tech debt:** `fetchHabitatZones()` dead code (Django endpoint unused by frontend), seed thresholds diverged from constants.ts, sparklines flat for first 60s, fragile z-index stacking in AnomalyDrawer

## Constraints

- **Tech stack:** Django + React + TypeScript + Three.js (R3F)
- **Cloud deployment:** GCE VM (BioSim), Cloud Run (Django), Firebase Hosting (frontend), Cloud SQL (PostgreSQL)
- **GCP Project:** `interviewing-457222`
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
| Pi posts to Cloud Run Django endpoint (not local Docker) | NASA competition: judge has no Docker — everything in the cloud | — Pending |
| BioSim + bridge + control loop on GCE VM | BioSim needs persistent VM (90s JVM boot, WebSocket connections) | — Pending |
| Closed-loop: real pH drives BioSim malfunctions | Most impressive demo — real hardware influencing simulation | ✓ Good — control_loop management command with hysteresis |

---
*Last updated: 2026-03-21 after v4.0 Mars Habitat Revamp milestone started*
