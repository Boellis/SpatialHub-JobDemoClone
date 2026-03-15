# Requirements: SpatialHub Mars Habitat — BioSim Integration

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

- [ ] **TELE-01**: Frontend WebSocket hook (`useBioSimWS`) connects to BioSim WS and drives habitatStore
- [ ] **TELE-02**: Pure mapping function (`biosimMapper.ts`) translates BioSim module hierarchy to ZoneState/SensorReading types
- [ ] **TELE-03**: WebSocket messages buffered via useRef and flushed on requestAnimationFrame cadence
- [ ] **TELE-04**: 3D habitat scene displays real BioSim physics data with no component changes

### Performance

- [ ] **PERF-01**: WebSocket data processing runs in a Web Worker to keep main thread free for rendering
- [ ] **PERF-02**: Zustand store uses granular selectors so only affected zone/sensor components re-render on tick
- [ ] **PERF-03**: Memory-bounded rolling buffers (fixed-size ring buffers for sparkline history, no unbounded arrays)
- [ ] **PERF-04**: Django bridge batches writes (bulk_create per tick batch, not individual row inserts)
- [ ] **PERF-05**: 3D scene maintains 60fps during peak telemetry throughput (10+ ticks/sec)
- [ ] **PERF-06**: Sub-100ms latency from BioSim state change to visual update in habitat view
- [ ] **PERF-07**: Frontend handles 10+ ticks/sec burst rate without dropping messages or leaking memory

### Fallback

- [ ] **FALL-01**: `useSimSource` hook auto-detects BioSim availability within 2-5 seconds
- [ ] **FALL-02**: Habitat gracefully falls back to client-side simulation when BioSim unavailable
- [ ] **FALL-03**: HabitatHUD shows connection badge ("BioSim Connected" green / "Fallback Mode" amber)
- [ ] **FALL-04**: Exactly one data source active at any time (state machine enforced)

### Anomaly

- [ ] **ANOM-01**: AnomalyDrawer buttons POST real malfunctions to BioSim REST API in BioSim mode
- [ ] **ANOM-02**: Anomaly cancel sends DELETE to BioSim malfunction endpoint using stored malfunction IDs
- [ ] **ANOM-03**: AnomalyDrawer supports malfunction scheduling via `tickToOccur` delay field
- [ ] **ANOM-04**: Existing anomaly behavior preserved in fallback (client-side) mode

### Pipeline

- [ ] **PIPE-01**: Django async management command (`biosim_bridge`) connects to BioSim WebSocket
- [ ] **PIPE-02**: Bridge writes BioSim tick data to `enriched_sensor_data` via `asyncio.to_thread()`
- [ ] **PIPE-03**: `/api/enriched/` endpoint serves real BioSim historical data with no API changes
- [ ] **PIPE-04**: `/trends` page displays real BioSim simulation history
- [ ] **PIPE-05**: Tick log bulk import from BioSim `/log` endpoint into `enriched_sensor_data`

### Observability

- [x] **OBS-01**: Navigation link to Open MCT dashboard (opens `localhost:9091` in new tab)

## v3+ Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Scenarios

- **SCEN-01**: Multiple XML mission scenarios selectable at runtime
- **SCEN-02**: Custom Open MCT telemetry plugin for SpatialHub-specific views
- **SCEN-03**: Tick rate UI control for simulation speed adjustment

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom Open MCT plugins | Weeks of work for zero visual gain beyond pre-configured dashboard |
| Tick rate UI control | Breaks push-model WebSocket architecture |
| Multiple XML scenarios at runtime | Scope creep with no portfolio ROI |
| Authentication/session management | BioSim has no auth model; out of scope per PROJECT.md |
| Embedding Open MCT in iframe | Crops full-viewport layout; new tab link is correct |
| BioSim source code in repo | GPL v3 copyleft — network API boundary only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 5 | Complete |
| INFRA-02 | Phase 5 | Complete |
| INFRA-03 | Phase 5 | Complete |
| INFRA-04 | Phase 5 | Complete |
| TELE-01 | Phase 7 | Pending |
| TELE-02 | Phase 6 | Pending |
| TELE-03 | Phase 7 | Pending |
| TELE-04 | Phase 7 | Pending |
| PERF-01 | Phase 7 | Pending |
| PERF-02 | Phase 7 | Pending |
| PERF-03 | Phase 6 | Pending |
| PERF-04 | Phase 6 | Pending |
| PERF-05 | Phase 7 | Pending |
| PERF-06 | Phase 7 | Pending |
| PERF-07 | Phase 7 | Pending |
| FALL-01 | Phase 7 | Pending |
| FALL-02 | Phase 7 | Pending |
| FALL-03 | Phase 7 | Pending |
| FALL-04 | Phase 7 | Pending |
| ANOM-01 | Phase 8 | Pending |
| ANOM-02 | Phase 8 | Pending |
| ANOM-03 | Phase 8 | Pending |
| ANOM-04 | Phase 8 | Pending |
| PIPE-01 | Phase 9 | Pending |
| PIPE-02 | Phase 9 | Pending |
| PIPE-03 | Phase 9 | Pending |
| PIPE-04 | Phase 9 | Pending |
| PIPE-05 | Phase 9 | Pending |
| OBS-01 | Phase 5 | Complete |

**Coverage:**
- v2.0 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 — traceability filled after roadmap creation*
