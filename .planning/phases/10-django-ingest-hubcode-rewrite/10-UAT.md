---
status: complete
phase: 10-django-ingest-hubcode-rewrite
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md]
started: 2026-03-18T19:30:00Z
updated: 2026-03-18T19:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Single sensor POST returns 201
expected: Start Django dev server with `cd django_backend && USE_SQLITE=1 python manage.py runserver`. Then POST a single JSON sensor payload to `http://localhost:8000/api/sensor-ingest/`. Should return HTTP 201 with body `{"stored": 1}`.
result: pass

### 2. Batch sensor POST returns 201
expected: POST an array of 2 sensor payloads to `/api/sensor-ingest/`. Should return HTTP 201 with body `{"stored": 2}`. Both rows stored in DB.
result: pass

### 3. Invalid payload returns 400
expected: POST a payload with missing required fields (e.g., omit sensor_val and location). Should return HTTP 400 with an error message listing the missing fields.
result: pass

### 4. Hub ID filtering returns Pi data
expected: After storing Pi data via ingest, `GET /api/enriched/?hub_id=pi-habitat-01` returns only rows with `hub_id: "pi-habitat-01"`, distinguishable from any BioSim data.
result: pass

### 5. Full test suite passes (72 tests)
expected: Run `cd django_backend && USE_SQLITE=1 python -m pytest sensor_data/tests/ -v` and `cd hubcode && python -m pytest tests/ -v`. All 72 tests (41 Django + 31 hubcode) pass with zero failures.
result: pass

### 6. Hubcode directory is clean
expected: `ls hubcode/` shows only: `atlas_i2c.py`, `hub_client.py`, `.env.example`, `requirements.txt`, `tests/`. Old files (`AtlasI2C.py`, `basic_funcs.py`, `pump_handler.py`, `sensor_logger.py`, `snyc_to_postgres.py`) are gone.
result: pass

### 7. No truncation bug in driver
expected: `grep "0:4" hubcode/atlas_i2c.py` returns no matches in executable code. The `read_value()` method returns full float precision — no `[0:4]` slice anywhere in the file.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
