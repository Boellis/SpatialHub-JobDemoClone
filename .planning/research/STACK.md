# Technology Stack

**Project:** SpatialHub Mars Habitat Demo -- 3D Visualization Layer
**Researched:** 2026-03-09
**Research Mode:** Ecosystem
**Overall Confidence:** MEDIUM (web verification tools unavailable; versions based on training data through May 2025 -- verify with `npm view <pkg> version` before installing)

## Context

Adding a 3D interactive Three.js habitat visualization with real-time telemetry overlays to an existing React 19 + Vite 6 + TypeScript 5.7 frontend. The existing app uses `useState`/`useEffect` for state, `axios` for HTTP, `recharts` for 2D charts, and `@tanstack/react-query` (installed but unused). No CSS framework -- just plain CSS classes with Tailwind-style naming but no actual Tailwind.

## Recommended Stack

### Core 3D Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `three` | ^0.170.0 | 3D rendering engine | The only serious WebGL abstraction for the browser. No competition. | HIGH |
| `@react-three/fiber` (R3F) | ^9.0.0 | React renderer for Three.js | Declarative Three.js in React components. The standard way to use Three.js with React since 2020. Imperative Three.js in React is a maintenance nightmare -- R3F handles the render loop, cleanup, and reconciliation. | HIGH |
| `@react-three/drei` | ^9.120.0 | R3F helper components | 200+ ready-made components: `OrbitControls`, `Html` (DOM overlays in 3D), `Text`, `useGLTF`, `Environment`, `ContactShadows`, `Float`. Saves weeks of boilerplate. Every R3F project uses this. | HIGH |
| `@types/three` | ^0.170.0 | TypeScript types for Three.js | Match to `three` version. R3F and drei have built-in types. | HIGH |

**Why R3F over raw Three.js:** The project is React 19. Writing imperative Three.js inside `useEffect` hooks means manually managing scene graphs, disposal, resize handlers, render loops, and ref cleanup. R3F handles all of this. It's not a wrapper -- it's a full React reconciler. Components mount/unmount properly, props drive updates, and the render loop is automatic. For a React app, using raw Three.js is like using `document.createElement` instead of JSX.

**Why NOT vanilla Three.js:** The existing codebase already has a `/unity` route with an iframe-embedded Unity WebGL build. That approach (iframe isolation) is the alternative if you want raw Three.js. But for this project, the 3D scene needs to interleave with React state (sensor data, click handlers, zone selection, alert states). R3F is the only sane path.

### 3D Scene Utilities

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@react-three/postprocessing` | ^3.0.0 | Post-processing effects | Bloom, vignette, tone mapping for the "visually dramatic" alert states. Wraps `postprocessing` (not Three's built-in EffectComposer which is slower). | HIGH |
| `leva` | ^0.10.0 | Dev-time controls panel | Tweak colors, thresholds, camera angles in real time during development. Strip from production or gate behind dev flag. Far better than hardcoding and reloading. | MEDIUM |

### Real-Time Data Layer

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@tanstack/react-query` | ^5.74.11 | Server state / polling | Already installed in `package.json`. Use `refetchInterval` for polling sensor data (1-5s intervals). Handles caching, deduplication, background refetch, stale-while-revalidate. The existing codebase ignores it and uses raw `useEffect` + `axios` -- the habitat page should use it properly. | HIGH |
| `zustand` | ^5.0.0 | Client-side state for 3D scene | Zone selection, alert states, anomaly simulation state, camera targets. React Context causes full subtree re-renders which kills 3D frame rates. Zustand is selector-based -- only components that read a specific slice re-render. This is critical for 60fps 3D. R3F ecosystem standardized on Zustand (same author: Poimandres). | HIGH |

**Why Zustand over React Context:** In a 3D scene with dozens of meshes, each subscribed to different sensor values, Context-based state changes would re-render the entire `<Canvas>` subtree every polling tick. Zustand's `useStore(state => state.specificSlice)` pattern ensures only the mesh whose sensor value changed re-renders. This is the difference between 60fps and 15fps.

