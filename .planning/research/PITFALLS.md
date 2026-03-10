# Domain Pitfalls

**Domain:** 3D interactive IoT data visualization (Three.js + React + real-time simulated telemetry)
**Project:** SpatialHub Mars Habitat Demo
**Researched:** 2026-03-09
**Confidence:** MEDIUM (based on training data through May 2025; web verification tools unavailable)

---

## Critical Pitfalls

Mistakes that cause rewrites, showstopper bugs, or fundamentally broken demos.

---

### Pitfall 1: GPU Memory Leaks from Undisposed Three.js Objects

**What goes wrong:** Three.js geometries, materials, textures, and render targets allocate GPU memory that is NOT garbage collected by JavaScript's GC. Every time a React component unmounts and remounts (route changes, hot module replacement during dev, state transitions), new GPU resources are allocated without freeing old ones. After navigating to `/habitat` and back a few times, the browser tab eats gigabytes of GPU memory and eventually crashes or produces black/corrupt renders.

**Why it happens:** React developers assume that when a component unmounts, everything gets cleaned up. In Three.js, GPU-side allocations (via WebGL) persist until explicitly `.dispose()`d. React-three-fiber (R3F) auto-disposes *some* objects on unmount, but only those declared declaratively in JSX. Anything created imperatively (in `useEffect`, `useMemo`, or helper functions) is your responsibility.

**Consequences:** Tab crash after repeated navigation. Corrupt rendering. Mobile/low-end devices become unusable within minutes. Invisible during development because developers rarely navigate back and forth enough to notice.

**Warning signs:**
- Chrome DevTools > Performance Monitor shows "GPU memory" climbing on each route visit
- `renderer.info.memory` values (geometries, textures) increase but never decrease
- Black rectangles or missing textures appearing after extended use

**Prevention:**
- Use R3F's declarative JSX for all scene objects whenever possible -- R3F handles disposal automatically for declarative elements
- For any imperative Three.js object creation, pair every `new THREE.Geometry/Material/Texture()` with a `.dispose()` call in the cleanup function of `useEffect`
- Create a custom `useDisposable` hook that tracks and disposes objects
- Use `renderer.info.memory` in development to monitor geometry/texture counts
- Test the demo by navigating to `/habitat`, away, and back 10+ times, then check GPU memory

**Detection:** Add a dev-mode overlay that displays `gl.info.memory.geometries` and `gl.info.memory.textures` counts. If these climb on re-navigation, you have a leak.

**Phase mapping:** Must be addressed from the very first Three.js scene setup. Establish disposal patterns in the foundation phase, not as cleanup later.

---

### Pitfall 2: React Re-Renders Destroying Frame Rate

**What goes wrong:** React state updates trigger component re-renders. In a normal DOM app, this is fine -- reconciliation is fast. Inside a Three.js scene managed by R3F, a re-render can mean reconstructing 3D objects, resetting animations, or triggering expensive geometry recalculations. A `setState` call that updates sensor data every second causes the entire scene tree to re-render 60+ times per second (once per state change cascading through the frame loop), tanking FPS from 60 to single digits.

**Why it happens:** Developers treat Three.js components like DOM components. They put sensor data in React state, pass it as props through the scene tree, and every data update re-renders the entire 3D scene. Three.js objects are expensive to recreate compared to DOM nodes.

**Consequences:** Stuttering, janky 3D scene. Visually disastrous for a demo meant to impress portfolio reviewers. The "wow factor" becomes a "what's wrong with this" factor.

**Warning signs:**
- FPS drops below 30 when sensor data updates begin
- React DevTools Profiler shows the Canvas/scene components re-rendering on every data tick
- Visible "hitching" when orbiting the camera while data is streaming

**Prevention:**
- **Separate React state from Three.js animation state.** Use Zustand (not React Context or useState) for data that the 3D scene reads. Zustand allows subscribing to slices without triggering React re-renders
- **Use `useFrame` for continuous updates.** R3F's `useFrame` hook runs outside React's render cycle, inside the Three.js animation loop. Read data from a Zustand store or a React ref inside `useFrame`, never from props
- **Never pass sensor data as props to 3D components.** Instead, 3D components subscribe to a store directly via `useStore(state => state.sensorValue)` with selector functions
- **Use `React.memo` on every scene component** that doesn't need to re-render on parent updates
- **Use refs for mutable 3D state** (colors, positions, scale) -- mutate refs in `useFrame`, not via React state

