#!/usr/bin/env bash
# Reproducible setup for the biosim MCP server.
# Creates a Python 3.10+ virtualenv and installs deps. Safe to re-run.
#
#   ./mcp_biosim/setup.sh            # auto-detect newest python3.1x
#   PYTHON=python3.12 ./mcp_biosim/setup.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PY="${PYTHON:-}"
if [[ -z "$PY" ]]; then
  for c in python3.14 python3.13 python3.12 python3.11 python3.10; do
    if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
  done
fi
[[ -n "$PY" ]] || { echo "ERROR: need Python 3.10+ on PATH (or set PYTHON=...)."; exit 1; }

echo "Using $("$PY" --version) at $(command -v "$PY")"
"$PY" -m venv "$HERE/.venv"
"$HERE/.venv/bin/pip" install --upgrade pip >/dev/null
"$HERE/.venv/bin/pip" install -r "$HERE/requirements.txt"

echo ""
echo "Setup complete. Run the tests:"
echo "  $HERE/.venv/bin/python -m pytest mcp_biosim/tests -q"
echo ""
echo "Register with Claude Code, either:"
echo "  cp .mcp.json.example .mcp.json        # project-scoped, then restart Claude Code"
echo "or:"
echo "  claude mcp add biosim -- $HERE/.venv/bin/python $HERE/server.py"
