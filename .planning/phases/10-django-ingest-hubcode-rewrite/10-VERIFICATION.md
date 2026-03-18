---
phase: 10-django-ingest-hubcode-rewrite
verified: 2026-03-18T20:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 10: Django Ingest + Hubcode Rewrite Verification Report

**Phase Goal:** Replace GCP Cloud Functions ingest pipeline with direct Django REST endpoint; rewrite hubcode/ to POST sensor readings directly to Django instead of Pub/Sub
**Verified:** 2026-03-18
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | POST /api/sensor-ingest/ with a valid single JSON payload returns 201 and stores a row in enriched_sensor_data | VERIFIED | `test_single_payload_stored` passes; view line 161 returns `{"stored": len(rows)}` with HTTP 201 |
| 2  | POST /api/sensor-ingest/ with a valid JSON array stores N rows and returns {stored: N} | VERIFIED | `test_batch_payload_stored` passes; items list normalised from dict or list at lines 114-117 |
| 3  | POST with missing required fields returns 400 with error listing missing fields | VERIFIED | `test_missing_field_returns_400` passes; view line 126-131 returns sorted missing field names |
| 4  | POST with non-numeric sensor_val returns 400 | VERIFIED | `test_invalid_sensor_val_returns_400` passes; view lines 133-139 wrap `float()` in try/except |
| 5  | POST with unparseable datetime returns 400 | VERIFIED | `test_invalid_datetime_returns_400` passes; view lines 141-146 check `parse_datetime` result for None |
| 6  | Stored rows carry hub_id='pi-habitat-01', distinguishable from biosim-habitat-01 | VERIFIED | `test_hub_id_is_pi_value` passes; hub_id stored verbatim from payload at view line 149 |
| 7  | atlas_i2c.py read_value() returns full float precision (no truncation) | VERIFIED | 4 no-truncation tests pass (7.432, 10.02, 6.8, 12.345); zero `[0:4]` slices in atlas_i2c.py |
| 8  | atlas_i2c.py read_value() raises ValueError on sensor error codes | VERIFIED | `test_read_value_error_code_raises_value_error` and `..._code_2_...` both pass |
| 9  | atlas_i2c.py detect_devices() scans I2C bus and returns list of responding addresses | VERIFIED | `test_detect_devices_returns_responding_addresses` passes; static method at line 91 |
| 10 | hub_client.py loads all 9 config vars from .env file | VERIFIED | `test_env_loading_all_fields` passes; load_dotenv() at line 31, all vars read at lines 33-41 |
| 11 | hub_client.py buffers every reading to SQLite with synced=0 before attempting POST | VERIFIED | `test_buffer_writing_inserts_with_synced_zero` passes; buffer_reading() at line 84 inserts synced=0 |
| 12 | hub_client.py marks rows synced and prunes only after confirmed 201 response | VERIFIED | `test_sync_success_marks_and_prunes` and `test_sync_failure_leaves_buffered_*` all pass; view line 186-187 guards prune on status 200 or 201 |
| 13 | hub_client.py --test flag reads one sensor value, POSTs to Django, prints result, exits | VERIFIED | args.test branch at line 238 implements the full path; guarded by `if __name__ == "__main__"` |
| 14 | No old GCP-dependent files remain in hubcode/ | VERIFIED | `ls hubcode/` shows only atlas_i2c.py, hub_client.py, requirements.txt, tests/, .env.example — AtlasI2C.py, basic_funcs.py, pump_handler.py, sensor_logger.py, snyc_to_postgres.py all absent |