**Detection:** R3F has a built-in `<Stats />` component (from `@react-three/drei`) that shows FPS. If FPS drops below 50 during data streaming, you have a re-render problem.

**Phase mapping:** Must be the architectural decision in Phase 1. Retrofitting state management from props-based to store-based after the scene is built is a near-complete rewrite of every component.

---

### Pitfall 3: Blocking the Main Thread with Simulation Logic

**What goes wrong:** The simulated telemetry generator (producing Mars habitat sensor data with realistic drift, spikes, and correlations) runs on the main thread alongside the Three.js render loop and React's reconciliation. Complex simulation math (noise functions, correlated multi-sensor behavior, anomaly state machines) competes with rendering for CPU time, causing frame drops and input lag. The orbit controls become unresponsive right when the anomaly simulation fires -- the exact moment you want the demo to be most impressive.

**Why it happens:** Developers put the simulation `setInterval` or `requestAnimationFrame` callback in a React component. JavaScript is single-threaded. If simulation logic takes 8ms per tick and rendering takes 10ms, you've blown past the 16.6ms frame budget and FPS drops below 60.

**Consequences:** Stuttering during anomaly events (the most important demo moments). Orbit controls lag. UI panels become sluggish. The demo feels "heavy."

**Warning signs:**
- Chrome DevTools Performance tab shows long tasks (>50ms) in the main thread
- FPS drops correlate with simulation tick frequency
- Interaction latency increases when multiple sensors are simulating simultaneously

**Prevention:**
- **Run simulation in a Web Worker.** The data generator has zero DOM dependencies -- pure math. Move it to a Worker and post messages to the main thread with new sensor values
- If a Web Worker feels like overengineering for a demo, at minimum: keep simulation logic under 2ms per tick, use `requestAnimationFrame` alignment instead of `setInterval`, and batch sensor updates (update all sensors once per frame, not individual timers per sensor)
- Profile simulation code early. If `generateSensorReading()` takes >1ms, it needs optimization or Worker isolation
- Consider generating data in chunks (next 60 values pre-computed) rather than per-tick

**Detection:** `performance.mark()` around simulation logic. If it exceeds 2ms, move to a Worker.

**Phase mapping:** Architecture decision in Phase 1 (simulation engine design). If you build the simulation as inline code first, extracting it to a Worker later requires refactoring all the communication patterns.

---

### Pitfall 4: The "It Looks Like a Dev Project" 3D Scene

**What goes wrong:** The 3D habitat looks like colored boxes floating in a void. No lighting, no shadows, no environment, no post-processing. The demo loses its entire value proposition because it looks like a Three.js tutorial exercise, not a Mars habitat monitoring system. Portfolio reviewers spend 3 seconds before clicking away.

**Why it happens:** Developers focus on data plumbing (correct sensor values, proper state management, clean API integration) and treat visuals as "I'll polish it later." Later never comes, or the polish is superficial. The fundamental scene composition -- lighting, environment, materials -- was never designed for visual impact.

**Consequences:** The demo fails its primary purpose. All the technically excellent data simulation and state management work is invisible behind ugly visuals.

**Warning signs:**
- No environment map or skybox defined
- Using `MeshBasicMaterial` (unlit) instead of `MeshStandardMaterial` or `MeshPhysicalMaterial`
- No shadows enabled on the renderer or lights
- No post-processing pipeline (bloom, tone mapping, ambient occlusion)
- Zone color changes are plain hex colors with no emissive glow or animation

**Prevention:**
- **Budget visual design time equally with engineering time.** For a portfolio demo, visuals ARE the product
- Use `@react-three/drei` aggressively: `<Environment>` for HDR lighting, `<ContactShadows>`, `<Float>` for subtle animation, `<Text>` for 3D labels
- Add post-processing via `@react-three/postprocessing`: bloom (makes emissive alerts glow), tone mapping, vignette
- Use a Mars-themed HDR environment map (rust/orange tones). Free ones available from Polyhaven
- Animated transitions for zone status changes (green -> yellow -> red should lerp, not snap)
- Emissive materials for alert states -- bloom post-processing makes emissive objects physically glow

**Detection:** Screenshot the scene. If it looks flat, unlit, or "programmer art," it needs work. Compare against any Three.js showcase project.

