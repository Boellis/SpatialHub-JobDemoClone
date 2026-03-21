# Feature Research

**Domain:** Non-interactive ambient TV dashboard — priority-driven grid, live sensor charts, Three.js parallax depth
**Researched:** 2026-03-21
**Confidence:** HIGH (TV dashboard UX is a mature pattern; parallax + FLIP are well-documented; existing codebase well-understood)

---

## Context: What Already Exists (Do Not Rebuild)

v3.0 shipped a complete cloud-deployed stack with real Pi sensor integration. Before evaluating new features, document the baseline to avoid redundant work.

**Inherited and reusable for v4.0:**
- `useHabitatStore` (Zustand) — ticks every 2s with zone statuses, sensor readings, history arrays
- `Sparkline.tsx` — takes a `data: number[]` prop; drop directly into TV zone cards
- `ConnectionBadge.tsx` — `simSource` state already in store; reuse badge on TV HUD
- `AlertBanner.tsx` — adapt or replace with a simpler status bar
- `simulation/constants.ts` — `ZONE_CONFIGS` + `BIOSIM_SENSOR_THRESHOLDS` feed criticality scoring
- Three.js / R3F bundle — already in the project; parallax layer reuses this bundle, no new dep
- `useSimSource.ts` / `useLiveSensors.ts` — must be mounted on the TV route to keep the store ticking

**What v4.0 introduces:**
- New `/tv` route — non-interactive, full-viewport, TV-optimized display
- Criticality scoring function — pure function over `ZoneState`; no backend needed
- Priority grid layout — hero card + secondary cards; driven by score sort
- FLIP reorder animation — zones slide into ranked positions on status threshold crossings
- Three.js parallax background — separate `<Canvas>` behind the grid, auto-drift sine curves

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features any ambient monitoring TV dashboard must have. Missing these and it reads as unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Zero-interaction requirement | TV dashboards that require clicks, scroll, or hover are broken by definition | LOW | `pointer-events: none` on the root container. Remove all cursor, hover, click, touch handlers from the `/tv` route. |
| Auto-refresh / self-sustaining data loop | Ambient displays must update indefinitely without operator action | LOW | `useHabitatStore` ticks every 2s already. Mount `useSimSource` and `useLiveSensors` on the TV route — no new plumbing. |
| Glanceable typography — 24px+ labels, 48px+ primary values | Standard TV viewing distance is ~3m; text below ~22px is unreadable from across the room | LOW | `clamp(1.5rem, 3vw, 3rem)` for labels; `clamp(2.5rem, 5vw, 5rem)` for values. Pure CSS, no new libs. |
| High-contrast status colors | Viewer must parse zone health in under 1 second from 3m away | LOW | Use solid color borders or background washes — not subtle tints. Green `#22c55e`, yellow `#eab308`, red `#ef4444` at high opacity. |
| Status-colored zone cards | Each card immediately identifiable as nominal / warning / critical | LOW | `border-color` + `box-shadow` driven by `zone.status`. |
| Live sensor readings per zone | The whole point is to show real numbers updating | LOW | `SensorReading.value` from habitatStore. Render top 2-3 sensors per zone with unit labels. |
| Continuous loop with no dead states | No spinners, error screens, or empty cards visible on the wall | MEDIUM | Fallback to client-side sim already implemented — must stay active on `/tv` route. Initialize store before render. |
| Priority-driven layout | Most critical zone occupies the largest slot; self-organizes without operator input | MEDIUM | Core v4.0 differentiator. Sort zones by criticality score each tick. Hero = rank 1, secondary = ranks 2-4. |

### Differentiators (Competitive Advantage)

