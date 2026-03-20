# Phase 14: Closed-Loop Control Service - Research

**Researched:** 2026-03-20
**Domain:** Django management command, BioSim malfunction REST API, Cloud SQL ORM queries, Docker Compose service addition
**Confidence:** HIGH

## Summary

Phase 14 is almost entirely internal Django Python — a synchronous polling loop that reads two rows from Cloud SQL via the ORM, computes divergence, and makes HTTP calls to BioSim's local REST API. The codebase already has everything needed: `probe_sim_id()` in `biosim_bridge.py`, the `EnrichedSensorData` ORM model with the exact fields to query, the BioSim malfunction API contract documented in `biosimMalfunctions.ts`, and the Docker Compose pattern to add a new service. The only novel logic is the hysteresis state machine (trigger at 0.5, clear at 0.4) and stale-data guard (60s).

The synchronous `requests` library is the right choice here — `biosim_import_log.py` already uses it for BioSim REST calls and it removes the asyncio complexity that `biosim_bridge.py` carries for WebSocket reasons. Control loop only does HTTP POST/DELETE, never streams — synchronous is simpler and correct.

**Primary recommendation:** Implement as a synchronous `BaseCommand` using `time.sleep(10)` loop, `requests` for BioSim API, Django ORM for Cloud SQL reads. Add to `docker-compose.vm.yml` as a `control_loop` service mirroring the `bridge` service pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Default threshold: **0.5 pH units** — configurable via `PH_THRESHOLD` env var
- **Hysteresis with 0.1 deadband** — trigger malfunction at threshold (0.5), clear at threshold minus deadband (0.4)
- Recovery is automatic: DELETE malfunction when fresh Pi pH shows divergence below recovery threshold
- Pi data older than **60 seconds** treated as stale — do NOT trigger new malfunctions, do NOT auto-clear existing malfunctions
- Staleness cutoff configurable via `STALE_SECONDS` env var (default 60)
- **State-change logging only** — malfunction triggered, malfunction cleared, Pi data went stale, Pi data resumed
- **Heartbeat every 60 seconds** (6 loops) — "control_loop alive, Pi pH=X, BioSim pH=Y, divergence=Z, state=normal/malfunction/stale"
- Stdout via `self.stdout.write()` — visible in `docker compose logs control_loop`
- No status endpoint, no Cloud SQL logging

### Claude's Discretion
- Internal state machine implementation (enum vs simple booleans)
- Exact malfunction intensity/length values (SEVERE_MALF/TEMPORARY_MALF matches existing AnomalyDrawer pattern)
- Error handling for BioSim API failures (retry vs skip cycle)
- Whether to store malfunction_id in memory or re-query BioSim
- asyncio vs synchronous implementation

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTRL-01 | Control service compares real Pi pH to BioSim's simulated water recycling pH at regular intervals | `EnrichedSensorData.objects.filter(hub_id=X, sensor_id=Y).order_by('-datetime').first()` queries both Pi (`pi-habitat-01`/`wr-ph-real`) and BioSim (`biosim-habitat-01`/`wr-ph`) sources |
| CTRL-02 | pH divergence beyond configurable threshold triggers `Grey_Water_Store` malfunction via BioSim REST API | POST `{BIOSIM_URL}/api/simulation/{simId}/modules/Grey_Water_Store/malfunctions` with `{intensity: 'SEVERE_MALF', length: 'TEMPORARY_MALF'}` returns `{malfunctionID}` |
| CTRL-03 | Control service auto-recovers — DELETEs malfunction when real pH normalizes back to expected range | DELETE `{BIOSIM_URL}/api/simulation/{simId}/modules/Grey_Water_Store/malfunctions/{malfunctionId}` — malfunction_id stored in memory between loop iterations |
| CTRL-04 | Control service runs as a managed process on the BioSim GCE VM (`manage.py control_loop`) | Add `control_loop` service to `docker-compose.vm.yml` mirroring `bridge` service: same Django image, `command: ["python", "manage.py", "control_loop"]`, `depends_on: biosim: condition: service_healthy`, `restart: unless-stopped` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Django BaseCommand | 4.2.x (project) | Management command scaffold | Already the pattern for bridge, import_log, seed_habitat_zones |
| `requests` | project venv | Synchronous HTTP to BioSim REST API | Already used by `biosim_import_log.py` for BioSim calls; no streaming needed |
| Django ORM | 4.2.x | Cloud SQL reads via `EnrichedSensorData.objects` | Models already defined, Cloud SQL connection via env vars already wired |
| `time.sleep(10)` | stdlib | 10-second poll interval | No async overhead; control loop is I/O-bound with no concurrency requirement |
| `os.environ.get` | stdlib | `PH_THRESHOLD`, `STALE_SECONDS`, `BIOSIM_URL` env vars | Exact pattern used by all existing management commands |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `django.utils.timezone` | Django | Timezone-aware datetime for staleness comparison | Already imported in `biosim_ingest.py`; use `timezone.now()` consistently |
| `enum.Enum` or simple booleans | stdlib | State machine (normal / malfunction / stale) | Claude's discretion — either works; booleans (`malfunction_active`, `is_stale`) are simpler |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `requests` (sync) | `aiohttp` (async) | asyncio adds complexity for no benefit — no concurrent I/O; `biosim_import_log.py` already proves requests is correct here |
| `time.sleep(10)` | Celery beat / APScheduler | Overkill for a single-process loop on a dedicated VM service |

