# Phase 11: Cloud Services Deployment - Research

**Researched:** 2026-03-18
**Domain:** GCP Cloud Run + Cloud SQL + Firebase Hosting deployment
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fresh provision — do not reuse prior Cloud SQL or Cloud Run resources
- All resources in **us-central1**
- Cloud SQL: **db-f1-micro** tier, PostgreSQL, public IP (no Cloud SQL Auth Proxy)
- Cloud Run connects to Cloud SQL via public IP + password (env vars)
- GCP project: `interviewing-457222`
- DB credentials (DB_HOST, DB_NAME, DB_USER, DB_PASS) passed as **Cloud Run environment variables** — not hardcoded
- **Remove hardcoded credential fallbacks** from settings.py — local dev uses `USE_SQLITE=1` or a local `.env` file
- Generate a proper **SECRET_KEY** for production, read from env var — hardcoded insecure key becomes local dev only
- **DEBUG=False** in production — read from env var, default to False
- ALLOWED_HOSTS includes the new Cloud Run URL
- **Full setup+deploy bash script** in `deploy/` directory — one script handles Cloud SQL provisioning (if needed), migrations, habitat_zones seeding, Django Cloud Run deploy, and Firebase frontend deploy
- Uses `gcloud run deploy --source .` — **source-based deploy** via Cloud Build (no manual Docker build/push)
- Script location: `deploy/` directory
- First run = full infrastructure setup; subsequent runs = code redeploy only
- Default Firebase Hosting URL: **interviewing-457222.web.app** (no custom domain)
- **VITE_API_URL set at build time** in deploy script — points to new Cloud Run service URL
- **VITE_BIOSIM_URL left as localhost:8009** — useSimSource auto-detects unavailability and falls back to client-side sim
- CORS_ALLOWED_ORIGINS: hardcoded list in settings.py — localhost:5173 + interviewing-457222.web.app

### Claude's Discretion
- CORS configuration approach (keep hardcoded list vs env-var driven — Claude decides based on deploy cleanliness)
- Cloud SQL instance name and database user naming
- Deploy script internal structure (single script vs split cloud-run.sh / firebase.sh)
- Static file serving strategy (whitenoise vs Cloud Run default)
- Exact gcloud CLI flags for Cloud Run deploy
- How migrations run against Cloud SQL (Cloud SQL Proxy locally vs Cloud Run job vs deploy script)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-01 | Django API deployed to Cloud Run, publicly accessible, connected to Cloud SQL PostgreSQL | Cloud Run source deploy + Cloud SQL public IP + env vars pattern |
| DEPLOY-02 | Frontend deployed to Firebase Hosting with production API base URL and BioSim WebSocket URL configured | `npm run build` with `VITE_API_URL` env var baked in + `firebase deploy --only hosting` |
| DEPLOY-04 | Cloud SQL PostgreSQL instance provisioned with all Django tables migrated and `habitat_zones` seeded | `gcloud sql instances create` + psql migration via Cloud Run deploy or direct psql + `seed_habitat_zones` management command |
</phase_requirements>

---

## Summary

This phase deploys the existing Django + React codebase to GCP with zero new features. The codebase is already almost deploy-ready: the Dockerfile targets port 8080 with Gunicorn, `firebase.json` and `.firebaserc` point at `interviewing-457222`, and `api.ts` reads `VITE_API_URL`. The work is infrastructure provisioning + credentials cleanup + a deploy script.

The three non-trivial problems are: (1) running Django migrations against Cloud SQL during deploy — `gcloud run deploy --source .` does not run migrate automatically, so the deploy script must trigger this explicitly; (2) removing hardcoded DB credentials from `settings.py` (currently exposes `35.202.183.120` and a cleartext password); (3) fixing three frontend pages (`RawSensorData.tsx`, `EnrichedSensorData.tsx`, `SensorTrends.tsx`) that hardcode the old Cloud Run URL instead of using `BASE_URL` from `api.ts`.

The migration strategy for Cloud SQL public IP (no Auth Proxy) is to run `python manage.py migrate` as a one-shot `gcloud run jobs execute` or by running it locally via psql-accessible public IP with `DB_HOST` pointed at the new instance's public IP, then running the Django management command. The simplest and most robust approach for this project is a Cloud Run Job that runs migrate + seed in a one-shot container invoked by the deploy script.

