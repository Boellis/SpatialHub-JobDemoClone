# Phase 10: Django Ingest + Hubcode Rewrite - Research

**Researched:** 2026-03-18
**Domain:** Django REST endpoint + Raspberry Pi I2C client + SQLite offline buffer
**Confidence:** HIGH

## Summary

Phase 10 has two halves that must land together: a Django `SensorIngestView` that accepts self-describing POST payloads from the Pi, and a complete replacement of `hubcode/` with `hub_client.py` + `atlas_i2c.py` that eliminates all GCP dependencies. The context is unusually well-specified — all architectural decisions are locked in CONTEXT.md, so the only discretion areas are timeout values, argparse wiring, and error message text.

The Django side is straightforward: the `EnrichedSensorData` model already has every field the Pi payload carries, the `hub_id` filter on `GET /api/enriched/` already works, and no migration is needed. The endpoint follows the same `APIView + try/except + Response` pattern already used by every view in the app. The Pi side involves fixing a known truncation bug in the AtlasI2C driver, implementing a write-ahead SQLite buffer with `synced` flag (a pattern already present in `sensor_logger.py`), and wrapping everything in a `python-dotenv` config loader.

The most dangerous landmine in this phase is the `[0:4]` truncation bug in `AtlasI2C.read_device_data()` — pH readings >= 10.0 silently return `"10.0"[:4]` = `"10.0"`, which happens to be correct but `"10.02"[:4]` = `"10.0"` loses precision, and `"10.1"[:4]` = `"10.1"` works. The real danger is values below 10.0 that have 4+ chars: `"9.43"[:4]` = `"9.43"` (fine) but `"9.432"[:4]` = `"9.43"` (truncated). The fix: return the full joined char list as a string without any slice.

**Primary recommendation:** Write `SensorIngestView` first and validate it with `curl` against a local SQLite-backed Django dev server, then write `hub_client.py` targeting that local server. The two sides are independently testable.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ingest payload & enrichment**
- Pi sends self-describing payloads — all fields included (hub_id, sensor_id, sensor_name, device_addr, sensor_val, datetime, location, owner, workers)
- No server-side lookup or hub_config enrichment — the Pi `.env` contains all metadata
- Endpoint accepts both single JSON object and array of objects (batch) at `POST /api/sensor-ingest/`
- Basic structural validation: required fields present, sensor_val numeric, datetime parseable — reject 400 on invalid
- No namespace guard on hub_id values — discipline is the config's job
- Pi datetime is the only timestamp stored (no server-side received_at) — no schema changes
- device_addr sent as numeric string "99" matching existing pattern
- Response: `{"stored": N}` with 201 Created — no full rows returned

**Offline buffer & reconnection**
- Write-ahead pattern: every reading goes to SQLite first (synced=0), then sync loop POSTs unsynced rows
- Batch POST for buffer sync — all unsynced rows sent in one array payload on reconnection
- Prune after sync — DELETE rows with synced=1 from SQLite; PostgreSQL is source of truth
- Passive retry for reconnection — no health check ping, just try the POST each cycle and handle failure gracefully
- No batch size limit — send all buffered readings in one request

**Pi client UX & operation**
- `--test` flag: read one sensor value, POST to Django, print reading + HTTP response, exit
- Manual script execution: `python hub_client.py` in terminal/screen — no systemd service
- Quiet logging by default: one line per reading (`[HH:MM:SS] pH=7.42 -> synced`), `-v` flag for verbose HTTP details
- Startup banner shows hub_id, poll interval, Django URL, and detected I2C devices
- Replace hubcode/ directory entirely — delete old files, place new `hub_client.py`, `atlas_i2c.py`, `.env.example`, `requirements.txt` there

**AtlasI2C driver scope**
- Full rewrite of driver as `atlas_i2c.py` (snake_case rename)
- ~80 lines: init, query, read_value (no truncation!), get_device_info, close, detect_devices static method
- Drop Python 2 compat, cloud_device_response, duplicate read_device_data method, "Reeeeeeee" debug print
- Keep MSB glitch workaround (real Pi hardware bug) — inline into read path
- detect_devices() scans full I2C bus, reports all Atlas sensors found
- read_value() returns full float precision — no [0:4] truncation

