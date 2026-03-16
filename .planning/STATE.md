---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: BioSim Integration
status: completed
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-03-16T05:45:07.662Z"
last_activity: 2026-03-16 — biosimMapper.ts implemented via TDD, 20 fixture-pinned tests passing
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 7
  completed_plans: 7
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** 3D habitat visualization with live sensor data that feels real, responsive, and impressive enough to make someone say "this could actually run a Mars greenhouse."
**Current focus:** v2.0 BioSim Integration — Phase 6: Data Mapping Layer

## Current Position

Milestone: v2.0 BioSim Integration
Phase: 6 of 9 (Data Mapping Layer)
Plan: 1/2 complete
Status: Plan 1 complete, ready for Plan 2
Last activity: 2026-03-16 — biosimMapper.ts implemented via TDD, 20 fixture-pinned tests passing

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
- [Phase 06-01-data-mapping]: BIOSIM_SENSOR_THRESHOLDS separate from ZONE_CONFIGS — BioSim operates at different ranges (e.g., gb-humidity green 15-35% vs client-sim 45-65%)
- [Phase 06-01-data-mapping]: deriveBioSimStatus unexported — keeps BioSim threshold logic contained in biosimMapper.ts
- [Phase 06-01-data-mapping]: mapBioSimToHabitatReadings existingHistory parameter optional — mapper stays pure, Phase 7 hook manages state continuity
- [Phase 06-data-mapping-layer]: device_addr set to zone ID string for natural /trends?device_addr= queries in Phase 9
- [Phase 06-data-mapping-layer]: biosim_tick_to_rows is a pure function with no DB calls — caller (Phase 9 bridge) owns bulk_create
- [Phase 07]: Worker logic tested via inline re-implementation mirroring biosimWorker.ts — @vitest/web-worker incompatible with Vite module Worker import paths in jsdom
- [Phase 07]: probeBioSim, wsUrl, RETRY_DELAYS exported from useSimSource.ts — enables pure-function unit testing of state machine inputs without hook infrastructure
- [Phase 07-frontend-websocket-fallback]: ConnectionBadge uses Record<SimSource, BadgeConfig> map (not switch/if) — adding a 5th state requires one map entry only
- [Phase 07-frontend-websocket-fallback]: BioSim probe response is wrapped { simulations: [1] } not a bare array — probe updated to handle both shapes

### Pending Todos

None.

### Blockers/Concerns

- Phase 5: BioSim Maven Docker build may take 10-20 minutes on cold cache — set expectations before first `docker compose up`
- Phase 5/6: BioSim module name strings in docs are examples — live `GET /api/simulation/{simID}` JSON must be captured before any mapping code is written
- Phase 5: `settings.py` currently uses Cloud SQL credentials — env-var fallback (DB_HOST, DB_NAME, DB_USER, DB_PASS) must be wired before bridge can write to local database

## Session Continuity

Last session: 2026-03-16T05:45:07.651Z
Stopped at: Completed 07-02-PLAN.md
Resume file: None
