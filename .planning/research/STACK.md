# Stack Research

**Domain:** Physical Sensor Integration — Raspberry Pi + Atlas Scientific pH sensor -> BioSim closed loop
**Researched:** 2026-03-18
**Confidence:** HIGH (versions verified against PyPI, Django docs, BioSim upstream config)

> This document covers ONLY net-new stack additions for the v3.0 Physical Sensor Integration milestone.
> Existing validated stack (React 19, Vite, TypeScript, R3F, Zustand v5, Django 5.2, DRF,
> PostgreSQL, Docker Compose, BioSim, aiohttp>=3.9 already in requirements.txt) is unchanged
> and not re-researched here. The previous v2.0 STACK.md (BioSim Integration) is the
> authoritative source for WebSocket plumbing, Daphne, channels, and Docker networking.
>
> This file covers three new concerns only:
> 1. Pi-side Python client (hubcode rewrite)
> 2. Django ingest endpoint for Pi sensor data
> 3. Control service: real pH vs BioSim pH -> malfunction injection

---

## Recommended Stack

### Pi-Side Python Client (hubcode rewrite)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Python `requests` | 2.32.5 | HTTP POST sensor readings to Django REST API over WiFi | requests 2.32.5 is the current stable release (verified PyPI March 2026). No async needed — the Pi loop is a 5-second blocking cycle. requests is already in `django_backend/requirements.txt` (>=2.31.0), so the team is familiar with it and its behavior is well-understood. aiohttp would be wasted complexity here: the Pi has one thing to do and the latency of a LAN POST is <10ms. |
| Python `python-dotenv` | 1.2.2 | Load per-device config (DJANGO_URL, HUB_ID, SENSOR_ADDR) from a `.env` file on the Pi | 1.2.2 is the latest release as of 2026-03-01 (verified via PyPI). Replaces hardcoded constants scattered across `sensor_logger.py`, `snyc_to_postgres.py`, and `basic_funcs.py`. A single `.env` on the Pi holds everything a deployer needs to change — no code edits required. Uses the same `.env` pattern already established in the Django docker-compose stack so the mental model is consistent. Requires Python >=3.10 — compatible with Pi OS Bookworm (Python 3.11). |
| `AtlasI2C.py` | existing (no version) | Read pH from Atlas Scientific EZO pH circuit via I2C | Already in `hubcode/`. The `query_device_data()` method is what `sensor_logger.py` calls and it works. Do not replace or wrap this. The rewrite should import it as-is — zero changes needed to the driver layer. |

### Django Ingest Endpoint

No new packages are required. The ingest endpoint is a standard DRF `APIView` POST that:
- Deserializes JSON using a new `PiSensorDataSerializer` backed by `RawSensorData` and `EnrichedSensorData` models that already exist
- Uses `@csrf_exempt` via DRF's `APIView` (DRF views are CSRF-exempt for non-session auth by default — no decorator needed, no middleware change)
- Writes to `raw_sensor_data` table (existing model, no migration)

The only dependency concern is that the Pi will POST to `http://<host-ip>:8000/api/pi-ingest/` and `ALLOWED_HOSTS = ["*"]` is already set in `settings.py`. CORS is not relevant here — CORS only affects browser fetch calls, not server-to-server or device-to-server HTTP. The existing `CORS_ALLOWED_ORIGINS` list does not need to be changed.

### Control Service (closed-loop pH comparator)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `aiohttp` | >=3.9 (already in requirements.txt; latest 3.13.3) | Async HTTP client to POST malfunctions to BioSim REST API and GET current BioSim simulation state | Already a direct dependency in `requirements.txt` and actively used in `biosim_bridge.py`. The bridge management command proves the pattern works: `aiohttp.ClientSession` + `asyncio` for BioSim REST calls. The control service is the same pattern — one async loop, one session. No new install. |
| Django management command | built-in | Run the control service as a long-running process inside the same Django container | Already the established pattern (see `biosim_bridge.py`). Keeps the control loop inside the existing Docker service — no new container, no new orchestration. The command is started alongside the bridge via docker-compose `command` override or added to the entrypoint script. |

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Python `configparser` (stdlib) | stdlib | Alternative to python-dotenv if .env syntax is unfamiliar | Only if the deployer population strongly prefers `.ini` files. python-dotenv is the recommended choice because it matches the docker-compose `.env` file pattern already in the repo. |
| `pytest-requests-mock` or `responses` | any | Mock the Django REST endpoint during Pi client unit tests | Add only if you write tests for the hubcode client. Not needed for production. |

