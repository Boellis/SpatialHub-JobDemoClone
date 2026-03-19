# Codebase Structure

**Analysis Date:** 2026-03-09

## Directory Layout

```
SpatialHub-JobDemoClone/
├── django_backend/              # Django REST API (deployed to Cloud Run)
│   ├── manage.py                # Django management CLI
│   ├── requirements.txt         # Python deps (Django 4.2.x target)
│   ├── db.sqlite3               # Local SQLite for dev (USE_SQLITE=1)
│   ├── sensor_data/             # Single Django app for all API logic
│   │   ├── models.py            # RawSensorData, EnrichedSensorData, HubConfig
│   │   ├── views.py             # DRF views (5 endpoints)
│   │   ├── serializers.py       # DRF ModelSerializers
│   │   ├── urls.py              # App-level URL routing
│   │   ├── admin.py             # Admin registration (default)
│   │   ├── apps.py              # App config
│   │   ├── tests.py             # Test file (empty/minimal)
│   │   └── migrations/          # Django migrations
│   ├── spatialhub_backend/      # Django project config
│   │   ├── settings.py          # DB config, CORS, DRF settings
│   │   ├── urls.py              # Root URL config (mounts /api/)
│   │   ├── wsgi.py              # WSGI entry (Gunicorn)
│   │   └── asgi.py              # ASGI entry (unused)
│   ├── venv/                    # Committed Windows venv (do not use)
│   └── venv_local/              # Local macOS venv (gitignored)
├── functions/                   # GCP Cloud Functions
│   ├── ingest_data_publisher/   # HTTP -> Pub/Sub for sensor data
│   │   ├── main.py              # Entry: ingest_data_publisher()
│   │   └── requirements.txt     # google-cloud-pubsub
│   ├── enrich_data_subscriber/  # Pub/Sub -> PostgreSQL enrichment
│   │   ├── main.py              # Entry: enrich_data()
│   │   ├── requirements.txt     # psycopg2-binary, google-cloud-pubsub
│   │   └── gcloud               # gcloud deploy command reference
│   └── command_publisher/       # HTTP -> Pub/Sub for hub commands
│       ├── main.py              # Entry: send_command()
│       └── requirements.txt     # google-cloud-pubsub
├── hubcode/                     # Raspberry Pi device code
│   ├── AtlasI2C.py              # I2C driver for Atlas Scientific sensors
│   ├── sensor_logger.py         # Sensor polling loop (main)
│   ├── snyc_to_postgres.py      # Cloud sync via Pub/Sub (main, note typo in filename)
│   ├── basic_funcs.py           # Command subscription listener (main)
│   └── pump_handler.py          # Peristaltic pump dosing handler
├── spatialhub-frontend/         # React SPA (deployed to Firebase Hosting)
│   ├── src/
│   │   ├── main.tsx             # React DOM entry point
│   │   ├── App.tsx              # Router + nav layout
│   │   ├── App.css              # App-level styles
│   │   ├── index.css            # Global styles
│   │   ├── vite-env.d.ts        # Vite type declarations
│   │   ├── api/
│   │   │   └── api.ts           # API client (axios, 3 functions)
│   │   ├── components/
│   │   │   ├── HubProvisionForm.tsx  # Hub provisioning form
│   │   │   └── PaginatedTable.tsx    # Reusable paginated table (unused)
│   │   ├── pages/
│   │   │   ├── ProvisionHub.tsx      # Hub provisioning page
│   │   │   ├── RawSensorData.tsx     # Raw sensor data table
│   │   │   ├── EnrichedSensorData.tsx # Enriched sensor data table
│   │   │   ├── SensorTrends.tsx      # Line chart visualization
│   │   │   ├── SimulateDevices.tsx   # Device simulation + pump commands
│   │   │   └── UnityEmbed.tsx        # Embedded Unity WebGL iframe
│   │   ├── types/
│   │   │   ├── types.ts         # SensorData interface (detailed)
│   │   │   └── index.ts         # SensorData interface (loose, any-based)
│   │   └── assets/
│   │       └── react.svg        # Default Vite asset
│   ├── public/
│   │   └── vite.svg             # Default Vite favicon
│   ├── index.html               # SPA HTML shell
│   ├── package.json             # npm deps and scripts
│   ├── package-lock.json        # npm lockfile
│   ├── vite.config.ts           # Vite build config
│   ├── tsconfig.json            # Root TypeScript config
│   ├── tsconfig.app.json        # App TypeScript config
│   ├── tsconfig.node.json       # Node TypeScript config
│   ├── eslint.config.js         # ESLint configuration
│   ├── firebase.json            # Firebase Hosting config
│   └── .firebaserc              # Firebase project alias
├── Dockerfile                   # Docker build for Django (Cloud Run)
├── requirements.txt             # Root-level Python deps (Django 5.2+)
├── simulate_devices.py          # CLI device simulator (async batch)
├── CLAUDE.md                    # Claude Code project instructions
├── README.md                    # Project readme
└── .gitattributes               # Git LFS / line ending config
```