**Score:** 14/14 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `django_backend/sensor_data/views.py` | Contains `class SensorIngestView` | VERIFIED | Class exists at line 108; 166 lines total |
| `django_backend/sensor_data/urls.py` | Contains `sensor-ingest/` route | VERIFIED | `path('sensor-ingest/', SensorIngestView.as_view(), ...)` at line 19 |
| `django_backend/sensor_data/tests/test_pi_ingest.py` | Integration tests, min 80 lines | VERIFIED | 126 lines; 8 tests covering all contract truths |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `hubcode/atlas_i2c.py` | Clean driver, min 60 lines, contains `def read_value` | VERIFIED | 116 lines; read_value at line 54; no truncation, no Python 2 compat |
| `hubcode/hub_client.py` | Contains `def main`, min 120 lines | VERIFIED | 282 lines; main() at line 208 |
| `hubcode/.env.example` | Contains `HUB_ID=pi-habitat-01` | VERIFIED | File present (710 bytes per ls); content confirmed in SUMMARY.md and test fixtures reference `pi-habitat-01` |
| `hubcode/requirements.txt` | Contains `python-dotenv` | VERIFIED | 2 lines: `python-dotenv>=1.0.0` and `requests>=2.31.0` |
| `hubcode/tests/test_atlas_i2c.py` | Unit tests, min 40 lines | VERIFIED | 201 lines; 13 tests |
| `hubcode/tests/test_hub_client.py` | Unit tests, min 50 lines | VERIFIED | 297 lines; 18 tests |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `urls.py` | `views.py` | `SensorIngestView.as_view()` import + path registration | WIRED | `SensorIngestView` imported at urls.py line 9; `path('sensor-ingest/', SensorIngestView.as_view(), ...)` at line 19 |
| `views.py` | `models.py` | `EnrichedSensorData.objects.bulk_create` | WIRED | Confirmed at views.py line 160; rows built from validated items and bulk-inserted |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `hub_client.py` | `atlas_i2c.py` | `from atlas_i2c import AtlasI2C` | WIRED | Late import inside main() at line 228; avoids I2C hardware errors during tests |
| `hub_client.py` | `.env.example` | `load_dotenv()` reads .env at module load | WIRED | `from dotenv import load_dotenv` at line 25; `load_dotenv()` called at line 31 |
| `hub_client.py` | `POST /api/sensor-ingest/` | `requests.post` to `{DJANGO_URL}/api/sensor-ingest/` | WIRED | `url = f"{DJANGO_URL}/api/sensor-ingest/"` at line 183; `requests.post(url, json=batch, timeout=10)` at line 185 |

### Plan 03 Key Link

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `hub_client.py` | `views.py SensorIngestView` | `requests.post` URL contains `sensor-ingest` | WIRED | `sync_readings()` constructs `{DJANGO_URL}/api/sensor-ingest/`; 9-field batch format matches `REQUIRED_FIELDS` in views.py; `test_sync_posts_to_correct_url` confirms URL contains `/api/sensor-ingest/` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INGEST-01 | Plans 01, 03 | Django POST endpoint receives sensor readings from Pi and stores them in EnrichedSensorData with distinct hub_id | SATISFIED | SensorIngestView.post() exists, wired to URL, bulk_create confirmed, 8 tests green |
| INGEST-02 | Plans 01, 03 | Real Pi sensor data distinguishable from BioSim data via hub_id field (pi-habitat-01 vs biosim-habitat-01) | SATISFIED | hub_id stored verbatim from payload; test_hub_id_is_pi_value asserts pi-habitat-01 != biosim-habitat-01; GET /api/enriched/?hub_id= filter confirmed in EnrichedSensorListView |
| HUB-01 | Plans 02, 03 | Config-driven Pi client reads settings from .env file — no hardcoded credentials or GCP dependency | SATISFIED | load_dotenv() + os.environ.get() for all 9 vars; .env.example template present; no GCP imports in hub_client.py |
| HUB-02 | Plans 02, 03 | Pi client POSTs sensor readings directly to Django REST API over WiFi using requests | SATISFIED | requests.post to {DJANGO_URL}/api/sensor-ingest/ in sync_readings(); requests>=2.31.0 in requirements.txt |
| HUB-03 | Plans 02, 03 | AtlasI2C driver fixed — no 4-char truncation bug, no debug prints, handles read errors gracefully | SATISFIED | No [0:4] slice exists in atlas_i2c.py (only in docstring comments); read_value uses full float(value_str); ValueError raised on non-1 status byte; 4 precision tests pass |
| HUB-04 | Plans 02, 03 | SQLite offline buffer stores readings when Docker host is unreachable, syncs when connection restores | SATISFIED | buffer_reading()/get_unsynced()/mark_synced_and_prune() implemented; test_sync_failure_leaves_buffered_on_connection_error confirms rows persist on ConnectionError |
| HUB-05 | Plans 02, 03 | Pi client auto-detects all Atlas Scientific I2C devices on the bus, not just a single hardcoded address | SATISFIED | AtlasI2C.detect_devices() is static, scans addresses 0-127, returns list; called in main() startup banner; test_detect_devices_returns_responding_addresses passes |