**Why Zustand over Redux/Jotai/Recoil:** Zustand is from Poimandres (the same group that maintains R3F, drei, and the entire react-three ecosystem). It was literally designed for this use case. Minimal API, no providers, no boilerplate. Redux is overkill. Jotai is fine but less integrated with R3F patterns. Recoil is dead (Meta abandoned it).

**Why NOT WebSockets:** The project spec says "no new cloud infra" and "simulated data runs locally or in-browser." Polling with react-query at 2-5 second intervals is sufficient for demo-quality "real-time" telemetry. If you wanted true real-time, Django Channels + WebSockets is the path, but it adds ASGI server complexity (Daphne/Uvicorn), Redis for channel layers, and new infrastructure -- all out of scope.

### Animation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@react-spring/three` | ^9.7.0 | Physics-based animation for 3D objects | Smooth transitions for zone highlighting, camera movements, alert pulsing. Spring-based animation looks organic, not mechanical. Integrates with R3F natively. | HIGH |

**Why NOT GSAP:** GSAP works with Three.js but fights the React model. You'd be imperatively tweening object properties inside refs while R3F tries to declaratively manage the scene. `@react-spring/three` is declarative: `<animated.meshStandardMaterial color={spring.color} />`. It also handles interrupted animations (user clicks zone B while zone A animation is still playing) gracefully -- GSAP needs manual kill/cleanup.

**Why NOT framer-motion-3d:** Framer Motion's 3D support is experimental and poorly documented. `@react-spring/three` is battle-tested in the R3F ecosystem.

### UI Overlay (HUD / Panels)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `drei` `<Html>` component | (part of drei) | DOM elements positioned in 3D space | Sensor readout labels floating above zones, tooltip panels on hover/click. Renders actual DOM elements that track 3D world positions. | HIGH |
| Existing CSS approach | N/A | Side panels, alert banners | The existing app uses plain CSS with utility class naming. Keep it consistent -- no need to introduce Tailwind or a component library for a portfolio demo. | HIGH |

### 3D Assets

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `gltfjsx` | ^6.5.0 | CLI tool: GLTF/GLB to React components | Converts 3D models into typed R3F components with proper refs. Run once at build time, not a runtime dep. `npx gltfjsx model.glb --types --transform` | HIGH |
| `@react-three/drei` `useGLTF` | (part of drei) | Runtime GLTF loader with caching | Load habitat model at runtime with automatic disposal and Suspense support. | HIGH |

**Asset strategy:** Create the Mars habitat as modular GLB files (one per zone or one combined with named groups). Use Blender for modeling or find CC0 sci-fi habitat models and modify. `gltfjsx` generates typed React components from these files, so each zone mesh gets a proper ref and onClick handler.

