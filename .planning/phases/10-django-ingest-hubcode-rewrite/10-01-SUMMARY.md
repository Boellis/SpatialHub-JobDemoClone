---
phase: 10-django-ingest-hubcode-rewrite
plan: 01
subsystem: api
tags: [django, drf, rest, sensor-ingest, pytest, tdd, sqlite]

# Dependency graph
requires: []
provides:
  - POST /api/sensor-ingest/ endpoint accepting single or batch sensor payloads
  - SensorIngestView with atomic all-or-nothing validation
  - 8-test pytest suite covering all ingest contract truths
affects: [10-02, phase-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - optional-import guard for google.cloud.pubsub_v1 (try/except ImportError)
    - atomic batch validation: validate all items before any DB write
    - USE_SQLITE=1 env var enables SQLite for local test runs without GCP credentials

key-files:
  created:
    - django_backend/sensor_data/tests/test_pi_ingest.py
  modified:
    - django_backend/sensor_data/views.py
    - django_backend/sensor_data/urls.py

key-decisions:
  - "Validate entire batch before touching DB — all-or-nothing; any invalid item rejects the whole POST"
  - "device_addr stored as-is (CharField) — Pi sends string '99', no coercion needed"
  - "django.utils.dateparse.parse_datetime used for datetime validation — returns None on invalid input"
  - "pubsub_v1 import made optional (try/except) so views.py loads in local test env without GCP SDK"

patterns-established:
  - "SensorIngestView pattern: normalize to list -> validate all -> bulk_create -> return {stored: N}"
  - "Test pattern: USE_SQLITE=1 env var + pytest.mark.django_db for endpoint integration tests"

requirements-completed: [INGEST-01, INGEST-02]

# Metrics
duration: 7min
completed: 2026-03-18
---

# Phase 10 Plan 01: Django Pi Ingest Endpoint Summary

**POST /api/sensor-ingest/ accepts single or batch sensor payloads from Pi, validates all fields atomically, and bulk-inserts into enriched_sensor_data with hub_id='pi-habitat-01'**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-18T18:54:05Z
- **Completed:** 2026-03-18T19:01:36Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- TDD implementation: tests written first (RED), implementation made them pass (GREEN), 41/41 tests pass
- SensorIngestView: atomic validation loop rejects entire batch if any item fails — no partial writes
- Hub ID distinguishability confirmed: rows stored with `pi-habitat-01` queryable via `GET /api/enriched/?hub_id=pi-habitat-01`
- All 8 contract truths from plan verified by test suite

## Task Commits

Each task was committed atomically:

1. **Task 1: Write tests and implement SensorIngestView** - `10235ad` (feat)

## Files Created/Modified
- `django_backend/sensor_data/tests/test_pi_ingest.py` - 8-test pytest suite for the ingest endpoint
- `django_backend/sensor_data/views.py` - Added SensorIngestView class + optional pubsub import guard
- `django_backend/sensor_data/urls.py` - Wired `sensor-ingest/` route to SensorIngestView

## Decisions Made
- All-or-nothing batch semantics: validate all items before any `.bulk_create()` call
- `device_addr` stored as-is string (CharField) — no coercion, Pi sends "99" not 99
- `parse_datetime` for ISO 8601 validation — explicit None check, returns 400 on failure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made google.cloud.pubsub_v1 import optional**
- **Found during:** Task 1 (RED phase test run)
- **Issue:** `from google.cloud import pubsub_v1` at module top level caused `ModuleNotFoundError` in local test environment (GCP SDK not installed in system Python). This made the entire URL router fail with 500 on all routes, not 404 for the missing route.
- **Fix:** Wrapped import in `try/except ImportError` — `pubsub_v1 = None` fallback. `SendHubCommand` will still fail at runtime if pubsub is unavailable, but import no longer blocks test collection.
- **Files modified:** `django_backend/sensor_data/views.py`
- **Verification:** RED phase re-run showed clean 404 (not 500). All 41 tests pass.
- **Committed in:** `10235ad` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking import error)
**Impact on plan:** Necessary fix; does not change any deployed behavior. pubsub import failure would only occur in non-GCP local environments.

## Issues Encountered
- First RED phase run hung (tried connecting to Cloud SQL at 35.202.183.120). Resolved by running with `USE_SQLITE=1` env var which activates the existing SQLite DB path in settings.py.

## User Setup Required
None — no external service configuration required for this plan.

## Next Phase Readiness
- `POST /api/sensor-ingest/` is live and tested; Pi client (plan 10-02) can target it directly
- Curl smoke test: `curl -s -X POST http://localhost:8000/api/sensor-ingest/ -H 'Content-Type: application/json' -d '{"hub_id":"pi-habitat-01","sensor_id":"wr-ph-real","sensor_name":"pH Sensor","device_addr":"99","sensor_val":7.42,"datetime":"2026-03-18T14:30:05+00:00","location":"Mars Habitat Alpha","owner":"Demo User","workers":"Crew A"}'`
- No blockers for plan 10-02 (hubcode rewrite)

---
*Phase: 10-django-ingest-hubcode-rewrite*
*Completed: 2026-03-18*

## Self-Check: PASSED

- django_backend/sensor_data/tests/test_pi_ingest.py: FOUND
- django_backend/sensor_data/views.py: FOUND
- django_backend/sensor_data/urls.py: FOUND
- .planning/phases/10-django-ingest-hubcode-rewrite/10-01-SUMMARY.md: FOUND
- Commit 10235ad: FOUND
