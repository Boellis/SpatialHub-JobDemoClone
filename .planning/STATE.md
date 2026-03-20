---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Physical Sensor Integration
status: BioSim VM deployed to GCE (34.68.135.16) — full stack live with Caddy HTTPS, bridge writing to Cloud SQL, Pi pH sensor posting real data
stopped_at: Phase 14 context gathered
last_updated: "2026-03-20T15:40:55.736Z"
last_activity: 2026-03-19 — Phase 12 BioSim VM deployment verified end-to-end
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 8
  completed_plans: 8
  percent: 28
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** 3D habitat visualization with live sensor data that feels real, responsive, and impressive enough to make someone say "this could actually run a Mars greenhouse."
**Current focus:** v3.0 Physical Sensor Integration — Phase 11: Cloud Services Deployment (next)

## Current Position

Milestone: v3.0 Physical Sensor Integration
Phase: 12 of 16 COMPLETE — next: Phase 13 (Pi-to-Cloud Pipeline)
Plan: Phase 12 all 2 plans complete
Status: BioSim VM deployed to GCE (34.68.135.16) — full stack live with Caddy HTTPS, bridge writing to Cloud SQL, Pi pH sensor posting real data
Last activity: 2026-03-19 — Phase 12 BioSim VM deployment verified end-to-end

Progress: [██░░░░░░░░] 28% (Phase 12 complete, 4 phases remaining)

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full v1.0/v2.0 log.

Key v3.0 architectural decisions:

- **[PIVOTED 2026-03-18]** Cloud deployment for NASA competition — judge gets SD card + website URL, no local Docker
- Pi posts to Cloud Run Django endpoint (SensorIngestView) over WiFi — hub_client.py from Phase 10 reused, just different URL
- BioSim + biosim_bridge + control_loop run on GCE VM in GCP project `interviewing-457222`
- Django API on Cloud Run, frontend on Firebase Hosting, database on Cloud SQL
- Closed loop operates via BioSim malfunction API (POST/DELETE `Grey_Water_Store`) — BioSim has no state injection endpoint
- Control service is a Django management command running on the GCE VM alongside BioSim (reads Cloud SQL, posts malfunctions locally)
- Pi uses `hub_id='pi-habitat-01'` and `sensor_id='wr-ph-real'` — set in config before any data is written to avoid namespace collision
- Real pH is a secondary annotation in ZonePanel (not a replacement for BioSim `wr-ph` sensor orb)
- Frontend polls `/api/enriched/?hub_id=pi-habitat-01` via Cloud Run API for real sensor display
- [Phase 10-django-ingest-hubcode-rewrite]: atlas_i2c.py: MSB glitch handling inlined into read_value(), detect_devices() is static, no Python 2 compat
- [Phase 10-django-ingest-hubcode-rewrite]: hub_client.py: sync_readings sends batch list, prunes only on 201, timezone-aware UTC datetime
- [Phase 10-01]: Validate entire batch before touching DB — all-or-nothing; any invalid item rejects the whole POST
- [Phase 10-01]: pubsub_v1 import made optional (try/except) so views.py loads in local test env without GCP SDK
- [Phase 10-django-ingest-hubcode-rewrite]: Integration verification (plan 03): Wave 1 plans 01+02 connect correctly — 72 tests green, curl confirms all contract truths, user approved Phase 10 as complete
- [Phase 11-cloud-services-deployment]: DB_HOST and DB_PASS have no fallback — fail loudly if env vars absent in production
- [Phase 11-cloud-services-deployment]: api.ts BASE_URL fallback is localhost:8000/api — VITE_API_URL required at build time for production
- [Phase 11-cloud-services-deployment]: CSRF_TRUSTED_ORIGINS uses *.run.app wildcard to cover any Cloud Run service URL
- [Phase 12-biosim-vm-deployment]: bridge VM compose uses explicit environment block (not env_file) with BIOSIM_URL=http://biosim:8009 and USE_SQLITE=0 hardcoded
- [Phase 12-biosim-vm-deployment]: deploy.sh BioSim readiness poll is 40 x 3s = 120s max; Section 15 frontend rebuild runs only AFTER BioSim confirms live
- [Phase 12-biosim-vm-deployment]: Caddy with sslip.io resolves mixed-content HTTPS/WebSocket block for Firebase->GCE VM connection
- [Phase 12-biosim-vm-deployment]: useLiveSensors is additive annotation layer on BioSim ticks — Pi data tags readings as source='pi' for LIVE badge rendering
- [Phase 12-biosim-vm-deployment]: teardown.sh --stop (cost management) vs --delete (full cleanup) modes for VM lifecycle
- [Phase 13-pi-to-cloud-pipeline]: PI_HUB_ID exported (not just const) so vitest can import and assert regression guard
- [Phase 13-pi-to-cloud-pipeline]: hubcode/.env.example Cloud Run URL uncommented as default — competition deployment over local dev

### Pending Todos

None.

### Blockers/Concerns

- Atlas EZO ships in UART mode — I2C shows nothing until PGND-TX jumper is installed and power-cycled; document as Setup Guide Step 1
- [RESOLVED Phase 10-02] AtlasI2C.py 4-char truncation bug fixed in atlas_i2c.py — no [0:4] slice, full float precision
- I2C baud rate must be set to 10000 Hz in `/boot/firmware/config.txt` — default 400 kHz causes drop-off after 30-60 min
- pH divergence threshold (default 0.5 units) must be validated against actual sensor noise floor on physical Pi during Phase 14
- BioSim GCE VM needs firewall rules for ports 8009 (BioSim REST/WS) and 9091 (Open MCT)
- Frontend BIOSIM_BASE_URL must point to GCE VM public IP (not localhost) for Firebase deployment
- Cloud SQL connection from GCE VM: biosim_bridge and control_loop need Cloud SQL Proxy or public IP with SSL
- [Phase 11] GCP project changed to nasa-comp-demo (nick@demarily.dev) — interviewing-457222 had IAM issues
- [Phase 11] Cloud Run URL: https://spatialhub-backend-4vovlomqfa-uc.a.run.app
- [Phase 11] Cloud SQL IP: 34.30.238.232 (authorized-networks=0.0.0.0/0)
- [Phase 11] Firebase Hosting: https://nasa-comp-demo.web.app

## Session Continuity

Last session: 2026-03-20T15:40:55.724Z
Stopped at: Phase 14 context gathered
Resume file: .planning/phases/14-closed-loop-control-service/14-CONTEXT.md
Note: Phase 11 discuss-phase captured partial decisions (divergence logic, recovery, stale data, logging) before pivot — revisit during Phase 14 planning
