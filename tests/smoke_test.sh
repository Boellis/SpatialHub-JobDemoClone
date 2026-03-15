#!/bin/bash
set -e

# Smoke test for SpatialHub Docker stack
# Usage: ./tests/smoke_test.sh
# Prerequisites: docker compose up --build -d (stack must be running)

BIOSIM_URL="http://localhost:8009"
DJANGO_URL="http://localhost:8000"
FIXTURE_DIR="$(dirname "$0")/fixtures"
FIXTURE_FILE="${FIXTURE_DIR}/biosim_module_state.json"

echo "=== SpatialHub Docker Stack Smoke Test ==="
echo ""

# 1. Check all services are running
echo "[1/5] Checking Docker services..."
RUNNING=$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -c "running" || true)
if [ "$RUNNING" -lt 4 ]; then
  echo "FAIL: Expected 4 running services, found $RUNNING"
  docker compose ps
  exit 1
fi
echo "  OK: $RUNNING services running"

# 2. Check BioSim API is responding
echo "[2/5] Checking BioSim API..."
SIMS=$(curl -sf "${BIOSIM_URL}/api/simulation" 2>/dev/null)
if [ -z "$SIMS" ]; then
  echo "FAIL: BioSim API not responding at ${BIOSIM_URL}/api/simulation"
  exit 1
fi
echo "  OK: BioSim API responding"

# 3. Check BioSim has a running simulation and capture simID
echo "[3/5] Checking for running simulation..."
SIM_ID=$(echo "$SIMS" | python3 -c "import sys,json; ids=json.load(sys.stdin); print(ids[0] if ids else '')" 2>/dev/null)
if [ -z "$SIM_ID" ]; then
  echo "FAIL: No running simulation found. Response: $SIMS"
  exit 1
fi
echo "  OK: Simulation running with ID: $SIM_ID"

# 4. Capture live module state JSON as Phase 6 test fixture
echo "[4/5] Capturing BioSim module state fixture..."
mkdir -p "$FIXTURE_DIR"
curl -sf "${BIOSIM_URL}/api/simulation/${SIM_ID}" | python3 -m json.tool > "$FIXTURE_FILE"
if [ ! -s "$FIXTURE_FILE" ]; then
  echo "FAIL: Could not capture module state for simulation $SIM_ID"
  exit 1
fi
FIXTURE_SIZE=$(wc -c < "$FIXTURE_FILE" | tr -d ' ')
echo "  OK: Module state captured to ${FIXTURE_FILE} (${FIXTURE_SIZE} bytes)"

# 5. Check Django API is responding
echo "[5/5] Checking Django API..."
DJANGO_RESPONSE=$(curl -sf "${DJANGO_URL}/api/habitat/zones/" 2>/dev/null)
if [ -z "$DJANGO_RESPONSE" ]; then
  echo "FAIL: Django API not responding at ${DJANGO_URL}/api/habitat/zones/"
  exit 1
fi
echo "  OK: Django API responding"

echo ""
echo "=== ALL SMOKE TESTS PASSED ==="
echo "Fixture saved: ${FIXTURE_FILE}"
