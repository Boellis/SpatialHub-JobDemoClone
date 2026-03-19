---
phase: 11-cloud-services-deployment
verified: 2026-03-19T00:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 11: Cloud Services Deployment Verification Report

**Phase Goal:** Django API deployed to Cloud Run and frontend deployed to Firebase Hosting, both connected to a Cloud SQL PostgreSQL instance — the existing website works in the cloud with all current features (enriched data, trends, habitat zones) before adding BioSim or Pi connectivity
**Verified:** 2026-03-19
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| #  | Truth                                                                                          | Status     | Evidence                                                                                                  |
|----|-----------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------|
| 1  | Django API responds at Cloud Run URL — GET returns data from Cloud SQL                        | VERIFIED   | Smoke check passed (HTTP 200). Human verified in browser. Cloud Run URL: https://spatialhub-backend-4vovlomqfa-uc.a.run.app |
| 2  | Frontend loads at Firebase Hosting URL, connects to Cloud Run API, displays all data pages    | VERIFIED   | Smoke check passed (Firebase 200). Human approved all pages load. URL: https://nasa-comp-demo.web.app    |
| 3  | Cloud SQL instance has all Django tables migrated and habitat_zones seeded (4 zones)          | VERIFIED   | Smoke check: 4 zones returned. Human verification confirmed. Cloud SQL IP: 34.30.238.232                  |
| 4  | POST /api/sensor-ingest/ stores a row in Cloud SQL enriched_sensor_data                       | VERIFIED   | Smoke check passed (HTTP 201). Confirmed by human.                                                         |

### Additional Must-Have Truths (from Plan 01 frontmatter)

| #  | Truth                                                                                         | Status     | Evidence                                                                                                  |
|----|-----------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------|
| 5  | settings.py has no hardcoded database credentials or passwords                                | VERIFIED   | DB_HOST: `os.environ.get('DB_HOST')` — no fallback. DB_PASS: `os.environ.get('DB_PASS')` — no fallback. grep confirms no old IP or password text. |
| 6  | SECRET_KEY reads from env var with insecure local-dev-only fallback                           | VERIFIED   | Line 7: `SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-local-dev-only-key')`               |
| 7  | DEBUG defaults to False when env var absent                                                   | VERIFIED   | Line 8: `DEBUG = os.environ.get('DEBUG', 'False') == 'True'`                                            |
| 8  | CSRF_TRUSTED_ORIGINS covers all Cloud Run URLs via wildcard                                   | VERIFIED   | Lines 91-94: `["https://*.run.app", "https://nasa-comp-demo.web.app"]`                                  |
| 9  | WhiteNoise middleware serves Django static files in production                                 | VERIFIED   | Line 27 in MIDDLEWARE: `'whitenoise.middleware.WhiteNoiseMiddleware'`. STORAGES configured. whitenoise>=6.0 in requirements.txt line 6. |
| 10 | Dockerfile runs collectstatic before Gunicorn CMD                                             | VERIFIED   | Lines 19-21: `ENV USE_SQLITE=1`, `RUN python manage.py collectstatic --noinput`, `ENV USE_SQLITE=0` — before CMD on line 27. |
| 11 | All frontend pages use centralized BASE_URL from api.ts — zero hardcoded Cloud Run URLs remain | VERIFIED  | grep confirms zero instances of `spatialhub-backend-823061962201` in `src/`. All 4 page components import from api.ts. |

**Score:** 11/11 truths verified

---

## Required Artifacts

| Artifact                                                        | Expected                                                            | Status     | Details                                                                   |
|-----------------------------------------------------------------|---------------------------------------------------------------------|------------|---------------------------------------------------------------------------|
| `django_backend/spatialhub_backend/settings.py`                 | Production-ready settings, env-var secrets, no credential fallbacks | VERIFIED   | 104 lines, contains `os.environ.get('SECRET_KEY'`, no hardcoded creds    |
| `django_backend/requirements.txt`                               | WhiteNoise dependency added                                          | VERIFIED   | `whitenoise>=6.0` at line 6                                              |
| `Dockerfile`                                                     | collectstatic step + .dockerignore excluding venv                   | VERIFIED   | 28 lines, collectstatic present with USE_SQLITE guard                    |
| `.dockerignore`                                                  | Excludes venv and unnecessary files                                  | VERIFIED   | 9 lines, excludes `django_backend/venv/`, `django_backend/venv_local/`  |
| `spatialhub-frontend/src/pages/RawSensorData.tsx`               | Uses BASE_URL via fetchRawSensorData from api.ts                    | VERIFIED   | Imports and calls `fetchRawSensorData` — no direct URL construction      |
| `spatialhub-frontend/src/pages/EnrichedSensorData.tsx`          | Uses BASE_URL via fetchEnrichedSensorData from api.ts               | VERIFIED   | Imports and calls `fetchEnrichedSensorData(1)`                           |
| `spatialhub-frontend/src/pages/SensorTrends.tsx`                | Uses BASE_URL via fetchEnrichedSensorData from api.ts               | VERIFIED   | Imports and calls `fetchEnrichedSensorData(1)`                           |
| `spatialhub-frontend/src/pages/SimulateDevices.tsx`             | Uses BASE_URL via fetchHubList and sendCommand from api.ts          | VERIFIED   | Imports `fetchHubList, sendCommand` from api.ts; uses both              |
| `spatialhub-frontend/src/api/api.ts`                            | Exports BASE_URL, fetchHubList, sendCommand; localhost fallback      | VERIFIED   | `export const BASE_URL = import.meta.env.VITE_API_URL \|\| 'http://localhost:8000/api'`; all exports present |
| `deploy/deploy.sh`                                              | Idempotent deploy script, min 80 lines, executable                  | VERIFIED   | 240 lines, -rwxr-xr-x permissions, bash script                          |

