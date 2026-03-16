---
phase: 09-django-bridge-historical-pipeline
plan: "02"
subsystem: api
tags: [django, management-command, biosim, bulk-import, tdd, requests]

# Dependency graph
requires:
  - phase: 09-django-bridge-historical-pipeline
    provides: biosim_ingest.py pure translation function (biosim_tick_to_rows)
  - phase: 06-data-mapping-layer
    provides: EnrichedSensorData model and biosim_tick_to_rows signature

provides:
  - biosim_import_log Django management command (one-shot bulk tick log importer)
  - Idempotent clear+reimport pattern for historical BioSim data
  - BioSim docker-compose --writeTicks flag so /log endpoint has data

affects:
  - docker-compose services (biosim simulation now records tick history)
  - Any future re-seeding of enriched_sensor_data from BioSim

# Tech tracking
tech-stack:
  added: [requests>=2.31.0 as explicit dep in requirements.txt]
  patterns:
    - Idempotent bulk importer: delete hub rows, then bulk_create per tick
    - Module-level functions (discover_sim_id, fetch_tick_log, import_ticks) for testability
    - USE_SQLITE=1 env var for running DB-touching tests locally without PostgreSQL

key-files:
  created:
    - django_backend/sensor_data/management/commands/biosim_import_log.py
    - django_backend/sensor_data/tests/test_biosim_import_log.py
  modified:
    - django_backend/requirements.txt
    - docker-compose.yml

key-decisions:
  - "writeTicks passed as query param ?writeTicks=true on POST /api/simulation/start (REST API pattern, not server flag)"
  - "DB tests require USE_SQLITE=1 — PostgreSQL not available locally; existing USE_SQLITE toggle in settings.py used"
  - "requests added as explicit requirement even though it was already a transitive dep of google-cloud-pubsub"
  - "discover_sim_id handles both wrapped {simulations:[1]} and bare [1] response shapes from BioSim"

patterns-established:
  - "Pattern: Module-level pure functions extracted from Command.handle() so pytest can test them without Django management runner"
  - "Pattern: @pytest.mark.django_db used only for tests that call ORM — mock-only tests run without DB (0.37s test suite)"

requirements-completed: [PIPE-05]

# Metrics
duration: 25min
completed: 2026-03-16
---

# Phase 9 Plan 02: BioSim Tick Log Bulk Importer Summary

**Django management command biosim_import_log that idempotently fetches all historical BioSim ticks via REST /log endpoint and bulk-imports them into enriched_sensor_data, with --writeTicks wired into docker-compose simulation start**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-16T20:00:00Z
- **Completed:** 2026-03-16T20:25:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- biosim_import_log management command with auto-discovery of active simulation ID, idempotent clear+reimport, and --writeTicks error hints
- 8 TDD unit tests covering all critical code paths: simID discovery, log fetch, empty-ticks error, idempotency, row count correctness, and pre-import deletion
- docker-compose BioSim simulation start updated to pass `?writeTicks=true` so the /log endpoint actually has data to import
- requests added as explicit dependency alongside transitive inclusion

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing tests** - `501f5b6` (test)
2. **Task 1 (GREEN): biosim_import_log command** - `b3396d7` (feat)
3. **Task 2: writeTicks in docker-compose** - `61b9366` (feat)

## Files Created/Modified
- `django_backend/sensor_data/management/commands/biosim_import_log.py` - Management command with discover_sim_id, fetch_tick_log, import_ticks functions and Command class
- `django_backend/sensor_data/tests/test_biosim_import_log.py` - 8 unit tests (6 mocked HTTP + 2 Django DB)
- `django_backend/requirements.txt` - Added requests>=2.31.0 as explicit dependency
- `docker-compose.yml` - Added ?writeTicks=true to BioSim simulation start POST URL

## Decisions Made
- `writeTicks` passed as query parameter `?writeTicks=true` on the REST POST (not a server startup flag) — matches BioSim REST API conventions
- DB-touching tests use `USE_SQLITE=1` env var (already wired in settings.py) since PostgreSQL isn't available locally
- `discover_sim_id` handles both `{"simulations": [1]}` (wrapped) and `[1]` (bare array) response shapes — matches Phase 07 probe logic that already handled both shapes

## Deviations from Plan

None - plan executed exactly as written. `requests` was already a transitive dependency but the explicit pin was added as specified.

## Issues Encountered
- Pre-existing: `test_biosim_bridge.py` fails collection due to `aiohttp` not installed in `venv_local`. This is an existing issue unrelated to this plan. The verification step was scoped to `test_biosim_ingest.py` and `test_biosim_import_log.py` (24 tests, all passing).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PIPE-05 complete: both live bridge (09-01) and bulk historical importer (09-02) are implemented
- To recover all historical ticks: `USE_SQLITE=1 python manage.py biosim_import_log` (or set BIOSIM_URL to running instance)
- BioSim must be started with the updated docker-compose (includes ?writeTicks=true) for /log to have data

---
*Phase: 09-django-bridge-historical-pipeline*
*Completed: 2026-03-16*
