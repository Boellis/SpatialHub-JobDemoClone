# Domain Pitfalls

**Domain:** 3D interactive IoT data visualization (Three.js + React + real-time simulated telemetry)
**Project:** SpatialHub Mars Habitat Demo
**Researched:** 2026-03-09 (v1.0), 2026-03-14 (v2.0 BioSim addendum)
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

---

# v2.0 BioSim Integration Pitfalls

**Domain addition:** Replacing client-side simulation with NASA BioSim (Java WebSocket service) + Docker infrastructure + Django bridge
**Researched:** 2026-03-14
**Confidence:** HIGH for Django/WebSocket/Docker patterns (verified against official docs + multiple sources). MEDIUM for BioSim-specific behavior (limited external documentation; inferred from architecture + research).

---

## Critical Pitfalls (BioSim Integration)

---

### Pitfall 16: WebSocket Connection Never Actually Closed — Memory Leaks on Navigation

**What goes wrong:** The frontend WebSocket client connects to BioSim on component mount. The user navigates away from `/habitat`. The WebSocket connection remains open, event listeners are never removed, and the message handler keeps processing BioSim ticks and writing to the Zustand store — even though the component is unmounted. After returning to `/habitat`, a second connection opens alongside the ghost first one. Memory climbs. The Zustand store gets written by two concurrent sources with conflicting data.

**Why it happens:** React `useEffect` cleanup is opt-in. Developers write `new WebSocket(url)` and register `onmessage` callbacks but don't return a cleanup function. StrictMode in development mounts components twice, exposing this bug immediately — but only if you're looking for it. Under production, the double-mount doesn't happen and the leak hides until the user navigates a few times.

**Consequences:** Multiple simultaneous WebSocket connections to BioSim (a Java process with limited connection handling), store state written by stale handlers, memory growth on each navigation, and confusing sensor data that reflects both current and stale simulation state.

**Prevention:**
```typescript
useEffect(() => {
  const ws = new WebSocket(`ws://localhost:8009/ws/simulation/${simId}`);
  ws.onmessage = (event) => { /* map BioSim state to Zustand */ };
  ws.onerror = (err) => { /* handle */ };
  // Return cleanup — this is not optional
  return () => {
    ws.close();
    ws.onmessage = null;
    ws.onerror = null;
  };
}, [simId]);
```
- Encapsulate in a `useBioSimWebSocket` custom hook so cleanup is consistent across consumers
- Test by navigating to `/habitat` and away 5 times in quick succession; verify only one active WebSocket connection in DevTools > Network > WS

**Warning signs:**
- DevTools Network tab shows multiple WS connections to port 8009 after navigating back to `/habitat`
- BioSim logs show repeated new subscriptions without prior disconnections
- Zustand store receives duplicate ticks (two updates per BioSim tick)

**Phase to address:** WebSocket client implementation phase. Get cleanup right before any other logic is added.

---

### Pitfall 17: BioSim WebSocket Message Flooding React Re-Renders

**What goes wrong:** BioSim broadcasts the full simulation state after every tick. The tick rate is not bounded to our 2-second rendering interval. If BioSim ticks faster than 500ms (which it can, depending on XML config and `--writeTicks` mode), the WebSocket fires 2-5 messages per second, each triggering a Zustand update, each triggering React re-renders across every subscribed component in the 3D scene and data panels. The 3D scene frame rate collapses from 60 FPS to 20 FPS as React and Three.js fight for the main thread.

**Why it happens:** The `onmessage` handler calls `useHabitatStore.setState()` directly. Every setState call from outside React (WebSocket callback is outside React's event system) triggers a synchronous re-render cascade. React 18 introduced automatic batching inside React events, but WebSocket callbacks are not React events.

**Consequences:** Frame rate destruction, CPU peg at 100%, UI freezing under high tick rates, and a demo that degrades catastrophically on slower machines.

**Prevention:**
- Buffer incoming WebSocket messages in a `useRef` array (NOT React state)
- Flush the buffer into Zustand on a `requestAnimationFrame` cadence — this collapses N messages per frame into one store update per frame
- Alternatively, throttle the flush to align with the 2-second render interval: only apply the most recent BioSim state snapshot received in the last 2 seconds
- Configure BioSim's tick rate in the XML scenario config to be no faster than 1-2 seconds per tick for demo purposes

```typescript
const bufferRef = useRef<BioSimState[]>([]);

