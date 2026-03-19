#!/usr/bin/env bash
# teardown.sh — Stop or delete all GCP resources created by deploy.sh
#
# Modes:
#   --stop    Pause everything (no compute costs, keeps resources for fast restart)
#   --delete  Nuke everything (zero ongoing costs, full reprovision on next deploy)
#
# Usage:
#   ./deploy/teardown.sh --stop     # pause all resources
#   ./deploy/teardown.sh --delete   # destroy all resources
#   ./deploy/teardown.sh            # interactive prompt
set -euo pipefail

# ---------------------------------------------------------------------------
# Constants (must match deploy.sh)
# ---------------------------------------------------------------------------
PROJECT="nasa-comp-demo"
REGION="us-central1"
ZONE="us-central1-a"
INSTANCE_NAME="spatialhub-db"
SERVICE_NAME="spatialhub-backend"
VM_NAME="spatialhub-biosim"
STATIC_IP_NAME="spatialhub-biosim-ip"

# ---------------------------------------------------------------------------
# Parse mode
# ---------------------------------------------------------------------------
MODE="${1:-}"
if [[ -z "$MODE" ]]; then
  echo "SpatialHub Teardown"
  echo ""
  echo "  --stop    Stop VM + Cloud SQL. Cloud Run scales to 0 on its own."
  echo "            Keeps disks, IP, firewall rules. Fast restart with deploy.sh."
  echo "            Cost: ~\$1-2/month (disk storage + static IP while VM stopped)"
  echo ""
  echo "  --delete  Delete everything. Zero cost. Full reprovision on next deploy."
  echo ""
  read -rp "Mode (stop/delete): " MODE
fi

MODE="${MODE#--}"

if [[ "$MODE" != "stop" && "$MODE" != "delete" ]]; then
  echo "Error: mode must be --stop or --delete"
  exit 1
fi

echo ""
echo "=== SpatialHub Teardown (${MODE}) ==="
echo ""

# ---------------------------------------------------------------------------
# Validate gcloud auth
# ---------------------------------------------------------------------------
gcloud auth print-identity-token &>/dev/null || {
  echo "Error: gcloud not authenticated. Run: gcloud auth login"
  exit 1
}

# ---------------------------------------------------------------------------
# GCE VM
# ---------------------------------------------------------------------------
echo "--- GCE VM ($VM_NAME) ---"
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT" &>/dev/null; then
  if [[ "$MODE" == "stop" ]]; then
    STATUS=$(gcloud compute instances describe "$VM_NAME" \
      --zone="$ZONE" --project="$PROJECT" --format='value(status)')
    if [[ "$STATUS" == "RUNNING" ]]; then
      echo "Stopping VM ..."
      gcloud compute instances stop "$VM_NAME" \
        --zone="$ZONE" --project="$PROJECT" --quiet
      echo "VM stopped."
    else
      echo "VM already $STATUS — skipping."
    fi
  else
    echo "Deleting VM ..."
    gcloud compute instances delete "$VM_NAME" \
      --zone="$ZONE" --project="$PROJECT" --quiet
    echo "VM deleted."
  fi
else
  echo "VM not found — skipping."
fi

# ---------------------------------------------------------------------------
# Static IP (only release on delete — costs ~$7/mo when unattached to a VM)
# ---------------------------------------------------------------------------
echo ""
echo "--- Static IP ($STATIC_IP_NAME) ---"
if [[ "$MODE" == "delete" ]]; then
  if gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --project="$PROJECT" &>/dev/null; then
    echo "Releasing static IP ..."
    gcloud compute addresses delete "$STATIC_IP_NAME" \
      --region="$REGION" --project="$PROJECT" --quiet
    echo "Static IP released."
  else
    echo "Static IP not found — skipping."
  fi
else
  echo "Keeping static IP (needed for restart). Note: ~\$7/mo while VM is stopped."
fi