## Directory Purposes

**`django_backend/`:**
- Purpose: Django REST API serving sensor data to the frontend
- Contains: Single app (`sensor_data`) with models, views, serializers, URL routing
- Key files: `sensor_data/models.py` (defines the 3 shared DB tables), `sensor_data/views.py` (all 5 API endpoints), `spatialhub_backend/settings.py` (database, CORS, DRF config)

**`functions/`:**
- Purpose: GCP Cloud Functions for the event-driven data ingestion pipeline
- Contains: Three independent function directories, each with its own `main.py` and `requirements.txt`
- Key files: `enrich_data_subscriber/main.py` (the core data enrichment logic that writes to PostgreSQL)

**`hubcode/`:**
- Purpose: Python scripts that run on Raspberry Pi IoT hubs in the field
- Contains: I2C sensor driver, data collection loop, cloud sync script, command listener, pump actuator
- Key files: `AtlasI2C.py` (hardware driver), `sensor_logger.py` (data collection entry point)

**`spatialhub-frontend/`:**
- Purpose: React dashboard for data visualization and hub management
- Contains: Pages (6), components (2), API client, TypeScript types
- Key files: `src/App.tsx` (routing), `src/api/api.ts` (API client)

## Key File Locations

**Entry Points:**
- `django_backend/manage.py`: Django dev server / CLI management
- `django_backend/spatialhub_backend/wsgi.py`: Production WSGI entry (Gunicorn)
- `spatialhub-frontend/src/main.tsx`: React app bootstrap
- `functions/ingest_data_publisher/main.py`: Ingest cloud function
- `functions/enrich_data_subscriber/main.py`: Enrichment cloud function
- `functions/command_publisher/main.py`: Command cloud function
- `hubcode/sensor_logger.py`: Sensor polling (Raspberry Pi)
- `hubcode/snyc_to_postgres.py`: Cloud sync (Raspberry Pi)
- `hubcode/basic_funcs.py`: Command listener (Raspberry Pi)
- `simulate_devices.py`: CLI device simulator

**Configuration:**
- `django_backend/spatialhub_backend/settings.py`: Django settings (DB, CORS, middleware)
- `spatialhub-frontend/vite.config.ts`: Vite build config
- `spatialhub-frontend/tsconfig.json`: TypeScript config
- `spatialhub-frontend/firebase.json`: Firebase Hosting config
- `spatialhub-frontend/eslint.config.js`: ESLint rules
- `Dockerfile`: Docker build for Cloud Run deployment
- `requirements.txt` (root): Python deps for Docker build (Django 5.2+)
- `django_backend/requirements.txt`: Python deps used inside Django backend (Django 4.2)

**Core Logic:**
- `django_backend/sensor_data/models.py`: Database schema (3 models)
- `django_backend/sensor_data/views.py`: All API endpoint logic (5 views)
- `django_backend/sensor_data/serializers.py`: JSON serialization
- `django_backend/sensor_data/urls.py`: API route definitions
- `functions/enrich_data_subscriber/main.py`: Data enrichment pipeline
- `hubcode/AtlasI2C.py`: I2C hardware driver

