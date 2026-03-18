# Phase 10: Django Ingest + Hubcode Rewrite - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Real Pi pH readings reach the Django stack over WiFi. A new `SensorIngestView` endpoint accepts POST payloads from the Pi with a distinct `hub_id`, and `hub_client.py` replaces the GCP-dependent hubcode entirely, reading Atlas I2C pH and posting to Django over WiFi via `.env` config. No GCP credentials, no Pub/Sub.

</domain>

<decisions>
## Implementation Decisions

### Ingest payload & enrichment
- Pi sends self-describing payloads — all fields included (hub_id, sensor_id, sensor_name, device_addr, sensor_val, datetime, location, owner, workers)
- No server-side lookup or hub_config enrichment — the Pi `.env` contains all metadata
- Endpoint accepts both single JSON object and array of objects (batch) at `POST /api/sensor-ingest/`
- Basic structural validation: required fields present, sensor_val numeric, datetime parseable — reject 400 on invalid
- No namespace guard on hub_id values — discipline is the config's job
- Pi datetime is the only timestamp stored (no server-side received_at) — no schema changes
- device_addr sent as numeric string "99" matching existing pattern
- Response: `{"stored": N}` with 201 Created — no full rows returned

### Offline buffer & reconnection
- Write-ahead pattern: every reading goes to SQLite first (synced=0), then sync loop POSTs unsynced rows
- Batch POST for buffer sync — all unsynced rows sent in one array payload on reconnection
- Prune after sync — DELETE rows with synced=1 from SQLite; PostgreSQL is source of truth
- Passive retry for reconnection — no health check ping, just try the POST each cycle and handle failure gracefully
- No batch size limit — send all buffered readings in one request

### Pi client UX & operation
- `--test` flag: read one sensor value, POST to Django, print reading + HTTP response, exit — proves full pipeline end-to-end
- Manual script execution: `python hub_client.py` in terminal/screen — no systemd service (demo/portfolio scope)
- Quiet logging by default: one line per reading (`[HH:MM:SS] pH=7.42 -> synced`), `-v` flag for verbose HTTP details
- Startup banner shows hub_id, poll interval, Django URL, and detected I2C devices
- Replace hubcode/ directory entirely — delete old files, place new `hub_client.py`, `atlas_i2c.py`, `.env.example`, `requirements.txt` there

### AtlasI2C driver scope
- Full rewrite of driver as `atlas_i2c.py` (snake_case rename)
- ~80 lines: init, query, read_value (no truncation!), get_device_info, close, detect_devices static method
- Drop Python 2 compat, cloud_device_response, duplicate read_device_data method, "Reeeeeeee" debug print
- Keep MSB glitch workaround (real Pi hardware bug) — inline into read path
- detect_devices() scans full I2C bus, reports all Atlas sensors found — hub_client.py filters to configured SENSOR_ADDR
- read_value() returns full float precision — no [0:4] truncation

### Claude's Discretion
- Exact HTTP timeout/retry count for POST requests
- SQLite schema details (column types, indexes)
- argparse setup for --test and -v flags
- Error message wording
- Import organization within hub_client.py

</decisions>

<specifics>
## Specific Ideas

- `.env` template includes: HUB_ID, SENSOR_ID, SENSOR_NAME, DEVICE_ADDR, LOCATION, OWNER, WORKERS, DJANGO_URL, POLL_INTERVAL
- Startup output should look like: `[INFO] Starting hub_client (pi-habitat-01) / Poll: 5s / Django: http://192.168.1.100:8000`
- Quiet log format: `[14:30:05] pH=7.42 -> synced` / `[14:30:20] pH=7.40 -> buffered (offline)` / `[14:30:25] pH=7.39 -> synced (+ 1 buffered)`
- Test mode output: show detected devices, reading, POST result, then "Test passed" or "Test failed"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EnrichedSensorData` model: already supports `hub_id` filtering via `EnrichedSensorListView` (views.py:28-32)
- `sensor_logger.py` SQLite buffer pattern: CREATE TABLE IF NOT EXISTS + synced flag column — reuse this approach
- `biosim_bridge.py` management command: same Docker image / different command pattern for Docker Compose services
- `EnrichedSensorSerializer`: already exists, can serialize ingest response if needed

### Established Patterns
- Django views use `APIView` with try/except + Response pattern (views.py)
- URL patterns under `/api/` with trailing slashes (urls.py)
- Hub code uses Python `logging` module with basicConfig (sensor_logger.py)
- `.env` files used by Docker Compose services (docker-compose.yml:73)

### Integration Points
- New URL: `path('sensor-ingest/', SensorIngestView.as_view())` in sensor_data/urls.py
- EnrichedSensorData model: no migration needed (Pi data fits existing schema)
- docker-compose.yml: no changes needed for Phase 10 (Pi runs outside Docker)
- Existing `GET /api/enriched/?hub_id=pi-habitat-01` already works for querying Pi data (success criteria #4)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-django-ingest-hubcode-rewrite*
*Context gathered: 2026-03-18*
