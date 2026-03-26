#!/usr/bin/env bash
# cost-check.sh — Check running GCP resources, calculate actual spend from uptime
# Usage: ./deploy/cost-check.sh
set -euo pipefail

PROJECT="nasa-comp-demo"
REGION="us-central1"
ZONE="us-central1-a"
VM_NAME="spatialhub-biosim"
INSTANCE_NAME="spatialhub-db"
SERVICE_NAME="spatialhub-backend"
STATIC_IP_NAME="spatialhub-biosim-ip"

NOW_EPOCH=$(date +%s)

echo "=== SpatialHub GCP Cost Check ==="
echo "Project: $PROJECT"
echo "Checked: $(date)"
echo ""

TOTAL_HOURLY=0
TOTAL_SPENT=0

# Helper: compute hours between an ISO timestamp and now
hours_since() {
  local ts="$1"
  local ts_epoch
  ts_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${ts%%.*}" "+%s" 2>/dev/null \
    || date -d "${ts}" "+%s" 2>/dev/null \
    || echo "0")
  if [[ "$ts_epoch" == "0" ]]; then
    echo "0"
  else
    echo "scale=2; ($NOW_EPOCH - $ts_epoch) / 3600" | bc
  fi
}

# ---------------------------------------------------------------------------
# GCP Pricing (us-central1, on-demand, as of March 2025)
# Source: https://cloud.google.com/compute/vm-instance-pricing
#         https://cloud.google.com/sql/pricing
# ---------------------------------------------------------------------------
SQL_MICRO_PER_HR="0.0150"        # db-f1-micro shared-core
SQL_STORAGE_PER_GB_MO="0.170"    # SSD storage $/GB/month
VM_E2MED_PER_HR="0.03351"        # e2-medium (2 vCPU, 4GB)
DISK_PER_GB_MO="0.040"           # pd-standard $/GB/month
STATIC_IP_IDLE_PER_HR="0.010"    # unused static IP
# Derived
SQL_STORAGE_PER_HR=$(echo "scale=6; $SQL_STORAGE_PER_GB_MO / 730" | bc)  # per GB per hour
DISK_PER_HR=$(echo "scale=6; $DISK_PER_GB_MO / 730" | bc)               # per GB per hour

# ---------------------------------------------------------------------------
# 1. Cloud SQL
# ---------------------------------------------------------------------------
echo "--- Cloud SQL ($INSTANCE_NAME) ---"
SQL_JSON=$(gcloud sql instances describe "$INSTANCE_NAME" \
  --project="$PROJECT" --format=json 2>/dev/null || echo '{}')

SQL_STATE=$(echo "$SQL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','NOT_FOUND'))")
SQL_TIER=$(echo "$SQL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('settings',{}).get('tier','unknown'))")
SQL_CREATE=$(echo "$SQL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('createTime',''))")
SQL_DISK_GB=$(echo "$SQL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('settings',{}).get('dataDiskSizeGb','10'))")

SQL_HOURS=$(hours_since "$SQL_CREATE")
SQL_STORAGE_HOURLY=$(echo "scale=4; $SQL_STORAGE_PER_HR * $SQL_DISK_GB" | bc)

if [[ "$SQL_STATE" == "RUNNABLE" ]]; then
  SQL_COMPUTE_SPENT=$(echo "scale=2; $SQL_HOURS * $SQL_MICRO_PER_HR" | bc)
  SQL_STORAGE_SPENT=$(echo "scale=2; $SQL_HOURS * $SQL_STORAGE_HOURLY" | bc)
  SQL_TOTAL_SPENT=$(echo "scale=2; $SQL_COMPUTE_SPENT + $SQL_STORAGE_SPENT" | bc)
  SQL_TOTAL_HOURLY=$(echo "scale=4; $SQL_MICRO_PER_HR + $SQL_STORAGE_HOURLY" | bc)
  echo "  Status:   RUNNING"
  echo "  Tier:     $SQL_TIER"
  echo "  Created:  $SQL_CREATE"
  echo "  Uptime:   ${SQL_HOURS}h"
  echo "  Storage:  ${SQL_DISK_GB}GB"
  echo "  Rate:     \$${SQL_MICRO_PER_HR}/hr (compute) + \$${SQL_STORAGE_HOURLY}/hr (storage)"
  echo "  Spent:    \$${SQL_TOTAL_SPENT} (compute \$${SQL_COMPUTE_SPENT} + storage \$${SQL_STORAGE_SPENT})"
  TOTAL_HOURLY=$(echo "$TOTAL_HOURLY + $SQL_TOTAL_HOURLY" | bc)
  TOTAL_SPENT=$(echo "$TOTAL_SPENT + $SQL_TOTAL_SPENT" | bc)
