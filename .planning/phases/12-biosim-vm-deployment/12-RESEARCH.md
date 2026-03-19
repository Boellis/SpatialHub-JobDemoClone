# Phase 12: BioSim VM Deployment - Research

**Researched:** 2026-03-19
**Domain:** GCE VM provisioning, Docker Compose on Linux, systemd service management, gcloud CLI automation, Vite env vars
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**VM setup approach:**
- Docker Compose on the VM — reuse existing Dockerfiles (biosim.Dockerfile, openmct from GitHub)
- Separate `docker-compose.vm.yml` file (not profiles in the existing compose) — only biosim + openmct + bridge services, no db/django
- Bridge container connects to Cloud SQL via env vars (DB_HOST, DB_PASS) instead of local postgres
- VM size: **e2-medium** (2 vCPU, 4GB RAM) — enough for BioSim JVM + bridge + Open MCT
- **Static external IP** reserved — VITE_BIOSIM_URL never changes across VM restarts
- Code gets onto the VM via **git clone** from GitHub; redeploys do git pull + docker compose up --build

**Service lifecycle:**
- Docker Compose **restart: unless-stopped** on all services in the VM compose file
- **Systemd unit** runs docker compose up on VM boot — services come back automatically after reboot
- **Compose healthcheck + depends_on** pattern (same as local compose) — bridge waits for BioSim service_healthy before starting
- BioSim 90s start_period healthcheck carried over from existing compose config
- Logging via SSH + `docker compose logs -f` — no Cloud Logging agent needed for a demo

**Deploy automation:**
- **Extend existing deploy.sh** with VM sections — single script deploys everything
- Script handles **full VM provisioning**: gcloud compute instances create + static IP + firewall rules (ports 8009, 9091) — idempotent, skips if already exists
- Script SSHes into VM, clones repo (or git pull), starts Docker Compose
- Installs **systemd unit** for auto-start on boot
- **Wait + verify** after docker compose up — poll http://{VM_IP}:8009/api/simulation until BioSim responds (up to 2min for JVM boot) before proceeding to frontend rebuild

**Frontend rebuild:**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-03 | BioSim simulation + biosim_bridge + Open MCT running on GCE VM with ports 8009 and 9091 accessible | GCE VM provisioning patterns, Docker Compose on Linux, systemd autostart, static IP reservation, firewall rule creation, gcloud compute ssh automation, Vite env var build-time injection |
</phase_requirements>

---

## Summary

Phase 12 deploys three services (BioSim JVM, biosim_bridge, Open MCT) onto a GCE e2-medium VM using Docker Compose, wires the Firebase frontend to the VM's static IP, and extends the existing idempotent `deploy.sh` to cover the full VM lifecycle. The work is almost entirely glue — the services already work in Docker Compose locally, the bridge already connects to Cloud SQL via env vars, and the frontend already reads `VITE_BIOSIM_URL` at build time.

The two non-trivial additions are: (1) a systemd unit file that starts docker compose on VM boot, and (2) a `docker-compose.vm.yml` that strips out the local `db` and `django` services and points the bridge at Cloud SQL instead of local postgres. The rest is gcloud CLI automation — static IP reservation, firewall rule creation, SSH-based deploy, and a BioSim readiness poll before triggering the frontend rebuild.

One code change is required in the frontend: `App.tsx` line 64 has `href="http://localhost:9091"` hardcoded. This must be replaced with `import.meta.env.VITE_OPENMCT_URL ?? 'http://localhost:9091'` so the Firebase build bakes in the VM's Open MCT URL.

**Primary recommendation:** Extend `deploy.sh` with idempotent VM sections mirroring the existing Cloud SQL section. Create `docker-compose.vm.yml` by removing `db` and `django` from the existing compose and adding Cloud SQL env vars to `bridge`. Fix the Open MCT hardcoded URL in `App.tsx`. Use `gcloud compute ssh --command` for remote script execution.

