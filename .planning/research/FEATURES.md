# Feature Research

**Domain:** BioSim Integration — NASA life support simulator as physics engine for Mars Habitat Demo v2.0
**Researched:** 2026-03-14
**Confidence:** HIGH (BioSim API documented from source; WebSocket and Docker patterns verified from official docs; Open MCT patterns from official tutorial and repo)

---

## Context: What Already Exists

The v1.0 Mars Habitat Demo ships a complete client-side simulation stack. Before evaluating new features, it is worth being precise about what the new milestone inherits versus what it replaces.

**Inherited (do not rebuild):**
- 3D habitat scene, zone meshes, orbit controls, bloom post-processing
- ZonePanel, HabitatHUD, AlertBanner UI components
- Zustand `habitatStore` with `ZoneState` / `SensorReading` types
- `deriveStatus()` threshold logic in `engine.ts`
- AnomalyDrawer shell UI (buttons, drawer open/close, cancel mechanism)
- 4 hardcoded scenario definitions in `anomalies.ts` (used as fallback)

**Replaced by BioSim integration:**
- `simulation/engine.ts` setInterval tick loop — goes away when BioSim is connected
- `simulation/anomalies.ts` hardcoded bias deltas — replaced by real BioSim malfunction POST calls
- 30-value in-memory history rolling window — replaced by real tick log from BioSim persisted to PostgreSQL

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must work for the demo to feel coherent as a "BioSim integration." A portfolio reviewer who sees stale data, Docker that doesn't start, or a broken anomaly trigger will not give credit for the 3D scene.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Docker Compose stack with BioSim | It is the stated goal of the milestone; a demo without running BioSim is just v1.0 renamed | LOW | BioSim ships its own `docker-compose.yml`; extend it to add Django + PostgreSQL; BioSim on port 8009, Open MCT on port 9091 |
| BioSim simulation auto-start on boot | User opens `/habitat`, data flows — no manual curl required from the reviewer | LOW | POST `/api/simulation/start` with bundled XML config during Django startup or frontend WebSocket mount; store returned simID |
| Frontend WebSocket client replacing the 2s setInterval loop | Live telemetry is the demo's heartbeat; if it still feels like a random number generator, the integration is unconvincing | MEDIUM | Connect to `ws://localhost:8009/ws/simulation/{simID}`; server broadcasts full state immediately on connect then after each tick; WS client must drive `habitatStore` updates |
| Module-to-zone mapping translation layer | BioSim speaks module names (OGS, VCCR, BiomassRS, WaterRS); the frontend speaks zone IDs (grow-bays, atmosphere-control, water-recycling, power-thermal) | MEDIUM | A pure translation function; maps BioSim module state properties to existing `ZoneState` / `SensorReading` shape; the exact module name strings must be verified against a live `GET /api/simulation/{simID}` response |
| Fallback to client-side simulation when BioSim is absent | Demo must still run on Firebase static hosting without Docker; reviewers browsing the live URL will not have BioSim running | HIGH | See Fallback Mode detail below; most architecturally complex table-stakes item; requires connection state machine in Zustand |
| AnomalyDrawer posting real malfunctions to BioSim | AnomalyDrawer already exists; if clicking "CO2 Spike" still runs the old bias loop, the integration is incomplete regardless of what else was built | MEDIUM | POST to `/api/simulation/{simID}/modules/{moduleName}/malfunctions` with `intensity` + `length` body; map each scenario to correct BioSim module; store returned malfunction ID for cleanup |
| Django bridge ingesting BioSim tick data into `enriched_sensor_data` | `/api/enriched/` and `/trends` already exist and serve real data; they must serve BioSim data, not empty results | HIGH | Django management command subscribes to BioSim WS as asyncio client, also drives `POST /tick` every 2s, writes rows to `enriched_sensor_data` |
| `BIOSIM_WRITE_TICKS=true` in docker-compose | Required for `/api/simulation/{simID}/log` endpoint to return historical data | LOW | One env var in BioSim service definition; set it before any data is collected — cannot be enabled retroactively |

