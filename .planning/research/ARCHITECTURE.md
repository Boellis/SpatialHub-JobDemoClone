# Architecture Research: BioSim Integration

**Domain:** IoT telemetry + real-time physics simulation integration (v2.0)
**Researched:** 2026-03-14
**Milestone:** v2.0 — BioSim Integration
**Confidence:** HIGH (all integration points derived from actual source code and confirmed BioSim API reference)

---

## System Overview

### Full Stack After Integration

```
+---------------------------------------------------------------------+
|                    Docker Compose Network                           |
|                                                                     |
|  +------------------+    WS :8009     +-------------------------+  |
|  |  BioSim (Java)   | <------------>  |  React Frontend (host)  |  |
|  |  Port: 8009      |  POST malfunc   |  Vite dev on :5173      |  |
|  |  /api/simulation |                 |  Direct WS connection   |  |
|  |  /ws/simulation  |                 +-------------------------+  |
|  +--------+---------+                          |                   |
|           | WS tick events                     | HTTP :8080        |
|           v                                    v                   |
|  +------------------+    ORM writes   +-------------------------+  |
|  |  django-bridge   | --------------> |  Django (Port: 8080)    |  |
|  |  (same image as  |                 |  /api/enriched/         |  |
|  |   django, diff   |                 |  /api/habitat/zones/    |  |
|  |   CMD)           |                 +-------------------------+  |
|  +------------------+                          |                   |
|                                                | ORM               |
|                                                v                   |
|  +------------------+                +------------------+          |
|  |  Open MCT        |                |  PostgreSQL      |          |
|  |  Port: 9091      |                |  Port: 5432      |          |
|  |  Links to BioSim |                |  enriched_sensor |          |
|  |  internally      |                |  _data table     |          |
|  +------------------+                +------------------+          |
+---------------------------------------------------------------------+
```

### Two Parallel Data Paths

BioSim simultaneously feeds two independent consumers. This is the core architectural insight for v2.0:

```
BioSim WebSocket tick
    |
    +---> useBioSimWS hook (React, browser)
    |         |
    |         +-> mapBioSimToZoneState()   [pure function]
    |                   |
    |                   +-> useHabitatStore.tick()   [live 3D scene]
    |
    +---> biosim_bridge management command (Python, Docker container)
              |
              +-> map_biosim_to_enriched_rows()   [pure function]
                          |
                          +-> EnrichedSensorData.objects.bulk_create()
                                      |
                                      +-> PostgreSQL -> /api/enriched/ -> /trends
```

These two consumers are completely decoupled. The frontend does not go through Django for live data. Django does not depend on the frontend being alive. Both connect independently to BioSim.

---

## Component Boundaries

### New Components (v2.0 additions)

| Component | Type | Location | Responsibility |
|-----------|------|----------|----------------|
| `useBioSimWS` | React hook | `src/simulation/useBioSimWS.ts` | WebSocket lifecycle, reconnect, tick dispatch to store |
| `biosimMapper.ts` | Pure TS module | `src/simulation/biosimMapper.ts` | BioSim module state -> ZoneState/SensorReading |
| `useSimSource` | React hook | `src/simulation/useSimSource.ts` | BioSim availability probe, fallback orchestration |
| `biosim_bridge` | Django management command | `sensor_data/management/commands/biosim_bridge.py` | Long-running async BioSim WS consumer -> DB writer |
| `biosim_ingest.py` | Pure Python module | `sensor_data/biosim_ingest.py` | BioSim state -> EnrichedSensorData field mapping |
| `docker-compose.yml` | Infrastructure | repo root | Full stack: Django + BioSim + Open MCT + PostgreSQL |

### Modified Components (v2.0 changes)

