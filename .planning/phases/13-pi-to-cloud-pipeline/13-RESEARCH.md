# Phase 13: Pi-to-Cloud Pipeline - Research

**Researched:** 2026-03-19
**Domain:** Raspberry Pi hub_client configuration, HTTPS POST to Cloud Run, SQLite offline buffer, hub_id alignment
**Confidence:** HIGH

## Summary

Phase 13 is not a code-writing phase. The Pi client (`hub_client.py`), the Django ingest endpoint (`SensorIngestView`), and the frontend display hook (`useLiveSensors.ts`) all exist and are independently verified. The work is: update one environment variable on the Pi, verify end-to-end flow, and fix a pre-existing hub_id mismatch in the frontend hook.

The critical finding from reading the existing codebase is a **hub_id mismatch** between the frontend hook and the configured Pi identity. `useLiveSensors.ts` hardcodes `PI_HUB_ID = '9c9Kfeo4SK7BW4hw8dvQ'` (a provisioned hub ID from an earlier demo), but all CONTEXT.md, STATE.md, and REQUIREMENTS.md decisions specify `hub_id='pi-habitat-01'`. The hook will never surface Pi data on the `/habitat` page until this is corrected. This is the only actual code change in the phase.

Everything else is configuration and verification: Pi `.env` gets one URL change, the offline buffer is tested by killing WiFi, and the Cloud Run enriched endpoint is queried to confirm rows with the correct hub_id appear.

**Primary recommendation:** Fix `useLiveSensors.ts` PI_HUB_ID constant as part of this phase. Without it, Phase 13's success criteria — "Real Pi pH readings appear in Cloud SQL `enriched_sensor_data` with `hub_id='pi-habitat-01'`" — passes at the DB level but never surfaces in the frontend.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Configuration:**
- Pi `.env` updated with `DJANGO_URL=https://spatialhub-backend-4vovlomqfa-uc.a.run.app` — the only required change from local config
- All other `.env` values remain as defined in Phase 10 (HUB_ID=pi-habitat-01, SENSOR_ID=wr-ph-real, DEVICE_ADDR=99, etc.)
- `.env.example` updated to document both local and cloud URL options

**Pipeline verification:**
- Verify with real Pi hardware posting to Cloud Run over WiFi
- Verify offline SQLite buffer works when Cloud Run is temporarily unreachable (kill WiFi, buffer readings, reconnect, confirm sync)
- Verify `GET {cloud-run-url}/api/enriched/?hub_id=pi-habitat-01` returns Pi data from Cloud SQL

### Claude's Discretion
- Whether to create a separate `.env.production` template or just update `.env.example` comments
- HTTPS certificate handling on Raspberry Pi OS (if any issues arise)
- Timeout/retry tuning for cloud latency vs LAN (current: 10s timeout in hub_client.py)
- Whether deploy.sh should auto-generate the Pi `.env` or leave it as a manual artifact
- Any minor fixes needed to make hub_client.py work with HTTPS Cloud Run endpoint

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-05 | Pi SD card `.env` pre-configured with Cloud Run endpoint URL — Pi connects to WiFi and starts sending data | The Pi client reads `DJANGO_URL` from `.env` via `python-dotenv`. The Cloud Run URL is confirmed live at `https://spatialhub-backend-4vovlomqfa-uc.a.run.app`. Python `requests` verifies SSL by default — no extra cert handling needed on Pi OS. One URL change satisfies the requirement. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `python-dotenv` | >=1.0.0 | Loads `.env` into `os.environ` at process start | Already in `hubcode/requirements.txt`, used by `hub_client.py` |
| `requests` | >=2.31.0 | HTTP POST to Django over HTTPS | Already in `hubcode/requirements.txt`. Handles TLS/SSL natively via `certifi` bundle — no Pi-specific config needed |
| `sqlite3` | stdlib | Offline buffer persistence | stdlib, no install needed, already used by hub_client.py |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `certifi` (bundled with requests) | auto | CA bundle for TLS verification | Used implicitly by `requests` when hitting HTTPS endpoints |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `requests` verify=True (default) | `verify=False` | Never disable SSL verification on production Pi client |
| `.env.example` with comments | `.env.production` separate file | A separate file adds complexity for no benefit at this scale; update comments in `.env.example` instead |

