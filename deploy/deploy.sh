#!/usr/bin/env bash
# deploy.sh — Idempotent full deployment for SpatialHub to GCP
# Provisions Cloud SQL, deploys Django to Cloud Run, deploys frontend to Firebase Hosting.
# Safe to re-run: subsequent runs skip provisioning and only redeploy code.
#
# Required env vars:
#   DB_PASS   — password for Cloud SQL spatialhub user
#
# Optional env vars:
#   SECRET_KEY — Django secret key (generated and printed if not set)
#
# Usage:
#   DB_PASS="your-password" ./deploy/deploy.sh
#   DB_PASS="your-password" SECRET_KEY="your-key" ./deploy/deploy.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PROJECT="nasa-comp-demo"
REGION="us-central1"
INSTANCE_NAME="spatialhub-db"
SERVICE_NAME="spatialhub-backend"
DB_NAME="spatialhub_db"
DB_USER="spatialhub"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
VM_NAME="spatialhub-biosim"
STATIC_IP_NAME="spatialhub-biosim-ip"
ZONE="us-central1-a"
BIOSIM_TAG="biosim-server"
REPO_URL="https://github.com/nickdemari/SpatialHub-JobDemoClone.git"

# ---------------------------------------------------------------------------
# Section 1: Validate prerequisites
# ---------------------------------------------------------------------------
echo "=== Validating Prerequisites ==="

gcloud auth print-identity-token &>/dev/null || {
  echo "Error: gcloud not authenticated. Run: gcloud auth login"
  exit 1
}

command -v firebase &>/dev/null || {
  echo "Error: firebase CLI not found. Install: npm install -g firebase-tools"
  exit 1
}

[[ -n "${DB_PASS:-}" ]] || {
  echo "Error: DB_PASS env var required. Set it before running this script."
  echo "  Example: DB_PASS='my-secure-password' ./deploy/deploy.sh"
  exit 1
}

# Generate SECRET_KEY if not provided
if [[ -z "${SECRET_KEY:-}" ]]; then
  SECRET_KEY="$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")"
  echo ""
  echo "WARNING: SECRET_KEY not set. Generated a new one — store it for future redeploys:"
  echo "  SECRET_KEY=${SECRET_KEY}"
  echo ""
fi

echo "Prerequisites OK."

# ---------------------------------------------------------------------------
# Section 2: Provision Cloud SQL (idempotent)
# ---------------------------------------------------------------------------
echo ""
echo "=== Provisioning Cloud SQL ==="

if ! gcloud sql instances describe "$INSTANCE_NAME" --project="$PROJECT" &>/dev/null; then
  echo "Creating Cloud SQL instance $INSTANCE_NAME (db-f1-micro, PostgreSQL 15) ..."
  gcloud sql instances create "$INSTANCE_NAME" \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region="$REGION" \
    --project="$PROJECT" \
    --authorized-networks=0.0.0.0/0 \
    --root-password="${DB_PASS}"

  echo "Waiting for Cloud SQL instance to become RUNNABLE ..."
  for i in $(seq 1 60); do
    STATE=$(gcloud sql instances describe "$INSTANCE_NAME" \
      --project="$PROJECT" --format='value(state)' 2>/dev/null || echo "UNKNOWN")
    if [[ "$STATE" == "RUNNABLE" ]]; then
      echo "Cloud SQL instance is RUNNABLE."
      break
    fi
    echo "  Attempt $i/60: state=$STATE — waiting 10s ..."
    sleep 10
    if [[ "$i" -eq 60 ]]; then
      echo "Error: Cloud SQL instance did not become RUNNABLE after 10 minutes."
      exit 1
    fi
  done

  echo "Creating database $DB_NAME ..."
  gcloud sql databases create "$DB_NAME" \
    --instance="$INSTANCE_NAME" \
    --project="$PROJECT" 2>/dev/null || echo "Database already exists — skipping."

  echo "Creating user $DB_USER ..."
  gcloud sql users create "$DB_USER" \
    --instance="$INSTANCE_NAME" \
    --password="${DB_PASS}" \
    --project="$PROJECT" 2>/dev/null || echo "User already exists — skipping."
