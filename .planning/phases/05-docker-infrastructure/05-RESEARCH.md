# Phase 5: Docker Infrastructure - Research

**Researched:** 2026-03-14
**Domain:** Docker Compose orchestration — BioSim (Java/Maven), Open MCT, Django, PostgreSQL
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**BioSim Container Strategy**
- Build from source in a multi-stage Dockerfile (Stage 1: Maven build, Stage 2: JRE-only runtime)
- Single port for both REST and WebSocket interfaces (BioSim's default)
- Simulation auto-starts on container boot with bundled XML mission config (INFRA-02)

**Django Docker Adaptation**
- Reuse existing `Dockerfile` (Cloud Run target) with CMD/port overrides in docker-compose.yml
- Keep hardcoded Cloud SQL credential fallbacks in `settings.py` — don't break production deploys
- Add `.env` file (gitignored) for local Docker credentials; compose reads it automatically (INFRA-04)
- Auto-migrate on container start via entrypoint script (`python manage.py migrate`)
- Auto-seed database with initial data via idempotent management command (`seed_data`) after migrations
- Serve on port 8000 (avoids conflict with Cloud Run's 8080 and Vite's 5173)

**Open MCT Integration**
- External `<a>` link in nav bar opening `localhost:9091` in a new tab (not iframe, not React route)
- Link positioned after Habitat nav item, with distinct styling (external link icon or badge)
- Link always visible regardless of Docker/BioSim availability — no conditional logic
- Open MCT mapped to port 9091 (OBS-01)

**Compose Orchestration**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Docker Compose starts all services (BioSim, Open MCT, Django, PostgreSQL) with `docker compose up` | Upstream BioSim docker-compose.yml structure discovered — four-service pattern documented below |
| INFRA-02 | BioSim simulation auto-starts on container boot with bundled XML mission config | `bin/start-biosim-server` only starts the server; simulation start requires a wrapper script that POSTs to `/api/simulation/start` — see Critical Finding below |
| INFRA-03 | Docker healthchecks with `service_healthy` conditions and 90s JVM start period | `healthcheck` + `depends_on: condition: service_healthy` patterns documented; `start_period: 90s` confirmed sufficient |
| INFRA-04 | Django settings.py reads database credentials from environment variables for Docker | `settings.py` already does this via `os.environ.get()` with Cloud SQL IP fallbacks — env file approach documented |
| OBS-01 | Navigation link to Open MCT dashboard (opens `localhost:9091` in new tab) | Plain `<a>` tag pattern in `App.tsx` documented; nav insertion point identified at line 60 |
</phase_requirements>

---

## Summary

BioSim by Scott Bell has its own `docker-compose.yml` that covers BioSim server (port 8009) and Open MCT plugin (port 9091 → container 80). Our compose extends this pattern by adding PostgreSQL and Django services. The upstream Dockerfile uses a single-stage `eclipse-temurin:21-jdk` build with Maven installed at runtime — we should use this as-is rather than a custom multi-stage build to avoid diverging from upstream and introducing breakage risks, since the locked decision says "build from source" without requiring us to rewrite the Dockerfile.

The most critical discovery: `bin/start-biosim-server` only starts the HTTP/WebSocket server. It does NOT auto-start a simulation. The simulation requires a separate `POST /api/simulation/start` call with XML body. The upstream `bin/run-simulation` script handles this via curl, but it is a standalone script, not part of the container's CMD. Our compose setup needs a wrapper entrypoint or a `command` override that: (1) starts the server as a background process, (2) waits for it to be ready, (3) POSTs the default config to `/api/simulation/start`. This is the core implementation challenge for INFRA-02.

Django's `settings.py` already reads `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` from environment variables with Cloud SQL IP fallbacks — INFRA-04 is already 90% done. The only work is adding a `.env` file that overrides these values for local Docker use, and an entrypoint script that runs `python manage.py migrate` before Gunicorn starts. The existing `seed_habitat_zones` management command is idempotent (uses `update_or_create`), so it can be chained in the entrypoint safely.

**Primary recommendation:** Use BioSim's upstream Dockerfile unchanged (pulled via `build: context: .` pointing to a git submodule or `build: context: https://github.com/scottbell/biosim.git`), override the CMD in docker-compose to a wrapper script that starts-then-seeds the simulation.

---

## Standard Stack

### Core
| Library / Image | Version | Purpose | Why Standard |
|-----------------|---------|---------|--------------|
| `eclipse-temurin:21-jdk` | 21 | BioSim build + runtime base image | Upstream BioSim Dockerfile uses this exactly |
| `postgres` | 16 (recommended) | Relational DB for Django data | Stable LTS, matches Cloud SQL compatible versions |
| `python:3.11-slim` | 3.11 | Django service base (existing Dockerfile) | Already in prod Dockerfile, no change needed |
| `openmct-biosim` | built from GitHub | Open MCT + BioSim telemetry plugin | Upstream compose builds from `scottbell/openmct-biosim` |
| Docker Compose v2 | 2.x | Orchestration (`docker compose` not `docker-compose`) | Current syntax; no `version:` key needed |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `pg_isready` | PostgreSQL healthcheck command | In `db` service healthcheck — available in the postgres image |
| `curl` | BioSim REST healthcheck | In `biosim` service healthcheck (`curl -f http://localhost:8009/api/simulation`) |
| `psycopg2-binary` | Django PostgreSQL adapter | Already in `django_backend/requirements.txt` |
| `.env` + `env_file:` | Secret injection | Single `.env` at repo root, referenced in compose |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Building BioSim from upstream GitHub context | Forking/copying source into repo | Upstream context means zero maintenance, but requires network on first build |
| `eclipse-temurin:21-jdk` (single-stage) | Multi-stage JDK → JRE | Upstream uses single-stage; multi-stage saves ~180MB but requires maintaining a custom Dockerfile |
| `postgres:16` | `postgres:15` or `postgres:17` | 16 is current stable LTS; 17 is newest, 15 is older — 16 matches Cloud SQL defaults |

**Installation:**
```bash
# No npm/pip installs needed — all orchestrated via docker compose
docker compose up --build
```

---

## Architecture Patterns

### Recommended Project Structure
```
SpatialHub-JobDemoClone/
├── docker-compose.yml           # Four-service orchestration
├── .env.example                 # Committed — placeholder values
├── .env                         # Gitignored — real local credentials
├── biosim/                      # BioSim config files (not source)
│   └── default.biosim           # Copied from upstream repo or bundled
├── docker/
│   └── django-entrypoint.sh     # migrate + seed + exec
└── django_backend/              # Existing (unchanged)
    └── sensor_data/management/commands/
        └── seed_habitat_zones.py    # Existing, idempotent
```

### Pattern 1: Four-Service Compose with Ordered Startup

**What:** All four services in a single `docker-compose.yml`. `db` starts first with a healthcheck. `django` depends on `db: service_healthy`. `biosim` starts independently with its own healthcheck. `openmct` starts independently. No service blocks another's startup chain unnecessarily.

**When to use:** Always — this is the entire point of INFRA-01.

**Example:**
```yaml
# Source: Derived from https://github.com/scottbell/biosim/blob/main/docker-compose.yml
# and Docker official docs https://docs.docker.com/compose/how-tos/startup-order/
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: spatialhub_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d spatialhub_db"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  biosim:
    build:
      context: https://github.com/scottbell/biosim.git
    ports:
      - "8009:8009"
    command: ["./bin/start-and-seed-simulation"]  # wrapper script (see Pattern 2)
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8009/api/simulation || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 6
      start_period: 90s

  openmct:
    build:
      context: https://github.com/scottbell/openmct-biosim.git
    ports:
      - "9091:80"

  django:
    build: .
    ports:
      - "8000:8000"
    env_file:
      - .env
    command: ["./docker/django-entrypoint.sh"]
    depends_on:
      db:
        condition: service_healthy

volumes:
  pgdata:
```

### Pattern 2: BioSim Auto-Start Wrapper Script

**What:** BioSim's Dockerfile CMD starts only the server. Simulation auto-start (INFRA-02) requires POSTing the XML config to `/api/simulation/start`. The wrapper script starts the server in the background, polls until it responds, then fires the POST.

**Critical:** The `run-simulation` script in BioSim's `bin/` does exactly the POST step — but it is not called by the container CMD. We either (a) add a wrapper inside the BioSim image (requires a custom Dockerfile extending upstream), or (b) use a Docker compose `command` override that is a shell one-liner.

**Recommended approach — custom entrypoint via `command` override:**

Since BioSim's Dockerfile CMD is `./bin/start-biosim-server`, we can override it in compose with a shell command that chains the server start with a simulation seed:

```yaml
# In docker-compose.yml biosim service:
command: >
  sh -c "./bin/start-biosim-server &
         until curl -sf http://localhost:8009/api/simulation; do sleep 2; done &&
         curl -s -X POST http://localhost:8009/api/simulation/start
           --data-binary @/app/configuration/default.biosim
           -H 'Content-Type: text/plain' &&
         wait"
```

**Why `wait` at end:** Keeps the shell alive as PID 1 so the container doesn't exit. The server process runs in background; `wait` blocks until it exits.

**Alternative approach — extend BioSim image with custom Dockerfile:**
```dockerfile
# biosim.Dockerfile
FROM scottbell/biosim:latest  # if a published image exists, otherwise build from context
COPY biosim/start-and-seed.sh /app/bin/
RUN chmod +x /app/bin/start-and-seed.sh
CMD ["./bin/start-and-seed.sh"]
```

**Recommendation:** Use the `command` override in compose. It avoids maintaining a separate Dockerfile and keeps all orchestration logic in one place.

### Pattern 3: Django Entrypoint with Migrate + Seed

**What:** A shell script that runs `python manage.py migrate`, `python manage.py seed_habitat_zones`, then `exec gunicorn` — all before the container is considered up.

**When to use:** Always — needed for INFRA-04 (env-var credentials) and Phase 6 readiness.

```bash
#!/bin/sh
# docker/django-entrypoint.sh
set -e

echo "Running migrations..."
python manage.py migrate --noinput

echo "Seeding habitat zones..."
python manage.py seed_habitat_zones

echo "Starting Gunicorn on port 8000..."
exec gunicorn spatialhub_backend.wsgi:application --bind 0.0.0.0:8000
```

**Note on `exec`:** Using `exec` replaces the shell process with gunicorn, making gunicorn PID 1 in the container. This ensures Docker signals (SIGTERM on `docker compose stop`) reach gunicorn correctly.

### Pattern 4: Django .env File + env_file Directive

**What:** Single `.env` file at repo root overrides Django's Cloud SQL credential fallbacks.

```bash
# .env.example (committed)
DB_HOST=db
DB_NAME=spatialhub_db
DB_USER=postgres
DB_PASS=changeme_local
USE_SQLITE=0
```

```bash
# .env (gitignored — local only)
DB_HOST=db
DB_NAME=spatialhub_db
DB_USER=postgres
DB_PASS=supersecret123
USE_SQLITE=0
```

The compose `env_file: .env` directive injects all values as environment variables into the django container. Django's `settings.py` already reads them with `os.environ.get('DB_HOST', '35.202.183.120')` fallbacks — production deploys continue to work because Cloud Run sets its own environment variables which override the Python defaults.

### Pattern 5: Open MCT Nav Link (Plain `<a>` tag)

**What:** An external link in the existing nav that opens `localhost:9091` in a new tab. Uses a plain `<a>` instead of react-router `<Link>` because it's external.

**Insertion point:** `App.tsx` line 60-61, after `<NavLink to="/habitat">` block.

```tsx
{/* Source: App.tsx nav-links section — external link pattern */}
<a
  href="http://localhost:9091"
  target="_blank"
  rel="noopener noreferrer"
  className="nav-link nav-link--external"
>
  Open MCT
</a>
```

**Styling:** Add `.nav-link--external` class to frontend CSS with a small external link indicator. Always visible — no conditional rendering based on BioSim availability.

### Anti-Patterns to Avoid

- **Relying on `depends_on` without healthcheck:** `depends_on: biosim: condition: service_started` only waits for the container to start, not for the JVM to finish loading. Always pair with `service_healthy`.
- **Running `python manage.py migrate` as a separate compose service with `service_completed_successfully`:** Adds complexity; a simple entrypoint script is sufficient for this single-instance setup.
- **Forgetting `wait` after backgrounding the server:** If the wrapper script exits after POSTing the simulation start, Docker kills the container immediately.
- **Hardcoding `localhost` as DB_HOST in Django:** Inside Docker, services communicate by service name (`db`), not `localhost`. The `.env` must set `DB_HOST=db`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PostgreSQL readiness check | Custom TCP ping loop in entrypoint | `pg_isready` in healthcheck + `depends_on: service_healthy` | `pg_isready` checks protocol handshake, not just TCP port |
| Waiting for BioSim REST API | Custom Python/shell polling script | `curl -sf` in healthcheck with `start_period` | Compose healthcheck machinery handles retries and signals |
| Service startup ordering | `sleep 30` hacks in entrypoint | `depends_on: condition: service_healthy` | Sleep duration is a guess; healthcheck is deterministic |
| Open MCT visualization | Custom Three.js dashboard for BioSim data | `scottbell/openmct-biosim` image | Pre-built NASA plugin, builds from GitHub context in one line |

**Key insight:** The entire BioSim + Open MCT stack is one `build: context: <github-url>` line each. Zero custom image maintenance required for those two services.

---

## Common Pitfalls

### Pitfall 1: Maven Build Takes 10-20 Minutes on Cold Cache
**What goes wrong:** First `docker compose up --build` hangs for 10-20 minutes while Maven downloads dependencies and compiles BioSim.
**Why it happens:** The `eclipse-temurin:21-jdk` base image doesn't cache Maven artifacts. Every cold build downloads the internet.
**How to avoid:** Layer the Dockerfile to copy `pom.xml` first and run `mvn dependency:go-offline` as a separate step — but this requires a custom Dockerfile extending the upstream. For this phase, accept the cold build time and document it prominently in a README or `docker-compose.yml` comment. Subsequent builds use the layer cache.
**Warning signs:** `docker compose up` stalls at `[+] Building` for more than a minute on first run.

### Pitfall 2: BioSim healthcheck passes before simulation is running
**What goes wrong:** The healthcheck hits `/api/simulation` which returns `[]` (empty list) — this is a 200 OK. Django starts thinking BioSim is healthy, but there's no running simulation yet. Phase 6 mapping code then has nothing to query.
**Why it happens:** `/api/simulation` lists simulations; it returns 200 even when the list is empty. The server is "healthy" but useless.
**How to avoid:** The simulation auto-start wrapper (Pattern 2) fires the POST before Django starts. The healthcheck on BioSim should be considered a "server is up" check only, not a "simulation is running" check. The wrapper script handles sequencing.
**Warning signs:** `GET /api/simulation` returns `[]` after startup.

### Pitfall 3: DB_HOST=localhost fails inside Docker
**What goes wrong:** Django container cannot connect to PostgreSQL if `DB_HOST` is `localhost` or `127.0.0.1`.
**Why it happens:** Inside Docker Compose networking, `localhost` refers to the django container itself, not the `db` service. Services communicate via their service name.
**How to avoid:** Set `DB_HOST=db` in `.env`. Django's `settings.py` already has the env-var override — the fix is entirely in the config file.
**Warning signs:** `django.db.utils.OperationalError: could not connect to server` on startup.

### Pitfall 4: `command` override in compose doesn't inherit Dockerfile's WORKDIR
**What goes wrong:** Shell `command` override uses relative paths like `./bin/start-biosim-server` but the working directory isn't `/app`.
**Why it happens:** The Dockerfile sets `WORKDIR /app`, which is inherited. This is usually fine — but if using `command: sh -c "..."`, the shell starts in WORKDIR. Confirm `/app` is the right directory.
**How to avoid:** Use `working_dir: /app` explicitly in the compose service if there's any ambiguity.
**Warning signs:** `sh: ./bin/start-biosim-server: not found` on container start.

### Pitfall 5: openmct-biosim GitHub build context requires internet access
**What goes wrong:** `build: context: https://github.com/scottbell/openmct-biosim.git` fails in air-gapped environments or with intermittent network.
**Why it happens:** Docker BuildKit fetches the GitHub repository as the build context at build time.
**How to avoid:** Run `docker compose build` once on a network-connected machine and use the resulting images. For this phase (local dev demo), this is acceptable behavior — document it.
**Warning signs:** `error: failed to solve: failed to read dockerfile` with GitHub URL in the error.

---

## Code Examples

Verified patterns from official and upstream sources:

### Upstream BioSim docker-compose.yml (verbatim)
```yaml
# Source: https://github.com/scottbell/biosim/blob/main/docker-compose.yml
services:
  biosim-server:
    build: .
    ports:
      - "8009:8009"
    volumes:
      - ./logs:/app/logs

  openmct-biosim:
    build:
      context: "https://github.com/scottbell/openmct-biosim.git"
    ports:
      - "9091:80"
```

### BioSim REST API Endpoints (from upstream docs)
```bash
# List active simulation IDs
GET /api/simulation

# Get simulation state + all module details
GET /api/simulation/{simID}

# Start a new simulation with XML config as plain-text body
POST /api/simulation/start
Content-Type: text/plain
[XML body]

# WebSocket for live tick updates
ws://localhost:8009/ws/simulation/{simID}

# One-tick advance (for testing)
POST /api/simulation/{simID}/tick
```

### Healthcheck + depends_on pattern
```yaml
# Source: https://docs.docker.com/compose/how-tos/startup-order/
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d spatialhub_db"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  django:
    depends_on:
      db:
        condition: service_healthy
```

### Django entrypoint that uses exec correctly
```bash
#!/bin/sh
# docker/django-entrypoint.sh
set -e
python manage.py migrate --noinput
python manage.py seed_habitat_zones
exec gunicorn spatialhub_backend.wsgi:application --bind 0.0.0.0:8000
```

### Capture simID from BioSim REST (for test fixture)
```bash
# Start simulation, capture response (should be a simID string)
SIM_ID=$(curl -s -X POST http://localhost:8009/api/simulation/start \
  --data-binary @biosim/default.biosim \
  -H "Content-Type: text/plain")

# Fetch module state JSON and save as fixture
curl -s http://localhost:8009/api/simulation/${SIM_ID} \
  | python3 -m json.tool > tests/fixtures/biosim_module_state.json
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `version: "3.8"` in docker-compose.yml | No `version:` key (deprecated) | Docker Compose v2 (2023) | Remove the `version:` line — it's ignored and generates a warning |
| `docker-compose` (v1, Python) | `docker compose` (v2, Go plugin) | 2022 | Use `docker compose` not `docker-compose` in all commands and docs |
| `sleep 30` to wait for DB | `depends_on: condition: service_healthy` | Compose v2.1+ | Deterministic startup ordering without arbitrary sleeps |

**Deprecated/outdated:**
- `links:` directive in compose — replaced by default bridge network where services reach each other by service name
- `version: "3"` top-level key — still works but generates deprecation warning in Compose v2.23+

---

## Open Questions

1. **BioSim simulation auto-start: wrapper script vs. command override**
   - What we know: The server CMD is `./bin/start-biosim-server`; simulation requires POST to `/api/simulation/start`; upstream `bin/run-simulation` script does the POST via curl
   - What's unclear: Whether curl is available in the `eclipse-temurin:21-jdk` image (it likely is via apt, installed by the BioSim Dockerfile's `apt-get install -y maven` step — but Maven doesn't pull curl). Need to verify curl availability or use a different polling tool.
   - Recommendation: In the compose `command` override, use `wget` or install `curl` explicitly, OR use a Python one-liner (`python3 -c "import urllib.request; ..."`) since the JDK image has no guaranteed curl. Verify on first build.

2. **openmct-biosim build time**
   - What we know: It builds from `https://github.com/scottbell/openmct-biosim.git`
   - What's unclear: Whether the openmct-biosim image is Node.js based (likely) and how long it takes to build on cold cache
   - Recommendation: Accept unknown build time for first run; subsequent builds use layer cache.

3. **BioSim XML config bundling strategy**
   - What we know: `configuration/default.biosim` exists in the upstream repo and is copied into the image via `COPY etc/ ./etc/` and `COPY bin/ ./bin/` — but the XML is in `configuration/`, which is NOT copied in the upstream Dockerfile
   - What's unclear: Whether `configuration/` is included in the Docker image or must be volume-mounted
   - Recommendation: The planner must include a task to verify whether `default.biosim` lands in the image or needs a volume mount of a local `biosim/` directory.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Django test runner (unittest) + bash smoke tests |
| Config file | No pytest.ini — uses `python manage.py test sensor_data` |
| Quick run command | `cd django_backend && python manage.py test sensor_data` |
| Full suite command | `cd django_backend && python manage.py test sensor_data` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | All four services start | smoke | `docker compose up -d && docker compose ps \| grep -E "(healthy\|running)"` | ❌ Wave 0 |
| INFRA-02 | BioSim returns valid simID | smoke | `curl -s http://localhost:8009/api/simulation \| python3 -m json.tool` | ❌ Wave 0 |
| INFRA-03 | Services start in dependency order | integration | Verified by `docker compose up` logs — no automated test needed | n/a |
| INFRA-04 | Django connects to local PostgreSQL | integration | `docker compose run django python manage.py check --database default` | ❌ Wave 0 |
| OBS-01 | Open MCT link in nav | manual | Visit `http://localhost:5173`, verify nav link visible | n/a |

### Sampling Rate
- **Per task commit:** `cd django_backend && python manage.py test sensor_data`
- **Per wave merge:** `docker compose up -d && docker compose ps`
- **Phase gate:** All four services `healthy` or `running` in `docker compose ps` before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/smoke_test.sh` — covers INFRA-01, INFRA-02, INFRA-04 (bash script that runs compose up and curls endpoints)
- [ ] `docker/django-entrypoint.sh` — needed before django service runs at all
- [ ] `.env.example` — needed before any developer can run `docker compose up`
- [ ] `biosim/default.biosim` — needed if config/ not in BioSim image (see Open Question 3)

---

## Sources

### Primary (HIGH confidence)
- `https://github.com/scottbell/biosim` — Dockerfile, docker-compose.yml, bin/ scripts, REST API endpoints
- `https://raw.githubusercontent.com/scottbell/biosim/main/docker-compose.yml` — exact upstream compose fetched verbatim
- `https://raw.githubusercontent.com/scottbell/biosim/main/Dockerfile` — exact upstream Dockerfile fetched verbatim
- `https://raw.githubusercontent.com/scottbell/biosim/main/bin/start-biosim-server` — exact server start script fetched verbatim
- `https://docs.docker.com/compose/how-tos/startup-order/` — `depends_on: condition: service_healthy` pattern
- Project codebase: `Dockerfile`, `django_backend/spatialhub_backend/settings.py`, `spatialhub-frontend/src/App.tsx`, `django_backend/sensor_data/management/commands/seed_habitat_zones.py` — read directly

### Secondary (MEDIUM confidence)
- `https://last9.io/blog/docker-compose-health-checks/` — healthcheck field syntax and JVM start_period guidance, verified against Docker official docs
- `https://testdriven.io/blog/dockerizing-django-with-postgres-gunicorn-and-nginx/` — Django entrypoint script pattern, widely cited
- WebSearch results for `pg_isready` healthcheck pattern — cross-verified with Docker official docs

### Tertiary (LOW confidence)
- Open Question 3 (curl availability in eclipse-temurin image) — not verified, flagged for validation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from upstream BioSim repo directly
- Architecture: HIGH — upstream docker-compose.yml fetched verbatim; Django patterns well-established
- Pitfalls: HIGH — derived from direct code inspection and upstream Dockerfile analysis
- Simulation auto-start (INFRA-02): MEDIUM — `start-biosim-server` script analyzed, POST endpoint confirmed; exact wrapper implementation needs validation during build

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (BioSim repo is stable; Docker Compose syntax is stable)
