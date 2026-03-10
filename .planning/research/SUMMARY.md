# Project Research Summary

**Project:** SpatialHub Mars Habitat Demo -- 3D Visualization Layer
**Domain:** 3D interactive IoT data visualization (Three.js + React real-time telemetry)
**Researched:** 2026-03-09
**Confidence:** MEDIUM

## Executive Summary

This project adds a 3D interactive Mars habitat visualization to an existing React 19 + Vite IoT dashboard. The industry-standard approach for React-based 3D visualization is React Three Fiber (R3F) from the Poimandres ecosystem, which provides a declarative React reconciler for Three.js. The entire ecosystem -- R3F, drei (helpers), Zustand (state), react-spring (animation) -- is maintained by the same group, which means tight integration and well-documented patterns. The existing codebase already has `@tanstack/react-query` installed (unused), which slots in naturally for data fetching. The core architectural insight is that all simulated telemetry should run client-side (browser `setInterval` writing to Zustand), with Django only serving static zone/sensor configuration -- no WebSocket complexity, no polluting the real database with fake data, no new cloud infrastructure.

The biggest risk is not technical failure but visual mediocrity. A 3D demo that looks like colored boxes in a void fails its entire purpose regardless of how clean the state management is. Visual design -- lighting, materials, post-processing bloom, Mars environment -- must be treated as a first-class engineering concern, not deferred polish. The second critical risk is performance: React's re-render model is fundamentally at odds with 60fps 3D rendering, and the architecture must enforce strict separation between React state (discrete changes) and Three.js animation state (per-frame mutations via refs and `useFrame`). Getting this wrong means a rewrite, not a fix.

The recommended approach is a six-phase build that starts with data architecture (types, store, simulation engine) before touching any 3D code, followed by a visual scene shell, then wiring data to the scene, adding UI panels, implementing the anomaly "wow factor," and finally polish. This order follows the dependency graph discovered in research: every visual feature consumes the simulation engine's output, every interaction requires the store to exist, and anomaly simulation is an overlay on top of normal operation -- not a parallel system.

## Key Findings

### Recommended Stack

The stack centers on the Poimandres ecosystem for 3D and Zustand for state management, both battle-tested with React 19. All dependencies are tree-shakeable via Vite, but the 3D stack adds ~300-350KB gzipped -- the `/habitat` route must be code-split with `React.lazy()`.

**Core technologies:**
- **@react-three/fiber (R3F) v9+**: React reconciler for Three.js -- declarative scene graph, automatic disposal, integrated event system. Using raw Three.js inside React `useEffect` hooks is categorically wrong for this codebase.
- **@react-three/drei**: 200+ ready-made R3F components (OrbitControls, Html overlays, Environment maps, GLTF loaders). Saves weeks of boilerplate.
- **Zustand v5**: Client-side state for the 3D scene. Selector-based subscriptions prevent re-render cascades that kill frame rates. Same authors as R3F. React Context is not viable inside the R3F Canvas (separate reconciler).
- **@tanstack/react-query v5**: Already installed, currently unused. Use `refetchInterval` for polling zone config from Django. The habitat page should be the first proper consumer of this dependency.
- **@react-spring/three**: Physics-based animation for 3D objects (zone highlighting, camera transitions, alert pulsing). Declarative API that handles interrupted animations gracefully, unlike GSAP which fights React.
- **@react-three/postprocessing**: Bloom, vignette, tone mapping. Selective bloom on emissive alert meshes is the single highest-impact visual upgrade.

