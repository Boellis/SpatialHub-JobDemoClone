---
phase: 06-data-mapping-layer
plan: 02
subsystem: api
tags: [django, pytest, biosim, sensor-data, bulk-create, tdd]

# Dependency graph
requires:
  - phase: 05-docker-infrastructure
    provides: Live BioSim fixture at tests/fixtures/biosim_module_state.json
provides:
  - biosim_tick_to_rows() pure function translating BioSim modules dict to list[EnrichedSensorData]
  - pytest infrastructure (pytest.ini, venv_local packages) for django_backend
  - 16 fixture-pinned unit tests covering all 12 sensor conversions
affects:
  - 09-django-bridge (imports biosim_ingest.biosim_tick_to_rows and calls bulk_create on result)

# Tech tracking
tech-stack:
  added: [pytest>=7.0, pytest-django>=4.0]
  patterns: [pure-function-mapper, omit-on-missing, fixture-pinned-tests, module-scope-fixtures]

key-files:
  created:
    - django_backend/sensor_data/biosim_ingest.py
    - django_backend/pytest.ini
    - django_backend/sensor_data/tests/__init__.py
    - django_backend/sensor_data/tests/test_biosim_ingest.py
  modified:
    - django_backend/requirements.txt

key-decisions:
  - "device_addr set to zone ID string (grow-bays, atmosphere-control, water-recycling, power-thermal) for natural /trends?device_addr= queries"
  - "Removed @pytest.mark.django_db — model instantiation (Model.__init__) requires no DB connection; decorator only needed for actual ORM queries"
  - "biosim_tick_to_rows is a pure function (no internal state, no side effects) — caller (Phase 9 bridge) owns bulk_create"

patterns-established:
  - "Omit-on-missing: .get() chains return None when module absent, row skipped entirely — no zero-fills"
  - "Pure translation layer: all BioSim->Django conversions happen in biosim_ingest.py, isolated from WebSocket/DB concerns"
  - "Module-scoped pytest fixtures: fixture JSON loaded once per test session, rows list computed once from fixture"

requirements-completed: [PERF-04]

# Metrics
duration: 9min
completed: 2026-03-16
---

# Phase 6 Plan 02: BioSim Ingest Summary

**Pure Python `biosim_tick_to_rows()` mapping 12 BioSim sensors to `EnrichedSensorData` instances with unit conversions matching the TypeScript mapper, backed by 16 pytest tests pinned to the Phase 5 live fixture**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-16T03:24:12Z
- **Completed:** 2026-03-16T03:33:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `biosim_ingest.py` with `biosim_tick_to_rows()` — pure function, no `.save()` calls, returns list ready for `bulk_create()`
- All 12 sensors across 4 zones mapped with correct unit conversions (ppm, %, kPa, L/min, kW proxy)
- 16 pytest tests pass green in 0.27s against live BioSim Phase 5 fixture; all sensor values cross-checked against TypeScript mapper expectations
- Pytest infrastructure bootstrapped (pytest.ini, venv_local packages, tests/__init__.py)

## Task Commits

Each task was committed atomically:

1. **Task 1: Set up pytest infrastructure and write failing tests** - `c77eae0` (test)
2. **Task 2: Implement biosim_ingest.py to make all tests pass (GREEN)** - `db16931` (feat)

**Plan metadata:** _(pending final commit)_

_Note: TDD plan — RED commit followed by GREEN implementation commit_

## Files Created/Modified
- `django_backend/sensor_data/biosim_ingest.py` - Pure translation function: BioSim modules dict -> list[EnrichedSensorData], exports `biosim_tick_to_rows`
- `django_backend/pytest.ini` - Pytest configuration pointing to `spatialhub_backend.settings`
- `django_backend/sensor_data/tests/__init__.py` - Empty package marker
- `django_backend/sensor_data/tests/test_biosim_ingest.py` - 16 tests covering all 12 sensors, missing-module behavior, model instance and pk assertions
- `django_backend/requirements.txt` - Added `pytest>=7.0` and `pytest-django>=4.0`

## Decisions Made
- `device_addr` set to zone ID string (`grow-bays`, `atmosphere-control`, `water-recycling`, `power-thermal`) — enables natural `/trends?device_addr=grow-bays` queries in Phase 9 without additional mapping
- Removed `@pytest.mark.django_db` from all tests — `Model.__init__()` needs only the Django app registry (loaded via `DJANGO_SETTINGS_MODULE`), not an active DB connection; the decorator would have forced a test database creation attempt against the remote Cloud SQL instance
- `biosim_tick_to_rows` is a pure function with no internal state; last-known-good caching lives in the Phase 9 caller, matching the TypeScript mapper's design

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed incorrect `@pytest.mark.django_db` decorator from all 16 tests**
- **Found during:** Task 1 (pytest infrastructure and RED tests), caught in Task 2 GREEN run
- **Issue:** The plan specified `@pytest.mark.django_db` "since it constructs EnrichedSensorData model instances." This is incorrect: `Model.__init__()` does not require a database connection — only ORM queries do. With the decorator, pytest-django attempted to create a test database against the live Cloud SQL instance (host `35.202.183.120`), failing with a connection error.
- **Fix:** Removed `@pytest.mark.django_db` from all 16 test functions. Django app registry is loaded by `DJANGO_SETTINGS_MODULE = spatialhub_backend.settings` in pytest.ini, which is sufficient.
- **Files modified:** `django_backend/sensor_data/tests/test_biosim_ingest.py`
- **Verification:** All 16 tests pass in 0.27s with no database connection attempt
- **Committed in:** `db16931` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix was necessary for tests to run at all locally. No scope creep. The behavior contract is identical — tests still validate all 12 sensor conversions against the live fixture.

## Issues Encountered
- Pytest-django's `@pytest.mark.django_db` attempted to connect to live Cloud SQL (host `35.202.183.120`) when constructing the test DB, causing all 16 tests to ERROR. Root cause: the decorator is only needed when ORM queries execute, not for plain model instantiation. Fixed by removing the decorator.

## User Setup Required
None — no external service configuration required. Tests run offline against the local fixture file.

## Next Phase Readiness
- `biosim_tick_to_rows` is the only import Phase 9's Django bridge needs: `from sensor_data.biosim_ingest import biosim_tick_to_rows`
- Caller pattern: `rows = biosim_tick_to_rows(tick_payload['modules']); EnrichedSensorData.objects.bulk_create(rows)`
- Cross-language parity verified: gb-co2 ~730 ppm, ac-o2 ~20.81%, pt-power ~100.0 kW, wr-flow ~10.0 L/min (all match TypeScript mapper)

---
*Phase: 06-data-mapping-layer*
*Completed: 2026-03-16*