**Installation:** No new dependencies. `requests` already in project venv.

## Architecture Patterns

### Recommended Project Structure
```
django_backend/sensor_data/management/commands/
└── control_loop.py      # New management command (this phase)

docker-compose.vm.yml    # Add control_loop service (this phase)
```

### Pattern 1: Synchronous Polling Loop with State Machine
**What:** `handle()` runs an infinite `while True` loop with `time.sleep(10)`. State (malfunction active, malfunction_id, stale flag) held in local variables between iterations.
**When to use:** Single-concern process, no parallelism needed, Docker service handles restart.

```python
# Source: biosim_import_log.py pattern (synchronous), biosim_bridge.py (probe_sim_id)
import os, time, requests
from django.core.management.base import BaseCommand
from django.utils import timezone

BIOSIM_URL = os.environ.get('BIOSIM_URL', 'http://biosim:8009')
PH_THRESHOLD = float(os.environ.get('PH_THRESHOLD', '0.5'))
STALE_SECONDS = int(os.environ.get('STALE_SECONDS', '60'))
MODULE_NAME = 'Grey_Water_Store'
PI_HUB_ID = 'pi-habitat-01'
PI_SENSOR_ID = 'wr-ph-real'
BIOSIM_HUB_ID = 'biosim-habitat-01'
BIOSIM_SENSOR_ID = 'wr-ph'

class Command(BaseCommand):
    help = "Closed-loop pH control: monitors divergence and triggers BioSim malfunctions"

    def handle(self, *args, **options):
        sim_id = self._probe_sim_id()
        malfunction_active = False
        malfunction_id = None
        loop_count = 0

        while True:
            loop_count += 1
            self._run_cycle(sim_id, loop_count, malfunction_active, malfunction_id)
            time.sleep(10)
```

### Pattern 2: ORM Latest-Row Query
**What:** Fetch the most recent reading for a specific hub+sensor combination.
**When to use:** Getting latest Pi pH and latest BioSim pH each cycle.

```python
# Source: models.py + CONTEXT.md code_context section
from sensor_data.models import EnrichedSensorData
from django.utils import timezone

def get_latest(hub_id, sensor_id):
    row = (EnrichedSensorData.objects
           .filter(hub_id=hub_id, sensor_id=sensor_id)
           .order_by('-datetime')
           .first())
    return row  # None if no data yet

# Staleness check
def is_stale(row, stale_seconds):
    if row is None:
        return True
    age = (timezone.now() - row.datetime).total_seconds()
    return age > stale_seconds
```

### Pattern 3: BioSim Malfunction POST/DELETE
**What:** HTTP calls to BioSim REST API to trigger and clear `Grey_Water_Store` malfunction.
**When to use:** When divergence crosses threshold (POST) or clears below recovery threshold (DELETE).