**Explicitly excluded:** WebSockets/Django Channels (out of scope, unnecessary for simulated data), Tailwind/component libraries (not in existing stack, one page doesn't justify), physics engines (zero value for a monitoring dashboard), Babylon.js/A-Frame (wrong abstraction).

### Expected Features

**Must have (table stakes):**
- 3D habitat model with orbit controls -- the entire premise; without this it's another CRUD app
- Clickable zone highlighting (Grow Bays, Atmosphere, Water Recycling, Power/Thermal)
- Real-time data streaming animation (sensor values ticking, colors changing without page refresh)
- Color-coded zone status (green/yellow/red) -- universal monitoring language
- Zone detail panel with live sensor readings and current values
- Dark "mission control" aesthetic scoped to `/habitat` route
- Anomaly trigger controls (CO2 Spike, Pump Failure, Nutrient Crash, Power Fluctuation)
- Visual anomaly response (zone flashing red, alert banners, value spikes on charts)
- Smooth camera transitions (animate, never teleport)
- Basic environmental lighting (ambient + directional minimum)

**Should have (differentiators):**
- Bloom/glow post-processing on active elements -- cinematic visual upgrade
- HUD-style overlay with glassmorphism -- Iron Man meets NASA
- Mini trend sparklines in zone panels -- proves data is actually streaming
- Mars exterior environment (skybox, terrain, fog) -- contextual grounding
- Sensor node 3D markers at zone positions
- Keyboard shortcuts for zone navigation

**Defer (v2+):**
- Animated data flow particles (high effort, incremental impact)
- Sound design (add as final polish, annoying during development)
- Loading boot-up sequence (pure polish)
- System health timeline (anomaly triggers already tell the story)
- Realistic GLTF models (procedural geometry with good materials looks more futuristic than amateur Blender work)

### Architecture Approach

The architecture adds two new client-side layers (simulation engine + 3D visualization) to the existing SpatialHub platform, with a thin Django API extension for zone/sensor configuration. All simulated telemetry runs in-browser via `setInterval`, writing to a Zustand store that both R3F 3D components and standard React DOM panels consume. The store is the single source of truth; 3D components only read from it (via selectors for performance), while only the simulation and anomaly engines write to it. Django's role is limited to "here's the shape of the habitat" -- zone definitions, sensor metadata, thresholds -- fetched once on mount.

**Major components:**
1. **Django API extensions** (HabitatZone/HabitatSensor models + endpoints) -- serves static zone/sensor configuration, knows nothing about simulation
2. **Habitat Zustand store** -- central state for zone configs, current readings, zone statuses, active anomalies, alerts, and interaction state (selected zone)
3. **Telemetry simulation engine** (pure TypeScript, no React) -- generates realistic sensor values with drift, noise, and diurnal patterns on a 2-second tick
4. **Anomaly simulation engine** (pure TypeScript) -- overrides normal sensor models with crisis curves (gradual onset, correlated effects, recovery arcs)
5. **R3F 3D scene** (Canvas + zone meshes + environment + post-processing) -- reads from store via selectors, uses `useFrame` for smooth visual interpolation
6. **HTML overlay panels** (standard React DOM outside Canvas) -- zone drilldown, alert list, anomaly controls, system header

**Key architectural decision:** Simulation engines are pure modules with no React or Three.js imports. They export `start()`, `stop()`, `tick()`. A single React hook manages lifecycle. This makes them testable, debuggable, and replaceable with real data sources later.

### Critical Pitfalls

1. **GPU memory leaks from undisposed Three.js objects** -- GPU allocations are not garbage collected by JS. Every route navigation creates new GPU resources without freeing old ones. Use R3F's declarative JSX (auto-disposes), pair every imperative `new THREE.*()` with `.dispose()` in `useEffect` cleanup, and monitor `renderer.info.memory` during development.

2. **React re-renders destroying frame rate** -- `setState` or Context updates trigger full scene tree re-renders, tanking FPS from 60 to single digits. Use Zustand with selector subscriptions (`useStore(s => s.zones[id].status)`) so only the specific zone that changed re-renders. Use `useFrame` + refs for per-frame visual updates (color lerping, pulsing). Never pass sensor data as props through the scene tree.

3. **Blocking the main thread with simulation logic** -- simulation math competes with the render loop for CPU time, causing orbit controls to lag during anomalies (the worst possible moment). Keep simulation under 2ms per tick, batch sensor updates, and consider a Web Worker if profiling shows contention.

4. **"Looks like a dev project" 3D scene** -- colored boxes in a void kill the demo regardless of engineering quality. Budget visual design time equally with engineering time. Use drei helpers (`Environment`, `ContactShadows`), post-processing (bloom, tone mapping), emissive materials, and a Mars-themed HDR environment map.

5. **Click/drag interaction conflicts** -- orbit controls and zone click handlers fight over mouse events, causing accidental zone selections after camera drags. Implement pointer movement threshold to discriminate click vs drag. Use R3F's event system with drei's `OrbitControls makeDefault`.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Data Foundation and Simulation Engine

**Rationale:** Everything downstream depends on the data shape. The store structure dictates component boundaries, the simulation engine feeds every visual feature, and getting types wrong here means cascading refactors. Research unanimously identifies this as the prerequisite for all other work.
**Delivers:** Django habitat models/endpoints, TypeScript types, Zustand store skeleton, working telemetry simulation engine (verifiable via console/DevTools before any UI exists), centralized constants file (thresholds, colors, zone definitions).
**Addresses:** Real-time data streaming (table stakes), color-coded status derivation (table stakes)
**Avoids:** Monolithic store coupling (Pitfall 8), scattered hardcoded thresholds (Pitfall 15), simulation architecture that can't support gradual anomaly transitions later (Pitfall 9)

### Phase 2: 3D Scene Shell and Visual Foundation

**Rationale:** Get a renderable, visually impressive 3D scene on screen before wiring data. This phase validates R3F + React 19 compatibility (Pitfall 10), establishes disposal patterns (Pitfall 1), and addresses the "dev project aesthetics" risk (Pitfall 4) early rather than as deferred polish. Lighting, environment, and post-processing go here -- they define the visual identity.
**Delivers:** `/habitat` route (code-split), R3F Canvas with proper sizing, procedural habitat geometry, Mars environment (skybox, terrain, lighting), OrbitControls, bloom post-processing, loading state via Suspense, dark theme CSS scoped to the route.
**Addresses:** 3D habitat model (table stakes), orbit controls (table stakes), dark theme (table stakes), environmental lighting (table stakes), bloom post-processing (differentiator), Mars environment (differentiator)
**Avoids:** Canvas sizing nightmares (Pitfall 6), no loading state (Pitfall 13), React 19 compatibility issues (Pitfall 10), "dev project" aesthetics (Pitfall 4), 3D model rabbit hole (Pitfall 5)

### Phase 3: Zone Interaction and Live Data Integration

**Rationale:** This is where the demo becomes interactive. Zones light up from simulated data, clicks produce responses, and the monitoring metaphor comes alive. Requires both Phase 1 (store + engine running) and Phase 2 (scene exists with zones to wire). This phase has the most pitfall exposure -- performance, click conflicts, and re-render issues all surface here.
**Delivers:** Interactive zone meshes with status-driven colors (lerped via `useFrame`), click-to-select with camera transition, zone labels via drei `Html`, simulation engine connected to page mount/unmount lifecycle.
**Addresses:** Clickable zone highlighting (table stakes), color-coded zone status (table stakes), smooth camera transitions (table stakes), real-time data streaming animation (table stakes)
**Avoids:** Re-renders killing frame rate (Pitfall 2), click/drag conflicts (Pitfall 7), z-fighting on zone overlays (Pitfall 14)

### Phase 4: UI Panels and Detail Views

**Rationale:** The 3D scene provides spatial overview; panels provide detail. This is the natural "overview + detail" pattern from digital twin dashboards. Requires Phase 3 (zone selection working) to have meaningful content. Layout decision (Canvas ~70% + side panels) is a one-time structural choice.
**Delivers:** Page layout with Canvas + panel area, ZoneDrilldown panel with live sensor values, mini sparkline trend charts, AlertPanel with active alerts, HabitatHeader with system overview and simulation controls.
**Addresses:** Zone detail panel with live readings (table stakes), mini trend charts (differentiator), HUD-style overlay (differentiator)
**Avoids:** DOM update overload from frequent re-renders (Pitfall 11), putting complex UI inside Canvas via drei Html (Anti-Pattern 3)

### Phase 5: Anomaly Simulation System

**Rationale:** The anomaly system is the demo's "wow factor" but depends on everything else working first. It overlays on top of normal simulation -- not a parallel system. The anomaly engine overrides sensor models with crisis curves, the store derives escalated statuses, the 3D scene shows visual drama, and panels show alerts. All four layers must exist before this phase delivers value.
**Delivers:** AnomalyControls panel with scenario buttons, anomaly engine with gradual onset/recovery curves, correlated multi-sensor effects, zone flashing/pulsing animations, alert escalation flow, manual clear and auto-timeout resolution.
**Addresses:** Anomaly trigger controls (table stakes), visual anomaly response (table stakes)
**Avoids:** Binary toggle anomalies that feel like a toy (Pitfall 9), main thread blocking during anomaly peaks (Pitfall 3)

### Phase 6: Polish and Performance

**Rationale:** Polish has zero dependencies and infinite scope. Timebox strictly. This phase handles visual refinements, performance optimization for integrated GPU laptops, and optional nice-to-haves that elevate the demo from "good" to "memorable."
**Delivers:** Performance optimization (DPR cap, draw call monitoring, integrated GPU testing), particle effects (Mars dust, atmosphere haze), optional sound design, keyboard shortcuts, loading sequence animation, sensor node 3D markers, refined geometry/materials.
**Addresses:** Remaining differentiators (particles, sound, keyboard shortcuts, sensor markers)
**Avoids:** Laptop GPU failure during screen-share (Pitfall 12)

### Phase Ordering Rationale

- **Data before visuals:** The simulation engine and store structure must exist before any 3D component can consume data. Building the scene first leads to hardcoded test values that are never properly replaced.
- **Visual foundation before interaction:** Establishing lighting, environment, and post-processing before wiring data ensures the visual identity is set. Retrofitting bloom and environment after building zone interactions causes material and layer mask conflicts.
- **Interaction before panels:** Zone selection must work (store action, camera transition) before panels can consume the selected zone's data. Building panels first means mocking the selection flow.
- **Normal operation before anomalies:** The anomaly system overrides normal simulation behavior. If normal simulation isn't working correctly, anomaly effects can't be distinguished from bugs.
- **Polish last, timeboxed:** Particle effects, sound, and loading sequences are additive. They cannot block the core demo experience.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (3D Scene Shell):** React 19 + R3F v9 compatibility should be verified against current npm versions and GitHub issues before writing any Three.js code. The Mars environment setup (HDR maps, skybox, procedural terrain) benefits from specific asset research.
- **Phase 5 (Anomaly Simulation):** Designing realistic anomaly curves with correlated multi-sensor effects is domain-specific. Research specific easing functions and sensor correlation models during phase planning.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Foundation):** Django model/serializer/view patterns are well-documented. Zustand store setup is boilerplate. Simulation engine is pure TypeScript math.
- **Phase 3 (Zone Interaction):** R3F click handling, Zustand selectors, `useFrame` color lerping are thoroughly documented community patterns.
- **Phase 4 (UI Panels):** Standard React DOM components consuming Zustand state. Recharts sparklines are documented.
- **Phase 6 (Polish):** All items are independent, well-documented, and additive.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | R3F + Zustand + drei is the established ecosystem. Specific version numbers need verification (training data through May 2025). Run `npm view` before installing. |
| Features | MEDIUM-HIGH | Table stakes are well-established from NASA/digital twin patterns and Three.js capabilities. Prioritization is opinionated but grounded in dependency analysis and portfolio demo best practices. |
| Architecture | MEDIUM | Core patterns (R3F Canvas separation, Zustand selectors, simulation as pure module) are battle-tested. Specific API surfaces and React 19 edge cases need verification during implementation. |
| Pitfalls | MEDIUM | Disposal, re-render, and performance pitfalls are well-documented Three.js/R3F community knowledge. React 19-specific issues are less certain -- R3F v9 targets React 19 but edge cases may exist. |

