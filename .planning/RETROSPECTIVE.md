# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v3.0 — Physical Sensor Integration

**Shipped:** 2026-03-20
**Phases:** 7 | **Plans:** 11 | **Commits:** 73
**Timeline:** 3 days (2026-03-18 → 2026-03-20)

### What Was Built
- Django SensorIngestView endpoint with all-or-nothing batch validation + Pi hub_client.py with SQLite offline buffer
- Clean AtlasI2C driver rewrite — eliminated 4-char truncation bug that silently dropped pH precision for values >= 10.0
- Full GCP cloud deployment: Django on Cloud Run, frontend on Firebase Hosting, Cloud SQL PostgreSQL, BioSim on GCE VM
- Caddy reverse proxy with sslip.io auto-cert to solve HTTPS/WebSocket mixed-content block
- Pi-to-Cloud pipeline: real Atlas Scientific pH sensor → Cloud Run → Cloud SQL → Firebase frontend
- Closed-loop control service: pH divergence triggers Grey_Water_Store malfunction via BioSim REST API with hysteresis deadband
- 5th HUD badge state "BioSim + Real Sensor" (teal) with staleness tracking
- Competition package: COMPETITION_GUIDE.md (judge-facing) + DEPLOY_CHECKLIST.md (deployer-facing)

### What Worked
- **Mid-milestone pivot handled cleanly:** Discovered NASA competition required cloud deployment (not local Docker) at Phase 11. Replanned phases 11-16 without losing Phase 10 work. The hub_client.py just needed a different URL.
- **deploy.sh idempotent script:** Single script for Cloud SQL + Cloud Run + Firebase + GCE VM deployment. Re-runnable without side effects. Saved massive time during iterative debugging.
- **Caddy + sslip.io discovery:** The mixed-content HTTPS/WebSocket problem would have been a showstopper. Using sslip.io for auto-cert without buying a domain was elegant.
- **TDD for control_loop:** Writing tests first for the pH state machine (trigger/recover/hysteresis) caught edge cases before any deployment. 248-line management command worked on first VM deployment.
- **Phase 13 as surgical fix:** PI_HUB_ID mismatch was the only blocker for the full pipeline. One 3-min plan fixed it with a regression test guard. Small, focused plans continue to execute fastest.

### What Was Inefficient
- **DEPLOY-04 tracking gap:** Cloud SQL was provisioned and functional from Phase 11 onwards, but the requirement checkbox was never checked. Tracking overhead for infra that was obviously working.
- **No v2.0 milestone archive:** v2.0 BioSim Integration was shipped (2026-03-16) but never formally archived to `.planning/milestones/`. Historical gap — v2.0 exists only as a collapsed section in the v3.0 roadmap archive.
- **GCP project switch mid-deployment:** IAM issues with `interviewing-457222` forced a switch to `nasa-comp-demo`. The deploy script handled it, but the STATE.md accumulated stale GCP project references that could confuse future sessions.
- **Phase 12 took 90 min:** Longest plan execution in the milestone. Iterative VM deployment debugging (Docker install, firewall rules, Caddy config) is inherently slow with remote VMs. Not much to optimize — it's the nature of infra work.

### Patterns Established
- `deploy.sh` idempotent deployment with section numbering (1-15) for partial re-runs
- `teardown.sh --stop` (pause for cost) vs `--delete` (full cleanup) for VM lifecycle
- Caddy + sslip.io for HTTPS reverse proxy without custom domains
- `docker-compose.vm.yml` as VM-specific subset of the full compose (no local db/django)
- systemd service for Pi auto-start over cron @reboot
- Hysteresis deadband pattern: trigger at threshold, recover at threshold - 0.1
- `probe_sim_id` with retry+backoff instead of raising on missing BioSim sensor

### Key Lessons
1. **Cloud deployment reveals problems local Docker hides** — mixed-content blocks, CORS origins, CSRF trusted origins, Cloud SQL auth. Plan for 2x time on first cloud deploy.
2. **Idempotent deploy scripts pay for themselves immediately** — Every re-run saved 10+ minutes of manual gcloud commands.
3. **Mid-milestone pivots need phase replanning, not scope reduction** — The pivot from local Docker to cloud deployment was a bigger scope increase than expected but produced a dramatically better competition demo.
4. **TDD for state machines is non-negotiable** — The control_loop hysteresis edge cases would have been debugging nightmares without upfront test coverage.
5. **sslip.io is the answer to "I need HTTPS but don't want to buy a domain"** — File this for any future project needing quick TLS on a raw IP.

### Cost Observations
- Model mix: ~50% sonnet (execution), ~40% opus (planning, milestone ops), ~10% haiku
- Sessions: ~6 across 3 days
- Notable: Phase 10 (3 plans) and Phase 13 (1 plan, 3 min) had the best effort-to-value ratios. Infra phases (11, 12) dominated wall-clock time.

---

## Milestone: v1.0 — Mars Habitat Demo

**Shipped:** 2026-03-14
**Phases:** 4 | **Plans:** 10 | **Tasks:** 19