### Dev Dependencies

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@react-three/test-renderer` | ^9.0.0 | Unit testing R3F scenes | Renders R3F components without WebGL. Test that clicking a zone updates state, that anomaly triggers change mesh colors. | MEDIUM |
| `leva` | ^0.10.0 | Development GUI controls | Adjust thresholds, colors, animation speeds without code changes. Gate behind `import.meta.env.DEV`. | MEDIUM |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| React + Three.js | `@react-three/fiber` | Raw `THREE.Scene` in `useEffect` | Manual lifecycle hell in React. Disposal bugs. No reconciliation. |
| React + Three.js | `@react-three/fiber` | `react-three-renderer` | Dead project, unmaintained since 2019. |
| State management | `zustand` | React Context | Re-renders entire Canvas subtree, kills frame rate |
| State management | `zustand` | Redux Toolkit | Overkill boilerplate for this scope. Not optimized for 60fps selective re-renders. |
| State management | `zustand` | Jotai | Fine technically, but Zustand is from the R3F team and has better ecosystem integration |
| Animation | `@react-spring/three` | GSAP | Imperative API fights React's declarative model. Manual cleanup on unmount. |
| Animation | `@react-spring/three` | Framer Motion 3D | Experimental, poorly documented, limited Three.js integration |
| Post-processing | `@react-three/postprocessing` | Three.js EffectComposer | Slower (renders each effect as separate pass). R3F postprocessing merges effects. |
| Data fetching | `@tanstack/react-query` polling | WebSocket (Django Channels) | Requires ASGI server, Redis, new infra. Out of scope per constraints. |
| Data fetching | `@tanstack/react-query` polling | SSE (Server-Sent Events) | Simpler than WebSocket but still needs async Django. Polling at 2-5s is fine for a demo. |
| 3D models | GLB/GLTF files | Procedural geometry | Boxes and spheres don't look like a Mars habitat. GLB with baked lighting looks dramatically better for minimal effort. |
| CSS | Plain CSS (existing pattern) | Tailwind CSS | Not installed, not worth adding for one new page. Consistency > perfection. |
| UI components | Plain HTML + CSS | shadcn/ui, Radix, MUI | The demo already uses basic elements. A component library for one page is overhead. |

## Architecture Patterns for the Stack

### React Query + Zustand Integration

```typescript
// Pattern: React Query fetches, Zustand holds derived 3D state
// This avoids re-rendering the 3D scene on every fetch cycle

// store.ts
import { create } from 'zustand';

interface HabitatStore {
  zones: Record<string, ZoneState>;
  selectedZone: string | null;
  alerts: Alert[];
  updateZoneTelemetry: (zoneId: string, data: SensorReading[]) => void;
  selectZone: (zoneId: string | null) => void;
}

// Component subscribes to ONE zone's color -- not the whole store
// const color = useHabitatStore(s => s.zones['atmosphere'].statusColor);
```

### R3F Component Structure

```
<Canvas>
  <Suspense fallback={<LoadingSpinner />}>
    <HabitatScene>
      <GrowBayZone />        // Each zone is a component
      <AtmosphereZone />     // with its own mesh, materials,
      <WaterRecyclingZone /> // click handlers, and store subscriptions
      <PowerThermalZone />
    </HabitatScene>
    <OrbitControls />
    <Environment preset="night" />
    <EffectComposer>
      <Bloom luminanceThreshold={0.8} />
    </EffectComposer>
  </Suspense>
</Canvas>
```

### Performance Pattern: useFrame vs. Re-renders

```typescript
// GOOD: useFrame for continuous visual updates (60fps, no re-renders)
function PulsingAlert({ zoneRef }) {
  useFrame((state) => {
    zoneRef.current.material.emissiveIntensity =
      Math.sin(state.clock.elapsedTime * 3) * 0.5 + 0.5;
  });
  return null;
}

// GOOD: Zustand selector for discrete state changes (re-render only when value changes)
function ZoneMesh({ id }) {
  const status = useHabitatStore(s => s.zones[id].status);
  // Only re-renders when THIS zone's status changes
}

// BAD: useEffect + setState for animation (causes re-renders at 60fps)
```

## Installation

```bash
# Core 3D stack
npm install three @react-three/fiber @react-three/drei

# TypeScript types for Three.js
npm install -D @types/three

# Post-processing for visual effects
npm install @react-three/postprocessing

# State management (critical for 3D performance)
npm install zustand

# Animation for 3D objects
npm install @react-spring/three

# Dev tools (optional but strongly recommended)
npm install -D leva