**Primary recommendation:** Single idempotent `deploy/deploy.sh` script — provisions Cloud SQL if not present, runs migrations via a Cloud Run Job, seeds habitat zones, deploys Cloud Run service with env vars, builds frontend with correct env vars, deploys to Firebase Hosting.

---

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `gcloud` CLI | 560.0.0 (installed) | Cloud Run deploy, Cloud SQL create | GCP's official deploy path |
| `gcloud run deploy --source .` | Cloud Build source deploy | Builds from Dockerfile and deploys in one command | No local Docker required; uses existing repo Dockerfile |
| `gcloud sql instances create` | Cloud SQL PostgreSQL | PostgreSQL instance provisioning | Required for DEPLOY-04 |
| `firebase deploy --only hosting` | Firebase Tools 15.2.1 (installed) | Frontend static hosting deploy | Existing firebase.json already configured |
| WhiteNoise 6.x | pip package | Django static file serving | Django on Cloud Run has no static file CDN by default; whitenoise serves from the container itself |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `gcloud run jobs execute` | Cloud Run Jobs | One-shot migrate + seed | Runs in the same container image, same env vars, no separate VM needed |
| `python-dotenv` | optional | Local dev env var loading | Only if devs want `.env` support locally — not needed for Cloud Run |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WhiteNoise | GCS bucket for static | Over-engineered — Django admin is DRF JSON-only, no browsable API, static files are minimal |
| Cloud Run Jobs for migrations | Cloud SQL Auth Proxy + local migrate | Auth Proxy requires extra binary; public IP + password is the locked decision, so local psql also works if the IP is open |
| Single deploy script | Separate cloud-run.sh + firebase.sh | Split scripts add coordination complexity with no benefit for this project size |

**Installation (new dependencies):**
```bash
pip install whitenoise
```
Add to `django_backend/requirements.txt`.

---

## Architecture Patterns

### Recommended Project Structure
```
deploy/
├── deploy.sh           # Main idempotent deploy script (Cloud SQL + Cloud Run + Firebase)
django_backend/
├── spatialhub_backend/
│   └── settings.py     # Remove hardcoded creds; add SECRET_KEY/DEBUG env var reads
├── Dockerfile          # Add collectstatic RUN step before CMD
└── requirements.txt    # Add whitenoise
spatialhub-frontend/
├── src/
│   └── pages/
│       ├── RawSensorData.tsx      # Replace hardcoded URL with BASE_URL from api.ts
│       ├── EnrichedSensorData.tsx # Replace hardcoded URL with BASE_URL from api.ts
│       └── SensorTrends.tsx       # Replace hardcoded URL with BASE_URL from api.ts
```

### Pattern 1: Cloud Run Source Deploy
**What:** `gcloud run deploy --source .` uploads the directory, triggers Cloud Build to use the existing Dockerfile, pushes image to Artifact Registry, and deploys the Cloud Run service.
**When to use:** Every code redeploy. First run must provision Cloud SQL and run migrations first.
**Example:**
```bash
# Source: https://docs.cloud.google.com/run/docs/deploying-source-code
gcloud run deploy spatialhub-backend \
  --source . \
  --region us-central1 \
  --project interviewing-457222 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "DB_HOST=${DB_HOST},DB_NAME=spatialhub_db,DB_USER=spatialhub,DB_PASS=${DB_PASS},SECRET_KEY=${SECRET_KEY},DEBUG=False,ALLOWED_HOSTS=*.run.app"
```

### Pattern 2: Cloud SQL PostgreSQL Provisioning
**What:** Create db-f1-micro Cloud SQL instance with public IP, create database and user.
**When to use:** First run only; deploy script guards with existence check.
**Example:**
```bash
# Source: https://docs.cloud.google.com/sql/docs/postgres/create-instance
gcloud sql instances create spatialhub-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --project=interviewing-457222 \
  --authorized-networks=0.0.0.0/0 \
  --root-password="${DB_ROOT_PASS}"

gcloud sql databases create spatialhub_db --instance=spatialhub-db --project=interviewing-457222
gcloud sql users create spatialhub --instance=spatialhub-db --password="${DB_PASS}" --project=interviewing-457222
```

> **Note:** `--authorized-networks=0.0.0.0/0` opens the instance to all IPs. This is the simplest approach for Cloud Run → Cloud SQL public IP (Cloud Run egress IPs are not static), and matches the locked decision. Acceptable for a demo/competition context.