---

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `curl` on the Pi | Manual smoke test before running hubcode | `curl -X POST http://<host>:8000/api/pi-ingest/ -H "Content-Type: application/json" -d '{"hub_id":"test","sensor_name":"ph","sensor_val":7.2,"device_addr":"99","datetime":"2026-03-18T00:00:00Z","sensor_id":"test_99"}'`. Confirms network path before debugging Python. |
| `i2cdetect -y 1` | Detect Atlas Scientific sensor on Pi I2C bus | Run before starting hubcode. Atlas EZO pH default address is 99 (0x63). |
| Docker compose `watch` | Auto-rebuild Django service during control service development | Available in Docker Compose v2.22+. Avoids manual restart when editing the management command. |

---

## Installation

```bash
# Pi-side (run on the Raspberry Pi)
pip install requests==2.32.5 python-dotenv==1.2.2

# Create /home/pi/spatialhub/.env with:
# DJANGO_URL=http://192.168.1.X:8000
# HUB_ID=Xy12Ab34Cd56Ef78Gh90
# SENSOR_ADDR=99

# Django backend — NO new packages needed
# The control service uses aiohttp (already in requirements.txt)
# The ingest endpoint uses existing DRF + models

# Verify aiohttp version in requirements.txt is >=3.9 (already satisfied)
grep aiohttp django_backend/requirements.txt
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `requests` on Pi | `aiohttp` on Pi | Only if the Pi loop is genuinely concurrent (multiple sensors posting simultaneously). For a single-sensor 5-second polling loop, the async overhead of aiohttp is pure noise. |
| `python-dotenv` | Hardcoded constants (current state) | Never. The current `sensor_logger.py` has HUB_ID and SENSOR_ADDR hardcoded. Anyone deploying a second Pi has to edit Python source. This is the exact problem dotenv solves. |
| `python-dotenv` | `configparser` (stdlib) | Use configparser only if avoiding third-party packages is a hard constraint. The API is more verbose and `.ini` format is less readable than `.env` for simple key=value config. |
| `python-dotenv` | environment variables via shell export | Valid but brittle on Pi — environment variables are lost on reboot/session change without `~/.bashrc` modifications. A `.env` file survives reboots and is versioned alongside the code. |
| Django management command | Celery task | Celery requires a broker (Redis), a worker process, and task serialization — 5x the complexity for a single comparison loop. The bridge management command pattern already works and is proven in this codebase. |
| Django management command | Separate Python script (not Django) | Valid, but loses access to the ORM for reading the latest Pi reading from the database and loses the logging/signal handling that management commands provide. |
| POST to `raw_sensor_data` via existing RawSensorData model | Write directly to `enriched_sensor_data` | Write to `raw_sensor_data` first. That preserves the existing data pipeline semantics (raw data = device output, enriched = processed/located). The control service can read from `raw_sensor_data` to get the latest real pH. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `google-cloud-pubsub` on the Pi | The v3.0 goal is explicitly to remove the GCP dependency from hubcode. The current `snyc_to_postgres.py` and `basic_funcs.py` both import pubsub and require a service account JSON file at a hardcoded path — this is what the rewrite eliminates. | `requests` POST directly to Django REST API over WiFi |
| MQTT broker (Mosquitto, HiveMQ) | Adds a new broker service to the Docker stack and a new protocol to the Pi client for no gain. The Django REST API already exists and the Pi posts infrequently (every 5 seconds). MQTT shines for high-frequency fan-out to many subscribers — this use case has one producer and one consumer. | HTTP POST via `requests` |
| SQLite local buffering on Pi (current approach) | The current `sensor_logger.py` inserts to a local SQLite DB and a separate `snyc_to_postgres.py` script syncs it. This two-process pattern made sense with Pub/Sub (async, unreliable cloud path). With a direct LAN POST, the round-trip is <10ms and failure is immediately detectable. The local buffer adds state management complexity with no benefit on a reliable LAN. | Direct POST in the sensor loop; log failures to a flat file for debugging |
| Separate control container | The control service is ~100 lines of Python comparing two float values and conditionally calling `aiohttp.post()`. Spinning up a new Docker service for this is over-engineering. | Django management command in the existing `django` or `bridge` container |
| Django Signals for ingest side-effects | Signals are asynchronous within the request/response cycle but fire synchronously and can cause unexpected latency on the POST endpoint. The control service should read the latest Pi reading on its own polling schedule, not be triggered by signals. | Management command polling loop with a configurable interval |
| `websockets` library for BioSim API calls in the control service | The control service only calls BioSim's REST API (GET simulation state, POST malfunction) — not the WebSocket stream. `aiohttp` is already available and is the correct tool for REST calls. | `aiohttp.ClientSession` for REST; `websockets` library is for the bridge's WS subscription |

---

## BioSim Malfunction API — What the Control Service Can Actually Inject

This is the critical integration point. Based on reading the BioSim default config (`configuration/default.biosim`) and the research doc:

**Water-related modules in default BioSim config (exact names verified from source):**

| Module Name | What It Represents | Malfunction Effect |
|-------------|-------------------|-------------------|
| `Grey_Water_Store` | Grey water storage level | Degraded water recycling capacity |
| `Dirty_Water_Store` | Dirty/wastewater storage | Increased waste accumulation |
| `Potable_Water_Store` | Potable water output | Reduced clean water availability |
| `VCCR` | CO2 removal system (air quality) | Secondary: atmosphere degrades if water-to-O2 cycle is disrupted |
| `OGS` | Oxygen generation | Secondary: O2 drops if water electrolysis is compromised |

**There is no `WaterRS` module in the default BioSim configuration.** The existing `biosim_ingest.py` maps water quality to `Grey_Water_Store` fill ratio as a pH proxy (`wr-ph`). The control service should inject malfunctions into `Grey_Water_Store` when real pH diverges, since that is the module the frontend's water-recycling zone reads.

**Malfunction payload (confirmed from BioSim README):**
```json
{
  "intensity": "SEVERE_MALF",
  "duration": "TEMPORARY_MALF"
}
```

**POST endpoint:**
```
POST http://biosim:8009/api/simulation/{simID}/modules/Grey_Water_Store/malfunctions
```

**Intensity levels (confirmed):** `SEVERE_MALF`, `MEDIUM_MALF`, `LOW_MALF`
**Duration levels (confirmed):** `TEMPORARY_MALF`, `PERMANENT_MALF`

**Control logic recommendation:**

```
if abs(real_ph - biosim_ph) > THRESHOLD_MODERATE:  # e.g., 0.5 pH units
    inject LOW_MALF / TEMPORARY_MALF into Grey_Water_Store