```python
# Source: biosimMalfunctions.ts — Python equivalent
def post_malfunction(sim_id):
    url = f"{BIOSIM_URL}/api/simulation/{sim_id}/modules/{MODULE_NAME}/malfunctions"
    resp = requests.post(url, json={'intensity': 'SEVERE_MALF', 'length': 'TEMPORARY_MALF'})
    resp.raise_for_status()
    return resp.json()['malfunctionID']

def delete_malfunction(sim_id, malfunction_id):
    url = f"{BIOSIM_URL}/api/simulation/{sim_id}/modules/{MODULE_NAME}/malfunctions/{malfunction_id}"
    resp = requests.delete(url)
    return resp.ok
```

### Pattern 4: probe_sim_id (synchronous port)
**What:** Synchronous version of the async `probe_sim_id` from `biosim_bridge.py`.
**When to use:** Called once at startup; retried if BioSim not yet ready.

```python
# Source: biosim_bridge.py probe_sim_id — sync port
def probe_sim_id(biosim_url):
    resp = requests.get(f"{biosim_url}/api/simulation")
    resp.raise_for_status()
    data = resp.json()
    sims = data if isinstance(data, list) else data.get('simulations', [])
    return sims[0] if sims else None
```

Note: `biosim_import_log.py` has an equivalent synchronous `discover_sim_id()` — can be referenced directly or extracted to a shared utility.

### Pattern 5: Docker Compose Service Addition
**What:** Add `control_loop` service to `docker-compose.vm.yml` mirroring `bridge`.
**When to use:** This is the deployment pattern for all Django management commands on the VM.

```yaml
# Source: docker-compose.vm.yml bridge service — mirror exactly
control_loop:
  build: .
  environment:
    DB_HOST: ${DB_HOST}
    DB_NAME: ${DB_NAME}
    DB_USER: ${DB_USER}
    DB_PASS: ${DB_PASS}
    SECRET_KEY: ${SECRET_KEY}
    BIOSIM_URL: http://biosim:8009
    USE_SQLITE: "0"
    PH_THRESHOLD: "0.5"
    STALE_SECONDS: "60"
  command: ["python", "manage.py", "control_loop"]
  depends_on:
    biosim:
      condition: service_healthy
  restart: unless-stopped
```

### Anti-Patterns to Avoid
- **Re-querying BioSim for malfunction_id:** Store `malfunction_id` in memory after POST; the DELETE endpoint requires it. BioSim has no "list active malfunctions" endpoint to re-fetch from.
- **Clearing malfunction on stale Pi data:** Locked decision — hold malfunction state when Pi data is stale; only clear on confirmed fresh reading below recovery threshold.
- **Triggering new malfunction when one is already active:** Check `malfunction_active` flag before POSTing; duplicate malfunctions pile up in BioSim with separate IDs.
- **Using `asyncio` here:** The `biosim_bridge.py` uses async because it holds a WebSocket open. `control_loop` only does discrete HTTP POST/DELETE — sync is simpler and correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BioSim simulation ID discovery | Custom polling loop | Port `probe_sim_id()` from `biosim_bridge.py` or use `discover_sim_id()` from `biosim_import_log.py` | Already handles both JSON shapes (`[1]` and `{"simulations":[1]}`) |
| Cloud SQL connection setup | Custom psycopg2 wiring | Django ORM with existing env var pattern | `DB_HOST`/`DB_PASS`/`DB_NAME`/`DB_USER` already wired in `docker-compose.vm.yml` |
| Hysteresis deadband logic | Complex PID controller | Simple threshold + deadband check | 0.5 trigger / 0.4 recovery is 3 lines of Python |

**Key insight:** Everything in this phase is wiring existing assets together. The novel code is ~50 lines of state machine logic.

## Common Pitfalls

### Pitfall 1: Malfunction_id Lost on Restart
**What goes wrong:** `control_loop` crashes or is restarted mid-malfunction. On restart, `malfunction_active=False` so the loop never DELETEs the orphaned malfunction. Grey_Water_Store stays broken indefinitely.
**Why it happens:** State is in-memory only; not persisted anywhere.
**How to avoid:** On startup, after `probe_sim_id()`, optionally query BioSim for active malfunctions on `Grey_Water_Store` — OR accept the tradeoff: `restart: unless-stopped` means crashes are rare, and the demo runs for hours not days. For a competition demo, "restart manually clears it" is acceptable. Document the behavior.
**Warning signs:** Zone stays red after Pi pH normalizes; `docker compose logs control_loop` shows "Starting" but no "Malfunction cleared."

