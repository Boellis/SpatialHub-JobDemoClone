# Phase 13: Pi-to-Cloud Pipeline - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Pi `hub_client.py` posts real pH readings to the Cloud Run Django endpoint at `https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/sensor-ingest/`. Data flows end-to-end from physical Atlas Scientific sensor through Cloud SQL to the frontend dashboard, verifiable via the existing `/enriched` page filtered by `hub_id=pi-habitat-01`. No new code features — this is configuration, verification, and any minor fixes discovered during cloud integration.

</domain>

<decisions>
## Implementation Decisions

### Configuration
- Pi `.env` updated with `DJANGO_URL=https://spatialhub-backend-4vovlomqfa-uc.a.run.app` — the only required change from local config
- All other `.env` values remain as defined in Phase 10 (HUB_ID=pi-habitat-01, SENSOR_ID=wr-ph-real, DEVICE_ADDR=99, etc.)
- `.env.example` updated to document both local and cloud URL options

### Pipeline verification
- Verify with real Pi hardware posting to Cloud Run over WiFi
- Verify offline SQLite buffer works when Cloud Run is temporarily unreachable (kill WiFi, buffer readings, reconnect, confirm sync)
- Verify `GET {cloud-run-url}/api/enriched/?hub_id=pi-habitat-01` returns Pi data from Cloud SQL

### Claude's Discretion
- Whether to create a separate `.env.production` template or just update `.env.example` comments
- HTTPS certificate handling on Raspberry Pi OS (if any issues arise)
- Timeout/retry tuning for cloud latency vs LAN (current: 10s timeout in hub_client.py)
- Whether deploy.sh should auto-generate the Pi `.env` or leave it as a manual artifact
- Any minor fixes needed to make hub_client.py work with HTTPS Cloud Run endpoint

</decisions>

<specifics>
## Specific Ideas

No specific requirements — the hub_client.py and Cloud Run endpoint are both built and tested independently. This phase connects them.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hubcode/hub_client.py`: Complete Pi client with SQLite buffer, batch POST, --test mode, verbose logging — ready to use as-is
- `hubcode/.env.example`: Template with all 10 config fields documented — just needs DJANGO_URL updated for cloud
- `hubcode/atlas_i2c.py`: Rewritten I2C driver with full float precision, MSB glitch handling — no changes needed
- `SensorIngestView` (django_backend/sensor_data/views.py): POST endpoint accepting batch JSON — deployed on Cloud Run

### Established Patterns
- hub_client.py reads DJANGO_URL from `.env` via `python-dotenv` — config change only, no code change
- `requests.post(url, json=batch, timeout=10)` already handles HTTPS transparently (Python `requests` verifies SSL by default)
- Offline buffer: write-ahead to SQLite, sync on reconnect, prune after success — tested in Phase 10

### Integration Points
- Pi `.env` DJANGO_URL → Cloud Run URL (https://spatialhub-backend-4vovlomqfa-uc.a.run.app)
- Cloud Run `/api/sensor-ingest/` → Cloud SQL `enriched_sensor_data` table
- Frontend `/enriched` page → `GET /api/enriched/?hub_id=pi-habitat-01` → Cloud SQL

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-pi-to-cloud-pipeline*
*Context gathered: 2026-03-19*