---

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| gcloud CLI | current | VM provision, firewall rules, SSH exec | Already in use in deploy.sh; no alternative for GCP automation |
| Docker Compose | v2 (plugin) | Multi-service orchestration on VM | Reuses existing working local compose config |
| systemd | Linux system init | Docker Compose autostart on VM boot | Standard on Debian/Ubuntu GCE images; most reliable approach |
| eclipse-temurin:21-jre | base image in biosim.Dockerfile | BioSim JVM runtime | Already defined in biosim.Dockerfile |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `gcloud compute addresses create` | current | Reserve static external IP | Must run BEFORE instance create to get stable IP |
| `gcloud compute firewall-rules create` | current | Open ports 8009/9091 to internet | Runs once per port; idempotent check by name |
| `gcloud compute instances create` | current | Provision e2-medium VM | Idempotent check: `gcloud compute instances describe` first |
| `docker compose logs -f` | v2 | Inspect running services | Via `gcloud compute ssh --command` from local machine |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| systemd unit | Docker restart policies alone | restart:unless-stopped handles crashes but NOT VM reboots — systemd is required for cold boot |
| `gcloud compute ssh --command` | Raw SSH with extracted IP | gcloud ssh handles IAP, key management, project/zone context automatically; raw SSH requires manual key distribution |
| `docker-compose.vm.yml` new file | Profile in existing compose | New file keeps VM config separate, no risk of accidentally running vm-only config locally |

**Installation on VM (performed by deploy.sh):**
```bash
# Install Docker (Debian bookworm — standard GCE default image)
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git curl
sudo usermod -aG docker $USER
```

---

## Architecture Patterns

### Recommended Project Structure
```
deploy/
└── deploy.sh          # Extended with VM sections (Sections 9-12)
docker-compose.vm.yml  # New: biosim + openmct + bridge only, Cloud SQL env vars
spatialhub-frontend/
└── src/
    └── App.tsx        # Fix: replace hardcoded localhost:9091 with VITE_OPENMCT_URL
```

### Pattern 1: Idempotent GCE VM Provisioning (mirrors existing Cloud SQL section)
**What:** Check if resource exists, skip or create, never fail on re-run
**When to use:** All gcloud provisioning steps — static IP, VM, firewall rules

```bash
# Source: mirrors deploy.sh Section 2 pattern
VM_NAME="spatialhub-biosim"
STATIC_IP_NAME="spatialhub-biosim-ip"
ZONE="us-central1-a"
BIOSIM_TAG="biosim-server"

# Reserve static IP (idempotent)
if ! gcloud compute addresses describe "$STATIC_IP_NAME" \
    --region="$REGION" --project="$PROJECT" &>/dev/null; then
  gcloud compute addresses create "$STATIC_IP_NAME" \
    --region="$REGION" \
    --project="$PROJECT"
fi
VM_IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" \
  --region="$REGION" --project="$PROJECT" \
  --format='value(address)')

# Create firewall rules (idempotent by rule name)
if ! gcloud compute firewall-rules describe "allow-biosim-8009" \
    --project="$PROJECT" &>/dev/null; then
  gcloud compute firewall-rules create "allow-biosim-8009" \
    --allow tcp:8009 \
    --target-tags "$BIOSIM_TAG" \
    --source-ranges 0.0.0.0/0 \
    --project="$PROJECT"
fi
if ! gcloud compute firewall-rules describe "allow-openmct-9091" \
    --project="$PROJECT" &>/dev/null; then
  gcloud compute firewall-rules create "allow-openmct-9091" \
    --allow tcp:9091 \
    --target-tags "$BIOSIM_TAG" \
    --source-ranges 0.0.0.0/0 \
    --project="$PROJECT"
fi

# Create VM (idempotent)
if ! gcloud compute instances describe "$VM_NAME" \
    --zone="$ZONE" --project="$PROJECT" &>/dev/null; then
  gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --machine-type=e2-medium \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --address="$STATIC_IP_NAME" \
    --tags="$BIOSIM_TAG" \
    --project="$PROJECT" \
    --boot-disk-size=20GB
fi
```

### Pattern 2: gcloud compute ssh --command for Remote Automation
**What:** Execute a command on VM from local machine via gcloud (handles auth, keys, IAP tunnel)
**When to use:** Git clone/pull on VM, docker compose up, systemd unit install

