# Stack Research

**Domain:** BioSim Integration — WebSocket pipelines, Docker infrastructure, Django async bridge
**Researched:** 2026-03-14
**Confidence:** HIGH (all critical version claims verified against PyPI, npm, and official docs)

> This document covers ONLY net-new stack additions for the v2.0 BioSim Integration milestone.
> Existing validated stack (React 19, Vite, TypeScript, R3F fiber@9.5/drei@10.7/three@0.183,
> Zustand v5, Django 5.2, DRF, PostgreSQL) is unchanged and not re-researched here.

---

## Recommended Stack

### Core Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Docker Compose v2 | >=2.0 (bundled with Docker Desktop) | Orchestrate BioSim + Open MCT + Django + PostgreSQL as single `docker compose up` | BioSim repo ships its own docker-compose.yml with exactly 2 services (biosim-server + openmct-biosim). We add Django and PostgreSQL services to it. v2 syntax (`docker compose` not `docker-compose`) is the current standard. |
| BioSim (scottbell/biosim) | HEAD/main | NASA life support physics engine; provides REST API + WebSocket on port 8009 | GPL v3 copyleft — the REST/WebSocket network boundary avoids code-linking concerns. No pre-built Docker image; builds from source via Maven. Confirmed docker-compose.yml in upstream repo. |
| Open MCT | via openmct-biosim build | NASA mission control dashboard, free alongside BioSim | Already in BioSim's docker-compose as `openmct-biosim` service building from upstream GitHub, exposed on port 9091. Zero additional configuration — just keep the service definition. |
| eclipse-temurin | 21-jdk-jammy | JDK 21 base image for BioSim Maven build | Official `openjdk` Docker image is deprecated (Docker Hub). Eclipse Temurin is the community-endorsed replacement for JDK containers. BioSim requires JDK 21+. Use `eclipse-temurin:21-jdk-jammy` in any custom Dockerfile wrapping BioSim. |
| PostgreSQL | 15-alpine | Local dev database in docker-compose | Already in use on Cloud SQL. Pin to `postgres:15-alpine` in the compose file for fast local iteration. Cloud SQL remains the production database — no infra changes. |

### Django Backend Additions

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `websockets` | 16.0 | Async WebSocket client in the Django bridge management command | Latest (released January 2026, verified on PyPI). Requires Python >=3.10; project uses 3.11. Official docs show the exact Django integration pattern: call `django.setup()`, run an asyncio event loop, wrap all ORM writes with `asyncio.to_thread()` because Django 5.2 ORM is still synchronous-only. Simpler and more correct than using Django Channels as a WS _client_. |
| `daphne` | 4.2.1 | ASGI server replacing Gunicorn in the docker-compose Django service | Latest (July 2025, verified on PyPI). Required because Gunicorn is a WSGI server — it cannot handle WebSocket upgrades. Even if Django only serves HTTP in v2.0, switching to Daphne now means no server-swap pain when a Django WS proxy endpoint is added later. Daphne is the official Django Channels HTTP/WebSocket server. |
| `channels` | 4.3.2 | Django ASGI layer | Latest (November 2025, verified on PyPI). Supports Django 4.2–6.0 (project uses 5.2 — confirmed compatible), Python >=3.9. Only strictly needed if Django exposes its own WebSocket endpoint to the browser. The v2.0 architecture has the frontend connecting directly to BioSim's WebSocket — add `channels` when a Django proxy endpoint becomes necessary. Include it in requirements now to unblock future phases. |

### Frontend Additions

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Native browser `WebSocket` API | Browser built-in | Connect to BioSim WebSocket at `ws://localhost:8009/ws/simulation/{simID}` | **No npm package needed.** `react-use-websocket` v4.0.0 — the obvious candidate — explicitly does NOT support React 19. Confirmed by maintainer in GitHub issue #256 (December 2024). Installing it requires `--legacy-peer-deps` which is a fragile hack that breaks on clean installs. A custom `useBioSimWebSocket` hook wrapping the native WebSocket API is 40–60 lines, zero dependencies, and gives full control over the fallback detection logic this project needs. |

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `aiohttp` | Already in repo (`simulate_devices.py`) | Async HTTP for one-off REST calls to BioSim (start simulation, inject malfunctions) | Use for `POST /api/simulation/start` and `POST /api/simulation/{simID}/modules/{name}/malfunctions` from the Django management command. Already installed — no new dependency. |
| `channels-redis` | 4.x | Redis-backed channel layer for Django Channels group messaging | Do NOT add in v2.0. Only relevant if multiple Django consumers need to broadcast to each other. Adding it now means adding Redis as a Docker service with zero current benefit. |

