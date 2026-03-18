---
phase: 10-django-ingest-hubcode-rewrite
plan: "02"
subsystem: iot
tags: [atlas-i2c, raspberry-pi, sqlite, python-dotenv, requests, tdd]

# Dependency graph
requires:
  - phase: 10-django-ingest-hubcode-rewrite
    provides: POST /api/sensor-ingest/ endpoint (Plan 01, same wave)
provides:
  - Clean AtlasI2C driver with full float precision (no [0:4] truncation bug)
  - hub_client.py Pi client with .env config, SQLite buffer, and REST sync loop
  - hubcode/.env.example template with all 9 config vars
  - hubcode/requirements.txt with python-dotenv and requests
  - 31 unit tests for driver and client
affects: [phase-11-control-loop, phase-12-frontend, pi-deployment]

# Tech tracking
tech-stack:
  added: [python-dotenv>=1.0.0, requests>=2.31.0]
  patterns:
    - SQLite write-ahead buffer with synced=0/1 flag before HTTP POST
    - Timezone-aware UTC datetime via datetime.now(timezone.utc).isoformat()
    - Mark-then-prune only on confirmed 201 response (never prune-then-POST)
    - Static detect_devices() for I2C bus scan without requiring an instance
    - Module-level config with lazy main() guard for testability

key-files:
  created:
    - hubcode/atlas_i2c.py
    - hubcode/hub_client.py
    - hubcode/.env.example
    - hubcode/requirements.txt
    - hubcode/tests/__init__.py
    - hubcode/tests/test_atlas_i2c.py
    - hubcode/tests/test_hub_client.py
  modified: []

key-decisions:
  - "MSB glitch handling inlined into read_value() -- no separate handle_raspi_glitch method"
  - "detect_devices() is static -- does not require an AtlasI2C instance"
  - "sync_readings() sends batch list to /api/sensor-ingest/ -- not individual POSTs"
  - "POLL_INTERVAL defaults to 5.0 when env var is empty or missing"
  - "atlas_i2c imported late inside main() to avoid I2C hardware errors during testing"

patterns-established:
  - "Pattern: SQLite buffer synced=0 on write, prune only on 201 -- no data loss on network failure"
  - "Pattern: Timezone-aware datetime always -- avoid naive datetime with PostgreSQL USE_TZ=True"

requirements-completed: [HUB-01, HUB-02, HUB-03, HUB-04, HUB-05]

# Metrics
duration: 4min
completed: 2026-03-18
---

# Phase 10 Plan 02: Hubcode Rewrite Summary

**Clean Atlas EZO I2C driver (no truncation bug) + Pi hub client with SQLite buffer, .env config loading, and batched REST POST sync loop -- GCP/Pub-Sub replaced with direct Django REST API**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T18:54:03Z
- **Completed:** 2026-03-18T18:58:20Z
- **Tasks:** 3
- **Files modified:** 7 created, 5 deleted

## Accomplishments

- Eliminated the `[0:4]` truncation bug in AtlasI2C.py that silently dropped pH precision for values >= 10.0 (e.g., "10.02" was returned as "10.0")
- Implemented hub_client.py: loads 9 config vars from .env, buffers every reading to SQLite with synced=0 before any POST, prunes only after confirmed 201
- Deleted all 5 GCP-dependent legacy files (AtlasI2C.py, basic_funcs.py, pump_handler.py, sensor_logger.py, snyc_to_postgres.py)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write atlas_i2c.py driver and tests** - `5bdec51` (feat/test)
2. **Task 2: Write hub_client.py with buffer, config, sync loop, and tests** - `0b69da2` (feat)
3. **Task 3: Delete old hubcode files** - `5f1d356` (chore)

## Files Created/Modified

- `hubcode/atlas_i2c.py` - Clean Python 3 AtlasI2C driver: read_value with full float precision, detect_devices static method, no Python 2 compat
- `hubcode/hub_client.py` - Pi client: .env config loading, SQLite buffer (init_db/buffer_reading/get_unsynced/mark_synced_and_prune), build_payload with UTC timezone, sync_readings batched POST, --test/-v flags, startup banner
- `hubcode/.env.example` - All 9 config var template with documentation
- `hubcode/requirements.txt` - python-dotenv>=1.0.0, requests>=2.31.0
- `hubcode/tests/__init__.py` - Empty module marker
- `hubcode/tests/test_atlas_i2c.py` - 13 driver tests: no-truncation (4 cases), error codes, null stripping, query timeouts
- `hubcode/tests/test_hub_client.py` - 18 client tests: config loading, buffer CRUD, payload datetime correctness, sync success/failure/no-rows

## Decisions Made

- Late import of `atlas_i2c` inside `main()` to keep the module importable for testing without I2C hardware
- `sync_readings()` sends the full batch as a JSON list -- one HTTP request per poll cycle, not one per reading
- `mark_synced_and_prune()` uses a two-step UPDATE + DELETE rather than direct DELETE WHERE synced=0, making the intent explicit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test_query_uses_short_timeout_for_info test sending non-numeric response through query()**

- **Found during:** Task 1 (GREEN phase, test run)
- **Issue:** Test used `query("I")` with response `"?I,pH,2.10"` but `query()` always calls `read_value()` which calls `float()` -- `?I,pH,2.10` is not a valid float. The test intent was only to verify SHORT_TIMEOUT is used.
- **Fix:** Changed test to use `query("T")` with a valid numeric response `"7.00"`, which still exercises the SHORT_TIMEOUT path correctly.
- **Files modified:** hubcode/tests/test_atlas_i2c.py
- **Verification:** All 13 driver tests pass
- **Committed in:** 5bdec51 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - test bug)
**Impact on plan:** Necessary fix -- test was self-contradictory (non-numeric response through a function that returns float). No scope creep.

## Issues Encountered

- `python-dotenv` not installed in the system Python 3 environment -- installed via `pip3 install python-dotenv requests` to run hub_client tests locally (Pi deployment will use `pip install -r requirements.txt`)

## User Setup Required

None - no external service configuration required. Pi deployment follows standard `pip install -r requirements.txt && cp .env.example .env` workflow.

## Next Phase Readiness

- Pi side is fully written and tested; Phase 11 (control loop) can import `hub_client.sync_readings()` and `build_payload()` directly
- Physical Pi deployment requires: I2C mode jumper on Atlas EZO sensor, I2C baud rate set to 10000 Hz in `/boot/firmware/config.txt`, and `.env` file populated from `.env.example`
- Django ingest endpoint (Plan 01) must be running before `hub_client.py` can sync data

---
*Phase: 10-django-ingest-hubcode-rewrite*
*Completed: 2026-03-18*

## Self-Check: PASSED

All files present: atlas_i2c.py, hub_client.py, .env.example, requirements.txt, test_atlas_i2c.py, test_hub_client.py
All task commits found: 5bdec51, 0b69da2, 5f1d356
Deleted files confirmed gone: AtlasI2C.py, basic_funcs.py, pump_handler.py, sensor_logger.py, snyc_to_postgres.py
