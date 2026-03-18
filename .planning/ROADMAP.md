# Roadmap: SpatialHub Mars Habitat Demo

## Milestones

- ✅ **v1.0 Mars Habitat Demo** — Phases 1-4 (shipped 2026-03-14)
- ✅ **v2.0 BioSim Integration** — Phases 5-9 (shipped 2026-03-16)
- 🚧 **v3.0 Physical Sensor Integration** — Phases 10-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 Mars Habitat Demo (Phases 1-4) — SHIPPED 2026-03-14</summary>

- [x] Phase 1: Data Foundation (2/2 plans) — completed 2026-03-10
- [x] Phase 2: 3D Scene and Zone Interaction (4/4 plans) — completed 2026-03-10
- [x] Phase 3: UI Panels and Live Data (2/2 plans) — completed 2026-03-13
- [x] Phase 4: Anomaly System (2/2 plans) — completed 2026-03-14

</details>

<details>
<summary>✅ v2.0 BioSim Integration (Phases 5-9) — SHIPPED 2026-03-16</summary>

- [x] Phase 5: Docker Infrastructure — completed 2026-03-15
- [x] Phase 6: Data Mapping Layer — completed 2026-03-16
- [x] Phase 7: Frontend WebSocket + Fallback — completed 2026-03-16
- [x] Phase 8: AnomalyDrawer Rewire — completed 2026-03-16
- [x] Phase 9: Django Bridge + Historical Pipeline — completed 2026-03-16

</details>

### 🚧 v3.0 Physical Sensor Integration (In Progress)

**Milestone Goal:** Connect a real Raspberry Pi with an Atlas Scientific pH sensor to the BioSim simulation — real pH readings drive BioSim's water recycling system via a closed-loop control service. Reproducible for anyone with a Pi and Atlas I2C hardware.

- [ ] **Phase 10: Django Ingest + Hubcode Rewrite** — Real Pi pH data reaching the Django stack over WiFi with no GCP dependency
- [ ] **Phase 11: Closed-Loop Control Service** — pH divergence from real sensor automatically triggers and clears BioSim water recycling malfunctions
- [ ] **Phase 12: Frontend Real Sensor Visibility** — Real pH value overlaid in the 3D habitat Water Recycling zone with a distinct HUD badge state
- [ ] **Phase 13: Reproducible Setup Guide** — Anyone with a Pi and Atlas I2C sensor can follow the guide end-to-end and run the full demo

## Phase Details

### Phase 10: Django Ingest + Hubcode Rewrite
**Goal**: Real Pi pH readings reach the Django stack — a new `SensorIngestView` endpoint accepts POST payloads from the Pi with a distinct `hub_id`, and `hub_client.py` replaces the GCP-dependent hubcode entirely, reading Atlas I2C pH and posting to Django over WiFi via `.env` config
**Depends on**: Phase 9 (existing Django stack and `enriched_sensor_data` model)
**Requirements**: HUB-01, HUB-02, HUB-03, HUB-04, HUB-05, INGEST-01, INGEST-02
**Success Criteria** (what must be TRUE):
  1. `curl -X POST http://localhost:8000/api/sensor-ingest/` with a valid JSON payload stores a row in `enriched_sensor_data` with `hub_id='pi-habitat-01'`
  2. Pi client starts from a `.env` file with no GCP credentials and posts real Atlas I2C pH readings to the running Django stack over WiFi
  3. Pi client parses pH correctly for all valid values including those >= 10.0 (no 4-char truncation bug)
  4. Rows from the Pi are distinguishable from BioSim rows via `hub_id` — `GET /api/enriched/?hub_id=pi-habitat-01` returns only Pi data
  5. When the Docker host is unreachable, the Pi client buffers readings locally and syncs when connection restores
**Plans:** 2/3 plans executed
Plans:
- [ ] 10-01-PLAN.md — Django SensorIngestView endpoint + tests (TDD)
- [ ] 10-02-PLAN.md — AtlasI2C driver rewrite + hub_client.py + buffer + old file cleanup
- [ ] 10-03-PLAN.md — Integration verification + user checkpoint

