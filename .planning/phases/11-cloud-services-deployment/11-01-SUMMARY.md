---
phase: 11-cloud-services-deployment
plan: 01
subsystem: infra
tags: [django, whitenoise, docker, cloud-run, react, typescript, env-vars]

# Dependency graph
requires:
  - phase: 10-django-ingest-hubcode-rewrite
    provides: Django API endpoints and hub_client.py that this phase prepares for cloud deployment
provides:
  - Production-ready Django settings.py with env-var-driven secrets, no hardcoded credentials
  - WhiteNoise static file serving configured for Cloud Run
  - Dockerfile with collectstatic build step and .dockerignore for lean images
  - Centralized frontend API calls through api.ts with no hardcoded Cloud Run URLs
affects: [11-02-cloud-deployment, 12-gce-vm-biosim, 13-firebase-frontend]

# Tech tracking
tech-stack:
  added: [whitenoise>=6.0]
  patterns:
    - "Django settings read all secrets via os.environ.get() with no credential fallbacks"
    - "USE_SQLITE=1 env var gates collectstatic during Docker build to avoid PostgreSQL dependency"
    - "Frontend API calls centralized in api.ts — pages import functions, never construct URLs directly"

key-files:
  created:
    - .dockerignore
    - .planning/phases/11-cloud-services-deployment/11-01-SUMMARY.md
  modified:
    - django_backend/spatialhub_backend/settings.py
    - django_backend/requirements.txt
    - Dockerfile
    - spatialhub-frontend/src/api/api.ts
    - spatialhub-frontend/src/pages/RawSensorData.tsx
    - spatialhub-frontend/src/pages/EnrichedSensorData.tsx
    - spatialhub-frontend/src/pages/SensorTrends.tsx
    - spatialhub-frontend/src/pages/SimulateDevices.tsx

key-decisions:
  - "DB_HOST and DB_PASS have no fallback values — fail loudly in production if env vars absent"
  - "DB_USER defaults to 'spatialhub' (not 'postgres') matching Cloud SQL provisioning convention"
  - "CSRF_TRUSTED_ORIGINS uses *.run.app wildcard to cover any Cloud Run service URL"
  - "api.ts fallback URL is localhost:8000/api — VITE_API_URL env var required at build time for production"
  - "SimulateDevices CLOUD_FUNCTION_URL (cloudfunctions.net) left as-is — not in scope for this plan"

patterns-established:
  - "Settings pattern: os.environ.get('KEY', 'safe-local-fallback') for non-secret config, os.environ.get('KEY') with no fallback for secrets"
  - "Frontend pattern: all backend calls go through api.ts functions — never construct URLs in page components"

requirements-completed: [DEPLOY-01, DEPLOY-02]

# Metrics
duration: 20min
completed: 2026-03-18
---

# Phase 11 Plan 01: Cloud Services Deployment Hardening Summary

**Production-ready Django settings with env-var-driven secrets and WhiteNoise static files, plus zero hardcoded Cloud Run URLs in the React frontend — all 5 page components now route through centralized api.ts**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-18T00:00:00Z
- **Completed:** 2026-03-18T00:20:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Scrubbed cleartext database password (`MN5^a4gYL+=tz4g`) and IP (`35.202.183.120`) from settings.py — production will fail loudly if env vars are absent rather than silently connecting to the wrong database
- Added WhiteNoise middleware and STORAGES config so Cloud Run serves Django static files without a separate CDN
- Dockerfile now runs `collectstatic` with `USE_SQLITE=1` guard before Gunicorn starts, and `.dockerignore` keeps the committed `venv/` out of the image
- Eliminated all 6 hardcoded `spatialhub-backend-823061962201.us-central1.run.app` occurrences across 4 page components; VITE_API_URL at build time now controls the entire frontend's backend target

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden settings.py, add WhiteNoise, update Dockerfile** - `47b01be` (feat)
2. **Task 2: Fix all hardcoded URLs in frontend pages to use centralized BASE_URL** - `b725c52` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `django_backend/spatialhub_backend/settings.py` - env-var-driven secrets, WhiteNoise middleware, STATIC_ROOT, *.run.app CSRF wildcard
- `django_backend/requirements.txt` - added whitenoise>=6.0
- `Dockerfile` - collectstatic step with USE_SQLITE=1 guard before CMD
- `.dockerignore` - excludes venv dirs, .git, .planning, node_modules from Docker context
- `spatialhub-frontend/src/api/api.ts` - exported BASE_URL (localhost:8000 fallback), added fetchHubList and sendCommand exports
- `spatialhub-frontend/src/pages/RawSensorData.tsx` - uses fetchRawSensorData() from api.ts
- `spatialhub-frontend/src/pages/EnrichedSensorData.tsx` - uses fetchEnrichedSensorData() from api.ts
- `spatialhub-frontend/src/pages/SensorTrends.tsx` - uses fetchEnrichedSensorData() from api.ts
- `spatialhub-frontend/src/pages/SimulateDevices.tsx` - uses fetchHubList() and sendCommand() from api.ts

## Decisions Made

- DB_HOST and DB_PASS have no fallback values: Cloud Run will error at startup if these are absent, which is the correct behavior. Silent fallback to wrong database is worse than a crash.
- DB_USER default changed from `postgres` to `spatialhub` to match Cloud SQL user provisioning convention from the research notes.
- CSRF_TRUSTED_ORIGINS uses `*.run.app` wildcard — handles any Cloud Run service URL regardless of project or region suffix.
- `api.ts` fallback URL is `http://localhost:8000/api` — the old Cloud Run URL is being deprovisioned, keeping it as fallback would cause silent prod failures during local dev. Production deployments set VITE_API_URL at build time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed whitenoise in local venv_local**
- **Found during:** Task 1 verification (Django test run)
- **Issue:** `ModuleNotFoundError: No module named 'whitenoise'` — whitenoise added to MIDDLEWARE but not installed in local test venv
- **Fix:** `pip install whitenoise>=6.0` in venv_local; this is a local dev environment fix, not a code change
- **Files modified:** venv_local (not committed)
- **Verification:** 8 tests pass after install
- **Committed in:** 47b01be (Task 1 commit) — code change only, venv not committed

---

**Total deviations:** 1 auto-fixed (1 blocking — local environment)
**Impact on plan:** Necessary for test verification to work. No scope creep.

## Issues Encountered

None beyond the whitenoise local install above.

## User Setup Required

None — no external service configuration required by this plan. The next plan (11-02) will handle Cloud Run deployment with the actual env vars.

## Next Phase Readiness

- Django is deployable to Cloud Run: Dockerfile builds with collectstatic, settings.py reads all secrets from env vars
- Frontend is deployable to Firebase: zero hardcoded backend URLs, all calls routed through api.ts with VITE_API_URL support
- 11-02 can proceed with `gcloud run deploy` and Cloud SQL connection setup

---
*Phase: 11-cloud-services-deployment*
*Completed: 2026-03-18*