### Claude's Discretion
- Exact HTTP timeout/retry count for POST requests
- SQLite schema details (column types, indexes)
- argparse setup for --test and -v flags
- Error message wording
- Import organization within hub_client.py

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HUB-01 | Config-driven Pi client reads settings from `.env` file (Docker host IP, sensor address, poll interval) — no hardcoded credentials or GCP dependency | `python-dotenv` pattern documented; `.env.example` template in Specifics section |
| HUB-02 | Pi client POSTs sensor readings directly to Django REST API over WiFi using `requests` | `requests` already in Django requirements.txt; standard POST with JSON body and timeout |
| HUB-03 | AtlasI2C driver fixed — no 4-char truncation bug, no debug prints, handles read errors gracefully | Root cause of `[0:4]` slice identified in `read_device_data()`; full fix documented |
| HUB-04 | SQLite offline buffer stores readings when Docker host is unreachable, syncs when connection restores | Write-ahead + synced-flag pattern already in `sensor_logger.py` — reuse and extend |
| HUB-05 | Pi client auto-detects all Atlas Scientific I2C devices on the bus | `list_i2c_devices()` already exists in current driver; `detect_devices()` rewrite documented |
| INGEST-01 | Django POST endpoint receives sensor readings from Pi and stores them in `EnrichedSensorData` with distinct `hub_id` | `EnrichedSensorData` model confirmed field-compatible; `APIView` pattern confirmed |
| INGEST-02 | Real Pi sensor data distinguishable from BioSim data via `hub_id` field (`pi-habitat-01` vs `biosim-habitat-01`) | `hub_id` filter already implemented in `EnrichedSensorListView`; no new code needed on read path |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| djangorestframework | already installed | `APIView`, `Response`, `status` | Every other view in the app uses this pattern |
| python-dotenv | latest (~1.0) | `.env` file parsing on Pi | Standard Pi/IoT config pattern; zero deps |
| requests | >=2.31.0 (already in requirements.txt) | HTTP POST from Pi to Django | Already declared; universally standard |
| sqlite3 | stdlib | Write-ahead buffer on Pi | Already used in `sensor_logger.py` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| argparse | stdlib | `--test` and `-v` flags in `hub_client.py` | Standard CLI argument parsing |
| datetime | stdlib | ISO 8601 timestamp generation on Pi | Pi owns its own timestamps per CONTEXT.md |
| logging | stdlib | Quiet/verbose log output | Already used in `sensor_logger.py` |
| io / fcntl | stdlib | I2C file descriptor operations | Already proven in `AtlasI2C.py` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| python-dotenv | os.environ + shell export | dotenv is more portable; no shell session dependency |
| requests | httpx, aiohttp | requests is simpler, sync, already declared — overkill to switch for a Pi script |
| sqlite3 | shelve, tinydb | sqlite3 is stdlib; existing codebase already uses it for this purpose |

**Installation (Pi side):**
```bash
pip install python-dotenv requests
```

**Installation (Django side — no new packages needed)**

---

## Architecture Patterns

### Recommended File Layout After Phase 10

```
hubcode/
├── hub_client.py        # Main loop, config loading, sync logic
├── atlas_i2c.py         # Clean I2C driver (~80 lines)
├── .env.example         # Template with all required vars
└── requirements.txt     # python-dotenv, requests

django_backend/sensor_data/
├── views.py             # + SensorIngestView added
└── urls.py              # + path('sensor-ingest/', ...)
```

No new files needed in the Django app beyond the two above.

### Pattern 1: SensorIngestView — Normalize-Then-Bulk-Create

