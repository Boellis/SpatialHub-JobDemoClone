#!/usr/bin/env bash
#
# set-control-password.sh — set (or rotate) the web control-panel password.
#
# This is the ONLY thing you need to manage the controls. It updates a single Cloud
# Run env var (SURVIVAL_CONTROL_TOKEN). It does NOT touch the MCP relay token, so the
# Claude pilot keeps working and you never edit .mcp.json or restart Claude Code.
#
# Usage:
#   ./deploy/set-control-password.sh mySecretWord     # set a password you choose
#   ./deploy/set-control-password.sh                  # generate a random one
#
# After it runs: open the Survival tab, hit 🔒 Lock if already unlocked, then Unlock
# with the new password. The old password stops working immediately.
#
set -euo pipefail

PROJECT="nasa-comp-demo"
SERVICE="spatialhub-backend"
REGION="us-central1"

PW="${1:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')}"

echo "Setting control password on ${SERVICE} ..."
gcloud run services update "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --update-env-vars "SURVIVAL_CONTROL_TOKEN=${PW}" >/dev/null

echo ""
echo "✅ Control password set to:  ${PW}"
echo ""
echo "Unlock at https://${PROJECT}.web.app/survival (Mission Control → Unlock)."
echo "The MCP pilot is unaffected — no .mcp.json change, no Claude Code restart."
echo "Note: this restarts the service, so the live dashboard run blanks until the"
echo "next telemetry publish (the run itself is fine)."