| Component | File | What Changes |
|-----------|------|-------------|
| `HabitatView.tsx` | `src/pages/HabitatView.tsx` | Replace `startSimulation()` mount call with `useSimSource()` hook |
| `AnomalyDrawer.tsx` | `src/components/habitat/AnomalyDrawer.tsx` | Zero change to JSX — `triggerAnomaly` routing is hidden in store |
| `habitatStore.ts` | `src/store/habitatStore.ts` | Add `simSource`, `simId`, `setSimSource` state; make `triggerAnomaly` source-aware |
| `habitat.ts` (types) | `src/types/habitat.ts` | Add `SimSource = 'biosim' | 'local' | 'detecting'` type; extend `HabitatState` |

### Unchanged Components (zero-touch contract)

These components read `ZoneState` and `SensorReading` from the Zustand store. The store's output format does not change. They remain untouched.

- `HabitatStructure.tsx` — reads zone status by zoneId
- `ZonePanel.tsx` — reads SensorReading values
- `HabitatHUD.tsx` — reads aggregate zone status
- `AlertBanner.tsx` — reads zone status
- `SensorOrb.tsx` — reads SensorReading.status
- `MarsEnvironment.tsx` — no store dependency
- `CameraController.tsx` — no store dependency
- `simulation/engine.ts` — preserved intact for fallback mode
- `simulation/anomalies.ts` — preserved intact for fallback mode
- All non-habitat pages — zero impact

---

## Architectural Patterns

### Pattern 1: WebSocket Hook as Tick Provider

**What:** `useBioSimWS` is a React hook that owns the WebSocket connection and calls `store.tick()` on each incoming message. It is structurally parallel to `createSimulationEngine()` — both are tick providers that produce `Record<string, Record<string, SensorReading>>` and write it to the Zustand store.

**Placement:** Mount in `HabitatView.tsx` only. Do not mount inside the R3F Canvas — R3F nodes cannot reliably use regular React hooks (separate reconciler). The hook renders nothing.