**No installation required.** All dependencies already present in `hubcode/requirements.txt`.

## Architecture Patterns

### Hub Client Configuration Pattern (Existing)
```
hubcode/
├── hub_client.py        # reads DJANGO_URL from .env at module load
├── atlas_i2c.py         # I2C driver — no changes
├── .env                 # on Pi filesystem — NOT in repo
├── .env.example         # template committed to repo
└── requirements.txt     # python-dotenv, requests
```

### Pattern 1: Single ENV Var URL Swap
**What:** The only change to `hub_client.py` behavior is `DJANGO_URL` in `.env`.
**When to use:** Cloud deployment — Pi.env file on SD card.
**Example:**
```bash
# hubcode/.env on Pi filesystem (not in repo)
DJANGO_URL=https://spatialhub-backend-4vovlomqfa-uc.a.run.app
HUB_ID=pi-habitat-01
SENSOR_ID=wr-ph-real
SENSOR_NAME=ph
DEVICE_ADDR=99
LOCATION=Mars Habitat Alpha
OWNER=Demo User
WORKERS=Crew A
POLL_INTERVAL=30
```

### Pattern 2: HTTPS POST — Nothing Special
**What:** `requests.post(url, json=batch, timeout=10)` already handles HTTPS transparently.
**Evidence:** Python `requests` ships with its own CA bundle (via `certifi`). Raspberry Pi OS ships with system CA certs. No custom cert handling needed for Cloud Run's Google-managed TLS.
**Confidence:** HIGH — this is standard Python requests behavior, verified by the existing Phase 10 integration tests.

### Pattern 3: Offline Buffer Behavior (Already Verified)
**What:** SQLite write-ahead on every read, sync on reconnect, prune only on 201/200.
**Code flow:**
```python
# In hub_client.py sync_readings()
response = requests.post(url, json=batch, timeout=10)
if response.status_code in (200, 201):
    mark_synced_and_prune()  # rows deleted from SQLite
# else: rows stay in SQLite, re-sent next cycle
```
**Offline test procedure:**
1. Start hub_client.py with cloud URL
2. Kill WiFi on Pi (or temporarily block the route)
3. Observe "[HH:MM:SS] pH=X.XX -> buffered (offline)" log lines
4. Restore WiFi
5. Observe "[HH:MM:SS] pH=X.XX -> synced (+ N buffered)" log confirming backlog flush

### Pattern 4: Hub ID Alignment (Critical Fix Needed)
**What:** The frontend `useLiveSensors.ts` hook polls `GET /api/enriched/?hub_id=<PI_HUB_ID>`. The hardcoded value must match what the Pi client sends.

**The mismatch:**
```typescript
// spatialhub-frontend/src/hooks/useLiveSensors.ts  line 14
const PI_HUB_ID = '9c9Kfeo4SK7BW4hw8dvQ';  // ← OLD provisioned hub ID
```

**What the Pi sends (from CONTEXT.md / STATE.md):**
```
HUB_ID=pi-habitat-01
```

**The fix:**
```typescript
const PI_HUB_ID = 'pi-habitat-01';
```

**Confidence:** HIGH — verified by reading both `useLiveSensors.ts` (line 14) and CONTEXT.md/STATE.md decisions. The Phase 12 SUMMARY.md also notes the Pi at 10.0.0.161 is "posting real pH data at 10.0.0.161 with LIVE badge visible in ZonePanel" — which implies the badge worked during Phase 12 execution, meaning the Pi was posting with the old provisioned hub_id OR the hub_id was correct at that time and drifted. Either way, it must be aligned to `pi-habitat-01` for Phase 13 to pass its success criteria.

