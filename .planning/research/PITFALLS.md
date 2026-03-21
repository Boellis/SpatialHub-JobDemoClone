# Pitfalls Research

**Domain:** Non-interactive 2.5D ambient TV dashboard — converting from interactive R3F 3D scene
**Project:** SpatialHub Mars Habitat Demo v4.0
**Researched:** 2026-03-21
**Confidence:** HIGH — all critical pitfalls grounded in codebase-specific evidence + verified external sources

> This file supersedes the v3.0 pitfalls (Pi hardware, I2C, closed-loop control) and focuses on the v4.0 concerns: replacing an interactive 3D scene with a non-interactive ambient TV dashboard with priority-driven grid layout, Three.js parallax depth, and long-running session resilience.

---

## Critical Pitfalls

### Pitfall 1: R3F Canvas Still Registers Pointer Events After Removing Interaction

**What goes wrong:**
React Three Fiber v9 (in use: `@react-three/fiber@9.5`) registers `pointermove`, `pointerdown`, `pointerup`, and `click` event listeners on the Canvas DOM element unconditionally. Even after removing all `onClick`/`onPointerOver` props from every scene mesh, R3F's event manager still runs a full GPU raycast on every pointer event. On a TV where no one is moving a mouse this is silent overhead; on a wall-mounted display with a screensaver or any system cursor, this loops every pixel movement through the Three.js intersect pipeline on every frame.

**Why it happens:**
Developers remove `OrbitControls` and delete pointer handlers from mesh components, assume the Canvas is now passive. It isn't. R3F's event manager (`EventManager`) attaches to the root container unconditionally unless the Canvas receives `events={null}` or a custom no-op event manager. This is undocumented as a "non-interactive mode" — most R3F apps are interactive by definition.