**Testing:**
- `django_backend/sensor_data/tests.py`: Django test file (exists but minimal)
- No frontend test files exist

## Naming Conventions

**Files:**
- Python: `snake_case.py` (e.g., `sensor_logger.py`, `basic_funcs.py`)
- TypeScript pages: `PascalCase.tsx` (e.g., `SensorTrends.tsx`, `ProvisionHub.tsx`)
- TypeScript components: `PascalCase.tsx` (e.g., `PaginatedTable.tsx`, `HubProvisionForm.tsx`)
- TypeScript utilities: `camelCase.ts` (e.g., `api.ts`)
- Config files: `lowercase` with dots (e.g., `vite.config.ts`, `eslint.config.js`)

**Directories:**
- Python: `snake_case` (e.g., `sensor_data`, `spatialhub_backend`)
- TypeScript: `lowercase` (e.g., `pages`, `components`, `api`, `types`)
- Cloud Functions: `snake_case` per function name (e.g., `ingest_data_publisher`)

**React Components:**
- Named exports for pages: `export const SensorTrends = () => { ... }` or `export function RawSensorData() { ... }`
- Default exports for some pages: `export default SimulateDevices` and `export default UnityEmbed`
- Inconsistent: some pages use named exports, others use default exports

**Django:**
- Views: `PascalCase` class-based views (e.g., `RawSensorListView`, `HubProvisionView`)
- Models: `PascalCase` (e.g., `RawSensorData`, `HubConfig`)
- URL names: `kebab-case` (e.g., `raw-sensor-list`, `hub-provision`)

## Where to Add New Code

**New Django API Endpoint:**
- Add view class to `django_backend/sensor_data/views.py`
- Add serializer to `django_backend/sensor_data/serializers.py` (if new model)
- Add URL pattern to `django_backend/sensor_data/urls.py`
- Add model to `django_backend/sensor_data/models.py` (if new table)
- Run `python manage.py makemigrations && python manage.py migrate`

**New Frontend Page:**
- Create page component in `spatialhub-frontend/src/pages/PageName.tsx`
- Add route in `spatialhub-frontend/src/App.tsx` inside `<Routes>`
- Add nav link in `spatialhub-frontend/src/App.tsx` inside `<nav>`
- Add API function to `spatialhub-frontend/src/api/api.ts` (if calling backend)
- Add TypeScript types to `spatialhub-frontend/src/types/types.ts`

**New Frontend Component:**
- Create component in `spatialhub-frontend/src/components/ComponentName.tsx`
- Import from the page that uses it

**New Cloud Function:**
- Create directory `functions/function_name/`
- Add `main.py` with the entry-point function
- Add `requirements.txt` with dependencies
- Deploy via `gcloud functions deploy`

**New Hub Script:**
- Add Python file to `hubcode/`
- Follow existing pattern: config constants at top, logging setup, main loop at bottom

**Utilities/Shared Helpers:**
- Frontend: No established shared utils directory. Create `spatialhub-frontend/src/utils/` if needed.
- Backend: No utils module. Add to `sensor_data/` app or create a new Django app if scope warrants it.

## Special Directories

**`django_backend/venv/`:**
- Purpose: Committed Python virtualenv (Windows paths)
- Generated: Yes
- Committed: Yes (should not be -- this is a mistake)

**`django_backend/venv_local/`:**
- Purpose: Local macOS Python virtualenv
- Generated: Yes
- Committed: No (has `.gitignore`)

**`spatialhub-frontend/dist/`:**
- Purpose: Vite production build output, deployed to Firebase Hosting
- Generated: Yes
- Committed: No

**`django_backend/sensor_data/migrations/`:**
- Purpose: Django database migrations
- Generated: Yes (via `makemigrations`)
- Committed: Yes (should be committed)

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by mapping agents)
- Committed: Yes

---

*Structure analysis: 2026-03-09*
