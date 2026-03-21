# Project Research Summary

**Project:** SpatialHub v4.0 — Mars Habitat TV Dashboard
**Domain:** Non-interactive 2.5D ambient TV dashboard layered onto existing React/R3F/Zustand IoT platform
**Researched:** 2026-03-21
**Confidence:** HIGH

## Executive Summary

This milestone adds a new `/tv` route to an already-shipped v3.0 application. The core data infrastructure (habitatStore, BioSim WebSocket pipeline, Pi sensor polling, Django Cloud Run backend) is complete and correct — v4.0 builds on it, never replaces it. The recommended approach is additive: one new page component, one new hook, five new TV-specific components, and a single npm install (`motion`). The existing R3F bundle, Zustand store, Recharts, and Sparkline components handle approximately 80% of what the TV dashboard needs.

The architecture is a proven pattern already present in the codebase: a fixed Three.js `<Canvas>` as background (`z-index: 0`) with a DOM priority grid on top (`z-index: 1`), mirroring HabitatView's Canvas + HUD overlay structure. The critical algorithmic work is a `usePriorityRanking` hook that derives a criticality-sorted zone order with hysteresis debounce — without this, sensor noise near threshold boundaries causes continuous grid thrashing. The FLIP animation (`motion` package) is a P2 enhancement, not a P1 requirement; the grid must be solid before animation is bolted on.

The top risks are all operational-mode hazards: R3F still running a raycaster on the TV canvas unless `events={null}` is set, Zustand cascading all-card re-renders unless per-zone selectors are used, GPU memory leaking over 8+ hour TV sessions unless Three.js objects are explicitly disposed, and BioSim reconnection failing in background-throttled browser contexts. Every one of these has a known, specific fix — they just must be applied proactively, not discovered after the fact.

---

## Key Findings

### Recommended Stack

The v4.0 stack is the v3.0 stack plus one package. Everything else is already installed and validated in production. The only net-new dependency is `motion@^12.x` (Framer Motion rebranded, MIT license) for FLIP grid reorder animation. Import from `"motion/react"` — not `"framer-motion"`. React 19 officially supported in v12.