if abs(real_ph - biosim_ph) > THRESHOLD_SEVERE:    # e.g., 1.5 pH units
    inject SEVERE_MALF / TEMPORARY_MALF into Grey_Water_Store
if abs(real_ph - biosim_ph) <= THRESHOLD_CLEAR:    # e.g., back within 0.2 pH units
    DELETE malfunctions from Grey_Water_Store (clear endpoint)
```

The BioSim `wr-ph` proxy in `biosim_ingest.py` is `(grey_water_level / grey_water_capacity) * 1.5 + 6.0`. When Grey_Water_Store is malfunctioning, its fill ratio changes, which changes the `wr-ph` reading in the frontend — creating the visual closed loop. The control service needs to GET the current simID from `/api/simulation` on startup and cache it; simID is stable for the container lifetime.

---

## Pi-to-Docker Networking

No new infrastructure needed. The Pi posts to the host machine's LAN IP on port 8000 (the Docker-mapped Django port). The host machine's Docker Desktop or Docker Engine maps `0.0.0.0:8000` → Django container port 8000.

**Connection string format for Pi `.env`:**
```
DJANGO_URL=http://192.168.1.X:8000
```

**What must be true for this to work:**
- Pi and the host machine are on the same LAN (same WiFi network or wired subnet)
- Docker is running with `-p 8000:8000` (already in `docker-compose.yml`: `"8000:8000"`)
- `ALLOWED_HOSTS = ["*"]` in Django settings (already set)
- No firewall on the host blocks port 8000 (macOS: System Preferences > Firewall; Linux: `ufw allow 8000`)

**Finding the host IP on macOS:** `ipconfig getifaddr en0` (WiFi) or `en1` (ethernet)
**Finding the host IP on Linux:** `ip route get 1 | awk '{print $7; exit}'`

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `requests` 2.32.5 | Python 3.9+ | Pi OS Bookworm ships Python 3.11 — fine. Pi OS Bullseye ships Python 3.9 — also fine. |
| `python-dotenv` 1.2.2 | Python 3.10+ | Pi OS Bookworm (Python 3.11) works. Pi OS Bullseye (Python 3.9) does NOT work — use python-dotenv 1.0.1 (last version supporting Python 3.9) or upgrade the Pi OS. |
| `aiohttp` 3.13.3 | Python 3.9+ | Already in `requirements.txt` as `aiohttp>=3.9`. 3.13.3 released January 3, 2026. |
| Django 5.2 + DRF | `@csrf_exempt` not needed for DRF `APIView` | DRF's `APIView` enforces its own authentication/permission classes and bypasses Django's session-based CSRF for non-browser clients. A Pi POSTing JSON with no session cookie is not subject to CSRF checks. Confirmed in DRF source: `CSRFExemptSessionAuthentication` is the default. |
| BioSim malfunction API | `Grey_Water_Store` module | Verified as present in `configuration/default.biosim`. Module name is case-sensitive in the URL path. |

---

## Sources

- [PyPI requests 2.32.5](https://pypi.org/project/requests/) — current stable version, Python >=3.9 requirement (HIGH confidence)
- [PyPI python-dotenv 1.2.2](https://pypi.org/project/python-dotenv/) — current stable version, Python >=3.10 requirement (HIGH confidence)
- [PyPI aiohttp 3.13.3](https://pypi.org/project/aiohttp/) — current stable version as of January 2026 (HIGH confidence)
- [BioSim default.biosim config](https://raw.githubusercontent.com/scottbell/biosim/main/configuration/default.biosim) — authoritative module names including `Grey_Water_Store`, `Dirty_Water_Store`, `Potable_Water_Store`; confirmed no `WaterRS` module in default config (HIGH confidence)
- [BioSim GitHub README — malfunction API](https://github.com/scottbell/biosim) — confirmed payload structure, intensity/duration values, endpoint pattern (HIGH confidence)
- [Django REST Framework CSRF docs](https://www.django-rest-framework.org/api-guide/authentication/#sessionauthentication) — confirmed DRF APIView is CSRF-exempt for non-session auth (HIGH confidence)
- [Django `ALLOWED_HOSTS` docs](https://docs.djangoproject.com/en/5.2/ref/settings/#allowed-hosts) — wildcard `"*"` already set in `settings.py`, confirmed accepts Pi requests (HIGH confidence)
- `django_backend/requirements.txt` in this repo — confirmed `aiohttp>=3.9` already present, no new install needed for control service (HIGH confidence, direct read)
- `docker-compose.yml` in this repo — confirmed `"8000:8000"` port mapping, Django accessible at host LAN IP (HIGH confidence, direct read)
- `django_backend/sensor_data/biosim_ingest.py` in this repo — confirmed `wr-ph` is derived from `Grey_Water_Store` fill ratio, identifying the correct malfunction injection target (HIGH confidence, direct read)
- WebSearch: DRF POST endpoint patterns for IoT sensor data 2025 — confirmed APIView POST pattern, no special IoT libraries needed (MEDIUM confidence)

---
*Stack research for: Physical Sensor Integration (v3.0 milestone)*
*Researched: 2026-03-18*
