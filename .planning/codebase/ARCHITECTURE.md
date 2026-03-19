# Architecture

**Analysis Date:** 2026-03-09

## Pattern Overview

**Overall:** Distributed multi-tier IoT pipeline with event-driven ingestion and REST API for reads

**Key Characteristics:**
- Four independent deployment units: hub code (Raspberry Pi), cloud functions (GCP), Django REST API (Cloud Run), React SPA (Firebase Hosting)
- Event-driven write path via GCP Pub/Sub; synchronous read path via Django REST API
- Shared PostgreSQL database written to by both Cloud Functions (raw SQL via psycopg2) and Django (ORM) -- dual-write architecture with no ORM on the ingestion side
- No authentication or authorization on any layer
- No shared library or common schema definition across layers -- each layer re-declares its own field names independently

## Layers

**Edge Layer (Hub Code):**
- Purpose: Read Atlas Scientific I2C sensors on Raspberry Pi, store locally in SQLite, sync to cloud, listen for commands
- Location: `hubcode/`
- Contains: I2C driver (`AtlasI2C.py`), sensor polling loop (`sensor_logger.py`), cloud sync (`snyc_to_postgres.py`), command listener (`basic_funcs.py`), pump actuator (`pump_handler.py`)
- Depends on: Local SQLite, GCP Pub/Sub client, physical I2C bus (`/dev/i2c-1`)
- Used by: Nothing directly -- pushes data to cloud via Pub/Sub

**Ingestion Layer (Cloud Functions):**
- Purpose: Receive sensor payloads via HTTP, publish to Pub/Sub, enrich with hub metadata, write to PostgreSQL
- Location: `functions/`
- Contains: Three independent Cloud Functions, each in its own subdirectory
- Depends on: GCP Pub/Sub, PostgreSQL (direct psycopg2 connection), environment variables for DB credentials
- Used by: Hub code calls `ingest_data_publisher` HTTP endpoint; Pub/Sub triggers `enrich_data_subscriber`; frontend calls `command_publisher` indirectly via Django `SendHubCommand` view

**API Layer (Django REST Framework):**
- Purpose: Serve sensor data and hub config to the frontend via REST endpoints
- Location: `django_backend/`
- Contains: Single Django app `sensor_data` with models, serializers, views, and URL config
- Depends on: PostgreSQL (via Django ORM), GCP Pub/Sub (for `SendHubCommand` view only)
- Used by: React frontend

**Presentation Layer (React Frontend):**
- Purpose: Dashboard for viewing sensor data, provisioning hubs, running simulations, and sending commands
- Location: `spatialhub-frontend/`
- Contains: Page components, shared components, API client, TypeScript types
- Depends on: Django REST API (Cloud Run), GCP Cloud Functions (direct calls from `SimulateDevices` page)
- Used by: End users via browser

## Data Flow

**Sensor Data Ingestion (Write Path):**

1. Raspberry Pi reads I2C sensor via `AtlasI2C` driver (`hubcode/sensor_logger.py`)
2. Sensor value stored in local SQLite with `synced=0` flag (`hubcode/sensor_logger.py:insert_sensor_data()`)
3. Sync loop picks up unsynced rows, publishes each to Pub/Sub topic `spatialhub-ingest` via HTTP to `ingest_data_publisher` cloud function (`hubcode/snyc_to_postgres.py:publish_one_by_one()`)
4. `ingest_data_publisher` (`functions/ingest_data_publisher/main.py`) receives HTTP POST, publishes JSON payload to Pub/Sub topic `spatialhub-ingest`
5. `enrich_data_subscriber` (`functions/enrich_data_subscriber/main.py`) triggers on Pub/Sub message, inserts into `raw_sensor_data` table via raw SQL
6. If hub_id exists in `hub_config` table, enriches with `location`, `owner`, `workers` and inserts into `enriched_sensor_data` table

**Sensor Data Read (Read Path):**

1. React frontend page component makes HTTP GET to Django API (`/api/raw/` or `/api/enriched/`)
2. Django view queries PostgreSQL via ORM (`django_backend/sensor_data/views.py`)
3. Serializer converts queryset to JSON (`django_backend/sensor_data/serializers.py`)
4. Response rendered as JSON (browsable API disabled)

**Hub Provisioning:**

1. User fills form in `HubProvisionForm` component (`spatialhub-frontend/src/components/HubProvisionForm.tsx`)
2. POST to `/api/provision/` with `location`, `owner`, `workers`
3. Django `HubProvisionView` generates random 20-char hub_id, creates `HubConfig` record (`django_backend/sensor_data/views.py:HubProvisionView`)

**Command Dispatch:**

1. User clicks "Send Pump Command" in `SimulateDevices` page (`spatialhub-frontend/src/pages/SimulateDevices.tsx`)
2. POST to Django `/api/send-command/` with `hub_id` and `command`
3. Django `SendHubCommand` view publishes to Pub/Sub topic `hub-commands` (`django_backend/sensor_data/views.py:SendHubCommand`)
4. Hub's `basic_funcs.py` subscriber receives message, parses command, dispatches to `pump_handler.py` for dose commands

**State Management:**
- Frontend: Local component state via React `useState` hooks. No global state management (no Redux, Zustand, or Context).
- Backend: Stateless Django API. All state in PostgreSQL.
- Hub: Local SQLite for sensor data buffering. Pub/Sub subscription for command reception.

## Key Abstractions

