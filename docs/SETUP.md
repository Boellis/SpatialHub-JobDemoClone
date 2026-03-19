# SpatialHub Setup & Running Guide

SpatialHub is an IoT telemetry platform for indoor farming with a Mars habitat demo powered by NASA BioSim physics. This guide covers all ways to run the project.

## Prerequisites

- **Docker Desktop** (required for full stack)
- **Node.js 18+** and **npm** (for frontend development)
- **Python 3.11+** (for backend development without Docker)
- **Git**

## Quick Start (Docker — Recommended)

The full stack runs with a single command. First build takes 10-20 minutes (BioSim Maven compile + Open MCT npm install). Subsequent builds use layer cache.

### 1. Create environment file

```bash
cp .env.example .env
# Edit .env with your values, or use defaults:
```

Required `.env` variables:

```env
DB_HOST=db
DB_NAME=spatialhub_db
DB_USER=postgres
DB_PASS=your_password_here
```

### 2. Start the stack

```bash
docker compose up --build -d
```

This starts 5 services:

| Service | Port | Description |
|---------|------|-------------|
| `db` | 5432 | PostgreSQL 16 with persistent volume |
| `biosim` | 8009 | NASA BioSim life support simulation (auto-starts simulation) |
| `openmct` | 9091 | Open MCT telemetry dashboard |
| `django` | 8000 | Django REST API (runs migrations + seeds on boot) |
| `bridge` | — | BioSim WebSocket bridge (ingests ticks into PostgreSQL) |

### 3. Verify services are healthy

```bash
docker compose ps
```

All services should show `healthy` or `running`. BioSim takes ~90 seconds for JVM startup.

### 4. Start the frontend

```bash
cd spatialhub-frontend
npm install
VITE_API_URL=http://localhost:8000/api npm run dev
```

> Set `VITE_API_URL` to point the frontend at the local Django container instead of the production Cloud Run instance.

### 5. Open in browser

| URL | What you see |
|-----|-------------|
| http://localhost:5173 | React frontend (hub provisioning) |
| http://localhost:5173/habitat | 3D Mars habitat with live BioSim data |
| http://localhost:5173/trends | Sensor trend graphs |
| http://localhost:5173/raw | Raw sensor data table |
| http://localhost:5173/enriched | Enriched sensor data table |
| http://localhost:8000/api/enriched/ | Django REST API (JSON) |
| http://localhost:8009/api/simulation | BioSim simulation status |
| http://localhost:9091 | Open MCT dashboard |

## Service Details

### BioSim Simulation

BioSim auto-starts a simulation on boot with the bundled `configuration/default.biosim` XML mission config. The `--writeTicks` flag enables historical tick logging.

```bash
# Check simulation status
curl http://localhost:8009/api/simulation

# View bridge ingestion logs
docker compose logs -f bridge

# Bulk import historical ticks
docker compose exec django python manage.py biosim_import_log
```

### Django Entrypoint

On startup, the Django container automatically:
1. Runs `python manage.py migrate` (database migrations)
2. Runs `python manage.py seed_habitat_zones` (habitat zone data)
3. Starts Gunicorn on port 8000

### Bridge Service

The `bridge` service is a long-running Django management command that:
- Connects to BioSim's WebSocket
- Translates each tick via `biosim_tick_to_rows()`
- Writes rows to `enriched_sensor_data` via `bulk_create`
- Auto-reconnects with exponential backoff (1→30s)
- Restarts automatically if it crashes (`restart: unless-stopped`)

## Frontend-Only Development (No Docker)

The 3D habitat works without Docker — it falls back to a client-side simulation engine.

```bash
cd spatialhub-frontend
npm install
npm run dev
```

Navigate to http://localhost:5173/habitat. You'll see an amber "Fallback Mode" badge. When Docker is running with BioSim, it auto-detects and switches to real physics data (green "BioSim Live" badge).

## Backend-Only Development (No Docker)

```bash
cd django_backend

# Option A: Use SQLite (no PostgreSQL needed)
USE_SQLITE=1 python3 manage.py migrate
USE_SQLITE=1 python3 manage.py runserver

# Option B: Connect to Cloud SQL (requires network access)
python3 manage.py migrate
python3 manage.py runserver
```

The `USE_SQLITE=1` flag switches Django to a local SQLite database — useful for development and testing without PostgreSQL.

## Running Tests

### Frontend tests (vitest)

```bash
cd spatialhub-frontend
npm run test
```

92+ tests covering: biosimMapper, habitatStore, biosimWorker, useSimSource, ConnectionBadge, biosimMalfunctions.

### Backend tests (pytest)

```bash
cd django_backend
USE_SQLITE=1 python3 -m pytest sensor_data/tests/ -v
```

33+ tests covering: biosim_ingest, biosim_bridge, biosim_import_log.

