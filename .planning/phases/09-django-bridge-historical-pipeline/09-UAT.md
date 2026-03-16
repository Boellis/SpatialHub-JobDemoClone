---
status: complete
phase: 09-django-bridge-historical-pipeline
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md]
started: 2026-03-16T21:00:00Z
updated: 2026-03-16T21:15:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running containers. Run `docker compose up --build -d`. All 5 services start: db, biosim, web, bridge, and any others. `docker compose ps` shows all services healthy/running. No crash loops on bridge service. BioSim simulation starts (check logs for simulation ID).
result: pass

### 2. Bridge Live WebSocket Ingestion
expected: After docker compose is up and BioSim simulation is running, check bridge logs with `docker compose logs bridge`. Bridge should show: discovered simulation ID, connected to WebSocket, and progress messages as ticks are processed. Then query the database: `docker compose exec web python manage.py shell -c "from sensor_data.models import EnrichedSensorData; print(EnrichedSensorData.objects.filter(hub_id='biosim-habitat-01').count())"` — count should be > 0 and growing.
result: issue
reported: "bridge-1 | [biosim_bridge] Starting — BioSim URL: http://biosim:8009 bridge-1 | [biosim_bridge] Database: spatialhub_db@db bridge-1 | [biosim_bridge] Connecting to BioSim WebSocket... bridge-1 | [biosim_bridge] Connection lost (No active simulation found). Retry in 1s..."
severity: major

### 3. Historical Tick Bulk Import
expected: Run `docker compose exec web python manage.py biosim_import_log`. Command discovers active simulation ID, fetches tick log from BioSim /log endpoint, reports tick count, and imports rows into enriched_sensor_data. Run it twice — second run should clear and reimport (idempotent), producing the same row count.
result: issue
reported: "service 'web' is not running — cannot exec into container"
severity: blocker

### 4. Enriched API Serves BioSim Data
expected: After bridge has been running or import has completed, hit `http://localhost:8000/api/enriched/` in browser or curl. Response includes rows with `hub_id: "biosim-habitat-01"` containing sensor readings from BioSim (CO2, humidity, temperature, etc. for habitat zones).
result: issue
reported: "fail empty array"
severity: major

## Summary

total: 4
passed: 1
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "Bridge discovers active simulation ID, connects to WebSocket, and writes tick rows to enriched_sensor_data"
  status: failed
  reason: "User reported: bridge logs show 'No active simulation found' in retry loop — probe_sim_id returns None, no WebSocket connection established"
  severity: major
  test: 2
  artifacts: []
  missing: []
  debug_session: ""
- truth: "biosim_import_log management command runs inside web container, discovers sim, fetches log, imports rows"
  status: failed
  reason: "User reported: service 'web' is not running — cannot exec into container"
  severity: blocker
  test: 3
  artifacts: []
  missing: []
  debug_session: ""
- truth: "/api/enriched/ returns rows with hub_id biosim-habitat-01 containing BioSim sensor readings"
  status: failed
  reason: "User reported: empty array returned — no BioSim data in enriched_sensor_data"
  severity: major
  test: 4
  artifacts: []
  missing: []
  debug_session: ""