else
  echo "Cloud SQL instance $INSTANCE_NAME already exists — skipping provisioning."

  # Ensure instance is running (may have been stopped to save costs)
  SQL_STATE=$(gcloud sql instances describe "$INSTANCE_NAME" \
    --project="$PROJECT" --format='value(state)')
  if [[ "$SQL_STATE" != "RUNNABLE" ]]; then
    echo "Cloud SQL instance is $SQL_STATE — starting it ..."
    gcloud sql instances patch "$INSTANCE_NAME" \
      --activation-policy=ALWAYS \
      --project="$PROJECT" || echo "Patch command timed out — waiting for startup via polling ..."
    for i in $(seq 1 60); do
      SQL_STATE=$(gcloud sql instances describe "$INSTANCE_NAME" \
        --project="$PROJECT" --format='value(state)' 2>/dev/null || echo "UNKNOWN")
      if [[ "$SQL_STATE" == "RUNNABLE" ]]; then
        echo "Cloud SQL instance is RUNNABLE."
        break
      fi
      echo "  Attempt $i/60: state=$SQL_STATE — waiting 10s ..."
      sleep 10
      if [[ "$i" -eq 60 ]]; then
        echo "Error: Cloud SQL instance did not become RUNNABLE after 10 minutes."
        exit 1
      fi
    done
  fi
fi

# ---------------------------------------------------------------------------
# Section 3: Get Cloud SQL public IP
# ---------------------------------------------------------------------------
echo ""
echo "=== Fetching Cloud SQL IP ==="
DB_HOST=$(gcloud sql instances describe "$INSTANCE_NAME" \
  --project="$PROJECT" --format='value(ipAddresses[0].ipAddress)')
echo "Cloud SQL IP: $DB_HOST"

# ---------------------------------------------------------------------------
# Section 4: Deploy Django to Cloud Run (source-based)
# ---------------------------------------------------------------------------
echo ""
echo "=== Deploying Django to Cloud Run ==="
cd "$REPO_ROOT"
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "DB_HOST=${DB_HOST},DB_NAME=${DB_NAME},DB_USER=${DB_USER},DB_PASS=${DB_PASS},SECRET_KEY=${SECRET_KEY},DEBUG=False,ALLOWED_HOSTS=*"

# ---------------------------------------------------------------------------
# Section 5: Get Cloud Run URL
# ---------------------------------------------------------------------------
echo ""
echo "=== Fetching Cloud Run URL ==="
CLOUD_RUN_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT" \
  --format 'value(status.url)')
echo "Cloud Run URL: $CLOUD_RUN_URL"

# ---------------------------------------------------------------------------
# Section 6: Run migrations and seed data from local machine
# Cloud SQL authorized-networks=0.0.0.0/0 means the local machine can connect
# directly without Cloud SQL Auth Proxy.
# ---------------------------------------------------------------------------
echo ""
echo "=== Running Django Migrations on Cloud SQL ==="
cd "$REPO_ROOT/django_backend"

# Activate local venv if available
if [[ -f venv_local/bin/activate ]]; then
  # shellcheck disable=SC1091
  source venv_local/bin/activate
