# Phase 14: Closed-Loop Control Service - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A Django management command (`control_loop`) running on the GCE VM reads the latest real Pi pH and BioSim simulated pH from Cloud SQL every 10 seconds, posts a `Grey_Water_Store` malfunction to BioSim when divergence exceeds the threshold, and deletes it when pH normalizes. The causal chain (real pH drifts -> zone turns red -> water recycling degrades) is observable end-to-end in the 3D habitat on Firebase. No frontend changes (Phase 15), no new sensor types.

</domain>

<decisions>
## Implementation Decisions

### Divergence threshold
- Default threshold: **0.5 pH units** — configurable via `PH_THRESHOLD` env var
- Real Atlas Scientific sensors have ~0.02 noise floor; BioSim pH proxy ranges ~6.0-7.5 — 0.5 is responsive without being twitchy
- Threshold readable from env var so it can be tuned without code changes during demo prep

### Recovery logic
- **Hysteresis with 0.1 deadband** — trigger malfunction at threshold (0.5), clear at threshold minus deadband (0.4)
- Prevents flapping when pH hovers near the boundary during demo
- Recovery is automatic: DELETE malfunction when fresh Pi pH shows divergence below recovery threshold
- No manual intervention needed — matches success criteria "recovers automatically"

### Stale data handling
- Pi data older than **60 seconds** (6 missed 10s polls) treated as stale — "no data" state
- Stale data: do NOT trigger new malfunctions (can't trust old readings)
- Stale data: do NOT auto-clear existing malfunctions (something was wrong, hold state until fresh data confirms recovery)
- Only act (trigger or clear) on fresh readings — conservative approach
- Staleness cutoff configurable via `STALE_SECONDS` env var (default 60)

### Logging & observability
- **State-change logging only** — malfunction triggered, malfunction cleared, Pi data went stale, Pi data resumed
- **Heartbeat every 60 seconds** (6 loops) — "control_loop alive, Pi pH=X, BioSim pH=Y, divergence=Z, state=normal/malfunction/stale"
- Stdout via `self.stdout.write()` — visible in `docker compose logs control_loop`
- No status endpoint, no Cloud SQL logging — overkill for a competition demo

### Claude's Discretion
- Internal state machine implementation (enum vs simple booleans)
- Exact malfunction intensity/length values (SEVERE_MALF/TEMPORARY_MALF matches existing AnomalyDrawer pattern)
- Error handling for BioSim API failures (retry vs skip cycle)
- Whether to store malfunction_id in memory or re-query BioSim
- asyncio vs synchronous implementation (biosim_bridge uses asyncio, but control_loop's DB reads + HTTP POST may not need it)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### BioSim malfunction API
- `spatialhub-frontend/src/simulation/biosimMalfunctions.ts` — POST/DELETE malfunction API contract, module names, intensity/length enums
- `spatialhub-frontend/src/simulation/biosimMapper.ts` — BioSim module hierarchy and sensor mapping

### Management command pattern
- `django_backend/sensor_data/management/commands/biosim_bridge.py` — Async management command template: probe_sim_id(), retry with backoff, Cloud SQL writes via ORM
- `django_backend/sensor_data/biosim_ingest.py` — BioSim tick-to-rows mapping, shows `wr-ph` sensor derivation (Grey_Water_Store level/capacity * 1.5 + 6.0)

### Data model
- `django_backend/sensor_data/models.py` — EnrichedSensorData model (hub_id, sensor_id, sensor_val, datetime fields used for pH queries)

### VM deployment
- `docker-compose.vm.yml` — GCE VM compose file where control_loop service will be added alongside bridge

### Requirements
- `.planning/REQUIREMENTS.md` — CTRL-01 through CTRL-04 define success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `biosim_bridge.py`: Management command with async loop, `probe_sim_id()` for simID discovery, exponential backoff retry — control_loop reuses probe_sim_id and the retry pattern
- `biosimMalfunctions.ts`: Shows exact BioSim malfunction API: POST `{url}/api/simulation/{simId}/modules/{moduleName}/malfunctions` with `{intensity, length}` returns `{malfunctionID}`; DELETE `{url}/api/simulation/{simId}/modules/{moduleName}/malfunctions/{malfunctionId}`
- `biosim_ingest.py`: Shows `wr-ph` derivation formula and `HUB_ID = 'biosim-habitat-01'` constant

### Established Patterns
- Management commands in `sensor_data/management/commands/` — Django BaseCommand with `handle()` entry point
- `BIOSIM_URL = os.environ.get('BIOSIM_URL', 'http://biosim:8009')` — env var with Docker-network default
- Cloud SQL connection via `DB_HOST`/`DB_PASS`/`DB_NAME`/`DB_USER` env vars in docker-compose.vm.yml
- `restart: unless-stopped` on all VM services

### Integration Points
- `docker-compose.vm.yml`: Add `control_loop` service — same Django image, `command: ["python", "manage.py", "control_loop"]`, depends_on biosim healthy
- Cloud SQL query: `EnrichedSensorData.objects.filter(hub_id=X, sensor_id=Y).order_by('-datetime').first()` for latest readings
- BioSim REST API at `http://biosim:8009` (Docker network, same as bridge uses)
- `probe_sim_id()` from biosim_bridge.py can be extracted to shared utility or duplicated (it's 15 lines)

</code_context>

<specifics>
## Specific Ideas

- The demo moment: judge dips pH sensor in vinegar (pH ~2.4), divergence from BioSim's ~6.5-7.0 is massive (4+ units), habitat zone turns red within ~10s. Rinse in water, pH normalizes, zone recovers. That's the "wow."
- Control loop should feel invisible — no setup, no config, just works when the VM starts
- `probe_sim_id()` is needed to discover the active BioSim simulation ID before making malfunction API calls — same discovery pattern as biosim_bridge

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-closed-loop-control-service*
*Context gathered: 2026-03-20*
