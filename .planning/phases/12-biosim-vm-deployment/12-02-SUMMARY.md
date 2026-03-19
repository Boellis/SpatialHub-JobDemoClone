---
phase: 12-biosim-vm-deployment
plan: "02"
subsystem: infra
tags: [gce, docker-compose, biosim, caddy, https, websocket, firebase, openmct, bridge, cloud-sql, pi-sensor]

# Dependency graph
requires:
  - phase: 12-01
    provides: docker-compose.vm.yml, deploy.sh VM sections, VITE_OPENMCT_URL fix

provides:
  - BioSim + bridge + Open MCT running on GCE VM (34.68.135.16) via docker-compose.vm.yml
  - Caddy HTTPS reverse proxy (34-68-135-16.sslip.io) fixing mixed content for Firebase HTTPS -> VM WebSocket
  - deploy/teardown.sh for --stop and --delete VM lifecycle management
  - useLiveSensors hook + LIVE badge UX distinguishing real Pi hardware sensors from BioSim simulation
  - End-to-end verified: Firebase frontend connected to VM WebSocket, bridge writing 792+ rows to Cloud SQL
  - Multiple deploy.sh robustness fixes (Compute Engine API enablement, git install, Docker official repo, SCP fallback)

affects: [13-pi-to-cloud-pipeline, 14-closed-loop-control, 15-frontend-real-sensor, 16-competition-package]