elif [[ "$SQL_STATE" == "SUSPENDED" ]]; then
  SQL_STORAGE_SPENT=$(echo "scale=2; $SQL_HOURS * $SQL_STORAGE_HOURLY" | bc)
  echo "  Status:   STOPPED (storage billed since creation)"
  echo "  Created:  $SQL_CREATE"
  echo "  Storage:  ${SQL_DISK_GB}GB"
  echo "  Spent:    \$${SQL_STORAGE_SPENT} (storage only — compute paused)"
  TOTAL_HOURLY=$(echo "$TOTAL_HOURLY + $SQL_STORAGE_HOURLY" | bc)
  TOTAL_SPENT=$(echo "$TOTAL_SPENT + $SQL_STORAGE_SPENT" | bc)
else
  echo "  Status:   $SQL_STATE"
fi
echo ""

# ---------------------------------------------------------------------------
# 2. GCE VM
# ---------------------------------------------------------------------------
echo "--- GCE VM ($VM_NAME) ---"
VM_JSON=$(gcloud compute instances describe "$VM_NAME" \
  --zone="$ZONE" --project="$PROJECT" --format=json 2>/dev/null || echo '{}')

VM_STATE=$(echo "$VM_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','NOT_FOUND'))")
VM_TYPE=$(echo "$VM_JSON" | python3 -c "import sys,json; t=json.load(sys.stdin).get('machineType',''); print(t.split('/')[-1] if t else 'unknown')")
VM_CREATE=$(echo "$VM_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('creationTimestamp',''))")
VM_LAST_START=$(echo "$VM_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lastStartTimestamp',''))")
VM_DISK_GB=$(echo "$VM_JSON" | python3 -c "import sys,json; disks=json.load(sys.stdin).get('disks',[]); print(disks[0].get('diskSizeGb','20') if disks else '20')")

VM_CREATE_HOURS=$(hours_since "$VM_CREATE")
VM_DISK_HOURLY=$(echo "scale=4; $DISK_PER_HR * $VM_DISK_GB" | bc)

if [[ "$VM_STATE" == "RUNNING" ]]; then
  VM_RUN_HOURS=$(hours_since "$VM_LAST_START")
  VM_COMPUTE_SPENT=$(echo "scale=2; $VM_RUN_HOURS * $VM_E2MED_PER_HR" | bc)
  VM_DISK_SPENT=$(echo "scale=2; $VM_CREATE_HOURS * $VM_DISK_HOURLY" | bc)
  VM_TOTAL_SPENT=$(echo "scale=2; $VM_COMPUTE_SPENT + $VM_DISK_SPENT" | bc)
  VM_TOTAL_HOURLY=$(echo "scale=4; $VM_E2MED_PER_HR + $VM_DISK_HOURLY" | bc)
  echo "  Status:     RUNNING"
  echo "  Type:       $VM_TYPE"
  echo "  Created:    $VM_CREATE"
  echo "  Last start: $VM_LAST_START"
  echo "  Run hours:  ${VM_RUN_HOURS}h (compute) / ${VM_CREATE_HOURS}h (disk since creation)"
  echo "  Disk:       ${VM_DISK_GB}GB"
  echo "  Rate:       \$${VM_E2MED_PER_HR}/hr (compute) + \$${VM_DISK_HOURLY}/hr (disk)"
  echo "  Spent:      \$${VM_TOTAL_SPENT} (compute \$${VM_COMPUTE_SPENT} + disk \$${VM_DISK_SPENT})"
  TOTAL_HOURLY=$(echo "$TOTAL_HOURLY + $VM_TOTAL_HOURLY" | bc)
  TOTAL_SPENT=$(echo "$TOTAL_SPENT + $VM_TOTAL_SPENT" | bc)
elif [[ "$VM_STATE" == "TERMINATED" ]]; then
  VM_DISK_SPENT=$(echo "scale=2; $VM_CREATE_HOURS * $VM_DISK_HOURLY" | bc)
  echo "  Status:     STOPPED (disk billed since creation)"
  echo "  Created:    $VM_CREATE"
  echo "  Disk:       ${VM_DISK_GB}GB"
  echo "  Spent:      \$${VM_DISK_SPENT} (disk only — compute paused)"
  TOTAL_HOURLY=$(echo "$TOTAL_HOURLY + $VM_DISK_HOURLY" | bc)
  TOTAL_SPENT=$(echo "$TOTAL_SPENT + $VM_DISK_SPENT" | bc)
else
  echo "  Status:     $VM_STATE"
fi
echo ""