### Differentiators (Competitive Advantage)

Features that make the demo genuinely impressive rather than just "yes it runs BioSim."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Emergent cascading failures from real physics | When OGS fails, O2 drops, CO2 climbs, Grow Bay sensors degrade — the cross-zone cascade is real physics, not scripted | LOW after wiring | BioSim's module interconnections produce this automatically; the frontend just has to visualize what arrives over WS |
| "BioSim Connected" / "Fallback Mode" status badge in HUD | Shows the reviewer the system is aware of its own data source; makes fallback intentional rather than looking like a bug | LOW | Single badge component in HabitatHUD; green = live BioSim, amber = client-side fallback; reads from `biosimStatus` field in Zustand |
| Open MCT dashboard exposed alongside 3D habitat | Ships free with BioSim docker-compose (port 9091); surfaces NASA's own mission control visualizer with zero custom plugin work | LOW | Nav link from `/habitat` to `http://localhost:9091`; or `/mct` route that iframes it; no custom telemetry plugin needed |
| Historical data from real BioSim tick log in `/trends` | `GET /api/simulation/{simID}/log` returns full tick history; wire into existing `/trends` page — it serves real sim data with no frontend changes | MEDIUM | Django bridge queries log endpoint and bulk-inserts into `enriched_sensor_data`; existing `/api/enriched/` API already serves these; add `import_biosim_log` management command |
| Malfunction scheduling (`tickToOccur`) | BioSim supports scheduling faults at a future tick; allows "cascade in 30s" UX in AnomalyDrawer | LOW | Optional delay field in AnomalyDrawer form; pass `tickToOccur` in POST body |
| Malfunction removal via BioSim DELETE | `DELETE /malfunctions/{id}` cleanly removes a fault; AnomalyDrawer "Cancel" calls this instead of reversing a bias curve | LOW | Store malfunction ID returned by POST; send DELETE on cancel — cleaner than the current bias-ramp-down approach |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Custom Open MCT telemetry plugin | "Full integration" sounds impressive | Open MCT plugin development requires deep understanding of namespace, object, composition, and telemetry provider model; weeks of work for a portfolio demo with zero additional visual impact | Link to the pre-bundled Open MCT instance BioSim docker-compose already ships; it works out of the box and already shows BioSim data |
| Tick rate control slider in UI | Reviewers might want to speed up or slow down the simulation | BioSim tick rate is controlled by how fast `POST /tick` is called; adding UI control requires replacing the push WS model with a poll loop, breaking live streaming architecture | Leave tick rate at fixed 2s driven by Django bridge; if needed for demos, add a management command flag |
| Persistent anomaly incident history | "Track what went wrong" | PROJECT.md explicitly marks this out of scope; requires schema migrations, new Django model, new API endpoint for zero demo value | AnomalyDrawer shows current active state; that is sufficient for a demo |
| Replace 3D visualization with Open MCT charts | Open MCT has its own charting | The 3D habitat IS the demo's differentiator; replacing it with tabular mission control charts eliminates the visual impact entirely | Keep 3D as primary; expose Open MCT alongside via link or iframe |
| WebSocket proxy through Django Channels | Route BioSim WS through Django to avoid CORS | Adds Django Channels dependency (Redis, ASGI), doubles data hop, creates another failure point | Connect frontend directly to BioSim WS at port 8009; handle CORS in BioSim config; Django is only needed for the ingest path |
| Authentication or session management | "Production-grade" | BioSim has no auth model; adding auth is scope creep; PROJECT.md marks auth out of scope | No auth needed; local Docker stack, portfolio demo |
| Multiple mission XML configurations selectable at runtime | Infinite replayability | Requires config management UI, scenario switching logic, and BioSim restart handling; one well-tuned default scenario covers 100% of demo use cases | Ship one bundled XML that runs indefinitely; the scenario switching is a v3 idea at best |

---

## Feature Dependencies