The existing `CameraController.tsx` uses `OrbitControls` from `drei`. Even setting `enabled={false}` on `OrbitControls` does not remove its DOM event listeners — the controls still call `.update()` each frame and still intercept pointer events (confirmed: Three.js issue #19917).

**How to avoid:**
Pass `events={null}` to the `<Canvas>` component. Replace `CameraController.tsx` entirely — do not keep `OrbitControls` with `enabled={false}`. The ambient camera should be a pure `useFrame`-driven tween or sinusoidal drift with no controls component.

**Warning signs:**
- Chrome DevTools Performance tab shows `pointerRaycaster` or raycasting activity during animation frames when no user interaction is occurring
- `renderer.info.render.calls` climbs when OS cursor moves over the browser window
- Grep for `OrbitControls` still present in any component rendered on the `/tv` or `/habitat` route

**Phase to address:**
Phase building the 2.5D canvas scaffold — before any parallax or animation work begins. This is a prerequisite.

---

### Pitfall 2: Zustand `tick()` Cascade Re-renders Kill Layout Animation Smoothness

**What goes wrong:**
`habitatStore.tick()` replaces the entire `zones` Record every 2 seconds: `{ ...state.zones, ... }`. Any Zustand subscriber that reads the whole `zones` object will re-render every 2 seconds. In the 2.5D dashboard, if the grid parent subscribes to `zones`, all 4 zone cards simultaneously re-render every 2s tick. This coincides exactly when Framer Motion `layout` animations are measuring DOM dimensions in `useLayoutEffect`, producing stale FLIP snapshots, animation jitter, and occasional layout jumps on the hero-slot card.

**Why it happens:**
In the 3D scene, `useHabitatStore` subscriptions in R3F components use `useFrame` for animation (off-React-render cycle), and the HTML overlay only re-renders on `selectedZoneId` changes. The 2.5D dashboard has no R3F components — everything is DOM, so every zone card is a React component that subscribes to live sensor data directly, making the 2s re-render flood unavoidable unless selectors are scoped per-zone.

**How to avoid:**
Use per-zone selectors in each card: `useHabitatStore(selectZone(zoneId))` — these already exist in `habitatStore.ts`. For the priority-sorted order, derive a single `rankedZoneIds: string[]` selector with Zustand's `shallow` comparator. The grid parent subscribes only to `rankedZoneIds` and re-renders only when order changes. Each card subscribes only to its own zone. Result: a tick with no priority change produces zero grid parent re-renders and only 4 independent card re-renders (isolated, not synchronous DOM batching).

**Warning signs:**
- React DevTools Profiler shows all 4 zone cards rendering simultaneously every 2 seconds
- Framer Motion `layoutId` animations stutter or flash coinciding with 2s data ticks
- Chrome Performance tab shows layout recalculations every 2s

**Phase to address:**
Phase implementing the grid layout — selector strategy must be locked in before Framer Motion animation is added.

---

### Pitfall 3: Three.js GPU Resources Accumulate Over Hours (Always-On Memory Leak)

**What goes wrong:**
Three.js does not garbage-collect GPU resources. Every `BufferGeometry`, `Material`, and `Texture` allocated lives in GPU memory until explicitly `.dispose()`d. The existing scene uses `EffectComposer` (bloom post-processing), `PointLight`, and procedural `THREE.Mesh` instances created inline in component bodies. For a 3D scene running 5-minute demo sessions this is fine. For a TV dashboard running 8-12+ hours, undisposed resources accumulate. GPU process memory grows several MB per 10 minutes — at 8 hours, that's 150-250MB+ of leaked GPU memory depending on scene complexity.

The v4.0 parallax layer will add new Three.js objects (layered planes, depth meshes, possible particles). These will be created on component mount and never explicitly disposed unless the component unmounts — which it will not in an always-on display.

**Why it happens:**
R3F provides automatic disposal for geometries and materials that are passed as JSX props (via `useEffect` cleanup). But any Three.js object created imperatively inside `useEffect` or `useRef` — outside the JSX reconciler — requires manual `.dispose()` calls. The parallax layer, if implemented with `useEffect(() => { const geo = new THREE.PlaneGeometry(...); ... }, [])`, will leak that geometry unless the cleanup function calls `geo.dispose()`.

**How to avoid:**
- Create all Three.js objects imperatively in `useRef` and dispose them explicitly in the `useEffect` cleanup function
- In development, add a temporary `useFrame` that logs `renderer.info.memory.geometries` and `renderer.info.memory.textures` every 300 frames — values must stay flat over time
- Remove `EffectComposer` and bloom entirely from the 2.5D dashboard. Post-processing was necessary for the 3D scene's selective bloom on status indicators. A flat 2.5D dashboard does not benefit from it and it adds ~40% GPU frame cost for nothing
- For the parallax depth planes, reuse a single `PlaneGeometry` instance shared across all depth layers via different materials — not N separate geometries

**Warning signs:**
- `renderer.info.memory.geometries` or `.textures` count climbs over 10+ minutes in dev mode
- Browser GPU process memory (Chrome Task Manager: Shift+Esc) growing past 200MB after 4+ hours
- Frame rate degrading from 60fps to under 30fps after extended runtime without user interaction

**Phase to address:**
Phase implementing the Three.js parallax layer. GPU disposal audit is a completion criterion for that phase — no merge until `renderer.info.memory` is verified stable over 10 minutes.

---

### Pitfall 4: `scenarioAnnouncements` Array Grows Unbounded in Long Sessions

**What goes wrong:**
`habitatStore.scenarioAnnouncements` accumulates entries and is only cleared by calling `dismissAnnouncement()`. The existing `AnomalyDrawer` provides the interaction surface for dismissal. A non-interactive TV dashboard has no AnomalyDrawer and no human to tap "dismiss." If anomaly scenarios cycle through onset/recovery autonomously over an 8-hour session, this array grows indefinitely. At the minimum (4 zones × 4 scenarios cycling every 5-10 minutes): 100+ entries after 3 hours. Zustand re-serializes the full state object on every write, including the growing announcements array.

**Why it happens:**
The store was designed for interactive demo sessions (minutes, one human). Non-interactive ambient mode removes the dismissal UI without removing the accumulation mechanism.

**How to avoid:**
Two changes needed in the store adaptation phase:
1. Add an array length cap in `triggerAnomaly()`: `scenarioAnnouncements: [...s.scenarioAnnouncements.slice(-8), newAnnouncement]`
2. Add a `useEffect` TTL in whatever ambient alert component replaces `AlertBanner` for TV mode — auto-call `dismissAnnouncement(timestamp)` after 10-15 seconds, regardless of interaction state

Neither change requires a store API change — both are additive.

**Warning signs:**
- `useHabitatStore.getState().scenarioAnnouncements.length` exceeds 20 during any session
- Zustand DevTools state snapshots showing announcements arrays of 50+ items
- Any alert toast visible on TV display that never auto-dismisses

**Phase to address:**
Phase adapting the store for non-interactive ambient mode — before any TV display ships.

---

### Pitfall 5: FLIP Animation Distorts Zone Card Children During Hero Slot Size Transitions

**What goes wrong:**
Priority-driven reordering means a zone transitions from a small card to the large hero slot (different CSS dimensions). Framer Motion implements this size change via CSS `scale()` transform. When a parent container is scaled during FLIP animation, its children are counter-scaled to appear undistorted — but only if those children also carry the `layout` prop. Any direct child of an animated zone card (zone title text, sensor reading display, sparkline SVG container, status badge) that does not have `layout` will visibly distort: text stretches/squishes, chart aspect ratio breaks, status indicator becomes non-circular.

**Why it happens:**
Developers add `layout` to the zone card wrapper (the `motion.div` that gets repositioned) and assume that's sufficient. The Framer Motion docs describe child distortion as a known issue that requires explicit `layout` on children — but this is easy to miss when initially scaffolding the grid.

Additionally: if two zones simultaneously cross priority thresholds in the same 2s tick (both go yellow in the same tick), two layout animations fire simultaneously. This creates competing scale transforms that Framer Motion handles as animation interrupts — the second animation may jump rather than transition if the first hasn't completed its FLIP setup.

**How to avoid:**
- Add `layout` prop to every direct child of animated zone card containers: the name heading, the status indicator, the chart wrapper, the sensor list container
- Debounce priority reordering: only commit a new zone order to React state if the ranking has been stable for 2+ consecutive ticks (4+ seconds). This prevents simultaneous multi-zone re-ranks from triggering competing animations
- Use stable `layoutId` values tied to `zoneId` (never array index) so Framer Motion tracks the same logical element across reorders

**Warning signs:**
- Zone name text visibly stretches or compresses during hero slot promotion
- Sparkline chart SVG aspect ratio changes during card size transition
- Two simultaneous anomaly triggers cause cards to snap-jump rather than animate

**Phase to address:**
Phase implementing priority-driven grid layout and zone reordering animations.

---

### Pitfall 6: Browser Background Throttling Breaks BioSim Probe Timer

**What goes wrong:**
Chromium throttles `setInterval` and `setTimeout` in background and inactive tabs. The `probeTimerRef` in `useSimSource.ts` is a `setInterval(() => fetch(...), 15_000)` — a fetch-based HTTP probe wrapped in setInterval on the main thread. When the tab is hidden (occluded by another window, or the OS has backgrounded the browser), this timer may fire at 1-minute intervals instead of 15 seconds, or not at all. After BioSim on the GCE VM restarts, the dashboard can remain stuck on `fallback` source for minutes.

The existing Worker-based WebSocket connection itself is exempt from throttling (browsers do not throttle WebSocket connections or Worker threads). The risk is narrowly the re-connection probe.

**Why it happens:**
Wall-mounted TV displays often run kiosk browsers that are technically the foreground window, but if the OS screen saver activates or the display enters standby mode, `document.hidden` may become `true`. The Page Visibility API spec explicitly permits browsers to throttle timers when `document.hidden === true`.

**How to avoid:**
Two changes:
1. Move the BioSim probe fetch into the Worker thread alongside the WebSocket — Workers are not subject to main-thread background timer throttling
2. Add a `visibilitychange` event listener in `useSimSource`: when `document.hidden` transitions from `true` to `false` (user/TV "wakes up"), immediately probe BioSim regardless of timer state

For TV kiosk deployments: launch Chrome with `--disable-renderer-backgrounding` and `--disable-background-timer-throttling` flags.

**Warning signs:**
- BioSim restarts on GCE VM but dashboard stays on `fallback` source for more than 30 seconds
- `probeTimerRef` interval fires visibly late in DevTools timeline after tab focus is restored
- TV display showing stale `fallback` mode after screen wakeup

**Phase to address:**
Phase adding long-session resilience and WebSocket reconnection hardening.

---

### Pitfall 7: Priority Ranking Causes Unstable Reordering ("Flapping") Near Status Thresholds

**What goes wrong:**
A zone sensor hovering near a yellow threshold boundary will oscillate between `green` and `yellow` status across consecutive ticks due to simulation noise. The priority ranking algorithm treats `yellow` as higher priority than `green`. Result: the grid reorders on tick N (sensor crosses to yellow), then reorders back on tick N+1 (sensor noise drops it back to green), then reorders again on tick N+2. The dashboard visually thrashes — hero slot changes every 2 seconds in a loop.

**Why it happens:**
The `deriveZoneStatus` function in `habitatStore.ts` is a pure threshold comparison with no hysteresis. A sensor at `green.max - noise` will jitter across the green/yellow boundary with every tick. The simulation engine's `noiseAmplitude` values (0.05–15 per sensor, per `constants.ts`) mean boundary-crossing is common, not exceptional.

**How to avoid:**
Apply hysteresis to the priority ranking, not to the underlying sensor status. Two options:
- Option A (debounce): Only promote a zone to a higher priority tier if it has been at that tier for 2+ consecutive ticks. Track `lastConfirmedPriority` and `ticksAtCurrentPriority` in a ref, separate from Zustand state.
- Option B (sticky): Once a zone reaches hero slot, require it to drop 2 full priority tiers (not just one) before another zone can take hero, with a minimum 10-second cooldown.

Option A is simpler and sufficient for this use case.

**Warning signs:**
- Grid visibly reorders more than once per 10 seconds without a real anomaly active
- Two zone cards appear to "swap" positions repeatedly
- Framer Motion layout animations fire so frequently they never complete before the next re-order

**Phase to address:**
Phase implementing the priority ranking algorithm — hysteresis must be part of the initial design, not added as a fix after seeing it thrash.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `OrbitControls` with `enabled={false}` | No refactor of `CameraController.tsx` | Event listeners still attached; raycasting still runs | Never — remove it entirely |
| Subscribe to full `zones` in grid parent | One selector, less code | All 4 cards re-render every 2s tick; kills animation | Never for TV mode |
| Inline `new THREE.PlaneGeometry()` in component body | Fast authoring | GPU geometry leak over hours | MVP only if session < 30 min; never for always-on |
| Skip `layoutId` on zone cards, use index keys | No setup needed | Reorder triggers unmount/remount instead of animation | Never — defeats the entire UX feature |
| No TTL on `scenarioAnnouncements` | Works in short demos | Array grows unbounded in long sessions | Never for TV mode |
| Keep `EffectComposer` bloom on 2.5D scene | Looks familiar / copy-paste from 3D | ~40% GPU overhead; unnecessary on flat planes | Never — remove explicitly |
| No debounce on priority reorder | Simpler algorithm | Visible grid thrashing near threshold boundaries | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Framer Motion + Zustand tick | `motion.div layout` measures DOM in `useLayoutEffect`; Zustand tick fires in the same frame | Debounce priority-sort state update by 1 tick before committing; use per-zone selectors |
| R3F Canvas + HTML overlay | Assuming `pointerEvents: none` on the overlay div disables R3F raycasting | Must also pass `events={null}` to Canvas; they are independent systems |
| OrbitControls removal | Setting `enabled={false}` assumes it stops event listeners | Replace `CameraController.tsx` entirely; do not conditionally disable |
| Three.js geometry + React strict mode | Dev double-mount creates double GPU resources; only one cleanup fires | Always test long-session GPU stability with `NODE_ENV=production` build |
| BioSim WebSocket + tab visibility | Worker WebSocket survives background; main-thread probe does not | Move probe into Worker or add `visibilitychange` handler |
| Framer Motion FLIP + hero-slot size change | Parent scales; child text/charts distort | All direct children of animated card containers need `layout` prop |
| Priority ranking + sensor noise | Pure threshold comparison causes flapping near boundary | Apply 2-tick debounce hysteresis to ranking decisions |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full `zones` Zustand subscription in grid parent | All 4 cards re-render every 2s simultaneously | `selectZone(zoneId)` per card + `shallow` comparator on ranked IDs | Immediately on first tick |
| R3F raycasting with no `events={null}` | CPU spike on any cursor activity near TV | `events={null}` on Canvas | Any pointer event near the display |
| `EffectComposer` bloom on flat 2.5D | GPU frame time 8-12ms where 2ms is achievable | Remove `EffectComposer` entirely from 2.5D dashboard | Always — no benefit here |
| Inline Three.js object creation in render path | `renderer.info.memory.geometries` climbs on re-renders | Create geometry once in `useRef`, dispose in `useEffect` cleanup | Any component re-render (2s ticks) |
| `scenarioAnnouncements` unbounded growth | Zustand state serialization cost grows; memory creep | Array length cap + TTL auto-dismiss | After ~2 hours of anomaly cycling |
| Priority reorder without debounce | Grid re-sorts every 2s near threshold boundaries; animations never complete | 2-tick stability requirement before committing sort order | Immediately when any sensor is near a threshold |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Font size under 24px for any label | Unreadable from 3+ meters | Minimum 28px for labels; 48px+ for zone name; 64px+ for critical status indicator |
| Contrast ratio under 7:1 on dark background | Ambient room lighting washes out text | Dark background `#050505` needs text at `#c0c0c0` minimum; red/yellow status needs white label |
| Priority reorder faster than 400ms transition | Looks like a glitch, not a meaningful system event | 500-800ms easing for hero slot promotions; 300ms for minor reshuffles |
| Showing all 4 zones at equal visual weight | Viewer cannot tell which zone is critical at a glance | Hero zone must be visually dominant: 2-3× larger, status color fills background |
| Auto-drift parallax amplitude too large or too fast | Dizzying for passive viewers; conflicts with reading values | Max parallax offset: 3-5% of canvas size; drift period: 20-40s sinusoidal cycle |
| `AnomalyDrawer` or interactive controls visible on TV route | Wastes space; confuses viewers; looks unfinished | New `/tv` route or `?mode=tv` query param that omits all interactive elements |
| Raw `solElapsed` integer displayed in HUD | "Sol 28800s" after 8 hours is nonsensical | Derive `solCount = Math.floor(solElapsed / SOL_CYCLE_PERIOD)` for display; never show raw seconds |

---

## "Looks Done But Isn't" Checklist

- [ ] **Canvas event system disabled:** `events={null}` on `<Canvas>` — verify no raycasting in Chrome Performance tab during idle
- [ ] **OrbitControls removed:** Not `enabled={false}` — absent from component tree entirely — grep for `OrbitControls` in all components rendered on the TV route
- [ ] **Per-zone selectors:** Each card uses `selectZone(zoneId)` not full `zones` — React DevTools Profiler shows only the changed card re-rendering on tick
- [ ] **Framer Motion layout children:** All direct children of animated zone card containers carry `layout` prop — verify no text/chart distortion during hero slot promotion
- [ ] **ScenarioAnnouncements bounded:** Array length stays under 10 after 10 minutes of anomaly cycling — `console.log(useHabitatStore.getState().scenarioAnnouncements.length)` after stress test
- [ ] **GPU resources stable:** `renderer.info.memory.geometries` and `.textures` flat after 10 minutes in production build — add temporary devmode logging
- [ ] **Priority debounce active:** Grid does not reorder more than once per 4 seconds without a new anomaly trigger — verify by watching near a threshold boundary
- [ ] **Post-processing removed:** No `EffectComposer` in 2.5D dashboard — `renderer.info.render.calls` materially lower than 3D scene baseline
- [ ] **Typography at TV scale:** All text >=28px, contrast >=7:1 — verify at 1920×1080 full-screen from 3 meters
- [ ] **Sol display human-readable:** HUD shows "Sol 12" not "Sol 7200s" — check after 20+ minutes of continuous running

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `OrbitControls` event leak found after parallax work | MEDIUM | Remove `CameraController.tsx`, add `events={null}`, replace with `useFrame`-driven drift; verify no visual regression |
| Full `zones` subscription causing animation jank | MEDIUM | Refactor grid parent to ranked-IDs selector + per-card `selectZone`; no store changes; 1-2 hours work |
| GPU leak found after hours of testing | HIGH | Audit all `useEffect`s and `useRef`s in parallax layer for missing `.dispose()`; add `renderer.info` logging; may need R3F component restructure |
| FLIP child distortion on hero promotion | LOW | Add `layout` to text/chart children of animated card containers; 15-minute fix |
| Announcement array overflow | LOW | Add `.slice(-8)` cap in `triggerAnomaly`; add TTL `useEffect` in TV alert component |
| Background throttling breaks BioSim probe | MEDIUM | Move probe fetch into Worker; add `visibilitychange` handler in main thread for immediate re-probe |
| Priority thrashing near threshold | LOW | Add 2-tick stability debounce to ranking commit; pure JS logic, no store API changes |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| R3F Canvas pointer events active | Phase: 2.5D canvas scaffold | Chrome Performance tab: no raycasting during idle |
| Zustand tick cascade re-renders | Phase: grid layout + priority system | React DevTools: only changed card re-renders on each tick |
| GPU resource leak over hours | Phase: Three.js parallax layer | `renderer.info.memory` flat after 10 min in production build |
| ScenarioAnnouncements growth | Phase: store adaptation for non-interactive mode | Array stays <=10 after 10 min anomaly cycling |
| FLIP distortion on hero slot | Phase: priority-driven grid layout | No visual distortion on any card size transition |
| Background throttling breaks probe | Phase: long-session resilience | BioSim reconnects within 5s of VM restart even with tab occluded |
| Priority thrashing near threshold | Phase: priority ranking algorithm | Grid does not reorder more than once per 4s under noise conditions |
| Post-processing on flat scene | Phase: 2.5D canvas scaffold | `renderer.info.render.calls` lower than 3D scene; no `EffectComposer` in bundle |

---

## Sources

- Codebase: `spatialhub-frontend/src/store/habitatStore.ts` — `scenarioAnnouncements` accumulation, `tick()` full zones replacement pattern
- Codebase: `spatialhub-frontend/src/hooks/useSimSource.ts` — `probeTimerRef` main-thread setInterval; `PROBE_INTERVAL_MS = 15_000`
- Codebase: `spatialhub-frontend/src/simulation/biosimMapper.ts` — `HISTORY_CAP = 30`, `appendRingBuffer` confirmed bounded
- Codebase: `spatialhub-frontend/src/simulation/engine.ts` — `MAX_HISTORY = 30`, `TICK_INTERVAL_MS = 2000`, sensor `noiseAmplitude` values
- Codebase: `spatialhub-frontend/src/simulation/constants.ts` — threshold boundary values confirming noise-induced jitter risk
- Three.js GitHub issue #19917: [OrbitControls camera modification persists after `enabled = false`](https://github.com/mrdoob/three.js/issues/19917)
- Three.js GitHub issue #28355: [WebGLProgram leaking on scene recreation](https://github.com/mrdoob/three.js/issues/28355)
- Three.js forum: [WebGL memory management puzzlers](https://discourse.threejs.org/t/webgl-memory-management-puzzlers/24583)
- R3F forum: [Memory leak when Canvas is scrolled out of view](https://discourse.threejs.org/t/r3f-threejs-memory-leak-when-canvas-is-scrolled-out-of-view/48440)
- Motion docs: [Layout Animation — React FLIP & Shared Element](https://motion.dev/docs/react-layout-animations) — child distortion documented
- Maxime Heckel blog: [Everything about Framer Motion layout animations](https://blog.maximeheckel.com/posts/framer-motion-layout-animations/) — scale distortion and children
- MDN: [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) — timer throttling behavior
- Smashing Magazine: [Designing For TV (2025)](https://www.smashingmagazine.com/2025/09/designing-tv-principles-patterns-practical-guidance/) — 10-foot UI minimum font sizes
- Digital Signage: [Typography & Viewing Distance Guide](https://digitalsignage.com/digital_signage/docs/guides/typography-viewing-distance/) — minimum font size formula for viewing distance
- Codrops: [Animating Responsive Grid Layout Transitions with GSAP Flip (2026)](https://tympanus.net/codrops/2026/01/20/animating-responsive-grid-layout-transitions-with-gsap-flip/) — FLIP approach for CSS grid reorder

---
*Pitfalls research for: 2.5D ambient TV dashboard (v4.0 Mars Habitat Revamp)*
*Researched: 2026-03-21*