**What:** Accept single dict or list, normalize to list, validate each item, `bulk_create` all or return 400.
**When to use:** Any endpoint that accepts both single and batch payloads.
**Example:**
```python
# Follows existing APIView + try/except + Response pattern from views.py
class SensorIngestView(APIView):
    REQUIRED_FIELDS = {'hub_id', 'sensor_id', 'sensor_name', 'device_addr',
                       'sensor_val', 'datetime', 'location', 'owner', 'workers'}

    def post(self, request):
        try:
            data = request.data
            items = data if isinstance(data, list) else [data]

            rows = []
            for item in items:
                missing = self.REQUIRED_FIELDS - set(item.keys())
                if missing:
                    return Response(
                        {"error": f"Missing fields: {missing}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                try:
                    float(item['sensor_val'])
                    # dateutil or Django's parse_datetime handles ISO 8601
                    from django.utils.dateparse import parse_datetime
                    if parse_datetime(str(item['datetime'])) is None:
                        raise ValueError("unparseable datetime")
                except (ValueError, TypeError) as e:
                    return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

                rows.append(EnrichedSensorData(
                    hub_id=item['hub_id'],
                    sensor_id=item['sensor_id'],
                    sensor_name=item['sensor_name'],
                    device_addr=str(item['device_addr']),
                    sensor_val=float(item['sensor_val']),
                    datetime=item['datetime'],
                    location=item['location'],
                    owner=item['owner'],
                    workers=item['workers'],
                ))

            EnrichedSensorData.objects.bulk_create(rows)
            return Response({"stored": len(rows)}, status=status.HTTP_201_CREATED)

        except Exception as e:
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
```

### Pattern 2: Write-Ahead SQLite Buffer

**What:** Write every reading to SQLite with `synced=0` before attempting HTTP POST. After successful POST, mark rows `synced=1`. Prune `synced=1` rows on startup or after each sync.
**When to use:** Any IoT client operating over unreliable WiFi.
**Example:**
```python
# Source: based on existing sensor_logger.py pattern
import sqlite3
from datetime import datetime, timezone

DB_FILE = "hub_buffer.db"

def init_db():
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hub_id TEXT NOT NULL,
            sensor_id TEXT NOT NULL,
            sensor_name TEXT NOT NULL,
            device_addr TEXT NOT NULL,
            sensor_val REAL NOT NULL,
            datetime TEXT NOT NULL,
            location TEXT NOT NULL,
            owner TEXT NOT NULL,
            workers TEXT NOT NULL,
            synced INTEGER NOT NULL DEFAULT 0
        )''')
        conn.commit()

def buffer_reading(payload: dict):
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            'INSERT INTO readings (hub_id, sensor_id, sensor_name, device_addr, '
            'sensor_val, datetime, location, owner, workers, synced) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
            (payload['hub_id'], payload['sensor_id'], payload['sensor_name'],
             payload['device_addr'], payload['sensor_val'], payload['datetime'],
             payload['location'], payload['owner'], payload['workers'])
        )
        conn.commit()

def get_unsynced() -> list[dict]:
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            'SELECT * FROM readings WHERE synced = 0 ORDER BY id'
        ).fetchall()
    return [dict(r) for r in rows]

def mark_synced_and_prune():
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute('UPDATE readings SET synced = 1 WHERE synced = 0')
        conn.execute('DELETE FROM readings WHERE synced = 1')
        conn.commit()
```

### Pattern 3: AtlasI2C read_value — MSB Glitch Fix Without Truncation

**What:** Apply MSB glitch fix, join all chars, parse full float. No slice.
**When to use:** Reading Atlas Scientific EZO sensors on Raspberry Pi.
**Example:**
```python
def read_value(self) -> float:
    """Read sensor value. Raises ValueError on sensor error or parse failure."""
    raw = self._file_read.read(31)
    # MSB glitch: clear MSB on all bytes except first (Pi hardware quirk)
    chars = [chr(b & ~0x80) for b in raw[1:] if (b & ~0x80) != 0]
    status_byte = raw[0]
    if status_byte != 1:
        raise ValueError(f"Sensor error code: {status_byte}")
    value_str = ''.join(chars).strip('\x00').strip()
    return float(value_str)  # Full precision — no [0:4] truncation
```

