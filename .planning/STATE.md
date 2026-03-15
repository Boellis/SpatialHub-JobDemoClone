---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: BioSim Integration
status: planning
stopped_at: Completed 05-docker-infrastructure-05-03-PLAN.md (all plans complete)
last_updated: "2026-03-15"
last_activity: 2026-03-15 — Phase 5 all plans executed, live BioSim fixture captured
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** 3D habitat visualization with live sensor data that feels real, responsive, and impressive enough to make someone say "this could actually run a Mars greenhouse."
**Current focus:** v2.0 BioSim Integration — Phase 5: Docker Infrastructure

## Current Position

Milestone: v2.0 BioSim Integration
Phase: 5 of 9 (Docker Infrastructure)
Plan: 3/3 complete
Status: All plans executed, pending verification
Last activity: 2026-03-15 — Phase 5 all plans executed, live BioSim fixture captured

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table.

Key v2.0 architectural decisions (pending confirmation):
- Phase 5: BioSim via Docker + REST/WebSocket (GPL v3 boundary — no source file linking)
- Phase 5: Full docker-compose (Django + BioSim + Open MCT + PostgreSQL) — one command
- Phase 7/9: Both WS paths (direct frontend WS for live + Django ingest for history)
- [Phase 05-docker-infrastructure]: Used plain <a> tag not NavLink for Open MCT link — React Router NavLink cannot handle external URLs
- [Phase 05-docker-infrastructure]: Open MCT nav link styled with --accent-cyan to distinguish from green Mars Habitat and white internal links
- [Phase 05-docker-infrastructure]: Multi-stage Dockerfile: eclipse-temurin:21-jdk for Maven build, JRE-only runtime (saves ~180MB)
- [Phase 05-docker-infrastructure]: BioSim simulation auto-start via command override (background server + poll-until-ready + POST to /api/simulation/start)
- [Phase 05-docker-infrastructure]: Django entrypoint placed in django_backend/docker/ to avoid modifying root Dockerfile (production asset)

### Pending Todos

None.

### Blockers/Concerns

- Phase 5: BioSim Maven Docker build may take 10-20 minutes on cold cache — set expectations before first `docker compose up`
- Phase 5/6: BioSim module name strings in docs are examples — live `GET /api/simulation/{simID}` JSON must be captured before any mapping code is written
- Phase 5: `settings.py` currently uses Cloud SQL credentials — env-var fallback (DB_HOST, DB_NAME, DB_USER, DB_PASS) must be wired before bridge can write to local database

## Session Continuity

Last session: 2026-03-15T04:14:19.355Z
Stopped at: Completed 05-docker-infrastructure-05-01-PLAN.md
Resume file: None
