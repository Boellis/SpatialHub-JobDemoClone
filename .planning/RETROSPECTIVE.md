# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

### Patterns Established
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

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~8 | 4 | First milestone — established R3F patterns, overlay architecture, anomaly state machine |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 0 | 0% | 1 (Zustand) |

### Top Lessons (Verified Across Milestones)

1. Build data infrastructure before visuals — eliminates dummy-data debugging
2. Small focused plans (1-2 tasks) execute 5-10x faster than large plans
3. Question every API endpoint: "Who calls this?" before building
