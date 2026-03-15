# Project Research Summary

**Project:** SpatialHub Mars Habitat Demo — BioSim Integration (v2.0)
**Domain:** Real-time physics simulation integration with IoT telemetry visualization (Docker + WebSocket + Django async bridge + 3D React frontend)
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

This milestone replaces SpatialHub's client-side Brownian motion simulation with NASA's open-source BioSim life support physics engine, creating a genuine IoT telemetry + real-time physics integration story for the portfolio. BioSim ships its own Docker Compose configuration (biosim-server + openmct-biosim), so the infrastructure work is additive: extend the existing compose file with Django and PostgreSQL services rather than building from scratch. The entire stack starts with a single `docker compose up`. The frontend connects directly to BioSim's WebSocket at `ws://localhost:8009/ws/simulation/{simID}` using a custom hook over the native browser WebSocket API — no new npm packages needed, and no Django proxy in the live data path.

The recommended architecture has two parallel, fully decoupled data consumers reading from a single BioSim WebSocket source: the React frontend (for live 3D visualization) and a Django management command bridge (for PostgreSQL persistence and historical trends). This separation is the central design decision. It keeps the deployment simple (no Redis, no Celery, no Django Channels activation for v2.0), preserves the existing `/api/enriched/` and `/trends` endpoints with zero frontend changes, and allows both consumers to be developed and tested independently after Docker infrastructure is confirmed working. The fallback story — where the demo degrades gracefully to the v1.0 client-side simulation when BioSim is unavailable — preserves the portfolio asset for reviewers without Docker.

