# Phase 5: Docker Infrastructure - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Full stack (BioSim, Open MCT, Django, PostgreSQL) starts with a single `docker compose up`. BioSim is confirmed running, its live module JSON is captured as a test fixture for Phase 6 mapping work, and Open MCT is accessible via a nav link. No frontend data pipeline wiring — that's Phase 7.

</domain>

<decisions>
## Implementation Decisions

### BioSim Container Strategy
- Build from source in a multi-stage Dockerfile (Stage 1: Maven build, Stage 2: JRE-only runtime)
- Single port for both REST and WebSocket interfaces (BioSim's default)
- Simulation auto-starts on container boot with bundled XML mission config (INFRA-02)

### Django Docker Adaptation
- Reuse existing `Dockerfile` (Cloud Run target) with CMD/port overrides in docker-compose.yml
- Keep hardcoded Cloud SQL credential fallbacks in `settings.py` — don't break production deploys
- Add `.env` file (gitignored) for local Docker credentials; compose reads it automatically (INFRA-04)
- Auto-migrate on container start via entrypoint script (`python manage.py migrate`)
- Auto-seed database with initial data via idempotent management command (`seed_data`) after migrations
- Serve on port 8000 (avoids conflict with Cloud Run's 8080 and Vite's 5173)

### Open MCT Integration
- External `<a>` link in nav bar opening `localhost:9091` in a new tab (not iframe, not React route)
- Link positioned after Habitat nav item, with distinct styling (external link icon or badge)
- Link always visible regardless of Docker/BioSim availability — no conditional logic
- Open MCT mapped to port 9091 (OBS-01)

### Compose Orchestration
- Healthchecks on BioSim REST API with 90-second `start_period` for JVM startup (INFRA-03)
- Django and future bridge services use `depends_on: biosim: condition: service_healthy`
- Named volume (`pgdata`) for PostgreSQL data persistence between restarts
- Single `.env` file at repo root; `.env.example` committed with placeholder values, `.env` in `.gitignore`
- Four services in compose: `biosim`, `openmct`, `db` (PostgreSQL), `django`

### Claude's Discretion
- BioSim XML mission config location (repo directory structure for config files)
- PostgreSQL version selection
- Exact healthcheck interval/retries tuning
- Django entrypoint script structure
- Seed data content (hub configs, habitat zones)
- Open MCT nav link styling details

</decisions>

<specifics>
## Specific Ideas

- BioSim cold Maven build is 10-20 minutes — Docker layer caching should make subsequent builds fast
- Port mapping: BioSim default port → same port, Django → 8000, Open MCT → 9091, PostgreSQL → 5432
- The existing `Dockerfile` copies only `django_backend/` and runs Gunicorn on 8080 — compose overrides this for local dev
- `settings.py` already reads `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` from env vars with fallbacks

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Dockerfile` (repo root): Python 3.11-slim, copies django_backend/, Gunicorn CMD — reusable with compose overrides
- `settings.py`: Already has env-var database config with `os.environ.get()` pattern — INFRA-04 partially done
- `App.tsx` nav: Has `NavLink` component and special `.nav-link--habitat` class — pattern for Open MCT link styling

### Established Patterns
- `USE_SQLITE=1` env var toggle for local dev — similar pattern for Docker vs. Cloud SQL
- Django management commands exist (`sensor_data/management/commands/`) — pattern for seed_data command
- Nav links use `<Link>` from react-router-dom — Open MCT needs a plain `<a>` tag instead (external)

### Integration Points
- `App.tsx` line 53-63: Nav links section where Open MCT link goes
- `settings.py` line 62-71: Database config block that .env variables feed into
- `Dockerfile` line 22: CMD that compose overrides for local dev
- `.gitignore`: Needs `.env` entry

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-docker-infrastructure*
*Context gathered: 2026-03-14*
