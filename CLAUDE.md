# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SpatialHub is an IoT telemetry platform for indoor farming. It ingests sensor data from Raspberry Pi hubs, enriches it with farm metadata via Google Cloud, stores it in PostgreSQL, and visualizes it through a React dashboard.

## Architecture

The system has four distinct layers:

1. **Hub code** (`hubcode/`) - Python scripts running on Raspberry Pi devices. Reads Atlas Scientific I2C sensors, stores locally in SQLite, syncs to cloud via Pub/Sub, and listens for commands (e.g., pump dosing).
2. **Cloud Functions** (`functions/`) - Three GCP Cloud Functions:
   - `ingest_data_publisher` - HTTP endpoint that receives sensor payloads and publishes to Pub/Sub topic `spatialhub-ingest`
   - `enrich_data_subscriber` - Pub/Sub-triggered; inserts raw data into `raw_sensor_data`, looks up hub metadata from `hub_config`, and inserts enriched data into `enriched_sensor_data`
   - `command_publisher` - HTTP endpoint that publishes commands to Pub/Sub topic `command-sub`
3. **Django REST API** (`django_backend/`) - Hosted on Cloud Run. Single app `sensor_data` exposes the API.
4. **React Frontend** (`spatialhub-frontend/`) - Vite + React 19 + TypeScript, hosted on Firebase.

**Data flow (original):** Raspberry Pi -> Cloud Function (ingest) -> Pub/Sub -> Cloud Function (enrich) -> PostgreSQL <- Django API <- React Frontend
**Data flow (v3.0):** Raspberry Pi -> `POST /api/sensor-ingest/` on Cloud Run Django -> Cloud SQL PostgreSQL <- React Frontend on Firebase
**BioSim flow (v2.0+):** BioSim (GCE VM) -> WebSocket -> Frontend (live 3D) + biosim_bridge -> Cloud SQL (history)

5. **Docker Compose stack** (`docker-compose.yml`) - Local dev: PostgreSQL, BioSim, Open MCT, Django, biosim_bridge. For production: BioSim + bridge + control_loop on GCE VM, Django on Cloud Run.
6. **BioSim integration** - NASA life support simulator. REST API for malfunctions, WebSocket for live telemetry. GPL v3 — network API boundary only.

### v3.0 Cloud Architecture (NASA Competition)
- **Django API** → Cloud Run (GCP project `interviewing-457222`)
- **Frontend** → Firebase Hosting
- **Database** → Cloud SQL PostgreSQL
- **BioSim + bridge + control_loop** → GCE VM with Docker
- **Pi hub client** → Posts to Cloud Run endpoint over WiFi
- **Judge experience:** SD card + website URL, no local infrastructure

## Common Commands

### Django Backend
```bash
cd django_backend
source venv/bin/activate    # venv is checked into the repo (unusual)
python manage.py runserver
python manage.py makemigrations
python manage.py migrate
python manage.py test sensor_data
```

### Frontend
```bash
cd spatialhub-frontend
npm install
npm run dev          # Dev server at localhost:5173
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run preview      # Preview production build
```

### Device Simulation
```bash
python simulate_devices.py <TOTAL_DEVICES> <BATCH_SIZE>
# Example: python simulate_devices.py 1000 50
```

### Docker (Backend deployment)
```bash
docker build -t spatialhub-backend .   # Dockerfile at repo root, copies django_backend/
```

## Key Details

- **GCP Project ID:** `interviewing-457222`
- **Database:** PostgreSQL on Cloud SQL (`spatialhub_db`). Django models use explicit `db_table` names (`raw_sensor_data`, `enriched_sensor_data`, `hub_config`) to match tables also written to directly by Cloud Functions.
- **Two requirements.txt files:** Root level (used by Dockerfile, targets Django 5.2+) and `django_backend/requirements.txt` (targets Django 4.2-4.x). The Dockerfile copies from `django_backend/` so uses the inner one.
- **Frontend API base URL** is hardcoded in `spatialhub-frontend/src/api/api.ts` pointing to the Cloud Run instance. The double `/api/api/` path bug in `fetchRawSensorData` was fixed in Phase 1.
- **New endpoints:** `POST /api/sensor-ingest/` (receives Pi sensor data), management commands `biosim_bridge`, `biosim_import_log`, `seed_habitat_zones`
- **BioSim base URL** is in `spatialhub-frontend/src/hooks/useSimSource.ts` — must point to GCE VM IP for production.
- **CORS origins** are configured in `django_backend/spatialhub_backend/settings.py` for `localhost:5173` and the Firebase hosting domain.
- **DRF renders JSON only** (no browsable API) per `REST_FRAMEWORK` settings.
- **Hub IDs** are random 20-character alphanumeric strings generated on provision.
- The `venv/` directory is committed inside `django_backend/` (Windows-style paths under `Lib/site-packages`).
- Frontend routes: `/` (provision hub), `/raw`, `/enriched`, `/trends`, `/simulate`, `/unity`
- API endpoints are all under `/api/`: `raw/`, `enriched/`, `hub/`, `provision/`, `send-command/`

<!-- CodeFire managed section -->
# CodeFire
This project uses CodeFire for session memory.
Use the `codefire` MCP tools to retrieve project history,
active tasks, patterns, and codebase structure when needed.
<!-- End CodeFire section -->