**Overall confidence:** MEDIUM -- the architectural approach and technology choices are high confidence, but all research was conducted without web verification tools. Version compatibility and specific API details should be validated during Phase 1 and Phase 2 setup.

### Gaps to Address

- **React 19 + R3F v9 exact compatibility:** Verify current versions with `npm view` and check R3F GitHub issues for React 19 bug reports before installation. Pin exact versions rather than using `^` ranges.
- **Bundle size impact:** The 3D stack adds ~300-350KB gzipped. Verify with `npx vite-bundle-analyzer` after Phase 2 installation. Code-splitting the `/habitat` route is mandatory, not optional.
- **Post-processing performance on integrated GPUs:** Bloom and tone mapping are GPU-intensive. Test on a MacBook Air or equivalent during Phase 2, not during final polish. Consider drei's `<PerformanceMonitor>` for automatic quality reduction.
- **Mars environment assets:** Need to source a Mars-themed HDR environment map (Polyhaven has free options) and Mars sky texture. Asset selection should happen during Phase 2 planning, not ad hoc during implementation.
- **Existing codebase bugs:** The double `/api/api/` path bug in `api.ts` must be fixed before adding habitat endpoints. The `any` type pattern in existing code must not propagate into habitat types. Consider adding smoke tests for existing endpoints before modifying `urls.py`.