```
[Docker Compose Stack]
    └── required by ──> [BioSim WebSocket Client]
    └── required by ──> [Django Bridge Ingest]
    └── required by ──> [Real Malfunction Injection]
    └── required by ──> [Open MCT Link / Iframe]

[BioSim Simulation Auto-Start]
    └── required by ──> [BioSim WebSocket Client]  (needs simID)
    └── required by ──> [Real Malfunction Injection]  (needs simID)

[BioSim WebSocket Client]
    └── required by ──> [Module-to-Zone Mapping]
                            └── drives ──> habitatStore ZoneState / SensorReading
    └── drives ──> [Fallback Mode]  (detects disconnection, signals fallback)

[Fallback Mode]
    └── falls back to ──> existing engine.ts  (already built, no changes needed)
    └── signals ──> HabitatHUD badge (new, LOW effort)

[Django Bridge Ingest]
    └── required by ──> [Historical Tick Log in /trends]
    └── writes to ──> enriched_sensor_data  (already exists)
    └── drives ──> POST /tick every 2s  (owns the tick loop)

[Real Malfunction Injection]
    └── replaces ──> anomalies.ts bias deltas  (stays active in fallback mode only)
    └── requires ──> simID from [BioSim Simulation Auto-Start]

[BIOSIM_WRITE_TICKS=true env var]
    └── required by ──> [Historical Tick Log in /trends]  (log endpoint returns nothing without it)
```

### Dependency Notes

- **Docker Compose Stack is a prerequisite for everything.** BioSim must be running before any integration feature can be tested. All P1 work assumes `docker compose up` works first.
- **simID is required by both WebSocket client and malfunction injection.** The simID comes from the auto-start POST response or from `GET /api/simulation`. Store it in Django (or a shared env var) on startup.
- **Django bridge independently drives the tick loop.** `POST /tick` is called by the bridge every 2s. The frontend WS client is purely a receiver — it does not call tick. This means if the Django bridge is not running, BioSim freezes (no ticks advance).
- **Fallback mode depends on the WS client detecting failure.** If the WS connection attempt times out or closes unexpectedly, the client sets `biosimStatus: 'fallback'` in Zustand, and `engine.ts` is started. On reconnect, engine.ts is stopped before switching back.
- **Both Django bridge and frontend WS can connect to BioSim simultaneously.** BioSim supports multiple WS consumers on the same simID. No coordination required between them.
- **`--writeTicks` must be set before the simulation runs.** It cannot be enabled retroactively for past ticks. Set it in docker-compose service definition from the start.

---

## MVP Definition

### Launch With (v2.0)

Minimum set that makes the portfolio entry read as a genuine BioSim integration.

- [ ] **Docker Compose stack** — `docker compose up` starts Django + BioSim + Open MCT + PostgreSQL with one command
- [ ] **BioSim simulation auto-start** — simulation begins on Django startup with bundled XML config; no manual curl needed
- [ ] **Frontend WebSocket client** — connects to BioSim WS, drives `habitatStore` with real BioSim data; replaces `engine.ts` as primary data source
- [ ] **Module-to-zone translation layer** — pure function mapping BioSim module names to existing `ZoneState` / `SensorReading` types
- [ ] **Fallback mode** — detects BioSim unavailable on WS connect, auto-starts `engine.ts`, shows amber badge in HabitatHUD
- [ ] **Real malfunction injection** — AnomalyDrawer buttons POST to BioSim API with correct module + intensity + duration
- [ ] **Django bridge ingest** — `run_biosim_bridge` management command writes BioSim tick data to `enriched_sensor_data`; also drives `POST /tick` every 2s
- [ ] **Open MCT link** — nav button or link from `/habitat` pointing to `http://localhost:9091`

### Add After Validation (v2.x)

Add once the core pipeline is verified end-to-end.