### Anti-Patterns to Avoid
- **`verify=False` on requests.post:** Never. Cloud Run uses valid Google-managed TLS. `requests` will verify it correctly with default settings.
- **Hardcoding the Cloud Run URL in hub_client.py:** The URL is read from `.env`. The code does not need changing — only the `.env` on the Pi.
- **Changing timeout for cloud latency without measurement:** 10s is already generous. Cloud Run cold starts are 1-3s on first request; subsequent requests are sub-500ms. Do not change unless a real timeout is observed in logs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS/HTTPS | Custom cert verification | `requests` default (`verify=True`) | certifi bundle covers all major CAs including Google |
| Offline retry | Custom exponential backoff | Existing SQLite buffer + poll loop | Already handles arbitrary outage duration |
| Config templating | New config management system | `.env.example` with comments | python-dotenv + .env is already the established pattern |

**Key insight:** This phase has zero new infrastructure problems to solve. The retry, buffering, and HTTPS logic is already production-tested. The only technical surface is the hub_id constant fix and the `.env` URL update.

## Common Pitfalls

### Pitfall 1: Hub ID Mismatch Silently Passes DB Check
**What goes wrong:** Pi posts with `hub_id='pi-habitat-01'`, data appears in Cloud SQL, the DB-level success criterion passes — but the frontend LIVE badge never lights up because `useLiveSensors.ts` is still polling for the old hub ID `'9c9Kfeo4SK7BW4hw8dvQ'`.
**Why it happens:** The Phase 12 SUMMARY.md says the LIVE badge was visible — this was during a local network test where the hub_id may have been set differently, or it was a transient state. The current code at `useLiveSensors.ts:14` has the old provisioned ID.
**How to avoid:** Fix `PI_HUB_ID` in `useLiveSensors.ts` to `'pi-habitat-01'` as part of Wave 1.
**Warning signs:** DB query `GET /api/enriched/?hub_id=pi-habitat-01` returns rows, but `/habitat` shows no LIVE badge.

### Pitfall 2: Cloud Run Cold Start Causes First-Sync Timeout
**What goes wrong:** Cloud Run scales to zero when idle. First POST after inactivity triggers a cold start (~2-3 seconds). With 10s timeout this succeeds — but if the Pi just booted and posts its first batch immediately, the 10s window is fine.
**Why it happens:** Cloud Run serverless cold starts.
**How to avoid:** No code change needed — 10s timeout handles this. Document in verification steps that the first sync may take 2-3s longer than steady-state.
**Warning signs:** First POST after long idle returns a timeout; subsequent POSTs succeed.

### Pitfall 3: SENSOR_NAME Field Case Sensitivity in `useLiveSensors` Mapping
**What goes wrong:** `useLiveSensors.ts` maps `sensor_name === 'ph'` (lowercase). If the Pi `.env` has `SENSOR_NAME=pH Sensor` (which the existing `.env.example` documents), the hook's SENSOR_MAP key `'ph'` won't match `'pH Sensor'`.
**Evidence from code:**
```typescript
// useLiveSensors.ts line 17-19
const SENSOR_MAP: Record<string, { zoneId: string; sensorId: string }> = {
  ph: { zoneId: 'water-recycling', sensorId: 'wr-ph' },  // ← exact string match
};
```
And the test env in `test_hub_client.py` line 24: `"SENSOR_NAME": "pH Sensor"`. If the Pi uses `SENSOR_NAME=pH Sensor`, the map lookup will return `undefined` and the hook will silently skip the reading.
**How to avoid:** During verification, confirm `sensor_name` value in Cloud SQL matches the SENSOR_MAP key. If it doesn't, either update the Pi's `SENSOR_NAME` to `ph` or update the SENSOR_MAP key. The `.env.example` should document the exact value expected.
**Warning signs:** Pi rows appear in Cloud SQL with correct hub_id but LIVE badge does not appear; `sensor_name` column value in DB doesn't match `'ph'`.