Features that make this dashboard worth looking at, not just functional.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Criticality scoring algorithm | Zones ranked by deterministic score — not arbitrary ordering | MEDIUM | Pure function: `(red_count * 10) + (yellow_count * 3)`. Tie-break by zone index for stable sort. No backend. Runs client-side on each tick. |
| Hero slot reordering with FLIP animation | Zones visibly slide into their ranked positions when criticality changes — dramatic, informative | MEDIUM | Framer Motion `layout` prop handles FLIP automatically on a `motion.div`. Debounce reorder: only trigger when a zone crosses a status threshold AND >10s since last reorder. Prevents visual churn. |
| Three.js parallax background layer | A living, cinematic depth layer behind the grid — gives the dashboard spatial quality matching the 3D habitat above it | MEDIUM | Separate `<Canvas>` with `position: fixed`, `z-index: 0`, `pointer-events: none`, `alpha: true`. Floating geometry (simple toruses or particles) on slow sine-curve drift. Reuses existing R3F bundle. Auto-drift only — no mouse input. |
| Per-zone sparkline history | Trend context alongside the live reading — proves the data is actually moving over time | MEDIUM | `Sparkline.tsx` already exists. Wire `SensorReading.history` (last 60 points). Render for the primary sensor per zone. |
| Sol elapsed counter in HUD | Maintains the Mars mission narrative on the TV display | LOW | `solElapsed` from habitatStore. Large clock-style header: "SOL 47". Already available. |
| Habitat status summary bar | Single line: "ALL SYSTEMS NOMINAL" or "2 ZONES WARNING — WATER RECYCLING CRITICAL" | LOW | Derive worst-case status across all zones. Full-width banner, color matches worst status. High contrast, large type. |
| Alert pulse animation on critical zones | Red-status cards grab attention via animation, not just color | LOW | CSS `@keyframes` on card border/background for `status === 'red'`. Same DOM injection pattern already used in the 3D scene for alert states. |
| Connection + data source badge | "BIOSIM LIVE" / "PI SENSOR" / "CLIENT SIM" — judges see immediately what data source is active | LOW | `simSource` already in store. Small corner badge in the HUD. Reuse `ConnectionBadge.tsx` directly. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Mouse-driven parallax | Looks impressive in portfolio demos | On a TV display nobody is moving the mouse — the effect never triggers. Also violates the non-interactive contract. | Sine-wave auto-drift camera animation. Always running, never requires input. |
| Click-to-drill-down on zone cards | "Users want detail" | There is no user — it's a wall display. Drilldown belongs on `/habitat`, not `/tv`. | Keep zone detail on the existing `/habitat` route. The TV route is read-only. |
| 1-second chart update interval | "More live = better" | Repainting 4+ charts every second causes visible jank at TV resolution. CPU cost with no perceptible benefit. | 5s chart repaint. Data is still live; the chart just does not flicker constantly. |
| Animated number counters (count-up/count-down) | Eye-catching | Mid-animation numbers are unreadable from 3m. Creates confusion between "the current value" and "animating toward current value". | Instant value swap with a brief background flash to signal the update. |
| Glassmorphism on all cards | Matches the existing `/habitat` aesthetic | At TV viewing distance, glass effects reduce contrast significantly. "Sleek at 60cm" becomes "muddy at 3m". | Solid or lightly-frosted dark card backgrounds with strong border accents. Reserve glassmorphism for the HUD bar only. |
| Continuous layout reorder on every tick | "Maximally responsive to data" | Zones sliding every 2s are visually exhausting and make it impossible to track any single zone. | Debounce: only reorder when a zone crosses a status threshold AND the order has not changed in the last 10s. |
| Direct BioSim WebSocket on the TV route | "Lowest latency data source" | Adds another open WebSocket connection. The TV route does not need lower latency than `habitatStore` already provides via its 2s tick. | Read from `habitatStore` (Zustand). Existing BioSim WS feeds the store — TV route just subscribes. |
| AnomalyDrawer on the TV route | Seems useful for demos | Breaks the non-interactive contract. TV route is observation only. | Leave AnomalyDrawer on `/habitat`. Wire a demo from that route, then switch the browser tab to `/tv` for the ambient view. |

---

## Feature Dependencies

```
[Criticality Scoring Algorithm]
    └──required by──> [Hero Slot Reordering]
                          └──required by──> [FLIP Layout Animation (Framer Motion)]

[habitatStore (existing)]
    └──feeds──> [Zone Cards with Live Readings]
    └──feeds──> [Per-Zone Sparklines]
    └──feeds──> [Habitat Status Summary Bar]
    └──feeds──> [Sol Elapsed Counter]
    └──feeds──> [Connection Source Badge]
    └──feeds──> [Criticality Scoring Algorithm]

[Three.js / R3F bundle (existing)]
    └──reused by──> [Parallax Background Layer]
                        └──isolates to──> [Separate <Canvas>, z-index: 0]

[Alert Pulse Animation]
    └──depends on──> [Status-Colored Zone Cards]

[FLIP Layout Animation]
    └──conflicts with──> [Continuous Layout Reorder Anti-Feature]
    └──requires──> [framer-motion package install]

[useSimSource + useLiveSensors (existing hooks)]
    └──must mount on──> [/tv route to keep habitatStore ticking]
```