ws.onmessage = (event) => {
  bufferRef.current.push(JSON.parse(event.data));
};

useEffect(() => {
  let rafId: number;
  const flush = () => {
    if (bufferRef.current.length > 0) {
      const latest = bufferRef.current[bufferRef.current.length - 1];
      bufferRef.current = [];
      useHabitatStore.getState().applyBioSimSnapshot(latest);
    }
    rafId = requestAnimationFrame(flush);
  };
  rafId = requestAnimationFrame(flush);
  return () => cancelAnimationFrame(rafId);
}, []);
```

**Warning signs:**
- FPS drops below 30 immediately when BioSim WebSocket connects
- Chrome DevTools > Performance shows `onmessage` handler in long tasks
- CPU usage spikes to 100% when BioSim is running

**Phase to address:** WebSocket client implementation phase, before wiring to Zustand store.

---

### Pitfall 18: Docker Compose Startup Race — Django Starts Before BioSim is Ready

**What goes wrong:** `docker compose up` starts all services simultaneously. Django starts in 3-5 seconds. BioSim (a JVM application) takes 30-60 seconds to fully initialize. The Django bridge service (management command connecting to BioSim WebSocket) starts, attempts to connect to `ws://biosim:8009/ws/simulation/...`, gets a connection refused error, and crashes — silently. The Django container stays up, but the bridge is dead. No data flows into PostgreSQL. The demo shows stale or empty historical data with no error surfaced to the user.

**Why it happens:** `depends_on: biosim` in Docker Compose only waits for the container to start running — not for BioSim's HTTP API to be ready to serve requests. A Java process starting is not the same as a Java service being ready.

**Consequences:** Silent failure of the Django bridge. No error in Django logs (the management command crashed during startup). BioSim is running fine but nobody is ingesting its data.

**Prevention:**
```yaml
services:
  biosim:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8009/api/simulation"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 90s  # JVM takes time; give it 90s grace before counting failures

  django:
    depends_on:
      biosim:
        condition: service_healthy  # NOT the default "service_started"
```
- If the BioSim image doesn't include `curl`, use `wget -q -O- http://localhost:8009/api/simulation` or install curl in the health check image
- The Django bridge management command should implement its own exponential backoff retry loop — do not assume BioSim is ready on first attempt

**Warning signs:**
- `docker compose up` completes but `/api/enriched/` returns empty data
- Django management command logs show connection refused errors at startup and nothing after
- BioSim container shows "healthy" but bridge started too early

**Phase to address:** Docker infrastructure phase. Define healthchecks before writing the bridge management command.

---

### Pitfall 19: BioSim Data Model Mismatch — Module Hierarchy vs. Flat Zone Model

**What goes wrong:** BioSim exposes dozens of modules with nested properties: `OGS.O2ProducerO2Store.currentLevel`, `VCCR.CO2ConsumerCO2Store.currentLevel`, `BiomassRS1.plantGrowthModule.cropGrowthRate`, etc. Our habitat model has 4 flat zones with 3 sensors each. The naive mapping approach assigns each BioSim module property directly to a sensor ID. This breaks in three ways: (1) BioSim module names change between scenario XML configs, breaking the mapping silently; (2) multiple BioSim modules map to the same zone sensor (e.g., both O2 and CO2 affect the "Atmosphere" zone status), requiring aggregation logic that wasn't designed; (3) BioSim reports raw resource flow rates and tank levels, not the "human-readable" values our thresholds expect (Pa vs. %, mol/hour vs. ppm).

**Why it happens:** The mapping looks trivial in a planning doc: "OGS -> Atmosphere Control." But OGS produces `O2ProducerO2Store` in mol/tick, and our atmosphere sensor expects `%O2` in percentage. These are different units, different ranges, and different failure semantics.

**Consequences:** Threshold logic breaks (values never enter red/yellow states because units are wrong), zone statuses stop reflecting reality, and anomaly injection produces effects in BioSim that are invisible in the 3D visualization.