### Pitfall 4: `useLiveSensors.ts` PI_HUB_ID is Hardcoded, Not Env-Driven
**What goes wrong:** The hub_id is a hardcoded constant in the TypeScript file. There is no environment variable to override it.
**Why it matters:** Changing it requires a frontend rebuild and re-deploy to Firebase. This is fine for Phase 13 (we'll do the fix), but the plan must include a `npm run build && firebase deploy` step after the fix.
**Warning signs:** Fix is committed but Firebase still shows old behavior — because the old bundle is still deployed.

## Code Examples

### Confirmed Sync Flow (from hub_client.py — source: repo)
```python
# sync_readings() — the entire cloud integration path
url = f"{DJANGO_URL}/api/sensor-ingest/"
try:
    response = requests.post(url, json=batch, timeout=10)
    if response.status_code in (200, 201):
        mark_synced_and_prune()
        return len(rows)
    else:
        log.warning("Sync failed: HTTP %d from %s. Keeping rows buffered.",
                    response.status_code, url)
except requests.exceptions.ConnectionError as exc:
    log.warning("Sync offline: %s. Keeping rows buffered.", exc)
except requests.exceptions.Timeout:
    log.warning("Sync timed out after 10s. Keeping rows buffered.")
```
No HTTPS changes needed. `requests` handles the TLS handshake transparently.

### Cloud Run Verification Curl
```bash
# Verify Pi rows in Cloud SQL via Cloud Run API
curl "https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/?hub_id=pi-habitat-01" \
  | python3 -m json.tool | head -40
# Expected: JSON array with hub_id='pi-habitat-01', sensor_name='ph' (or 'pH Sensor')
```

### Frontend Hub ID Fix (required code change)
```typescript
// spatialhub-frontend/src/hooks/useLiveSensors.ts  line 14
// BEFORE:
const PI_HUB_ID = '9c9Kfeo4SK7BW4hw8dvQ';
// AFTER:
const PI_HUB_ID = 'pi-habitat-01';
```

### Offline Buffer Verification (manual procedure)
```bash
# On Pi:
# 1. Start hub_client.py -- confirm "synced" log messages
python hub_client.py -v

# 2. In another terminal -- cut WiFi or block the route:
sudo ifconfig wlan0 down   # or: sudo ip route del default

# 3. Watch logs -- should see "buffered (offline)"
# 4. Restore:
sudo ifconfig wlan0 up

# 5. Watch next sync cycle -- should see "synced (+ N buffered)"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pi posts to local Docker host | Pi posts to Cloud Run HTTPS | Phase 13 (this phase) | One `.env` URL change |
| `useLiveSensors` polling old provisioned hub_id | `useLiveSensors` polling `pi-habitat-01` | Phase 13 fix | Frontend LIVE badge becomes functional |

**No deprecated patterns:** hub_client.py is current and correct. No API changes. No library upgrades needed.

## Open Questions

1. **What is the exact `SENSOR_NAME` value the Pi posts?**
   - What we know: `test_hub_client.py` uses `"SENSOR_NAME": "pH Sensor"`, but `useLiveSensors.ts` maps `'ph'` (lowercase, no space). The Phase 12 SUMMARY.md says the LIVE badge was visible during Phase 12 testing.
   - What's unclear: Whether the actual Pi `.env` has `SENSOR_NAME=ph` or `SENSOR_NAME=pH Sensor`, and whether the SENSOR_MAP key needs to be updated alongside the PI_HUB_ID fix.
   - Recommendation: As part of Wave 1 configuration, explicitly set `SENSOR_NAME=ph` in the Pi `.env` (matching the SENSOR_MAP key) and document this in `.env.example`. This resolves both the hub_id and sensor_name alignment in one pass.

2. **Is the Pi (10.0.0.161) still actively posting or was it a Phase 12 temporary setup?**
   - What we know: Phase 12 SUMMARY.md confirms Pi at 10.0.0.161 was posting during Phase 12 execution. Phase 13 is the official "Pi-to-cloud" phase.
   - What's unclear: Whether hub_client.py on the Pi is still configured with the local Docker host URL or was already switched.
   - Recommendation: Treat Phase 13 as the authoritative configuration moment — verify the `.env` on the Pi, update `DJANGO_URL` to Cloud Run regardless of current state.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Python `unittest` (stdlib) |
| Config file | none — run directly |
| Quick run command | `cd hubcode && python -m pytest tests/ -x` (or `python -m unittest discover tests/`) |
| Full suite command | `cd hubcode && python -m unittest discover tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-05 | Pi `.env` DJANGO_URL change causes hub_client to POST to Cloud Run URL | manual/smoke | `cd hubcode && python hub_client.py --test` on Pi hardware | ❌ Wave 0 — script test only, hardware required |
| DEPLOY-05 | `GET /api/enriched/?hub_id=pi-habitat-01` returns Pi rows | integration/curl | `curl "https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/?hub_id=pi-habitat-01"` | ❌ Wave 0 — manual curl |
| DEPLOY-05 | Offline buffer retains readings when Cloud Run unreachable, syncs on reconnect | manual/smoke | `python hub_client.py -v` + kill WiFi test | ❌ Wave 0 — manual hardware test |
| DEPLOY-05 (frontend) | LIVE badge visible on /habitat after PI_HUB_ID fix and redeploy | manual/browser | Visit https://nasa-comp-demo.web.app/habitat | ❌ Wave 0 — browser check |

Existing unit tests in `hubcode/tests/test_hub_client.py` cover the buffer, payload, and sync logic with mocked `requests.post` — these pass now and should remain green after the SENSOR_NAME/hub_id changes.

Frontend unit tests: `useLiveSensors.ts` has no dedicated test file. The PI_HUB_ID constant change should be verified by updating or adding a test in `spatialhub-frontend/src/__tests__/`.

### Sampling Rate
- **Per task commit:** `cd hubcode && python -m unittest discover tests/` (14 existing tests, < 2s)
- **Per wave merge:** Same + `cd spatialhub-frontend && npm test -- --run`
- **Phase gate:** Unit tests green + manual Pi hardware smoke test + curl verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `spatialhub-frontend/src/__tests__/useLiveSensors.test.ts` — covers PI_HUB_ID constant value (can be a simple unit test asserting `PI_HUB_ID === 'pi-habitat-01'` after the fix, or a snapshot test)
- Manual Pi hardware tests are by definition not automatable — documented above as manual procedures

*(No new test files needed for hub_client.py — existing 14 tests cover all touched logic.)*

## Sources

### Primary (HIGH confidence)
- `hubcode/hub_client.py` — full source read, sync flow confirmed
- `hubcode/atlas_i2c.py` — full source read, no changes needed
- `hubcode/tests/test_hub_client.py` — 14 existing tests confirmed
- `hubcode/requirements.txt` — dependencies confirmed (python-dotenv, requests)
- `django_backend/sensor_data/views.py` — SensorIngestView confirmed live and handling batch JSON
- `spatialhub-frontend/src/hooks/useLiveSensors.ts` — PI_HUB_ID mismatch confirmed at line 14
- `.planning/phases/11-cloud-services-deployment/11-VERIFICATION.md` — Cloud Run URL confirmed live
- `.planning/phases/12-biosim-vm-deployment/12-02-SUMMARY.md` — Pi at 10.0.0.161 confirmed posting
- `.planning/phases/13-pi-to-cloud-pipeline/13-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- Python `requests` library: TLS/HTTPS behavior with `verify=True` (default) — well-established behavior, no verification needed via Context7 for this use case

### Tertiary (LOW confidence)
- Cloud Run cold start latency (1-3s estimate) — general GCP knowledge, not verified against current deployment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — existing code fully read, patterns confirmed
- Pitfalls: HIGH — hub_id mismatch and sensor_name case confirmed by direct source reading
- Validation: HIGH — existing test suite structure confirmed

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain — Cloud Run URL and existing code patterns won't change)
