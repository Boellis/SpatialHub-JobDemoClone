---
status: resolved
phase: 09-django-bridge-historical-pipeline
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md]
started: 2026-03-16T21:00:00Z
updated: 2026-03-16T21:30:00Z
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
result: pass (after fix — eee51ae corrected probe endpoint)

### 3. Historical Tick Bulk Import
expected: Run `docker compose exec django python manage.py biosim_import_log`. Command discovers active simulation ID, fetches tick log from BioSim /log endpoint, reports tick count, and imports rows into enriched_sensor_data. Run it twice — second run should clear and reimport (idempotent), producing the same row count.
result: pass (after fixes — eee51ae corrected probe endpoint, 246f2f7 fixed --writeTicks flag)

### 4. Enriched API Serves BioSim Data
expected: After bridge has been running or import has completed, hit `http://localhost:8000/api/enriched/` in browser or curl. Response includes rows with `hub_id: "biosim-habitat-01"` containing sensor readings from BioSim (CO2, humidity, temperature, etc. for habitat zones).
result: pass (after fix — downstream of tests 2+3)

## Summary

total: 4
passed: 4
issues: 0 (3 found, all resolved)
pending: 0
skipped: 0

## Gaps

- truth: "Bridge discovers active simulation ID, connects to WebSocket, and writes tick rows to enriched_sensor_data"
  status: resolved
  reason: "User reported: bridge logs show 'No active simulation found' in retry loop — probe_sim_id returns None, no WebSocket connection established"
  severity: major
  test: 2
  root_cause: "probe_sim_id() calls GET /api/simulation/active — endpoint does not exist in BioSim API. Correct endpoint is GET /api/simulation (no /active suffix). Same bug in biosim_import_log.py."
  artifacts:
    - path: "django_backend/sensor_data/management/commands/biosim_bridge.py"
      issue: "Line 40: biosim_url + '/api/simulation/active' — /active suffix is wrong"
    - path: "django_backend/sensor_data/management/commands/biosim_import_log.py"
      issue: "Line 39: same wrong /api/simulation/active endpoint"
  missing:
    - "Remove /active suffix from probe URL in both files"
  debug_session: ".planning/debug/biosim-bridge-no-active-sim.md"
- truth: "biosim_import_log management command runs inside web container, discovers sim, fetches log, imports rows"
  status: resolved
  reason: "User reported: service 'web' is not running — cannot exec into container"
  severity: blocker
  test: 3
  root_cause: "Service name mismatch — docker-compose.yml names the Django service 'django', not 'web'. Not a code bug, UAT test instructions used wrong service name. Container is running fine on port 8000."
  artifacts:
    - path: "docker-compose.yml"
      issue: "Service named 'django' (line 69), not 'web'"
  missing:
    - "Use 'docker compose exec django ...' instead of 'docker compose exec web ...'"
  debug_session: ".planning/debug/web-service-not-running.md"
- truth: "/api/enriched/ returns rows with hub_id biosim-habitat-01 containing BioSim sensor readings"
  status: resolved
  reason: "User reported: empty array returned — no BioSim data in enriched_sensor_data"
  severity: major
  test: 4
  root_cause: "Downstream of gap #1 — no data flows into enriched_sensor_data because bridge can't discover simulation (wrong API endpoint). Fixing the probe URL will fix this."
  artifacts: []
  missing: []
  debug_session: ""
