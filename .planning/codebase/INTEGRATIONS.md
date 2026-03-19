# External Integrations

**Analysis Date:** 2026-03-09

## APIs & External Services

### Google Cloud Pub/Sub

Three Pub/Sub topics orchestrate the data pipeline:

**Topic: `spatialhub-ingest`**
- Purpose: Receives raw sensor payloads from hubs and simulators
- Publisher: `functions/ingest_data_publisher/main.py` (HTTP Cloud Function)
- Publisher: `hubcode/snyc_to_postgres.py` (Raspberry Pi sync script)
- Subscriber: `functions/enrich_data_subscriber/main.py` (Pub/Sub-triggered Cloud Function)
- SDK: `google-cloud-pubsub` 2.20.0

**Topic: `hub-commands`**
- Purpose: Sends commands from Django API to hubs
- Publisher: `django_backend/sensor_data/views.py` (`SendHubCommand` view)
- Subscriber: Hub devices (Raspberry Pi `hubcode/pump_handler.py`)
- SDK: `google-cloud-pubsub` 2.20.0

**Topic: `command-sub`**
- Purpose: Alternative command publishing via Cloud Function
- Publisher: `functions/command_publisher/main.py` (HTTP Cloud Function)
- Subscriber: Hub devices

**Auth:** GCP service account credentials
- Hub devices: `GOOGLE_APPLICATION_CREDENTIALS` env var pointing to service account JSON (`hubcode/snyc_to_postgres.py` line 7)
- Cloud Functions: Implicit GCP identity
- Django on Cloud Run: Implicit GCP identity

### Google Cloud Functions (HTTP)

**`ingest_data_publisher`:**
- URL: `https://us-central1-interviewing-457222.cloudfunctions.net/ingest_data_publisher`
- Method: POST (with CORS preflight)
- Called by: `simulate_devices.py`, Raspberry Pi hub code
- Source: `functions/ingest_data_publisher/main.py`

**`command_publisher` (send_command):**
- URL: Not hardcoded in repo (deployed separately)
- Method: POST (with CORS preflight)
- Source: `functions/command_publisher/main.py`

## Data Storage

### PostgreSQL (Google Cloud SQL)

**Instance:** Cloud SQL managed PostgreSQL
- Database name: `spatialhub_db`
- Connection: env vars `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
- Default host: `35.202.183.120` (hardcoded fallback in `django_backend/spatialhub_backend/settings.py`)
- Port: 5432

**Django ORM Client:** `psycopg2-binary` via Django's `django.db.backends.postgresql`
- Models: `django_backend/sensor_data/models.py`
- Tables use explicit `db_table` names to share with Cloud Functions

**Direct SQL Client:** `psycopg2-binary` 2.9.9 in enrichment function
- File: `functions/enrich_data_subscriber/main.py`
- Raw SQL INSERT statements (bypasses Django ORM)

**Tables:**
| Table | Written by | Read by |
|-------|-----------|---------|
| `raw_sensor_data` | Cloud Function (enrich) | Django API |
| `enriched_sensor_data` | Cloud Function (enrich) | Django API |
| `hub_config` | Django API (provision) | Cloud Function (enrich), Django API |

### SQLite (Local on Hub)

**Purpose:** Local sensor data buffer on Raspberry Pi before cloud sync
- File: `database1.db` (relative to script dir)
- Table: `sensor_data1` with `synced` flag column
- Writer: `hubcode/sensor_logger.py`
- Reader: `hubcode/snyc_to_postgres.py` (reads unsynced rows, publishes to Pub/Sub, marks synced)

### SQLite (Local Dev Fallback)

**Purpose:** Local development database when `USE_SQLITE=1` env var is set
- File: `django_backend/db.sqlite3`
- Config: `django_backend/spatialhub_backend/settings.py` lines 54-60

**File Storage:** Not applicable - no file upload/storage features

**Caching:** None

## Authentication & Identity

**Auth Provider:** None
- No user authentication system
- No login/session management
- All API endpoints are unauthenticated (no DRF auth classes configured)
- CORS is configured but no auth tokens required

**GCP Auth:**
- Cloud Functions: Implicit GCP service account
- Hub devices: Service account JSON file at `/home/pi/Medshift/spatialhub-service-account.json` (referenced in `hubcode/snyc_to_postgres.py`)

## Monitoring & Observability

**Error Tracking:** None (no Sentry, Datadog, etc.)

**Logs:**
- Django backend: `print()` statements to stdout (`django_backend/sensor_data/views.py`)
- Cloud Functions: `print()` statements (captured by Cloud Functions logging)
- Hub code: Python `logging` module to local files (`sensor_log.txt`, `sync_log.txt`)
- No structured logging framework

## CI/CD & Deployment

**Hosting:**
- Backend: Google Cloud Run (`spatialhub-backend-823061962201.us-central1.run.app`)
- Frontend: Firebase Hosting (`interviewing-457222.web.app`)
- Cloud Functions: Google Cloud Functions (us-central1)
- Database: Google Cloud SQL

**CI Pipeline:** None detected
- No GitHub Actions, Cloud Build, or other CI configuration files
- Deployment appears to be manual

**Docker:**
- `Dockerfile` at repo root for backend Cloud Run deployment
- Single-stage build, no multi-stage optimization

## Environment Configuration

**Required env vars (production):**

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DB_HOST` | Django settings, Cloud Functions (enrich) | PostgreSQL host |
| `DB_NAME` | Django settings, Cloud Functions (enrich) | PostgreSQL database name |
| `DB_USER` | Django settings, Cloud Functions (enrich) | PostgreSQL username |
| `DB_PASS` | Django settings, Cloud Functions (enrich) | PostgreSQL password |
| `USE_SQLITE` | Django settings | Set to `1` for local SQLite dev |
| `VITE_API_URL` | Frontend build | API base URL override |
| `GOOGLE_APPLICATION_CREDENTIALS` | Hub code | Path to GCP service account JSON |

**Secrets location:**
- Database credentials have hardcoded defaults in `django_backend/spatialhub_backend/settings.py` (lines 65-68) - this is a security issue
- GCP project ID hardcoded as `interviewing-457222` in multiple files
- No `.env` files detected in repo
- No secrets management service (no Secret Manager, no Vault)

## Webhooks & Callbacks

**Incoming:**
- `ingest_data_publisher` Cloud Function - HTTP POST endpoint receiving sensor payloads from hubs
- `command_publisher` Cloud Function - HTTP POST endpoint receiving command requests

**Outgoing:**
- None - no outbound webhooks

## Hardware Integrations

**Atlas Scientific I2C Sensors:**
- Driver: `hubcode/AtlasI2C.py` (custom I2C communication class)
- Sensors: pH (addr 99), DO (addr 97), air temp (addr 102), water temp (addr 102), CO2 (addr 104), humidity (addr 101)
- Communication: I2C bus on Raspberry Pi
- Read interval: 5 seconds (`hubcode/sensor_logger.py`)

**Sync Pattern:**
- Hub reads sensors -> writes to local SQLite -> sync script reads unsynced rows -> publishes to Pub/Sub -> marks as synced
- Sync interval: 30 seconds, max batch size: 25 rows (`hubcode/snyc_to_postgres.py`)

---

*Integration audit: 2026-03-09*
