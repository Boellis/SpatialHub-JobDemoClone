# Phase 9: Django Bridge + Historical Pipeline - Research

**Researched:** 2026-03-16
**Domain:** Django async management commands, Python WebSocket client, asyncio ORM bridging, Docker Compose service orchestration
**Confidence:** HIGH

## Summary

Phase 9 wires together already-built pieces: `biosim_ingest.py` (pure tick-to-row translator, Phase 6), `EnrichedSensorData.objects.bulk_create()` (the write path), and BioSim's WebSocket API (established in Phase 7 frontend work). The new work is two management commands — `biosim_bridge` (long-running async WS consumer) and `biosim_import_log` (one-shot bulk importer) — plus a `bridge` service entry in `docker-compose.yml`.

The architectural pattern is: Django management command `handle()` calls `asyncio.run(self._run_async())`. Inside the async context, `aiohttp.ClientSession` handles both the HTTP simID probe and the WebSocket connection (same session, fewer resources). ORM writes use `asyncio.to_thread()` to keep the async event loop unblocked. All reconnection logic is manual exponential backoff because `aiohttp`'s WebSocket client does not have built-in reconnect iteration (unlike `websockets` library's `async for websocket in connect()` pattern).

**Primary recommendation:** Use `aiohttp` (already in root `requirements.txt`) for both REST probe and WS connection. Add `aiohttp` to `django_backend/requirements.txt` so the Docker image gets it. Use `asyncio.to_thread()` for `bulk_create`. Manual exponential backoff with `asyncio.sleep()` handles reconnection.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bridge Docker Service**
- Separate `bridge` service in docker-compose — same Django image, different command (`python manage.py biosim_bridge`)
- `depends_on: db: service_healthy` AND `biosim: service_healthy` — prevents race condition crashes (Success Criteria #4)
- `restart: unless-stopped` — auto-restart on crash, stays dead on manual stop
- Verbose startup banner: print BioSim URL, simID, DB connection info, then ongoing tick counts

**Connection Resilience**
- Discover simID via HTTP probe to `GET /api/simulation/active` (same pattern as Phase 7 frontend)
- On WebSocket disconnect: exponential backoff retry (1s, 2s, 4s, 8s... capped at 30s), infinite retries
- On each reconnect attempt: re-probe `GET /api/simulation/active` to discover new simID (handles BioSim restarts transparently)
- Log every 100 ticks: "Ingested 100 ticks (1200 rows) in 45.2s — total: 500 ticks"

**Write Batching**
- Per-tick `bulk_create()` — one call per tick (~12 rows), matches PERF-04 requirement
- DB writes via `asyncio.to_thread()` to avoid blocking the async WS event loop (PIPE-02)
- On `bulk_create` failure: catch exception, log error, skip that tick, keep ingesting — lost ticks recoverable via bulk import
- Track internal metrics: total ticks ingested, total rows written, elapsed time

**Bulk Log Import**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PIPE-01 | Django async management command (`biosim_bridge`) connects to BioSim WebSocket | `aiohttp.ClientSession.ws_connect()` inside `asyncio.run()` in `BaseCommand.handle()` — see Architecture Patterns |
| PIPE-02 | Bridge writes BioSim tick data to `enriched_sensor_data` via `asyncio.to_thread()` | `asyncio.to_thread(EnrichedSensorData.objects.bulk_create, rows)` is the correct wrapper for sync ORM in async context |
| PIPE-03 | `/api/enriched/` endpoint serves real BioSim historical data with no API changes | `EnrichedSensorListView` already filters by `hub_id` — no changes needed once rows exist |
| PIPE-04 | `/trends` page displays real BioSim simulation history | `device_addr` set to zone ID strings in `biosim_ingest.py` — `/trends?device_addr=grow-bays` works out of the box |
| PIPE-05 | Tick log bulk import from BioSim `/log` endpoint into `enriched_sensor_data` | `GET /api/simulation/{simID}/log` returns `ticks[]` array; clear+reimport with delete+bulk_create |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `aiohttp` | 3.13.x (latest stable) | Async HTTP client + WebSocket client (single session for both REST probe and WS) | Already in root `requirements.txt`; handles both REST and WS from one `ClientSession` |
| `asyncio` | stdlib (Python 3.11) | Event loop, `asyncio.run()`, `asyncio.to_thread()`, `asyncio.sleep()` | Built-in; no install needed |
| Django `BaseCommand` | 4.2.x (django_backend) | Management command scaffold: `handle()`, `self.stdout.write()`, `self.style.SUCCESS()` | Already used in `seed_habitat_zones.py` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `websockets` | 16.0 | Alternative pure WS client with built-in reconnect iteration (`async for websocket in connect(...)`) | Use instead of aiohttp if the reconnect loop complexity is painful to manage manually |
| `pytest-asyncio` | 0.23.x | Testing async management command internals | Needed if unit-testing the async helper functions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `aiohttp` (Claude's choice) | `websockets` library | `websockets` has cleaner built-in reconnect via `async for websocket in connect()`, but requires a SECOND HTTP library for the simID probe. `aiohttp` does both with one session — less overhead, consistent with what's already in `requirements.txt` |
| Manual backoff loop | `websockets` built-in retry | `websockets.connect()` as async iterator retries with exponential backoff automatically; trade-off is it doesn't re-probe simID on each retry, which the locked decision requires |
| `asyncio.to_thread()` | `asgiref.sync_to_async` | Both work; `asyncio.to_thread` is stdlib Python 3.9+, zero extra deps. `sync_to_async` is the Django-idiomatic wrapper but requires `asgiref` (already a Django transitive dep). Either is valid — `asyncio.to_thread()` is used per locked decision |

**Installation (add to `django_backend/requirements.txt`):**
```bash
aiohttp>=3.9
```
(Root `requirements.txt` already has `aiohttp` but the Docker image installs `django_backend/requirements.txt`.)

---

## Architecture Patterns

### Recommended Project Structure
```
sensor_data/management/commands/
├── biosim_bridge.py       # Long-running async WS consumer (PIPE-01, PIPE-02)
├── biosim_import_log.py   # One-shot bulk importer from /log endpoint (PIPE-05)
└── seed_habitat_zones.py  # Existing — use as style reference
```

### Pattern 1: Async Management Command (the core bridge pattern)
**What:** Django `BaseCommand.handle()` is synchronous — use `asyncio.run()` to bridge into async code.
**When to use:** Any long-running async process wrapped in a Django management command.
**Example:**
```python
# Source: Django docs + websockets.readthedocs.io/en/stable/howto/django.html
import asyncio
import django
from django.core.management.base import BaseCommand

class Command(BaseCommand):
    help = "Long-running BioSim WebSocket bridge"

    def handle(self, *args, **options):
        # Django is already set up by the management framework
        asyncio.run(self._run())

    async def _run(self):
        async with aiohttp.ClientSession() as session:
            await self._connect_and_ingest(session)
```

### Pattern 2: HTTP Probe + WebSocket Connection (single aiohttp session)
**What:** Use one `aiohttp.ClientSession` for both the REST simID probe and WS connection.
**When to use:** When you need to discover a WS URL dynamically before connecting.
**Example:**
```python
# Source: docs.aiohttp.org/en/stable/client_quickstart.html
import aiohttp
import json

async def probe_sim_id(session, biosim_url):
    async with session.get(f"{biosim_url}/api/simulation/active") as resp:
        data = await resp.json(content_type=None)
        sims = data.get('simulations', data) if isinstance(data, dict) else data
        return sims[0] if sims else None

async def connect_ws(session, biosim_url, sim_id):
    ws_url = biosim_url.replace('http', 'ws') + f"/ws/simulation/{sim_id}"
    async with session.ws_connect(ws_url) as ws:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                payload = json.loads(msg.data)
                # payload has: globals + modules keys (same as REST /api/simulation/{simID})
                yield payload
```

### Pattern 3: asyncio.to_thread() for ORM writes
**What:** Django ORM is sync-only ("async-unsafe"). Wrap bulk_create in `asyncio.to_thread()` to call from async context without blocking the event loop.
**When to use:** Any sync ORM operation (bulk_create, delete, filter) called from inside an async function.
**Example:**
```python
# Source: docs.djangoproject.com/en/6.0/topics/async/
import asyncio
from sensor_data.models import EnrichedSensorData

async def write_rows(rows: list):
    try:
        await asyncio.to_thread(
            EnrichedSensorData.objects.bulk_create, rows
        )
    except Exception as e:
        print(f"bulk_create failed: {e} — skipping tick")
```

### Pattern 4: Exponential Backoff Reconnect Loop
**What:** Manual retry loop with doubling sleep delay, capped at max, re-probing simID on each attempt.
**When to use:** The locked decision requires re-probing simID on each reconnect (handles BioSim restarts).
**Example:**
```python
BACKOFF_DELAYS = [1, 2, 4, 8, 16, 30]  # capped at 30s

async def _run_with_reconnect(self, session, biosim_url):
    attempt = 0
    while True:
        try:
            sim_id = await probe_sim_id(session, biosim_url)
            if sim_id is None:
                raise RuntimeError("No active simulation")
            await self._ingest_loop(session, biosim_url, sim_id)
        except Exception as e:
            delay = BACKOFF_DELAYS[min(attempt, len(BACKOFF_DELAYS) - 1)]
            print(f"Connection lost ({e}). Retry in {delay}s...")
            await asyncio.sleep(delay)
            attempt += 1
        else:
            attempt = 0  # reset on clean disconnect
```

### Pattern 5: Bulk Log Import
**What:** One-shot sync management command (no asyncio needed) — HTTP GET, parse `ticks[]` array, clear+reimport.
**When to use:** `biosim_import_log` command — idempotent, can be run any time.
**Example:**
```python
import requests  # sync is fine for one-shot command
from sensor_data.models import EnrichedSensorData
from sensor_data.biosim_ingest import biosim_tick_to_rows
from django.utils.dateparse import parse_datetime

def handle(self, *args, **options):
    # probe simID
    resp = requests.get(f"{biosim_url}/api/simulation/active")
    sim_id = resp.json()...
    # fetch log
    log = requests.get(f"{biosim_url}/api/simulation/{sim_id}/log").json()
    ticks = log.get('ticks', [])
    # clear
    deleted, _ = EnrichedSensorData.objects.filter(hub_id='biosim-habitat-01').delete()
    self.stdout.write(f"Cleared {deleted} existing rows")
    # import
    total_rows = 0
    for i, tick_data in enumerate(ticks):
        tick_time = parse_tick_time(tick_data)  # from globals or use now()
        rows = biosim_tick_to_rows(tick_data['modules'], tick_time)
        EnrichedSensorData.objects.bulk_create(rows)
        total_rows += len(rows)
        if (i + 1) % 10 == 0:
            self.stdout.write(f"Importing tick {i+1}/{len(ticks)}... ({total_rows} rows)")
    self.stdout.write(self.style.SUCCESS(f"Done. {len(ticks)} ticks, {total_rows} rows"))
```

### Anti-Patterns to Avoid
- **Calling ORM directly from async context without wrapping:** `EnrichedSensorData.objects.bulk_create(rows)` called bare inside an `async def` raises `SynchronousOnlyOperation`. Always use `asyncio.to_thread()`.
- **Single global connection (no reconnect):** The bridge must handle `aiohttp.ClientConnectionError` and `asyncio.TimeoutError` — a bare `async with session.ws_connect()` will crash the container on first BioSim restart.
- **Importing `asyncio` as a package in requirements.txt:** It's stdlib. Adding `asyncio` to requirements.txt is a no-op at best (PyPI `asyncio` package is a stub); the locked `requirements.txt` root file already has it — don't add to `django_backend/requirements.txt`.
- **Using Django's `sync_to_async` in a management command context:** Works, but `asyncio.to_thread()` is the stdlib alternative that avoids needing `asgiref` explicitly — both are valid, but don't mix them.
- **Not calling `django.setup()` in standalone scripts:** Not an issue here since management commands run through Django's framework which already calls setup. Do NOT add a second `django.setup()` call.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async HTTP + WS client | Custom socket code | `aiohttp.ClientSession` | Handles connection pooling, timeout, SSL, chunked encoding, all edge cases |
| Sync ORM in async context | Thread-safe ORM wrapper | `asyncio.to_thread()` | Django's ORM requires same thread as creation — `to_thread` creates a new thread per call, satisfying the constraint |
| SimID discovery | Hardcode simID | `GET /api/simulation/active` probe | BioSim assigns simIDs dynamically; hardcoding breaks on every restart |
| tick timestamp | `timezone.now()` | Parse from tick payload if available | BioSim `/log` endpoint has tick-level timestamps for historical accuracy; live ticks can default to `timezone.now()` |

**Key insight:** `biosim_tick_to_rows()` is already built and tested (20 passing tests). The bridge is an assembly job, not a translation job.

---

## Common Pitfalls

### Pitfall 1: `asyncio` in `django_backend/requirements.txt`
**What goes wrong:** Build installs the dummy PyPI `asyncio` package (an ancient stub for Python 2 compatibility), masking errors or conflicting with stdlib.
**Why it happens:** Root `requirements.txt` lists `asyncio` — it's harmless there but a signal to copy carelessly.
**How to avoid:** Only add `aiohttp>=3.9` to `django_backend/requirements.txt`. `asyncio` is stdlib in Python 3.4+.
**Warning signs:** `pip install asyncio` succeeds without error (it installs a 1-file stub).

### Pitfall 2: Docker bridge service starting before BioSim is healthy
**What goes wrong:** Bridge container starts, probes BioSim URL, gets connection refused, crashes. With `restart: unless-stopped`, it crash-loops.
**Why it happens:** Missing or wrong `depends_on` condition.
**How to avoid:** Use `depends_on: biosim: condition: service_healthy` (BioSim healthcheck already configured in docker-compose.yml with 90s start_period). The existing healthcheck polls `/api/simulation` — bridge service waits for this to pass.
**Warning signs:** Bridge logs show "Connection refused to localhost:8009" immediately after start.

### Pitfall 3: SynchronousOnlyOperation from bare ORM call in async function
**What goes wrong:** `EnrichedSensorData.objects.bulk_create(rows)` raises `django.core.exceptions.SynchronousOnlyOperation: You cannot call this from an async context`.
**Why it happens:** Django ORM detects a running event loop and refuses to execute sync code inline.
**How to avoid:** Always wrap: `await asyncio.to_thread(EnrichedSensorData.objects.bulk_create, rows)`.
**Warning signs:** Clean startup then crash on first tick.

### Pitfall 4: BioSim `/log` endpoint requires `--writeTicks` flag
**What goes wrong:** `GET /api/simulation/{simID}/log` returns 404 or empty `ticks: []` because the simulation was started without tick logging enabled.
**Why it happens:** BioSim only records tick history when `--writeTicks` is passed to the start command.
**How to avoid:** Verify the BioSim docker-compose command includes `--writeTicks`, OR check the log response and emit a clear error: "Log endpoint returned 0 ticks — BioSim may not have been started with --writeTicks".
**Warning signs:** `biosim_import_log` reports "0 ticks imported" despite a running simulation.

### Pitfall 5: WS message is raw simulation state, not a "tick event"
**What goes wrong:** Code assumes WS messages arrive only on state changes; misses that BioSim sends the FULL module state on every tick.
**Why it happens:** BioSim WS pushes the entire simulation state per tick — same structure as `GET /api/simulation/{simID}` (confirmed by Phase 7 frontend work using the same feed). No diffing needed.
**How to avoid:** Treat each WS text message as a full state snapshot. Call `json.loads(msg.data)` → extract `['modules']` → pass to `biosim_tick_to_rows()`.
**Warning signs:** N/A — this is a conceptual clarification, not a runtime error.

### Pitfall 6: `aiohttp.ClientSession` created outside async context
**What goes wrong:** Creating `ClientSession()` at module level or in `__init__` raises `DeprecationWarning` / `RuntimeError: Session created outside of the coroutine`.
**Why it happens:** aiohttp requires an active event loop when creating a session.
**How to avoid:** Create `ClientSession` inside the `async def _run()` method, using `async with aiohttp.ClientSession() as session:`.
**Warning signs:** DeprecationWarning or RuntimeError on startup before any connection attempt.

---

## Code Examples

Verified patterns from official sources and project conventions:

### BioSim tick WS message parsing
```python
# Source: BioSim API (confirmed by Phase 7 useBioSimWS.ts and tests/fixtures/biosim_module_state.json)
import json, aiohttp

async for msg in ws:
    if msg.type == aiohttp.WSMsgType.TEXT:
        payload = json.loads(msg.data)
        # payload structure: {"globals": {..., "ticksGoneBy": 191}, "modules": {...}}
        # Same structure as REST GET /api/simulation/{simID}
        modules = payload.get('modules', {})
        tick_time = timezone.now()  # live bridge: wall-clock time is fine
        rows = biosim_tick_to_rows(modules, tick_time)
        await asyncio.to_thread(EnrichedSensorData.objects.bulk_create, rows)
    elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
        break
```

### Docker bridge service entry
```yaml
# Source: docker-compose.yml pattern from existing django service
bridge:
  build: .
  env_file: .env
  command: ["python", "manage.py", "biosim_bridge"]
  depends_on:
    db:
      condition: service_healthy
    biosim:
      condition: service_healthy
  restart: unless-stopped
```

### Management command skeleton (follows seed_habitat_zones.py convention)
```python
# Source: sensor_data/management/commands/seed_habitat_zones.py pattern
import asyncio
from django.core.management.base import BaseCommand

class Command(BaseCommand):
    help = "Long-running BioSim WebSocket bridge — ingests ticks into enriched_sensor_data"

    def handle(self, *args, **options):
        asyncio.run(self._run())

    async def _run(self):
        # ... implementation
```

### biosim_import_log — simID probe + log fetch (sync, no asyncio needed)
```python
# Source: tests/smoke_test.sh probe pattern (same simID discovery logic)
import os, requests
from sensor_data.biosim_ingest import biosim_tick_to_rows
from sensor_data.models import EnrichedSensorData

biosim_url = os.environ.get('BIOSIM_URL', 'http://biosim:8009')

# Probe active simID
resp = requests.get(f"{biosim_url}/api/simulation/active")
data = resp.json()
sims = data.get('simulations', data) if isinstance(data, dict) else data
sim_id = sims[0]

# Fetch tick log
log = requests.get(f"{biosim_url}/api/simulation/{sim_id}/log").json()
ticks = log.get('ticks', [])
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `loop.run_until_complete()` | `asyncio.run()` | Python 3.7 | Cleaner, handles cleanup automatically |
| `asyncio.get_event_loop()` | `asyncio.run()` | Python 3.10 (deprecated old way) | `asyncio.run()` creates a fresh event loop — use this |
| Direct ORM in async | `asyncio.to_thread()` | Python 3.9 (stdlib) | Replaces older `loop.run_in_executor(None, ...)` pattern |
| Django Channels for background tasks | Standalone management command + asyncio | Always valid | Channels adds ASGI server overhead; management command is simpler for a single background process |

**Deprecated/outdated:**
- `loop.run_until_complete()`: Works but deprecated in favor of `asyncio.run()` — avoid in new code.
- `asyncio.get_event_loop().run_until_complete()`: Same as above.

---

## Open Questions

1. **Does BioSim WS tick message include a `tick` field or just `globals`+`modules`?**
   - What we know: REST endpoint returns `{"globals": {..., "ticksGoneBy": 191}, "modules": {...}}`. Phase 7 frontend worked with this structure.
   - What's unclear: Whether the WS message wraps this in a `{"tick": N, ...}` envelope or sends the bare object.
   - Recommendation: Parse `payload.get('modules', {})` and `payload.get('globals', {})` — works either way. If tick count matters for logging, use `payload.get('globals', {}).get('ticksGoneBy', 0)`.

2. **Does BioSim docker-compose command include `--writeTicks`?**
   - What we know: Current `docker-compose.yml` BioSim command does NOT include `--writeTicks`.
   - What's unclear: Whether `biosim_import_log` will ever get data without this flag.
   - Recommendation: Task should add `--writeTicks` to the BioSim command in docker-compose.yml. Alternatively, `biosim_import_log` can emit a clear warning if `ticks` is empty.

3. **BioSim URL env var — `BIOSIM_URL` vs `BIOSIM_BASE_URL`**
   - What we know: Phase 7 frontend uses `VITE_BIOSIM_URL`. The bridge is server-side.
   - What's unclear: What env var name is in `.env` (if any).
   - Recommendation: Use `BIOSIM_URL` with default `http://biosim:8009` (the Docker service name). Document clearly in task.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 7.x + pytest-django 4.x |
| Config file | `django_backend/pytest.ini` |
| Quick run command | `cd django_backend && python -m pytest sensor_data/tests/ -x -q` |
| Full suite command | `cd django_backend && python -m pytest sensor_data/tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | `biosim_bridge` command class exists and is importable | unit | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_bridge.py -x -q` | Wave 0 |
| PIPE-01 | `_run()` async method calls simID probe, then connects WS | unit (mock) | same file | Wave 0 |
| PIPE-02 | `write_rows()` wraps bulk_create in asyncio.to_thread | unit (mock) | same file | Wave 0 |
| PIPE-02 | Per-tick bulk_create called with correct row count | unit (mock) | same file | Wave 0 |
| PIPE-03 | Enriched endpoint returns rows with hub_id biosim-habitat-01 | integration (DB) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_bridge.py::test_enriched_rows_queryable -x` | Wave 0 |
| PIPE-04 | device_addr values match zone ID strings | unit (existing) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_ingest.py::test_device_addr_is_zone_id -x` | ✅ |
| PIPE-05 | `biosim_import_log` command clears then reimports rows | unit (mock + DB) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_import_log.py -x -q` | Wave 0 |
| PIPE-05 | Import is idempotent — running twice gives same row count | unit (mock + DB) | same file | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd django_backend && python -m pytest sensor_data/tests/ -x -q`
- **Per wave merge:** `cd django_backend && python -m pytest sensor_data/tests/ -v`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `django_backend/sensor_data/tests/test_biosim_bridge.py` — covers PIPE-01, PIPE-02, PIPE-03
- [ ] `django_backend/sensor_data/tests/test_biosim_import_log.py` — covers PIPE-05

*(PIPE-04 covered by existing `test_biosim_ingest.py::test_device_addr_is_zone_id` — no gap.)*

---

## Sources

### Primary (HIGH confidence)
- `tests/fixtures/biosim_module_state.json` — authoritative WS tick message structure (captured live from Phase 5)
- `django_backend/sensor_data/biosim_ingest.py` — exact function signature and return type
- `django_backend/sensor_data/management/commands/seed_habitat_zones.py` — management command pattern to follow
- `docker-compose.yml` — existing service definitions; bridge service slot available
- [websockets 16.0 — Client (asyncio)](https://websockets.readthedocs.io/en/stable/reference/asyncio/client.html) — `async for websocket in connect()` reconnect pattern
- [Django async docs](https://docs.djangoproject.com/en/6.0/topics/async/) — `asyncio.to_thread()` and `SynchronousOnlyOperation` behavior
- [aiohttp client quickstart](https://docs.aiohttp.org/en/stable/client_quickstart.html) — `ws_connect()` and async iteration over WS messages

### Secondary (MEDIUM confidence)
- [websockets integrate with Django](https://websockets.readthedocs.io/en/stable/howto/django.html) — `asyncio.to_thread()` for ORM from async context
- [BioSim GitHub](https://github.com/scottbell/biosim) — `/api/simulation/{simID}/log` endpoint structure; `--writeTicks` flag requirement

### Tertiary (LOW confidence)
- BioSim WS exact message envelope — inferred from REST API structure + Phase 7 frontend behavior. Not independently verified from BioSim source code. LOW confidence, but `payload.get('modules', {})` is defensively written.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `aiohttp` confirmed in project, Django management command pattern confirmed in codebase
- Architecture: HIGH — `biosim_tick_to_rows()` is built and tested; bridge is plumbing, not logic
- Pitfalls: HIGH — `asyncio` stdlib vs PyPI stub, `SynchronousOnlyOperation`, Docker ordering all verified
- BioSim `/log` `--writeTicks` flag: MEDIUM — confirmed from README, but current docker-compose doesn't include it

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain; aiohttp/Django APIs change slowly)