**Prevention:**
- Build a dedicated `biosimMapper.ts` translation layer with explicit, documented mappings:
  ```typescript
  // Each entry must document: BioSim module path, BioSim units, our units, conversion formula
  const BIOSIM_SENSOR_MAP: BioSimSensorMapping[] = [
    {
      sensorId: 'ac-o2',
      bioSimPath: 'OGS.O2ProducerO2Store.currentLevel',
      bioSimUnit: 'mol',
      ourUnit: '%O2',
      convert: (mol: number) => (mol / TOTAL_AIR_MOLES) * 100,
    },
    // ...
  ];
  ```
- Unit-test the mapper independently — feed known BioSim state snapshots and assert correct `ZoneState` output
- Keep thresholds in `constants.ts` using our units (%) not BioSim units (mol) — the mapper handles the conversion
- Design the mapper to return `null` for unmapped properties rather than 0 — so missing mappings are detectable, not silently zeroed

**Warning signs:**
- Sensor values show 0 or stay at nominal even when BioSim malfunctions are active
- Zone status never enters yellow/red despite simulated anomalies
- Console errors about undefined BioSim properties

**Phase to address:** Data mapping design must happen before the WebSocket client is wired to the store. Get the mapper working and tested against real BioSim state snapshots before connecting the frontend.

---

### Pitfall 20: Django WSGI + Async WebSocket Bridge — Mixing Sync and Async Without ASGI

**What goes wrong:** The Django bridge needs to maintain a long-running WebSocket connection to BioSim. But Django 5.x under Gunicorn (WSGI) doesn't support long-lived async connections natively. A management command that uses Python's `asyncio` event loop to run a WebSocket client will work — until it tries to write sensor data to PostgreSQL via Django's ORM. The ORM is synchronous. Calling it from inside an async coroutine either deadlocks (`SynchronousOnlyOperation` exception) or blocks the entire asyncio event loop, preventing WebSocket message receipt while the DB write is in progress.

**Why it happens:** Django's ORM has an async check (`SynchronousOnlyOperation`) that raises when called from inside an async context. Developers either hit this wall immediately, or (worse) they suppress it and block the event loop instead.

**Consequences:** The bridge either crashes with `SynchronousOnlyOperation` on the first DB write, or silently drops WebSocket messages during DB writes (data gaps in historical records), or freezes entirely if the DB write takes >1 tick worth of time.

**Prevention:**
- In the management command's async event loop, use `asyncio.to_thread()` to run ORM writes in a thread pool:
  ```python
  async def handle_tick(self, biosim_state: dict):
      readings = self.mapper.transform(biosim_state)
      # ORM write dispatched to thread, event loop stays free for next WS message
      await asyncio.to_thread(self._write_to_db, readings)

  def _write_to_db(self, readings: list):
      EnrichedSensorData.objects.bulk_create(readings)
  ```
- Alternatively, use Django Channels + ASGI and deploy with Daphne or Uvicorn instead of Gunicorn — but this changes the deployment model and adds infrastructure complexity
- Never call `django.db.connection.close()` from inside a thread pool worker — Django manages connections per-thread automatically
- Call `django.db.close_old_connections()` periodically in long-running management commands to prevent connection pool exhaustion

**Warning signs:**
- `SynchronousOnlyOperation` exception in bridge logs
- DB write gaps — BioSim ticks arriving but `enriched_sensor_data` row counts not keeping pace
- Bridge process CPU stuck at 100% (blocked event loop)

**Phase to address:** Django bridge implementation phase. Design the async/sync boundary before writing any ORM code.

---

### Pitfall 21: Fallback Mode Race Condition During BioSim Startup

**What goes wrong:** The frontend detects BioSim availability by attempting a WebSocket connection. If BioSim is still initializing (JVM startup, scenario loading), the connection attempt fails. The fallback code activates `createSimulationEngine()` (the old client-side simulation). 15 seconds later, BioSim is ready and the frontend opens a second WebSocket connection. Now both the client-side simulation engine AND the BioSim WebSocket are writing to the Zustand store simultaneously. Sensor values oscillate between the two data sources. Zone statuses flicker.

**Why it happens:** The fallback detection runs once on mount with no retry logic. The fallback engine starts immediately on failure. When BioSim becomes available later, there's no mechanism to shut down the fallback and transition to live data.

**Consequences:** Data corruption in the store (two writers, no arbitration), flickering zone statuses, and a demo that shows nonsensical sensor behavior when BioSim starts up slowly.

