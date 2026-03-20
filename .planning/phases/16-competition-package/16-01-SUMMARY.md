---
phase: 16-competition-package
plan: 01
subsystem: docs
tags: [raspberry-pi, atlas-ezo, i2c, cloud-run, firebase, gce-vm, biosim, competition]

requires:
  - phase: 15-frontend-real-sensor-visibility
    provides: Teal badge, ZonePanel real pH annotation, useLiveSensors integration
  - phase: 14-closed-loop-control-service
    provides: control_loop service on GCE VM, BioSim malfunction trigger/cancel
  - phase: 13-pi-to-cloud-pipeline
    provides: hub_client.py, atlas_i2c.py, HUB_ID=pi-habitat-01 config
  - phase: 12-biosim-vm-deployment
    provides: deploy.sh, teardown.sh, docker-compose.vm.yml, Caddy HTTPS proxy
  - phase: 11-cloud-services-deployment
    provides: Cloud Run URL, Firebase URL, Cloud SQL IP

provides:
  - COMPETITION_GUIDE.md — judge-facing hardware/software/demo guide
  - deploy/DEPLOY_CHECKLIST.md — deployer-facing cloud verification checklist

affects: [judge-onboarding, competition-handoff]

tech-stack:
  added: []
  patterns:
    - "SD card ships pre-configured; judge only provides WiFi credentials"
    - "Troubleshooting table format: Symptom | Cause | Fix"
    - "Deploy checklist format: Check | Command | Expected | Fix"

key-files:
  created:
    - COMPETITION_GUIDE.md
    - deploy/DEPLOY_CHECKLIST.md
  modified: []

key-decisions:
  - "systemd unit (hubclient.service) chosen over cron @reboot for auto-start -- cleaner restart policy and status visibility"
  - "Troubleshooting table placed as a separate section (not inline per step) -- easier to scan as a reference"
  - "PGND-TX I2C mode switch placed as first hardware step -- blocking issue if skipped"
  - "i2c_arm_baudrate=10000 noted as pre-applied on SD card -- reduces judge friction"

patterns-established:
  - "Competition guide structure: Prerequisites → Hardware → Software → Demo → Troubleshooting → Architecture"
  - "Deploy checklist structure: Cloud SQL → Cloud Run → Firebase → GCE VM → End-to-End → Cost Management"

requirements-completed: [SETUP-01, SETUP-02]

duration: 2min
completed: 2026-03-20
---

# Phase 16 Plan 01: Competition Package Summary

**SD card guide and cloud verification checklist for NASA judge handoff: Atlas EZO I2C setup through vinegar pH demo to closed-loop zone anomaly**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T18:54:53Z
- **Completed:** 2026-03-20T18:57:26Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- `COMPETITION_GUIDE.md` at repo root: 6 sections covering EZO I2C mode switch (PGND-TX), breadboard wiring, baud rate fix, pre-configured .env, systemd auto-start, vinegar demo sequence with timing, and 6-row troubleshooting table
- `deploy/DEPLOY_CHECKLIST.md`: 6 sections with copy-pasteable gcloud/curl verification commands for every cloud service before judge handoff
- Both documents cross-reference the same Cloud Run URL, Firebase URL, and hub_id (`pi-habitat-01`)

## Task Commits

1. **Task 1: Create COMPETITION_GUIDE.md** - `09b5634` (feat)
2. **Task 2: Create deploy/DEPLOY_CHECKLIST.md** - `bde15be` (feat)

## Files Created/Modified

- `COMPETITION_GUIDE.md` -- Judge-facing setup guide: hardware (EZO I2C mode, wiring, baud rate), software (WiFi, .env, systemd), demo (vinegar sequence), troubleshooting, architecture
- `deploy/DEPLOY_CHECKLIST.md` -- Deployer verification runbook: Cloud SQL, Cloud Run, Firebase, GCE VM (biosim/bridge/control_loop/caddy), end-to-end checks, cost management

## Decisions Made

- systemd unit (`hubclient.service`) chosen over `cron @reboot` -- restart policy (`RestartSec=10`) and `systemctl status` visibility are better for a competition setup
- Troubleshooting table as a standalone section 5, not inline -- reference lookup is more useful than scattered per-step notes
- PGND-TX I2C mode switch documented as the very first hardware step -- it's the single most common failure mode and must be done before any other hardware step
- i2c_arm_baudrate=10000 noted as pre-applied on the SD card to minimize judge steps, but documented fully for cases where the card is reflashed

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required beyond WiFi setup already documented in the guide.

## Next Phase Readiness

Phase 16 is the final phase. Both competition documents are ready for handoff:
- `COMPETITION_GUIDE.md` ships on the SD card
- `deploy/DEPLOY_CHECKLIST.md` is used by the deployer before handing off to a judge

---
*Phase: 16-competition-package*
*Completed: 2026-03-20*