### Pattern 4: .env Config Loading on Pi

```python
# hub_client.py top of file
from dotenv import load_dotenv
import os

load_dotenv()  # reads .env from cwd

HUB_ID       = os.environ['HUB_ID']        # required — KeyError is intentional
SENSOR_ADDR  = int(os.environ['DEVICE_ADDR'])
DJANGO_URL   = os.environ['DJANGO_URL']     # e.g. http://192.168.1.100:8000
POLL_INTERVAL = float(os.environ.get('POLL_INTERVAL', '5'))
```

### Pattern 5: Detect Devices Static Method

```python
@staticmethod
def detect_devices(bus: int = 1) -> list[int]:
    """Scan I2C bus and return addresses of all responding devices."""
    found = []
    for addr in range(0, 128):
        try:
            with open(f'/dev/i2c-{bus}', 'rb', buffering=0) as f:
                import fcntl
                fcntl.ioctl(f, 0x0703, addr)  # I2C_SLAVE
                f.read(1)
                found.append(addr)
        except OSError:
            pass
    return found
```

### Anti-Patterns to Avoid

- **Per-row inserts in the sync loop:** Buffer rows in a list, POST the entire list as a JSON array, call `bulk_create` once — not one POST per reading.
- **Health-check ping before POST:** CONTEXT.md explicitly says passive retry — just attempt the POST and catch `requests.exceptions.ConnectionError`.
- **Hardcoding hub_id in Django:** The hub_id namespace is entirely Pi-side; the endpoint stores whatever arrives.
- **Atomic-all-or-nothing batch validation:** Validate every item before creating any. If item 3 of 10 is invalid, reject the entire batch with 400. Do not partial-commit.
- **`parse_datetime` returning None silently:** Django's `parse_datetime` returns `None` for strings it can't parse. Always check for `None` and return 400 explicitly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| I2C address ioctl | Custom kernel interface | `fcntl.ioctl(f, 0x0703, addr)` | Standard Linux I2C_SLAVE constant; existing code already uses it |
| .env file parsing | `open('.env').read().split('\n')` | `python-dotenv` | Handles comments, quoting, export prefixes, missing files gracefully |
| Datetime parsing on ingest | Custom regex | `django.utils.dateparse.parse_datetime` | Handles ISO 8601 with timezone; returns None on invalid (testable) |
| Batch model creation | `for row in rows: row.save()` | `EnrichedSensorData.objects.bulk_create(rows)` | Single DB round trip; proven pattern from `biosim_bridge.py` |
| HTTP retry logic | Custom sleep/loop | `requests` timeout + except ConnectionError + sleep | Passive retry per CONTEXT.md; no library needed |

**Key insight:** Every "custom" solution here has a landmine. The I2C ioctl constant, datetime parsing edge cases, and bulk_create vs individual saves are all proven already in this codebase.

---

## Common Pitfalls

### Pitfall 1: The `[0:4]` Truncation Bug (the whole reason HUB-03 exists)

**What goes wrong:** `read_device_data()` in `AtlasI2C.py` returns `stripped_response = _cloud_device_response[0:4]`. For pH >= 10.0 with decimals this clips values: `"10.02"` becomes `"10.0"`. For pH values with 5+ significant chars: `"7.432"` becomes `"7.43"`.
**Why it happens:** Original developer assumed pH is always 4 chars. It's not.
**How to avoid:** `read_value()` in `atlas_i2c.py` returns `float(full_string)` — no slice, no truncation.
**Warning signs:** pH readings mysteriously lose precision for values with 5+ character string representations.

### Pitfall 2: `django.utils.dateparse.parse_datetime` Returns None Silently

**What goes wrong:** `parse_datetime("not-a-date")` returns `None`, not an exception. If you pass `None` to `EnrichedSensorData(datetime=None)` and call `bulk_create`, PostgreSQL rejects it with a constraint violation at the DB layer — ugly 500 instead of clean 400.
**Why it happens:** DRF passes request data as-is; no automatic datetime coercion.
**How to avoid:** Explicitly check `if parse_datetime(str(item['datetime'])) is None: return 400`.
**Warning signs:** `IntegrityError` or `DataError` from PostgreSQL on valid-looking requests.