### Pattern 3: Migrations via Cloud Run Job
**What:** Deploy a Cloud Run Job using the same image (built by `--source`), run `manage.py migrate` and `manage.py seed_habitat_zones` as a one-shot container.
**When to use:** After Cloud SQL is provisioned, before Cloud Run service receives traffic.
**Example:**
```bash
# Source: https://cloud.google.com/blog/topics/developers-practitioners/running-database-migrations-cloud-run-jobs/
gcloud run jobs create spatialhub-migrate \
  --image "${IMAGE_URI}" \
  --region us-central1 \
  --project interviewing-457222 \
  --command python,manage.py,migrate \
  --set-env-vars "DB_HOST=${DB_HOST},DB_NAME=spatialhub_db,DB_USER=spatialhub,DB_PASS=${DB_PASS},SECRET_KEY=${SECRET_KEY},DEBUG=False,ALLOWED_HOSTS=*"

gcloud run jobs execute spatialhub-migrate --region us-central1 --project interviewing-457222 --wait
```

**Alternative (simpler for this project):** Build image first, then invoke migrations as a container override. Or, since `--authorized-networks=0.0.0.0/0` opens the DB to all IPs, the deploy script can run migrations directly from the local machine with `DB_HOST` set to the Cloud SQL public IP. This avoids Cloud Run Jobs complexity entirely.

```bash
# Simpler: run migrate from local machine while deploy script has DB_HOST set
DB_HOST=$(gcloud sql instances describe spatialhub-db --format='value(ipAddresses[0].ipAddress)' --project interviewing-457222)
USE_SQLITE=0 DB_HOST="$DB_HOST" DB_NAME=spatialhub_db DB_USER=spatialhub DB_PASS="$DB_PASS" \
  python manage.py migrate
USE_SQLITE=0 DB_HOST="$DB_HOST" DB_NAME=spatialhub_db DB_USER=spatialhub DB_PASS="$DB_PASS" \
  python manage.py seed_habitat_zones
```

**Recommendation:** Use the local-machine approach (simpler, fewer moving parts). Works because `--authorized-networks=0.0.0.0/0` is already required for Cloud Run connectivity.

### Pattern 4: Frontend Build with Baked-in Env Vars
**What:** Pass `VITE_API_URL` as a shell variable at `npm run build` time. Vite bakes `import.meta.env.VITE_API_URL` into the bundle statically.
**When to use:** Every frontend deploy — env vars must be present at build time, not runtime.
**Example:**
```bash
# Source: Vite documentation + Firebase Hosting deploy pattern
CLOUD_RUN_URL=$(gcloud run services describe spatialhub-backend \
  --region us-central1 --project interviewing-457222 \
  --format 'value(status.url)')

cd spatialhub-frontend
VITE_API_URL="${CLOUD_RUN_URL}/api" npm run build
firebase deploy --only hosting --project interviewing-457222
```

### Pattern 5: WhiteNoise Static File Serving
**What:** Add `whitenoise` to requirements, add middleware, run `collectstatic` in Dockerfile.
**When to use:** Any Django deployment without a separate static file server.
**Example:**
```python
# Source: https://whitenoise.readthedocs.io/en/stable/django.html
# settings.py additions
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # immediately after SecurityMiddleware
    # ... rest of middleware
]
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
```
```dockerfile
# Dockerfile addition before CMD
RUN python manage.py collectstatic --noinput
```