```bash
# Source: gcloud SDK reference docs (confirmed --command flag)
# Single-line commands
gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --command="docker compose -f /opt/spatialhub/docker-compose.vm.yml up -d --build"

# Multi-step: pipe a heredoc script via --command 'bash -s' < script.sh
# OR write to a temp file and scp + execute
# Simplest for inline: chain with semicolons in --command string
gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --command="cd /opt/spatialhub && git pull origin main && sudo docker compose -f docker-compose.vm.yml up --build -d"
```

**Important:** `gcloud compute ssh --command` exits with the remote command's exit code. Use `set -euo pipefail` in deploy.sh so failures abort the script.

### Pattern 3: Systemd Unit for Docker Compose Autostart
**What:** Systemd service that runs `docker compose up` at VM boot, after docker.service is ready
**When to use:** Any Docker Compose stack on a Linux VM that must survive reboots

```ini
# Source: systemd documentation pattern (HIGH confidence — standard Linux practice)
# Written to /etc/systemd/system/spatialhub-biosim.service on the VM
[Unit]
Description=SpatialHub BioSim Stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/spatialhub
ExecStart=/usr/bin/docker compose -f /opt/spatialhub/docker-compose.vm.yml up -d
ExecStop=/usr/bin/docker compose -f /opt/spatialhub/docker-compose.vm.yml down
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Install and enable via deploy.sh SSH command:
```bash
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" --quiet \
  --command="sudo systemctl daemon-reload && sudo systemctl enable spatialhub-biosim.service"
```

### Pattern 4: docker-compose.vm.yml Structure
**What:** VM-only compose file — biosim + openmct + bridge, no db, no django, bridge points to Cloud SQL
**When to use:** The source of truth for what runs on the GCE VM

```yaml
# docker-compose.vm.yml — GCE VM only
services:
  biosim:
    build:
      context: .
      dockerfile: biosim.Dockerfile
    ports:
      - "8009:8009"
    working_dir: /app
    command: >
      sh -c "
        ./bin/start-biosim-server --writeTicks &
        SERVER_PID=$$!;
        until curl -sf http://localhost:8009/api/simulation >/dev/null 2>&1; do sleep 2; done;
        SIM_ID=$$(curl -s -X POST 'http://localhost:8009/api/simulation/start' --data-binary @configuration/default.biosim -H 'Content-Type: text/plain');
        echo \"Simulation started with ID: $$SIM_ID\";
        wait $$SERVER_PID
      "
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8009/api/simulation || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 6
      start_period: 90s
    restart: unless-stopped

  openmct:
    build:
      context: "https://github.com/scottbell/openmct-biosim.git"
    ports:
      - "9091:80"
    restart: unless-stopped

  bridge:
    build: .
    environment:
      - DB_HOST=${DB_HOST}
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASS=${DB_PASS}
      - SECRET_KEY=${SECRET_KEY}
      - BIOSIM_URL=http://biosim:8009
      - USE_SQLITE=0
    command: ["python", "manage.py", "biosim_bridge"]
    depends_on:
      biosim:
        condition: service_healthy
    restart: unless-stopped
```

**Note:** Bridge reaches BioSim via Docker network name `biosim` (same as local). Bridge reaches Cloud SQL via `DB_HOST` env var (the Cloud SQL public IP `34.30.238.232`).

### Pattern 5: BioSim Readiness Poll Before Frontend Rebuild
**What:** Block deploy.sh until BioSim responds at its REST endpoint — prevents baking a bad URL into Firebase
**When to use:** After `docker compose up` on VM, before `npm run build`

```bash
# Source: pattern derived from existing docker-compose.yml healthcheck logic
echo "=== Waiting for BioSim to be ready (up to 120s) ==="
for i in $(seq 1 40); do
  if curl -sf "http://${VM_IP}:8009/api/simulation" >/dev/null 2>&1; then
    echo "BioSim ready."
    break
  fi
  echo "  Attempt $i/40: BioSim not ready — waiting 3s..."
  sleep 3
  if [[ "$i" -eq 40 ]]; then
    echo "Error: BioSim did not become ready after 120s."
    exit 1
  fi
