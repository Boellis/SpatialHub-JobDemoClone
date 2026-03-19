# Phase 12: BioSim VM Deployment - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

BioSim simulation server, biosim_bridge, and Open MCT running on a GCE VM in us-central1. The 3D habitat on Firebase shows live BioSim physics data via WebSocket to the VM, biosim_bridge writes tick history to Cloud SQL, and the AnomalyDrawer can trigger real malfunctions remotely. No control loop (Phase 14), no Pi connectivity (Phase 13).

</domain>

<decisions>
## Implementation Decisions

### VM setup approach
- Docker Compose on the VM — reuse existing Dockerfiles (biosim.Dockerfile, openmct from GitHub)
- Separate `docker-compose.vm.yml` file (not profiles in the existing compose) — only biosim + openmct + bridge services, no db/django
- Bridge container connects to Cloud SQL via env vars (DB_HOST, DB_PASS) instead of local postgres
- VM size: **e2-medium** (2 vCPU, 4GB RAM) — enough for BioSim JVM + bridge + Open MCT
- **Static external IP** reserved — VITE_BIOSIM_URL never changes across VM restarts
- Code gets onto the VM via **git clone** from GitHub; redeploys do git pull + docker compose up --build

### Service lifecycle
- Docker Compose **restart: unless-stopped** on all services in the VM compose file
- **Systemd unit** runs docker compose up on VM boot — services come back automatically after reboot
- **Compose healthcheck + depends_on** pattern (same as local compose) — bridge waits for BioSim service_healthy before starting
- BioSim 90s start_period healthcheck carried over from existing compose config
- Logging via SSH + `docker compose logs -f` — no Cloud Logging agent needed for a demo

### Deploy automation
- **Extend existing deploy.sh** with VM sections — single script deploys everything (Cloud SQL + Cloud Run + Firebase + GCE VM)
- Script handles **full VM provisioning**: gcloud compute instances create + static IP + firewall rules (ports 8009, 9091) — idempotent, skips if already exists
- Script SSHes into VM, clones repo (or git pull), starts Docker Compose
- Installs **systemd unit** for auto-start on boot
- **Wait + verify** after docker compose up — poll http://{VM_IP}:8009/api/simulation until BioSim responds (up to 2min for JVM boot) before proceeding to frontend rebuild

### Frontend rebuild
- Frontend rebuilt as **part of deploy.sh** after VM is verified running
- Build with both `VITE_BIOSIM_URL=http://{VM_IP}:8009` and `VITE_OPENMCT_URL=http://{VM_IP}:9091`
- **New VITE_OPENMCT_URL env var** added — Open MCT nav link reads from env, defaults to localhost:9091 for local dev
- AnomalyDrawer malfunction POST/DELETE **already wired** through BIOSIM_BASE_URL from useSimSource.ts — no additional config needed
- Firebase redeploy happens after frontend build with VM URLs baked in

### Claude's Discretion
- VM instance name and network tag naming
- Exact systemd unit file structure
- Firewall rule naming and priority
- docker-compose.vm.yml internal networking details
- Whether to use `gcloud compute ssh` or raw SSH for deploy script commands
- BioSim JVM memory flags (if needed within e2-medium's 4GB)

</decisions>

<specifics>
## Specific Ideas

- deploy.sh already follows the idempotent provision-if-not-exists pattern (see Cloud SQL section) — VM provisioning should mirror this
- biosim_bridge reads BIOSIM_URL env var (defaults to http://biosim:8009) — in VM compose, the bridge service can reach biosim via Docker network name, same as local
- Frontend's useSimSource auto-falls back to client-side simulation when BioSim is unreachable — so even if VM is temporarily down, the demo still works (just without real physics)
- The 10-20 minute Maven build on first docker compose build is expected — subsequent builds use Docker layer cache

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `biosim.Dockerfile`: Multi-stage Maven build (JDK) -> JRE runtime, port 8009, auto-starts BioSim server — ready to use on VM as-is
- `docker-compose.yml`: Has working biosim, openmct, bridge service definitions with healthchecks — VM compose file derives from this
- `biosim_bridge.py`: Management command reads BIOSIM_URL env var, exponential backoff retry, writes to Cloud SQL via Django ORM
- `deploy/deploy.sh`: Idempotent deploy pattern (provision if not exists, skip if exists) with smoke checks — extend for VM
- `useSimSource.ts`: Reads VITE_BIOSIM_URL at build time, auto-fallback to client-side sim — just needs env var set
- `biosimMalfunctions.ts`: Imports BIOSIM_BASE_URL from useSimSource — single env var covers both WebSocket and REST

### Established Patterns
- Docker Compose healthchecks with start_period for BioSim JVM boot (90s) — reuse in VM compose
- `restart: unless-stopped` on bridge service — apply to all VM services
- Idempotent gcloud provisioning in deploy.sh (Cloud SQL section) — same pattern for VM + static IP + firewall

### Integration Points
- `deploy/deploy.sh`: Add VM provisioning + SSH deploy + frontend rebuild sections
- `docker-compose.vm.yml` (new): Derived from docker-compose.yml, only biosim + openmct + bridge, Cloud SQL env vars
- `useSimSource.ts` line 22: VITE_BIOSIM_URL env var — set at build time to http://{VM_IP}:8009
- `App.tsx` nav section: Open MCT link needs VITE_OPENMCT_URL env var (currently hardcoded localhost:9091)
- VM systemd unit (new): Ensures docker compose starts on boot

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-biosim-vm-deployment*
*Context gathered: 2026-03-19*
