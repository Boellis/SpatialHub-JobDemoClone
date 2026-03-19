# Roadmap: SpatialHub Mars Habitat Demo

## Milestones

- ✅ **v1.0 Mars Habitat Demo** — Phases 1-4 (shipped 2026-03-14)
- ✅ **v2.0 BioSim Integration** — Phases 5-9 (shipped 2026-03-16)
- 🚧 **v3.0 Physical Sensor Integration** — Phases 10-16 (in progress)

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

**Milestone Goal:** Deploy the full SpatialHub stack to GCP and connect a real Raspberry Pi with an Atlas Scientific pH sensor — a NASA competition judge receives an SD card and a website URL, plugs in the Pi, and sees real pH readings driving BioSim's water recycling system in a 3D Mars habitat visualization. No local infrastructure required.

- [x] **Phase 10: Django Ingest + Hubcode Rewrite** — Pi client code and Django ingest endpoint built (completed 2026-03-18)
- [x] **Phase 11: Cloud Services Deployment** — Django on Cloud Run, frontend on Firebase Hosting, Cloud SQL database — the website works in the cloud (completed 2026-03-19)
- [ ] **Phase 12: BioSim VM Deployment** — BioSim + biosim_bridge + Open MCT on a GCE VM — 3D habitat shows live physics via cloud
- [ ] **Phase 13: Pi-to-Cloud Pipeline** — Hub client posts to Cloud Run endpoint — real sensor data flows from Pi to cloud database
- [ ] **Phase 14: Closed-Loop Control Service** — pH divergence triggers BioSim malfunctions automatically from GCE VM
- [ ] **Phase 15: Frontend Real Sensor Visibility** — Real pH overlaid in 3D habitat with distinct HUD badge state
- [ ] **Phase 16: Competition Package** — SD card prep guide, deployment verification, end-to-end demo script

## Phase Details

### Phase 10: Django Ingest + Hubcode Rewrite
**Goal**: Real Pi pH readings reach the Django stack — a new `SensorIngestView` endpoint accepts POST payloads from the Pi with a distinct `hub_id`, and `hub_client.py` replaces the GCP-dependent hubcode entirely, reading Atlas I2C pH and posting to Django via `.env` config
**Depends on**: Phase 9 (existing Django stack and `enriched_sensor_data` model)
**Requirements**: HUB-01, HUB-02, HUB-03, HUB-04, HUB-05, INGEST-01, INGEST-02
**Success Criteria** (what must be TRUE):
  1. `curl -X POST http://localhost:8000/api/sensor-ingest/` with a valid JSON payload stores a row in `enriched_sensor_data` with `hub_id='pi-habitat-01'`
  2. Pi client starts from a `.env` file with no GCP credentials and posts real Atlas I2C pH readings to the running Django stack over WiFi
  3. Pi client parses pH correctly for all valid values including those >= 10.0 (no 4-char truncation bug)
  4. Rows from the Pi are distinguishable from BioSim rows via `hub_id` — `GET /api/enriched/?hub_id=pi-habitat-01` returns only Pi data
  5. When the Django host is unreachable, the Pi client buffers readings locally and syncs when connection restores
**Plans:** 3/3 plans complete

### Phase 11: Cloud Services Deployment
**Goal**: Django API deployed to Cloud Run and frontend deployed to Firebase Hosting, both connected to a Cloud SQL PostgreSQL instance — the existing website works in the cloud with all current features (enriched data, trends, habitat zones) before adding BioSim or Pi connectivity
**Depends on**: Phase 9 (existing Django codebase and models), Phase 10 (SensorIngestView endpoint)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-04
**Success Criteria** (what must be TRUE):
  1. Django API responds at Cloud Run URL — `GET {cloud-run-url}/api/enriched/` returns data from Cloud SQL
  2. Frontend loads at Firebase Hosting URL, connects to Cloud Run API, displays existing data pages (`/raw`, `/enriched`, `/trends`, `/habitat`)
  3. Cloud SQL instance has all Django tables migrated and `habitat_zones` seeded
  4. `POST {cloud-run-url}/api/sensor-ingest/` with a valid payload stores a row in Cloud SQL `enriched_sensor_data`
**Plans:** 2/2 plans complete
Plans:
- [ ] 11-01-PLAN.md — Harden settings.py for production and fix hardcoded URLs in frontend
- [ ] 11-02-PLAN.md — Create deploy script and execute full GCP deployment

