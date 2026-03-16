# Roadmap: SpatialHub Mars Habitat Demo

## Milestones

- ✅ **v1.0 Mars Habitat Demo** — Phases 1-4 (shipped 2026-03-14)
- 🚧 **v2.0 BioSim Integration** — Phases 5-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 Mars Habitat Demo (Phases 1-4) — SHIPPED 2026-03-14</summary>

- [x] Phase 1: Data Foundation (2/2 plans) — completed 2026-03-10
- [x] Phase 2: 3D Scene and Zone Interaction (4/4 plans) — completed 2026-03-10
- [x] Phase 3: UI Panels and Live Data (2/2 plans) — completed 2026-03-13
- [x] Phase 4: Anomaly System (2/2 plans) — completed 2026-03-14

</details>

### 🚧 v2.0 BioSim Integration (In Progress)

**Milestone Goal:** Replace client-side simulation with NASA BioSim physics — real interconnected subsystem dynamics, Docker infrastructure, WebSocket data pipelines, Django historical ingest, and graceful fallback for reviewers without Docker.

- [x] **Phase 5: Docker Infrastructure** — Full stack starts with `docker compose up`; BioSim running and module JSON captured (completed 2026-03-15)
- [x] **Phase 6: Data Mapping Layer** — Pure translation functions converting BioSim physics output to ZoneState/SensorReading types (completed 2026-03-16)
- [x] **Phase 7: Frontend WebSocket + Fallback** — 3D habitat driven by real BioSim physics; auto-fallback to client-side sim when BioSim unavailable (completed 2026-03-16)
- [x] **Phase 8: AnomalyDrawer Rewire** — AnomalyDrawer triggers real BioSim malfunctions with cascading physics failures (completed 2026-03-16)
- [ ] **Phase 9: Django Bridge + Historical Pipeline** — Django async bridge ingests BioSim ticks; /trends serves real simulation history

## Phase Details

### Phase 5: Docker Infrastructure
**Goal**: The full stack (BioSim, Open MCT, Django, PostgreSQL) starts with a single `docker compose up`; BioSim is confirmed running and its live module JSON is captured as a test fixture for mapping work
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, OBS-01
**Success Criteria** (what must be TRUE):
  1. `docker compose up` starts all four services (biosim, openmct, db, django) without manual intervention
  2. BioSim returns a valid simID and `GET /api/simulation/{simID}` returns parseable module state JSON
  3. `wscat ws://localhost:8009/ws/simulation/{simID}` prints live module state on every tick
  4. Open MCT dashboard is accessible at `localhost:9091` via a nav link in the frontend
  5. Django reads database credentials from environment variables (no hardcoded Cloud SQL credentials required for local stack)
**Plans:** 3 plans (2 complete, 1 gap closure)

Plans:
- [x] 05-01-PLAN.md — Docker Compose four-service stack with healthchecks, BioSim auto-start, Django entrypoint
- [x] 05-02-PLAN.md — Open MCT external nav link in frontend
- [ ] 05-03-PLAN.md — Gap closure: capture live BioSim module state fixture (replaces placeholder)

### Phase 6: Data Mapping Layer
**Goal**: Pure translation functions (`biosimMapper.ts` and `biosim_ingest.py`) that convert BioSim's raw physics module hierarchy to the existing ZoneState/SensorReading types — tested against the Phase 5 live JSON snapshot before any live connection code is written
**Depends on**: Phase 5 (live BioSim module JSON captured)
**Requirements**: TELE-02, PERF-03, PERF-04
**Success Criteria** (what must be TRUE):
  1. `biosimMapper.ts` converts a real BioSim WebSocket message to a valid `Record<zoneId, Record<sensorId, SensorReading>>` with no silent zero-fills
  2. Unit tests for `biosimMapper.ts` pass against the Phase 5 JSON fixture, covering all four habitat zones
  3. `biosim_ingest.py` converts a BioSim tick to valid `EnrichedSensorData` rows with documented unit conversions (mol, Pa, flow rates)
  4. Sparkline history uses fixed-size ring buffers — no unbounded array growth under sustained telemetry
**Plans:** 2/2 plans complete

Plans:
- [x] 06-01-PLAN.md — biosimMapper.ts: vitest setup, BIOSIM_SENSOR_THRESHOLDS, TDD pure mapper with ring buffer (TELE-02, PERF-03) — completed 2026-03-16
- [ ] 06-02-PLAN.md — biosim_ingest.py: pytest setup, TDD pure translation function for bulk_create (PERF-04)