**Prevention:**
- Implement the fallback as a state machine, not a one-time check:
  - `CONNECTING` → attempt WS connection, wait 30s
  - `LIVE` → BioSim connected, engine stopped
  - `FALLBACK` → BioSim unavailable, engine running
  - `RECOVERING` → BioSim connection restored, transitioning (stop engine, wait for first valid WS tick, then switch)
- The store must have exactly one active data source at any time — enforce this with a mutex flag (`dataSource: 'biosim' | 'engine' | 'none'`)
- Stop the client-side engine before switching to BioSim, not after

```typescript
// In habitatStore.ts
switchToBioSim: () => {
  const { isRunning } = get();
  if (isRunning) {
    get().stopSimulation(); // stop engine FIRST
  }
  set({ dataSource: 'biosim', isRunning: false });
},
```

**Warning signs:**
- Zone status flickering between green and red on page load
- `console.log` shows both `[SimulationEngine] Started` and `[BioSimWS] Connected` at the same time
- Sensor history shows alternating patterns inconsistent with either source alone

**Phase to address:** Fallback mode design phase. The state machine must be designed before either the engine or WS client is wired to the store.

---

### Pitfall 22: GPL v3 License Boundary — Code Linking vs. Network Communication

**What goes wrong:** A developer links against BioSim source files directly (imports Java code, copies BioSim utility classes into the Django project, or wraps BioSim as a Python library via Jython/subprocess with shared memory IPC). This constitutes linking under GPL v3, which means the entire SpatialHub project must be released under GPL v3 or a compatible license. For a portfolio project this is academic, but it's the kind of detail that signals license sophistication to a reviewer.

**Why it happens:** "I just needed one utility function" from BioSim — it's faster than reimplementing it. Or the developer assumes Docker isolation = license isolation.

**The actual rule:** GPL v3's copyleft applies to derivative works and combined works through code linkage. Communication over network sockets (REST, WebSocket) between separate processes is explicitly not code linking. Separate processes communicating over TCP are independent programs. Docker containers running on a shared network are communicating over network sockets — that's safe.

**What is safe:**
- `docker compose up` with BioSim as a separate container — safe
- Frontend WebSocket connecting to `ws://biosim:8009` — safe
- Django making HTTP calls to `http://biosim:8009/api/` — safe

**What is NOT safe:**
- Copying BioSim Java source files into this repository
- Using BioSim as a Java library (JAR on classpath)
- Importing BioSim utility classes in Python via subprocess + shared memory
- Distributing a modified version of BioSim bundled with SpatialHub without GPL disclosure

**Prevention:**
- Keep BioSim as a Docker image only — never bring BioSim source or JARs into the SpatialHub codebase
- Add a comment in `docker-compose.yml` noting the GPL v3 boundary: `# BioSim (GPL v3) runs as isolated service; communication via REST/WebSocket only`
- Do not fork BioSim to add features — submit upstream PRs or use the existing API

**Warning signs:**
- Any BioSim `.java` or `.jar` files in the SpatialHub repository
- `import biosim.*` in any Python or JavaScript file

**Phase to address:** Docker infrastructure setup phase. Establish this as a policy before anyone "just adds" BioSim files.

---

### Pitfall 23: CORS and Docker Network Confusion — Frontend Pointing at Wrong BioSim Address

**What goes wrong:** The frontend React app connects to BioSim at `ws://biosim:8009/ws/simulation/...`. This works perfectly inside Docker's network. The developer opens the frontend at `localhost:5173` (running outside Docker via `npm run dev`). The browser tries to resolve `biosim` as a hostname — it's not in `/etc/hosts`, DNS fails, WebSocket connection fails, fallback activates. The developer never sees BioSim data in development.

**Why it happens:** Docker Compose service names (`biosim`, `django`, `postgres`) are valid hostnames only inside the Docker network. From the host machine (where the browser runs), these names don't resolve.

**Consequences:** BioSim integration cannot be tested with the standard `npm run dev` workflow. Developers either give up on local testing or misconfigure addresses in ways that break Docker deployments.

**Prevention:**
- The correct address from the browser (running on the host) is always `localhost:<port>`, never the Docker service name
- Configure BioSim's Docker port mapping: `ports: ["8009:8009"]` so it's accessible as `ws://localhost:8009`
- In the frontend, use an environment variable: `VITE_BIOSIM_WS_URL=ws://localhost:8009` for development, configure it differently for production
- If Django proxies the BioSim WebSocket (for a single-origin setup), the frontend connects to `ws://localhost:8000/ws/biosim/` and Django proxies to `ws://biosim:8009` — eliminates CORS entirely

