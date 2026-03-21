# Roadmap: SpatialHub Mars Habitat Demo

## Milestones

- ✅ **v1.0 Mars Habitat Demo** - Phases 1-4 (shipped 2026-03-14)
- ✅ **v2.0 BioSim Integration** - Phases 5-9 (shipped 2026-03-16)
- ✅ **v3.0 Physical Sensor Integration** - Phases 10-16 (shipped 2026-03-20)
- 🚧 **v4.0 Mars Habitat Revamp** - Phases 17-20 (in progress)

## Phases

<details>
<summary>✅ v1.0 Mars Habitat Demo (Phases 1-4) - SHIPPED 2026-03-14</summary>

### Phase 1: Data Foundation
**Goal**: Django API and simulation engine produce valid zone + sensor data
**Plans**: 2 plans

Plans:
- [x] 01-01: Django HabitatZone model and API endpoint
- [x] 01-02: Fix double /api/api/ path bug in frontend API client

### Phase 2: 3D Scene and Zone Interaction
**Goal**: Users can view and interact with the 3D habitat
**Plans**: 4 plans

Plans:
- [x] 02-01: Procedural R3F scene with 4 domes
- [x] 02-02: Hover highlight and click-to-zoom camera transitions
- [x] 02-03: Sensor orbs with live tooltips
- [x] 02-04: Selective bloom post-processing

### Phase 3: UI Panels and Live Data
**Goal**: Zone detail panel and HUD display live sensor readings
**Plans**: 2 plans

Plans:
- [x] 03-01: ZonePanel sidebar with sparkline charts
- [x] 03-02: HabitatHUD glassmorphism overlay and AlertBanner

### Phase 4: Anomaly System
**Goal**: Users can trigger and observe anomaly scenarios with visual drama
**Plans**: 2 plans

Plans:
- [x] 04-01: 4 crisis scenarios with onset/recovery curves
- [x] 04-02: AnomalyDrawer UI and alert escalation visuals

</details>

<details>
<summary>✅ v2.0 BioSim Integration (Phases 5-9) - SHIPPED 2026-03-16</summary>

### Phase 5: Docker Infrastructure
**Goal**: Full docker-compose stack runs with one command
**Plans**: 3 plans

### Phase 6: Data Mapping Layer
**Goal**: BioSim telemetry maps to habitat zone/sensor schema
**Plans**: 2 plans

### Phase 7: Frontend WebSocket + Fallback
**Goal**: Frontend connects to BioSim live data with automatic fallback to client sim
**Plans**: 2 plans

### Phase 8: AnomalyDrawer Rewire
**Goal**: AnomalyDrawer triggers real BioSim malfunctions via REST
**Plans**: 2 plans

### Phase 9: Django Bridge Historical Pipeline
**Goal**: BioSim ticks persist to Cloud SQL and serve via Django enriched endpoint
**Plans**: 2 plans

</details>

<details>
<summary>✅ v3.0 Physical Sensor Integration (Phases 10-16) - SHIPPED 2026-03-20</summary>

### Phase 10: Django Ingest + Hubcode Rewrite
**Goal**: Pi posts real sensor data to Cloud Run Django endpoint
**Plans**: 3 plans

### Phase 11: Cloud Services Deployment
**Goal**: Django running on Cloud Run with Cloud SQL PostgreSQL
**Plans**: 2 plans

### Phase 12: BioSim VM Deployment
**Goal**: BioSim + bridge + Open MCT running on GCE VM with HTTPS
**Plans**: 2 plans

### Phase 13: Pi-to-Cloud Pipeline
**Goal**: Real Atlas Scientific pH data flows from Pi through Cloud SQL to frontend
**Plans**: 1 plan

### Phase 14: Closed-Loop Control Service
**Goal**: Real pH divergence triggers BioSim water recycling malfunctions
**Plans**: 1 plan

### Phase 15: Frontend Real Sensor Visibility
**Goal**: Real sensor data visible in 3D habitat alongside BioSim physics
**Plans**: 1 plan

### Phase 16: Competition Package
**Goal**: Judge can receive SD card + URL and demo flows end-to-end
**Plans**: 1 plan

</details>

---

### 🚧 v4.0 Mars Habitat Revamp (In Progress)

**Milestone Goal:** Replace the interactive 3D habitat with a non-interactive 2.5D ambient TV dashboard — priority-driven grid layout with live charts, algorithmic zone reordering, FLIP transitions, and Three.js parallax depth.

## Phase Details