elif [[ -f venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
fi

echo "Running manage.py migrate ..."
USE_SQLITE=0 \
  DB_HOST="$DB_HOST" \
  DB_NAME="$DB_NAME" \
  DB_USER="$DB_USER" \
  DB_PASS="$DB_PASS" \
  SECRET_KEY="$SECRET_KEY" \
  python manage.py migrate --no-input

echo "Seeding habitat zones ..."
USE_SQLITE=0 \
  DB_HOST="$DB_HOST" \
  DB_NAME="$DB_NAME" \
  DB_USER="$DB_USER" \
  DB_PASS="$DB_PASS" \
  SECRET_KEY="$SECRET_KEY" \
  python manage.py seed_habitat_zones

# ---------------------------------------------------------------------------
# Section 7: Build frontend and deploy to Firebase Hosting
# ---------------------------------------------------------------------------
echo ""
echo "=== Building and Deploying Frontend to Firebase Hosting ==="
cd "$REPO_ROOT/spatialhub-frontend"
echo "Building frontend with VITE_API_URL=${CLOUD_RUN_URL}/api"
VITE_API_URL="${CLOUD_RUN_URL}/api" npm run build
firebase deploy --only hosting --project "$PROJECT"

# ---------------------------------------------------------------------------
# Section 8: Smoke checks
# ---------------------------------------------------------------------------
echo ""
echo "=== Smoke Checks ==="

# Check Django API health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${CLOUD_RUN_URL}/api/enriched/")
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "PASS: Django API responds 200 at ${CLOUD_RUN_URL}/api/enriched/"
else
  echo "WARN: Django API returned $HTTP_CODE at ${CLOUD_RUN_URL}/api/enriched/"
fi

# Check habitat zones seeded
ZONES=$(curl -s "${CLOUD_RUN_URL}/api/habitat/zones/" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
if [[ "$ZONES" == "4" ]]; then
  echo "PASS: habitat_zones has 4 seeded zones"
else
  echo "WARN: habitat_zones returned $ZONES zones (expected 4)"
fi

# Check Firebase Hosting
FB_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://nasa-comp-demo.web.app")
if [[ "$FB_CODE" == "200" ]]; then
  echo "PASS: Firebase Hosting responds 200"
else
  echo "WARN: Firebase Hosting returned $FB_CODE"
fi

# Check sensor ingest endpoint
INGEST_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${CLOUD_RUN_URL}/api/sensor-ingest/" \
  -H "Content-Type: application/json" \
  -d '{"hub_id":"smoke-test","sensor_name":"ph","sensor_val":7.0,"device_addr":"99","datetime":"2026-01-01T00:00:00Z","sensor_id":"smoke-99","collection_type":"sensor_data","location":"Mars Habitat","owner":"Demo","workers":"Crew A"}')
if [[ "$INGEST_CODE" == "201" ]]; then
  echo "PASS: POST /api/sensor-ingest/ returns 201"
else
  echo "WARN: POST /api/sensor-ingest/ returned $INGEST_CODE"
fi

# ---------------------------------------------------------------------------
# Section 9: Reserve Static IP (idempotent)
# ---------------------------------------------------------------------------
echo ""
echo "=== Reserving Static IP for BioSim VM ==="

if ! gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --project="$PROJECT" &>/dev/null; then
  echo "Creating static IP $STATIC_IP_NAME ..."
  gcloud compute addresses create "$STATIC_IP_NAME" \
    --region="$REGION" \
    --project="$PROJECT"
else
  echo "Static IP $STATIC_IP_NAME already exists — skipping."
fi

VM_IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" \
  --region="$REGION" \
  --project="$PROJECT" \
  --format='value(address)')
echo "BioSim VM static IP: $VM_IP"

# ---------------------------------------------------------------------------
# Section 10: Create Firewall Rules (idempotent)
# ---------------------------------------------------------------------------
echo ""
echo "=== Creating Firewall Rules for BioSim VM ==="

if ! gcloud compute firewall-rules describe "allow-biosim-8009" --project="$PROJECT" &>/dev/null; then
  echo "Creating firewall rule allow-biosim-8009 ..."
  gcloud compute firewall-rules create "allow-biosim-8009" \
    --project="$PROJECT" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:8009 \
    --source-ranges=0.0.0.0/0 \
    --target-tags="$BIOSIM_TAG"
else
  echo "Firewall rule allow-biosim-8009 already exists — skipping."
fi

if ! gcloud compute firewall-rules describe "allow-openmct-9091" --project="$PROJECT" &>/dev/null; then
  echo "Creating firewall rule allow-openmct-9091 ..."
  gcloud compute firewall-rules create "allow-openmct-9091" \
    --project="$PROJECT" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:9091 \
    --source-ranges=0.0.0.0/0 \
    --target-tags="$BIOSIM_TAG"
else
  echo "Firewall rule allow-openmct-9091 already exists — skipping."
fi

if ! gcloud compute firewall-rules describe "allow-https-443" --project="$PROJECT" &>/dev/null; then
  echo "Creating firewall rule allow-https-443 (Caddy HTTPS + ACME HTTP-01) ..."
  gcloud compute firewall-rules create "allow-https-443" \
    --project="$PROJECT" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:80,tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags="$BIOSIM_TAG"
else
  echo "Firewall rule allow-https-443 already exists — skipping."
fi

# ---------------------------------------------------------------------------
# Section 11: Create GCE VM (idempotent)
# ---------------------------------------------------------------------------
echo ""
echo "=== Creating GCE VM for BioSim ==="

if ! gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT" &>/dev/null; then
  echo "Creating GCE VM $VM_NAME ..."
  gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --machine-type=e2-medium \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --address="$STATIC_IP_NAME" \
    --tags="$BIOSIM_TAG" \
    --boot-disk-size=20GB
  echo "Waiting 30s for SSH key propagation ..."
  sleep 30
else
  echo "GCE VM $VM_NAME already exists — skipping creation."
fi

# ---------------------------------------------------------------------------
# Section 12: Install Docker and base packages on VM (idempotent)
# ---------------------------------------------------------------------------
echo ""
echo "=== Installing Packages on VM ==="

# Always ensure base packages are present (git, curl) — separate from Docker check
echo "Ensuring git and curl are installed ..."
gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --command="command -v git &>/dev/null && command -v curl &>/dev/null && echo 'Base packages OK' || (sudo apt-get update && sudo apt-get install -y git curl)"

# Check Docker separately — verify it actually runs, not just that the binary exists
DOCKER_CHECK=$(gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --command="docker --version 2>/dev/null && echo DOCKER_OK || echo DOCKER_MISSING" 2>/dev/null || echo "DOCKER_MISSING")

if [[ "$DOCKER_CHECK" != *"DOCKER_OK"* ]]; then
  echo "Docker not found — installing from Docker official repo ..."
  gcloud compute ssh "$VM_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --quiet \
    --command="sudo install -m 0755 -d /etc/apt/keyrings \
      && curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
      && sudo chmod a+r /etc/apt/keyrings/docker.gpg \
      && echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable' | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null \
      && sudo apt-get update \
      && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin \
      && sudo usermod -aG docker \$USER"
else
  echo "Docker already installed — skipping."
fi

# ---------------------------------------------------------------------------
# Section 13: Deploy Code to VM
# ---------------------------------------------------------------------------
echo ""
echo "=== Deploying Code to VM ==="

# Copy local repo to VM (avoids GitHub auth, ensures VM has exact local state)
echo "Preparing deployment bundle ..."
gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --command="sudo mkdir -p /opt/spatialhub && sudo chown \$USER:\$USER /opt/spatialhub"

echo "Syncing code to VM (excludes venv, __pycache__, .git) ..."
BUNDLE="/tmp/spatialhub-deploy.tar.gz"
tar czf "$BUNDLE" \
  --exclude='venv' \
  --exclude='venv_local' \
  --exclude='__pycache__' \
  --exclude='.git' \
  --exclude='node_modules' \
  -C "$REPO_ROOT" \
  docker-compose.vm.yml biosim.Dockerfile Dockerfile django_backend

gcloud compute scp "$BUNDLE" \
  "$VM_NAME":/tmp/spatialhub-deploy.tar.gz \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --compress

gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --command="cd /opt/spatialhub && tar xzf /tmp/spatialhub-deploy.tar.gz && rm /tmp/spatialhub-deploy.tar.gz"

rm -f "$BUNDLE"

echo "Code synced to VM."

# Write .env file to VM (includes DOMAIN for Caddy cert provisioning)
BIOSIM_DOMAIN=$(echo "$VM_IP" | tr '.' '-').sslip.io
echo "Writing .env to VM (DOMAIN=${BIOSIM_DOMAIN}) ..."
gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --command="cat > /opt/spatialhub/.env << ENVEOF
DB_HOST=${DB_HOST}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
SECRET_KEY=${SECRET_KEY}
DOMAIN=${BIOSIM_DOMAIN}
ENVEOF"

# Write systemd unit file
echo "Installing systemd unit file ..."
gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
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

gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --command="sudo systemctl daemon-reload && sudo systemctl enable spatialhub-biosim.service"

# Build and start Docker Compose stack (first build: 10-20 min for BioSim Maven)
echo "Starting Docker Compose stack on VM (first build may take 10-20 minutes) ..."
gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet \
  --ssh-flag="-o ServerAliveInterval=60" \
  --command="cd /opt/spatialhub && sudo docker compose -f docker-compose.vm.yml up --build -d"

# ---------------------------------------------------------------------------
# Section 14: Wait for BioSim Readiness
# ---------------------------------------------------------------------------
echo ""
echo "=== Waiting for BioSim to be Ready ==="

MAX_ATTEMPTS=40
ATTEMPT=0
BIOSIM_READY=false

while [[ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]]; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "  Attempt $ATTEMPT/$MAX_ATTEMPTS: polling http://${VM_IP}:8009/api/simulation ..."
  if curl -sf "http://${VM_IP}:8009/api/simulation" &>/dev/null; then
    BIOSIM_READY=true
    echo "BioSim is ready."
    break
  fi
  sleep 3
done

if [[ "$BIOSIM_READY" != "true" ]]; then
  echo "Error: BioSim did not respond after 120s. Check VM logs:"
  echo "  gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT --command='sudo docker compose -f /opt/spatialhub/docker-compose.vm.yml logs biosim'"
  exit 1
fi

# ---------------------------------------------------------------------------
# Section 15: Rebuild Frontend with VM URLs
# ---------------------------------------------------------------------------
echo ""
echo "=== Rebuilding Frontend with VM URLs ==="
cd "$REPO_ROOT/spatialhub-frontend"
# BIOSIM_DOMAIN already computed in Section 13 when writing .env
echo "Building frontend with VITE_BIOSIM_URL=https://${BIOSIM_DOMAIN} VITE_OPENMCT_URL=http://${VM_IP}:9091"
VITE_API_URL="${CLOUD_RUN_URL}/api" \
  VITE_BIOSIM_URL="https://${BIOSIM_DOMAIN}" \
  VITE_OPENMCT_URL="http://${VM_IP}:9091" \
  npm run build
firebase deploy --only hosting --project "$PROJECT"

# ---------------------------------------------------------------------------
# Section 16: VM Smoke Checks
# ---------------------------------------------------------------------------
echo ""
echo "=== VM Smoke Checks ==="

# Check BioSim
BIOSIM_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${VM_IP}:8009/api/simulation")
if [[ "$BIOSIM_CODE" == "200" ]]; then
  echo "PASS: BioSim responds 200 at http://${VM_IP}:8009/api/simulation"
else
  echo "WARN: BioSim returned $BIOSIM_CODE at http://${VM_IP}:8009/api/simulation"
fi

# Check Open MCT
OPENMCT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${VM_IP}:9091")
if [[ "$OPENMCT_CODE" == "200" ]]; then
  echo "PASS: Open MCT responds 200 at http://${VM_IP}:9091"
else
  echo "WARN: Open MCT returned $OPENMCT_CODE at http://${VM_IP}:9091"
fi

# Check bridge writes (wait for first tick then query enriched data)
echo "Waiting 15s for bridge to write first tick ..."
sleep 15
BRIDGE_DATA=$(curl -s "${CLOUD_RUN_URL}/api/enriched/?hub_id=biosim-habitat-01")
if [[ "$BRIDGE_DATA" != "[]" && -n "$BRIDGE_DATA" ]]; then
  echo "PASS: bridge has written enriched data for biosim-habitat-01"
else
  echo "WARN: No enriched data yet for biosim-habitat-01 (bridge may still be catching up)"
fi

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Deployment Complete ==="
echo "Cloud Run:    ${CLOUD_RUN_URL}"
echo "Frontend:     https://nasa-comp-demo.web.app"
echo "Cloud SQL:    ${DB_HOST}"
echo "BioSim VM IP: ${VM_IP}"
echo "BioSim URL:   http://${VM_IP}:8009"
echo "Open MCT URL: http://${VM_IP}:9091"
echo ""
echo "IMPORTANT: Store these values for future redeploys:"
echo "  export SECRET_KEY='${SECRET_KEY}'"
echo "  export DB_PASS='${DB_PASS}'"