The dominant risks are infrastructure startup ordering (BioSim's JVM takes 30-90 seconds to boot; `depends_on` without `condition: service_healthy` causes the bridge to crash silently), the async/sync boundary in the Django bridge (Django ORM requires `asyncio.to_thread()` inside async context or it raises `SynchronousOnlyOperation`), and the BioSim data model translation (BioSim exposes roughly 20 modules with nested properties and raw physical units; the habitat model expects 4 zones with human-readable sensor percentages). All three are solvable with known patterns — they must simply be addressed in the right phase order.

## Key Findings

### Recommended Stack

The existing validated stack (React 19, Vite, TypeScript, R3F/drei/three, Zustand v5, Django 5.2, DRF, PostgreSQL) is unchanged. V2.0 adds only what is strictly necessary to support BioSim integration.

**Core technologies (net-new only):**
- **Docker Compose v2**: Orchestrates BioSim + Open MCT + Django + PostgreSQL as `docker compose up`. BioSim has no pre-built image; builds from Maven source inside its own container. Use `eclipse-temurin:21-jdk-jammy` as the JDK base — the official `openjdk` Docker image is deprecated on Docker Hub.
- **`websockets` 16.0**: Async WebSocket client library for the Django bridge management command. All ORM calls inside the async event loop must use `asyncio.to_thread()` — Django 5.2 ORM is synchronous-only. This is the correct primitive for a WS _client_; Django Channels is for _serving_ WS connections, not consuming them.
- **`daphne` 4.2.1**: ASGI server replacing Gunicorn in the Django Docker service. Required so future WebSocket endpoint additions don't force a server swap. Pairs with `channels` 4.3.2, which is included in requirements now but not wired up in v2.0.
- **Native browser `WebSocket` API**: Zero npm packages. `react-use-websocket` v4.0.0 explicitly does NOT support React 19 — confirmed by the maintainer in GitHub issue #256 (December 2024). A custom `useBioSimWebSocket` hook wrapping the native API is 40-60 lines, has no peer dependency problem, and gives complete control over the fallback detection logic.
- **BioSim (scottbell/biosim HEAD)**: NASA life support physics engine. REST API + WebSocket on port 8009. GPL v3 — network communication over the Docker bridge network is safe; copying source files or linking against the Java library is not.
- **Open MCT (via BioSim's compose file)**: Ships preconfigured and zero-config on port 9091 as part of BioSim's own docker-compose. Access via a new tab link from the nav — do not iframe it.

### Expected Features

**Must have (v2.0 table stakes):**
- Docker Compose stack — `docker compose up` starts all four services; no manual setup required for a reviewer
- BioSim simulation auto-start — simulation begins on Django startup with bundled XML config; no manual curl required
- Frontend WebSocket client (`useBioSimWS`) — replaces `engine.ts` setInterval as the live data source; drives `habitatStore` with real physics
- Module-to-zone translation layer (`biosimMapper.ts`) — pure function mapping BioSim module hierarchy to existing `ZoneState`/`SensorReading` types
- Fallback mode — detects BioSim unavailable within 2-5 seconds, activates `engine.ts`, shows amber "Fallback Mode" badge in HabitatHUD; exactly one data source active at any time
- Real malfunction injection — AnomalyDrawer buttons POST to BioSim API; existing component JSX is untouched
- Django bridge ingest (`biosim_bridge` management command) — writes BioSim tick data to `enriched_sensor_data`; drives `POST /tick` every 2s
- Open MCT nav link — one line of JSX pointing to `http://localhost:9091`

**Should have (v2.x after validation):**
- Historical tick log in `/trends` — `GET /api/simulation/{simID}/log` bulk-inserted into `enriched_sensor_data`; `/trends` shows real sim data with no frontend changes
- Malfunction scheduling (`tickToOccur`) — optional delay field in AnomalyDrawer; low effort, high demo value
- Malfunction ID tracking and real DELETE on cancel — store POST response ID; DELETE on AnomalyDrawer cancel instead of bias ramp-down

**Defer to v3+ (not this milestone):**
- Custom Open MCT telemetry plugin — weeks of work for zero visual gain beyond what ships pre-configured
- Tick rate UI control — breaks the push-model WebSocket architecture
- Multiple XML mission scenarios selectable at runtime — scope creep with no portfolio ROI
- Authentication or session management — BioSim has no auth model; out of scope per PROJECT.md

### Architecture Approach

The architecture has two fully decoupled data consumers on a single BioSim WebSocket source. The React frontend subscribes via `useBioSimWS` hook and drives the Zustand store with `store.tick(readings)` — the same signature `engine.ts` already uses. The Django bridge subscribes via a long-running async management command and writes rows to `enriched_sensor_data` via `asyncio.to_thread(bulk_create)`. Neither consumer knows or cares about the other. Source-awareness in the frontend is isolated to `useSimSource` (availability probe) and `habitatStore` (routing in `triggerAnomaly`). All 3D scene components (`HabitatStructure`, `ZonePanel`, `HabitatHUD`, etc.) are zero-touch — they read `ZoneState` from the store and don't care where it came from.

**Major components:**
1. **`useBioSimWS` hook** (`src/simulation/useBioSimWS.ts`) — WebSocket lifecycle, reconnect, RAF-buffered tick dispatch to store; mounted only in `HabitatView.tsx`, not inside the R3F Canvas
2. **`biosimMapper.ts`** (`src/simulation/biosimMapper.ts`) — pure TypeScript; BioSim module hierarchy → `Record<zoneId, Record<sensorId, SensorReading>>`; independently unit-testable with real BioSim state snapshots
3. **`useSimSource` hook** (`src/simulation/useSimSource.ts`) — HTTP probe to BioSim `/api/simulation` with 2s timeout; sets `simSource` in Zustand; activates either `useBioSimWS` or `createSimulationEngine()`, never both simultaneously
4. **`biosim_bridge` management command** (`sensor_data/management/commands/biosim_bridge.py`) — long-running asyncio process; uses `asyncio.to_thread()` for all ORM writes; runs as a separate `django-bridge` Docker service sharing the Django image
5. **`biosim_ingest.py`** (`sensor_data/biosim_ingest.py`) — pure Python; BioSim state → `EnrichedSensorData` rows; no ORM imports, no async — independently testable
6. **`docker-compose.yml`** (repo root) — extends BioSim's two services with django, django-bridge, and db services; healthchecks with `start_period: 90s` for JVM boot time; `BIOSIM_WRITE_TICKS=true` env var set from the start

### Critical Pitfalls

1. **Docker startup race (BioSim JVM takes 30-90s)** — Use `condition: service_healthy` not `condition: service_started` in `depends_on`. Define the BioSim healthcheck with `start_period: 90s` before writing any bridge code. The bridge must also implement its own exponential backoff retry loop. Failure mode: bridge crashes silently at startup, no data flows into PostgreSQL, no error surfaced to the user.

2. **Django async/sync ORM boundary** — Inside the asyncio event loop, all Django ORM calls must use `asyncio.to_thread()`. Calling ORM directly raises `SynchronousOnlyOperation` or blocks the event loop, causing WebSocket message drops. Call `django.db.close_old_connections()` periodically to prevent connection pool exhaustion in the long-running bridge command.

3. **BioSim data model translation** — BioSim exposes raw physical units (mol, Pa, flow rates) in a deep module hierarchy. The habitat model expects human-readable percentages in a flat 4-zone structure. Map explicitly with documented unit conversions in `biosimMapper.ts`. Run the mapper against a real `GET /api/simulation/{simID}` response — captured during Phase 1 — before writing any component code. Do not trust module name strings from docs without live verification.

4. **Fallback race condition (both engine and WS active simultaneously)** — Implement fallback as a state machine (`CONNECTING → LIVE | FALLBACK → RECOVERING`), not a one-time check. Stop `engine.ts` before switching to BioSim. Enforce exactly one active data source via a `dataSource: 'biosim' | 'engine' | 'none'` flag in Zustand. Failure mode: flickering zone statuses, duplicate store updates, incoherent sensor history.

5. **WebSocket cleanup on navigation** — The `useEffect` cleanup must call `ws.close()` and null out `ws.onmessage`. Without it, stale handlers continue writing to the store after unmount, and each return to `/habitat` opens another connection. Test by navigating away and back 5 times; verify only one WS connection in DevTools Network > WS panel.

6. **WebSocket message flooding React re-renders** — BioSim can broadcast faster than the 2s tick rate configured in the XML. Buffer incoming messages in a `useRef` array and flush only the most recent state snapshot on each `requestAnimationFrame` cadence. Do not call `store.setState()` directly from the `onmessage` callback.

## Implications for Roadmap

Research reveals a clear dependency chain that dictates phase order. Phase 1 (Docker + BioSim smoke test) is the hard prerequisite for everything else — no mapping work, no bridge work, and no frontend integration work can be meaningfully executed against speculative BioSim API responses. The actual module hierarchy must be confirmed from a live `GET /api/simulation/{simID}` response before any code that parses BioSim output is written.

### Phase 1: Docker Infrastructure and BioSim Smoke Test

**Rationale:** Everything downstream depends on BioSim running and the actual module hierarchy being known. This is the single hard blocking dependency in the entire milestone. No mapping work is valid without live confirmation.

**Delivers:** `docker compose up` starts all four services (biosim, openmct, db, django); BioSim returns a valid simID; `GET /api/simulation/{simID}` JSON response is captured and saved as a test fixture; `wscat ws://localhost:8009/ws/simulation/1` prints valid module state JSON; healthchecks confirmed working.

**Addresses:** Docker Compose stack, BioSim simulation auto-start, `BIOSIM_WRITE_TICKS=true` env var (must be set before any tick data is collected — cannot be enabled retroactively)

**Avoids:** Pitfall 18 (Docker startup race — define healthchecks here before writing any bridge code), Pitfall 22 (GPL boundary — network communication only, no source file copying)

**Key deliverable:** A saved JSON snapshot of real BioSim module state at `ws://localhost:8009/ws/simulation/{simID}`. This snapshot is the ground-truth spec for all mapping work in Phase 2.

### Phase 2: BioSim Data Mapping Layer

**Rationale:** Translation is the most complex and most error-prone integration concern. Building it as a pure function before wiring any live connections makes it independently testable. All subsequent phases depend on a known-good data contract between BioSim's module output and the existing `ZoneState`/`SensorReading` types.

**Delivers:** `biosimMapper.ts` (TypeScript) and `biosim_ingest.py` (Python) — both pure functions with unit tests fed by the Phase 1 JSON snapshot; exact module name strings confirmed against live data; unit conversion formulas (mol → %, Pa → %, flow rates → proxy values) documented and verified.

**Uses:** TypeScript (existing), Python (existing) — no new dependencies in this phase

**Implements:** `biosimMapper.ts` and `biosim_ingest.py` component boundaries from ARCHITECTURE.md

**Avoids:** Pitfall 19 (BioSim data model mismatch — explicit unit conversions, `null` returns for unmapped properties rather than silent zero), Pitfall 9 (anomaly simulation unrealism — cascades emerge correctly from physics if mapping is accurate)

### Phase 3: Frontend WebSocket Client and Fallback Mode

**Rationale:** Once the mapping layer is tested against real snapshots, wiring the WS client is mechanical. Fallback mode must be built in the same phase — the state machine design cannot be safely retrofitted after components are already reading from the store.

**Delivers:** `useBioSimWS` hook; `useSimSource` hook; `habitatStore` updated with `simSource`, `simId`, `activeMalfunctionIds`; `HabitatView.tsx` updated to use `useSimSource` instead of `startSimulation()`; HabitatHUD badge ("BioSim Connected" green / "Fallback Mode" amber); 3D scene responds to real BioSim physics when Docker is running, falls back to `engine.ts` when it is not.

**Uses:** Native browser `WebSocket` API (no npm install), Zustand v5 (existing), React 19 (existing)

**Implements:** Pattern 1 (WS hook as tick provider) and Pattern 2 (source swapping via useSimSource) from ARCHITECTURE.md

**Avoids:** Pitfall 16 (WS cleanup on navigation — cleanup in useEffect return), Pitfall 17 (WS message flooding — RAF buffer flush), Pitfall 21 (fallback race condition — state machine with `dataSource` mutex)

### Phase 4: AnomalyDrawer Rewire and Real Malfunction Injection

**Rationale:** Depends on Phase 3 (`simSource` must exist in the Zustand store). AnomalyDrawer JSX is untouched — source routing lives entirely in `habitatStore.triggerAnomaly()`. Low complexity once the store additions from Phase 3 are in place.

**Delivers:** `triggerAnomaly` routes to BioSim malfunction API (`POST /api/simulation/{simID}/modules/{module}/malfunctions`) in `'biosim'` mode; existing anomaly bias behavior preserved in `'engine'` fallback mode; malfunction IDs stored in Zustand for cancel support.

**Uses:** Native `fetch()` to BioSim REST (no new dependencies)

**Implements:** Pattern 4 (source-aware AnomalyDrawer dispatch) from ARCHITECTURE.md

**Avoids:** Anti-Pattern 2 (source logic scattered in components — routing lives in the store, not in AnomalyDrawer.tsx), Pitfall 3 (blocking main thread — malfunction POST is async fetch, not synchronous)

### Phase 5: Django Bridge (Parallel with Phases 2-4)

**Rationale:** The bridge is independent of all frontend work. It can be developed in parallel once Phase 1 delivers a running BioSim. It shares `biosim_ingest.py` with Phase 2 mapping work, so that module's completion unblocks both consumers.

**Delivers:** `biosim_bridge` management command; `django-bridge` Docker service definition in compose; BioSim tick data appearing in `enriched_sensor_data`; `/api/enriched/` and `/trends` serving real simulation data with no endpoint or frontend changes.

**Uses:** `websockets` 16.0 (new), `daphne` 4.2.1 (new), `channels` 4.3.2 (new, not yet wired); `asyncio.to_thread()` throughout for ORM writes

**Implements:** Pattern 5 (management command bridge) from ARCHITECTURE.md

**Avoids:** Pitfall 18 (startup race — bridge retries with exponential backoff), Pitfall 20 (async/sync ORM boundary — `asyncio.to_thread()` wraps all `bulk_create` calls)

### Phase 6: Open MCT Link and Docker Polish

**Rationale:** Lowest effort, highest credibility gain. The openmct-biosim service is already running from Phase 1 at port 9091. This phase adds the nav link and tidies the compose file for one-command reviewer experience.

**Delivers:** Nav link from the frontend app to `http://localhost:9091` (opens in new tab); docker-compose with all healthchecks and `depends_on` conditions verified; compose output is clean with no error noise on `docker compose up`.

**Uses:** Open MCT (already in BioSim's compose, zero configuration required)

**Implements:** Open MCT standalone nav link (not iframe) from ARCHITECTURE.md

**Avoids:** Anti-Pattern 6 (iframe crops Open MCT's full-viewport layout — new tab is correct)

### Phase 7: v2.x Enhancements (Post End-to-End Validation)

**Rationale:** Add only once the full pipeline (Phases 1-6) is verified working end-to-end. Historical log import and malfunction scheduling are additive, not load-bearing. Do not start this phase until `/trends` shows live BioSim data and the fallback mode is confirmed working on a clean non-Docker environment.

**Delivers:** Historical tick log in `/trends` (Django `import_biosim_log` command using `GET /api/simulation/{simID}/log`); malfunction scheduling (`tickToOccur` field in AnomalyDrawer); real `DELETE` on cancel using stored malfunction IDs.

### Phase Ordering Rationale

- **Phase 1 must be first.** No mapping, bridge, or frontend integration code can be correctly written against speculative BioSim output. The module names in the docs are examples; live inspection is required before any translation logic is written.
- **Phase 2 enables Phases 3, 4, and 5.** The mapping layer is the shared contract. Both the frontend hook and the Django bridge depend on knowing the exact BioSim property paths and unit conversions.
- **Phases 3, 4, and 5 can proceed in parallel** after Phase 2. Frontend WS work (Phases 3-4) and bridge work (Phase 5) are completely independent — they consume BioSim independently and write to independent destinations.
- **Phase 4 depends on Phase 3.** `simSource` state must exist in the Zustand store before `triggerAnomaly` routing can be implemented.
- **Phase 6 can be done any time after Phase 1.** The Open MCT service is already running; this phase is just the nav link.
- **Phase 7 gates on end-to-end validation.** Do not add enhancements until the core pipeline is working and verified in both Docker and static-hosting (fallback) modes.

### Research Flags

Phases requiring deeper research or live verification during planning:

- **Phase 1 / Phase 2:** The BioSim module hierarchy — exact property names, nesting depth, unit types — is the highest-uncertainty area in the entire milestone. Research provides expected module names (OGS, VCCR, BiomassRS, WaterRS) but all mapping work must be deferred until a live `GET /api/simulation/{simID}` response is captured. This is a Phase 1 execution prerequisite, not a separate research task.
- **Phase 1:** BioSim Docker build time via Maven in `eclipse-temurin:21-jdk-jammy` has not been benchmarked in this environment. First `docker compose up` may take 10-20 minutes on a cold Maven cache. Set expectations before running.

Phases with well-documented patterns (research-phase optional):

- **Phase 3:** Native WebSocket hook patterns and Zustand state machine design are fully specified in ARCHITECTURE.md and backed by official `websockets` docs. No additional research needed.
- **Phase 5:** Django management command + asyncio + `websockets` library pattern is documented in the official `websockets` Django integration guide and fully specified in ARCHITECTURE.md and STACK.md.
- **Phase 6:** One nav link. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All version claims verified against PyPI, npm, and official docs. `react-use-websocket` React 19 incompatibility confirmed by maintainer. `eclipse-temurin` vs `openjdk` confirmed from Docker Hub. |
| Features | HIGH | BioSim API documented from actual source repo. Feature dependency graph fully resolved. MVP vs. v2.x scope is clear and justified against PROJECT.md constraints. |
| Architecture | HIGH | All integration points derived from actual BioSim source code and confirmed API reference. Component boundaries are precise; all "unchanged" component claims verified against actual codebase files listed in ARCHITECTURE.md sources. |
| Pitfalls | MEDIUM | v1.0 Three.js/R3F pitfalls are pattern-knowledge (well-established, not web-verified against latest releases). BioSim v2.0 pitfalls are HIGH confidence for Django/WebSocket/Docker (official docs verified); MEDIUM for BioSim-specific runtime behavior (limited external documentation, inferred from architecture research). |

**Overall confidence:** HIGH

### Gaps to Address

- **BioSim module name verification (Phase 1 execution):** The exact module names and property paths returned by a live `GET /api/simulation/{simID}` must be captured before writing `biosimMapper.ts` or `biosim_ingest.py`. Treat the Phase 1 JSON snapshot as the ground truth specification, not the BioSim docs.
- **BioSim XML scenario tuning (Phase 1-2):** The bundled XML mission config will need to be tuned for demo pacing — appropriate tick rate, crew size, and resource levels that produce interesting sensor dynamics without the crew dying in the first 10 minutes. This is discovered through integration testing, not pre-researchable.
- **Django settings.py PostgreSQL credentials for local Docker:** `settings.py` currently uses Cloud SQL credentials. The docker-compose environment variables (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`) must be wired into `settings.py` as fallback defaults for the local stack to connect. Minor, but required before the bridge can write to the local database.
- **BioSim Docker build time on first pull:** Maven dependency downloads during `docker build` may take significant time on a cold cache. This does not affect architecture but affects developer experience during Phase 1 and should be documented in the setup notes.

## Sources

### Primary (HIGH confidence)
- [PyPI channels 4.3.2](https://pypi.org/project/channels/) — version, Django/Python compatibility
- [PyPI daphne 4.2.1](https://pypi.org/project/daphne/) — version, Python compatibility
- [PyPI websockets 16.0](https://pypi.org/project/websockets/) — version, Python requirements, Django integration pattern
- [websockets Django integration guide](https://websockets.readthedocs.io/en/stable/howto/django.html) — `asyncio.to_thread()` pattern, `django.setup()` in management commands
- [Django Channels deploying docs](https://channels.readthedocs.io/en/latest/deploying.html) — Daphne as official ASGI server for Channels projects
- [scottbell/biosim docker-compose.yml](https://raw.githubusercontent.com/scottbell/biosim/main/docker-compose.yml) — confirmed service names, ports (8009, 9091), build directives, no pre-built image
- [Docker Hub eclipse-temurin](https://hub.docker.com/_/eclipse-temurin/) — replacement for deprecated `openjdk` Docker image
- [Docker Compose networking docs](https://docs.docker.com/compose/how-tos/networking/) — service-name DNS resolution on shared bridge network
- [Docker Compose healthcheck reference](https://docs.docker.com/reference/compose-file/services/) — `condition: service_healthy`, `start_period`
- Existing codebase (source of truth for all component boundary claims): `habitatStore.ts`, `engine.ts`, `anomalies.ts`, `AnomalyDrawer.tsx`, `HabitatView.tsx`, `habitat.ts`, `models.py`, `views.py`, `settings.py`, `asgi.py`, `Dockerfile`
- BioSim GitHub (scottbell/biosim): API reference, WebSocket protocol, malfunction parameters
- Open MCT official (nasa.github.io/openmct): embedding patterns, plugin architecture

### Secondary (MEDIUM confidence)
- [GitHub robtaussig/react-use-websocket issue #256](https://github.com/robtaussig/react-use-websocket/issues/256) — maintainer confirmed React 19 incompatibility (December 2024)
- WebSocket fallback patterns (multiple sources) — exponential backoff, status indicator UX, state machine design
- WebSearch: Celery vs. management command for simple polling (2025) — community consensus favors management command for single-task use cases
- BioSim research paper (ISAIRAS 2003) — subsystem module architecture (pre-dates current codebase)

### Tertiary (LOW confidence)
- BioSim XML scenario tuning parameters — inferred from architecture; must be validated against live simulation behavior during Phase 1-2

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
