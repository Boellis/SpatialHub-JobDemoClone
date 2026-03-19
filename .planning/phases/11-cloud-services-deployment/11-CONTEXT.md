# Phase 11: Cloud Services Deployment - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Django API deployed to Cloud Run and frontend deployed to Firebase Hosting, both connected to a new Cloud SQL PostgreSQL instance — the existing website works in the cloud with all current features (enriched data, trends, habitat zones, fallback simulation) before adding BioSim VM or Pi connectivity. No BioSim VM, no Pi pipeline — those are Phases 12-13.

</domain>

<decisions>
## Implementation Decisions

### GCP infrastructure
- Fresh provision — do not reuse prior Cloud SQL or Cloud Run resources
- All resources in **us-central1** (co-located with future GCE VM in Phase 12)
- Cloud SQL: **db-f1-micro** tier, PostgreSQL, public IP (no Cloud SQL Auth Proxy)
- Cloud Run connects to Cloud SQL via public IP + password (env vars)
- GCP project: `interviewing-457222`

### Credential & secret handling
- DB credentials (DB_HOST, DB_NAME, DB_USER, DB_PASS) passed as **Cloud Run environment variables** — not hardcoded
- **Remove hardcoded credential fallbacks** from settings.py — local dev uses `USE_SQLITE=1` or a local `.env` file
- Generate a proper **SECRET_KEY** for production, read from env var — hardcoded insecure key becomes local dev only
- **DEBUG=False** in production — read from env var, default to False
- ALLOWED_HOSTS includes the new Cloud Run URL

### Deploy workflow
- **Full setup+deploy bash script** in `deploy/` directory — one script handles Cloud SQL provisioning (if needed), migrations, habitat_zones seeding, Django Cloud Run deploy, and Firebase frontend deploy
- Uses `gcloud run deploy --source .` — **source-based deploy** via Cloud Build (no manual Docker build/push)
- Script location: `deploy/` directory (future VM deploy script for Phase 12 goes here too)
- First run = full infrastructure setup; subsequent runs = code redeploy only

### Frontend URL & CORS
- Default Firebase Hosting URL: **interviewing-457222.web.app** (no custom domain)
- **VITE_API_URL set at build time** in deploy script — points to new Cloud Run service URL
- **VITE_BIOSIM_URL left as localhost:8009** — useSimSource auto-detects unavailability and falls back to client-side sim (Phase 12 will update this to GCE VM IP)
- CORS_ALLOWED_ORIGINS: hardcoded list in settings.py — localhost:5173 + interviewing-457222.web.app (kept as-is, no env var)

### Claude's Discretion
- CORS configuration approach (keep hardcoded list vs env-var driven — Claude decides based on deploy cleanliness)
- Cloud SQL instance name and database user naming
- Deploy script internal structure (single script vs split cloud-run.sh / firebase.sh)
- Static file serving strategy (whitenoise vs Cloud Run default)
- Exact gcloud CLI flags for Cloud Run deploy
- How migrations run against Cloud SQL (Cloud SQL Proxy locally vs Cloud Run job vs deploy script)

</decisions>

<specifics>
## Specific Ideas

- Deploy script should be idempotent — safe to re-run for Phases 12-16 redeployments
- Frontend currently has some pages hardcoding the Cloud Run URL directly in components (RawSensorData.tsx, EnrichedSensorData.tsx, SensorTrends.tsx) — these should use the centralized api.ts BASE_URL
- The existing Dockerfile already targets Cloud Run (port 8080, Gunicorn) — minimal changes expected
- settings.py already has the os.environ.get() pattern — just needs fallback removal and env var additions

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Dockerfile` (repo root): Python 3.11-slim, copies django_backend/, Gunicorn on 8080 — ready for Cloud Run as-is
- `settings.py`: Already has os.environ.get() for DB_HOST/DB_NAME/DB_USER/DB_PASS — just remove hardcoded fallbacks
- `firebase.json` + `.firebaserc`: Firebase Hosting already configured (dist directory, SPA rewrites, project interviewing-457222)
- `api.ts`: BASE_URL reads from `import.meta.env.VITE_API_URL` with fallback — env var override works at build time
- `useSimSource.ts`: BIOSIM_BASE_URL reads from `import.meta.env.VITE_BIOSIM_URL` with localhost fallback — auto-fallback to client sim when unavailable

### Established Patterns
- Django management commands in `sensor_data/management/commands/` — `seed_habitat_zones.py` already exists for zone seeding
- Docker Compose `.env` pattern from Phase 5 — similar approach for Cloud Run env vars
- settings.py `USE_SQLITE=1` toggle for local dev — can add similar `DEBUG` and `SECRET_KEY` env var reads

### Integration Points
- `settings.py`: Remove hardcoded DB credential fallbacks, add SECRET_KEY/DEBUG env var reads, update ALLOWED_HOSTS for new Cloud Run URL
- `Dockerfile`: May need entrypoint for auto-migrate (currently just runs Gunicorn)
- `api.ts`: VITE_API_URL env var already supported — deploy script sets it at build time
- `CORS_ALLOWED_ORIGINS` in settings.py: May need new Cloud Run URL added to CSRF_TRUSTED_ORIGINS
- `deploy/` directory: New — deploy scripts for Cloud Run + Firebase

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-cloud-services-deployment*
*Context gathered: 2026-03-18*
