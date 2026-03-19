---
phase: 11-cloud-services-deployment
plan: 02
subsystem: infra
tags: [gcloud, cloud-sql, cloud-run, firebase-hosting, deploy-script]

requires:
  - phase: 11-01
    provides: Production-hardened settings.py, env-var-driven config, centralized frontend API URLs
provides:
  - Idempotent deploy script (deploy/deploy.sh)
  - Live Cloud SQL PostgreSQL instance (nasa-comp-demo, us-central1)
  - Live Django API on Cloud Run
  - Live frontend on Firebase Hosting
  - 4 seeded habitat zones in Cloud SQL
affects: [12-biosim-vm, 13-pi-pipeline, 14-integration]

tech-stack:
  added: [gcloud-cli, firebase-cli]
  patterns: [source-based-cloud-run-deploy, local-migrate-against-cloud-sql]

key-files:
  created:
    - deploy/deploy.sh
  modified:
    - django_backend/spatialhub_backend/settings.py
    - spatialhub-frontend/.firebaserc

key-decisions:
  - "New GCP project nasa-comp-demo (nick@demarily.dev) — interviewing-457222 had IAM issues"
  - "Cloud SQL authorized-networks=0.0.0.0/0 — migrations run from local machine, no Auth Proxy"
  - "Firebase Hosting at nasa-comp-demo.web.app"
  - "VITE_API_URL baked at frontend build time by deploy script"

patterns-established:
  - "Deploy script idempotent: re-run skips provisioning, only redeploys code"
  - "Migrations run from local machine against Cloud SQL public IP"

requirements-completed: [DEPLOY-01, DEPLOY-02, DEPLOY-04]

duration: 45min
completed: 2026-03-19
---

# Plan 11-02: Deploy Script & Full GCP Deployment Summary

**Idempotent deploy script provisioning Cloud SQL + Cloud Run + Firebase under nasa-comp-demo project, all smoke checks passing**

## Performance

- **Duration:** ~45 min (including Cloud SQL provisioning wait)
- **Tasks:** 2/2 (script creation + human-verified deployment)
- **Files modified:** 3

## Accomplishments
- Created `deploy/deploy.sh` — single idempotent script for full GCP deployment
- Provisioned Cloud SQL PostgreSQL (db-f1-micro, us-central1, public IP 34.30.238.232)
- Deployed Django to Cloud Run (source-based, all env vars configured)
- Ran all migrations and seeded 4 habitat zones on Cloud SQL
- Built frontend with Cloud Run URL baked into VITE_API_URL, deployed to Firebase
- All 4 smoke checks pass: API 200, 4 zones, Firebase 200, sensor ingest 201

## Task Commits

1. **Task 1: Create deploy script** - `1a578f9` (feat)
2. **Task 1b: Update project ID to nasa-comp-demo** - `5cd7418` (feat)
3. **Task 2: Human verification** - approved by user

## Files Created/Modified
- `deploy/deploy.sh` - Idempotent GCP deploy script (Cloud SQL + Cloud Run + Firebase)
- `django_backend/spatialhub_backend/settings.py` - CORS/CSRF origins updated for nasa-comp-demo
- `spatialhub-frontend/.firebaserc` - Firebase project updated to nasa-comp-demo

## Decisions Made
- Switched from `interviewing-457222` to new project `nasa-comp-demo` — original project had IAM permission issues for nick@demarily.dev
- Billing account: `nasa-comp` (01B6F5-79FC18-4E3B72) — demarily.dev hit quota, My Billing Account was closed
- Smoke test payload updated to include all 9 required ingest fields

## Deviations from Plan
- GCP project changed from `interviewing-457222` to `nasa-comp-demo` — IAM permissions forced new project creation
- Firebase required `firebase projects:addfirebase` before first deploy — not in original plan
- Deploy script was committed first, then run manually (agent hit auth wall, user ran it)

## Issues Encountered
- `nick@demarily.dev` lacked Cloud SQL Admin on `interviewing-457222` — resolved by creating new project
- `demarily.dev` billing account hit quota — used new `nasa-comp` billing account
- Firebase deploy failed with "no site name" — needed `firebase projects:addfirebase` first
- Sensor ingest smoke test returned 400 — missing location/owner/workers fields in payload

## Next Phase Readiness
- Cloud Run URL live for Pi hubcode to POST to (Phase 13)
- GCE VM for BioSim can be provisioned in same project (Phase 12)
- Frontend confirmed working at nasa-comp-demo.web.app

---
*Phase: 11-cloud-services-deployment*
*Completed: 2026-03-19*
