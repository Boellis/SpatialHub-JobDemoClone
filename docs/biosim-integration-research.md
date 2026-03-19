# BioSim Integration Research

> NASA JSC life support simulator as the physics engine behind the Mars Habitat Demo

**Date:** 2026-03-14
**Source:** https://github.com/scottbell/biosim
**License:** GPL v3

---

## What BioSim Is

BioSim is a NASA Johnson Space Center research project — a portable, physics-based simulation of an integrated advanced life support system for long-duration space missions. It models interconnected subsystems (air, water, food, power, crew) with realistic resource flows, malfunctions, and environmental perturbations.

- Written in Java (JDK 21+), built with Maven
- REST API + WebSocket for real-time state streaming
- Docker Compose deployment (BioSim on `:8009`, Open MCT on `:9091`)
- XML-based mission scenario configuration
- 2,739 commits, actively maintained
- Used in published research: machine learning, reliability analysis, genetic algorithm optimization, reinforcement learning for autonomous control

---

## BioSim API Reference

### Simulation Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/simulation` | List active simulation IDs |
| `GET` | `/api/simulation/{simID}` | Full simulation state (properties + modules) |
| `POST` | `/api/simulation/start` | Start new simulation (accepts XML config body) |
| `POST` | `/api/simulation/{simID}/tick` | Advance simulation one step |
| `GET` | `/api/simulation/{simID}/log` | Historical run data (requires `--writeTicks`) |

### Module Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/simulation/{simID}/modules/{moduleName}` | Module details (levels, capacities, flow rates) |
| `POST` | `/api/simulation/{simID}/modules/{moduleName}/consumers/{type}` | Configure consumption |
| `POST` | `/api/simulation/{simID}/modules/{moduleName}/producers/{type}` | Configure production |

### Malfunction Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/simulation/{simID}/modules/{moduleName}/malfunctions` | List module malfunctions |
| `POST` | `/api/simulation/{simID}/modules/{moduleName}/malfunctions` | Create malfunction |
| `DELETE` | `/api/simulation/{simID}/modules/{moduleName}/malfunctions/{id}` | Remove specific malfunction |
| `DELETE` | `/api/simulation/{simID}/modules/{moduleName}/malfunctions` | Clear all malfunctions |

**Malfunction parameters:**
- **Intensity:** `SEVERE_MALF`, `MEDIUM_MALF`, `LOW_MALF`
- **Duration:** `TEMPORARY_MALF`, `PERMANENT_MALF`
- **Scheduling:** Immediate or future tick

### WebSocket

```
ws://<host>:<port>/ws/simulation/{simID}
```

Broadcasts full simulation state on connection, then after each tick.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BIOSIM_HOST` | `0.0.0.0` | Server bind address |
| `BIOSIM_PORT` | `8009` | Server port |
| `BIOSIM_WRITE_TICKS` | `false` | Enable tick logging for `/log` endpoint |

---

## What BioSim Simulates

- Water storage and distribution (potable, grey, dirty water loops)
- Atmospheric revitalization (CO2 removal via VCCR, O2 generation via OGS)
- Hydrogen and oxygen handling
- Biomass/crop growth (BiomassRS modules)
- Power generation and distribution
- Thermal management
- Crew metabolic consumption
- Module-based producers/consumers with configurable flow rates

Key property: **subsystems are genuinely interconnected.** Breaking the water recycler will eventually kill the crops because resources actually flow between modules.

---

## Integration with SpatialHub Mars Habitat

### Current State (v1.0)

The Mars Habitat Demo at `/habitat` runs a **client-side-only simulation**:
- Zustand store with 12 sensors across 4 zones
- Brownian motion drift + sol cycle + noise
- Hardcoded anomaly scenarios (CO2 spike, pump failure, nutrient crash, power fluctuation)
- No backend involvement — Django endpoint exists but is unused

### Zone-to-Module Mapping

| SpatialHub Zone | BioSim Modules |
|-----------------|----------------|
| Grow Bays | BiomassRS (crop modules), CO2 stores |
| Atmosphere Control | OGS (O2 generator), VCCR (CO2 removal), cabin air stores |
| Water Recycling | WaterRS, potable/grey/dirty water stores |
| Power/Thermal | Power stores, thermal management modules |

### Target Architecture

```
BioSim (Java, Docker :8009)
    |
    +-- WebSocket --> React frontend (replaces engine.ts)
    |                  \-- Map BioSim module state to 4 ZoneState objects
    |
    +-- REST API ---> Django backend (new proxy/ingest endpoint)
    |                  \-- Store sim readings in enriched_sensor_data
    |
    +-- Malfunctions <-- AnomalyDrawer (POST to BioSim API)
                          \-- Replace hardcoded scenarios with real faults