**Phase mapping:** Visual design should be a dedicated phase after the scene structure is built but before data integration. Do not treat it as final polish.

---

### Pitfall 5: Building a Custom 3D Model Pipeline When You Don't Need One

**What goes wrong:** Developer spends days/weeks trying to model the Mars habitat in Blender, learning GLTF export, dealing with material compatibility issues between Blender and Three.js, debugging broken normals, missing UVs, and incorrect scale. The 3D model becomes a project-within-a-project that delays everything else.

**Why it happens:** "Mars habitat" sounds like it needs a detailed 3D model. Developers who aren't 3D artists underestimate how long it takes to create even a simple architectural model that looks good.

**Consequences:** Weeks spent on 3D modeling instead of the actual differentiating features (live data, anomaly simulation, interactive zones). The model still looks amateur.

**Warning signs:**
- Opening Blender tutorials before writing any code
- GLTF files with >5MB of geometry data for a simple habitat
- Time spent on 3D model exceeds time spent on data visualization

**Prevention:**
- **Use procedural geometry.** Build the habitat from Three.js primitives: cylinders for domes, boxes for modules, torus shapes for connectors. Styled with good materials and lighting, procedural geometry looks better than amateur Blender models
- `@react-three/drei` provides `<RoundedBox>`, `<Cylinder>`, `<Sphere>`, `<Torus>` -- compose these
- If a model is desired, use a free pre-made sci-fi/habitat GLTF from Sketchfab (CC licensed) rather than modeling from scratch
- The visual impact comes from materials, lighting, and animation -- not polygon count

**Detection:** If more than 4 hours are spent on 3D modeling tasks, reassess the approach.

**Phase mapping:** Decision in Phase 1 (scene architecture). Choose procedural vs. model-based approach before building zone interaction logic.

---

## Moderate Pitfalls

Mistakes that cause significant rework or degraded quality, but not full rewrites.

---

### Pitfall 6: Canvas Sizing and Responsiveness Nightmares

**What goes wrong:** The Three.js canvas doesn't resize properly when the browser window resizes, when the sidebar opens/closes, or when the dev tools panel opens. The scene renders at the wrong resolution (blurry or cropped), aspect ratios get distorted, and click/raycasting coordinates are wrong (clicking a zone highlights the wrong one).

**Why it happens:** Three.js needs explicit camera aspect ratio updates and renderer size updates when the container resizes. CSS `width: 100%` on a canvas doesn't work the way it does for DOM elements. The pixel ratio also matters -- without `devicePixelRatio`, the scene looks blurry on Retina displays.

**Prevention:**
- Use R3F's `<Canvas>` component, which handles resize automatically via `ResizeObserver`
- Set the Canvas to fill its parent container with CSS `width: 100%; height: 100%` on the parent, not the canvas
- Set `dpr={[1, 2]}` on the Canvas to handle Retina displays without going overboard (capping at 2x prevents 3x devices from killing performance)
- If using a split layout (3D scene + data panels), put the Canvas in a flex/grid child with `overflow: hidden`
- Test at multiple viewport sizes, including with browser DevTools open (which shrinks the viewport)

**Detection:** Resize the browser window. If the scene is blurry, stretched, or click targets are offset, sizing is broken.

**Phase mapping:** Scene setup phase. Get this right when creating the Canvas, not after building the full scene.

---

### Pitfall 7: Click/Raycast Interaction Conflicts with Orbit Controls

**What goes wrong:** Users try to click on a habitat zone to drill down, but the click also triggers an orbit control drag. Or worse, the click handler fires on mouse-up after a drag, so every camera orbit ends with an accidental zone selection. The interaction feels broken and unprofessional.

**Why it happens:** Both orbit controls (camera rotation/pan/zoom) and click handlers listen to the same mouse events. Without proper separation between "click" and "drag," every interaction is ambiguous.

**Prevention:**
- Use R3F's event system (`onClick`, `onPointerDown`, etc.) on mesh components rather than manual raycasting
- Implement click-vs-drag discrimination: track the pointer position on `pointerdown` and only fire the click handler on `pointerup` if the pointer moved less than a threshold (e.g., 5px)
- `@react-three/drei`'s `<OrbitControls>` has a `makeDefault` prop that properly integrates with R3F's event system
- Consider using `onPointerOver`/`onPointerOut` for hover highlights (visual feedback that zones are interactive) -- this improves UX and doesn't conflict with orbit controls
- Set `cursor: pointer` on hoverable meshes via R3F's `onPointerOver` to signal interactivity