### Phase 17: TV Scaffold + Priority Foundation
**Goal**: A non-interactive `/tv` route exists with correct R3F setup and a working criticality ranking algorithm that drives zone order without thrashing
**Depends on**: Phase 16
**Requirements**: LAYOUT-01, LAYOUT-03
**Success Criteria** (what must be TRUE):
  1. Navigating to `/tv` shows a full-viewport display with zero click/hover/touch handlers registered anywhere in the component tree
  2. The `usePriorityRanking` hook returns zones ordered by `(red_count * 10) + (yellow_count * 3)` score, verified in browser devtools with a simulated zone state change
  3. Priority order does not change on every 2s tick when sensors are near threshold boundaries — requires 3 consecutive stable ticks before committing a reorder
  4. R3F Canvas has `events={null}` confirmed — no raycaster activity visible in Three.js renderer stats
**Plans**: TBD

### Phase 18: Zone Cards + Static Grid
**Goal**: The TV dashboard displays all four zones in a priority-ordered grid with live sensor readings, sparkline charts, HUD metadata, and status indicators — glanceable from across the room
**Depends on**: Phase 17
**Requirements**: LAYOUT-02, DATA-01, DATA-02, DATA-03, DATA-04, STAT-01, STAT-02
**Success Criteria** (what must be TRUE):
  1. The most critical zone occupies the hero slot (2-column span, large card) and the remaining 3 zones appear as smaller secondary cards
  2. Each zone card displays live sensor values in TV-safe typography (primary values visually dominant, readable from 3 meters)
  3. Each zone card shows a sparkline chart that updates with the zone's sensor history
  4. The full-width status bar reads "ALL SYSTEMS NOMINAL" when all zones are green, or shows a specific alert message when any zone is yellow/red
  5. Red-status zone cards pulse with an animated border/glow; the Sol counter and data source badge are visible in the HUD
**Plans**: TBD

### Phase 19: FLIP Animation + Long-Session Resilience
**Goal**: Zone cards animate into new grid positions when criticality ranking changes, and the dashboard runs without degradation over 8+ hour TV sessions
**Depends on**: Phase 18
**Requirements**: LAYOUT-04
**Success Criteria** (what must be TRUE):
  1. When a zone's status changes enough to cross a criticality threshold, cards slide smoothly into their new ranked positions (FLIP transition, not instant snap)
  2. Card content (text, chart, status badge) does not distort or scale incorrectly during a grid reorder animation
  3. After 10 minutes of continuous running in a production build, `renderer.info.memory.geometries` is flat (no GPU memory growth)
  4. The dashboard continues updating normally after the browser tab is backgrounded and re-foregrounded
**Plans**: TBD

### Phase 20: Parallax Polish
**Goal**: A Three.js parallax background layer adds ambient depth behind the priority grid
**Depends on**: Phase 19
**Requirements**: VIS-01
**Success Criteria** (what must be TRUE):
  1. The `/tv` route shows auto-drifting geometry behind the zone grid — movement is continuous, sine-wave driven, requires no mouse or touch input
  2. The parallax canvas does not register pointer events or interfere with any DOM element above it
  3. The parallax layer renders with Mars color palette geometry that does not obscure zone card readability at 1920x1080
**Plans**: TBD

## Progress

**Execution Order:** 17 → 18 → 19 → 20

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 2/2 | Complete | 2026-03-14 |
| 2. 3D Scene and Zone Interaction | v1.0 | 4/4 | Complete | 2026-03-14 |
| 3. UI Panels and Live Data | v1.0 | 2/2 | Complete | 2026-03-14 |
| 4. Anomaly System | v1.0 | 2/2 | Complete | 2026-03-14 |
| 5. Docker Infrastructure | v2.0 | 3/3 | Complete | 2026-03-16 |
| 6. Data Mapping Layer | v2.0 | 2/2 | Complete | 2026-03-16 |
| 7. Frontend WebSocket + Fallback | v2.0 | 2/2 | Complete | 2026-03-16 |
| 8. AnomalyDrawer Rewire | v2.0 | 2/2 | Complete | 2026-03-16 |
| 9. Django Bridge Historical Pipeline | v2.0 | 2/2 | Complete | 2026-03-16 |
| 10. Django Ingest + Hubcode Rewrite | v3.0 | 3/3 | Complete | 2026-03-20 |
| 11. Cloud Services Deployment | v3.0 | 2/2 | Complete | 2026-03-20 |
| 12. BioSim VM Deployment | v3.0 | 2/2 | Complete | 2026-03-20 |
| 13. Pi-to-Cloud Pipeline | v3.0 | 1/1 | Complete | 2026-03-20 |
| 14. Closed-Loop Control Service | v3.0 | 1/1 | Complete | 2026-03-20 |
| 15. Frontend Real Sensor Visibility | v3.0 | 1/1 | Complete | 2026-03-20 |
| 16. Competition Package | v3.0 | 1/1 | Complete | 2026-03-20 |
| 17. TV Scaffold + Priority Foundation | v4.0 | 0/? | Not started | - |
| 18. Zone Cards + Static Grid | v4.0 | 0/? | Not started | - |
| 19. FLIP Animation + Long-Session Resilience | v4.0 | 0/? | Not started | - |
| 20. Parallax Polish | v4.0 | 0/? | Not started | - |
