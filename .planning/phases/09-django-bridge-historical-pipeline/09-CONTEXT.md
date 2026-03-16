# Phase 9: Django Bridge + Historical Pipeline - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

A long-running Django async management command (`biosim_bridge`) independently ingests BioSim tick data into `enriched_sensor_data`, making `/api/enriched/` and `/trends` serve real simulation history. A separate one-shot command (`biosim_import_log`) bulk-imports historical ticks from BioSim's `/log` endpoint. No frontend changes, no API endpoint changes required.

</domain>

<decisions>
## Implementation Decisions

### Bridge Docker Service
- Separate `bridge` service in docker-compose — same Django image, different command (`python manage.py biosim_bridge`)
- `depends_on: db: service_healthy` AND `biosim: service_healthy` — prevents race condition crashes (Success Criteria #4)
- `restart: unless-stopped` — auto-restart on crash, stays dead on manual stop
- Verbose startup banner: print BioSim URL, simID, DB connection info, then ongoing tick counts

### Connection Resilience
- Discover simID via HTTP probe to `GET /api/simulation/active` (same pattern as Phase 7 frontend)
- On WebSocket disconnect: exponential backoff retry (1s, 2s, 4s, 8s... capped at 30s), infinite retries
- On each reconnect attempt: re-probe `GET /api/simulation/active` to discover new simID (handles BioSim restarts transparently)
- Log every 100 ticks: "Ingested 100 ticks (1200 rows) in 45.2s — total: 500 ticks"

### Write Batching
- Per-tick `bulk_create()` — one call per tick (~12 rows), matches PERF-04 requirement
- DB writes via `asyncio.to_thread()` to avoid blocking the async WS event loop (PIPE-02)
- On `bulk_create` failure: catch exception, log error, skip that tick, keep ingesting — lost ticks recoverable via bulk import
- Track internal metrics: total ticks ingested, total rows written, elapsed time

### Bulk Log Import
- Separate management command: `python manage.py biosim_import_log`
- Auto-discover simID via `GET /api/simulation/active`, then `GET /api/simulation/{simID}/log`
- Deduplication: delete all rows with `hub_id='biosim-habitat-01'` before importing (idempotent clear+reimport)
- Progress output: "Importing tick 50/191... (600 rows)" with running count via `self.stdout.write`

### Claude's Discretion
- WebSocket library choice for Python async (e.g., `websockets`, `aiohttp`)
- BioSim URL configuration (env var name, default value)
- Exact exponential backoff implementation details
- Bridge management command internal structure (single module vs. helpers)
- How to parse BioSim `/log` response format into tick batches
- Whether to add `biosim_import_log` to docker-compose as a one-shot profile or leave as manual command

</decisions>

<specifics>
## Specific Ideas

- `biosim_tick_to_rows()` in `sensor_data/biosim_ingest.py` is already built — bridge just calls it + `bulk_create()`
- BioSim WS URL pattern: `ws://localhost:8009/ws/simulation/{simID}` (derived from REST URL by replacing `http` with `ws`)
- `hub_id='biosim-habitat-01'` is the sentinel used for clear+reimport dedup — no collision with real IoT data
- `device_addr` is already set to zone ID string in biosim_ingest.py — `/trends?device_addr=grow-bays` will work out of the box
- `EnrichedSensorListView` already supports `?hub_id=biosim-habitat-01` filtering — no API changes needed

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sensor_data/biosim_ingest.py`: `biosim_tick_to_rows(modules, tick_time)` — pure function returning unsaved `EnrichedSensorData` instances
- `sensor_data/management/commands/seed_habitat_zones.py`: Management command pattern to follow (BaseCommand, `self.stdout.write`, `self.style.SUCCESS`)
- `docker-compose.yml`: 4 existing services (db, biosim, openmct, django) — bridge adds as 5th
- `EnrichedSensorData` model: `hub_id`, `sensor_name`, `sensor_id`, `device_addr`, `sensor_val`, `datetime`, `location`, `owner`, `workers`

### Established Patterns
- Management commands in `sensor_data/management/commands/` using Django's `BaseCommand`
- Django settings reads env vars with `os.environ.get()` fallbacks
- Docker services use `env_file: .env` for credentials
- `print()` for logging in Django (not `logging` module) — match existing convention

### Integration Points
- `docker-compose.yml`: Add `bridge` service entry
- `sensor_data/management/commands/`: New `biosim_bridge.py` and `biosim_import_log.py`
- `biosim_ingest.py`: Already imported as `from sensor_data.biosim_ingest import biosim_tick_to_rows`
- `EnrichedSensorData.objects.bulk_create()`: The single write path
- `EnrichedSensorData.objects.filter(hub_id='biosim-habitat-01').delete()`: Clear path for reimport

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-django-bridge-historical-pipeline*
*Context gathered: 2026-03-16*