### Dependency Notes

- **Criticality scoring is the unlock for the hero layout.** It is a pure function — no state, no backend, no new deps. Build this first.
- **FLIP animation requires Framer Motion.** Not currently in the project. `framer-motion` (`motion` package). The `layout` prop on a `motion.div` is the simplest correct solution — handles FLIP automatically. Alternative is `animate-css-grid` (lighter, no React opinions) but Framer Motion is cleaner with React 19.
- **Parallax Canvas must be isolated.** Must be a separate `<Canvas>` from `/habitat`. Shared Canvas creates depth + postprocessing conflicts with the bloom pipeline. Use `position: fixed`, `z-index: 0`, `pointerEvents: none`, `alpha: true` on the renderer.
- **TV route must mount the simulation hooks.** `useSimSource` and `useLiveSensors` drive the store tick. Without them mounted, the store is static. These are already written — just mount them in the TV page component.
- **Sparklines use existing `SensorReading.history`.** The history array on each `SensorReading` already accumulates. `Sparkline.tsx` just needs to be wired to the primary sensor's history array per zone. No new state.
- **AnomalyDrawer must NOT render on `/tv`.** The component has side effects (keyboard shortcuts, click handlers). Do not import it on the TV route.

---

## MVP Definition

This is a new route on an existing product. "MVP" means: minimum that makes the TV dashboard feel complete and impressive to a judge watching from across the room.

### Launch With (v4.0)

- [ ] New `/tv` route — non-interactive, full-viewport, dark mission-control aesthetic
- [ ] Priority grid layout — 1 hero card (large, 2-col span) + 3 secondary cards
- [ ] Criticality scoring function — zones rank by red/yellow sensor count
- [ ] Live sensor values per zone card — big typography, status-colored
- [ ] Habitat status summary bar — "ALL NOMINAL" / worst-case alert with color
- [ ] Sol elapsed counter in HUD
- [ ] Alert pulse animation on red-status cards
- [ ] Per-zone sparkline — last 60 readings from existing history arrays
- [ ] Connection source badge (BIOSIM / PI SENSOR / CLIENT SIM)

### Add After Validation (v4.x)

- [ ] FLIP animation on zone reorder — add after grid structure is validated. Requires `framer-motion`. Trigger: first demo review. Debounce 10s.
- [ ] Three.js parallax background — add last. Purely cosmetic; only worth the complexity if the grid itself is solid. Consider feature-flagging with a URL param (`?parallax=1`).

### Future Consideration (v5+)

- [ ] Multiple TV layout presets (2-up, 4-up equal grid, single-zone focus mode)
- [ ] Kiosk URL param (`?zone=water-recycling` locks to one zone, full-screen)
- [ ] Second-screen split: TV shows overview, tablet shows drilldown — requires routing refactor

---

## Feature Prioritization Matrix

| Feature | Viewer Value | Implementation Cost | Priority |
|---------|-------------|---------------------|----------|
| Non-interactive constraint (`pointer-events: none`) | HIGH | LOW | P1 |
| Priority grid layout (hero + 3 secondary) | HIGH | MEDIUM | P1 |
| Criticality scoring algorithm | HIGH | MEDIUM | P1 |
| Live sensor values, big typography | HIGH | LOW | P1 |
| Status-colored cards | HIGH | LOW | P1 |
| Alert pulse animation on red cards | HIGH | LOW | P1 |
| Habitat status summary bar | HIGH | LOW | P1 |
| Sol elapsed counter + connection badge | MEDIUM | LOW | P1 |
| Per-zone sparklines | MEDIUM | LOW | P1 |
| Debounced reorder (10s cooldown) | HIGH | LOW | P1 — must ship with FLIP |
| FLIP reorder animation (Framer Motion) | MEDIUM | MEDIUM | P2 |
| Three.js parallax background | MEDIUM | MEDIUM | P2 |
| Kiosk mode / layout presets | LOW | MEDIUM | P3 |