# ---------------------------------------------------------------------------
# 3. Static IP
# ---------------------------------------------------------------------------
echo "--- Static IP ($STATIC_IP_NAME) ---"
IP_JSON=$(gcloud compute addresses describe "$STATIC_IP_NAME" \
  --region="$REGION" --project="$PROJECT" --format=json 2>/dev/null || echo '{}')

IP_STATUS=$(echo "$IP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','NOT_FOUND'))")
IP_ADDR=$(echo "$IP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('address','none'))")
IP_CREATE=$(echo "$IP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('creationTimestamp',''))")

if [[ "$IP_STATUS" == "IN_USE" ]]; then
  echo "  Status:  IN USE ($IP_ADDR) — FREE while attached to running VM"
  echo "  Spent:   \$0.00"
elif [[ "$IP_STATUS" == "RESERVED" ]]; then
  IP_HOURS=$(hours_since "$IP_CREATE")
  IP_SPENT=$(echo "scale=2; $IP_HOURS * $STATIC_IP_IDLE_PER_HR" | bc)
  echo "  Status:  RESERVED (idle — NOT attached)"
  echo "  Since:   $IP_CREATE (${IP_HOURS}h)"
  echo "  Rate:    \$${STATIC_IP_IDLE_PER_HR}/hr"
  echo "  Spent:   \$${IP_SPENT}"
  TOTAL_HOURLY=$(echo "$TOTAL_HOURLY + $STATIC_IP_IDLE_PER_HR" | bc)
  TOTAL_SPENT=$(echo "$TOTAL_SPENT + $IP_SPENT" | bc)
else
  echo "  Status:  $IP_STATUS"
fi
echo ""

# ---------------------------------------------------------------------------
# 4. Cloud Run
# ---------------------------------------------------------------------------
echo "--- Cloud Run ($SERVICE_NAME) ---"
CR_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT" --format='value(status.url)' 2>/dev/null || echo "NOT_FOUND")

if [[ "$CR_URL" != "NOT_FOUND" ]]; then
  echo "  Status:  DEPLOYED ($CR_URL)"
  echo "  Cost:    Pay-per-request — \$0.00/hr when idle (scales to zero)"
  echo "  Spent:   ~\$0.00 (negligible at demo traffic)"
else
  echo "  Status:  NOT FOUND"
fi
echo ""

# ---------------------------------------------------------------------------
# 5. Firebase Hosting
# ---------------------------------------------------------------------------
echo "--- Firebase Hosting ---"
echo "  Status:  Active (Spark free plan)"
echo "  Spent:   \$0.00"
echo ""

# ---------------------------------------------------------------------------
# 6. Cloud Build (triggered by Cloud Run source deploy)
# ---------------------------------------------------------------------------
echo "--- Cloud Build ---"
BUILD_COUNT=$(gcloud builds list --project="$PROJECT" --limit=100 --format="value(id)" 2>/dev/null | wc -l | tr -d ' ')
BUILD_MINUTES=$(gcloud builds list --project="$PROJECT" --limit=100 \
  --format="value(duration)" 2>/dev/null \
  | python3 -c "
import sys
total = 0
for line in sys.stdin:
    line = line.strip()
    if line and line != 'None':
        secs = int(line.rstrip('sS').split('.')[0]) if line.rstrip('sS').replace('.','').isdigit() else 0
        total += secs
print(f'{total // 60}m {total % 60}s')
print(total)
" 2>/dev/null || echo "0m 0s")
# Cloud Build: 120 free min/day, then $0.003/min (e2-medium)
echo "  Builds:  $BUILD_COUNT total"
echo "  Spent:   ~\$0.00 (120 free min/day covers demo usage)"
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
DAILY=$(echo "scale=2; $TOTAL_HOURLY * 24" | bc)
MONTHLY=$(echo "scale=2; $TOTAL_HOURLY * 730" | bc)

echo "==========================================="
echo "  COST SUMMARY"
echo "==========================================="
echo ""
echo "  Total spent to date:  \$$TOTAL_SPENT"
echo ""
echo "  Current burn rate:"
echo "    Per hour:   \$$TOTAL_HOURLY"
echo "    Per day:    \$$DAILY"
echo "    Per month:  \$$MONTHLY (if left running)"
echo ""
echo "==========================================="
echo ""
echo "To stop costs:"
echo "  VM:        ./deploy/teardown.sh --stop"
echo "  Cloud SQL: gcloud sql instances patch $INSTANCE_NAME --activation-policy=NEVER --project=$PROJECT"
echo "  Both:      Drops to ~\$0.08/day (disk+storage only)"
echo "  Full nuke: ./deploy/teardown.sh --delete"
echo ""
echo "Prices: us-central1 on-demand (cloud.google.com/compute/vm-instance-pricing)"
echo "Note: Cloud Run + Firebase + Cloud Build are effectively free at demo traffic."