- [ ] **Historical tick log in `/trends`** — wire `GET /api/simulation/{simID}/log` into Django, bulk-insert into `enriched_sensor_data`; `/trends` then shows real sim data
- [ ] **Malfunction scheduling** — optional `tickToOccur` field in AnomalyDrawer; low effort, high demo value when showing timed cascades
- [ ] **Malfunction ID tracking and real DELETE on cancel** — store POST response ID; DELETE on AnomalyDrawer cancel instead of bias ramp-down

### Future Consideration (v3+)

Defer indefinitely for this portfolio context.

- [ ] **Custom Open MCT telemetry plugin** — only worth building if Open MCT becomes a primary deliverable, not an adjacent link
- [ ] **Multiple XML mission scenarios selectable at runtime** — nice for replayability, not needed for portfolio
- [ ] **Tick speed UI control** — low value, high complexity in push-model architecture

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Docker Compose stack | HIGH | LOW | P1 |
| BioSim simulation auto-start | HIGH | LOW | P1 |
| Frontend WebSocket client | HIGH | MEDIUM | P1 |
| Module-to-zone translation layer | HIGH | MEDIUM | P1 |
| Fallback mode (detect and switch) | HIGH | HIGH | P1 |
| Real malfunction injection | HIGH | MEDIUM | P1 |
| Django bridge ingest | HIGH | HIGH | P1 |
| Open MCT link | MEDIUM | LOW | P1 |
| Historical tick log in /trends | MEDIUM | MEDIUM | P2 |
| Malfunction scheduling | MEDIUM | LOW | P2 |
| Malfunction ID and DELETE cancel | MEDIUM | LOW | P2 |
| Custom Open MCT plugin | LOW | HIGH | P3 |
| Tick rate UI control | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v2.0 launch
- P2: Add once P1 verified end-to-end
- P3: Future consideration only

---

## Implementation Patterns (Verified Research Findings)

### BioSim Simulation Lifecycle

BioSim has no auto-start or auto-tick. Everything is driven by REST calls.

**Lifecycle sequence:**
1. `POST /api/simulation/start` with XML config body — returns `simID` (integer)
2. `GET /api/simulation` — lists active simIDs (use this to detect if one is already running on restart)
3. `GET /api/simulation/{simID}` — full simulation state (use this to discover available module names)
4. `POST /api/simulation/{simID}/tick` — advances simulation by one step; must be called repeatedly by Django bridge
5. `ws://host:8009/ws/simulation/{simID}` — WS server pushes full state on connect, then after each tick
6. No explicit stop endpoint — simulation ends when crew death or tick limit reached per XML config; or kill the container

**Tick rate:** The Django bridge management command owns the tick loop (`POST /tick` every 2s). The frontend WS client is a pure receiver.

**Discovering module names:** Run `GET /api/simulation/{simID}` against a live simulation and extract module name strings from the response before hardcoding the translation layer. The BioSim docs give examples (OGS, VCCR, BiomassRS, WaterRS) but exact names depend on the XML scenario config.

### WebSocket Real-Time Streaming

BioSim WebSocket (HIGH confidence, from official BioSim repo):
- Endpoint: `ws://<host>:8009/ws/simulation/{simID}`
- On connect: server sends full simulation state immediately
- After each tick: server sends updated state
- Message format: JSON with full simulation state (module names, levels, capacities, flow rates)
- Multiple consumers can connect simultaneously — Django bridge and frontend both connect without coordination

**Frontend WS client pattern (`biosimClient.ts` or `useBioSimWebSocket` hook):**
1. Attempt connection on component mount; set `biosimStatus: 'connecting'` in Zustand
2. On `open`: set `biosimStatus: 'connected'`; stop `engine.ts` if running
3. On `message`: call translation function; dispatch resulting `ZoneState` records to `habitatStore.tick()`
4. On `error` or `close`: set `biosimStatus: 'fallback'`; start `engine.ts`
5. Reconnect with exponential backoff (start at 2s, cap at 30s)

### Fallback / Degraded Mode

Pattern (MEDIUM confidence, from multiple WebSocket reliability sources):