## Sources

### Primary (HIGH confidence)
- Three.js documentation (threejs.org/docs) -- disposal patterns, material properties, performance tips
- React Three Fiber documentation (r3f.docs.pmnd.rs) -- Canvas setup, event system, reconciler behavior
- @react-three/drei documentation (drei.docs.pmnd.rs) -- OrbitControls, Html, Environment, GLTF loading
- Zustand documentation (zustand.docs.pmnd.rs) -- selector subscriptions, store design, reconciler compatibility
- NASA Human Spaceflight imagery -- UI patterns for monitoring interfaces (dark themes, status colors, data density)

### Secondary (MEDIUM confidence)
- R3F ecosystem patterns (Poimandres community) -- Zustand + R3F integration, performance optimization, animation patterns
- Digital twin dashboard patterns (Siemens, Azure, AWS IoT TwinMaker) -- 3D-as-navigation, overlay panels, heatmap coloring
- Mars surface conditions (NASA Mars Fact Sheet) -- realistic sensor ranges for simulation
- Portfolio review patterns -- what makes demos memorable (immediate visual impact, clear interaction path)

### Tertiary (LOW confidence)
- Specific npm package versions -- based on May 2025 training data, must verify with `npm view`
- Post-processing bundle size estimates -- verify with bundle analyzer after installation
- React 19 + R3F v9 compatibility edge cases -- verify against current GitHub issues

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