# Asset pipeline (run once, not a project dependency)
npx gltfjsx --help
```

**Note:** `@tanstack/react-query` is already in `package.json` at `^5.74.11`. No need to install it, but the existing codebase doesn't use it -- the habitat page should be the first proper consumer.

## Version Compatibility Notes

**IMPORTANT -- verify before installing:**

My training data goes to May 2025. The versions listed above were current as of that date. Before installing, run:

```bash
npm view @react-three/fiber version
npm view @react-three/drei version
npm view three version
npm view zustand version
npm view @react-spring/three version
```

Key compatibility constraints:
- `@react-three/fiber` v9 requires React 18+ (React 19 is supported)
- `@types/three` version should match `three` major.minor version
- `@react-three/drei` version must match `@react-three/fiber` major version
- `@react-three/postprocessing` v3 requires R3F v9
- `@react-spring/three` v9 works with R3F v8 and v9

**React 19 compatibility:** R3F v9 (released late 2024) added React 19 support. Earlier versions (v8.x) may work but have deprecation warnings. Use v9+.

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| `react-three-renderer` | Dead since 2019. Do not confuse with `@react-three/fiber`. |
| `babylonjs` | Different ecosystem entirely. Three.js is specified in requirements, and R3F integration is mature. Babylon's React story is weaker. |
| `A-Frame` | HTML-first VR framework. Wrong abstraction for data-driven 3D dashboards. |
| `deck.gl` | Geospatial visualization, not indoor 3D scenes. |
| `react-globe.gl` / `globe.gl` | Specifically for globes. Not relevant. |
| `cannon-es` / `@react-three/cannon` / `@react-three/rapier` | Physics engines. The habitat doesn't need physics simulation. Adds significant bundle size for zero value. |
| `three-stdlib` | Merged into `drei`. Using both causes duplicate code. |
| `@react-three/xr` | VR/AR support. Out of scope (desktop-first demo). |
| `Recoil` | Abandoned by Meta. Community migration to Jotai/Zustand. |
| `MobX` | Observable-based state doesn't play well with R3F's render cycle. |
| `socket.io` / `ws` | WebSocket overkill for demo polling. Requires backend changes. |
| `Tailwind CSS` | Not in existing stack. Adding it for one page creates inconsistency. |
| `CSS-in-JS (styled-components, emotion)` | Runtime cost, not needed, existing app uses plain CSS. |

## Bundle Size Considerations

| Package | Approx. Size (gzipped) | Notes |
|---------|------------------------|-------|
| `three` | ~150 KB | Largest dep. Tree-shaking helps if using ES modules (Vite handles this). |
| `@react-three/fiber` | ~40 KB | Reasonable for what it provides. |
| `@react-three/drei` | ~15-50 KB | Tree-shakeable. Only imported helpers are bundled. |
| `zustand` | ~1 KB | Tiny. |
| `@react-spring/three` | ~15 KB | Reasonable. |
| `postprocessing` | ~80 KB | Consider code-splitting the habitat route. |
| GLB model files | Variable | Compress with `gltf-transform` or Draco compression. Keep under 2MB total. |

**Total additional JS:** ~300-350 KB gzipped. This is significant. **Code-split the `/habitat` route** with `React.lazy()` so the 3D stack only loads when users navigate there. The existing pages (`/raw`, `/enriched`, `/trends`) should not pay this cost.

## Sources and Confidence Notes

- R3F as the standard React + Three.js integration: HIGH confidence. This has been the established approach since 2021. Poimandres (pmndrs) maintains the entire ecosystem.
- Zustand for R3F state management: HIGH confidence. Same author/org as R3F. Documented pattern in R3F ecosystem.
- React Query polling for "real-time": HIGH confidence. Well-documented `refetchInterval` option. Already a dependency.
- Specific version numbers: MEDIUM confidence. Based on May 2025 training data. Run `npm view` to verify current versions.
- `@react-spring/three` over GSAP: HIGH confidence for React context. GSAP is superior for non-React Three.js.
- Post-processing bundle size estimates: LOW confidence. Verify with `npx vite-bundle-analyzer` after integration.
- React 19 + R3F v9 compatibility: MEDIUM confidence. R3F v9 was released targeting React 18+ with 19 support. Verify that the exact latest versions still list React 19 as a peer dependency.

---

*Stack research: 2026-03-09 | Verification limited: WebSearch, WebFetch, and npm CLI unavailable during research. Version numbers should be verified before installation.*