```
On mount:
    biosimStatus = 'connecting'
    attempt WS connect with 5s timeout

Connection result:
    SUCCESS → biosimStatus = 'connected', stop engine.ts
    TIMEOUT / ERROR → biosimStatus = 'fallback', start engine.ts

On unexpected WS close:
    biosimStatus = 'fallback'
    start engine.ts
    begin reconnect loop with exponential backoff

On WS reconnect success:
    stop engine.ts FIRST
    biosimStatus = 'connected'
```

Zustand store needs a `biosimStatus: 'connected' | 'fallback' | 'connecting'` field. HabitatHUD renders the badge from this field — green for connected, amber for fallback. `engine.ts` already exposes `start()` and `stop()` on the `SimulationEngine` interface; the WS client calls these as needed.

Critical constraint: never run both BioSim WS client and `engine.ts` simultaneously. Doing so would double-update sensor readings on every tick.

### Docker Service Health Checks and Readiness

Pattern (HIGH confidence, from Docker official docs):

BioSim healthcheck in docker-compose:
```yaml
biosim:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8009/api/simulation"]
    interval: 5s
    timeout: 3s
    retries: 10
    start_period: 30s  # JVM startup takes longer than container start
```

Django service dependency:
```yaml
django:
  depends_on:
    biosim:
      condition: service_healthy
```

Without `condition: service_healthy`, `depends_on` only waits for the container process to start. BioSim runs on JVM — the container starts before the REST API is accepting connections. `start_period: 30s` gives the JVM time to boot before health probes start counting failures.

### Malfunction Injection

BioSim malfunction API (HIGH confidence, from official docs and smoke test examples):
```json
POST /api/simulation/{simID}/modules/{moduleName}/malfunctions
{
  "intensity": "SEVERE_MALF",
  "length": "TEMPORARY_MALF",
  "tickToOccur": 0
}
```

Returns a malfunction object with an `id` field. Store this ID to support DELETE for cleanup on cancel.

**Mapping existing 4 AnomalyDrawer scenarios to BioSim modules:**

| AnomalyDrawer Scenario | BioSim Module | Intensity | Length |
|------------------------|---------------|-----------|--------|
| CO2 Spike | VCCR (CO2 removal fails, CO2 accumulates) | SEVERE_MALF | TEMPORARY_MALF |
| Pump Failure | WaterRS | SEVERE_MALF | TEMPORARY_MALF |
| Nutrient Crash | WaterRS | MEDIUM_MALF | TEMPORARY_MALF |
| Power Fluctuation | Power stores module | SEVERE_MALF | TEMPORARY_MALF |

Note: verify exact module name strings against a live `GET /api/simulation/{simID}` response before shipping. The mapping above uses expected names from BioSim docs but exact names depend on the XML scenario config.

**AnomalyDrawer integration points:**
- On scenario trigger: POST malfunction, store returned `id` in local state or Zustand
- On cancel: `DELETE /api/simulation/{simID}/modules/{moduleName}/malfunctions/{id}`
- In fallback mode (BioSim unavailable): fall back to existing `anomalies.ts` bias curve behavior unchanged

### Django Bridge Ingest

Pattern (MEDIUM confidence, from Django management command + asyncio + websockets library sources):

A `run_biosim_bridge` management command that:
1. Calls `GET /api/simulation` to find active simID; if none, calls `POST /api/simulation/start`
2. Connects to BioSim WS as an asyncio client using the `websockets` library
3. On each WS message: maps BioSim module state to zone/sensor format; writes rows to `enriched_sensor_data` using `database_sync_to_async` or `asyncio.to_thread()`
4. On the same 2s cadence: calls `POST /api/simulation/{simID}/tick` to advance the simulation
5. Handles reconnect if BioSim restarts

Run as a separate Docker Compose service command (e.g., `command: python manage.py run_biosim_bridge`) or via a Procfile. This is a long-running background service, not the Django web process.