### Full frontend build check

```bash
cd spatialhub-frontend
npm run build   # tsc -b && vite build
npm run lint    # ESLint
```

## Architecture

```
Raspberry Pi → Cloud Function (ingest) → Pub/Sub → Cloud Function (enrich) → PostgreSQL
                                                                                  ↑
BioSim (Docker) → WebSocket → bridge service → bulk_create ─────────────────────┘
                                                                                  ↓
                                                              Django API ← React Frontend
```

### Data Flow (BioSim path)

1. BioSim simulates Mars habitat physics (atmosphere, water, power, thermal)
2. Bridge service connects via WebSocket, receives tick data
3. `biosim_tick_to_rows()` translates BioSim modules to `EnrichedSensorData` rows
4. `bulk_create` writes rows to PostgreSQL
5. Django REST API serves rows at `/api/enriched/`
6. Frontend Worker connects directly to BioSim WebSocket for real-time 3D visualization
7. `biosimMapper.ts` translates the same data for the Zustand store → Three.js scene

### Key Directories

```
├── biosim.Dockerfile          # Multi-stage BioSim build (Maven → JRE)
├── docker-compose.yml         # 5-service stack orchestration
├── Dockerfile                 # Django/Gunicorn image
├── django_backend/
│   ├── sensor_data/
│   │   ├── models.py          # EnrichedSensorData, RawSensorData, HubConfig
│   │   ├── views.py           # REST API views
│   │   ├── biosim_ingest.py   # Pure translation: BioSim tick → Django rows
│   │   └── management/commands/
│   │       ├── biosim_bridge.py      # Long-running WS consumer
│   │       └── biosim_import_log.py  # One-shot bulk tick importer
│   └── spatialhub_backend/
│       └── settings.py        # DB config, CORS, USE_SQLITE toggle
├── spatialhub-frontend/
│   ├── src/
│   │   ├── pages/             # Route components
│   │   ├── components/habitat/ # 3D scene, HUD, AnomalyDrawer
│   │   ├── simulation/        # biosimMapper.ts, constants.ts, engine
│   │   ├── workers/           # biosimWorker.ts (WS in Web Worker)
│   │   ├── hooks/             # useSimSource.ts (WS orchestration)
│   │   ├── store/             # habitatStore.ts (Zustand)
│   │   └── api/               # api.ts (axios REST client)
│   └── package.json
├── functions/                 # GCP Cloud Functions (ingest, enrich, command)
├── hubcode/                   # Raspberry Pi sensor reading scripts
└── tests/
    └── fixtures/
        └── biosim_module_state.json  # Live BioSim capture for tests
```

## Common Operations

### Restart a single service

```bash
docker compose restart bridge
docker compose restart django
```

### View logs

```bash
docker compose logs -f bridge    # Bridge ingestion
docker compose logs -f django    # Django API
docker compose logs -f biosim    # BioSim simulation
```

### Reset database

```bash
docker compose down -v           # Removes pgdata volume
docker compose up --build -d     # Fresh start with migrations + seed
```

### Bulk import historical BioSim data

```bash
docker compose exec django python manage.py biosim_import_log
```

This is idempotent — running it twice produces the same result (clears and reimports).

## Environment Variables

| Variable | Default | Used By | Description |
|----------|---------|---------|-------------|
| `DB_HOST` | `35.202.183.120` (Cloud SQL) | Django | Database host. Set to `db` for Docker. |
| `DB_NAME` | `spatialhub_db` | Django | Database name |
| `DB_USER` | `postgres` | Django | Database user |
| `DB_PASS` | — | Django, PostgreSQL | Database password |
| `USE_SQLITE` | `0` | Django | Set to `1` to use SQLite instead of PostgreSQL |
| `BIOSIM_URL` | `http://biosim:8009` | Bridge, Import | BioSim server URL |
| `VITE_API_URL` | Cloud Run URL | Frontend | Django API base URL (set to `http://localhost:8000/api` for local dev) |

## Troubleshooting

**BioSim takes long to start:** JVM needs ~90 seconds. The healthcheck has a 90s `start_period`. Check with `docker compose logs biosim`.

**Bridge in retry loop:** If bridge logs show "No active simulation found", BioSim's simulation hasn't started yet. Wait for the healthcheck to pass, or check `curl http://localhost:8009/api/simulation`.

**Frontend shows "Fallback Mode":** Docker isn't running or BioSim isn't reachable from the browser. The frontend probes `http://localhost:8009` directly. Make sure port 8009 is exposed.

**Tests fail with database errors:** Use `USE_SQLITE=1` prefix when running backend tests locally: `USE_SQLITE=1 python3 -m pytest sensor_data/tests/ -v`

**Frontend API calls go to production:** Set `VITE_API_URL=http://localhost:8000/api` when running `npm run dev` to point at the local Django container.