### Phase 12: BioSim VM Deployment
**Goal**: BioSim simulation server, biosim_bridge, and Open MCT running on a GCE VM — the 3D habitat on Firebase shows live BioSim physics data via WebSocket to the VM, biosim_bridge writes tick history to Cloud SQL, and the AnomalyDrawer can trigger real malfunctions remotely
**Depends on**: Phase 11 (Cloud SQL for bridge writes, Firebase frontend for display)
**Requirements**: DEPLOY-03
**Success Criteria** (what must be TRUE):
  1. BioSim server accessible at `http://{VM_IP}:8009/api/simulation` from the public internet
  2. Frontend on Firebase connects to BioSim WebSocket on GCE VM and displays live 3D habitat data with physics
  3. biosim_bridge on GCE VM writes BioSim ticks to Cloud SQL `enriched_sensor_data` with `hub_id='biosim-habitat-01'`
  4. Open MCT dashboard accessible at `http://{VM_IP}:9091`
  5. AnomalyDrawer on Firebase can POST/DELETE malfunctions to BioSim on GCE VM
**Plans**: TBD

### Phase 13: Pi-to-Cloud Pipeline
**Goal**: Pi `hub_client.py` posts real pH readings to the Cloud Run Django endpoint — data flows end-to-end from physical Atlas Scientific sensor through Cloud SQL to the frontend dashboard, verifiable via the existing `/enriched` page
**Depends on**: Phase 11 (Cloud Run endpoint available)
**Requirements**: DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. Pi `.env` points to Cloud Run URL and Pi client starts and connects successfully
  2. Real Pi pH readings appear in Cloud SQL `enriched_sensor_data` with `hub_id='pi-habitat-01'`
  3. `GET {cloud-run-url}/api/enriched/?hub_id=pi-habitat-01` returns Pi data from the cloud
  4. Pi client's offline SQLite buffer works when Cloud Run is temporarily unreachable
**Plans**: TBD

### Phase 14: Closed-Loop Control Service
**Goal**: A Django management command (`control_loop`) running on the GCE VM reads the latest real Pi pH and BioSim simulated pH from Cloud SQL every 10 seconds, posts a `Grey_Water_Store` malfunction to BioSim when divergence exceeds the threshold, and deletes it when pH normalizes — the causal chain (real pH drifts → zone turns red → water recycling degrades) is observable end-to-end in the 3D habitat on Firebase
**Depends on**: Phase 12 (BioSim on VM for malfunction API), Phase 13 (Pi data in Cloud SQL)
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):
  1. When real Pi pH diverges more than the configured threshold from BioSim's simulated `wr-ph`, the Water Recycling zone in the 3D habitat turns red within ~10 seconds
  2. When Pi pH returns to within the threshold, the Water Recycling zone recovers automatically without manual intervention
  3. The control service runs as a managed process on the GCE VM alongside BioSim
  4. The control loop reads both pH sources from Cloud SQL and posts malfunctions to the local BioSim instance on the same VM
**Plans**: TBD

### Phase 15: Frontend Real Sensor Visibility
**Goal**: The Water Recycling zone panel shows the real Pi pH value as a secondary annotation alongside the BioSim physics reading, and the HUD connection badge gains a fifth "Real Sensor" state that activates when Pi data is flowing — deployed to Firebase Hosting
**Depends on**: Phase 13 (Pi data available via Cloud Run API)
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. The Water Recycling zone panel displays both the BioSim simulated pH (from the existing sensor orb) and the real Pi pH as a labeled "Real pH" annotation simultaneously
  2. The HUD badge shows a distinct "Real Sensor" state (different color from BioSim Connected and Fallback Mode) when Pi data has been polled successfully
**Plans**: TBD

### Phase 16: Competition Package
**Goal**: A complete competition submission package — SD card preparation instructions, cloud deployment verification checklist, and a demo walkthrough so a NASA judge can go from "unboxing the Pi" to "seeing live pH data in the 3D Mars habitat" in under 15 minutes
**Depends on**: Phases 11-15 (all components deployed and working)
**Requirements**: SETUP-01, SETUP-02
**Success Criteria** (what must be TRUE):
  1. Guide covers: SD card prep (Raspberry Pi OS, WiFi pre-config, hub_client install, `.env` with cloud URLs), Atlas sensor wiring, EZO I2C mode switch, and first-run verification
  2. A NASA judge with a Pi and Atlas Scientific pH sensor can follow the guide end-to-end and see their pH data in the live 3D habitat dashboard
**Plans**: TBD

## Progress

**Execution Order:** 11 → 12 + 13 (parallel after 11) → 14 (after 12 + 13) → 15 (after 13, can parallel 14) → 16

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
| 10. Django Ingest + Hubcode Rewrite | v3.0 | 3/3 | Complete | 2026-03-18 |
| 11. Cloud Services Deployment | 2/2 | Complete   | 2026-03-19 | - |
| 12. BioSim VM Deployment | v3.0 | 0/TBD | Not started | - |
| 13. Pi-to-Cloud Pipeline | v3.0 | 0/TBD | Not started | - |
| 14. Closed-Loop Control Service | v3.0 | 0/TBD | Not started | - |
| 15. Frontend Real Sensor Visibility | v3.0 | 0/TBD | Not started | - |
| 16. Competition Package | v3.0 | 0/TBD | Not started | - |