```

### What Changes

| Layer | Current | With BioSim |
|-------|---------|-------------|
| Simulation engine | `simulation/engine.ts` (client-side random drift) | BioSim WebSocket client mapping module state to ZoneState |
| Anomaly system | `simulation/anomalies.ts` (hardcoded phase transitions) | POST malfunctions to BioSim REST API |
| Sensor correlations | Manual deltas (temp up -> humidity down) | Emergent from physics model |
| Data persistence | None | Django ingests BioSim readings into `enriched_sensor_data` |
| Historical data | 30-value rolling window in memory | Full tick log via `/api/simulation/{simID}/log` |

### Implementation Steps

1. **Add BioSim to docker-compose** — single service, port 8009, with `--writeTicks`
2. **Create Django bridge service** — management command or Celery task that:
   - Connects to BioSim WebSocket
   - Maps module readings to zone/sensor format
   - Writes to `enriched_sensor_data` table
3. **Build frontend WebSocket client** — new module that:
   - Connects to BioSim WebSocket (or Django proxy)
   - Transforms BioSim module state into existing `ZoneState` / `SensorReading` types
   - Replaces `simulation/engine.ts` as the data source
4. **Rewire AnomalyDrawer** — each scenario button POSTs a malfunction to BioSim REST API
5. **Fallback mode** — if BioSim container isn't running, fall back to current client-side simulation (preserves static hosting capability)

### Key Risks

- **Data mapping complexity** — BioSim's module hierarchy doesn't map 1:1 to our 4 zones; need a translation layer
- **Tick rate alignment** — BioSim tick speed vs our 2-second interval needs calibration
- **GPL v3 license** — copyleft; integration approach matters (REST/WebSocket = safe, no code linking)
- **Java dependency** — adds JDK 21 to the stack (Docker isolates this)

### Value Proposition

- "Powered by NASA BioSim" — instant portfolio credibility
- Emergent cascading failures instead of scripted animations
- Infinite mission scenarios via XML configs
- Open MCT visualization comes free with Docker Compose
- Backend integration pipeline finally used (Django API serves real sim data)
- Real anomaly investigation vs "click button, watch red"

---

## Running BioSim Locally

```bash
# Clone
git clone https://github.com/scottbell/biosim.git
cd biosim

# Option A: Docker (recommended)
docker compose up
# BioSim API: http://localhost:8009/api/simulation
# Open MCT:   http://localhost:9091

# Option B: Native
mvn clean package
bin/start-biosim-server --writeTicks -p 8009
```

### Quick Smoke Test

```bash
# Start a simulation
curl -X POST http://localhost:8009/api/simulation/start \
  -H "Content-Type: application/xml" \
  -d @path/to/config.xml

# List active sims
curl http://localhost:8009/api/simulation

# Advance one tick
curl -X POST http://localhost:8009/api/simulation/1/tick

# Get full state
curl http://localhost:8009/api/simulation/1

# Inject malfunction
curl -X POST http://localhost:8009/api/simulation/1/modules/OGS/malfunctions \
  -H "Content-Type: application/json" \
  -d '{"intensity": "SEVERE_MALF", "duration": "TEMPORARY_MALF"}'
```
