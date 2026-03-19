---
phase: 13-pi-to-cloud-pipeline
plan: "01"
subsystem: infra
tags: [raspberry-pi, firebase, cloud-run, vite, vitest, sensor, iot]

# Dependency graph
requires:
  - phase: 12-biosim-vm-deployment
    provides: Live GCE VM with BioSim + biosim_bridge writing to Cloud SQL
  - phase: 10-django-ingest-hubcode-rewrite
    provides: hub_client.py with SQLite buffer and sensor-ingest POST
  - phase: 11-cloud-services-deployment
    provides: Cloud Run Django API and Firebase hosting deployed
provides:
  - PI_HUB_ID constant fixed to 'pi-habitat-01' in useLiveSensors.ts
  - SENSOR_MAP exported from useLiveSensors.ts for test coverage
  - Regression test suite for PI_HUB_ID and SENSOR_MAP key alignment
  - hubcode/.env.example with Cloud Run URL as default DJANGO_URL
  - Rebuilt Firebase bundle with corrected PI_HUB_ID baked in
affects: [14-pi-sensor-calibration, 15-frontend-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Export constants that encode invariants so tests can import and assert them directly"
    - "hubcode/.env.example always has Cloud Run URL as default for competition deployments"

key-files:
  created:
    - spatialhub-frontend/src/__tests__/useLiveSensors.test.ts
    - hubcode/.env.example
  modified:
    - spatialhub-frontend/src/hooks/useLiveSensors.ts

key-decisions:
  - "PI_HUB_ID exported (not just const) so vitest can import and guard against regression"
  - "SENSOR_MAP exported so tests can assert key alignment with Pi .env SENSOR_NAME"
  - "hubcode/.env.example documents both localhost (dev) and Cloud Run (production) DJANGO_URL"

patterns-established:
  - "Compile-time constants that encode system-level invariants should be exported for testability"
  - "Any new sensor added to SENSOR_MAP must have matching SENSOR_NAME in .env.example"

requirements-completed: [DEPLOY-05]

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 13 Plan 01: Pi-to-Cloud Pipeline Fix Summary

**PI_HUB_ID bug fixed from stale provisioned ID to 'pi-habitat-01', SENSOR_MAP aligned and tested, Firebase bundle redeployed with corrected constant**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-19T16:12:31Z
- **Completed:** 2026-03-19T16:15:36Z
- **Tasks:** 2 automated complete + 1 human-verify checkpoint pending
- **Files modified:** 3

## Accomplishments
- Fixed the root cause of the "LIVE badge never appears" bug — PI_HUB_ID was a stale alphanumeric provisioned ID instead of 'pi-habitat-01'
- Created regression test guarding against both the hub_id mismatch and any future SENSOR_MAP key case drift
- Created hubcode/.env.example with Cloud Run URL as default DJANGO_URL so a judge can copy-paste and have a working Pi config
- Rebuilt and redeployed Firebase frontend — live site now has the fix baked into the bundle

## Task Commits

1. **Task 1: Fix PI_HUB_ID, align SENSOR_NAME, update .env.example, add test** - `d64757a` (feat)
2. **Task 2: Rebuild frontend and redeploy to Firebase** - `1337bf1` (chore)
3. **Task 3: Verify full Pi-to-Cloud pipeline on real hardware** - *pending human verification*

## Files Created/Modified
- `spatialhub-frontend/src/hooks/useLiveSensors.ts` - PI_HUB_ID fixed to 'pi-habitat-01', PI_HUB_ID and SENSOR_MAP exported
- `spatialhub-frontend/src/__tests__/useLiveSensors.test.ts` - Regression tests for PI_HUB_ID value and SENSOR_MAP['ph'] mapping
- `hubcode/.env.example` - New file: production-ready config template with Cloud Run URL as default DJANGO_URL and SENSOR_NAME=ph

## Decisions Made
- Exported PI_HUB_ID and SENSOR_MAP rather than keeping them private — the export exists purely to enable test imports; the hook's public API (useLiveSensors(): void) is unchanged
- .env.example comments out the local DJANGO_URL and leaves the Cloud Run URL uncommented — competition default is cloud

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - hubcode/.env.example did not previously exist (plan said "update", file was actually a create). Created from scratch using hub_client.py env var inspection. All fields match what hub_client.py reads.

## User Setup Required

**Task 3 requires physical Pi hardware verification.** See checkpoint below.

Steps the user must perform:
1. SSH into Pi at 10.0.0.161
2. Confirm/update .env: DJANGO_URL=https://spatialhub-backend-4vovlomqfa-uc.a.run.app, SENSOR_NAME=ph, HUB_ID=pi-habitat-01
3. Run hub_client.py -v and watch for sync confirmations
4. Verify rows in Cloud SQL: `curl "https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/?hub_id=pi-habitat-01"`
5. Visit https://nasa-comp-demo.web.app/habitat, navigate to Water Recycling zone, confirm LIVE badge
6. Test offline buffer: ifconfig wlan0 down → logs show "buffered (offline)" → ifconfig wlan0 up → logs show "synced (+ N buffered)"

## Next Phase Readiness
- Frontend and hub config aligned — ready for physical Pi hardware test
- Once Task 3 human verification passes, Phase 13 is complete and Phase 14 (sensor calibration) can begin
- pH divergence threshold validation (Phase 14 blocker) requires actual sensor noise floor data from Pi

---
*Phase: 13-pi-to-cloud-pipeline*
*Completed: 2026-03-19*
