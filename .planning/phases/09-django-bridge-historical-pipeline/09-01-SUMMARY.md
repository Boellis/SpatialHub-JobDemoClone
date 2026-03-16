---
phase: 09-django-bridge-historical-pipeline
plan: 01
subsystem: django-backend
tags: [websocket, async, management-command, docker, biosim, pipeline]
dependency_graph:
  requires:
    - sensor_data.biosim_ingest.biosim_tick_to_rows (Phase 06-02)
    - enriched_sensor_data DB table (Phase 05)
    - BioSim Docker service (Phase 05)
  provides:
    - biosim_bridge management command (long-running async WS consumer)
    - bridge Docker Compose service
    - aiohttp WebSocket ingestion pipeline
  affects:
    - /api/enriched/ (now has BioSim data after bridge runs)
    - /trends page (device_addr zone queries work with real data)
tech_stack:
  added:
    - aiohttp>=3.9 (async HTTP + WebSocket client)
    - pytest-asyncio>=0.23 (async test support)
  patterns:
    - asyncio.to_thread for DB writes from async context
    - exponential backoff reconnect (1, 2, 4, 8, 16, 30s)
    - probe_sim_id HTTP discovery before WebSocket connect
key_files:
  created:
    - django_backend/sensor_data/management/commands/biosim_bridge.py
    - django_backend/sensor_data/tests/test_biosim_bridge.py
  modified:
    - django_backend/requirements.txt (added aiohttp, pytest-asyncio)
    - django_backend/pytest.ini (added asyncio_mode=auto)
    - docker-compose.yml (added bridge service)
decisions:
  - "probe_sim_id, write_rows, process_tick as module-level async functions -- enables independent unit testing without Command class infrastructure"
  - "asyncio.to_thread for bulk_create -- keeps async event loop unblocked during DB writes"
  - "write_rows swallows all exceptions -- lost ticks recoverable via biosim_import_log (Plan 02)"
  - "pytest-asyncio asyncio_mode=auto -- eliminates @pytest.mark.asyncio decorator boilerplate"
  - "USE_SQLITE=1 env var gates tests to SQLite -- allows DB integration test without Docker PostgreSQL"
metrics:
  duration: 512s
  completed: 2026-03-16T19:00:30Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 3
---

# Phase 9 Plan 1: BioSim Bridge Management Command + Docker Service Summary

**One-liner:** Async Django management command that consumes BioSim WebSocket ticks via aiohttp, writes to enriched_sensor_data via asyncio.to_thread bulk_create, with exponential backoff reconnect wired as a Docker Compose service.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | biosim_bridge management command + unit tests | 36884f2 | biosim_bridge.py, test_biosim_bridge.py, requirements.txt, pytest.ini |
| 2 | Docker Compose bridge service wiring | f08023d | docker-compose.yml |

## What Was Built

### biosim_bridge.py Management Command

A long-running Django async management command that:

1. Probes `GET /api/simulation/active` via HTTP to discover the active BioSim simID
2. Opens a WebSocket connection to `ws://biosim:8009/ws/simulation/{simID}`
3. Per tick: calls `biosim_tick_to_rows(modules, timezone.now())` then `bulk_create` via `asyncio.to_thread`
4. On disconnect: exponential backoff (1, 2, 4, 8, 16, 30s) with re-probe on each attempt
5. Logs progress every 100 ticks

Key design: `probe_sim_id`, `write_rows`, and `process_tick` are module-level async functions (not methods), enabling clean unit tests without Command class infrastructure.

### Docker Compose bridge service

Added as the 5th service in docker-compose.yml. Uses the same Django image (`build: .`) with a different command (`python manage.py biosim_bridge`). Depends on both `db` and `biosim` with `service_healthy` conditions to prevent race-condition crashes on startup.

## Test Coverage

9 tests covering:
- Command importability and `_run` async method
- `probe_sim_id` with wrapped `{"simulations": [1]}` response
- `probe_sim_id` with bare `[1]` response
- `probe_sim_id` returns `None` for empty list
- `write_rows` calls `bulk_create` via `asyncio.to_thread`
- `write_rows` swallows all exceptions (no propagation)
- `process_tick` calls `biosim_tick_to_rows` with correct modules dict
- `process_tick` increments ticks/rows counters correctly
- DB integration: `hub_id='biosim-habitat-01'` rows queryable after `bulk_create`

All 15 existing `test_biosim_ingest.py` tests continue to pass (0 regressions).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] pytest-asyncio not installed**

- **Found during:** Task 1 TDD RED phase
- **Issue:** pytest-asyncio not installed in system Python3 environment; async tests would silently pass without actually running
- **Fix:** Added `pytest-asyncio>=0.23` to `requirements.txt` and installed it; added `asyncio_mode = auto` to `pytest.ini` to eliminate per-test decorator boilerplate
- **Files modified:** `django_backend/requirements.txt`, `django_backend/pytest.ini`
- **Commit:** 36884f2

**2. [Rule 2 - Missing Critical Functionality] DB test needs SQLite fallback**

- **Found during:** Task 1 Test 9 (DB integration)
- **Issue:** Default settings point to Cloud SQL; DB integration test hangs waiting for connection
- **Fix:** Ran tests with `USE_SQLITE=1` env var (pre-existing settings.py path) — no code changes needed, only test invocation
- **Commit:** N/A (runtime env var, not code change)

## Self-Check: PASSED

Files created:
- FOUND: django_backend/sensor_data/management/commands/biosim_bridge.py
- FOUND: django_backend/sensor_data/tests/test_biosim_bridge.py
- FOUND: .planning/phases/09-django-bridge-historical-pipeline/09-01-SUMMARY.md

Commits verified:
- FOUND: 36884f2 (feat(09-01): biosim_bridge management command + unit tests)
- FOUND: f08023d (feat(09-01): add bridge service to docker-compose.yml)

docker-compose.yml parse: exit 0
biosim_bridge tests: 9/9 passing
biosim_ingest tests: 15/15 passing (no regressions)