### Anti-Patterns to Avoid
- **Hardcoded Cloud Run URL in components:** `RawSensorData.tsx`, `EnrichedSensorData.tsx`, and `SensorTrends.tsx` all hardcode `https://spatialhub-backend-823061962201.us-central1.run.app/api/...` directly. These must be refactored to use `BASE_URL` from `api.ts` before deploy, otherwise they will call the old (likely deleted) Cloud Run service.
- **DEBUG=True in production:** Currently set as a literal `True` in settings.py, not read from env. Cloud Run with `DEBUG=True` disables security middleware behaviors and can expose stack traces.
- **Hardcoded SECRET_KEY:** The existing key starting with `django-insecure-` is committed to git. Cloud Run must use a proper generated key via env var.
- **Running migrations in Gunicorn startup CMD:** Adding migrate to the Dockerfile CMD causes migrations to run on every container start and every scale-out instance simultaneously. Use the local-run or Cloud Run Jobs pattern instead.
- **CSRF_TRUSTED_ORIGINS missing new Cloud Run URL:** The existing `CSRF_TRUSTED_ORIGINS` list contains the old service URL. Must be updated to include the new Cloud Run URL or made permissive with `*.run.app`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Static file serving on Cloud Run | Custom file-serving view | WhiteNoise middleware | Handles compression, caching headers, 304s, MIME types correctly |
| DB connection retry on startup | Custom wait-for-db loop | Deploy script: migrate runs after Cloud SQL is ready | Cloud Run starts containers fast enough that DB health isn't an issue with a provisioning delay built into deploy script |
| Image build and push | `docker build && docker push` | `gcloud run deploy --source .` | Cloud Build handles this; no local Docker daemon required |
| Frontend env injection at runtime | Runtime env var injection service | Vite build-time env var baking | Vite bundles these at build time; runtime injection is not supported by Vite's architecture |

**Key insight:** This project's Django deployment is fundamentally straightforward — existing Dockerfile is correct, existing Firebase config is correct. The work is ~5 settings.py lines + 1 Dockerfile RUN line + 3 component URL fixes + a deploy script.

---

## Common Pitfalls

### Pitfall 1: CSRF_TRUSTED_ORIGINS Mismatch
**What goes wrong:** POST requests to Cloud Run return HTTP 403 CSRF verification failed, even though CORS passes.
**Why it happens:** Django's CSRF middleware checks `CSRF_TRUSTED_ORIGINS`. The existing list has the old Cloud Run URL. New deploys create a new service URL.
**How to avoid:** Add `https://*.run.app` to `CSRF_TRUSTED_ORIGINS`, or update the list with the new URL. The wildcard pattern is safer for repeated deploys.
**Warning signs:** 403 on POST `/api/sensor-ingest/` or `/api/provision/` while GET endpoints work fine.

### Pitfall 2: ALLOWED_HOSTS Causing 400 Bad Request
**What goes wrong:** All requests return HTTP 400 with "Bad Request (400)" and no detail.
**Why it happens:** `ALLOWED_HOSTS = ["*"]` currently works in DEBUG=True mode, but with `DEBUG=False` Django enforces ALLOWED_HOSTS strictly for security. The wildcard `"*"` does still work in Django 4.x+ even with DEBUG=False, but if accidentally removed, any request to an unrecognized Host header returns 400.
**How to avoid:** Keep `"*"` or add `".run.app"` explicitly. Verify `DEBUG=False` path is tested.
**Warning signs:** HTTP 400 response with no JSON body from any endpoint.

### Pitfall 3: Frontend Pages Calling Deleted Cloud Run URL
**What goes wrong:** `/raw`, `/enriched`, `/trends` pages load but show errors like "Failed to fetch raw sensor data" because they still call `spatialhub-backend-823061962201.us-central1.run.app` directly.
**Why it happens:** `RawSensorData.tsx`, `EnrichedSensorData.tsx`, `SensorTrends.tsx` all hardcode the old Cloud Run URL with `axios.get("https://spatialhub-backend-823061962201.us-central1.run.app/api/...")` instead of using `BASE_URL` from `api.ts`.
**How to avoid:** Refactor all three pages to import and use `BASE_URL` from `api.ts`. This is explicitly noted in CONTEXT.md specifics.
**Warning signs:** `/habitat` works (uses `api.ts`), but `/raw`, `/enriched`, `/trends` fail.

### Pitfall 4: Vite VITE_API_URL Not Baked In at Build Time
**What goes wrong:** Frontend calls `https://spatialhub-backend-823061962201.us-central1.run.app/api` (the hardcoded fallback in `api.ts`) instead of the new Cloud Run URL.
**Why it happens:** `VITE_API_URL` env var must be present in the shell when `npm run build` runs. If the deploy script does not export it before calling `npm run build`, Vite uses the fallback.
**How to avoid:** In `deploy.sh`, capture the Cloud Run URL after deploy and export `VITE_API_URL` before the build step. Verify with `grep CLOUD_RUN_URL dist/assets/*.js` after build.
**Warning signs:** Firebase-hosted frontend connects to old URL correctly (by coincidence, if old service still exists) or 404s immediately.