**Warning signs:**
- WebSocket errors mentioning DNS resolution failure for `biosim`
- Works in `docker exec -it django bash` but not from the browser
- Developer adds `biosim` to `/etc/hosts` as a workaround (this is the smell)

**Phase to address:** Docker infrastructure phase. Document the host-vs-container addressing difference in the first commit that adds `docker-compose.yml`.

---

## Moderate Pitfalls (BioSim Integration)

---

### Pitfall 24: BioSim Simulation State Lost on Container Restart

**What goes wrong:** BioSim is restarted (developer does `docker compose restart biosim` to apply config changes). The simulation state resets to zero — all resource levels, crew state, crop growth — back to initial conditions from the XML config. The Django bridge doesn't know the simulation ID has changed (a new simulation was started). The bridge reconnects to the old `simId`, gets 404s from BioSim, and silently stops ingesting data. The frontend shows stale zone statuses from before the restart.

**Why it happens:** BioSim does not persist simulation state between process restarts (no mention of state files in its documentation). The `simId` returned by `POST /api/simulation/start` is ephemeral. No mechanism coordinates the current `simId` between BioSim, the bridge, and the frontend.

**Prevention:**
- The bridge management command should: (1) query `/api/simulation` to list active simulations on startup, (2) use an existing simId if one exists, (3) start a new simulation if none exist
- Store the active `simId` in a known location (environment variable, Redis, or a simple file) shared between bridge and frontend
- The frontend should also query for the current `simId` on mount, not hardcode it
- For demo stability, always restart the full `docker compose` stack together — not individual services

**Warning signs:**
- Historical data stops updating after any `docker compose restart`
- Frontend zone status shows data from hours ago
- Bridge logs show 404s from BioSim module endpoints

**Phase to address:** Django bridge implementation. The bridge startup sequence must include simulation discovery before subscribing.

---

### Pitfall 25: AnomalyDrawer Rewire — Malfunction API Not Idempotent