**Priority key:** P1 = v4.0 launch, P2 = v4.x after validation, P3 = future milestone

---

## Reference: Ambient TV Dashboard Conventions

Standards from Geckoboard, Grafana kiosk mode, and NOC operations displays.

| Convention | Standard Practice | This Project |
|------------|-------------------|--------------|
| Non-interactive | Read-only; no click, scroll, hover | `pointer-events: none` root |
| Auto-refresh | Polling or push; no operator action | habitatStore 2s tick (already exists) |
| Typography scale | 24px+ labels, 48px+ primary values at 3m | `clamp()` with `vw` units |
| Status color density | High contrast — not subtle tints | Solid border + bg wash, 90%+ opacity |
| Priority / hero slot | Typically static layout | Algorithmic — unique differentiator |
| Ambient depth / motion | Rare; mostly static | Three.js sine drift (differentiator, P2) |
| Chart history window | 5-30 min typical | 60-point buffer (~2 min at 2s tick) |
| Mission narrative | N/A in commercial tools | Sol count, zone names, Mars aesthetic |

---

## Existing Code to Reuse

| Asset | Reuse in v4.0 |
|-------|---------------|
| `useHabitatStore` | Primary data source — `zones`, `solElapsed`, `simSource` |
| `Sparkline.tsx` | Drop into zone cards with `SensorReading.history` |
| `AlertBanner.tsx` | Adapt for habitat status bar (or replace with simpler version) |
| `ConnectionBadge.tsx` | Reuse directly in TV HUD |
| `useSimSource.ts` / `useLiveSensors.ts` | Mount on TV route to keep store ticking |
| `simulation/constants.ts` | `ZONE_CONFIGS` threshold data for criticality scoring |
| `BIOSIM_SENSOR_THRESHOLDS` | Threshold context when BioSim is data source |
| Three.js / R3F bundle | Parallax background `<Canvas>` (separate from `/habitat` scene) |

---

## Sources

- [Geckoboard — Ultimate guide to TV dashboards](https://www.geckoboard.com/best-practice/tv-dashboards/) — table stakes and non-interactive requirements
- [Fugo — The World of TV Dashboards](https://www.fugo.ai/blog/the-world-of-tv-dashboards/) — ambient information surfacing conventions
- [AlertOps — 10 Best NOC Dashboard Examples (2025)](https://alertops.com/noc-dashboard-examples/) — priority and incident surfacing patterns
- [Motion (Framer Motion) — Layout Animations](https://motion.dev/docs/react-layout-animations) — FLIP via `layout` prop
- [animate-css-grid (GitHub)](https://github.com/aholachek/animate-css-grid) — FLIP alternative without Framer Motion
- [Codrops — Animating Responsive Grid Transitions with GSAP FLIP (Jan 2026)](https://tympanus.net/codrops/2026/01/20/animating-responsive-grid-layout-transitions-with-gsap-flip/) — FLIP grid reordering in production
- [Bram.us — Animate CSS Grid with View Transition API](https://www.bram.us/2023/05/09/rearrange-animate-css-grid-layouts-with-the-view-transition-api/) — CSS-native grid animation
- [Android TV Typography Guidelines](https://developer.android.com/design/ui/tv/guides/styles/typography) — 22px minimum at 3m baseline
- [MediaSignage — Typography and Viewing Distance Guide](https://digitalsignage.com/digital_signage/docs/guides/typography-viewing-distance/) — formula: text height (cm) = distance (m) × 0.84
- [InfluxData — Recharts + IoT Sensor Time Series](https://www.influxdata.com/blog/recharts-influxdb-tutorial-visualize-iot-sensor-data-reactjs/) — IoT charting update interval patterns
- [pmndrs/react-three-fiber — Parallax in Canvas discussion](https://github.com/pmndrs/react-three-fiber/discussions/2923) — R3F transparent canvas overlay approach
- Existing codebase: `habitatStore.ts`, `Sparkline.tsx`, `ConnectionBadge.tsx`, `constants.ts` — integration surface confirmed HIGH confidence

---

*Feature research for: SpatialHub v4.0 — Non-interactive 2.5D Ambient TV Dashboard*
*Researched: 2026-03-21*