### Pitfall 5: `psycopg2-binary` Missing or Wrong Arch
**What goes wrong:** Cloud Run container fails to start with `ModuleNotFoundError: No module named 'psycopg2'` or `libpq.so.5` linker error.
**Why it happens:** Cloud Build builds on a Linux/amd64 host. `psycopg2-binary` is already in `requirements.txt` — this should be fine. However, if local dev has a Windows-style compiled binary cached in the committed `venv/`, the Docker build copies `django_backend/` which includes the `venv/` — but the Dockerfile installs from `requirements.txt` explicitly, so this is not actually an issue.
**How to avoid:** Confirm Dockerfile installs from `requirements.txt` (it does: `RUN pip install -r requirements.txt`). The `venv/` is in `django_backend/` and gets copied but `pip install` replaces it. Add `.dockerignore` pointing at `venv/` to keep the image lean.
**Warning signs:** Container startup crash visible in `gcloud run services logs read`.

### Pitfall 6: Cloud SQL Connection Refused from Cloud Run
**What goes wrong:** Django startup fails with `django.db.utils.OperationalError: could not connect to server: Connection refused`.
**Why it happens:** Cloud Run has egress to the internet but Cloud SQL must have `0.0.0.0/0` in authorized networks (or the specific Cloud Run NAT IP added). The locked decision is `--authorized-networks=0.0.0.0/0`, so this is covered — but only if the Cloud SQL instance is fully ready before the migration step runs.
**How to avoid:** In deploy script, wait for Cloud SQL instance to reach `RUNNABLE` state before running migrations: `gcloud sql instances describe --format='value(state)'` in a loop.
**Warning signs:** Migration step in deploy script exits non-zero with psycopg2 connection error.

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### settings.py — Credential Hardening
```python
# Remove hardcoded fallbacks; add SECRET_KEY and DEBUG
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-local-dev-only-key')
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

# CSRF — cover all Cloud Run URLs
CSRF_TRUSTED_ORIGINS = [
    "https://*.run.app",
    "https://interviewing-457222.web.app",
]

# CORS stays as hardcoded list per locked decision
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://interviewing-457222.web.app",
]

# Cloud SQL (no proxy) — just a regular TCP connection
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'HOST': os.environ.get('DB_HOST'),         # No fallback — fail loudly
        'NAME': os.environ.get('DB_NAME', 'spatialhub_db'),
        'USER': os.environ.get('DB_USER', 'spatialhub'),
        'PASSWORD': os.environ.get('DB_PASS'),      # No fallback — fail loudly
        'PORT': '5432',
    }
}
```

### Dockerfile — Add collectstatic
```dockerfile
# Add before the CMD line
RUN python manage.py collectstatic --noinput
CMD ["gunicorn", "spatialhub_backend.wsgi:application", "--bind", "0.0.0.0:8080"]
```

Note: `collectstatic` requires `STATIC_ROOT` set in settings.py and `USE_SQLITE=1` or a real DB env. The simplest fix is to add `USE_SQLITE=1` as a Dockerfile build-time ENV for the collectstatic step only, since static files do not require a database. Set it as `ENV USE_SQLITE=1` before the `RUN python manage.py collectstatic` line, then Cloud Run's runtime env vars will override it.