### Phase 7: Frontend WebSocket + Fallback
**Goal**: The 3D habitat is driven by real BioSim physics when Docker is running, automatically falls back to the v1.0 client-side simulation when BioSim is unavailable, and the HabitatHUD shows which data source is active — all without any changes to 3D scene components
**Depends on**: Phase 6 (biosimMapper.ts delivering a known-good data contract)
**Requirements**: TELE-01, TELE-03, TELE-04, FALL-01, FALL-02, FALL-03, FALL-04, PERF-01, PERF-02, PERF-05, PERF-06, PERF-07
**Success Criteria** (what must be TRUE):
  1. Zone colors, sensor readings, and sparklines in the 3D habitat update from real BioSim physics when Docker is running
  2. When BioSim is unreachable, the habitat detects unavailability within 5 seconds and activates client-side simulation automatically
  3. HabitatHUD displays a green "BioSim Connected" badge or amber "Fallback Mode" badge — never both, never neither
  4. Navigating away from `/habitat` and back five times leaves exactly one WebSocket connection open in DevTools
  5. 3D scene holds 60fps during peak telemetry throughput with WebSocket data processing off the main render thread
**Plans:** 2/2 plans complete

Plans:
- [ ] 07-01-PLAN.md — Type contracts, Worker-owned WebSocket, useSimSource orchestration hook with probe/fallback/reconnection/RAF buffer
- [ ] 07-02-PLAN.md — ConnectionBadge component, HabitatHUD integration, HabitatView rewire, visual verification

### Phase 8: AnomalyDrawer Rewire
**Goal**: AnomalyDrawer buttons trigger real BioSim malfunctions (with cascading physics failures) in BioSim mode and preserve existing bias-curve behavior in fallback mode — no JSX changes to AnomalyDrawer
**Depends on**: Phase 7 (`simSource` state exists in Zustand store)
**Requirements**: ANOM-01, ANOM-02, ANOM-03, ANOM-04
**Success Criteria** (what must be TRUE):
  1. Clicking an anomaly scenario in BioSim mode sends a POST to BioSim's malfunction endpoint and the habitat responds with real cascading physics failures
  2. Clicking cancel sends a DELETE to BioSim using the stored malfunction ID — bias ramp-down is not used in BioSim mode
  3. Optional delay field in AnomalyDrawer schedules malfunction onset via `tickToOccur` parameter
  4. In fallback (engine) mode, all four existing anomaly scenarios behave identically to v1.0
**Plans:** 2/2 plans complete

Plans:
- [ ] 08-01-PLAN.md — biosimMalfunctions service, habitatStore dual-path triggerAnomaly/cancelAnomaly, unit tests (ANOM-01, ANOM-02, ANOM-03, ANOM-04)
- [ ] 08-02-PLAN.md — useSimSource biosimSimId wiring, end-to-end visual verification (ANOM-01, ANOM-02, ANOM-04)

### Phase 9: Django Bridge + Historical Pipeline
**Goal**: A long-running Django async management command independently ingests BioSim tick data into `enriched_sensor_data`, making `/api/enriched/` and `/trends` serve real simulation history — no frontend or API endpoint changes required
**Depends on**: Phase 6 (biosim_ingest.py delivering a known-good row format)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. `python manage.py biosim_bridge` connects to BioSim WebSocket and writes tick rows to `enriched_sensor_data` via bulk_create
  2. The `/api/enriched/` endpoint returns rows sourced from real BioSim simulation data after the bridge runs for 60+ seconds
  3. The `/trends` page renders graphs with real BioSim physics data — not simulated Brownian motion
  4. The bridge docker service starts successfully after BioSim is healthy (no silent crash on race condition)
  5. Bulk import from BioSim `/log` endpoint populates historical rows in `enriched_sensor_data` on command
**Plans**: TBD

Plans:
- [ ] 09-01: biosim_bridge management command + django-bridge Docker service
- [ ] 09-02: Bulk tick log import command

## Progress

**Execution Order:** 5 -> 6 -> 7 -> 8 -> 9 (Phases 7-8 depend on 6; Phase 9 depends on 6 and can parallel 7-8)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 2/2 | Complete | 2026-03-10 |
| 2. 3D Scene and Zone Interaction | v1.0 | 4/4 | Complete | 2026-03-10 |
| 3. UI Panels and Live Data | v1.0 | 2/2 | Complete | 2026-03-13 |
| 4. Anomaly System | v1.0 | 2/2 | Complete | 2026-03-14 |
| 5. Docker Infrastructure | v2.0 | 2/3 | Gap closure | - |
| 6. Data Mapping Layer | v2.0 | 2/2 | Complete | 2026-03-16 |
| 7. Frontend WebSocket + Fallback | v2.0 | 2/2 | Complete | 2026-03-16 |
| 8. AnomalyDrawer Rewire | 2/2 | Complete   | 2026-03-16 | - |
| 9. Django Bridge + Historical Pipeline | v2.0 | 0/2 | Not started | - |