### Pitfall 3: CSRF on POST Endpoint

**What goes wrong:** Django's `CsrfViewMiddleware` is active in settings.py. `APIView` from DRF bypasses CSRF for API clients by default — but only if `SessionAuthentication` is not the active authenticator and the request has no session cookie. The Pi uses `requests` with no cookies, so CSRF is not enforced. However, if someone tests via browser-based tools, they may get 403 CSRF failures.
**Why it happens:** The middleware is present; DRF's default behavior depends on authentication class.
**How to avoid:** No action needed — DRF's `APIView` is CSRF-exempt by default for non-session clients. Pi uses `requests` without cookies. Confirmed by existing `HubProvisionView` POST working without CSRF tokens.
**Warning signs:** 403 responses only from browser-based testing, not from `curl` or `requests`.

### Pitfall 4: MSB Glitch Must Run on Every Byte Except the First

**What goes wrong:** The MSB glitch (Raspberry Pi I2C hardware quirk) affects all response bytes after the status byte. If you skip the fix, Atlas sensors return garbage characters mixed with the pH value.
**Why it happens:** Pi I2C reads set the MSB on every byte; Atlas sensors expect it clear.
**How to avoid:** Apply `b & ~0x80` to every byte in `raw[1:]`, not just some of them. The existing `handle_raspi_glitch()` does this correctly — carry the logic forward to the rewrite.
**Warning signs:** Readings come back as garbled strings or float parse failures.

### Pitfall 5: SQLite `synced` Flag Race on Pi (Non-Issue at Single-Thread Scale)

**What goes wrong:** If the mark-synced and prune step runs before the POST response is confirmed, a network failure after POST but before marking synced causes duplicate rows on the next sync.
**Why it happens:** Write-before-confirm ordering.
**How to avoid:** Only call `mark_synced_and_prune()` after `response.status_code in (200, 201)` — confirmed success. Since this is single-threaded Python, no actual race exists, but the ordering must still be correct.
**Warning signs:** Duplicate rows in `enriched_sensor_data` for the same datetime + hub_id.

### Pitfall 6: `datetime.now()` Without Timezone on Pi

**What goes wrong:** PostgreSQL `enriched_sensor_data.datetime` column stores timezone-aware values (Django uses `USE_TZ = True`). If the Pi sends `datetime.now().isoformat()` (naive), Django may accept it in dev (SQLite) but PostgreSQL will raise `DataError: invalid input syntax for type timestamp with time zone`.
**Why it happens:** `USE_TZ = True` in settings.py; naive datetimes are rejected by psycopg2.
**How to avoid:** Use `datetime.now(timezone.utc).isoformat()` on the Pi to always send UTC ISO 8601 with `+00:00` suffix.
**Warning signs:** Works on SQLite dev server, fails against PostgreSQL Docker container.

---

## Code Examples

Verified patterns from existing codebase:

### Existing APIView Pattern (from views.py)
```python
# Source: django_backend/sensor_data/views.py:23-40
class EnrichedSensorListView(APIView):
    def get(self, request):
        try:
            queryset = EnrichedSensorData.objects.all().order_by("-datetime")
            hub_id = request.query_params.get("hub_id")
            if hub_id:
                queryset = queryset.filter(hub_id=hub_id)
            serializer = EnrichedSensorSerializer(queryset, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
```

### Existing bulk_create Pattern (from biosim_bridge.py)
```python
# Source: django_backend/sensor_data/management/commands/biosim_bridge.py:52-60
async def write_rows(rows):
    try:
        await asyncio.to_thread(EnrichedSensorData.objects.bulk_create, rows)
    except Exception as e:
        print(f"bulk_create failed: {e} -- skipping tick")
```