### Pitfall 2: BioSim Not Ready at control_loop Startup
**What goes wrong:** `probe_sim_id()` called before BioSim's JVM has finished starting and loaded a simulation. Returns `None` or raises connection error.
**Why it happens:** `depends_on: biosim: condition: service_healthy` ensures BioSim HTTP is up, but the simulation may not have started yet (the `biosim` service's command POSTs to `/api/simulation/start` after the healthcheck endpoint responds).
**How to avoid:** Wrap `probe_sim_id()` in a retry loop at startup (same backoff pattern as `biosim_bridge.py`). Retry until sim_id is non-None.
**Warning signs:** "No active simulation found" in logs immediately at startup.

### Pitfall 3: Timezone-Naive Datetime Comparison
**What goes wrong:** `row.datetime` is timezone-aware (Django stores UTC). Comparing with `datetime.now()` (naive) raises `TypeError: can't subtract offset-naive and offset-aware datetimes`.
**Why it happens:** Python datetime has two modes; ORM returns aware datetimes when `USE_TZ=True` (Django default).
**How to avoid:** Always use `timezone.now()` from `django.utils.timezone`, not `datetime.datetime.now()`.
**Warning signs:** `TypeError` in staleness check during first cycle.

### Pitfall 4: Duplicate Malfunction POSTs
**What goes wrong:** Loop POSTs malfunction on cycle N, then on cycle N+1 divergence still exceeds threshold, so it POSTs again. BioSim accumulates multiple `Grey_Water_Store` malfunctions with different IDs. Only one gets tracked; the others orphan.
**Why it happens:** Not checking `malfunction_active` flag before POSTing.
**How to avoid:** Gate POST on `not malfunction_active`. Gate DELETE on `malfunction_active`.

### Pitfall 5: requests.post() Raising on BioSim API Failure
**What goes wrong:** BioSim returns a 5xx or the network blips; `resp.raise_for_status()` raises; unhandled exception kills the loop.
**Why it happens:** BioSim is a Java server that occasionally hiccups.
**How to avoid:** Wrap BioSim API calls in `try/except requests.RequestException`; log the error and skip the cycle (don't change state). This is the "skip cycle on error" approach from Claude's discretion.

### Pitfall 6: Pi sensor_id Mismatch
**What goes wrong:** Query returns no rows because the Pi posts with `sensor_id='ph'` but the query filters on `sensor_id='wr-ph-real'`.
**Why it happens:** Phase 13 decision: `hub_id='pi-habitat-01'`, `sensor_id='wr-ph-real'` set in `.env`. If the Pi's `.env` was configured differently, the query never finds Pi data.
**How to avoid:** Log at startup which hub_id/sensor_id the loop is querying. Verify with a direct SQL query during deploy verification.

## Code Examples

### Full state machine cycle (reference skeleton)
```python
# Source: synthesized from biosim_bridge.py, biosim_import_log.py, biosimMalfunctions.ts patterns
def _run_cycle(self, sim_id, loop_count, malfunction_active, malfunction_id):
    pi_row = get_latest(PI_HUB_ID, PI_SENSOR_ID)
    biosim_row = get_latest(BIOSIM_HUB_ID, BIOSIM_SENSOR_ID)

    if is_stale(pi_row, STALE_SECONDS):
        if not self._was_stale:
            self.stdout.write("[control_loop] Pi data went stale — holding malfunction state")
            self._was_stale = True
        # No state changes when stale
        return malfunction_active, malfunction_id

    if self._was_stale:
        self.stdout.write(f"[control_loop] Pi data resumed — Pi pH={pi_row.sensor_val:.2f}")
        self._was_stale = False

    if biosim_row is None:
        return malfunction_active, malfunction_id  # Can't compute divergence

    divergence = abs(pi_row.sensor_val - biosim_row.sensor_val)
    recovery_threshold = PH_THRESHOLD - 0.1  # Hysteresis deadband

    if not malfunction_active and divergence >= PH_THRESHOLD:
        try:
            malfunction_id = post_malfunction(sim_id)
            malfunction_active = True
            self.stdout.write(
                f"[control_loop] MALFUNCTION triggered — divergence={divergence:.2f} "
                f"(Pi pH={pi_row.sensor_val:.2f}, BioSim pH={biosim_row.sensor_val:.2f})"
            )
        except requests.RequestException as e:
            self.stdout.write(f"[control_loop] BioSim POST failed ({e}) — skipping cycle")

    elif malfunction_active and divergence < recovery_threshold:
        try:
            delete_malfunction(sim_id, malfunction_id)
            malfunction_active = False
            malfunction_id = None
            self.stdout.write(
                f"[control_loop] MALFUNCTION cleared — divergence={divergence:.2f} "
                f"(Pi pH={pi_row.sensor_val:.2f}, BioSim pH={biosim_row.sensor_val:.2f})"
            )
        except requests.RequestException as e:
            self.stdout.write(f"[control_loop] BioSim DELETE failed ({e}) — skipping cycle")

    # Heartbeat every 6 loops (60s)
    if loop_count % 6 == 0:
        state = 'malfunction' if malfunction_active else 'normal'
        self.stdout.write(
            f"[control_loop] alive — Pi pH={pi_row.sensor_val:.2f}, "
            f"BioSim pH={biosim_row.sensor_val:.2f}, "
            f"divergence={divergence:.2f}, state={state}"
        )

    return malfunction_active, malfunction_id
```

### Startup probe with retry
```python
# Source: biosim_bridge.py _connect_with_retry pattern (sync port)
def _probe_with_retry(self):
    delays = [2, 4, 8, 16, 30]
    attempt = 0
    while True:
        try:
            sim_id = probe_sim_id(BIOSIM_URL)
            if sim_id is not None:
                self.stdout.write(f"[control_loop] Found simulation {sim_id}")
                return sim_id
            raise RuntimeError("No active simulation")
        except Exception as e:
            delay = delays[min(attempt, len(delays) - 1)]
            self.stdout.write(f"[control_loop] BioSim not ready ({e}), retry in {delay}s...")
            time.sleep(delay)
            attempt += 1
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cloud Functions for data pipeline | Direct Django REST API + management commands | Phase 11 pivot | Control loop runs as Django command, not separate GCF |
| Local Docker PostgreSQL | Cloud SQL via env vars | Phase 11 pivot | ORM connection via `DB_HOST`/`DB_PASS` — same pattern |
| Async management commands | Sync where appropriate | Phase 14 | `biosim_import_log.py` proves sync works for discrete HTTP; only bridge is async (WebSocket) |

**Deprecated/outdated:**
- GCP Pub/Sub pipeline: replaced entirely by Cloud Run Django endpoint for Pi data ingest
- `asyncio` for BioSim REST calls: only needed for WebSocket; control loop uses sync `requests`

## Open Questions

1. **Orphaned malfunction on control_loop restart**
   - What we know: `malfunction_id` is in-memory only; not persisted
   - What's unclear: Whether to query BioSim for active malfunctions on startup to recover state
   - Recommendation: Skip the complexity for the competition demo — document that restarting control_loop while malfunction is active requires manual `DELETE` via AnomalyDrawer or curl. The `restart: unless-stopped` makes this rare.

2. **BioSim `Grey_Water_Store` malfunction visual effect**
   - What we know: `pump-failure` in `BIOSIM_MALFUNCTION_MAP` already maps to `Grey_Water_Store` with `SEVERE_MALF`/`TEMPORARY_MALF` — and Phase 8 verified this turns the Water Recycling zone red in the frontend
   - What's unclear: Nothing — this is a verified code path from Phase 8
   - Recommendation: Use `intensity='SEVERE_MALF'`, `length='TEMPORARY_MALF'` — confirmed working

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-django 4.12.0 |
| Config file | `django_backend/pytest.ini` |
| Quick run command | `cd django_backend && source venv_local/bin/activate && python -m pytest sensor_data/tests/test_control_loop.py -x` |
| Full suite command | `cd django_backend && source venv_local/bin/activate && python -m pytest sensor_data/tests/ -x` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-01 | ORM query returns latest Pi pH row | unit | `pytest sensor_data/tests/test_control_loop.py::test_get_latest_pi_ph -x` | Wave 0 |
| CTRL-01 | ORM query returns latest BioSim pH row | unit | `pytest sensor_data/tests/test_control_loop.py::test_get_latest_biosim_ph -x` | Wave 0 |
| CTRL-01 | Stale data detection (row older than STALE_SECONDS) | unit | `pytest sensor_data/tests/test_control_loop.py::test_is_stale_when_old -x` | Wave 0 |
| CTRL-01 | Fresh data detection (row within STALE_SECONDS) | unit | `pytest sensor_data/tests/test_control_loop.py::test_is_fresh_when_recent -x` | Wave 0 |
| CTRL-02 | Malfunction POST triggered when divergence >= threshold | unit | `pytest sensor_data/tests/test_control_loop.py::test_malfunction_triggered_at_threshold -x` | Wave 0 |
| CTRL-02 | Malfunction POST NOT triggered when already active | unit | `pytest sensor_data/tests/test_control_loop.py::test_no_duplicate_malfunction -x` | Wave 0 |
| CTRL-02 | Malfunction NOT triggered on stale Pi data | unit | `pytest sensor_data/tests/test_control_loop.py::test_no_malfunction_on_stale_data -x` | Wave 0 |
| CTRL-03 | Malfunction DELETE triggered when divergence < recovery threshold | unit | `pytest sensor_data/tests/test_control_loop.py::test_malfunction_cleared_below_recovery -x` | Wave 0 |
| CTRL-03 | Malfunction NOT cleared when stale (hold state) | unit | `pytest sensor_data/tests/test_control_loop.py::test_malfunction_held_when_stale -x` | Wave 0 |
| CTRL-03 | Hysteresis: no clear when divergence between recovery and trigger thresholds | unit | `pytest sensor_data/tests/test_control_loop.py::test_hysteresis_no_clear_in_deadband -x` | Wave 0 |
| CTRL-04 | Command class importable with correct module path | unit | `pytest sensor_data/tests/test_control_loop.py::test_command_importable -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd django_backend && source venv_local/bin/activate && python -m pytest sensor_data/tests/test_control_loop.py -x`
- **Per wave merge:** `cd django_backend && source venv_local/bin/activate && python -m pytest sensor_data/tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `sensor_data/tests/test_control_loop.py` — all CTRL-XX tests listed above (file does not yet exist)

## Sources

### Primary (HIGH confidence)
- `django_backend/sensor_data/management/commands/biosim_bridge.py` — `probe_sim_id()` pattern, async BaseCommand structure, BIOSIM_URL env var, backoff delays
- `django_backend/sensor_data/management/commands/biosim_import_log.py` — synchronous `discover_sim_id()` pattern, `requests.get/post`, error handling
- `django_backend/sensor_data/models.py` — `EnrichedSensorData` field names: `hub_id`, `sensor_id`, `sensor_val`, `datetime`
- `django_backend/sensor_data/biosim_ingest.py` — `HUB_ID='biosim-habitat-01'`, `wr-ph` derivation formula, sensor_id naming conventions
- `spatialhub-frontend/src/simulation/biosimMalfunctions.ts` — BioSim REST API contract: POST/DELETE URL structure, `{intensity, length}` request body, `{malfunctionID}` response
- `docker-compose.vm.yml` — `bridge` service as template for `control_loop` service: env block, depends_on pattern, restart policy
- `.planning/phases/14-closed-loop-control-service/14-CONTEXT.md` — All locked decisions, discretion areas, integration point details

### Secondary (MEDIUM confidence)
- `django_backend/pytest.ini` — `asyncio_mode = auto`, `DJANGO_SETTINGS_MODULE`, pytest-django version confirmed
- `django_backend/sensor_data/tests/test_biosim_bridge.py` — Test pattern for management commands (AsyncMock, @pytest.mark.django_db)

### Tertiary (LOW confidence)
None — all critical claims verified against project source files.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use in this exact project; no new dependencies
- Architecture: HIGH — patterns directly lifted from working code in the same repo
- Pitfalls: HIGH — derived from reading actual code paths and the locked decisions in CONTEXT.md
- BioSim API contract: HIGH — TypeScript source (`biosimMalfunctions.ts`) is the authoritative contract; Phase 8 verified it works end-to-end

**Research date:** 2026-03-20
**Valid until:** N/A — all findings from project source files, not external docs