**Detection:** Try to orbit the camera by clicking and dragging across a zone. If the zone's click handler fires, you have a conflict.

**Phase mapping:** Zone interaction phase. Address when implementing clickable zones.

---

### Pitfall 8: Zustand/Store Architecture Coupling 3D and UI State

**What goes wrong:** A single flat store holds everything: camera position, selected zone, sensor data for all zones, anomaly states, UI panel visibility, alert history. Components subscribe to the whole store or poorly scoped slices. Updating one sensor value re-renders the alert panel, the zone status indicators, and the orbit controls simultaneously.

**Why it happens:** Developers start with one store for simplicity. As features accumulate, the store grows monolithic. No separation between "things that change at 60fps" (animations, interpolated values) and "things that change per second" (sensor readings) and "things that change on user action" (selected zone, panel visibility).

**Prevention:**
- **Separate stores by update frequency:**
  - `useSimulationStore` -- sensor values, anomaly states (updates every 1-2 seconds)
  - `useSceneStore` -- selected zone, hover state, camera mode (updates on user action)
  - `useAlertStore` -- active alerts, warning levels (updates on threshold crossings)
- Use Zustand's selector pattern: `useSimulationStore(s => s.zones.atmosphere.co2)` -- only re-renders when that specific value changes
- Never put animation/interpolation state in any store. Use refs and `useFrame` for anything that changes per-frame (color lerping, scale pulsing, position tweening)

**Detection:** React DevTools Profiler. If changing one sensor value causes >3 components to re-render, the store is too coupled.

**Phase mapping:** Phase 1 (architecture). Store structure must be designed before components are built.

---

### Pitfall 9: Anomaly Simulation That Doesn't Feel Real

**What goes wrong:** Anomalies are binary switches: CO2 is either normal or spiked. The transition is instant. There's no buildup, no cascading effects, no recovery curve. The demo feels like toggling a boolean, not witnessing a crisis in a Mars greenhouse. Portfolio reviewers are unimpressed because it looks like a toy.

**Why it happens:** Implementing realistic anomaly behavior (gradual onset, correlated sensor impacts, realistic recovery curves) is genuinely harder than flipping a flag. Developers implement the toggle first and never upgrade it.

**Prevention:**
- Design anomaly curves, not anomaly events. A CO2 spike should: gradually rise over 10-20 seconds, trigger secondary effects (temperature increase from plant stress, O2 decrease), hit the alert threshold with visual drama, then either auto-recover with a realistic decay curve or persist until the user intervenes
- Use easing functions for anomaly progression (exponential rise, logarithmic decay)
- Define sensor correlations in the simulation model: a pump failure in Water Recycling should affect pH, EC, and dissolved oxygen -- not just one value
- Plan the anomaly "theater" -- what visual sequence does the user see? Zone goes yellow, then orange, then red with bloom glow, alert panel slides in, warning sound plays. Map this storyboard before coding

**Detection:** Trigger an anomaly and record the screen. Watch it back. If the entire event takes <2 seconds or looks like a CSS class toggle, it needs more drama.

**Phase mapping:** Anomaly simulation phase. But the data simulation architecture in Phase 1 must support gradual transitions and multi-sensor correlation, or this becomes a rewrite.

---

### Pitfall 10: React 19 + R3F Compatibility Friction

**What goes wrong:** The project uses React 19. React-three-fiber and the drei ecosystem may have subtle compatibility issues with React 19's changed behavior around refs, effects cleanup, and concurrent features. Components silently break, effects fire twice in development (StrictMode), or refs become null unexpectedly.

**Why it happens:** React 19 changed several internal behaviors. R3F and drei are actively maintained but the ecosystem moves fast, and edge cases with React 19 may exist, particularly around `useEffect` cleanup timing and ref forwarding patterns.

**Prevention:**
- Pin `@react-three/fiber` and `@react-three/drei` to specific known-good versions rather than using `^` ranges
- Test with React StrictMode enabled (effects will fire twice in dev). If the 3D scene breaks under StrictMode, there's a cleanup bug
- If StrictMode causes intractable issues with the 3D scene specifically, wrap the Canvas route in a StrictMode exemption (but document why)
- Check R3F's GitHub issues for React 19 compatibility reports before starting