### What Was Built
- Django HabitatZone API + fixed legacy `/api/api/` path bug
- Client-side simulation engine: 12 sensors, 4 zones, Brownian drift + sol cycle + noise
- R3F 3D habitat with 4 procedural domes, selective bloom, and mission-control dark aesthetic
- Smooth camera transitions, hover highlights, sensor orb tooltips
- ZonePanel with live readings + sparkline charts, HabitatHUD glassmorphism overlay, AlertBanner toast system
- Anomaly simulation: 4 crisis scenarios with onset/peak/recovery state machine and AnomalyDrawer UI

### What Worked
- **Data-first approach:** Building simulation engine before any visuals meant every 3D component had real data from day one. Zero "dummy data" debugging.
- **Phase dependency ordering:** Each phase built cleanly on the previous. Phase 2 consumed Phase 1's store, Phase 3 consumed Phase 2's scene, Phase 4 consumed everything. No circular dependencies.
- **R3F ecosystem compatibility:** fiber@9.5/drei@10.7/postprocessing@3.0/three@0.183 installed cleanly with React 19 — no `--legacy-peer-deps` needed.
- **Zustand as R3F/HTML bridge:** Single store shared between Canvas scene graph and DOM overlay worked perfectly. No prop drilling across the Canvas boundary.
- **Gap closure pattern (Phase 2.04):** When UAT found the sensor orb tooltip regression, a dedicated decimal plan captured the fix with full context. Clean process for mid-phase discoveries.
- **Selective bloom via emissive threshold:** Rim rings bloom, dome bodies stay crisp. One parameter (`luminanceThreshold=0.8`) achieved cinematic quality.

### What Was Inefficient
- **Django endpoint never consumed:** Built `fetchHabitatZones()` + full API endpoint in Phase 1, then Phase 2+ used `constants.ts` exclusively. The API is dead code for the demo. Should have questioned whether the frontend would actually call the API during Phase 1 planning.
- **SUMMARY frontmatter gaps:** 03-02-SUMMARY.md shipped with empty `requirements_completed`. Caused "partial" status in audit for UI-02/UI-03 despite being fully implemented. Frontmatter should be validated during plan completion.
- **VERIFICATION.md written before UAT (Phase 2):** Original Phase 2 verification was authored before the UAT run discovered the tooltip regression. Required a re-verification. Verification should always happen after UAT.
- **No test framework:** Entire milestone relies on manual verification + TypeScript compilation. The project has no automated tests for any of the 3,587 LOC. This is a debt decision, not an oversight — but it means regressions are invisible.

### What Was Inefficient
- HTML overlay as Canvas sibling with `pointer-events: none` container + `pointer-events: auto` children
- CSS keyframe injection via DOM `<style>` tag to survive Tailwind purging
- Alert cooldown using `Map` ref (not state) to prevent re-render cascade at tick frequency
- `useFrame` lerp factor 0.04 for ~1s ease-out camera transitions without animation libraries
- `raycast={() => {}}` no-op to make meshes invisible to R3F pointer events
- Dynamic import in `startSimulation()` to break circular store→engine→store dependency
- Anomaly state machine: onset→peak→recovery→idle with biasFactor lerp

### Key Lessons
1. **Question API endpoints during planning** — "Who calls this?" should be answered before building backend work for a frontend demo.
2. **Verification after UAT, not before** — Writing verification reports before human testing creates false confidence.
3. **Zustand selectors per-instance beat aggregate selectors** — `selectZone(zoneId)` used everywhere; `selectAllZoneStatuses()` never called. Design for actual consumption patterns.
4. **Procedural geometry beats GLTF for demo speed** — No modeling tools, no asset pipeline, still achieved cinematic result. Good decision.
5. **R3F ecosystem maturity** — The React Three Fiber stack is production-ready for React 19. Clean install, good TypeScript support, performant rendering.

### Cost Observations
- Model mix: ~60% sonnet (execution, verification), ~30% opus (planning, audit), ~10% haiku (quick checks)
- Sessions: ~8 across 5 days
- Notable: Plans 02-03 and 02-04 executed in 4min and 1min respectively — fastest plans in the milestone. Small, focused plans execute dramatically faster.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Days | Key Change |
|-----------|----------|--------|------|------------|
| v1.0 | ~8 | 4 | 5 | Established R3F patterns, overlay architecture, anomaly state machine |
| v2.0 | ~4 | 5 | 2 | BioSim integration, Docker stack, WebSocket live data — fastest milestone |
| v3.0 | ~6 | 7 | 3 | Cloud deployment pivot, real hardware integration, competition packaging |

### Cumulative Quality

| Milestone | Tests | Coverage | New Dependencies |
|-----------|-------|----------|-----------------|
| v1.0 | 0 | 0% | 1 (Zustand) |
| v2.0 | 0 | 0% | 0 (BioSim via Docker API) |
| v3.0 | 72+ | Partial (Django ingest, control_loop, frontend hooks) | 0 |

### Top Lessons (Verified Across Milestones)

1. Build data infrastructure before visuals — eliminates dummy-data debugging
2. Small focused plans (1-2 tasks) execute 5-10x faster than large plans
3. Question every API endpoint: "Who calls this?" before building
4. TDD for state machines and API endpoints catches edge cases before deployment
5. Idempotent deploy scripts pay for themselves on second run
6. Mid-milestone pivots need phase replanning, not scope reduction