---

## Key Link Verification

| From                          | To                         | Via                                          | Status  | Details                                                                         |
|-------------------------------|----------------------------|----------------------------------------------|---------|---------------------------------------------------------------------------------|
| `settings.py`                 | Cloud Run env vars         | `os.environ.get('DB_HOST')` no fallback      | WIRED   | Line 66: `'HOST': os.environ.get('DB_HOST')` — fails loudly if absent         |
| `RawSensorData.tsx`           | `api/api.ts`               | import BASE_URL via fetchRawSensorData        | WIRED   | Line 2 import, line 12 call site                                               |
| `Dockerfile`                  | settings.py collectstatic  | USE_SQLITE=1 env guard before RUN             | WIRED   | Lines 18-21: env set, collectstatic run, env cleared before CMD               |
| `deploy/deploy.sh`            | Cloud SQL instance         | `gcloud sql instances create`                 | WIRED   | Line 69 in script                                                              |
| `deploy/deploy.sh`            | Cloud Run service          | `gcloud run deploy --source .` with env vars  | WIRED   | Line 122 in script                                                             |
| `deploy/deploy.sh`            | Firebase Hosting           | `firebase deploy --only hosting`              | WIRED   | Line 185 in script                                                             |
| `deploy/deploy.sh`            | Django migrations on SQL   | `python manage.py migrate`                    | WIRED   | Lines 159-166 in script                                                        |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                                             | Status    | Evidence                                                                               |
|-------------|-------------|-----------------------------------------------------------------------------------------|-----------|----------------------------------------------------------------------------------------|
| DEPLOY-01   | 11-01, 11-02 | Django API deployed to Cloud Run, publicly accessible, connected to Cloud SQL           | SATISFIED | Cloud Run URL live, API 200 smoke check, human verified. REQUIREMENTS.md marked [x].  |
| DEPLOY-02   | 11-01, 11-02 | Frontend deployed to Firebase Hosting with production API base URL configured           | SATISFIED | Firebase Hosting 200 smoke check, VITE_API_URL baked at build. REQUIREMENTS.md [x].   |
| DEPLOY-04   | 11-02        | Cloud SQL provisioned with all Django tables migrated and habitat_zones seeded          | SATISFIED | 4 zones smoke check passed, human verified. Note: REQUIREMENTS.md checkbox shows `[ ]` but the tracking table correctly shows Phase 11 / Pending — this is a REQUIREMENTS.md sync gap (documentation only, not an implementation gap). The actual deployment is confirmed by 4 independent verifications: deploy script smoke check, human approval, SUMMARY.md, and the additional context from the phase prompt. |

**Note on DEPLOY-04 in REQUIREMENTS.md:** The checkbox shows `[ ]` (not checked) and the tracking table shows "Pending" despite the deployment having occurred and been human-verified. This is a stale documentation artifact — REQUIREMENTS.md was not updated after the deployment completed. The implementation is verified as complete; only the documentation needs updating.

---

## Anti-Patterns Found

| File                             | Line | Pattern                         | Severity | Impact  |
|----------------------------------|------|---------------------------------|----------|---------|
| `SimulateDevices.tsx`            | 2    | `import axios from "axios"`     | INFO     | Retained intentionally for CLOUD_FUNCTION_URL (old Cloud Function ingest path). Plan explicitly documented this as out of scope and left as-is. Not a defect. |
| `SimulateDevices.tsx`            | 5-6  | `CLOUD_FUNCTION_URL` hardcoded  | INFO     | Points to `cloudfunctions.net` (old ingest), not the old Cloud Run URL. Explicitly left as-is per plan decision. Out of scope for Phase 11. |

No blockers. No stubs. No unexpected `return null` / placeholder patterns.

---

## Human Verification

All human verification for this phase was completed during plan execution:

### 1. Full Browser Verification (Completed — approved by user)

**Test:** Open https://nasa-comp-demo.web.app, verify navigation loads, click through all data pages (Raw, Enriched, Trends, Mars Habitat)
**Expected:** Pages load without URL errors, data displays from Cloud SQL
**Result:** Approved by human per 11-02-SUMMARY.md Task 2 completion

### 2. Cloud Run API Direct Access (Completed)

**Test:** Open `https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/habitat/zones/` in browser
**Expected:** JSON array with 4 habitat zones
**Result:** Confirmed (smoke check returned 4 zones)

---

## Git Commit Verification

All documented commits exist in git history and were verified:

| Commit  | Description                                              |
|---------|----------------------------------------------------------|
| 47b01be | feat(11-01): harden Django settings and Dockerfile       |
| b725c52 | feat(11-01): centralize all frontend API calls           |
| 1a578f9 | feat(11-02): add idempotent deploy script                |
| 5cd7418 | feat(11-02): deploy to nasa-comp-demo GCP project        |

---

## Gaps Summary

No gaps. All automated checks pass. Human verification was completed during plan execution. The phase goal is fully achieved.

The only notable item is a stale REQUIREMENTS.md checkbox for DEPLOY-04 — the implementation is verified live in production; only the markdown file needs a checkbox update.

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