### deploy/deploy.sh — Deploy Script Skeleton
```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT="interviewing-457222"
REGION="us-central1"
INSTANCE_NAME="spatialhub-db"
SERVICE_NAME="spatialhub-backend"
DB_NAME="spatialhub_db"
DB_USER="spatialhub"

# --- Provision Cloud SQL (idempotent) ---
if ! gcloud sql instances describe "$INSTANCE_NAME" --project="$PROJECT" &>/dev/null; then
  echo "Creating Cloud SQL instance..."
  gcloud sql instances create "$INSTANCE_NAME" \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region="$REGION" \
    --project="$PROJECT" \
    --authorized-networks=0.0.0.0/0 \
    --root-password="${DB_ROOT_PASS}"

  gcloud sql databases create "$DB_NAME" --instance="$INSTANCE_NAME" --project="$PROJECT"
  gcloud sql users create "$DB_USER" --instance="$INSTANCE_NAME" --password="${DB_PASS}" --project="$PROJECT"
fi

DB_HOST=$(gcloud sql instances describe "$INSTANCE_NAME" \
  --project="$PROJECT" --format='value(ipAddresses[0].ipAddress)')

# --- Deploy Django to Cloud Run (source-based) ---
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "DB_HOST=${DB_HOST},DB_NAME=${DB_NAME},DB_USER=${DB_USER},DB_PASS=${DB_PASS},SECRET_KEY=${SECRET_KEY},DEBUG=False,ALLOWED_HOSTS=*"

CLOUD_RUN_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --project "$PROJECT" --format 'value(status.url)')

# --- Run migrations from local machine (public IP is already open) ---
cd django_backend
USE_SQLITE=0 DB_HOST="$DB_HOST" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASS="$DB_PASS" \
  SECRET_KEY="$SECRET_KEY" \
  python manage.py migrate --no-input

USE_SQLITE=0 DB_HOST="$DB_HOST" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASS="$DB_PASS" \
  SECRET_KEY="$SECRET_KEY" \
  python manage.py seed_habitat_zones
cd ..

# --- Build and deploy frontend ---
cd spatialhub-frontend
VITE_API_URL="${CLOUD_RUN_URL}/api" npm run build
firebase deploy --only hosting --project "$PROJECT"
cd ..

echo "Done. Cloud Run: ${CLOUD_RUN_URL}"
echo "Frontend: https://interviewing-457222.web.app"
```

### Frontend URL Fix Pattern
```typescript
// Source: existing api.ts already has BASE_URL — just import it
// In RawSensorData.tsx, EnrichedSensorData.tsx, SensorTrends.tsx:
// BEFORE: axios.get("https://spatialhub-backend-823061962201.us-central1.run.app/api/raw/")
// AFTER:
import { fetchRawSensorData } from '../api/api';
// OR if keeping axios directly:
import axios from 'axios';
const BASE_URL = import.meta.env.VITE_API_URL || 'https://spatialhub-backend-823061962201.us-central1.run.app/api';
axios.get(`${BASE_URL}/raw/`)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Docker build + push + gcloud run deploy --image | `gcloud run deploy --source .` | Cloud Run GA (2022+) | No local Docker required; Dockerfile still used if present |
| Cloud SQL Auth Proxy for connections | Direct public IP with authorized networks | Always available | Auth Proxy safer but unnecessary complexity for this demo; locked decision |
| `manage.py runserver` for production | Gunicorn on port 8080 | Phase 9 | Already in Dockerfile |
| Cloud Functions + Pub/Sub pipeline | Direct Django API | Phase 10 / v3.0 pivot | Simpler, all traffic goes to Cloud Run |

**Deprecated/outdated:**
- Old Cloud Run service URL (`spatialhub-backend-823061962201.us-central1.run.app`): hardcoded in 3 frontend components — replace with dynamic VITE_API_URL
- Hardcoded DB credentials in settings.py fallbacks: remove entirely per locked decision

---

## Open Questions

1. **collectstatic requires DB or not?**
   - What we know: Django's `collectstatic` does not query the database; it just copies static files from INSTALLED_APPS to STATIC_ROOT
   - What's unclear: The existing Dockerfile runs `gunicorn` directly without `USE_SQLITE=1`; if `collectstatic` is added to the Dockerfile, the build environment has no DB — but this is fine since collectstatic doesn't need one
   - Recommendation: Add `ENV USE_SQLITE=1` before the `RUN python manage.py collectstatic --noinput` line in Dockerfile to ensure the sqlite branch is taken during build without any DB required, and to suppress any Django startup DB check

2. **.dockerignore needed?**
   - What we know: `django_backend/venv/` is committed and gets copied into the image (COPY django_backend/ .); pip then reinstalls from requirements.txt which works but makes the image larger
   - What's unclear: Whether image size materially impacts cold start time on db-f1-micro tier
   - Recommendation: Add `.dockerignore` excluding `venv/` and `venv_local/` — reduces image size, cleaner

3. **Secret generation for SECRET_KEY**
   - What we know: Deploy script needs to generate a SECRET_KEY if not already set
   - What's unclear: Whether the user has a preferred secrets management approach
   - Recommendation: Generate with `python -c "import secrets; print(secrets.token_urlsafe(50))"` in the deploy script if `SECRET_KEY` env var not already set; document that this value must be stored externally for future redeploys

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.x + pytest-django (Django) / vitest 4.x (frontend) |
| Config file | `django_backend/pytest.ini` (Django) / `spatialhub-frontend/vite.config.*` (frontend) |
| Quick run command | `cd django_backend && USE_SQLITE=1 pytest sensor_data/tests/test_pi_ingest.py -x -q` |
| Full suite command | `cd django_backend && USE_SQLITE=1 pytest -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 | Django API at Cloud Run URL returns data from Cloud SQL | smoke (curl) | `curl -f "${CLOUD_RUN_URL}/api/enriched/"` | ❌ Wave 0 (deploy script smoke check) |
| DEPLOY-02 | Frontend loads at Firebase URL, connects to Cloud Run API | smoke (curl + manual) | `curl -f "https://interviewing-457222.web.app"` | ❌ Wave 0 (deploy script smoke check) |
| DEPLOY-04 | Cloud SQL has all tables migrated, habitat_zones seeded | smoke (curl) | `curl -f "${CLOUD_RUN_URL}/api/habitat/zones/"` — expects 4 zones in JSON | ❌ Wave 0 (deploy script smoke check) |