### Phase 11: Closed-Loop Control Service
**Goal**: A Django management command running as a Docker Compose service reads the latest real Pi pH and the latest BioSim proxy pH from the database every 10 seconds, posts a `Grey_Water_Store` malfunction to BioSim when divergence exceeds the threshold, and deletes it when pH normalizes — the causal chain (real pH drifts → zone turns red → water recycling degrades) is observable end-to-end
**Depends on**: Phase 10 (Pi rows in `enriched_sensor_data` to compare against BioSim rows)
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):
  1. When real Pi pH diverges more than the configured threshold from BioSim's simulated `wr-ph`, the Water Recycling zone in the 3D habitat turns red within ~10 seconds
  2. When Pi pH returns to within the threshold, the Water Recycling zone recovers automatically without manual intervention
  3. The control service runs as a separate `control` Docker Compose service that starts after BioSim is healthy
  4. The control loop queries both pH sources from the DB and never attempts to inject values directly into BioSim
**Plans**: TBD

### Phase 12: Frontend Real Sensor Visibility
**Goal**: The Water Recycling zone panel shows the real Pi pH value as a secondary annotation alongside the BioSim physics reading, and the HUD connection badge gains a fifth "Real Sensor" state that activates when Pi data is flowing — without touching the BioSim WebSocket pipeline or `biosimMapper.ts`
**Depends on**: Phase 10 (`GET /api/enriched/?hub_id=pi-habitat-01` returning data)
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. The Water Recycling zone panel displays both the BioSim simulated pH (from the existing sensor orb) and the real Pi pH as a labeled "Real pH" annotation simultaneously
  2. The HUD badge shows a distinct "Real Sensor" state (different color from BioSim Connected and Fallback Mode) when Pi data has been polled successfully
**Plans**: TBD

### Phase 13: Reproducible Setup Guide
**Goal**: A complete step-by-step Pi setup guide exists such that anyone starting from a bare Raspberry Pi and Atlas Scientific EZO pH sensor can wire the hardware, configure I2C mode, install the Pi client, and run a validated first-sensor-reading — without needing to read source code
**Depends on**: Phases 10-12 (all built components documented)
**Requirements**: SETUP-01, SETUP-02
**Success Criteria** (what must be TRUE):
  1. The guide covers wiring, EZO UART-to-I2C mode switch, I2C baud rate config, venv creation, `.env` configuration, and first run in order
  2. Running `python hub_client.py --test` at the end of the guide produces a confirmed sensor reading and a successful POST response from Django
**Plans**: TBD

## Progress

**Execution Order:** 10 → 11 → 12 (12 can parallel 11 after 10) → 13

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 2/2 | Complete | 2026-03-10 |
| 2. 3D Scene and Zone Interaction | v1.0 | 4/4 | Complete | 2026-03-10 |
| 3. UI Panels and Live Data | v1.0 | 2/2 | Complete | 2026-03-13 |
| 4. Anomaly System | v1.0 | 2/2 | Complete | 2026-03-14 |
| 5. Docker Infrastructure | v2.0 | 2/3 | Gap closure | - |
| 6. Data Mapping Layer | v2.0 | 2/2 | Complete | 2026-03-16 |
| 7. Frontend WebSocket + Fallback | v2.0 | 2/2 | Complete | 2026-03-16 |
| 8. AnomalyDrawer Rewire | v2.0 | 2/2 | Complete | 2026-03-16 |
| 9. Django Bridge + Historical Pipeline | v2.0 | 2/2 | Complete | 2026-03-16 |
| 10. Django Ingest + Hubcode Rewrite | 2/3 | In Progress|  | - |
| 11. Closed-Loop Control Service | v3.0 | 0/TBD | Not started | - |
| 12. Frontend Real Sensor Visibility | v3.0 | 0/TBD | Not started | - |
| 13. Reproducible Setup Guide | v3.0 | 0/TBD | Not started | - |