The `django.setup()` call must come before any ORM usage inside the management command. Use `asyncio.run()` as the entry point.

### Open MCT Integration

Pattern (HIGH confidence, from BioSim repo and Open MCT tutorial):

BioSim's docker-compose already starts Open MCT on port 9091 configured to point at BioSim's telemetry. Zero custom plugin work is needed for the portfolio demo.

**v2.0 approach (recommended):** Add a nav button in HabitatHUD that opens `http://localhost:9091` in a new tab. One line of JSX.

**v2.x approach (optional):** Add a `/mct` route that renders an `<iframe src="http://localhost:9091" />`. Works for local Docker stack. Does not work on Firebase static hosting (no local BioSim). Fine for the portfolio demo context where Docker is required for BioSim features anyway.

Custom Open MCT plugin development (writing a telemetry provider, object provider, and composition provider to feed BioSim data into Open MCT's own plugin system) is explicitly an anti-feature for this milestone — it is weeks of work for zero additional visual impact beyond what the pre-bundled instance already shows.

### Historical Data Replay

Pattern (MEDIUM confidence, from BioSim docs and Django ORM patterns):

With `BIOSIM_WRITE_TICKS=true` set in docker-compose:
- `GET /api/simulation/{simID}/log` returns an array of tick snapshots with full module state per tick
- Django can query this endpoint and bulk-insert historical readings into `enriched_sensor_data`
- `/api/enriched/` and `/trends` then serve real data with no frontend changes required

An `import_biosim_log` management command handles one-shot import. The `run_biosim_bridge` command handles ongoing writes. Both write to the same `enriched_sensor_data` table with the same schema.

---

## v1.0 vs v2.0 Feature Comparison

| Feature | Client-Side v1.0 | BioSim v2.0 |
|---------|-----------------|-------------|
| Simulation engine | `engine.ts` — Brownian motion drift + noise + sol cycle | BioSim WS — physics-based module interconnections |
| Sensor correlations | Manually coded deltas (temp up, humidity down) | Emergent from physics model (O2 drop cascades to CO2 climb) |
| Anomaly realism | Scripted bias curves with hardcoded deltas | Real subsystem faults with cross-zone cascade effects |
| Anomaly cancel | Bias ramp-down over recovery ticks | `DELETE /malfunctions/{id}` — instant clean removal |
| Historical data | 30-value in-memory rolling window | Full tick log persisted to PostgreSQL |
| Cross-zone cascade | None — each zone independent | OGS fail → O2 drop → CO2 rise → Grow Bay impact |
| Data pipeline | Frontend only, Django endpoint unused | BioSim → Django → PostgreSQL → /api/enriched/ → /trends |
| Open MCT | Not present | Ships free with BioSim docker-compose |
| Portfolio credibility | "I built a 3D simulation" | "I integrated NASA's life support simulator" |

---

## Sources

- BioSim GitHub (scottbell/biosim): API reference, WebSocket protocol, malfunction parameters, docker-compose structure — HIGH confidence
- BioSim research paper (ISAIRAS 2003): subsystem module architecture — MEDIUM confidence
- Open MCT tutorial (nasa/openmct-tutorial): plugin architecture, telemetry provider pattern, embedding patterns — HIGH confidence
- Open MCT official (nasa.github.io/openmct): deployment and hosting patterns — HIGH confidence
- Django WebSocket client patterns (websockets.readthedocs.io): asyncio integration, `django.setup()` pattern — HIGH confidence
- Docker Compose health checks (docs.docker.com/reference/compose-file/services/): `condition: service_healthy`, `start_period` — HIGH confidence
- WebSocket fallback patterns (multiple sources): exponential backoff, status indicator UX — MEDIUM confidence
- Existing codebase: `simulation/engine.ts`, `simulation/anomalies.ts`, `store/habitatStore.ts`, `types/habitat.ts` — integration surface analysis — HIGH confidence

---
*Feature research for: BioSim Integration — Mars Habitat Demo v2.0*
*Researched: 2026-03-14*
