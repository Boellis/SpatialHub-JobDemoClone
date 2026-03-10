# Roadmap: SpatialHub Mars Habitat Demo

## Overview

Four phases turn an existing IoT dashboard into a visually stunning 3D Mars habitat monitor. The build starts with the data plumbing (Django endpoints, bug fix, simulation engine) before touching any visuals, so every 3D component has real data to consume from day one. The 3D scene and zone interactions come next, establishing the visual identity and spatial navigation model. UI panels layer on top of the working scene to provide detail views and system status. The anomaly system — the demo's "wow factor" — arrives last, after all four prerequisite layers exist to make it land correctly.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - Backend API extensions, bug fix, TypeScript types, Zustand store, and simulation engine producing realistic Mars telemetry (completed 2026-03-10)
- [x] **Phase 2: 3D Scene and Zone Interaction** - R3F Canvas with procedural habitat geometry, environment, post-processing, and interactive clickable zones (completed 2026-03-10)
- [ ] **Phase 3: UI Panels and Live Data** - Zone drill-down panel, alert banners, HUD system overview, and sparkline trend charts
- [ ] **Phase 4: Anomaly System** - Scenario triggers, gradual onset/recovery curves, visual drama, and alert escalation flow

## Phase Details

### Phase 1: Data Foundation
**Goal**: The simulation engine is running, Django serves habitat configuration, and all client-side data infrastructure exists — verifiable without any UI
**Depends on**: Nothing (first phase)
**Requirements**: API-01, API-02, SIM-01, SIM-02
**Success Criteria** (what must be TRUE):
  1. Visiting `/api/habitat/zones/` returns a JSON list of four zone objects with sensor configs and thresholds
  2. The double `/api/api/` path bug is gone — all existing frontend API calls resolve correctly
  3. The simulation engine ticks every 2 seconds and produces sensor values in expected Mars ranges (CO2 400-5000 ppm, temp 18-28°C, etc.)
  4. Zone status (green/yellow/red) is derived automatically from sensor thresholds and updates on every tick
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Backend API endpoint for habitat zones + fix double /api/api/ path bug
- [x] 01-02-PLAN.md — Frontend simulation infrastructure (types, constants, Zustand store, simulation engine)

### Phase 2: 3D Scene and Zone Interaction
**Goal**: Users can open `/habitat` and see a visually impressive 3D Mars habitat they can orbit, zoom, and click into
**Depends on**: Phase 1
**Requirements**: SCENE-01, SCENE-02, SCENE-03, SCENE-04, INT-01, INT-02, INT-03
**Success Criteria** (what must be TRUE):
  1. User lands on `/habitat` and sees a 3D procedural Mars habitat scene with orbit and zoom controls working without page artifacts
  2. Four visually distinct zone meshes are identifiable — Grow Bays, Atmosphere Control, Water Recycling, Power/Thermal — with mission-control dark aesthetic
  3. Hovering a zone produces a visible highlight effect; clicking it triggers a smooth camera transition into that zone (no teleporting)
  4. 3D sensor node markers are visible at positions within zones
  5. Emissive/glowing elements show selective bloom post-processing; the scene reads as cinematic rather than a dev prototype
**Plans:** 4/4 plans complete

Plans:
- [x] 02-01-PLAN.md — Install R3F ecosystem, create /habitat route with lazy loading, render Mars environment (ground, lights, fog)
- [x] 02-02-PLAN.md — Procedural dome geometry, tube corridors, status-reactive emissive materials, selective bloom, floating labels
- [x] 02-03-PLAN.md — Hover highlights, click-to-zoom camera transitions, sensor node orbs with live data tooltips
- [ ] 02-04-PLAN.md — Gap closure: fix sensor orb tooltips blocked by dome mesh raycasting

### Phase 3: UI Panels and Live Data
**Goal**: Users see live sensor data flowing into panels alongside the 3D scene, with a system overview HUD always visible
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, SIM-03
**Success Criteria** (what must be TRUE):
  1. Clicking a zone opens a detail panel showing that zone's live sensor readings updating every 2 seconds without user action
  2. Each sensor in the panel shows a mini sparkline chart of the last 30-60 seconds of readings
  3. A persistent HUD overlay shows sol count, overall habitat status, and active sensor count
  4. Alert/warning banners appear automatically when any sensor crosses a threshold (no manual intervention required)
**Plans**: TBD

### Phase 4: Anomaly System
**Goal**: Users can trigger crisis scenarios and watch the 3D habitat respond with visual drama — zones flash, alerts escalate, sensors spike — then gradually recover
**Depends on**: Phase 3
**Requirements**: ANOM-01, ANOM-02, ANOM-03
**Success Criteria** (what must be TRUE):
  1. User can trigger at least four named anomaly scenarios (CO2 spike, pump failure, nutrient crash, power fluctuation) from a control panel
  2. Triggering an anomaly causes affected zone meshes to visibly flash or pulse red, alert banners escalate, and sensor values show correlated spikes
  3. Anomalies build gradually over several seconds (not instant toggle) and recover gradually after the scenario ends or times out
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 2/2 | Complete   | 2026-03-10 |
| 2. 3D Scene and Zone Interaction | 4/4 | Complete   | 2026-03-10 |
| 3. UI Panels and Live Data | 0/TBD | Not started | - |
| 4. Anomaly System | 0/TBD | Not started | - |
