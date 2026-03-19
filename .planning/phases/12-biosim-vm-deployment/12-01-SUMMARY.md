---
phase: 12-biosim-vm-deployment
plan: "01"
subsystem: infra
tags: [gce, docker-compose, biosim, openmct, bridge, firebase, vite, vitest]

requires:
  - phase: 11-cloud-services-deployment
    provides: Cloud SQL IP (34.30.238.232), Cloud Run URL, Firebase project (nasa-comp-demo)

provides:
  - docker-compose.vm.yml with biosim + openmct + bridge (no db/django) connecting to Cloud SQL via env vars
  - App.tsx Open MCT nav link backed by VITE_OPENMCT_URL env var (localhost:9091 fallback)
  - App.test.tsx regression coverage for VITE_OPENMCT_URL behavior (2 tests)
  - deploy.sh extended with VM provisioning (static IP, firewall, GCE VM, Docker, systemd) and frontend rebuild with VM URLs

affects: [13-biosim-vm-deploy-verify, 14-physical-sensor-integration]

tech-stack:
  added: []
  patterns:
    - "VM-only Docker Compose derived from local compose: strip db/django, add explicit env vars for bridge"
    - "VITE_* env var ?? fallback pattern for URL injection at build time"
    - "TDD RED before GREEN: write test against current hardcoded value, confirm fail, then fix production code"
    - "Idempotent deploy sections: check-before-create for all GCP resources"

key-files:
  created:
    - docker-compose.vm.yml
    - spatialhub-frontend/src/__tests__/App.test.tsx
  modified:
    - spatialhub-frontend/src/App.tsx
    - deploy/deploy.sh

key-decisions:
  - "bridge service in VM compose uses explicit environment: block instead of env_file so each var is traceable; BIOSIM_URL=http://biosim:8009 uses Docker network name"
  - "USE_SQLITE=0 hardcoded in VM compose to force PostgreSQL mode (no accidental SQLite fallback on VM)"
  - "deploy.sh REPO_URL hardcoded as GitHub HTTPS URL for VM git clone"
  - "BioSim readiness poll: 40 attempts x 3s = 120s max before hard exit 1"
  - "Frontend rebuild (Section 15) happens AFTER BioSim readiness confirmed so VITE_OPENMCT_URL bakes the correct live VM IP"

requirements-completed: [DEPLOY-03]

duration: 3min
completed: "2026-03-19"
---

# Phase 12 Plan 01: BioSim VM Deployment Artifacts Summary

**VM Docker Compose, App.tsx VITE_OPENMCT_URL fix, and full GCE deploy script covering static IP through Firebase rebuild with vitest regression coverage**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-19T06:30:38Z
- **Completed:** 2026-03-19T06:34:00Z
- **Tasks:** 3 (including TDD RED + GREEN pair for Task 1)
- **Files modified:** 4

## Accomplishments

- Created `docker-compose.vm.yml` with exactly 3 services (biosim, openmct, bridge) — no local db/django — bridge connects to Cloud SQL via explicit environment vars
- Fixed `App.tsx` Open MCT nav link to read from `VITE_OPENMCT_URL` with `localhost:9091` fallback so Firebase builds automatically point at the VM IP
- Added `App.test.tsx` with TDD RED/GREEN cycle proving the env var is actually wired (Test 2 caught the hardcoded URL before the fix)
- Extended `deploy.sh` with 8 new idempotent sections (9-16): static IP reservation, firewall rules, VM creation, Docker install, repo clone + `.env` + systemd unit, BioSim readiness poll, frontend rebuild with VM URLs, and VM smoke checks

## Task Commits

1. **Task 1: Create App.test.tsx (TDD RED)** - `852e120` (test)
2. **Task 2: docker-compose.vm.yml + App.tsx fix (TDD GREEN)** - `cc8db3f` (feat)
3. **Task 3: Extend deploy.sh** - `d877d4e` (feat)

**Plan metadata:** (docs commit — pending)

_Note: Task 1 was TDD RED — test committed before production fix so Test 2 fails against hardcoded URL. Task 2 is GREEN commit after fix._

## Files Created/Modified

- `spatialhub-frontend/src/__tests__/App.test.tsx` — 2 vitest tests for VITE_OPENMCT_URL fallback and custom URL cases
- `docker-compose.vm.yml` — VM-only compose with biosim, openmct, bridge; bridge uses Cloud SQL env vars + BIOSIM_URL=http://biosim:8009
- `spatialhub-frontend/src/App.tsx` — `openMctUrl = import.meta.env.VITE_OPENMCT_URL ?? 'http://localhost:9091'` replaces hardcoded href
- `deploy/deploy.sh` — Sections 9-16: VM provisioning through Firebase frontend rebuild with VM static IP

## Decisions Made

- `bridge` uses `environment:` block (not `env_file: .env`) in VM compose so each var is explicit and auditable; `BIOSIM_URL` uses Docker network hostname `biosim` not `localhost`
- `USE_SQLITE=0` hardcoded in VM compose — bridge must never accidentally fall back to SQLite on the VM
- BioSim readiness poll is 40 attempts × 3s = 120s max; hard `exit 1` if BioSim never responds (forces operator to check VM logs rather than silently deploying broken frontend)
- Frontend Section 15 runs AFTER BioSim readiness (Section 14) so `VITE_OPENMCT_URL` bakes the confirmed-live VM IP

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None for artifact creation. Running `deploy.sh` requires:
- `DB_PASS` and optionally `SECRET_KEY` env vars
- `gcloud auth login` with `nasa-comp-demo` project access
- `firebase` CLI authenticated

## Next Phase Readiness

All local artifacts are committed. The user can now run `DB_PASS="..." ./deploy/deploy.sh` to bring up the full VM stack and redeploy the frontend with VM URLs baked in. Phase 12 plan 01 is complete — next step is the human-verify checkpoint (run deploy.sh, confirm BioSim URL works in browser).

## Self-Check: PASSED

- App.test.tsx: FOUND
- docker-compose.vm.yml: FOUND
- 12-01-SUMMARY.md: FOUND
- 852e120 (test commit): FOUND
- cc8db3f (feat Task 2 commit): FOUND
- d877d4e (feat Task 3 commit): FOUND

---
*Phase: 12-biosim-vm-deployment*
*Completed: 2026-03-19*