# Tech tracking
tech-stack:
  added:
    - Caddy (HTTPS reverse proxy with sslip.io + Let's Encrypt for mixed-content fix)
    - teardown.sh (VM lifecycle teardown script)
  patterns:
    - "HTTPS-to-VM WebSocket via sslip.io wildcard domain: wss://34-68-135-16.sslip.io/ws/... routes through Caddy to ws://biosim:8009/ws/..."
    - "useLiveSensors hook: polls /api/enriched/?hub_id=pi-habitat-01 and merges real sensor data with BioSim ticks via priority flag"
    - "LIVE badge: SensorSource type field on HabitatSensorReading — real hardware data tagged with source='pi' shows distinct badge in ZonePanel and SensorOrb"
    - "SCP fallback in deploy.sh: when git clone fails (private repo or auth issue), rsync/SCP local repo to VM instead"

key-files:
  created:
    - deploy/teardown.sh
    - spatialhub-frontend/src/hooks/useLiveSensors.ts
  modified:
    - docker-compose.vm.yml (Caddy service + sslip.io routing)
    - deploy/deploy.sh (sections 9-16 robustness fixes)
    - spatialhub-frontend/src/types/habitat.ts (SensorSource type, source field)
    - spatialhub-frontend/src/store/habitatStore.ts (live data merge with priority)
    - spatialhub-frontend/src/components/habitat/ZonePanel.tsx (LIVE badge)
    - spatialhub-frontend/src/components/habitat/SensorOrb.tsx (LIVE tooltip badge)
    - spatialhub-frontend/src/pages/HabitatView.tsx (useLiveSensors integration)
    - biosim.Dockerfile (build fixes)

key-decisions:
  - "Caddy with sslip.io domain resolves mixed content: Firebase HTTPS frontend cannot open ws:// WebSocket — Caddy terminates TLS and proxies to BioSim container over Docker network"
  - "Pi v3.0 hub_client deployed to 10.0.0.161, posting real pH every 30s with hub_id=pi-habitat-01"
  - "useLiveSensors is a secondary data layer — does not replace BioSim WebSocket tick stream, only annotates ZonePanel with real Pi readings when available"
  - "teardown.sh --stop mode halts services without deleting VM; --delete mode destroys VM, static IP, and firewall rules"
  - "deploy.sh extended with multiple idempotency fixes discovered during actual deployment run (Compute Engine API must be enabled before gcloud compute commands)"

requirements-completed: [DEPLOY-03]

# Metrics
duration: ~90min
completed: "2026-03-19"
---

# Phase 12 Plan 02: BioSim VM Deployment — End-to-End Verification Summary

**Full BioSim VM stack deployed to GCE (34.68.135.16) with Caddy HTTPS proxy, Pi pH sensor live at 10.0.0.161, 792+ bridge rows in Cloud SQL, and LIVE badge UX distinguishing real hardware from BioSim simulation**

## Performance

- **Duration:** ~90 min (deployment + iterative fixes)
- **Started:** 2026-03-19 (during Phase 12 execution)
- **Completed:** 2026-03-19T13:45:34Z
- **Tasks:** 1 (checkpoint:human-verify — approved by user)
- **Files modified:** 9+

## Accomplishments

- GCE VM provisioned at 34.68.135.16 running BioSim, biosim_bridge, and Open MCT via docker-compose.vm.yml with systemd autostart
- Caddy HTTPS reverse proxy added to resolve mixed-content block: Firebase (HTTPS) can now open `wss://34-68-135-16.sslip.io/ws/simulation` which Caddy proxies through Docker network to BioSim
- biosim_bridge writing 792+ rows to Cloud SQL `enriched_sensor_data` with `hub_id=biosim-habitat-01` confirmed via API
- Pi v3.0 hub_client deployed to 10.0.0.161, posting real Atlas Scientific pH readings every 30s
- `useLiveSensors` hook added — polls Cloud Run API for Pi data and merges into habitatStore with priority flag
- LIVE badge UX: ZonePanel and SensorOrb show distinct "LIVE" indicator when `source='pi'` data is present, distinguishing real hardware from BioSim simulation data
- `teardown.sh` created with `--stop` (halt services) and `--delete` (destroy all resources) modes
- `deploy.sh` hardened with 6 robustness fixes discovered during actual deployment run

## Task Commits

This plan had one task (checkpoint:human-verify). All implementation work was committed during prior execution and the deployment run itself.

The checkpoint was approved by the user after verifying:
- BioSim REST API at http://34.68.135.16:8009/api/simulation returns simulation data
- Firebase frontend shows "BioSim Connected" green badge on /habitat
- Cloud SQL has 792+ enriched_sensor_data rows with hub_id=biosim-habitat-01
- Open MCT accessible at http://34.68.135.16:9091
- AnomalyDrawer can trigger real BioSim malfunctions
- Pi posting real pH data at 10.0.0.161 with LIVE badge visible in ZonePanel

**Plan metadata:** (this commit)

## Files Created/Modified

- `deploy/teardown.sh` — VM teardown script with `--stop` and `--delete` modes
- `docker-compose.vm.yml` — Added Caddy service with sslip.io TLS termination and WebSocket proxy to BioSim
- `deploy/deploy.sh` — Robustness fixes: Compute Engine API enablement, git install separated from apt, Docker official repo instead of distro package, .git directory check, SCP fallback for repo transfer, root Dockerfile inclusion
- `spatialhub-frontend/src/hooks/useLiveSensors.ts` — Polls Cloud Run API for Pi sensor data, merges into habitatStore with priority flag
- `spatialhub-frontend/src/types/habitat.ts` — Added `SensorSource` type and `source` field to `HabitatSensorReading`
- `spatialhub-frontend/src/store/habitatStore.ts` — Merge tick logic with live data priority
- `spatialhub-frontend/src/components/habitat/ZonePanel.tsx` — LIVE badge shown when `source='pi'`
- `spatialhub-frontend/src/components/habitat/SensorOrb.tsx` — LIVE tooltip badge for real hardware readings
- `spatialhub-frontend/src/pages/HabitatView.tsx` — Integrated useLiveSensors hook
- `biosim.Dockerfile` — Build fixes

## Decisions Made

- **Caddy with sslip.io** resolves the fundamental mixed-content problem: Firebase is HTTPS, bare WebSocket (`ws://`) is blocked by browsers when the page is loaded over HTTPS. Caddy terminates TLS using a Let's Encrypt cert for `34-68-135-16.sslip.io` and proxies the WebSocket to BioSim over the Docker internal network. No custom domain purchase needed.
- **`useLiveSensors` is additive, not replacing**: real Pi data is an annotation layer on top of BioSim physics ticks. The BioSim WebSocket stream remains the primary data source; Pi data only annotates when present.
- **LIVE badge is source-driven**: `SensorSource` type field tags each reading at the data layer; components check `source === 'pi'` to render the badge. This avoids prop-drilling a separate boolean.
- **teardown.sh `--stop` vs `--delete`**: `--stop` is safe for cost management (stops VM billing) without destroying the static IP. `--delete` is for full cleanup before competition teardown.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mixed content HTTPS/WebSocket block resolved with Caddy**
- **Found during:** Task 1 (deployment verification)
- **Issue:** Firebase HTTPS frontend could not open `ws://34.68.135.16:8009/ws/simulation` — browser blocks mixed content (HTTPS page + unencrypted WebSocket)
- **Fix:** Added Caddy service to docker-compose.vm.yml providing HTTPS at `34-68-135-16.sslip.io` with Let's Encrypt cert; frontend `VITE_BIOSIM_URL` baked as `wss://34-68-135-16.sslip.io`
- **Files modified:** docker-compose.vm.yml
- **Verification:** Firebase frontend shows "BioSim Connected" green badge after fix
- **Committed in:** (during active deployment, prior phase commits)

**2. [Rule 3 - Blocking] deploy.sh robustness fixes for actual GCE environment**
- **Found during:** Task 1 (deploy.sh execution on real GCE VM)
- **Issue:** Multiple blocking failures: Compute Engine API not enabled before gcloud compute commands; git/Docker install race conditions; repo SCP needed for private repo; root Dockerfile not included in deploy bundle
- **Fix:** Added `gcloud services enable compute.googleapis.com`, separated git apt install, switched to Docker official repo, added SCP-based repo transfer, included root Dockerfile
- **Files modified:** deploy/deploy.sh
- **Verification:** deploy.sh completes with all smoke checks PASS

**3. [Rule 2 - Missing Critical] Added LIVE badge UX and useLiveSensors hook for Pi data distinction**
- **Found during:** Task 1 (verification — Pi data was flowing but indistinguishable from BioSim data)
- **Issue:** Real Pi pH readings merged invisibly into BioSim data stream with no visual distinction — judges cannot tell what is real hardware vs simulation
- **Fix:** Added `SensorSource` type, `useLiveSensors` hook polling Pi data, LIVE badge in ZonePanel and SensorOrb
- **Files modified:** habitat.ts, habitatStore.ts, ZonePanel.tsx, SensorOrb.tsx, HabitatView.tsx, useLiveSensors.ts (new)
- **Verification:** LIVE badge appears in ZonePanel when Pi is posting pH data

**4. [Rule 2 - Missing Critical] Created teardown.sh for VM lifecycle management**
- **Found during:** Task 1 (post-deployment — no way to stop/delete VM resources without manual gcloud commands)
- **Issue:** No teardown path for cost management between demo sessions or competition end
- **Fix:** Created `deploy/teardown.sh` with `--stop` and `--delete` modes
- **Files modified:** deploy/teardown.sh (new)
- **Verification:** Script includes correct gcloud commands for instance stop and full resource deletion

---

**Total deviations:** 4 auto-fixed (1 bug, 2 missing critical, 1 blocking)
**Impact on plan:** All fixes were required for a working, judge-ready deployment. The Caddy fix was especially critical — without it the Firebase frontend could not connect to BioSim at all.

## Issues Encountered

- Atlas EZO pH sensor ships in UART mode — I2C shows nothing until PGND-TX jumper is installed (documented as known blocker in STATE.md). Pi at 10.0.0.161 is confirmed working in I2C mode.
- GCE firewall rules for ports 8009 and 9091 required explicit creation (handled by deploy.sh sections 10-11).

## User Setup Required

None for future re-deployments — `deploy.sh` is fully automated. For teardown: `./deploy/teardown.sh --stop` (pause) or `./deploy/teardown.sh --delete` (full cleanup).

## Next Phase Readiness

Phase 12 is complete — all 5 success criteria verified:
1. BioSim REST API accessible at http://34.68.135.16:8009/api/simulation
2. Firebase frontend connects to BioSim WebSocket and displays live 3D habitat data
3. biosim_bridge writes ticks to Cloud SQL with hub_id=biosim-habitat-01 (792+ rows)
4. Open MCT accessible at http://34.68.135.16:9091
5. AnomalyDrawer can POST/DELETE malfunctions to BioSim on GCE VM

Phase 13 (Pi-to-Cloud Pipeline) and Phase 14 (Closed-Loop Control) can now proceed. The Pi at 10.0.0.161 is already posting data — Phase 13 verification is partially done.

## Self-Check: PASSED

- 12-02-SUMMARY.md: FOUND (this file)
- GCE VM IP 34.68.135.16: confirmed in continuation context
- Cloud SQL biosim rows (792+): confirmed in continuation context
- Caddy HTTPS proxy: confirmed resolving mixed content
- useLiveSensors.ts: confirmed created per continuation context
- teardown.sh: confirmed created per continuation context

---
*Phase: 12-biosim-vm-deployment*
*Completed: 2026-03-19*