---

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vite dev server proxy (`server.proxy`) | Forward `ws://localhost:PORT/ws/biosim/*` to BioSim container during frontend dev | Add `server.proxy` entry in `vite.config.ts` with `ws: true`. This avoids browser CORS issues when the frontend (on Vite's port 5173) connects to BioSim (port 8009). In production/docker-compose, the frontend connects directly to `ws://localhost:8009`. |
| `docker compose watch` | Auto-rebuild Django service on file change in docker-compose | Available in Docker Compose v2.22+. Avoids the need for volume mounts plus manual restarts during Django development inside Docker. |

---

## Installation

```bash
# Django backend — add to django_backend/requirements.txt
websockets>=16.0
daphne>=4.2.1
channels>=4.3.2

# Frontend — NO new npm packages
# Write a custom useBioSimWebSocket hook using the native WebSocket API
# No npm install needed

# Docker — no pip install needed; Docker handles all Java/Maven dependencies
# BioSim builds from source inside its own container
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Native WebSocket + custom hook | `react-use-websocket` v4 | Only if project downgrades to React 18 or lower. The library explicitly targets React 18 and is confirmed incompatible with React 19 (maintainer, Dec 2024). |
| `websockets` management command | Celery + Redis | Only when you need distributed task queues, retry policies, fan-out, or horizontal worker scaling across machines. For a single long-running async WS bridge, Celery + broker is 5x the infrastructure for zero benefit. Community consensus in 2025: management command is the right call for simple polling loops. |
| `websockets` management command | Django Channels `WebsocketConsumer` | Use Channels consumers when Django is _serving_ WebSocket connections to clients. Here Django is a WS _client_ connecting to BioSim — Channels adds the wrong abstraction layer. The `websockets` library is the correct client-side primitive. |
| `daphne` | `uvicorn` | Use uvicorn if you need HTTP/2 support or if you are not using Django Channels at all. Daphne is the official Channels-compatible ASGI server and the simpler choice when Channels is already in the stack. |
| `eclipse-temurin:21-jdk-jammy` | `openjdk:21` | The official `openjdk` image is deprecated on Docker Hub. Temurin is Eclipse Foundation's replacement. Do not use `openjdk` for new Dockerfiles. |
| BioSim via Docker compose | BioSim running natively on host | Viable for development on machines with JDK 21. Docker isolates the Java dependency from the Python/Node environment, prevents port conflicts, matches the target architecture, and lets reviewers run the full stack with one command. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-use-websocket` | Does not support React 19 (confirmed by maintainer in GitHub issue #256, December 2024). Using `--legacy-peer-deps` to force-install it breaks on clean `npm install` — exactly what a portfolio reviewer will run. | Native browser `WebSocket` API with a custom `useBioSimWebSocket` hook |
| `Celery` + Redis broker | Complete overkill for one long-running async task. Adds 2 new Docker services (Celery worker + Redis), complex configuration, and operational surface area with zero benefit. | Async `management command` (`python manage.py run_biosim_bridge`) using asyncio event loop |
| `channels-redis` | Premature addition. The v2.0 bridge is a standalone async management command, not a Channels consumer group. Adding Redis as a Docker service for future-proofing only creates a service that starts and does nothing. | Add only when multi-consumer broadcasting via Channels is actually implemented |
| `SockJS` | Designed for servers that do not support standard WebSockets. BioSim serves a compliant RFC 6455 WebSocket. SockJS overhead and server-side protocol negotiation are unnecessary. | Native `WebSocket` API |
| `gunicorn` (as ASGI server) | Gunicorn is a WSGI server. It cannot handle WebSocket connection upgrades. If kept in the Docker service CMD, any future Django WS endpoint will silently fail with a 400. | `daphne` with `asgi.py` application entrypoint |
| `aiohttp` as WS client | `aiohttp` has a WebSocket client but it is less idiomatic and less documented than the `websockets` library for pure WebSocket client use. Keep `aiohttp` for the async HTTP calls it already handles. | `websockets` for the bridge WS client |
| `socket.io` | Requires a Socket.IO server. BioSim runs a standard WebSocket server. Socket.IO's protocol is not compatible with a plain WS server. | Native `WebSocket` API |

---

## Stack Patterns by Variant

**Frontend connects DIRECTLY to BioSim WebSocket (recommended for v2.0):**
- No Django WS proxy needed
- `channels` package in requirements but not wired up yet
- Vite dev proxy forwards `/ws/biosim/*` → `ws://localhost:8009` to avoid browser CORS during dev
- In production/docker, browser connects to `ws://localhost:8009/ws/simulation/{simID}` directly
- Django bridge management command runs independently in a separate process for data ingestion

**Frontend connects to a DJANGO WebSocket proxy (deferred to v3.0+ if needed):**
- Add `channels>=4.3.2` wiring: `routing.py`, updated `asgi.py`
- Django `AsyncWebsocketConsumer` proxies BioSim WS to browser
- Run `daphne` instead of `gunicorn` (already switched in v2.0)
- Benefit: centralised auth, single origin for frontend WS connections

**BioSim is unavailable (fallback mode):**
- `useBioSimWebSocket` hook attempts connection, catches `onerror` / `onclose` within a configurable timeout (3 seconds recommended)
- Sets `biosimAvailable: false` in Zustand store
- Existing `simulation/engine.ts` resumes as the data source
- No additional library — this is application logic, not a new dependency

---

## Docker Compose Service Layout

The BioSim upstream `docker-compose.yml` (verified via GitHub) defines:
- `biosim-server`: builds from current directory (the biosim repo), maps port 8009:8009, mounts `./logs`
- `openmct-biosim`: builds from the upstream openmct-biosim GitHub repo, maps port 9091:80

Our extended `docker-compose.yml` adds:

```yaml
# Extends biosim's two services with django + postgres
services:
  biosim:
    build:
      context: ./biosim   # git submodule or cloned directory
    ports: ["8009:8009"]
    volumes:
      - ./logs:/app/logs
    command: ["--writeTicks"]  # enables /api/simulation/{simID}/log endpoint

  openmct:
    build:
      context: https://github.com/scottbell/openmct-biosim.git
    ports: ["9091:80"]
    depends_on: [biosim]

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: spatialhub_db
      POSTGRES_USER: spatialhub
      POSTGRES_PASSWORD: localpassword
    ports: ["5432:5432"]

  django:
    build: .
    # Switch from gunicorn to daphne for ASGI support
    command: daphne -b 0.0.0.0 -p 8080 spatialhub_backend.asgi:application
    ports: ["8080:8080"]
    depends_on: [db, biosim]
    environment:
      USE_SQLITE: "0"
      DB_HOST: db
      DB_NAME: spatialhub_db
      DB_USER: spatialhub
      DB_PASS: localpassword
      BIOSIM_WS_URL: "ws://biosim:8009"   # service-name DNS inside Docker network
```

**Docker networking:** All services share the default bridge network. Inside the network, Django reaches BioSim at `ws://biosim:8009` (service name). The browser (outside Docker) reaches BioSim at `ws://localhost:8009` (host-mapped port). The Vite dev proxy bridges the CORS gap during frontend development.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `channels` 4.3.2 | Django 4.2, 5.1, 5.2, 6.0 | Project uses Django 5.2 — fully supported. Verified on PyPI. |
| `channels` 4.3.2 | Python >=3.9 | Project uses Python 3.11 — no issue. |
| `daphne` 4.2.1 | Python >=3.9, Django Channels 4.x | Pair with `channels`. Replace `gunicorn` in the service CMD — do not run both. |
| `websockets` 16.0 | Python >=3.10 | Project uses Python 3.11 — fine. All Django ORM calls in the bridge MUST use `asyncio.to_thread()`. Django 5.2 ORM does not support native async I/O. |
| `eclipse-temurin:21-jdk-jammy` | BioSim Maven build, JDK 21+ | Replaces deprecated `openjdk` Docker image. |
| Django 5.2 async ORM | Partial async | `QuerySet` evaluation and `.save()` are synchronous. Wrap all DB writes in `asyncio.to_thread(lambda: obj.save())` inside the async bridge. |
| Native `WebSocket` API | React 19, all modern browsers | No React peer dependency at all. Works in any browser with WebSocket support (97%+ of current browsers). |

---

## Sources

- [PyPI channels 4.3.2](https://pypi.org/project/channels/) — version, Django/Python compatibility (HIGH confidence)
- [PyPI daphne 4.2.1](https://pypi.org/project/daphne/) — version, Python compatibility (HIGH confidence)
- [PyPI websockets 16.0](https://pypi.org/project/websockets/) — version, Python requirements (HIGH confidence)
- [Django Channels deploying docs](https://channels.readthedocs.io/en/latest/deploying.html) — Daphne as the recommended ASGI server for Channels projects (HIGH confidence)
- [websockets Django integration guide](https://websockets.readthedocs.io/en/stable/howto/django.html) — `asyncio.to_thread()` for ORM, `django.setup()` pattern, management command approach (HIGH confidence)
- [scottbell/biosim docker-compose.yml](https://raw.githubusercontent.com/scottbell/biosim/main/docker-compose.yml) — confirmed service names, ports (8009, 9091), build directives, no pre-built image (HIGH confidence)
- [Docker Hub eclipse-temurin](https://hub.docker.com/_/eclipse-temurin/) — confirmed replacement for deprecated `openjdk` Docker image (HIGH confidence)
- [GitHub robtaussig/react-use-websocket issue #256](https://github.com/robtaussig/react-use-websocket/issues/256) — maintainer confirmed React 19 is NOT supported (HIGH confidence)
- [Docker Compose networking docs](https://docs.docker.com/compose/how-tos/networking/) — service-name DNS resolution on shared bridge network (HIGH confidence)
- WebSearch: Celery vs management command for simple polling — community consensus in 2025 favors management command for single-task use cases (MEDIUM confidence — multiple sources agree)

---
*Stack research for: BioSim Integration (v2.0 milestone)*
*Researched: 2026-03-14*
