# Requirements: SpatialHub Mars Habitat

**Defined:** 2026-03-14
**Core Value:** 3D habitat visualization powered by NASA BioSim physics that feels real, responsive, and efficient enough to run on rugged hardware at a Mars outpost

## v2.0 Requirements

Requirements for BioSim integration milestone. Each maps to roadmap phases.

### Infrastructure

- [x] **INFRA-01**: Docker Compose starts all services (BioSim, Open MCT, Django, PostgreSQL) with `docker compose up`
- [x] **INFRA-02**: BioSim simulation auto-starts on container boot with bundled XML mission config
- [x] **INFRA-03**: Docker healthchecks with `service_healthy` conditions and 90s JVM start period
- [x] **INFRA-04**: Django settings.py reads database credentials from environment variables for Docker

### Telemetry

- [x] **TELE-01**: Frontend WebSocket hook (`useBioSimWS`) connects to BioSim WS and drives habitatStore
- [x] **TELE-02**: Pure mapping function (`biosimMapper.ts`) translates BioSim module hierarchy to ZoneState/SensorReading types
- [x] **TELE-03**: WebSocket messages buffered via useRef and flushed on requestAnimationFrame cadence
- [x] **TELE-04**: 3D habitat scene displays real BioSim physics data with no component changes

### Performance

- [x] **PERF-01**: WebSocket data processing runs in a Web Worker to keep main thread free for rendering
- [x] **PERF-02**: Zustand store uses granular selectors so only affected zone/sensor components re-render on tick
- [x] **PERF-03**: Memory-bounded rolling buffers (fixed-size ring buffers for sparkline history, no unbounded arrays)
- [x] **PERF-04**: Django bridge batches writes (bulk_create per tick batch, not individual row inserts)
- [x] **PERF-05**: 3D scene maintains 60fps during peak telemetry throughput (10+ ticks/sec)
- [x] **PERF-06**: Sub-100ms latency from BioSim state change to visual update in habitat view
- [x] **PERF-07**: Frontend handles 10+ ticks/sec burst rate without dropping messages or leaking memory

### Fallback

- [x] **FALL-01**: `useSimSource` hook auto-detects BioSim availability within 2-5 seconds
- [x] **FALL-02**: Habitat gracefully falls back to client-side simulation when BioSim unavailable
- [x] **FALL-03**: HabitatHUD shows connection badge ("BioSim Connected" green / "Fallback Mode" amber)
- [x] **FALL-04**: Exactly one data source active at any time (state machine enforced)

### Anomaly

- [x] **ANOM-01**: AnomalyDrawer buttons POST real malfunctions to BioSim REST API in BioSim mode
- [x] **ANOM-02**: Anomaly cancel sends DELETE to BioSim malfunction endpoint using stored malfunction IDs
- [x] **ANOM-03**: AnomalyDrawer supports malfunction scheduling via `tickToOccur` delay field
- [x] **ANOM-04**: Existing anomaly behavior preserved in fallback (client-side) mode

### Pipeline

- [x] **PIPE-01**: Django async management command (`biosim_bridge`) connects to BioSim WebSocket
- [x] **PIPE-02**: Bridge writes BioSim tick data to `enriched_sensor_data` via `asyncio.to_thread()`
- [x] **PIPE-03**: `/api/enriched/` endpoint serves real BioSim historical data with no API changes
- [x] **PIPE-04**: `/trends` page displays real BioSim simulation history
- [x] **PIPE-05**: Tick log bulk import from BioSim `/log` endpoint into `enriched_sensor_data`

### Observability

- [x] **OBS-01**: Navigation link to Open MCT dashboard (opens `localhost:9091` in new tab)

## v3.0 Requirements

Requirements for physical sensor integration milestone. Each maps to roadmap phases.

### Hub Client

- [x] **HUB-01**: Config-driven Pi client reads settings from `.env` file (Docker host IP, sensor address, poll interval) — no hardcoded credentials or GCP dependency
- [x] **HUB-02**: Pi client POSTs sensor readings directly to Django REST API over WiFi using `requests`
- [x] **HUB-03**: AtlasI2C driver fixed — no 4-char truncation bug, no debug prints, handles read errors gracefully
- [x] **HUB-04**: SQLite offline buffer stores readings when Docker host is unreachable, syncs when connection restores
- [x] **HUB-05**: Pi client auto-detects all Atlas Scientific I2C devices on the bus, not just a single hardcoded address

### Data Ingest

- [x] **INGEST-01**: Django POST endpoint receives sensor readings from Pi and stores them in `EnrichedSensorData` with distinct `hub_id`
- [x] **INGEST-02**: Real Pi sensor data distinguishable from BioSim data via `hub_id` field (`pi-habitat-01` vs `biosim-habitat-01`)

### Cloud Deployment

- [ ] **DEPLOY-01**: Django API deployed to Cloud Run, publicly accessible, connected to Cloud SQL PostgreSQL
- [ ] **DEPLOY-02**: Frontend deployed to Firebase Hosting with production API base URL and BioSim WebSocket URL configured
- [ ] **DEPLOY-03**: BioSim simulation + biosim_bridge + Open MCT running on GCE VM with ports 8009 and 9091 accessible
- [ ] **DEPLOY-04**: Cloud SQL PostgreSQL instance provisioned with all Django tables migrated and `habitat_zones` seeded
- [ ] **DEPLOY-05**: Pi SD card `.env` pre-configured with Cloud Run endpoint URL — Pi connects to WiFi and starts sending data