**What goes wrong:** The AnomalyDrawer sends a POST to `BioSim /api/simulation/{simId}/modules/OGS/malfunctions` when a user triggers a scenario. The user clicks "CO2 Spike" twice (accidentally double-clicking, or re-triggering). Two identical malfunction records are created in BioSim. The effects stack, producing a scenario twice as severe as intended. The UI still shows the anomaly as "active" (it can't distinguish 1 vs 2 malfunction records) and the "cancel" button only clears one. The second malfunction persists invisibly.

**Why it happens:** The BioSim malfunction API creates records on every POST — it's not idempotent. Our existing client-side anomaly toggle logic (toggle = cancel if active) doesn't account for duplicate server-side records.

**Prevention:**
- Before POSTing a malfunction, GET the current malfunction list and check if one already exists for this module
- Use `DELETE /api/simulation/{simId}/modules/{moduleName}/malfunctions` (clears ALL malfunctions) rather than tracking individual malfunction IDs
- In the AnomalyDrawer, disable the trigger button immediately after click and re-enable only after confirmation from BioSim
- Implement debounce or a loading state on the button to prevent double-clicks

**Warning signs:**
- Anomaly effects are stronger than expected (2x the intended severity)
- Cancel button doesn't fully resolve the anomaly — sensors recover partially then stay red
- BioSim malfunction list shows duplicate entries

**Phase to address:** AnomalyDrawer rewire phase. Handle the idempotency gap before exposing the UI.

---

### Pitfall 26: `enriched_sensor_data` Write Volume — Django Bridge Flooding PostgreSQL

**What goes wrong:** BioSim ticks every N seconds. The Django bridge transforms each tick into 12 sensor readings (one per sensor across 4 zones) and bulk-inserts into `enriched_sensor_data`. At 1 tick/2 seconds, that's 6 rows per second, 360 per minute, 21,600 per hour. Over a demo session of 3 hours, `enriched_sensor_data` grows by ~65,000 rows. The `/api/enriched/` endpoint, which currently does `objects.all()` with no pagination, returns all 65,000 rows in a single response. The `/trends` page breaks.

**Why it happens:** The existing endpoint has no pagination and no date range filtering. The `CONCERNS.md` documents this as a known performance issue. BioSim integration adds a continuous write source that makes this theoretical issue into an actual one within hours.

**Prevention:**
- Add server-side pagination to `/api/enriched/` before enabling the bridge (add `PageNumberPagination` to DRF settings)
- Add a date range filter: `/api/enriched/?hours=1` returns only the last hour
- Add a database index on `enriched_sensor_data.datetime` — `order_by('-datetime')` without an index is a full table scan
- Consider a data retention policy: the bridge deletes rows older than 24 hours on each write cycle

**Warning signs:**
- `/api/enriched/` response time grows over the demo session (1s → 10s → timeout)
- Memory usage spikes when the trends page loads
- Duplicate existing CONCERNS.md entry — this IS the known bug, now triggered

**Phase to address:** Django bridge phase, before enabling continuous writes. Fix pagination first.

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-----------------|
| BioSim WebSocket | Connecting to `ws://biosim:8009` from browser | Connect to `ws://localhost:8009` from browser; Docker service names are internal-only |
| BioSim REST | Hardcoding `simId = 1` | Query `/api/simulation` on startup; the ID is dynamically assigned |
| Django bridge | Calling `Model.objects.create()` inside async coroutine | Use `asyncio.to_thread(lambda: Model.objects.create(...))` |
| Docker Compose | `depends_on: biosim` without `condition: service_healthy` | Always use `condition: service_healthy` with a proper healthcheck for JVM services |
| Malfunction API | One POST per anomaly trigger click | Check existing malfunctions before posting; use DELETE-all on cancel |
| Fallback mode | Starting client-side engine on first WS failure | Implement retry with backoff; only activate fallback after N consecutive failures |
| BioSim tick data | Mapping raw mol values directly to sensor thresholds | Write explicit unit conversion functions in `biosimMapper.ts` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| WebSocket flooding Zustand | FPS < 30 when BioSim connected | Buffer messages in ref, flush on RAF | Immediately if BioSim tick < 500ms |
| `enriched_sensor_data` unbounded growth | `/api/enriched/` timeout after 1hr of bridge running | Paginate + index + retention policy | ~3 hours of continuous bridge operation |
| Two simultaneous data sources | Zone status flickers between green/red | State machine with single active source | During BioSim startup/restart |
| Django ORM blocking async event loop | Bridge drops WS messages during DB writes | `asyncio.to_thread()` for all ORM calls | On first DB write if event loop blocks |
| Docker JVM health check too aggressive | BioSim marked unhealthy before fully started | `start_period: 90s` in healthcheck config | Every cold start without start_period |

---

## "Looks Done But Isn't" Checklist

- [ ] **WebSocket cleanup:** Return function from `useEffect` closes connection AND nulls handlers — verify with DevTools > Network > WS after navigating away
- [ ] **Fallback mode:** Both the engine AND the WS client are never active simultaneously — verify with `console.log` on both data sources
- [ ] **Unit conversion:** BioSim mol/Pa/kg values converted to our %/kPa/kg-equiv sensor units — verify thresholds trigger correctly during a simulated SEVERE_MALF
- [ ] **SimId persistence:** Bridge reconnects to the same simulation after restart, not a new one — verify by restarting only the bridge container
- [ ] **Malfunction idempotency:** Double-clicking an anomaly button does not stack malfunctions — verify by checking BioSim malfunction list after double-click
- [ ] **DB write volume:** `/api/enriched/` returns within 500ms after 1 hour of bridge operation — verify with a 60-minute soak test
- [ ] **GPL boundary:** No BioSim `.java` or `.jar` files in the SpatialHub repo — `find . -name "*.jar" -o -name "*.java"` should return nothing
- [ ] **Docker health check:** `docker compose up` with BioSim cold start (first time, no cached JVM) completes without Django bridge failing — wait for `service_healthy` condition

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WS memory leak already in production | MEDIUM | Add cleanup to `useEffect`, test navigation cycle, redeploy |
| Data model mapping wrong units | HIGH | Rewrite `biosimMapper.ts`, re-run unit tests, flush bad data from `enriched_sensor_data` |
| Fallback race condition shipping | MEDIUM | Implement state machine in store, stop engine before WS connection attempt |
| DB unbounded growth already bloated | MEDIUM | Add pagination to endpoint, add index, run DELETE on old rows |
| GPL violation (BioSim code in repo) | HIGH | `git filter-branch` to remove from history, consult FSF license terms |
| Docker startup race causing silent bridge failure | LOW | Add healthcheck + `condition: service_healthy`, restart bridge container |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-----------------|--------------|
| WS memory leak (#16) | Phase: WebSocket client | Navigate to/from `/habitat` 5x, check DevTools Network > WS |
| WS flooding re-renders (#17) | Phase: WebSocket client | FPS stays >50 when BioSim connected, RAF buffering confirmed |
| Docker startup race (#18) | Phase: Docker infrastructure | `docker compose up` cold start completes without bridge errors |
| Data model mismatch (#19) | Phase: Data mapping | Unit tests for `biosimMapper.ts` pass with real BioSim state snapshots |
| Django async/sync mixing (#20) | Phase: Django bridge | `SynchronousOnlyOperation` never thrown; no event loop blocks |
| Fallback race condition (#21) | Phase: Fallback mode design | Engine and WS client never simultaneously active in store |
| GPL license violation (#22) | Phase: Docker infrastructure | No BioSim source/JARs in repo; reviewed on first commit |
| CORS/Docker addressing (#23) | Phase: Docker infrastructure | Frontend connects via `localhost:8009`, documented in env vars |
| SimId lost on restart (#24) | Phase: Django bridge | Bridge startup queries active simulations before subscribing |
| Malfunction idempotency (#25) | Phase: AnomalyDrawer rewire | Double-click test; BioSim malfunction count stays at 1 |
| DB write volume (#26) | Phase: Django bridge | Paginated endpoint, timed after 1hr bridge operation |

---

## Phase-Specific Warnings (v1.0, still relevant)

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

### `enriched_sensor_data` Performance Bomb (CONCERNS.md Known Issue)
The existing `EnrichedSensorListView` does `.objects.all()` with no pagination. BioSim integration adds a continuous 6 rows/second write source. This known issue becomes a breaking problem within hours. **Add pagination and an index on `datetime` before enabling the bridge.**

---

## Sources

**v1.0 (Three.js/R3F):**
- Three.js disposal documentation: https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
- React-three-fiber documentation and pitfalls section: https://r3f.docs.pmnd.rs/
- @react-three/drei documentation: https://drei.docs.pmnd.rs/
- @react-three/postprocessing documentation: https://react-postprocessing.docs.pmnd.rs/
- Zustand documentation: https://zustand.docs.pmnd.rs/
- Three.js performance tips: https://discoverthreejs.com/tips-and-tricks/

**v2.0 (BioSim Integration):**
- Django Channels database access docs (sync_to_async, aclose_old_connections): https://channels.readthedocs.io/en/latest/topics/databases.html
- Django async support documentation: https://docs.djangoproject.com/en/6.0/topics/async/
- Docker Compose startup order and healthcheck docs: https://docs.docker.com/compose/how-tos/startup-order/
- Docker Compose health check guide (JVM start_period): https://last9.io/blog/docker-compose-health-checks/
- Zustand high-frequency update patterns (debouncing, transient updates): https://github.com/pmndrs/zustand/discussions/1179
- React WebSocket cleanup and memory leaks: https://www.codewalnut.com/insights/5-react-memory-leaks-that-kill-performance
- RAF buffering for high-frequency WebSocket updates: https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/
- WebSocket fallback mechanisms in React: https://iamrajatsingh.medium.com/enhancing-websocket-reliability-in-react-a-fallback-mechanism-for-seamless-connectivity-8b2b79659cc0
- GPL v3 network API copyleft boundary (containers and network services): https://opensource.com/article/18/1/containers-gpl-and-copyleft
- GNU GPL FAQ on combining programs: https://www.gnu.org/licenses/gpl-faq.en.html
- BioSim GitHub repository: https://github.com/scottbell/biosim
- Django async management commands with WebSocket: https://dev.to/tkanemoto/fun-with-websockets-and-asyncio-in-python-10mp
- NGINX WebSocket proxy configuration in Docker: https://github.com/maximillianfx/docker-nginx-cors

---

*Pitfalls audit: 2026-03-09 (v1.0), 2026-03-14 (v2.0 BioSim addendum)*