done
```

### Pattern 6: Vite Environment Variable for Open MCT URL (frontend fix)
**What:** Replace hardcoded `http://localhost:9091` in App.tsx with env-var-backed value
**When to use:** Any build-time URL that changes between local dev and production

```tsx
// App.tsx — replace href="http://localhost:9091"
// Source: Vite docs on import.meta.env (HIGH confidence, standard Vite pattern)
const openMctUrl = import.meta.env.VITE_OPENMCT_URL ?? 'http://localhost:9091';

// In JSX:
<a href={openMctUrl} target="_blank" rel="noopener noreferrer" ...>
```

Build command in deploy.sh (after VM is verified):
```bash
VITE_API_URL="${CLOUD_RUN_URL}/api" \
VITE_BIOSIM_URL="http://${VM_IP}:8009" \
VITE_OPENMCT_URL="http://${VM_IP}:9091" \
npm run build
```

### Anti-Patterns to Avoid
- **Using `docker-compose.yml` profiles instead of a separate file:** Profiles share the same file — risk of accidental local dev running with `--profile vm` and talking to Cloud SQL. Separate file is a hard boundary.
- **Starting docker compose without `-d` in systemd ExecStart:** Without detached mode, the systemd service blocks waiting for compose to exit (it won't). Always use `up -d` in the ExecStart line.
- **Assuming `gcloud compute ssh` key distribution is instant:** On first SSH after VM creation, gcloud generates and pushes SSH keys automatically, which adds 5-10 seconds. Add `--quiet` to suppress the interactive prompt.
- **Reserving static IP after instance create:** If you attach a static IP to an existing instance after creation, you need `gcloud compute instances add-access-config`. Simpler to pass `--address=<ip-name>` at create time.
- **Building frontend before VM is ready:** `VITE_BIOSIM_URL` bakes the VM IP into the JS bundle. If the VM is not yet reachable at build time, the URL is still baked in correctly — but if you poll first, you can also smoke-test that BioSim is actually serving before the frontend deploy.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VM SSH key distribution | Custom SSH key generation/copy | `gcloud compute ssh` | gcloud handles OS Login or metadata-based key push automatically |
| Cloud SQL connection from VM | Cloud SQL Auth Proxy setup | Direct public IP (authorized-networks=0.0.0.0/0 already set in Phase 11) | Cloud SQL is already configured to accept connections from any IP; bridge just needs DB_HOST env var |
| Docker daemon startup ordering | Custom wait scripts | `Requires=docker.service` + `After=docker.service` in systemd unit | Systemd handles this correctly when the unit declares the dependency |
| BioSim healthcheck | Custom health endpoint | Existing `curl -sf http://localhost:8009/api/simulation` | Already validated in local compose; carry forward as-is |

**Key insight:** Nearly everything for this phase is already built. The `biosim.Dockerfile`, BioSim compose service definition with healthcheck, biosim_bridge command with Cloud SQL env vars, and VITE_BIOSIM_URL frontend integration are all production-ready. This phase is orchestration, not implementation.

---

## Common Pitfalls

### Pitfall 1: Docker Not in PATH for systemd
**What goes wrong:** systemd services run with a minimal environment — `/usr/local/bin` may not be in PATH if Docker is installed there. `ExecStart=/usr/bin/docker compose up -d` fails with "command not found".
**Why it happens:** systemd unit files use a stripped-down environment by default.
**How to avoid:** Always use the absolute path to docker in ExecStart. Find it first: `which docker` on the VM. On Debian 12 with `docker.io` package: `/usr/bin/docker`. With Docker CE: `/usr/bin/docker` or check `which docker` after install.
**Warning signs:** `systemctl status spatialhub-biosim` shows "Failed to start" with exec format error or "No such file".

### Pitfall 2: Bridge Container Can't Connect to Cloud SQL
**What goes wrong:** bridge container attempts to connect to `db` (the local postgres service name, which doesn't exist in docker-compose.vm.yml) instead of Cloud SQL.
**Why it happens:** biosim_bridge.py has `DB_HOST = os.environ.get('DB_HOST', 'db')` — the default is `db`, the local postgres service name.
**How to avoid:** docker-compose.vm.yml MUST explicitly set `DB_HOST` env var to the Cloud SQL IP (`34.30.238.232`). Do not rely on the default. Use an `.env` file on the VM or inject directly in the compose `environment:` block (from env vars passed to docker compose).
**Warning signs:** `docker compose logs bridge` shows `connection refused to db:5432` or `unknown host db`.

### Pitfall 3: BioSim First Build Takes 10-20 Minutes
**What goes wrong:** deploy.sh times out or appears hung during the first `docker compose up --build` on the VM.
**Why it happens:** biosim.Dockerfile runs `mvn package` which downloads all Maven dependencies on cold cache. Expected duration: 10-20 minutes.
**How to avoid:** Do not set a short timeout on the `gcloud compute ssh` command for the build step. Do not include the build step in the BioSim readiness poll. The readiness poll runs AFTER `docker compose up -d` returns (which returns once containers start, not when BioSim is healthy). The 90s start_period in the BioSim healthcheck covers the JVM startup time — this is separate from the Maven build time.
**Warning signs:** SSH command appears to hang for 15+ minutes on first deploy. This is expected — do not interrupt.

### Pitfall 4: Static IP Reserved in Wrong Region
**What goes wrong:** `gcloud compute instances create --address=<ip-name>` fails with "resource not found" or region mismatch.
**Why it happens:** `gcloud compute addresses create` for a REGIONAL address must use `--region`, not `--global`. The region must match the VM's region.
**How to avoid:** Always use `--region="$REGION"` (not `--global`) when reserving a static IP for a GCE VM. Global IPs are for HTTP(S) Load Balancers, not VMs.
**Warning signs:** Error message: "The resource ... was not found" when creating instance with `--address`.

### Pitfall 5: Open MCT `href` Hardcoded in App.tsx
**What goes wrong:** Firebase-hosted frontend always points Open MCT link to `localhost:9091` even in production — clicking Open MCT from the public URL does nothing useful.
**Why it happens:** App.tsx line 64 has `href="http://localhost:9091"` hardcoded. This is the only place in the codebase where the Open MCT URL appears — it was never parameterized.
**How to avoid:** This is a required code change for this phase. Replace with `import.meta.env.VITE_OPENMCT_URL ?? 'http://localhost:9091'`. Needs to be done BEFORE the frontend build in deploy.sh — or the build produces a broken link.
**Warning signs:** In Firebase-hosted app, "Open MCT" link opens `localhost:9091` tab instead of `http://{VM_IP}:9091`.

### Pitfall 6: VM SSH Key Not Propagated Before First SSH Command
**What goes wrong:** First `gcloud compute ssh --command` call after VM creation fails or hangs waiting for key propagation.
**Why it happens:** gcloud must generate and push SSH keys to the VM's metadata on first connection. This can take 10-15 seconds.
**How to avoid:** After VM creation, add a short wait or use `gcloud compute ssh --strict-host-key-checking=no --quiet` on first access. A simple `sleep 30` after `gcloud compute instances create` is sufficient.
**Warning signs:** `WARNING: There was a problem refreshing your current auth tokens` or SSH timeout on first command.

---

## Code Examples

Verified patterns from official and project sources:

### Writing Systemd Unit File to VM via SSH
```bash
# Source: systemd unit pattern (confirmed standard practice)
# Use printf to write multi-line unit file via gcloud compute ssh
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" --quiet \
  --command="sudo tee /etc/systemd/system/spatialhub-biosim.service > /dev/null << 'UNITEOF'
[Unit]
Description=SpatialHub BioSim Stack
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/spatialhub
ExecStart=/usr/bin/docker compose -f /opt/spatialhub/docker-compose.vm.yml up -d
ExecStop=/usr/bin/docker compose -f /opt/spatialhub/docker-compose.vm.yml down

[Install]
WantedBy=multi-user.target
UNITEOF"
```

### Passing Environment Variables to Docker Compose on VM
```bash
# Source: existing docker-compose.yml pattern for bridge + deploy.sh env var injection
# Write .env file to VM so docker compose can pick it up
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" --quiet \
  --command="cat > /opt/spatialhub/.env << 'ENVEOF'
DB_HOST=${DB_HOST}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
SECRET_KEY=${SECRET_KEY}
ENVEOF"
```

### Checking VM Already Has Running Containers (for idempotent redeploy)
```bash
# Source: docker compose CLI reference
# On subsequent deploys, docker compose up --build only rebuilds changed layers
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" --quiet \
  --command="cd /opt/spatialhub && sudo docker compose -f docker-compose.vm.yml ps --format json"
```

### Frontend Build with All VM URLs
```bash
# Source: deploy.sh Section 7 pattern extended
cd "$REPO_ROOT/spatialhub-frontend"
VITE_API_URL="${CLOUD_RUN_URL}/api" \
VITE_BIOSIM_URL="http://${VM_IP}:8009" \
VITE_OPENMCT_URL="http://${VM_IP}:9091" \
npm run build
firebase deploy --only hosting --project "$PROJECT"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GCE container-optimized OS with container startup agent | Docker Compose + systemd on Debian/Ubuntu with Docker installed | Container startup agent deprecated 2024 | Must use startup scripts or manual Docker install; systemd is the standard replacement |
| docker-compose v1 (`docker-compose` binary) | Docker Compose v2 plugin (`docker compose` — no hyphen) | Docker 20.10+ | All commands use `docker compose` (space, not hyphen). Debian bookworm installs v2 via `docker-compose-plugin` package. |

**Deprecated/outdated:**
- `docker-compose` (v1 Python binary): superseded by `docker compose` v2 plugin. Do not use `docker-compose up`, use `docker compose up`.
- GCE container startup agent (`--container-image` flag in instance create): deprecated. Use systemd + Docker Compose pattern instead.

---

## Open Questions

1. **GitHub repo accessibility for git clone on VM**
   - What we know: CONTEXT.md says "code gets onto VM via git clone from GitHub"
   - What's unclear: Whether the GitHub repo is public or private. If private, `git clone` on the VM requires credentials (SSH key or token). If public, no credentials needed.
   - Recommendation: Treat as public for planning. If private, add a step to configure a deploy key or use HTTPS with a token via `https://x-access-token:${GITHUB_TOKEN}@github.com/...`.

2. **Docker install method on Debian 12 VM**
   - What we know: `docker.io` from apt is the simplest install path; `docker-compose-plugin` gives v2. Docker CE (from docker.com repo) is the alternative but requires more apt repo setup.
   - What's unclear: Which install approach to standardize on.
   - Recommendation: Use `apt-get install docker.io docker-compose-plugin` — simpler, no external apt repo needed, Debian maintains it. Binaries land at `/usr/bin/docker` and `/usr/lib/docker/cli-plugins/docker-compose`.

3. **BioSim `--writeTicks` flag behavior in production**
   - What we know: The local docker-compose.yml passes `--writeTicks` to the BioSim start command. CONTEXT.md carries this forward.
   - What's unclear: Whether `--writeTicks` conflicts with the bridge also writing ticks (potential duplicate data). However, this was working in local testing and the bridge is the authoritative writer to Cloud SQL — BioSim's own tick writing is local/ephemeral inside the container.
   - Recommendation: Carry the existing `--writeTicks` command as-is (same as working local config).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (frontend) | Vitest 1.x with jsdom environment |
| Framework (backend) | Django test runner (pytest compatible) |
| Config file (frontend) | `spatialhub-frontend/vitest.config.ts` |
| Config file (backend) | `django_backend/manage.py test` |
| Quick run (frontend) | `cd spatialhub-frontend && npx vitest run` |
| Full suite (frontend) | `cd spatialhub-frontend && npx vitest run` |
| Quick run (backend) | `cd django_backend && python manage.py test sensor_data` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-03 | VITE_OPENMCT_URL env var wired into App.tsx nav link | unit | `cd spatialhub-frontend && npx vitest run --reporter=verbose src/__tests__/App.test.tsx` | ❌ Wave 0 |
| DEPLOY-03 | docker-compose.vm.yml has correct service definitions (biosim, openmct, bridge — no db/django) | smoke (manual) | manual verify file contents | N/A — config file |
| DEPLOY-03 | BioSim accessible at VM_IP:8009 after deploy | smoke | `curl -sf http://${VM_IP}:8009/api/simulation` | ❌ deploy.sh smoke check |
| DEPLOY-03 | Open MCT accessible at VM_IP:9091 after deploy | smoke | `curl -sf http://${VM_IP}:9091` | ❌ deploy.sh smoke check |
| DEPLOY-03 | bridge writes hub_id=biosim-habitat-01 rows to Cloud SQL | smoke | `curl ${CLOUD_RUN_URL}/api/enriched/?hub_id=biosim-habitat-01` | ❌ deploy.sh smoke check |

### Sampling Rate
- **Per task commit:** `cd spatialhub-frontend && npx vitest run`
- **Per wave merge:** `cd spatialhub-frontend && npx vitest run` + `cd django_backend && python manage.py test sensor_data`
- **Phase gate:** Full suite green + all smoke checks pass before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `spatialhub-frontend/src/__tests__/App.test.tsx` — covers VITE_OPENMCT_URL env var wiring in App.tsx nav link

*(Existing test infrastructure covers all other behaviors. Django tests cover biosim_bridge write path. Frontend tests cover useSimSource, biosimMalfunctions. Only new code — App.tsx Open MCT URL parameterization — needs a new test.)*

---

## Sources

### Primary (HIGH confidence)
- Existing `deploy/deploy.sh` — idempotent provisioning pattern directly reused for VM sections
- Existing `docker-compose.yml` — biosim + bridge + openmct service definitions directly reused in vm compose
- Existing `biosim.Dockerfile` — confirmed multi-stage Maven/JRE build, port 8009, ready to use as-is
- Existing `django_backend/sensor_data/management/commands/biosim_bridge.py` — confirmed BIOSIM_URL env var, DB_HOST env var, Cloud SQL-compatible
- Existing `spatialhub-frontend/src/hooks/useSimSource.ts` line 22 — confirmed `VITE_BIOSIM_URL` env var already wired
- Existing `spatialhub-frontend/src/App.tsx` line 64 — confirmed `href="http://localhost:9091"` hardcoded (requires code change)
- `.planning/STATE.md` — confirmed Cloud SQL IP: 34.30.238.232, Cloud Run URL, Firebase Hosting URL

### Secondary (MEDIUM confidence)
- [gcloud compute firewall-rules create reference](https://cloud.google.com/sdk/gcloud/reference/compute/firewall-rules/create) — `--allow tcp:PORT --target-tags TAG --source-ranges 0.0.0.0/0` syntax
- [gcloud compute addresses create reference](https://docs.cloud.google.com/vpc/docs/reserve-static-external-ip-address) — `--region` flag required for VM IPs
- [gcloud compute ssh reference](https://cloud.google.com/sdk/gcloud/reference/compute/ssh) — `--command` flag confirmed for non-interactive execution
- [Docker Compose systemd service pattern](https://bootvar.com/systemd-service-for-docker-compose/) — `Requires=docker.service`, `After=docker.service`, `Type=oneshot`, `RemainAfterExit=yes`
- [Docker containers start automatically](https://docs.docker.com/engine/containers/start-containers-automatically/) — `restart: unless-stopped` behavior confirmed

### Tertiary (LOW confidence)
- GCE container startup agent deprecation — found in WebSearch, aligns with Google's direction toward Cloud Run for containers; not critical for this phase since we're using systemd pattern anyway

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling already in use in the project (gcloud, Docker Compose, systemd is standard Linux)
- Architecture: HIGH — all services already work in local Docker Compose; VM compose is a subset of existing config
- Pitfalls: HIGH for items 1-5 (found in codebase analysis), MEDIUM for item 6 (general GCE SSH key behavior)

**Research date:** 2026-03-19
**Valid until:** 2026-04-18 (30 days — GCE and Docker Compose are stable)
