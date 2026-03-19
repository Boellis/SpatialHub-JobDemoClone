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
# Final summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Deployment Complete ==="
echo "Cloud Run:  ${CLOUD_RUN_URL}"
echo "Frontend:   https://nasa-comp-demo.web.app"
echo "Cloud SQL:  ${DB_HOST}"
echo ""
echo "IMPORTANT: Store these values for future redeploys:"
echo "  export SECRET_KEY='${SECRET_KEY}'"
echo "  export DB_PASS='${DB_PASS}'"
