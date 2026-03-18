# Architecture Research

**Domain:** Physical sensor integration — Raspberry Pi + Atlas Scientific pH → BioSim closed loop
**Milestone:** v3.0 (subsequent to v2.0 BioSim Integration)
**Researched:** 2026-03-18
**Confidence:** HIGH — all integration points derived from direct codebase analysis, no guesswork

---

## Context: What Already Exists (v2.0 shipped)

This is a subsequent milestone. The full v2.0 stack is live. Before designing anything new, here is the exact v2.0 topology this research builds on.

### Docker Compose (current)

```
docker-compose.yml
  db       postgres:16            :5432
  biosim   BioSim JRE             :8009  (REST + WebSocket)
  openmct  openmct-biosim         :9091
  django   gunicorn               :8000
  bridge   python manage.py biosim_bridge
```

### Data Sources in `enriched_sensor_data` (current)

| hub_id | Written by | Content |
|--------|-----------|---------|
| `biosim-habitat-01` | `bridge` service via `biosim_ingest.py` | BioSim physics tick values (12 sensors) |

### Existing Django API Surface

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/raw/` | GET | Live |
| `/api/enriched/` | GET | Live — supports `?hub_id=` and `?sensor_name=` filters |
| `/api/hub/` | GET | Live |
| `/api/provision/` | POST | Live |
| `/api/send-command/` | POST | Live but GCP-dependent (Pub/Sub) — irrelevant for v3 |
| `/api/habitat/zones/` | GET | Live |

### Existing Frontend Data Pipeline

```
BioSim WS (ws://localhost:8009/ws/simulation/{id})
    |
    biosimWorker.ts (Web Worker)
    |
    biosimMapper.ts  ->  habitatStore.tick()  ->  3D scene
    (wr-ph = Grey_Water_Store fill ratio proxy)
```

---

## v3.0 New Architecture: What Changes

### Full System Diagram (v3.0)

```
+-------------------------------------------------------------+
|  Raspberry Pi (on WiFi LAN)                                 |
|                                                             |
|  AtlasI2C driver (addr=99)                                 |
|       |                                                     |
|  hub_client.py  <-- config.yaml (DJANGO_URL, HUB_ID)       |
|       |  read pH every 5s                                   |
|       |  POST /api/sensor-ingest/  (HTTP over WiFi)         |
|       |  SQLite buffer (offline resilience)                 |
+-------|-----------------------------------------------------+
        |
        | POST {hub_id, sensor_id, sensor_val, ...}
        v
+-------------------------------------------------------------+
|  Docker Compose Stack                                       |
|                                                             |
|  django (:8000)                                             |
|  +---------------------------+  +------------------------+  |
|  |  SensorIngestView  [NEW]  |  |  All existing views    |  |
|  |  POST /sensor-ingest/     |  |  (zero changes)        |  |
|  |  writes EnrichedSensorData|  +------------------------+  |
|  |  hub_id='pi-habitat-01'   |                             |
|  +------------+--------------+                             |
|               |                                            |
|               v                                            |
|  db (postgres:16)                                          |
|  enriched_sensor_data                                      |
|  +--------------------------+  +-----------------------+   |
|  | hub_id='biosim-habitat-01|  | hub_id='pi-habitat-01'|   |
|  | BioSim ticks (bridge)    |  | Real pH readings (new)|   |
|  +--------------------------+  +-----------------------+   |
|                                                            |
|  control [NEW Docker service]                              |
|  python manage.py ph_control_loop                          |
|  +------------------------------------------------------+  |
|  |  every 10s:                                           |  |
|  |  1. latest pi-habitat-01 / wr-ph-real from DB        |  |
|  |  2. latest biosim-habitat-01 / wr-ph from DB         |  |
|  |  3. if |real - sim| > threshold:                     |  |
|  |       POST malfunction to BioSim                     |  |
|  |  4. if divergence resolves:                          |  |
|  |       DELETE malfunction from BioSim                 |  |
|  +-------------------------------+-----------------------+  |
|                                  |                         |
|                                  | POST/DELETE             |
|                                  v                         |
|  biosim (:8009)                                            |
|  /api/simulation/{id}/modules/Grey_Water_Store/malfunctions|
|             |                                              |
|             | BioSim physics responds                      |
|             v                                              |
|  bridge (existing, unchanged)                              |
|  biosim_bridge: WS -> enriched_sensor_data                 |
|  hub_id='biosim-habitat-01'                                |
+-------------------------------------------------------------+
        |
        | WS: ws://localhost:8009/ws/simulation/{id}
        | (browser connects directly to BioSim)
        v
+-------------------------------------------------------------+
|  React Frontend                                             |
|                                                             |
|  useSimSource.ts  ->  biosimWorker.ts  ->  biosimMapper.ts  |
|       |                                         |           |
|       |               habitatStore.tick()  <----+           |
|       |                      |                              |
|       |               3D habitat scene                      |
|       |           (BioSim physics drives 3D)                |
|       |                                                     |
|  Water Recycling zone panel  [MODIFIED]                     |
|  +--------------------------------------------------+       |
|  |  wr-ph (BioSim proxy) — existing sensor orb     |       |
|  |  Real pH: 7.14 [NEW]                             |       |
|  |    <- GET /api/enriched/?hub_id=pi-habitat-01    |       |
|  |    <- polled every 10s                           |       |
|  +--------------------------------------------------+       |
+-------------------------------------------------------------+
```

---

## Component Responsibilities

### New vs Modified vs Unchanged

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `hub_client.py` | NEW (replaces `basic_funcs.py` + `snyc_to_postgres.py`) | Config-driven Pi script: read pH via AtlasI2C, POST to Django, SQLite buffer for offline resilience, no GCP dependency |
| `SensorIngestView` | NEW | Django DRF view at `POST /api/sensor-ingest/`: validate payload, write one `EnrichedSensorData` row with `hub_id='pi-habitat-01'` |
| `ph_control_loop` (mgmt cmd) | NEW | Django management command: poll DB every 10s, compare real vs BioSim pH, drive BioSim malfunctions via REST |
| `control` Docker service | NEW | Runs `python manage.py ph_control_loop` in same Django image — identical pattern to `bridge` |
| Water Recycling zone panel | MODIFIED | Add secondary "Real pH" display alongside BioSim proxy value |
| `urls.py` | MODIFIED | Add one path: `path('sensor-ingest/', ...)` |
| `docker-compose.yml` | MODIFIED | Add `control` service |
| `bridge` service | UNCHANGED | BioSim WS -> `enriched_sensor_data`, `hub_id='biosim-habitat-01'` |
| `biosim_bridge.py` | UNCHANGED | Management command behind `bridge` service |
| `biosimMapper.ts` | UNCHANGED | Maps BioSim modules to ZoneState — `wr-ph` stays as physics proxy |
| `habitatStore.ts` | UNCHANGED | tick / triggerAnomaly / cancelAnomaly |
| `useSimSource.ts` | UNCHANGED | Probe / connect / fallback lifecycle |
| `biosimWorker.ts` | UNCHANGED | Web Worker owning BioSim WebSocket |
| All other frontend components | UNCHANGED | Read from Zustand store — source is invisible |
| `EnrichedSensorData` model | UNCHANGED | No migration needed |
| All other Django views | UNCHANGED | |
| BioSim | UNCHANGED | Receives malfunction POSTs from control loop (same API already used by frontend) |

---

## Data Model

The existing `EnrichedSensorData` table handles both data sources. No migration required.

### Row Shape: Pi Sensor Reading

| Field | Value |
|-------|-------|
| `hub_id` | `pi-habitat-01` |
| `sensor_id` | `wr-ph-real` |
| `sensor_name` | `ph` |
| `device_addr` | `water-recycling` |
| `sensor_val` | `7.14` (Atlas Scientific reading) |
| `location` | `Mars Habitat Alpha` (from Pi config) |
| `owner` | `pi-hub-01` (from Pi config) |
| `workers` | configurable string |
| `datetime` | UTC timestamp of POST |

### Differentiation Between Sources

```python
# BioSim data
EnrichedSensorData.objects.filter(hub_id='biosim-habitat-01')

# Pi data
EnrichedSensorData.objects.filter(hub_id='pi-habitat-01')

# Both (for /api/enriched/ historical view)
EnrichedSensorData.objects.all().order_by('-datetime')
```

The existing `/api/enriched/` GET endpoint already supports `?hub_id=pi-habitat-01` filtering with zero changes — the `EnrichedSensorListView` already handles the `hub_id` query param (confirmed in `views.py`).

---

## New Component Design

### 1. Pi Hubcode Rewrite (`hub_client.py`)

Replaces `basic_funcs.py` (GCP Pub/Sub subscriber) and `snyc_to_postgres.py` (GCP sync). GCP dependency eliminated entirely.

**Configuration** (YAML file on Pi, checked into `hubcode/`):

```yaml
django_url: "http://192.168.1.x:8000"
hub_id: "pi-habitat-01"
sensor_addr: 99
poll_interval_s: 5
location: "Mars Habitat Alpha"
owner: "pi-hub-01"
workers: "Atlas Scientific EZO-pH"
```

**Behavior:**
- Read pH via `AtlasI2C` every `poll_interval_s` seconds (keep existing `AtlasI2C.py` untouched)
- POST to `{django_url}/api/sensor-ingest/`
- On connection failure: write to local SQLite buffer, retry on next poll
- Flush SQLite buffer before new readings when connection restored

**POST payload:**

```json
{
  "hub_id": "pi-habitat-01",
  "sensor_id": "wr-ph-real",
  "sensor_name": "ph",
  "device_addr": "water-recycling",
  "sensor_val": 7.14,
  "location": "Mars Habitat Alpha",
  "owner": "pi-hub-01",
  "workers": "Atlas Scientific EZO-pH"
}
```

### 2. Django `SensorIngestView`

**Location:** `django_backend/sensor_data/views.py`
**URL registration:** `sensor_data/urls.py` — add `path('sensor-ingest/', SensorIngestView.as_view(), name='sensor-ingest')`

Minimal implementation — no enrichment step needed (Pi sends all fields directly, unlike the old GCP path that required a `hub_config` lookup):

```python
class SensorIngestView(APIView):
    def post(self, request):
        required = ['hub_id', 'sensor_id', 'sensor_name', 'device_addr', 'sensor_val']
        for field in required:
            if field not in request.data:
                return Response({'error': f'{field} required'}, status=400)
        try:
            EnrichedSensorData.objects.create(
                hub_id=request.data['hub_id'],
                sensor_id=request.data['sensor_id'],
                sensor_name=request.data['sensor_name'],
                device_addr=request.data['device_addr'],
                sensor_val=float(request.data['sensor_val']),
                datetime=timezone.now(),
                location=request.data.get('location', ''),
                owner=request.data.get('owner', ''),
                workers=request.data.get('workers', ''),
            )
            return Response({'status': 'ok'}, status=201)
        except Exception as e:
            return Response({'error': str(e)}, status=500)
```

No new serializer needed for this write-only endpoint.

### 3. Control Loop Management Command (`ph_control_loop.py`)

**Location:** `django_backend/sensor_data/management/commands/ph_control_loop.py`

```python
DIVERGENCE_THRESHOLD = 0.5   # pH units — tune to hardware noise floor
CHECK_INTERVAL_S = 10
BIOSIM_URL = os.environ.get('BIOSIM_URL', 'http://biosim:8009')

# Intensity scaling
def intensity_for(divergence):
    if divergence < 1.0:
        return 'LOW_MALF'
    elif divergence < 2.0:
        return 'MEDIUM_MALF'
    else:
        return 'SEVERE_MALF'
```

**Logic:**

```
every CHECK_INTERVAL_S seconds:
  1. real_ph = latest EnrichedSensorData(hub_id='pi-habitat-01', sensor_id='wr-ph-real').sensor_val
  2. sim_ph  = latest EnrichedSensorData(hub_id='biosim-habitat-01', sensor_id='wr-ph').sensor_val
     (wr-ph is the Grey_Water_Store fill ratio proxy written by bridge/biosim_ingest.py)
  3. divergence = |real_ph - sim_ph|
  4. if divergence > DIVERGENCE_THRESHOLD and not malfunction_active:
       sim_id = probe BioSim GET /api/simulation
       POST /api/simulation/{id}/modules/Grey_Water_Store/malfunctions
         {intensity: intensity_for(divergence), length: "TEMPORARY_MALF"}
       store returned malfunctionID
       malfunction_active = True
  5. elif divergence <= DIVERGENCE_THRESHOLD and malfunction_active:
       DELETE /api/simulation/{id}/modules/Grey_Water_Store/malfunctions/{malfunctionID}
       malfunction_active = False
```

**Key design choices:**

- Reads from DB, not directly from Pi — decouples timing. Pi posts every 5s; BioSim ticks at its own rate. DB gives a stable latest-value regardless of when each source last wrote.
- `Grey_Water_Store` is the correct BioSim target: `biosimMapper.ts` derives `wr-ph` from `Grey_Water_Store` fill ratio. Malfunctioning this module degrades water recycling, which propagates through BioSim's interconnected physics.
- asyncio pattern — same as `biosim_bridge.py`. Loop runs in an asyncio event loop inside the management command's `handle()`.
- No BioSim session state in Django — probe `GET /api/simulation` fresh each cycle to handle BioSim restarts cleanly.

### 4. `control` Docker Service

```yaml
# docker-compose.yml addition
control:
  build: .
  env_file: .env
  command: ["python", "manage.py", "ph_control_loop"]
  depends_on:
    db:
      condition: service_healthy
    biosim:
      condition: service_healthy
  restart: unless-stopped
```

Identical pattern to the existing `bridge` service. Same image, different command, one-liner diff.

### 5. Frontend Real pH Overlay

**What changes:** The Water Recycling zone detail panel shows a second pH value.

**Data source:** `GET /api/enriched/?hub_id=pi-habitat-01` polled every 10 seconds. Returns the latest real pH reading.

**What does NOT change:**
- `biosimMapper.ts` — `wr-ph` remains the BioSim Grey_Water_Store proxy
- `habitatStore.ts` — no new state
- `useSimSource.ts` — no changes
- `biosimWorker.ts` — no changes
- The sensor orb for `wr-ph` in the 3D scene — continues representing BioSim physics output

**Why not replace the BioSim pH with the real reading:** The demo's value proposition is watching BioSim *respond* to the real sensor via the control loop. If the 3D scene just shows the hardware reading, there's no physics, no cascading failure — you've built a hardware dashboard, not a closed loop. The BioSim value stays as the primary; the real reading appears as a secondary annotation showing what drove the malfunction.

---

## Data Flow Diagrams

### Flow 1: Pi Reading → PostgreSQL

```
Pi: AtlasI2C.read(addr=99)  [every 5s]
        |
        hub_client.py
        |  POST /api/sensor-ingest/
        |  {hub_id:'pi-habitat-01', sensor_id:'wr-ph-real', sensor_val:7.14}
        v
SensorIngestView (Django)
        |  EnrichedSensorData.objects.create(...)
        v
enriched_sensor_data table
  hub_id='pi-habitat-01', sensor_id='wr-ph-real', sensor_val=7.14
```

### Flow 2: Control Loop → BioSim Malfunction

```
ph_control_loop (every 10s)
        |
        +-- query: latest pi-habitat-01 / wr-ph-real  -> real_ph = 8.2
        |
        +-- query: latest biosim-habitat-01 / wr-ph    -> sim_ph = 6.8
        |
        |  |8.2 - 6.8| = 1.4 > 0.5 threshold => divergence detected
        |
        v
POST http://biosim:8009/api/simulation/{id}/modules/Grey_Water_Store/malfunctions
  {"intensity": "MEDIUM_MALF", "length": "TEMPORARY_MALF"}
        |
        v
BioSim physics: Grey_Water_Store degraded
        |
        +-- bridge consumes next WS tick:
        |     wr-ph proxy drops (Grey_Water_Store fill ratio changes)
        |     written to enriched_sensor_data (hub_id='biosim-habitat-01')
        |
        +-- biosimWorker.ts consumes WS tick:
              biosimMapper.ts: wr-ph changes
              habitatStore.tick()
              Water Recycling zone turns yellow / red in 3D scene
```

### Flow 3: Real Sensor Data → Frontend Display

```
Water Recycling zone panel (React, useEffect every 10s)
        |
        GET /api/enriched/?hub_id=pi-habitat-01
        |
EnrichedSensorListView (Django — existing, zero changes)
  filter by hub_id, order by -datetime
        |
        [{sensor_id:'wr-ph-real', sensor_val:7.14, datetime:'...'}]
        |
        v
Panel renders: "Real pH: 7.14" (secondary annotation)
                "Sim pH: 6.8"  (BioSim value from habitatStore via biosimMapper)
```

---

## Architectural Patterns

### Pattern 1: DB as Integration Bus

**What:** The control loop reads Pi readings and BioSim-proxied readings from PostgreSQL. It does not subscribe to BioSim's WebSocket or maintain its own WebSocket to the Pi.

**Why:** The Pi posts every 5s on its own schedule. BioSim bridge writes on each tick at BioSim's rate. The DB is the stable shared snapshot regardless of source timing. The control loop just queries `.latest()` from each source.

**Trade-off:** ~10s latency from real divergence to malfunction trigger (poll interval + query). For a demo this is desirable — avoids thrashing malfunctions on momentary sensor noise. If you want sub-second response, you need a different pattern (WS or Redis pub/sub). Don't.

### Pattern 2: Same Django Image, Different Command

**What:** The `control` service uses the existing Dockerfile. `command: ["python", "manage.py", "ph_control_loop"]` is the only docker-compose difference from the `bridge` service.

**Why:** No new Dockerfile. Management commands have the full Django ORM, settings, and env already configured. This is exactly how `bridge` works and it works fine.

**Trade-off:** The management command runs asyncio inside Django's synchronous management framework — same pattern as `biosim_bridge.py` which already does `asyncio.run(self._run())`. This is proven.

### Pattern 3: Pi Sends All Fields Directly

**What:** The Pi POST payload includes `hub_id`, `sensor_id`, `device_addr`, `location`, `owner`, `workers`. `SensorIngestView` writes them as-is. No `hub_config` lookup, no enrichment step.

**Why:** The old GCP path needed enrichment because Pub/Sub payloads were minimal (just `hub_id` + `sensor_val`) and the backend had to JOIN against `hub_config` for metadata. In v3.0, the Pi is configured with its own metadata and sends everything in one POST. The Django endpoint becomes a thin write gate, not a pipeline stage.

**Trade-off:** Pi config must stay in sync with any metadata changes (location name, etc.). Acceptable for a single-Pi demo.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Pi Posting Directly to BioSim

**What people might do:** Skip Django entirely, have `hub_client.py` POST malfunctions directly to `http://localhost:8009/api/simulation/{id}/modules/.../malfunctions`.

**Why it's wrong:** Real pH readings never enter the database. No historical data. `/api/enriched/` can't surface them. `/trends` shows nothing. The frontend can't display them. The control loop has no data to compare. You've built a one-way trigger with no observability.

**Do this instead:** Pi posts to Django. Django stores readings. Control loop reads from DB and drives BioSim. Clean separation of concerns.

### Anti-Pattern 2: Overwriting BioSim's `wr-ph` in biosimMapper.ts

**What people might do:** Modify `biosimMapper.ts` to inject the latest real Pi pH as the `wr-ph` sensor reading, replacing the BioSim physics proxy.

**Why it's wrong:** Disconnects the causal chain. `wr-ph` in the 3D scene should show BioSim's physics output — specifically the *response* to the malfunction the control loop injected. Replacing it with raw hardware data means malfunctions no longer affect the displayed value, and the demo no longer shows closed-loop behavior.

**Do this instead:** Real pH is a secondary display in the zone panel. BioSim's physics drives the `wr-ph` sensor orb. The drama is in watching BioSim respond.

### Anti-Pattern 3: WebSocket from Pi to Django

**What people might do:** Replace the HTTP POST loop with a persistent WebSocket from the Pi for "real-time" streaming.

**Why it's wrong:** Django with Gunicorn is WSGI — no WebSocket support without django-channels, which adds ASGI + channel layers. HTTP POST every 5 seconds is reliable, stateless, trivially debugged with `curl`, and already handled by the existing DRF stack. At 5s intervals there is zero advantage to WebSocket.

**Do this instead:** HTTP POST loop. Simple, debuggable, works today.

### Anti-Pattern 4: Control Loop as AppConfig.ready() Thread

**What people might do:** Add the control loop as a background thread started in `AppConfig.ready()`.

**Why it's wrong:** `AppConfig.ready()` runs in every Django worker process. Gunicorn starts multiple workers. You get N control loops simultaneously, each independently POSTing malfunctions to BioSim. Race conditions and duplicate malfunctions.

**Do this instead:** Separate Docker service with `restart: unless-stopped`. One process, clean lifecycle.

### Anti-Pattern 5: Reusing `/api/provision/` or Abusing Existing Endpoints

**What people might do:** POST Pi readings to `/api/raw/` or some existing endpoint not designed for it.

**Why it's wrong:** `/api/raw/` is a `ListAPIView` (GET only). `/api/provision/` is for hub config, not sensor readings. Overloading existing endpoints with semantically different data is a maintenance trap.

**Do this instead:** New `SensorIngestView` at `/api/sensor-ingest/`. It's 15 lines and one URL path. The cost is trivial and the semantics are clear.

---

## Build Order

Dependencies determine order:

```
1. SensorIngestView + URL registration
   |  - Standalone, no other new deps
   |  - Test immediately: curl -X POST http://localhost:8000/api/sensor-ingest/ ...
   |  - Gets Pi data flowing into DB before Pi is physically connected
   |
   v
2. Pi hub_client.py rewrite
   |  - Depends on (1) being live
   |  - Develop + test against local dev Django server
   |  - AtlasI2C.py unchanged — reuse as-is
   |
   v (parallel with 3)

3. ph_control_loop management command
   |  - Depends on (1) being live so there's data to query
   |  - Can be smoke-tested by inserting fake pi-habitat-01 rows manually
   |  - Does NOT require physical Pi — DB rows are sufficient
   |
   v
4. control Docker service
   |  - One-liner addition to docker-compose.yml
   |  - Depends on (3) existing
   |  - Verify: docker compose logs control shows pH comparison output
   |
   v (parallel with 5)

5. Frontend real pH overlay
   |  - Depends on (1) being live
   |  - Simple polling fetch in Water Recycling zone panel
   |  - No store changes, no worker changes
   |
   v
6. End-to-end test: Pi posting -> DB row -> control loop comparison
   -> BioSim malfunction -> BioSim WS tick -> 3D scene responds
```

Steps 3 and 5 can proceed in parallel after step 1 completes. The Pi hardware (step 2) can be developed independently of the Docker stack work.

---

## Integration Points Summary

### External Boundaries

| Service | Integration | Notes |
|---------|-------------|-------|
| BioSim malfunction API | HTTP POST/DELETE from `ph_control_loop` to `http://biosim:8009/api/simulation/{id}/modules/Grey_Water_Store/malfunctions` | Same API pattern already used by frontend `biosimMalfunctions.ts` |
| Pi Atlas Scientific | `AtlasI2C.py` read on addr=99 | Existing driver, zero changes |
| PostgreSQL | Django ORM in both `SensorIngestView` and `ph_control_loop` | Same `enriched_sensor_data` table, no migration |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Pi <-> Django | HTTP REST over WiFi LAN | POST to `:8000/api/sensor-ingest/`, no auth required |
| `control` loop <-> PostgreSQL | ORM `.latest()` queries | Read-only from `pi-habitat-01` and `biosim-habitat-01` rows |
| `control` loop <-> BioSim | HTTP REST (Docker internal network `biosim:8009`) | Probe sim ID fresh each cycle; no persistent connection |
| Frontend <-> Django (Pi data) | HTTP GET `?hub_id=pi-habitat-01` | Polled every 10s from zone panel; existing endpoint, zero changes |
| All other boundaries | UNCHANGED | BioSim WS -> biosimWorker, bridge, etc. |

---

## Sources

- Direct codebase analysis (all findings confirmed against source):
  - `docker-compose.yml`
  - `django_backend/sensor_data/views.py`
  - `django_backend/sensor_data/models.py`
  - `django_backend/sensor_data/biosim_ingest.py`
  - `django_backend/sensor_data/urls.py`
  - `django_backend/sensor_data/management/commands/biosim_bridge.py`
  - `spatialhub-frontend/src/simulation/biosimMapper.ts`
  - `spatialhub-frontend/src/workers/biosimWorker.ts`
  - `spatialhub-frontend/src/hooks/useSimSource.ts`
  - `spatialhub-frontend/src/simulation/biosimMalfunctions.ts`
  - `spatialhub-frontend/src/store/habitatStore.ts`
  - `hubcode/sensor_logger.py`, `hubcode/basic_funcs.py`
- Project context: `.planning/PROJECT.md`
- BioSim API reference: `docs/biosim-integration-research.md`
- Existing architecture: `.planning/codebase/ARCHITECTURE.md`

---

*Architecture research for: v3.0 Physical Sensor Integration (Pi + Atlas Scientific + BioSim closed loop)*
*Researched: 2026-03-18*
