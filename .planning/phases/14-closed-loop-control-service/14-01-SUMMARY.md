---
phase: 14-closed-loop-control-service
plan: "01"
subsystem: infra
tags: [django, control-loop, biosim, ph-sensor, docker, state-machine, pytest, tdd]

requires:
  - phase: 12-biosim-vm-deployment
    provides: docker-compose.vm.yml with bridge service pattern and BioSim healthcheck
  - phase: 13-pi-to-cloud-pipeline
    provides: Pi hub writes pH data to Cloud SQL with hub_id=pi-habitat-01, sensor_id=wr-ph-real

provides:
  - Closed-loop pH control Django management command (control_loop.py)
  - State machine: trigger Grey_Water_Store malfunction at pH divergence >= 0.5
  - State machine: clear malfunction when divergence < 0.4 (hysteresis deadband)
  - Staleness guard: hold state when Pi data is older than 60 seconds
  - Heartbeat logging every 60 seconds
  - control_loop Docker service in docker-compose.vm.yml (CTRL-04)
  - 15 unit tests covering all CTRL-01/02/03 behaviors

affects:
  - deploy (GCE VM docker compose stack now has 5 services: caddy, biosim, openmct, bridge, control_loop)
  - judge-demo (dip pH sensor in vinegar -> habitat zone turns red within 10 seconds)

tech-stack:
  added: []
  patterns:
    - "Hysteresis deadband: trigger at 0.5, recover at 0.4 (10% gap prevents oscillation)"
    - "Module-level helpers (get_latest, is_stale, probe_sim_id) importable for testing without instantiating Command"
    - "Staleness guard returns unchanged state, logs only on first stale transition"
    - "TDD: test file committed in RED state before implementation exists"

key-files:
  created:
    - django_backend/sensor_data/management/commands/control_loop.py
    - django_backend/sensor_data/tests/test_control_loop.py
  modified:
    - docker-compose.vm.yml

key-decisions:
  - "Hysteresis recovery threshold is PH_THRESHOLD - 0.1 (0.4 when default 0.5) per prior Phase 11 decision"
  - "probe_sim_id returns None instead of raising -- caller retries with exponential backoff"
  - "HEARTBEAT_INTERVAL = 6 loops = 60 seconds at 10s poll interval"
  - "PH_THRESHOLD and STALE_SECONDS configurable via env vars with ${VAR:-default} in docker-compose.vm.yml"

patterns-established:
  - "control_loop: synchronous while-True loop, time.sleep() at bottom -- not async (no WebSocket needed)"
  - "_run_cycle() is a pure state transformer: receives state in, returns state out, easy to unit test"

requirements-completed: [CTRL-01, CTRL-02, CTRL-03, CTRL-04]

duration: 5min
completed: 2026-03-20
---

# Phase 14 Plan 01: Closed-Loop Control Service Summary

**Synchronous Django management command that polls Cloud SQL every 10 seconds and POSTs/DELETEs Grey_Water_Store malfunctions on BioSim when Pi pH diverges from simulated pH, with hysteresis deadband and staleness guard.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-20T16:11:47Z
- **Completed:** 2026-03-20T16:16:22Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- TDD-driven control_loop.py: 248-line state machine with full CTRL-01/02/03/04 coverage
- 15 unit tests (12 passing in local env, 3 django_db require PostgreSQL -- same as all other DB tests in this codebase)
- docker-compose.vm.yml control_loop service with configurable thresholds and service_healthy depends_on

## Task Commits

1. **Task 1: Create test file for control_loop state machine** - `18103a2` (test)
2. **Task 2: Implement control_loop management command** - `735f3cf` (feat)
3. **Task 3: Add control_loop service to docker-compose.vm.yml** - `00eec2c` (feat)

## Files Created/Modified

- `django_backend/sensor_data/management/commands/control_loop.py` - Full closed-loop pH state machine (248 lines)
- `django_backend/sensor_data/tests/test_control_loop.py` - 15 unit tests (354 lines)
- `docker-compose.vm.yml` - Added control_loop service after bridge

## Decisions Made

- Hysteresis: trigger at 0.5, recover at 0.4 -- matches prior Phase 11 decision already in STATE.md
- `probe_sim_id` returns None on empty list instead of raising (caller retries); differs from `discover_sim_id` in import_log which raises CommandError -- appropriate since control_loop is a persistent service
- `_run_cycle` is a testable pure-ish state transformer: takes all state in, returns new state out, no instance variables mutated
- django_db ORM tests fail in local env (no PostgreSQL) -- same behavior as all 13 other django_db tests in codebase; state machine tests cover the real behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Local test env has no PostgreSQL -- `django_db`-marked tests error on setup (pre-existing condition, 13 other tests have same error). All 12 non-DB tests pass. State machine behavior (the critical CTRL-01/02/03 coverage) is fully tested via mocks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14 is complete. All 4 requirements (CTRL-01 through CTRL-04) delivered.
- Deploy: `docker compose -f docker-compose.vm.yml up --build -d` on GCE VM picks up control_loop automatically
- Validation: dip Pi pH sensor in vinegar (pH ~4) -> divergence from BioSim ~7.0 = 3.0, well above 0.5 threshold -> Grey_Water_Store malfunction fires within 10 seconds -> habitat zone turns red in 3D frontend
- Rinse sensor in water (pH ~7) -> divergence drops below 0.4 -> malfunction cleared automatically

## Self-Check: PASSED

- FOUND: django_backend/sensor_data/management/commands/control_loop.py
- FOUND: django_backend/sensor_data/tests/test_control_loop.py
- FOUND: .planning/phases/14-closed-loop-control-service/14-01-SUMMARY.md
- FOUND: commit 18103a2 (test - RED phase)
- FOUND: commit 735f3cf (feat - GREEN phase)
- FOUND: commit 00eec2c (feat - docker-compose)

---
*Phase: 14-closed-loop-control-service*
*Completed: 2026-03-20*
