# Technology Stack

**Analysis Date:** 2026-03-09

## Languages

**Primary:**
- Python 3.11 - Django backend (`django_backend/`), Cloud Functions (`functions/`), hub code (`hubcode/`), device simulator (`simulate_devices.py`)
- TypeScript ~5.7.2 - React frontend (`spatialhub-frontend/`)

**Secondary:**
- SQL - Raw queries in Cloud Functions (`functions/enrich_data_subscriber/main.py`), SQLite schema in hub code (`hubcode/sensor_logger.py`)
- CSS - Frontend styling (`spatialhub-frontend/src/App.css`, `spatialhub-frontend/src/index.css`)

## Runtime

**Backend:**
- Python 3.11-slim (Docker image base) - `Dockerfile`
- Gunicorn WSGI server - `Dockerfile` CMD
- Google Cloud Functions runtime (Python) - `functions/*/main.py`

**Frontend:**
- Node.js (version not pinned, no `.nvmrc`)
- Vite 6.3.1 dev server at `localhost:5173`

**Hub/Edge:**
- Raspberry Pi (Linux/ARM) - Python scripts with I2C hardware access (`hubcode/AtlasI2C.py`)

## Package Manager

**Python:**
- pip (no lockfile)
- Two `requirements.txt` files with version conflicts:
  - Root `requirements.txt`: `Django>=5.2` (used by root Dockerfile reference, but Dockerfile copies `django_backend/`)
  - `django_backend/requirements.txt`: `Django>=4.2,<5` (actually used in Docker build)

**JavaScript:**
- npm
- Lockfile: `package-lock.json` (standard)

## Frameworks

**Core:**
- Django 4.2.x - REST API backend (`django_backend/`)
- Django REST Framework - API serialization and views (`django_backend/sensor_data/views.py`, `django_backend/sensor_data/serializers.py`)
- React 19.0.0 - Frontend SPA (`spatialhub-frontend/`)
- Vite 6.3.1 - Frontend build tool (`spatialhub-frontend/vite.config.ts`)

**Build/Dev:**
- TypeScript ~5.7.2 - Type checking (`tsc -b && vite build`)
- ESLint 9.22.0 - Linting with flat config (`spatialhub-frontend/eslint.config.js`)
- `@vitejs/plugin-react` 4.3.4 - React fast refresh

## Key Dependencies

### Backend (Python)

**Critical:**
- `djangorestframework` - API layer, ModelSerializer pattern (`django_backend/sensor_data/serializers.py`)
- `psycopg2-binary` - PostgreSQL adapter for Django ORM
- `django-cors-headers` - CORS handling (`django_backend/spatialhub_backend/settings.py`)
- `google-cloud-pubsub` 2.20.0 - Pub/Sub client for sending hub commands from Django (`django_backend/sensor_data/views.py`)
- `gunicorn` - Production WSGI server

**Cloud Functions:**
- `google-cloud-pubsub` 2.20.0 - Pub/Sub publish/subscribe (`functions/ingest_data_publisher/`, `functions/command_publisher/`)
- `psycopg2-binary` 2.9.9 - Direct PostgreSQL access in enrichment function (`functions/enrich_data_subscriber/main.py`)

**Simulation:**
- `aiohttp` - Async HTTP client for batch device simulation (`simulate_devices.py`)
- `asyncio` - Async orchestration for simulation batches

### Frontend (npm)

**Critical:**
- `react` 19.0.0 / `react-dom` 19.0.0 - UI framework
- `react-router-dom` 7.5.3 - Client-side routing (routes: `/`, `/raw`, `/enriched`, `/trends`, `/simulate`, `/unity`)
- `axios` 1.9.0 - HTTP client for API calls (`spatialhub-frontend/src/api/api.ts`)
- `@tanstack/react-query` 5.74.11 - Server state management / data fetching
- `recharts` 2.15.3 - Charting library for sensor trends (`spatialhub-frontend/src/pages/SensorTrends.tsx`)
- `@radix-ui/react-toast` 1.2.11 - Toast notifications

**Dev:**
- `@types/react` 19.0.10 / `@types/react-dom` 19.0.4 - React type definitions
- `@types/react-router-dom` 5.3.3 - Router type definitions (note: v5 types for v7 router)
- `eslint-plugin-react-hooks` 5.2.0 - Hooks linting rules
- `eslint-plugin-react-refresh` 0.4.19 - Fast refresh linting

## Configuration

**Django Settings:** `django_backend/spatialhub_backend/settings.py`
- Database configured via env vars: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
- SQLite fallback when `USE_SQLITE=1` env var set
- `DEBUG = True` hardcoded (not env-driven)
- `SECRET_KEY` hardcoded (insecure default)
- `ALLOWED_HOSTS = ["*"]` plus Cloud Run domain
- DRF configured for JSON-only rendering (no browsable API)
- CORS allows `localhost:5173` and Firebase hosting domain

**Frontend:**
- API base URL via `VITE_API_URL` env var, falls back to hardcoded Cloud Run URL (`spatialhub-frontend/src/api/api.ts`)
- TypeScript strict mode enabled (`spatialhub-frontend/tsconfig.app.json`)
- Target: ES2020, JSX: react-jsx

**Docker:** `Dockerfile`
- Base: `python:3.11-slim`
- Copies only `django_backend/` directory
- Exposes port 8080 (Cloud Run default)
- Runs Gunicorn bound to `0.0.0.0:8080`

## Platform Requirements

**Development:**
- Python 3.11+ for backend
- Node.js (recent LTS) for frontend
- PostgreSQL 14+ or SQLite (via `USE_SQLITE=1`) for local backend dev

**Production:**
- Google Cloud Run - Django backend container
- Google Cloud Functions - Ingest, enrich, command functions
- Google Cloud SQL (PostgreSQL) - Primary database
- Google Cloud Pub/Sub - Message bus between components
- Firebase Hosting - Frontend SPA

---

*Stack analysis: 2026-03-09*