### Closed-Loop Control

- [ ] **CTRL-01**: Control service compares real Pi pH to BioSim's simulated water recycling pH at regular intervals
- [ ] **CTRL-02**: pH divergence beyond configurable threshold triggers `Grey_Water_Store` malfunction via BioSim REST API
- [ ] **CTRL-03**: Control service auto-recovers — DELETEs malfunction when real pH normalizes back to expected range
- [ ] **CTRL-04**: Control service runs as a managed process on the BioSim GCE VM (`manage.py control_loop`)

### Frontend

- [ ] **UI-01**: Real Pi pH value visible in the Water Recycling zone panel alongside BioSim simulated data
- [ ] **UI-02**: HUD connection badge shows 5th state ("Real Sensor" with distinct color) when Pi data is flowing

### Setup & Docs

- [ ] **SETUP-01**: Competition setup guide covering: SD card preparation (OS, WiFi, hub_client), Pi wiring, EZO I2C mode switch, `.env` with cloud URLs, and first-run verification
- [ ] **SETUP-02**: Guide is reproducible — a NASA judge with a Pi and Atlas Scientific I2C sensor can follow it and see data in the web dashboard

## v4+ Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Scenarios

- **SCEN-01**: Multiple XML mission scenarios selectable at runtime
- **SCEN-02**: Custom Open MCT telemetry plugin for SpatialHub-specific views
- **SCEN-03**: Tick rate UI control for simulation speed adjustment
- **MULTI-01**: Multiple sensor types (dissolved oxygen, EC, temperature) driving multiple BioSim modules
- **MULTI-02**: Multiple Pi hubs feeding different habitat zones simultaneously

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom Open MCT plugins | Weeks of work for zero visual gain beyond pre-configured dashboard |
| Tick rate UI control | Breaks push-model WebSocket architecture |
| Multiple XML scenarios at runtime | Scope creep with no portfolio ROI |
| Authentication/session management | BioSim has no auth model; out of scope per PROJECT.md |
| Embedding Open MCT in iframe | Crops full-viewport layout; new tab link is correct |
| BioSim source code in repo | GPL v3 copyleft — network API boundary only |
| GCP Pub/Sub pipeline | Replaced by direct REST for local reproducibility |
| Multiple sensor types | pH only for v3.0 — architecture supports extension |
| Custom PCB / enclosure | Standard breadboard setup for demo |
| MQTT transport | Over-engineered for single-sensor local WiFi |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 5 | Complete |
| INFRA-02 | Phase 5 | Complete |
| INFRA-03 | Phase 5 | Complete |
| INFRA-04 | Phase 5 | Complete |
| TELE-01 | Phase 7 | Complete |
| TELE-02 | Phase 6 | Complete |
| TELE-03 | Phase 7 | Complete |
| TELE-04 | Phase 7 | Complete |
| PERF-01 | Phase 7 | Complete |
| PERF-02 | Phase 7 | Complete |
| PERF-03 | Phase 6 | Complete |
| PERF-04 | Phase 6 | Complete |
| PERF-05 | Phase 7 | Complete |
| PERF-06 | Phase 7 | Complete |
| PERF-07 | Phase 7 | Complete |
| FALL-01 | Phase 7 | Complete |
| FALL-02 | Phase 7 | Complete |
| FALL-03 | Phase 7 | Complete |
| FALL-04 | Phase 7 | Complete |
| ANOM-01 | Phase 8 | Complete |
| ANOM-02 | Phase 8 | Complete |
| ANOM-03 | Phase 8 | Complete |
| ANOM-04 | Phase 8 | Complete |
| PIPE-01 | Phase 9 | Complete |
| PIPE-02 | Phase 9 | Complete |
| PIPE-03 | Phase 9 | Complete |
| PIPE-04 | Phase 9 | Complete |
| PIPE-05 | Phase 9 | Complete |
| OBS-01 | Phase 5 | Complete |
| HUB-01 | Phase 10 | Complete |
| HUB-02 | Phase 10 | Complete |
| HUB-03 | Phase 10 | Complete |
| HUB-04 | Phase 10 | Complete |
| HUB-05 | Phase 10 | Complete |
| INGEST-01 | Phase 10 | Complete |
| INGEST-02 | Phase 10 | Complete |
| DEPLOY-01 | Phase 11 | Pending |
| DEPLOY-02 | Phase 11 | Pending |
| DEPLOY-03 | Phase 12 | Pending |
| DEPLOY-04 | Phase 11 | Pending |
| DEPLOY-05 | Phase 13 | Pending |
| CTRL-01 | Phase 14 | Pending |
| CTRL-02 | Phase 14 | Pending |
| CTRL-03 | Phase 14 | Pending |
| CTRL-04 | Phase 14 | Pending |
| UI-01 | Phase 15 | Pending |
| UI-02 | Phase 15 | Pending |
| SETUP-01 | Phase 16 | Pending |
| SETUP-02 | Phase 16 | Pending |

**Coverage:**
- v2.0 requirements: 29 total (all complete)
- v3.0 requirements: 20 total (HUB ×5, INGEST ×2, DEPLOY ×5, CTRL ×4, UI ×2, SETUP ×2)
- Mapped to phases: 20 (Phases 10-16)
- Unmapped: 0

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-18 — v3.0 pivoted to cloud deployment model for NASA competition, phases 11-16 replanned*