Recharts (`^2.15.3`) handles per-zone live charts; disable `isAnimationActive` on `<Line>` after first mount to prevent animation-vs-data-tick collision (confirmed Recharts issue #5752). The parallax background reuses the existing R3F/Three.js bundle — second `<Canvas>` with no EffectComposer, no postprocessing.

**Core technologies:**
- `motion@^12.x` (NEW): FLIP animation for priority grid reordering — only library that handles CSS grid slot reassignment without manual transform math
- `@react-three/fiber@9.5` (existing): Parallax background canvas — proven with `position: fixed` + `alpha: true` pattern already in this codebase
- `zustand@5.0.11` (existing): Criticality sort selector via `selectZonesByPriority` — pure derivation, no store shape change
- `recharts@^2.15.3` (existing): Per-zone live charts — disable `isAnimationActive` on live data updates
- `three@0.183.2` (existing): Parallax geometry layers with `useFrame` sine-wave auto-drift

### Expected Features

**Must have (table stakes):**
- Non-interactive root — `pointer-events: none` on the `/tv` route; zero click/hover/scroll handlers anywhere in the tree
- Auto-sustaining data loop — `useSimSource` + `useLiveSensors` mounted on TV route; habitatStore ticks every 2s already
- Glanceable typography — minimum 28px labels, 48px+ zone names; `clamp()` with `vw` units for TV viewport scaling
- High-contrast status colors — solid borders/background washes, not subtle tints; green `#22c55e`, yellow `#eab308`, red `#ef4444`
- Priority-driven grid — hero card (rank 1, 2-col span) + 3 secondary cards; algorithmic, not static
- Live sensor readings per zone — big type, status-colored, top 2-3 sensors displayed
- Habitat status summary bar — "ALL SYSTEMS NOMINAL" or worst-case alert, full-width, color-coded
- Sol elapsed counter + connection source badge — mission narrative context, reuse existing store values

**Should have (differentiators):**
- Criticality scoring algorithm — `(red_count * 10) + (yellow_count * 3)`, pure client-side function, no backend
- Alert pulse animation on red cards — CSS `@keyframes` on card border; grabs attention without interaction
- Per-zone sparklines — `Sparkline.tsx` exists; wire `SensorReading.history` array
- FLIP reorder animation — zones slide into ranked positions on threshold crossing, debounced (P2, after grid validated)
- Three.js parallax background — sine-wave auto-drift geometry layers, `clock.elapsedTime`, no mouse input (P2)

**Defer (v4.x+):**
- Multiple TV layout presets (2-up, 4-up, single-zone focus)
- Kiosk mode URL param (`?zone=water-recycling` locks single zone)
- Second-screen split (TV overview + tablet drilldown — requires routing refactor)

### Architecture Approach

v4.0 is a route swap with an isolated component tree. `App.tsx` changes one lazy-import line to point at `TvDashboardView` instead of `HabitatView`. All data infrastructure (habitatStore, useSimSource, useLiveSensors, BioSim/Pi pipelines) is unchanged. The new TV component tree lives entirely in `components/tv/` and `hooks/usePriorityRanking.ts` — no existing files are modified except the single-line `App.tsx` swap.

**Major components:**
1. `TvDashboardView` (NEW page) — mounts data hooks, composes Canvas + grid; one-line `App.tsx` change activates it
2. `ParallaxBackground` (NEW R3F) — 2 depth planes with `useFrame` sine drift; no EffectComposer, no OrbitControls, `events={null}` on Canvas
3. `PriorityGrid` (NEW DOM) — CSS Grid driven by `usePriorityRanking` sorted array; maps index 0 to `HeroZoneCard`
4. `HeroZoneCard` / `ZoneCard` (NEW) — TV-specific cards; each subscribes only to its own zone via `selectZone(zoneId)`
5. `usePriorityRanking` (NEW hook) — derives criticality rank from store zones, applies 3-tick stability debounce before committing order change; lives in `hooks/` not in the store

### Critical Pitfalls

1. **R3F Canvas registers pointer events unconditionally** — pass `events={null}` to `<Canvas>`; remove `CameraController.tsx` entirely (not `enabled={false}` — that still registers listeners). No exceptions.
2. **Zustand `tick()` cascades all-card re-renders** — each `ZoneCard` must subscribe via `selectZone(zoneId)`, not the full `zones` object; `PriorityGrid` subscribes only to ranked IDs with `shallow` comparator.
3. **GPU memory leak over long sessions** — all Three.js objects in `useRef`; explicit `.dispose()` in `useEffect` cleanup; verify `renderer.info.memory.geometries` stays flat over 10 minutes in production build.
4. **Priority ranking thrashes near threshold boundaries** — require 3 consecutive ticks of stability (`REORDER_STABILITY_TICKS = 3`) before committing new rank order; must be in initial design, not a later fix.
5. **FLIP animation distorts card children during hero slot size change** — add `layout` prop to ALL direct children of animated `motion.div` containers (text, chart wrapper, status badge); use `layoutId` keyed to `zoneId`, never array index.

---

## Implications for Roadmap

The build order is dictated by hard dependencies: the ranking hook unlocks everything grid-related; the Canvas scaffold must address the raycaster pitfall before any rendering work begins; card components depend on both; FLIP animation is deliberately last; parallax is polish-only and ships last.

### Phase 1: Canvas Scaffold + Non-Interactive Foundation

**Rationale:** R3F event system misconfiguration is the highest-risk architectural mistake — it is invisible, costs performance, and becomes harder to fix once the full component tree is built. Establishing the correct Canvas setup (`events={null}`, no OrbitControls, no EffectComposer) as the first act removes this risk permanently. App.tsx route swap is a one-line change that can land here.
**Delivers:** `TvDashboardView` shell, `ParallaxBackground` with sine-wave drift, confirmed non-interactive Canvas, App.tsx route swap, GPU memory baseline verified flat
**Addresses:** Non-interactive requirement, auto-sustaining display loop
**Avoids:** R3F pointer event raycasting (Pitfall 1), EffectComposer overhead (Pitfall 3), OrbitControls event listener leaks

### Phase 2: Priority Ranking Hook + Store Adaptation

**Rationale:** `usePriorityRanking` with debounce is the unlock for all grid layout work. The `scenarioAnnouncements` cap and TTL must be addressed before TV mode ships — the store was designed for interactive sessions (minutes, one human); TV mode runs 8+ hours unattended. Both are pure logic changes with no UI risk.
**Delivers:** `usePriorityRanking` hook with 3-tick stability debounce, `scenarioAnnouncements` array length cap + TTL auto-dismiss, per-zone Zustand selector audit confirmed
**Addresses:** Criticality scoring algorithm, grid data foundation
**Avoids:** Priority thrashing (Pitfall 7), announcements array overflow (Pitfall 4), Zustand cascade re-renders (Pitfall 2)

### Phase 3: Zone Cards + Priority Grid (Static Layout)

**Rationale:** Build the grid without FLIP animation first. Lock in typography, status colors, sparklines, sensor display, and hero vs secondary card sizing. This is the core TV dashboard deliverable — judges can evaluate it at this phase without any animation work.
**Delivers:** `HeroZoneCard`, `ZoneCard`, `PriorityGrid` (CSS Grid, no animation yet), `ZoneSensorChart` (SVG, extends Sparkline), habitat status summary bar, Sol counter, connection badge, alert pulse CSS animation on red cards
**Uses:** Recharts with disabled-animation pattern, `Sparkline.tsx` pattern, TV typography scale, high-contrast status colors, per-zone Zustand selectors from Phase 2
**Implements:** Full static TV dashboard — all P1 features from FEATURES.md

### Phase 4: FLIP Animation + Long-Session Resilience

**Rationale:** Add Framer Motion FLIP only after the grid structure is validated. The child-distortion pitfall is a trap that is easy to miss until you witness it — it requires confirming `layout` on every card child element. Background throttling is a TV-specific concern that must be addressed before handing off for extended demo use.
**Delivers:** `motion.div layout` on `PriorityGrid` items, `layoutId="zone-{id}"` shared-element transition for hero promotion, BioSim probe moved to Worker or `visibilitychange` handler added, GPU memory 10-minute stability verification in production build
**Addresses:** FLIP reorder animation (P2 feature), long-session resilience
**Avoids:** FLIP child distortion (Pitfall 5), background tab throttling (Pitfall 6), GPU leak over 8+ hours (Pitfall 3 — re-verify after all R3F work complete)

### Phase 5: Three.js Parallax Polish

**Rationale:** Parallax is explicitly P2 — cosmetic enhancement only. Ships last, after all functionality is verified solid. Feature-flag with `?parallax=1` URL param to keep it out of the default TV view until reviewed and signed off.
**Delivers:** `ParallaxBackground` with final tuned layers (opacity, drift amplitude, Mars color palette `#c0501a`), feature flag, visual QA at 1920x1080 full-screen
**Addresses:** Three.js parallax background (P2 differentiator)

### Phase Ordering Rationale

- Canvas must come first because `events={null}` + no-OrbitControls is a foundation constraint, not an addendum
- Priority hook before grid because the grid's re-render strategy (per-zone selectors vs. full zones) is determined by how it consumes ranking output
- Static grid before animated grid because animation bugs are easier to isolate when layout is already correct
- FLIP before parallax because FLIP changes card sizing logic that parallax layers behind
- GPU disposal audit spans phases 1 and 4 — verify at scaffold, re-verify after all R3F work is complete

### Research Flags

Phases needing deeper research during planning:
- **Phase 4 (FLIP + Long-Session):** BioSim Worker probe refactor is a non-trivial change to `useSimSource.ts` — requires understanding the current Worker message protocol before estimating scope. Inspect `biosimWorker.ts` message format before speccing this work.

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1:** Canvas layering pattern is already proven in HabitatView; `events={null}` is documented R3F API; no unknowns
- **Phase 2:** Pure JS logic (array cap, debounce tick counter); no external API surface; no dependencies
- **Phase 3:** CSS Grid + Zustand selectors + SVG charts — all established patterns with direct codebase precedents
- **Phase 5:** Parallax config is tuning, not architecture; spec loosely and iterate visually

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All decisions verified against official docs and existing production codebase; `motion@12.x` React 19 support confirmed via official upgrade guide; no speculative choices |
| Features | HIGH | TV dashboard UX is a mature domain (Geckoboard, NOC display conventions); all integration points confirmed by direct codebase inspection; anti-features well-reasoned against real constraints |
| Architecture | HIGH | All findings from direct codebase inspection with explicit file paths; Canvas+overlay pattern already proven in HabitatView.tsx; build order derived from explicit dependency graph |
| Pitfalls | HIGH | All 7 critical pitfalls grounded in specific codebase evidence and upstream bug tracker references (Three.js #19917, #28355, Recharts #5752); no theoretical risks included |

**Overall confidence:** HIGH

### Gaps to Address

- **`motion` version pinning:** Pin to `motion@12.38.x` rather than `^12.x` for production build stability — React 19 concurrent feature behavior under `^` range is not stress-tested.
- **BioSim Worker probe refactor scope:** Moving the probe fetch into `biosimWorker.ts` requires understanding the current Worker message protocol. Inspect `biosimWorker.ts` during Phase 4 planning before estimating scope.
- **TV viewport resolution:** Research assumes 1920×1080. If wall-mounted display runs 4K, `clamp()` vw-based sizing may produce oversized typography. Verify actual TV resolution before final CSS values are locked in Phase 3.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `HabitatView.tsx`, `habitatStore.ts`, `useSimSource.ts`, `Sparkline.tsx`, `App.tsx`, `constants.ts`, `biosimMapper.ts`, `engine.ts`, `habitatStore.ts`, `useLiveSensors.ts`
- [Motion layout animations docs](https://motion.dev/docs/react-layout-animations) — `layout` prop FLIP, `layoutId` shared-element, React 19 support
- [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide) — `"motion/react"` import path, framer-motion compatibility
- [R3F Canvas docs](https://r3f.docs.pmnd.rs/api/canvas) — `events` prop, `style` prop positioning
- [Recharts issue #5752](https://github.com/recharts/recharts/issues/5752) — `isAnimationActive={false}` workaround for live data confirmed
- [Three.js issue #19917](https://github.com/mrdoob/three.js/issues/19917) — OrbitControls `enabled=false` does not remove event listeners
- [Three.js issue #28355](https://github.com/mrdoob/three.js/issues/28355) — WebGLProgram leak on scene recreation

### Secondary (MEDIUM confidence)
- [Geckoboard TV dashboard guide](https://www.geckoboard.com/best-practice/tv-dashboards/) — non-interactive requirements, ambient display conventions
- [AlertOps NOC dashboard examples](https://alertops.com/noc-dashboard-examples/) — priority and incident surfacing patterns
- [Smashing Magazine — Designing For TV (2025)](https://www.smashingmagazine.com/2025/09/designing-tv-principles-patterns-practical-guidance/) — 10-foot UI minimum font sizes
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) — timer throttling in backgrounded tabs
- [Three.js discourse — WebGL memory management](https://discourse.threejs.org/t/webgl-memory-management-puzzlers/24583)
- [Maxime Heckel — Framer Motion layout animations](https://blog.maximeheckel.com/posts/framer-motion-layout-animations/) — child scale distortion documented

### Tertiary (MEDIUM confidence)
- [R3F discussions #2923](https://github.com/pmndrs/react-three-fiber/discussions/2923) — canvas parallax approach confirmed viable
- [Codrops — Animating Grid with GSAP FLIP (Jan 2026)](https://tympanus.net/codrops/2026/01/20/animating-responsive-grid-layout-transitions-with-gsap-flip/) — FLIP grid reorder in production
- [InfluxData — Recharts + IoT Sensor Time Series](https://www.influxdata.com/blog/recharts-influxdb-tutorial-visualize-iot-sensor-data-reactjs/) — IoT charting update interval patterns

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