**Django Models (shared database schema):**
- Purpose: Define the three core tables that both Django ORM and Cloud Functions write to
- Examples: `django_backend/sensor_data/models.py` -- `RawSensorData`, `EnrichedSensorData`, `HubConfig`
- Pattern: All models use explicit `db_table` in `Meta` class to match table names used by Cloud Functions' raw SQL inserts. This is the critical contract between the ingestion layer and API layer.

**DRF Serializers:**
- Purpose: Serialize Django model instances to JSON for API responses
- Examples: `django_backend/sensor_data/serializers.py` -- `RawSensorSerializer`, `EnrichedSensorSerializer`, `HubConfigSerializer`
- Pattern: Simple `ModelSerializer` with `fields = '__all__'`. No custom validation or transformation.

**Frontend API Client:**
- Purpose: Centralize API calls to Django backend
- Examples: `spatialhub-frontend/src/api/api.ts`
- Pattern: Thin wrapper around axios. Only 3 of the 5 API endpoints are wrapped here -- `SensorTrends` and `SimulateDevices` pages make direct axios calls with hardcoded URLs, bypassing this module entirely.

**AtlasI2C Driver:**
- Purpose: Low-level I2C communication with Atlas Scientific sensor boards
- Examples: `hubcode/AtlasI2C.py`
- Pattern: File-descriptor based I2C read/write with timeout handling. Handles Raspberry Pi MSB glitch. Two read modes: `read()` returns full device info string, `read_device_data()` returns just the numeric value (first 4 chars).

## Entry Points

**Django API Server:**
- Location: `django_backend/manage.py` (dev), `django_backend/spatialhub_backend/wsgi.py` (production via Gunicorn)
- Triggers: HTTP requests to Cloud Run URL or `localhost:8000`
- Responsibilities: Route requests through `spatialhub_backend/urls.py` -> `sensor_data/urls.py` -> view classes

**Cloud Function: ingest_data_publisher:**
- Location: `functions/ingest_data_publisher/main.py:ingest_data_publisher()`
- Triggers: HTTP POST from hub sync script or device simulator
- Responsibilities: Publish sensor payload to Pub/Sub topic `spatialhub-ingest`

**Cloud Function: enrich_data_subscriber:**
- Location: `functions/enrich_data_subscriber/main.py:enrich_data()`
- Triggers: Pub/Sub message on `spatialhub-ingest` topic
- Responsibilities: Insert raw data to DB, look up hub metadata, insert enriched data if hub is provisioned

**Cloud Function: command_publisher:**
- Location: `functions/command_publisher/main.py:send_command()`
- Triggers: HTTP POST
- Responsibilities: Publish command to Pub/Sub topic `command-sub`

**Frontend SPA:**
- Location: `spatialhub-frontend/src/main.tsx` -> `spatialhub-frontend/src/App.tsx`
- Triggers: Browser navigation
- Responsibilities: Render pages based on React Router routes

**Hub Sensor Logger:**
- Location: `hubcode/sensor_logger.py` (run as `__main__`)
- Triggers: Started as a process on Raspberry Pi
- Responsibilities: Poll I2C sensors every 5 seconds, store readings in local SQLite

**Hub Cloud Sync:**
- Location: `hubcode/snyc_to_postgres.py` (run as `__main__`)
- Triggers: Started as a process on Raspberry Pi
- Responsibilities: Sync unsynced SQLite rows to cloud every 30 seconds via Pub/Sub

**Hub Command Listener:**
- Location: `hubcode/basic_funcs.py` (run as `__main__`)
- Triggers: Started as a process on Raspberry Pi
- Responsibilities: Listen for Pub/Sub commands, dispatch pump dosing

**Device Simulator:**
- Location: `simulate_devices.py`
- Triggers: CLI invocation (`python simulate_devices.py <total> <batch_size>`)
- Responsibilities: Generate and send fake sensor data to ingest cloud function for testing

## Error Handling

**Strategy:** Catch-all try/except at the view and function level. No custom exception classes. No retry logic.

**Patterns:**
- Django views: Every `APIView` method wraps its body in `try/except Exception`, prints traceback to stdout, returns HTTP 500 with `{"error": str(e)}`. See `django_backend/sensor_data/views.py`.
- Cloud Functions: Similar catch-all pattern. `enrich_data_subscriber` has a bug where `conn.commit()` runs outside the try block, so a DB error will crash on commit. See `functions/enrich_data_subscriber/main.py:65`.
- Hub code: Logs errors to file, continues loop. Sensor read retries up to 3 times on error. See `hubcode/sensor_logger.py:query_sensor()`.
- Frontend: `.catch(console.error)` on API calls. No user-facing error UI beyond browser console.

## Cross-Cutting Concerns

**Logging:**
- Django/Cloud Functions: `print()` statements to stdout. No structured logging framework.
- Hub code: Python `logging` module writing to local text files (`sensor_log.txt`, `sync_log.txt`, `hubLog.txt`).
- Frontend: `console.error()` only.

**Validation:**
- Django: DRF serializer validation only (basic ModelSerializer field type checking). No custom validators.
- Cloud Functions: No input validation. Payload fields extracted with `.get()` defaulting to None.
- Frontend: No form validation beyond HTML required attributes.

**Authentication:** None. No auth on any API endpoint, cloud function, or Pub/Sub topic. All endpoints are publicly accessible.

**CORS:**
- Django: `django-cors-headers` middleware with allowlist for `localhost:5173` and Firebase hosting domain. See `django_backend/spatialhub_backend/settings.py:88-95`.
- Cloud Functions: Manual CORS headers (`Access-Control-Allow-Origin: *`) in response tuples.

---

*Architecture analysis: 2026-03-09*
