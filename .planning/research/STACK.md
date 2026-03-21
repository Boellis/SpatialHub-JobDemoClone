# Stack Research

**Domain:** 2.5D ambient TV dashboard — priority-driven grid, live charts, Three.js parallax depth, smooth layout transitions
**Researched:** 2026-03-21
**Confidence:** HIGH (core choices verified), MEDIUM (motion package version pinning)

> This document covers ONLY net-new stack additions for the v4.0 TV Dashboard milestone.
> Existing validated stack (React 19, Vite, TypeScript, R3F fiber@9.5, drei@10.7,
> postprocessing@3.0, three@0.183, zustand@5.0.11, recharts@2.15.3, Django 5.2,
> DRF, PostgreSQL, BioSim) is unchanged and not re-researched here.

---

## What's Already Present (Do Not Re-Add)

| Package | Installed Version | Relevant to v4.0 |
|---------|------------------|-----------------|
| `recharts` | ^2.15.3 | YES — use for per-zone live charts |
| `zustand` | ^5.0.11 | YES — derive priority ranking selector |
| `three` | ^0.183.2 | YES — parallax background canvas |
| `@react-three/fiber` | ^9.5.0 | YES — parallax background canvas |
| `@react-three/drei` | ^10.7.7 | YES — geometry helpers |
| React | 19.0.0 | YES — concurrent rendering |

---

## New Additions Required

### Core Technologies (net-new installs)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `motion` (npm) | ^12.x (~12.38 latest) | FLIP layout animation for zone grid reordering | The only library that animates CSS grid slot reassignment without manual transform math. The `layout` prop auto-computes FLIP (First-Last-Invert-Play) transitions when a grid item changes position. `layoutId` enables the hero↔secondary shared-element transition when zone criticality changes. React 19 officially supported in v12. Import from `"motion/react"`. This is Framer Motion rebranded — same codebase, same API, new package name. |

**That's it. One package.** Everything else the dashboard needs is already installed.

---

## Existing Libraries — v4.0 Usage Patterns

### Recharts (^2.15.3 — already installed)

Per-zone live sensor charts inside grid cards. Already used on `/trends`; new usage context only.