**Example:**
```typescript
// src/simulation/useBioSimWS.ts
export function useBioSimWS(simId: string): { connected: boolean } {
  const tick = useHabitatStore((s) => s.tick);
  const [connected, setConnected] = useState(false);
  const historyRef = useRef<Record<string, number[]>>({});

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8009/ws/simulation/${simId}`);

    ws.onmessage = (event) => {
      const biosimState = JSON.parse(event.data);
      const readings = mapBioSimToZoneState(biosimState, historyRef.current);
      // Update history buffer after mapping
      for (const [zoneId, sensors] of Object.entries(readings)) {
        for (const [sensorId, r] of Object.entries(sensors)) {
          const buf = historyRef.current[sensorId] ?? [];
          buf.push(r.value);
          if (buf.length > 30) buf.shift();
          historyRef.current[sensorId] = buf;
        }
      }
      tick(readings);
    };

    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); /* reconnect logic here */ };

    return () => ws.close();
  }, [simId, tick]);

  return { connected };
}
```

**Trade-offs:** Hook approach means one WebSocket per browser tab. Fine for a demo. A module-level singleton would survive React StrictMode double-mount without a double-connect, but adds testing complexity. Hook wins here.

### Pattern 2: Data Source Swapping via useSimSource

**What:** `useSimSource` probes BioSim availability on mount and decides which tick provider to activate. It starts either `useBioSimWS` or `createSimulationEngine()`, never both simultaneously. The Zustand store's `tick()` signature is identical regardless of source.

**Why the store types do not change:** `ZoneState` and `SensorReading` are the store's output contract. Both data sources produce these types — one via `biosimMapper.ts`, the other via `engine.ts`. Every downstream component reads from the store, not from the source. The source is invisible to the component tree.

**Example:**
```typescript
// src/simulation/useSimSource.ts
export function useSimSource(): 'detecting' | 'biosim' | 'local' {
  const [source, setSource] = useState<'detecting' | 'biosim' | 'local'>('detecting');
  const setSimSource = useHabitatStore((s) => s.setSimSource);

  useEffect(() => {
    fetch('http://localhost:8009/api/simulation', {
      signal: AbortSignal.timeout(2000),
    })
      .then(() => { setSource('biosim'); setSimSource('biosim'); })
      .catch(() => { setSource('local'); setSimSource('local'); });
  }, [setSimSource]);

  return source;
}
```

In `HabitatView.tsx`, the mount `useEffect` that calls `startSimulation()` is replaced with:
```typescript
const source = useSimSource();
// Conditionally render useBioSimWS or trigger engine start based on source
```

**Trade-offs:** The HTTP probe adds up to 2s startup delay when BioSim is unavailable (times out). Acceptable for a portfolio demo. Alternative: open the WS directly and treat a 2s connection failure as fallback — faster but WebSocket error handling is noisier.

### Pattern 3: BioSim to ZoneState Mapping Layer

**What:** `biosimMapper.ts` is a pure TypeScript module (no React, no store imports) that transforms BioSim's module hierarchy into `Record<string, Record<string, SensorReading>>`. This mapping layer is the most complex translation in the integration.

**Zone-to-module mapping:**

| SpatialHub Zone | ZoneId | BioSim Modules |
|-----------------|--------|----------------|
| Grow Bays | `grow-bays` | BiomassRS crop modules (CO2 store level, crop temperature/humidity proxies) |
| Atmosphere Control | `atmosphere-control` | OGS (O2 %), VCCR (CO2 removal efficiency -> filtration proxy), cabin air pressure |
| Water Recycling | `water-recycling` | WaterRS, potable/dirty water store levels (-> pH/TDS proxies), flow rate |
| Power/Thermal | `power-thermal` | Power store currentLevel -> kW, thermal store -> coolant temp, battery store % |

**Sensor extraction strategy:** BioSim modules expose `currentLevel`, `capacity`, and flow rates. Map these to `SensorReading.value` with unit conversion. Where BioSim does not provide a direct analog for a sensor (e.g., there is no single "humidity" module), derive a proxy from correlated modules or fall back to the nominal value with small BioSim-driven noise.

**Example structure:**
```typescript
// src/simulation/biosimMapper.ts
export function mapBioSimToZoneState(
  biosimState: BioSimSimulationState,
  historyBuffer: Record<string, number[]>
): Record<string, Record<string, SensorReading>> {
  const now = Date.now();
  const modules = biosimState.modules ?? {};

  return {
    'grow-bays': {
      'gb-co2':      makeSensorReading('gb-co2',      'grow-bays',             extractCO2(modules), historyBuffer, now),
      'gb-temp':     makeSensorReading('gb-temp',     'grow-bays',             extractGrowTemp(modules), historyBuffer, now),
      'gb-humidity': makeSensorReading('gb-humidity', 'grow-bays',             extractGrowHumidity(modules), historyBuffer, now),
    },
    'atmosphere-control': {
      'ac-o2':         makeSensorReading('ac-o2',         'atmosphere-control', extractO2Pct(modules), historyBuffer, now),
      'ac-pressure':   makeSensorReading('ac-pressure',   'atmosphere-control', extractPressure(modules), historyBuffer, now),
      'ac-filtration': makeSensorReading('ac-filtration', 'atmosphere-control', extractFiltration(modules), historyBuffer, now),
    },
    'water-recycling': { /* ... */ },
    'power-thermal':   { /* ... */ },
  };
}
```

**Critical note on history:** The existing `habitatStore.tick()` replaces `zones` wholesale and does not accumulate history — history was managed inside `engine.ts` via its per-tick tracking. `useBioSimWS` maintains a `historyRef` (rolling 30-value buffer per sensorId) and passes it into `mapBioSimToZoneState` on each tick. The mapper reads the buffer, injects the history array into each `SensorReading`, and the hook updates the buffer after the call.

### Pattern 4: Source-Aware AnomalyDrawer Dispatch

**What:** `AnomalyDrawer.tsx` currently calls `store.triggerAnomaly(scenarioId)`. In BioSim mode, this must POST a malfunction to BioSim's REST API instead of modifying local anomaly state. The component must not change. The store action absorbs the routing.

**Store action changes:**
```typescript
// In habitatStore.ts — updated triggerAnomaly
triggerAnomaly: async (scenarioId: string) => {
  const { simSource, simId } = get();

  if (simSource === 'biosim' && simId) {
    const mapping = SCENARIO_TO_BIOSIM_MALFUNCTION[scenarioId];
    if (!mapping) return;
    const res = await fetch(
      `http://localhost:8009/api/simulation/${simId}/modules/${mapping.module}/malfunctions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intensity: mapping.intensity, duration: mapping.duration }),
      }
    );
    const { id: malfId } = await res.json();
    // Store malfunction ID for cancel
    set((s) => ({ activeMalfunctionIds: { ...s.activeMalfunctionIds, [scenarioId]: malfId } }));
    return;
  }

  // Fallback: local simulation anomaly (existing logic, zero changes)
  const scenario = ANOMALY_SCENARIOS.find((s) => s.id === scenarioId);
  // ... rest of existing triggerAnomaly body unchanged ...
},
```

**Scenario to BioSim malfunction mapping:**

| SpatialHub Scenario | BioSim Module | Intensity | Duration |
|--------------------|---------------|-----------|----------|
| `co2-spike` | `VCCR` | `SEVERE_MALF` | `TEMPORARY_MALF` |
| `pump-failure` | `WaterRS` | `SEVERE_MALF` | `TEMPORARY_MALF` |
| `nutrient-crash` | `WaterRS` | `MEDIUM_MALF` | `TEMPORARY_MALF` |
| `power-fluctuation` | `PowerStore` | `SEVERE_MALF` | `TEMPORARY_MALF` |

**Cancel behavior:** `cancelAnomaly` in BioSim mode DELETEs the stored malfunction ID from BioSim: `DELETE /api/simulation/{simId}/modules/{module}/malfunctions/{malfId}`. Malfunction IDs are stored in a new `activeMalfunctionIds: Record<scenarioId, number>` field in the Zustand store.

**`AnomalyDrawer.tsx` itself does not change.** It still calls `triggerAnomaly(scenarioId)`. Source routing is invisible to the component. This is the correct boundary.

### Pattern 5: Django Bridge as Management Command

**What:** A long-running Django management command using `asyncio` and the `websockets` library to consume BioSim tick events and write to PostgreSQL via the Django ORM. Runs as a separate Docker container sharing the Django image.

**Decision rationale — management command over alternatives:**

- **Celery** requires a broker (Redis or RabbitMQ) — two extra Docker services for no benefit. BioSim WS is already the event source; Celery is for distributed task queues.
- **Django Channels** requires activating ASGI (replacing or paralleling the WSGI Gunicorn setup), adding a channel layer, and significant settings changes. The `asgi.py` in this project is a Django-generated stub — it is not configured. Channels is for serving WebSocket connections, not consuming them.
- **Management command with asyncio** is one extra dependency (`websockets` package), zero extra services, starts with `python manage.py biosim_bridge`, and is easily added to docker-compose as a sidecar.

**Implementation sketch:**
```python
# django_backend/sensor_data/management/commands/biosim_bridge.py
import asyncio, json
import websockets
from django.core.management.base import BaseCommand
from asgiref.sync import sync_to_async
from sensor_data.models import EnrichedSensorData
from sensor_data.biosim_ingest import map_biosim_to_enriched_rows

class Command(BaseCommand):
    help = "Long-running bridge: BioSim WebSocket -> enriched_sensor_data"

    def handle(self, *args, **options):
        asyncio.run(self._run())

    async def _run(self):
        sim_id = await self._start_or_get_simulation()
        url = f"ws://biosim:8009/ws/simulation/{sim_id}"
        self.stdout.write(f"[bridge] Connecting to {url}")
        async with websockets.connect(url) as ws:
            async for message in ws:
                state = json.loads(message)
                rows = map_biosim_to_enriched_rows(state, sim_id)
                await sync_to_async(EnrichedSensorData.objects.bulk_create)(rows)
```

**`biosim_ingest.py`** is a pure Python module (no Django ORM imports, no async) containing only `map_biosim_to_enriched_rows()`. This keeps the management command thin and the mapping logic independently testable.

**Database writes:** Each BioSim sensor reading maps to an `EnrichedSensorData` row: `hub_id='biosim-{simId}'`, `sensor_name` = our sensorId (e.g., `ac-o2`), `sensor_val` = extracted float, `datetime` = UTC now, `location='Mars Habitat'`, `owner='NASA BioSim'`, `workers='[]'`. The existing `EnrichedSensorData` model and `/api/enriched/` endpoint serve these without modification.

---

## Docker Compose Topology

### Service Definitions

```yaml
# docker-compose.yml (repo root)
services:
  biosim:
    image: scottbell/biosim       # or build from source
    ports: ["8009:8009"]
    environment:
      BIOSIM_WRITE_TICKS: "true"  # enables /api/simulation/{id}/log

  openmct:
    image: scottbell/openmct-for-biosim
    ports: ["9091:9091"]
    depends_on: [biosim]

  db:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: spatialhub_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: dev_password
    volumes: [pgdata:/var/lib/postgresql/data]

  django:
    build: .                      # existing Dockerfile (copies django_backend/)
    ports: ["8080:8080"]
    environment:
      USE_SQLITE: "0"
      DB_HOST: db
      DB_NAME: spatialhub_db
      DB_USER: postgres
      DB_PASS: dev_password
    depends_on: [db, biosim]

  django-bridge:
    build: .                      # same image as django
    command: ["python", "manage.py", "biosim_bridge"]
    environment:
      USE_SQLITE: "0"
      DB_HOST: db
      # same DB env vars
    depends_on: [db, biosim]

volumes:
  pgdata:
```

### Networking Rules

| Connection | How | Notes |
|------------|-----|-------|
| BioSim <-> React (browser) | Port-mapped `localhost:8009` | Frontend runs on host, not in Docker |
| BioSim <-> django-bridge | Internal Docker DNS `biosim:8009` | Bridge uses hostname, not localhost |
| db <-> django | Internal Docker DNS `db:5432` | Same env var pattern as Cloud Run |
| db <-> django-bridge | Internal Docker DNS `db:5432` | Shares DB credentials |
| Open MCT <-> BioSim | Internal Docker network | Pre-configured in openmct image |
| Open MCT <-> browser | Port-mapped `localhost:9091` | Accessed via new tab link |
| django <-> React (browser) | Port-mapped `localhost:8080` | Same as current dev setup |

### Django settings.py additions required

Add `http://localhost:8009` to `CORS_ALLOWED_ORIGINS` if the frontend makes REST calls to BioSim via a Django proxy. Not needed if the frontend POSTs malfunction calls directly to BioSim (which is recommended — no reason to proxy them through Django). Add docker-compose PostgreSQL credentials as fallback defaults in `settings.py` for local compose dev.

---

## Open MCT Integration

**Decision: Standalone service, accessed via new tab link from nav.**

Add a nav link in `App.tsx`:
```tsx
<a href="http://localhost:9091" target="_blank" rel="noopener noreferrer">
  NASA Mission Control
</a>
```

**Rationale against iframe:**
- Open MCT has a rich multi-panel layout designed for full viewport — an iframe crops it badly
- No React route needed — zero new code in the habitat bundle
- Portfolio reviewers see a legitimately separate NASA tool, not a squished embed
- The `openmct-for-biosim` Docker image pre-connects to BioSim automatically — zero configuration needed

This is the lowest-effort, highest-credibility decision in the milestone. The only work is adding the nav link and including the service in docker-compose.

---

## Data Flow: Full Tick Lifecycle (BioSim Mode)

```
BioSim internal physics tick
    |
    +-> WS broadcast to all connected clients
            |
            +--> useBioSimWS hook (React, browser)
            |         |
            |         +-> JSON.parse(event.data)
            |         +-> mapBioSimToZoneState(state, historyRef.current)
            |         +-> store.tick(readings)
            |                   |
            |                   +-> Zustand state update
            |                           |
            |                           +-> HabitatStructure re-renders (zone colors)
            |                           +-> ZonePanel re-renders (sensor values)
            |                           +-> HabitatHUD re-renders (status summary)
            |
            +--> biosim_bridge management command (Python, Docker)
                      |
                      +-> json.loads(message)
                      +-> map_biosim_to_enriched_rows(state, sim_id)
                      +-> EnrichedSensorData.objects.bulk_create(rows)
                                  |
                                  +-> PostgreSQL enriched_sensor_data
                                              |
                                              +-> /api/enriched/ endpoint
                                              +-> /trends page (historical charts)
```

## Data Flow: Anomaly Dispatch (BioSim Mode)

```
User clicks AnomalyDrawer button
    |
    +-> store.triggerAnomaly('co2-spike')
            |
            +-> [simSource === 'biosim']
            |         |
            |         +-> POST /api/simulation/{simId}/modules/VCCR/malfunctions
            |                   {"intensity": "SEVERE_MALF", "duration": "TEMPORARY_MALF"}
            |                   |
            |                   +-> BioSim physics: VCCR efficiency collapses
            |                           |
            |                           +-> Next WS tick: O2 drops, CO2 rises in cabin air store
            |                                   |
            |                                   +-> mapBioSimToZoneState: ac-filtration spikes, gb-co2 rises
            |                                           |
            |                                           +-> store.tick() -> 3D zones turn red
            |
            +-> [simSource === 'local']
                      |
                      +-> existing triggerAnomaly logic (unchanged)
                              |
                              +-> store.anomalies['co2-spike'] = { phase: 'onset', ... }
                              +-> engine.ts getAnomalyBias() applies crisisDelta
```

---

## Build Order and Phase Dependencies

### Dependency Graph

```
Phase 1: Docker Compose + BioSim smoke test
    |  BioSim running, simId confirmed, WS broadcasting
    |  REQUIRED BEFORE: everything
    |
    +---> Phase 2: biosimMapper.ts + useBioSimWS
    |         |  BioSim data -> ZoneState -> 3D scene responds to real physics
    |         |  REQUIRES: Phase 1
    |         |
    |         +---> Phase 3: useSimSource + fallback wiring
    |         |         |  Auto-detect BioSim; fall back to engine.ts if unavailable
    |         |         |  REQUIRES: Phase 2
    |         |         |
    |         |         +---> Phase 4: AnomalyDrawer rewire
    |         |                   |  simSource in store; triggerAnomaly routes to BioSim API
    |         |                   |  REQUIRES: Phase 3 (simSource exists)
    |         |                   |  REQUIRES: Phase 1 (BioSim malfunction endpoint)
    |         |
    |         Phase 5: Django bridge (parallel with 2-4)
    |                   |  biosim_bridge management command + biosim_ingest.py
    |                   |  REQUIRES: Phase 1 (BioSim running)
    |                   |  INDEPENDENT OF: Phases 2-4
    |                   |  VERIFIED VIA: /trends page shows BioSim data in DB
    |
    Phase 6: Open MCT nav link + docker-compose polish
              Independent of all frontend phases
              Requires only Phase 1 (openmct container running)
```

### Parallelizable Work

Phases 2-4 (frontend) and Phase 5 (Django bridge) can proceed simultaneously after Phase 1. Both consume BioSim's WS output independently. The mapping logic in TypeScript (`biosimMapper.ts`) and Python (`biosim_ingest.py`) can be developed by the same or different people in parallel.

### The Single Blocking Dependency

**Everything depends on Phase 1.** Until `wscat ws://localhost:8009/ws/simulation/1` prints JSON with module data, all mapping code is speculative. The actual BioSim module property names, hierarchy, and units must be confirmed from live inspection before writing `biosimMapper.ts` or `biosim_ingest.py`. Phase 1 must complete before mapping work begins.

---

## Recommended File Structure (Additions Only)

```
spatialhub-frontend/src/
+-- simulation/
|   +-- engine.ts              [UNCHANGED — fallback mode]
|   +-- anomalies.ts           [UNCHANGED — fallback mode]
|   +-- constants.ts           [UNCHANGED]
|   +-- biosimMapper.ts        [NEW] BioSim state -> ZoneState/SensorReading
|   +-- useBioSimWS.ts         [NEW] React hook: WS lifecycle + store tick
|   +-- useSimSource.ts        [NEW] BioSim availability probe + fallback
+-- store/
|   +-- habitatStore.ts        [MODIFIED] Add simSource, simId, activeMalfunctionIds
+-- types/
    +-- habitat.ts             [MODIFIED] Add SimSource type, extend HabitatState

django_backend/sensor_data/
+-- biosim_ingest.py           [NEW] Pure Python: BioSim state -> EnrichedSensorData rows
+-- management/commands/
    +-- seed_habitat_zones.py  [UNCHANGED]
    +-- biosim_bridge.py       [NEW] Long-running async management command

docker-compose.yml             [NEW] Root-level full stack definition
```

---

## Integration Points

### External Service Boundaries

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| BioSim WS | Direct `new WebSocket()` from `useBioSimWS` | No auth, no proxy — direct port :8009 |
| BioSim REST (simulation start) | `fetch()` in management command startup | Django bridge starts or retrieves sim on boot |
| BioSim REST (malfunctions) | `fetch()` from store `triggerAnomaly` action | Frontend POSTs directly to :8009 — no Django proxy |
| BioSim REST (malfunction cancel) | `fetch()` DELETE from store `cancelAnomaly` | Uses malfunction ID stored in Zustand |
| Open MCT | New tab link from App.tsx nav | Zero integration code — pre-configured Docker image |
| PostgreSQL | Django ORM `bulk_create` in bridge command | Same `enriched_sensor_data` table as existing |

### Internal Module Boundaries

| Boundary | Communication | Contract |
|----------|---------------|----------|
| `useBioSimWS` -> `habitatStore` | `store.tick(readings)` | Same signature as `engine.ts` — zero store refactor |
| `useSimSource` -> `habitatStore` | `store.setSimSource(source)` | New action; store consumers unaffected |
| `AnomalyDrawer` -> `habitatStore` | Same `triggerAnomaly(scenarioId)` call | Source routing invisible to component |
| `biosim_bridge` -> `biosim_ingest` | Function call, same process | Keep ORM out of mapping layer for testability |
| `django-bridge` container -> `django` container | None — separate containers, same DB | Bridge writes directly to PostgreSQL |

---

## Anti-Patterns

### Anti-Pattern 1: Routing Live Data Through Django

**What people do:** Proxy BioSim WebSocket through Django Channels so the frontend only talks to one backend.

**Why it's wrong:** Activating Django Channels requires daphne/uvicorn, a channel layer (Redis), and significant changes to the settings and deployment config. The `asgi.py` is an unused stub. This project's existing stack is Gunicorn/WSGI. Adding Channels introduces a latency hop, kills the "direct NASA data feed" portfolio story, and adds ~3 services to docker-compose for zero functional gain.

**Do this instead:** Frontend connects directly to BioSim WS at `localhost:8009`. Django bridge connects separately as a management command. Two consumers, one source, clean separation.

### Anti-Pattern 2: Source Logic in Components

**What people do:** Check `import.meta.env.VITE_USE_BIOSIM` inside `HabitatView`, `AnomalyDrawer`, or other components and conditionally render or behave differently.

**Why it's wrong:** Scatters source-awareness across the component tree. Every component touching anomalies or readings needs to know the source. Adding a third source later touches every component.

**Do this instead:** Source detection lives in `useSimSource`. Dispatch routing lives in `habitatStore`. Components call identical actions. `ZoneState` and `SensorReading` are the universal output contract — sources are an implementation detail.

### Anti-Pattern 3: Modifying engine.ts or anomalies.ts

**What people do:** Refactor `engine.ts` to optionally use BioSim data, or delete `anomalies.ts` now that BioSim provides real malfunctions.

**Why it's wrong:** Fallback mode breaks. The client-side simulation is a portfolio asset on its own — the habitat demo works without Docker, without BioSim, on any static host. The v1.0 capability must survive network outages and reviewer environments without Docker.

**Do this instead:** Keep `engine.ts` and `anomalies.ts` entirely intact. `useSimSource` activates one of two tick providers. The existing simulation code has zero changes.

### Anti-Pattern 4: Celery for the Django Bridge

**What people do:** Use Celery beat to periodically poll BioSim's REST `/api/simulation/{id}/log` endpoint instead of subscribing to the WebSocket.

**Why it's wrong:** Polling discards BioSim's real-time capability. Celery requires Redis or RabbitMQ, adding two more Docker services. REST polling at 2s is not the same as WS push (poll rate vs tick rate can diverge; missed ticks happen).

**Do this instead:** Management command with `asyncio` and `websockets`. One dependency, zero extra services, same subsecond latency as the frontend consumer.

### Anti-Pattern 5: History Accumulation in habitatStore.tick()

**What people do:** Move history buffer management into `habitatStore.tick()` so both sources benefit automatically.

**Why it's wrong:** `tick()` currently replaces `zones` wholesale. Making it history-aware requires the setter to read previous state — doable, but it couples the store to the history concern. History is a data-source concern (how many values have been seen), not a store concern (what is the current state).

**Do this instead:** `useBioSimWS` maintains a `historyRef` (same rolling buffer pattern already in `engine.ts`) and injects history arrays into `mapBioSimToZoneState()`. The store stays stateless with respect to history.

### Anti-Pattern 6: Open MCT as an Iframe in HabitatView

**What people do:** Add an `<iframe src="http://localhost:9091">` inside the habitat page or as a new `/openmct` route with an embedded iframe.

**Why it's wrong:** Open MCT's multi-panel layout is designed for full viewport. An iframe crops it, adds scroll-within-scroll UX problems, and blocks pointer events from reaching Open MCT's complex click targets. It looks worse than a new tab.

**Do this instead:** A nav link that opens Open MCT in a new tab. Zero code in the habitat bundle. Portfolio reviewers see a legitimately separate NASA tool, not a squished embed.

---

## Scaling Considerations

This is a single-user portfolio demo. Scaling is not a real concern.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user (demo) | Current architecture — docker-compose on one machine |
| Multiple concurrent viewers | BioSim WS broadcasts to all connected clients — no change needed |
| Production deployment | BioSim on Cloud Run or GKE; bridge as Cloud Run Job; PostgreSQL remains Cloud SQL |

---

## Sources

- BioSim GitHub: https://github.com/scottbell/biosim (API reference, WebSocket protocol, Docker setup)
- BioSim integration research: `/docs/biosim-integration-research.md` (confirmed endpoint shapes and module inventory)
- Existing codebase (source of truth for all "unchanged" and "modified" component claims):
  - `spatialhub-frontend/src/store/habitatStore.ts`
  - `spatialhub-frontend/src/simulation/engine.ts`
  - `spatialhub-frontend/src/simulation/anomalies.ts`
  - `spatialhub-frontend/src/components/habitat/AnomalyDrawer.tsx`
  - `spatialhub-frontend/src/pages/HabitatView.tsx`
  - `spatialhub-frontend/src/types/habitat.ts`
  - `spatialhub-frontend/src/simulation/constants.ts`
  - `django_backend/sensor_data/models.py`
  - `django_backend/sensor_data/views.py`
  - `django_backend/spatialhub_backend/settings.py`
  - `django_backend/spatialhub_backend/asgi.py`
  - `Dockerfile`
- `.planning/codebase/ARCHITECTURE.md` (existing system architecture)
- `.planning/codebase/STRUCTURE.md` (existing file layout)

---

*Architecture research for: BioSim integration with SpatialHub Mars Habitat Demo*
*Milestone: v2.0*
*Researched: 2026-03-14*
