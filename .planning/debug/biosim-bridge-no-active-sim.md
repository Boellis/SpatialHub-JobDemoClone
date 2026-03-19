---
status: diagnosed
trigger: "biosim_bridge management command reports 'No active simulation found' when running inside Docker Compose"
created: 2026-03-16T00:00:00Z
updated: 2026-03-16T00:00:00Z
---

## Current Focus

hypothesis: probe_sim_id hits a nonexistent /api/simulation/active endpoint; BioSim only exposes /api/simulation
test: Compare endpoint URLs across all three callers (frontend, bridge, import_log) and BioSim API docs
expecting: frontend uses /api/simulation, bridge and import_log use /api/simulation/active -- mismatch
next_action: CONFIRMED -- return diagnosis

## Symptoms

expected: Bridge connects to BioSim, discovers active simID, opens WebSocket, ingests ticks
actual: Bridge logs "No active simulation found" in a retry loop, never connects
errors: "[biosim_bridge] Connection lost (No active simulation found). Retry in 1s..."
reproduction: docker compose up; observe bridge logs
started: From first deployment of bridge service

## Eliminated

(none -- root cause found on first hypothesis)

## Evidence

- timestamp: 2026-03-16T00:01:00Z
  checked: BioSim API reference in docs/biosim-integration-research.md
  found: GET /api/simulation = "List active simulation IDs". No /api/simulation/active endpoint exists.
  implication: The bridge is calling a nonexistent endpoint

- timestamp: 2026-03-16T00:02:00Z
  checked: Frontend probeBioSim() in useSimSource.ts line 51
  found: Frontend calls GET ${BIOSIM_BASE_URL}/api/simulation (correct endpoint)
  implication: Frontend works because it uses the right URL

- timestamp: 2026-03-16T00:03:00Z
  checked: biosim_bridge.py probe_sim_id() line 40
  found: Bridge calls biosim_url + '/api/simulation/active' (wrong endpoint)
  implication: Bridge gets 404 or empty/error response, returns None, raises "No active simulation found"

- timestamp: 2026-03-16T00:04:00Z
  checked: biosim_import_log.py discover_sim_id() line 39
  found: Same bug -- also calls /api/simulation/active (wrong endpoint)
  implication: Both Django commands share the same incorrect endpoint

- timestamp: 2026-03-16T00:05:00Z
  checked: docker-compose.yml biosim healthcheck line 50
  found: Healthcheck uses "curl -sf http://localhost:8009/api/simulation" (no /active suffix)
  implication: The correct endpoint is /api/simulation everywhere else in the codebase

- timestamp: 2026-03-16T00:06:00Z
  checked: Response format handling in probe_sim_id
  found: Bridge handles {"simulations": [1]} and [1] shapes. BioSim GET /api/simulation returns a bare list [1]. This parsing is correct -- only the URL is wrong.
  implication: Once URL is fixed, the response parsing will work

- timestamp: 2026-03-16T00:07:00Z
  checked: docker-compose.yml bridge depends_on (lines 88-91)
  found: bridge depends on biosim with condition service_healthy. Healthcheck has start_period 90s, interval 15s, 6 retries.
  implication: Race condition is NOT the issue -- Docker waits for healthcheck to pass before starting bridge. By that time, the simulation startup command has already run.

## Resolution

root_cause: probe_sim_id() in biosim_bridge.py (and discover_sim_id() in biosim_import_log.py) call GET /api/simulation/active -- an endpoint that does not exist in BioSim's API. The actual endpoint is GET /api/simulation (no /active suffix). BioSim likely returns a 404, which aiohttp parses as non-JSON or an unexpected shape, causing probe_sim_id to return None. The bridge then raises RuntimeError("No active simulation found") and retries forever.
fix: (not applied -- research only)
verification: (not applied -- research only)
files_changed: []