| Requirement | Config |
|-------------|--------|
| Smooth line curve | `type="monotone"` on `<Line>` |
| Live 2s tick without animation breakage | `isAnimationActive={false}` on `<Line>` after initial mount — recharts animation breaks when data updates faster than the animation duration completes (confirmed issue [#5752](https://github.com/recharts/recharts/issues/5752)). Gate with a `mounted` ref: enable animation on first render only, disable on subsequent data updates. |
| Glanceable TV typography | Override `<XAxis tick={{ fontSize: 10, fill: '#aaa' }}>`, remove `<CartesianGrid>` or set `strokeOpacity={0}`, use `strokeWidth={2}` on `<Line>` |
| Status-reactive color | Pass zone status hex directly as `stroke` prop — same pattern as existing `Sparkline.tsx` |
| Fills grid card height | `<ResponsiveContainer width="100%" height="100%">` — required inside flex/grid cells |

**Confidence:** HIGH — package already installed, pattern established in codebase.

### R3F / Three.js (already installed)

Parallax background: a second `<Canvas>` rendered fixed behind the grid DOM layer.

| Requirement | Approach |
|-------------|---------|
| Canvas as background | `<Canvas style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>` |
| Grid dashboard on top | Wrap in `<div style={{ position: 'relative', zIndex: 1 }}>` |
| Auto-drift (no user input) | `useFrame(({ clock }) => { groupRef.current.position.x = Math.sin(clock.elapsedTime * 0.08) * 0.4 })` — slow sinusoidal offsets per depth layer |
| Multi-layer parallax depth | 3–4 mesh groups at different Z depths; further groups use smaller multipliers (e.g., `depthFactor * 0.3` for background layer, `depthFactor * 1.0` for foreground) |
| No interactivity | `pointerEvents: 'none'` on canvas container; no raycaster, no event handlers |
| Visual coherence with existing app | Reuse procedural geometry patterns (`IcosahedronGeometry`, `TorusKnotGeometry`) and emissive materials from existing habitat components |
| No postprocessing on parallax canvas | Keep this canvas effect-free — bloom on the background would bleed through the grid cards |

**What NOT to do:** Do not render grid cards via `<Html>` from drei inside the R3F canvas. That bridges DOM into WebGL and creates pointer-events and z-index problems at scale. Keep DOM grid and WebGL background as fully separate layers.

**Confidence:** HIGH — canvas layering pattern is established in `HabitatView.tsx` (HTML overlay as Canvas sibling).

### Zustand (^5.0.11 — already installed)

Add a priority ranking selector. Zero new state shape required — derive from existing `zones` map.

```typescript
// Add to habitatStore.ts — pure selector, no store shape change
export const selectZonesByPriority = (state: HabitatState): string[] =>
  Object.values(state.zones)
    .sort((a, b) => {
      const priority = { red: 0, yellow: 1, green: 2 };
      return priority[a.status] - priority[b.status];
    })
    .map((z) => z.zoneId);
```

When this selector returns a new order, the `motion` layout animations handle the visual reordering transition.

**Confidence:** HIGH — standard Zustand selector pattern, no store shape changes.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `motion` | ^12.x | FLIP animation for zone grid reordering | Always — no pure-CSS alternative can animate CSS grid item repositioning smoothly |

No additional libraries required.

---

## Development Tools

No new tools. Existing Vite + TypeScript + ESLint setup is sufficient. The `motion` package ships its own TypeScript types.

---

## Installation

```bash
cd spatialhub-frontend

# The only new dependency for v4.0
npm install motion
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `motion` npm package | `framer-motion` npm package | They resolve to the same code at v12.x — `framer-motion` is a re-export shim. Use `motion` directly for clarity and to avoid the deprecated package name. |
| `motion` layout animations | Pure CSS `transition` + `order` property | CSS `order` cannot be animated — grid items snap to new positions. CSS transforms require manual FLIP math (measure, invert, play). `motion` automates all of this with a single `layout` prop. |
| `motion` layout animations | React Transition Group | RTG provides lifecycle hooks only; all transform math is manual. ~3x more code for the same result. |
| `motion` layout animations | GSAP FLIP plugin | GSAP FLIP is excellent but GSAP's license requires a paid license for commercial/portfolio work. `motion` is MIT. |
| Recharts (installed) | Victory / Nivo / Chart.js | Recharts is already installed and used on `/trends`. Adding a second chart library for this milestone is pointless overhead. |
| Separate R3F canvas (background) | Single canvas with HTML overlay | Using a single canvas with `<Html>` from drei forces grid card content through the WebGL render path. The existing app already uses separate canvas + HTML sibling for the HUD — this is the proven pattern. |
| Separate R3F canvas (background) | CSS `perspective` + DOM `translateZ` layers | Achievable for pure parallax but loses access to Three.js geometry and emissive materials. The visual coherence with the existing app requires Three.js. |
| `useFrame` for auto-drift | `@react-spring/parallax` | react-spring/parallax is scroll-driven, not time-driven. TV dashboard has no scroll — auto-drift needs `clock.elapsedTime`. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-grid-layout` | Drag-to-resize dashboard library built for user-interactive layouts. Adds ~150KB for zero benefit on a non-interactive TV display where layout is algorithmic. | Plain CSS Grid + `motion` layout prop |
| `isAnimationActive={true}` on `Line` for live data | Recharts animations break when data updates faster than animation completion time — confirmed open issue. On a 2s tick with default 400ms animation this causes skipped/stuttered rendering. | `isAnimationActive={false}` on `Line` after first mount |
| Bloom postprocessing on background canvas | Bloom on the parallax layer bleeds through grid card boundaries, destroying the glassmorphism card aesthetic. | No postprocessing on background canvas; bloom on foreground elements only if needed |
| `@react-three/postprocessing` on the new parallax canvas | Same reason as above, plus adding a second EffectComposer doubles the post-processing overhead. | Keep the background canvas as a raw WebGL render pass |
| Mouse-driven parallax | Dashboard is non-interactive (TV display). Mouse/pointer input is explicitly out of scope. Adding it wastes implementation time and breaks the TV-only constraint. | `clock.getElapsedTime()` auto-drift in `useFrame` |
| `react-spring` for layout transitions | Works but requires manual spring config per property. `motion`'s `layout` prop is a single-prop FLIP solution. | `motion` with `layout` prop |

---

## Architecture: How the Layers Stack

```
z-index 1: <div> grid dashboard
              motion.div[layout][layoutId="zone-{id}"] per zone card
              <ResponsiveContainer> + <LineChart> per card
              Status typography (large, high-contrast)

z-index 0: <Canvas> (position: fixed, inset: 0, pointer-events: none)
              Three.js parallax scene
              3–4 geometry groups, each with useFrame auto-drift
              No postprocessing, no raycaster
```

This maps cleanly onto the existing HabitatView pattern where `HabitatHUD.tsx` is a DOM sibling to the R3F Canvas.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `motion@^12.x` | `react@19.0.0` | React 19 officially supported in v12. Import as `import { motion, AnimatePresence } from "motion/react"` — not `"framer-motion"`. |
| `recharts@^2.15.3` | `react@19.0.0` | v2.x uses React 18-compatible APIs; works with React 19 (no known issues). |
| `three@0.183.2` | `@react-three/fiber@9.5.0` | Already validated in production at v3.0. |
| `motion@^12.x` | `three@0.183.2` + R3F | No interaction between them — separate render contexts. No compatibility concern. |

---

## Sources

- [framer-motion on npm](https://www.npmjs.com/package/framer-motion) — latest v12.36, confirmed React 19 support (MEDIUM confidence — npm page)
- [motion on npm](https://www.npmjs.com/package/motion) — latest v12.38, confirmed same codebase as framer-motion (MEDIUM confidence — npm page)
- [Motion layout animations docs](https://motion.dev/docs/react-layout-animations) — `layout` prop FLIP automation, `layoutId` shared-element transitions (HIGH confidence — official docs)
- [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide) — framer-motion → motion migration, `"motion/react"` import path (HIGH confidence — official docs)
- [Recharts issue #5752](https://github.com/recharts/recharts/issues/5752) — animation breaks when data updates faster than completion; `isAnimationActive={false}` workaround confirmed (HIGH confidence — official repo issue)
- [R3F Canvas docs — style prop](https://r3f.docs.pmnd.rs/api/canvas) — canvas positioning, `style` prop for fixed background (HIGH confidence — official docs)
- [R3F discussions #2923](https://github.com/pmndrs/react-three-fiber/discussions/2923) — canvas parallax approach confirmed viable (MEDIUM confidence — community discussion)
- Existing codebase: `HabitatView.tsx`, `HabitatHUD.tsx`, `Sparkline.tsx` — canvas + DOM sibling pattern, sparkline color prop pattern, zoom camera pattern (HIGH confidence — direct read)

---

*Stack research for: SpatialHub v4.0 Mars Habitat TV Dashboard*
*Researched: 2026-03-21*
