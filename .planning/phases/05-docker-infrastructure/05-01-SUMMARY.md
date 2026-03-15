---
phase: 05-docker-infrastructure
plan: 01
subsystem: infrastructure
tags: [docker, compose, biosim, postgresql, django, openmct]
dependency_graph:
  requires: []
  provides: [docker-compose-stack, biosim-dockerfile, django-entrypoint, smoke-test]
  affects: [phase-06-biosim-mapping, phase-07-websocket-bridge]
tech_stack:
  added: [docker-compose-v2, eclipse-temurin-21-jre, postgres-16, gunicorn]
  patterns: [multi-stage-dockerfile, healthcheck-dependency-ordering, auto-start-via-command-override]
key_files:
  created:
    - docker-compose.yml
    - biosim.Dockerfile
    - .env.example
    - .gitignore
    - django_backend/docker/django-entrypoint.sh
    - tests/smoke_test.sh
    - tests/fixtures/biosim_module_state.json
  modified: []
decisions:
  - Multi-stage Dockerfile uses eclipse-temurin:21-jdk for Maven build stage, eclipse-temurin:21-jre for runtime (saves ~180MB)
  - BioSim simulation auto-start implemented via command override (background server + poll-until-ready + POST /api/simulation/start) rather than a separate init container
  - Django entrypoint placed in django_backend/docker/ so existing root Dockerfile COPY instruction picks it up without modification
  - biosim_module_state.json committed as placeholder; must be repopulated from live BioSim instance when Docker daemon is available
metrics:
  duration: "161 seconds"
  completed_date: "2026-03-15"
  tasks_completed: 3
  tasks_total: 3
  files_created: 7
  files_modified: 0
---

# Phase 05 Plan 01: Docker Infrastructure Stack Summary

**One-liner:** Four-service docker-compose stack with multi-stage BioSim Dockerfile (Maven build + JRE runtime), PostgreSQL persistence, Django auto-migrate/seed entrypoint, and smoke test that captures live BioSim module state as a Phase 6 fixture.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Multi-stage biosim.Dockerfile, docker-compose.yml, env config | `1ecc060` | biosim.Dockerfile, docker-compose.yml, .env.example, .gitignore |
| 2 | Django entrypoint script and .env setup | `bcfd2fa` | django_backend/docker/django-entrypoint.sh |
| 3 | Smoke test script and BioSim module state fixture | `6eb544a` | tests/smoke_test.sh, tests/fixtures/biosim_module_state.json |

## What Was Built

### docker-compose.yml
Four-service orchestration with strict dependency ordering:
- `db` (postgres:16): pg_isready healthcheck, 30s start_period, named pgdata volume
- `biosim`: multi-stage Dockerfile build, command override auto-starts simulation via `POST /api/simulation/start`, 90s start_period healthcheck for JVM
- `openmct`: builds from upstream git context `scottbell/openmct-biosim`
- `django`: waits for `db:service_healthy`, runs entrypoint script, env_file loaded from .env

### biosim.Dockerfile
Two-stage build:
1. `eclipse-temurin:21-jdk AS build` — installs Maven, clones `scottbell/biosim`, runs `mvn package -DskipTests`
2. `eclipse-temurin:21-jre AS runtime` — copies bin/, lib/, target/, configuration/, etc/ from build stage; installs curl for healthchecks; saves ~180MB vs JDK

### django_backend/docker/django-entrypoint.sh
Shell entrypoint (`#!/bin/sh`, `set -e`) that runs:
1. `python manage.py migrate --noinput`
2. `python manage.py seed_habitat_zones` (idempotent via update_or_create)
3. `exec gunicorn spatialhub_backend.wsgi:application --bind 0.0.0.0:8000`

Path resolves inside container because root Dockerfile does `COPY django_backend/ .`, placing `django_backend/docker/` at `/app/docker/`.

### tests/smoke_test.sh
Five-step validation:
1. Confirms 4 Docker services running via `docker compose ps`
2. Hits `GET /api/simulation` on BioSim
3. Extracts simID from running simulation list
4. `GET /api/simulation/{simID}` piped through `python3 -m json.tool` to fixture file
5. Hits `GET /api/habitat/zones/` on Django

### tests/fixtures/biosim_module_state.json
Placeholder committed (Docker daemon unavailable during execution). Contains population instructions and expected JSON structure. Must be replaced with live capture before Phase 6 mapping work begins.

## Deviations from Plan

### Docker Daemon Unavailable

**Found during:** Task 3

**Issue:** Docker CLI present at /usr/local/bin/docker but daemon not running. Cannot execute `docker compose up --build -d` or run smoke_test.sh to capture live BioSim module state.

**Fix:** Created placeholder `tests/fixtures/biosim_module_state.json` with population instructions per the plan's explicit fallback: "If the Docker stack cannot be built, create a placeholder fixture with a comment explaining it needs to be populated from a live BioSim instance."

**Action required:** When Docker daemon is running, execute:
```bash
docker compose up --build -d
# Wait for biosim service healthy (2-3 min first run)
./tests/smoke_test.sh
git add tests/fixtures/biosim_module_state.json
git commit -m "chore(05-01): capture live BioSim module state fixture"
```

**Files modified:** tests/fixtures/biosim_module_state.json

**Commit:** `6eb544a`

## Verification Results

- `docker compose config --quiet`: VALID (no syntax errors)
- `docker compose config | grep DB_HOST`: returns `DB_HOST: db` (env_file loading confirmed)
- biosim.Dockerfile contains `FROM eclipse-temurin:21-jdk AS build` and `FROM eclipse-temurin:21-jre AS runtime`
- All seven artifact files created and committed

## Self-Check: PASSED

Files confirmed created:
- /Users/nicolasdemari/dev/SpatialHub-JobDemoClone/docker-compose.yml — FOUND
- /Users/nicolasdemari/dev/SpatialHub-JobDemoClone/biosim.Dockerfile — FOUND
- /Users/nicolasdemari/dev/SpatialHub-JobDemoClone/.env.example — FOUND
- /Users/nicolasdemari/dev/SpatialHub-JobDemoClone/.gitignore — FOUND
- /Users/nicolasdemari/dev/SpatialHub-JobDemoClone/django_backend/docker/django-entrypoint.sh — FOUND
- /Users/nicolasdemari/dev/SpatialHub-JobDemoClone/tests/smoke_test.sh — FOUND
- /Users/nicolasdemari/dev/SpatialHub-JobDemoClone/tests/fixtures/biosim_module_state.json — FOUND

Commits confirmed:
- 1ecc060 — feat(05-01): add multi-stage biosim.Dockerfile and four-service docker-compose.yml
- bcfd2fa — feat(05-01): add Django Docker entrypoint script
- 6eb544a — feat(05-01): add Docker stack smoke test and BioSim module state fixture