**Detection:** Console warnings about deprecated lifecycle methods, unexpected double-mounting of 3D objects, or refs that are null when they shouldn't be.

**Phase mapping:** Dependency installation phase. Verify compatibility before writing any Three.js code.

---

### Pitfall 11: Real-Time Data Updates That Overwhelm the DOM Panels

**What goes wrong:** The zone drill-down panels show live sensor feeds updating every second. With 6-8 sensors per zone, each updating a React component, the DOM-side of the app becomes sluggish. The 3D scene is fine (it uses refs/stores), but the data panels are re-rendering constantly, causing the scroll position to jump, table rows to flash, and the overall UI to feel jittery.

**Why it happens:** Sensor data panels are standard React components with state-driven rendering. Each sensor update causes a cascade of re-renders through the panel component tree.

**Prevention:**
- Use `React.memo` with custom comparison functions on sensor value display components
- Debounce or throttle UI updates to 500ms even if the underlying data updates at 1s intervals. Humans can't read values that change every second anyway
- Use CSS animations (transitions on `color`, `background-color`) for visual feedback instead of React re-renders for value changes
- Consider a fixed-layout table (no dynamic row counts) so the DOM structure doesn't change -- only text content updates
- Use `requestAnimationFrame` batching for DOM updates when multiple sensor values arrive simultaneously

**Detection:** Open React DevTools Profiler. If the data panel components show >2 renders per second, they're over-updating.

**Phase mapping:** UI panel implementation phase. Design the update strategy before building the panel components.

---

## Minor Pitfalls

Issues that cause small time losses or quality degradation.

---

### Pitfall 12: Forgetting Mobile GPU Limits (Even for Desktop-First)

**What goes wrong:** The demo works perfectly on the developer's machine (discrete GPU, 32GB RAM) but runs at 10 FPS on a reviewer's MacBook Air (integrated GPU) or stutters on a screen-share during an interview call (GPU throttled by screen capture).

**Why it happens:** "Desktop-first" doesn't mean "beefy desktop only." Portfolio reviewers often use laptops, and screen-sharing reduces available GPU resources.

**Prevention:**
- Test on an integrated GPU machine (or throttle GPU in Chrome DevTools)
- Set `dpr={[1, 2]}` to cap pixel ratio
- Keep draw calls under 100 (use `renderer.info.render.calls` to monitor)
- Limit shadow map resolution to 1024 or 2048
- Use `<PerformanceMonitor>` from drei to automatically reduce quality on slow devices
- Avoid transparency on large surfaces (transparency breaks hardware z-buffer optimizations)

**Detection:** Open Chrome DevTools > Rendering > Frame Rendering Stats. If FPS is below 30, optimize.

**Phase mapping:** Performance optimization, but set the constraints during scene setup.

---

### Pitfall 13: No Loading State for the 3D Scene

**What goes wrong:** User navigates to `/habitat` and sees a blank white rectangle for 1-3 seconds while Three.js initializes, textures load, and the scene compiles shaders. It looks broken. They might navigate away thinking the page is crashed.

**Why it happens:** Three.js has a non-trivial initialization cost. Shader compilation, texture upload, and geometry buffer creation all happen before the first frame renders.

**Prevention:**
- Use R3F's `<Suspense>` boundary around the Canvas with a styled fallback (loading spinner or "Initializing Mars Habitat..." text)
- Use drei's `<Loader>` for a progress bar overlay
- Preload critical assets with `useLoader.preload()` or drei's `<Preload>` component
- Consider a quick "fade in" animation once the scene is ready, rather than a jarring pop-in

**Detection:** Hard refresh the `/habitat` page. If there's a blank white gap before the scene appears, you need a loading state.

**Phase mapping:** Scene setup phase. Add the Suspense boundary when creating the Canvas component.

---

### Pitfall 14: Z-Fighting on Coplanar Surfaces

**What goes wrong:** Zone highlight overlays (colored transparent planes indicating zone boundaries) flicker and shimmer when viewed at certain angles. The zone border appears to "fight" with the habitat floor, creating an ugly visual artifact.

**Why it happens:** Two surfaces at the same Z depth compete for the same depth buffer values. The GPU can't determine which is in front, so the result alternates per-pixel, creating shimmer.

