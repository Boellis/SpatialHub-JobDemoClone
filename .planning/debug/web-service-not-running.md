---
status: investigating
trigger: "docker compose exec web python manage.py biosim_import_log fails with service 'web' is not running"
created: 2026-03-16T00:00:00Z
updated: 2026-03-16T00:00:00Z
---

## Current Focus

hypothesis: The user is running `docker compose exec web ...` but the service is named `django` in docker-compose.yml, not `web`
test: Compare user's command against docker-compose.yml service names
expecting: Service name mismatch explains the error perfectly
next_action: Verify no `web` service exists; confirm `django` is the correct name

## Symptoms

expected: `docker compose exec web python manage.py biosim_import_log` should exec into the Django container
actual: Error "service 'web' is not running"
errors: "service 'web' is not running"
reproduction: Run `docker compose exec web ...`
started: From the beginning of this docker-compose setup

## Eliminated

- hypothesis: aiohttp missing from Docker image causes crash
  evidence: aiohttp IS listed in django_backend/requirements.txt (line 11) which is installed by the Dockerfile. Both django and bridge use the same image built from the same Dockerfile + requirements.txt, so aiohttp is present.
  timestamp: 2026-03-16

- hypothesis: Health check failing causes web service to stop
  evidence: The `django` service has NO health check defined in docker-compose.yml. It only has `depends_on: db: condition: service_healthy`. No health check = container stays "running" as long as process lives.
  timestamp: 2026-03-16

- hypothesis: Missing entrypoint script causes crash
  evidence: The entrypoint exists at `django_backend/docker/django-entrypoint.sh`. Since Dockerfile does `COPY django_backend/ .`, the entrypoint will be at `/app/docker/django-entrypoint.sh` inside the container, and docker-compose.yml references `./docker/django-entrypoint.sh` which resolves correctly from WORKDIR /app.
  timestamp: 2026-03-16

## Evidence

- timestamp: 2026-03-16
  checked: docker-compose.yml service definitions
  found: Services defined are `db`, `biosim`, `openmct`, `django`, `bridge`. There is NO service named `web`.
  implication: The command `docker compose exec web ...` will always fail because there is no service called `web`.

- timestamp: 2026-03-16
  checked: docker-compose.yml django service definition (lines 69-77)
  found: Service name is `django`, ports 8000:8000, uses entrypoint `./docker/django-entrypoint.sh`, depends on db healthy
  implication: The correct command is `docker compose exec django python manage.py biosim_import_log`

- timestamp: 2026-03-16
  checked: Dockerfile + requirements.txt
  found: Dockerfile builds from python:3.11-slim, copies django_backend/ to /app, installs requirements.txt which includes aiohttp>=3.9
  implication: All dependencies are present in the image used by both `django` and `bridge` services

- timestamp: 2026-03-16
  checked: django-entrypoint.sh
  found: Script runs migrate, seed_habitat_zones, then exec gunicorn on port 8000. No obvious crash vectors.
  implication: Django service should stay running after entrypoint completes successfully

- timestamp: 2026-03-16
  checked: Port 8000 serving responses
  found: User reports http://localhost:8000/api/enriched/ returns empty array
  implication: The `django` service IS running and serving requests -- further confirms the service exists but under the name `django`, not `web`

## Resolution

root_cause: Service name mismatch. The docker-compose.yml defines the Django API service as `django` (line 69), but the user is running `docker compose exec web ...`. Docker Compose correctly reports "service 'web' is not running" because no service with that name exists at all.
fix: Change the command from `docker compose exec web ...` to `docker compose exec django ...`
verification: N/A (research only)
files_changed: []