Note: All three requirements are deployment/infrastructure outcomes, not unit-testable behavior. Automated validation is smoke checks run at end of deploy script — verify HTTP 200 responses from production URLs. The existing unit tests (`test_pi_ingest.py`, `test_biosim_ingest.py`, etc.) verify the application logic is correct before it gets deployed.

### Sampling Rate
- **Per task commit:** `cd django_backend && USE_SQLITE=1 pytest sensor_data/tests/test_pi_ingest.py -x -q` (ensures ingest endpoint still works after settings.py changes)
- **Per wave merge:** `cd django_backend && USE_SQLITE=1 pytest -q` (full suite)
- **Phase gate:** Full suite green + deploy script smoke checks pass before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `deploy/smoke_check.sh` — curl-based smoke checks: DEPLOY-01 (`/api/enriched/`), DEPLOY-02 (Firebase URL), DEPLOY-04 (`/api/habitat/zones/` returns 4 zones) — can be embedded at end of `deploy/deploy.sh`
- [ ] No new test files needed for unit coverage — application logic tests already exist; this phase is infra work, not logic work

*(Existing test infrastructure covers all application-level verification; the new gap is cloud infrastructure smoke checks post-deploy)*

---

## Sources

### Primary (HIGH confidence)
- [Google Cloud: Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code) — `gcloud run deploy --source .` syntax and Dockerfile behavior
- [Google Cloud: Create Cloud SQL PostgreSQL instances](https://docs.cloud.google.com/sql/docs/postgres/create-instance) — instance create flags and public IP configuration
- [WhiteNoise 6.12.0 Documentation](https://whitenoise.readthedocs.io/en/stable/django.html) — middleware setup and collectstatic requirements
- [Google Cloud: Running database migrations with Cloud Run Jobs](https://cloud.google.com/blog/topics/developers-practitioners/running-database-migrations-cloud-run-jobs/) — migration patterns
- Codebase inspection (settings.py, Dockerfile, firebase.json, .firebaserc, api.ts, RawSensorData.tsx, EnrichedSensorData.tsx, SensorTrends.tsx) — direct observation of current state

### Secondary (MEDIUM confidence)
- [DEV Community: Deploying Vite + React App to Firebase](https://dev.to/aqibnawazdev/deploying-vite-react-app-to-firebase-with-staging-and-production-environments-4ekm) — VITE_API_URL baked at build time pattern (verified against Vite docs behavior in api.ts)
- [Google Cloud Blog: Running database migrations with Cloud Run Jobs](https://cloud.google.com/blog/topics/developers-practitioners/running-database-migrations-cloud-run-jobs/) — migration job pattern

### Tertiary (LOW confidence — not needed)
None — all critical claims verified via official docs or direct codebase inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — gcloud CLI 560.0.0 and firebase 15.2.1 are already installed; `gcloud run deploy --source .` confirmed in official docs; Dockerfile and firebase.json verified by direct read
- Architecture: HIGH — deploy script pattern derived directly from official Google Cloud docs + codebase state; all file paths and patterns verified by inspection
- Pitfalls: HIGH — CSRF and ALLOWED_HOSTS pitfalls are documented Django behavior; hardcoded URL issue verified by direct file read of the three component files

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain — Cloud Run, Firebase Hosting, Django deployment patterns change slowly)