**All 7 requirements: SATISFIED**

No orphaned requirements — all IDs claimed in plan frontmatter map to Phase 10 in REQUIREMENTS.md and are confirmed implemented.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

Full scan of views.py, atlas_i2c.py, hub_client.py, test_pi_ingest.py, test_atlas_i2c.py, and test_hub_client.py found zero TODO/FIXME/placeholder comments, no empty return stubs, and no console.log-only handlers.

The `[0:4]` string that appears in atlas_i2c.py lines 5 and 64 is in docstring comments describing the historical bug — not in executable code.

---

## Human Verification Required

### 1. Physical Pi Integration

**Test:** Deploy hub_client.py on a Raspberry Pi with an Atlas EZO pH sensor connected over I2C. Set `.env` from `.env.example`, point DJANGO_URL at the running Django stack, run `python hub_client.py --test`.
**Expected:** Startup banner prints detected I2C devices, sensor query returns a float pH value, payload POSTs to Django with 201, GET /api/enriched/?hub_id=pi-habitat-01 returns the stored row.
**Why human:** No physical I2C hardware available in this environment; the I2C file descriptor paths (/dev/i2c-1) and fcntl.ioctl calls cannot be exercised without a real Pi.

### 2. -v Verbose HTTP Logging

**Test:** Run `python hub_client.py -v --test` and observe stdout.
**Expected:** urllib3 DEBUG output visible showing HTTP request headers and response body, in addition to the normal test output.
**Why human:** Logging level side-effects are not covered by unit tests; requires visual inspection of stdout.

---

## Test Suite Summary

| Suite | Tests | Result |
|-------|-------|--------|
| `django_backend/sensor_data/tests/test_pi_ingest.py` | 8 | ALL PASS |
| `django_backend/sensor_data/tests/` (full suite) | 41 | ALL PASS — no regressions |
| `hubcode/tests/test_atlas_i2c.py` | 13 | ALL PASS |
| `hubcode/tests/test_hub_client.py` | 18 | ALL PASS |
| **Total** | **72** | **ALL PASS** |

---

## Commit Verification

| Commit | Message | Status |
|--------|---------|--------|
| `10235ad` | feat(10-01): add SensorIngestView POST endpoint with TDD test suite | CONFIRMED |
| `5bdec51` | feat(10-02): implement clean AtlasI2C driver with no truncation bug | CONFIRMED |
| `0b69da2` | feat(10-02): implement hub_client with SQLite buffer, sync loop, and config loading | CONFIRMED |
| `5f1d356` | chore(10-02): delete old GCP-dependent hubcode files | CONFIRMED |

---

## Gaps Summary

None. All 14 observable truths verified, all 9 artifacts confirmed substantive and wired, all 5 key links confirmed, all 7 requirements satisfied, 72 tests green. Phase goal achieved.

The only items requiring human attention are physical Pi deployment (no I2C hardware available for automated test) and visual confirmation of `-v` verbose logging output — neither blocks the goal.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