### Existing SQLite Buffer Pattern (from sensor_logger.py)
```python
# Source: hubcode/sensor_logger.py:29-43
c.execute('''CREATE TABLE IF NOT EXISTS sensor_data1 (
    sensor_name TEXT,
    device_addr REAL,
    sensor_val REAL,
    timestamp TEXT,
    synced INTEGER DEFAULT 0
)''')
# Insert with synced = 0
c.execute('INSERT INTO sensor_data1 VALUES (?, ?, ?, ?, ?)',
          ("sensor", addr, val, ts, 0))
```

### .env.example Template
```ini
# hub_client configuration
HUB_ID=pi-habitat-01
SENSOR_ID=wr-ph-real
SENSOR_NAME=pH Sensor
DEVICE_ADDR=99
LOCATION=Mars Habitat Alpha
OWNER=Demo User
WORKERS=Crew A
DJANGO_URL=http://192.168.1.100:8000
POLL_INTERVAL=5
```

### Startup Banner Pattern
```python
# Per CONTEXT.md Specifics section
print(f"[INFO] Starting hub_client ({HUB_ID})")
print(f"[INFO] Poll: {POLL_INTERVAL}s / Django: {DJANGO_URL}")
print(f"[INFO] Detected I2C devices: {detected_addrs}")
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GCP Pub/Sub pipeline for Pi data | Direct REST POST to Django over WiFi | Phase 10 | Eliminates GCP credentials, works on local network with no internet |
| `AtlasI2C.py` (Python 2 compat, truncation, debug prints) | `atlas_i2c.py` (~80 lines, Python 3 only, full precision) | Phase 10 | Fixes pH >= 10 bug, removes dead code |
| Hardcoded HUB_ID and SENSOR_ADDR in Python files | `.env` file parsed by `python-dotenv` | Phase 10 | Reconfigurable without code changes |
| Batch import via `biosim_import_log` | Direct per-reading POST + write-ahead buffer | Phase 10 | Real-time pipeline, not batch; offline-resilient |

**Deprecated/outdated after Phase 10:**
- `hubcode/AtlasI2C.py`: replaced by `hubcode/atlas_i2c.py`
- `hubcode/basic_funcs.py`: entire GCP Pub/Sub pub/sub pattern removed
- `hubcode/sensor_logger.py`: replaced by `hub_client.py` (which contains buffer logic inline)
- `hubcode/snyc_to_postgres.py`: replaced by direct POST
- `hubcode/pump_handler.py`: out of scope for Phase 10 (keep or delete based on CONTEXT.md — delete per "Replace hubcode/ directory entirely")

---

## Open Questions

1. **Django dev server vs. Docker for local testing**
   - What we know: The Pi must POST to `DJANGO_URL` from `.env`. For local development and test, `python manage.py runserver` with `USE_SQLITE=1` works without Docker.
   - What's unclear: Whether the planner should include a task for testing against the full Docker stack or just `runserver`.
   - Recommendation: Plan tasks against `runserver` with SQLite (fast, no Docker required). Add a success-criteria validation step against Docker stack.

2. **`pump_handler.py` disposal**
   - What we know: CONTEXT.md says "Replace hubcode/ directory entirely — delete old files."
   - What's unclear: Whether to keep `pump_handler.py` for future Phase 11 control use.
   - Recommendation: Delete it per the locked decision. Phase 11 control service will be a new Django management command, not Pi-side code.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 7+ with pytest-django 4+ |
| Config file | `django_backend/pytest.ini` |
| Quick run command | `cd django_backend && python -m pytest sensor_data/tests/test_pi_ingest.py -x` |
| Full suite command | `cd django_backend && python -m pytest sensor_data/tests/ -x` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INGEST-01 | POST valid single payload stores row in enriched_sensor_data | integration | `pytest sensor_data/tests/test_pi_ingest.py::test_single_payload_stored -x` | Wave 0 |
| INGEST-01 | POST valid array payload stores N rows | integration | `pytest sensor_data/tests/test_pi_ingest.py::test_batch_payload_stored -x` | Wave 0 |
| INGEST-01 | POST with missing field returns 400 | unit | `pytest sensor_data/tests/test_pi_ingest.py::test_missing_field_returns_400 -x` | Wave 0 |
| INGEST-01 | POST with non-numeric sensor_val returns 400 | unit | `pytest sensor_data/tests/test_pi_ingest.py::test_invalid_sensor_val_returns_400 -x` | Wave 0 |
| INGEST-01 | POST with unparseable datetime returns 400 | unit | `pytest sensor_data/tests/test_pi_ingest.py::test_invalid_datetime_returns_400 -x` | Wave 0 |
| INGEST-02 | Stored row has hub_id='pi-habitat-01', distinct from biosim rows | integration | `pytest sensor_data/tests/test_pi_ingest.py::test_hub_id_is_pi_value -x` | Wave 0 |
| HUB-03 | read_value() returns full float, no truncation for pH >= 10.0 | unit | `pytest sensor_data/tests/test_atlas_i2c.py::test_read_value_no_truncation -x` | Wave 0 |
| HUB-03 | read_value() raises ValueError on sensor error code | unit | `pytest sensor_data/tests/test_atlas_i2c.py::test_read_value_error_code -x` | Wave 0 |
| HUB-04 | buffer_reading() inserts row with synced=0 | unit | `pytest sensor_data/tests/test_hub_client.py::test_buffer_writing -x` | Wave 0 |
| HUB-04 | mark_synced_and_prune() removes synced rows | unit | `pytest sensor_data/tests/test_hub_client.py::test_prune_after_sync -x` | Wave 0 |
| HUB-01 | .env loading propagates config to client variables | unit | `pytest sensor_data/tests/test_hub_client.py::test_env_loading -x` | Wave 0 |

Note: HUB-02 and HUB-05 are hardware-dependent (real I2C bus). They are validated by the `--test` flag on real Pi hardware, not automated tests. Manual verification only.

### Sampling Rate
- **Per task commit:** `cd django_backend && python -m pytest sensor_data/tests/test_pi_ingest.py -x`
- **Per wave merge:** `cd django_backend && python -m pytest sensor_data/tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `django_backend/sensor_data/tests/test_pi_ingest.py` — covers INGEST-01, INGEST-02 (Django side)
- [ ] `hubcode/tests/test_atlas_i2c.py` — covers HUB-03 (driver truncation fix)
- [ ] `hubcode/tests/test_hub_client.py` — covers HUB-04, HUB-01 (buffer + env loading)

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reading — `django_backend/sensor_data/views.py`, `models.py`, `serializers.py`, `urls.py`
- Direct codebase reading — `hubcode/AtlasI2C.py` (truncation bug confirmed at line 151, 195)
- Direct codebase reading — `hubcode/sensor_logger.py` (SQLite write-ahead pattern)
- Direct codebase reading — `django_backend/sensor_data/management/commands/biosim_bridge.py` (bulk_create pattern)
- Direct codebase reading — `django_backend/pytest.ini` (test framework config)
- Direct codebase reading — `django_backend/sensor_data/tests/` (test patterns)
- Direct codebase reading — `django_backend/spatialhub_backend/settings.py` (USE_TZ=True, CSRF config)
- `.planning/phases/10-django-ingest-hubcode-rewrite/10-CONTEXT.md` (locked decisions)

### Secondary (MEDIUM confidence)
- Django documentation pattern: `APIView.post()` for DRF CSRF bypass behavior — confirmed by existing working POST endpoints (`HubProvisionView`) with no CSRF token in use
- Atlas Scientific EZO sensor MSB glitch behavior — documented inline in existing `AtlasI2C.py` comments and code

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use in this codebase; no new dependencies except `python-dotenv`
- Architecture: HIGH — all patterns are drawn directly from existing code in the repo
- Pitfalls: HIGH — truncation bug confirmed by code inspection; datetime timezone issue confirmed by Django settings; CSRF behavior confirmed by existing POST views

**Research date:** 2026-03-18
**Valid until:** 2026-06-18 (stable Django/DRF patterns; python-dotenv API is stable)