**Prevention:**
- Offset overlay planes by a small amount (`position-y={0.01}`)
- Use `polygonOffset` on materials: `polygonOffset={true} polygonOffsetFactor={-1}`
- Avoid coplanar decals. Use emissive materials on the zone meshes themselves rather than overlaying transparent planes
- For zone outlines, use `<Edges>` from drei or a separate wireframe pass

**Detection:** Slowly orbit the camera. If any surfaces flicker or shimmer, you have z-fighting.

**Phase mapping:** Zone visualization phase. Easy to fix but easy to forget.

---

### Pitfall 15: Hardcoded Colors and Thresholds Scattered Across Components

**What goes wrong:** Zone status colors (green/yellow/red) are defined as hex values in 5 different components. Sensor thresholds that trigger status changes are hardcoded in both the simulation engine and the display components. Changing a threshold requires editing multiple files and hoping you catch them all.

**Why it happens:** "I'll centralize it later" plus copy-paste development.

**Prevention:**
- Create a `constants/habitat.ts` file from day one with:
  - Zone definitions (IDs, names, positions, sensor lists)
  - Threshold definitions per sensor type (warning, critical ranges)
  - Color palette (normal, warning, critical, inactive)
  - Anomaly scenario definitions
- Both the simulation engine and display components import from this single source of truth

**Detection:** Search the codebase for hex color values or magic numbers. If the same value appears in multiple files, centralize it.

**Phase mapping:** Phase 1 foundation. Define constants before writing components that use them.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Three.js/R3F setup | React 19 compatibility issues (#10) | Pin dependency versions, test StrictMode |
| Scene foundation | Canvas sizing wrong (#6), no loading state (#13) | Use R3F's Canvas with proper parent CSS, add Suspense |
| State architecture | Monolithic store (#8), React re-renders killing FPS (#2) | Design separate stores by update frequency, use refs for animation state |
| Habitat geometry | Wasting time on Blender (#5), z-fighting (#14) | Use procedural geometry, offset overlays |
| Visual design | "Dev project" aesthetics (#4) | Budget visual design time, use drei helpers + post-processing |
| Zone interactions | Click/drag conflicts (#7) | Implement pointer movement threshold, use R3F event system |
| Simulation engine | Blocking main thread (#3), unrealistic anomalies (#9) | Consider Web Worker, design anomaly curves not events |
| Data panels | DOM update overload (#11) | Throttle UI updates, use React.memo with selectors |
| Real-time data flow | GPU memory leaks (#1), scattered thresholds (#15) | Disposal patterns from day one, centralized constants file |
| Performance polish | Laptop GPU failure (#12) | Test on integrated GPU, cap draw calls and DPR |

---

## Existing Codebase Pitfalls (Inherited Risk)

These are issues from the current codebase (documented in CONCERNS.md) that specifically intersect with the Mars habitat feature.

### Double API Path Bug Will Bite New Endpoints
The existing `api.ts` has a `/api/api/` path bug. If new habitat API functions follow the same pattern as `fetchRawSensorData`, they'll hit wrong endpoints. **Fix the bug before adding habitat endpoints.**

### `any` Types Will Spread Into 3D Code
Every existing page uses `any[]` for data. If the habitat feature imports from existing type files or follows existing patterns, the new 3D components will inherit zero type safety. Sensor data flowing into Three.js material properties as `any` is a silent bug factory. **Define proper types for habitat data from scratch, do not follow existing patterns.**

### No Tests Means No Safety Net for Backend Changes
New Django endpoints for habitat zones will be added to an untested codebase. If the new endpoints accidentally break existing ones (URL conflicts, serializer changes), nothing catches it. **At minimum, add smoke tests for existing endpoints before modifying `urls.py`.**

---

## Sources

- Three.js disposal documentation: https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
- React-three-fiber documentation and pitfalls section: https://r3f.docs.pmnd.rs/
- @react-three/drei documentation: https://drei.docs.pmnd.rs/
- @react-three/postprocessing documentation: https://react-postprocessing.docs.pmnd.rs/
- Zustand documentation: https://zustand.docs.pmnd.rs/
- Three.js performance tips: https://discoverthreejs.com/tips-and-tricks/
- Confidence note: All findings based on training data (through May 2025). WebSearch and WebFetch were unavailable for verification. Core Three.js disposal and R3F architectural patterns are well-established and unlikely to have changed significantly.

---

*Pitfalls audit: 2026-03-09*