# ---------------------------------------------------------------------------
# Firewall Rules (only delete on full teardown — no cost to keep)
# ---------------------------------------------------------------------------
echo ""
echo "--- Firewall Rules ---"
if [[ "$MODE" == "delete" ]]; then
  for RULE in "allow-biosim-8009" "allow-openmct-9091"; do
    if gcloud compute firewall-rules describe "$RULE" --project="$PROJECT" &>/dev/null; then
      echo "Deleting firewall rule $RULE ..."
      gcloud compute firewall-rules delete "$RULE" \
        --project="$PROJECT" --quiet
      echo "Deleted $RULE."
    else
      echo "Rule $RULE not found — skipping."
    fi
  done
else
  echo "Keeping firewall rules (no cost)."
fi

# ---------------------------------------------------------------------------
# Cloud SQL
# ---------------------------------------------------------------------------
echo ""
echo "--- Cloud SQL ($INSTANCE_NAME) ---"
if gcloud sql instances describe "$INSTANCE_NAME" --project="$PROJECT" &>/dev/null; then
  if [[ "$MODE" == "stop" ]]; then
    ACTIVATION=$(gcloud sql instances describe "$INSTANCE_NAME" \
      --project="$PROJECT" --format='value(settings.activationPolicy)')
    if [[ "$ACTIVATION" == "NEVER" ]]; then
      echo "Cloud SQL already stopped — skipping."
    else
      echo "Stopping Cloud SQL instance ..."
      gcloud sql instances patch "$INSTANCE_NAME" \
        --project="$PROJECT" \
        --activation-policy=NEVER \
        --quiet
      echo "Cloud SQL stopped."
    fi
  else
    echo "Deleting Cloud SQL instance (THIS DESTROYS ALL DATA) ..."
    read -rp "Type 'yes' to confirm: " CONFIRM
    if [[ "$CONFIRM" == "yes" ]]; then
      gcloud sql instances delete "$INSTANCE_NAME" \
        --project="$PROJECT" --quiet
      echo "Cloud SQL deleted."
    else
      echo "Skipped Cloud SQL deletion."
    fi
  fi
else
  echo "Cloud SQL instance not found — skipping."
fi

# ---------------------------------------------------------------------------
# Cloud Run (scales to 0 naturally — delete only on full teardown)
# ---------------------------------------------------------------------------
echo ""
echo "--- Cloud Run ($SERVICE_NAME) ---"
if [[ "$MODE" == "delete" ]]; then
  if gcloud run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT" &>/dev/null; then
    echo "Deleting Cloud Run service ..."
    gcloud run services delete "$SERVICE_NAME" \
      --region="$REGION" --project="$PROJECT" --quiet
    echo "Cloud Run service deleted."
  else
    echo "Cloud Run service not found — skipping."
  fi
else
  echo "Cloud Run scales to 0 automatically — no action needed."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Teardown Complete (${MODE}) ==="
echo ""
if [[ "$MODE" == "stop" ]]; then
  echo "Stopped resources:"
  echo "  - GCE VM:    stopped (no compute cost, disk ~\$0.80/mo)"
  echo "  - Cloud SQL: stopped (no cost while stopped)"
  echo "  - Cloud Run: scales to 0 (no cost unless traffic hits)"
  echo "  - Static IP: kept (~\$7/mo while VM stopped)"
  echo ""
  echo "Estimated idle cost: ~\$8/month"
  echo ""
  echo "To restart: DB_PASS=\"...\" ./deploy/deploy.sh"
  echo "  (deploy.sh is idempotent — it starts stopped resources)"
else
  echo "Deleted resources:"
  echo "  - GCE VM + disk"
  echo "  - Static IP"
  echo "  - Firewall rules"
  echo "  - Cloud SQL instance + data"
  echo "  - Cloud Run service"
  echo ""
  echo "Estimated cost: \$0/month"
  echo ""
  echo "To redeploy from scratch: DB_PASS=\"...\" ./deploy/deploy.sh"
fi
