# Feature Landscape

**Domain:** 3D IoT monitoring dashboard / Mars habitat telemetry visualization demo
**Researched:** 2026-03-09
**Overall confidence:** MEDIUM-HIGH (based on extensive knowledge of Three.js capabilities, NASA interface patterns, digital twin dashboards, and IoT visualization best practices; no live web verification available)

## Table Stakes

Features the audience (portfolio reviewers, potential employers) expects. Missing any of these and the demo reads as a toy rather than a serious technical showcase.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **3D habitat model with orbit controls** | The entire premise. A flat page with sensor numbers is just another CRUD app. Reviewers need to see a 3D environment they can rotate, zoom, and pan around. | Medium | Three.js + OrbitControls. Model can be procedural geometry (boxes, cylinders, domes) -- does NOT need imported GLTF models to look good if materials/lighting are strong. |
| **Clickable zone highlighting** | If zones exist but aren't interactive, it's a screensaver, not a monitoring tool. Click a zone, something happens. This is the core interaction loop. | Medium | Raycasting on meshes, highlight on hover (emissive change), click opens detail panel. Four zones: Grow Bays, Atmosphere, Water Recycling, Power/Thermal. |
| **Real-time data streaming animation** | Sensor values must visibly update without page refresh. Numbers ticking, gauges moving, charts scrolling. Static data = dead demo. | Medium | WebSocket or polling with setInterval. Values should update every 1-3 seconds. Frontend simulation is fine (no real sensors needed). |
| **Color-coded zone status (green/yellow/red)** | Universal visual language for monitoring systems. NASA uses it. Every SCADA system uses it. Absence looks amateurish. | Low | Map sensor thresholds to zone mesh material color/emissive. Three states minimum. |
| **Zone detail panel with live sensor readings** | Clicking a zone with no payoff is broken UX. The panel is where you prove you can bridge 3D visualization with real data. | Medium | Slide-in or overlay panel showing sensor name, current value, unit, status badge, and a mini sparkline/trend chart. |
| **Dark theme / "mission control" aesthetic** | Every credible space/monitoring interface is dark. The existing app uses `bg-gray-100` (light theme). The habitat page must feel like a different world. | Low | Dark background (#0a0a0f or similar), accent colors (cyan/amber/red), monospace fonts for data. Scoped to `/habitat` route -- don't break existing pages. |
| **Anomaly trigger controls** | The PROJECT.md calls this out explicitly. Without it, the demo is passive observation. The ability to break things and watch the system respond is what makes it memorable. | Medium | Button panel: "CO2 Spike", "Pump Failure", "Nutrient Crash", "Power Fluctuation". Each injects anomalous values into the simulation stream. |
| **Visual anomaly response** | Triggering an anomaly must produce visible drama. Zone turns red, warning appears, values spike on charts. If anomaly triggers but nothing visually changes, the feature is pointless. | Medium | Zone color shift to red, pulsing/flashing animation on the mesh, alert toast or warning banner with severity and affected zone. |
| **Smooth camera transitions** | When clicking between zones or resetting view, the camera should animate (not teleport). Teleporting cameras scream "student project." | Low | Tween camera position/target over ~800ms using requestAnimationFrame or a simple lerp. No library needed. |
| **Basic environmental lighting** | Flat unlit geometry looks terrible. Ambient + directional light minimum. Without it, reviewers will think you don't understand 3D. | Low | AmbientLight (dim, bluish) + DirectionalLight (warm, angled) + optional HemisphereLight for sky/ground contrast. |

## Differentiators

Features that elevate the demo from "competent" to "jaw-dropping." Not expected, but any one of these will make a reviewer remember the project.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Bloom/glow post-processing on active elements** | The single most impactful visual upgrade. Glowing sensor nodes, emissive zone outlines, bloom on warning indicators. This is what makes NASA Eyes and SpaceX dashboards look cinematic. | Medium | Three.js EffectComposer + UnrealBloomPass. Selective bloom using layer masks so only specific meshes glow (not the whole scene). |
| **Particle system for environmental effects** | Subtle dust particles floating in the Mars exterior, or condensation particles inside the habitat, or data-flow particles along pipes. Adds life to the scene. | Medium | Three.js Points/BufferGeometry with custom shader or THREE.Points with sprite textures. Keep particle count low (500-2000) for performance. |
| **Animated data flow visualization** | Show data literally flowing through the system -- particles moving along pipes from sensors to processing units. Makes the IoT pipeline tangible and visual. | High | Custom shader or animated points along spline paths. Beautiful but time-consuming to get right. Consider as a polish item, not a blocker. |
| **HUD-style overlay with glassmorphism** | Heads-up display elements floating in screen space: system time (sol count), overall habitat status, total active sensors. Think Iron Man helmet UI meets NASA telemetry. | Low-Medium | CSS overlay on the Three.js canvas. Glassmorphism (backdrop-filter: blur) on semi-transparent panels. Monospace numbers. |
| **Mini trend charts in zone panels** | Instead of just current values, show the last 30-60 seconds of each sensor as a tiny sparkline. Proves the data is actually streaming, not just random numbers on refresh. | Medium | Recharts SparklineChart or a lightweight canvas-based sparkline. Rolling buffer of last N values per sensor. |
| **Sound design / audio feedback** | Subtle ambient hum for normal operations, alarm beep for anomalies. Audio makes demos 10x more immersive but is almost never done in web demos. | Low | Web Audio API. Ambient drone + warning tone. Include a mute toggle (crucial -- auto-playing audio is hostile). |
| **Mars exterior environment** | Starfield background, Mars-colored terrain plane, maybe a subtle atmosphere haze. Grounds the habitat in context rather than floating in void. | Medium | Skybox (equirectangular Mars sky texture or procedural gradient) + ground plane with Mars-colored material + fog for depth. Free Mars HDRI textures available from Poly Haven. |
| **Sensor node 3D markers** | Small glowing spheres or icons at actual positions within each zone, representing individual sensors. Click a node to see its specific data. Adds spatial meaning to the data. | Medium | Instanced meshes or sprites at defined positions within zone geometries. Tooltip on hover using CSS2DRenderer. |
| **System health timeline** | A horizontal timeline at the bottom showing recent events (anomalies triggered, resolved). Gives temporal context and makes the monitoring feel like a real ops tool. | Medium | Simple horizontal bar with event markers. Color-coded dots for severity. Could reuse Recharts. |
| **Keyboard shortcuts for zone navigation** | Press 1-4 to jump to zones, Space to reset view, A to open anomaly panel. Power users (read: developers reviewing your portfolio) love this. | Low | Simple keydown event listeners mapped to camera transition functions. Display hint overlay on "?" key. |
| **Loading sequence / boot-up animation** | When the page loads, show a brief "system initialization" sequence -- scanlines, status checks ticking green, habitat geometry assembling itself. Sets the tone immediately. | Medium | Staggered reveal with CSS animations + Three.js mesh fade-in. 2-3 seconds max. Don't make people wait. |

## Anti-Features

Features to explicitly NOT build. Each of these is a trap that burns time, adds complexity, and doesn't meaningfully improve the demo.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Realistic GLTF habitat model** | Importing detailed 3D models is a rabbit hole: finding/purchasing assets, dealing with materials that don't transfer, massive file sizes, UV mapping issues. You'll spend days on asset prep instead of building features. | Build the habitat from procedural Three.js geometry (BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry). Clean geometric shapes with good materials look MORE futuristic than a poorly-lit imported model. Think abstract, not photorealistic. |
| **Physics simulation** | Gravity, collisions, fluid dynamics -- none of this is relevant to a monitoring dashboard. It adds zero value and massive complexity. | Static or animated geometry is sufficient. Pipes don't need to simulate water flow; a scrolling UV texture or particle trail handles it visually. |
| **User authentication** | PROJECT.md explicitly scopes this out. Don't even think about it. | If you want to imply multi-user capability, show a static "Operator: CDR Martinez" label in the HUD. |
| **Mobile responsive 3D** | Touch controls for orbit on mobile Three.js are fiddly, performance tanks on mobile GPUs, and the UI panels need completely different layouts. PROJECT.md scopes this out. Desktop only. | Optionally show a "Best experienced on desktop" message on small screens. |
| **Database-backed anomaly history** | Persistent anomaly logs, incident tracking, resolution workflows. This is operational software, not a demo. PROJECT.md calls anomalies "transient demo events." | Keep anomaly state in React state only. When you refresh, it resets. That's fine. |
| **Complex chart library integration** | Don't integrate D3.js or build elaborate real-time charting infrastructure. The charts are supporting actors, not the star. | Recharts is already in the project. Use it for sparklines and trend panels. Keep charts small and supplementary to the 3D view. |
| **WebSocket backend for real-time** | Building actual WebSocket support in Django (channels, ASGI, Redis pub/sub) is significant infrastructure for simulated data. | Simulate data entirely in the browser. A `setInterval` generating sensor values with realistic drift is indistinguishable from "real" WebSocket data for a demo. The backend already stores real IoT data -- this demo layer is about visualization, not plumbing. |
| **VR/AR mode** | WebXR integration is cool but doubles the interaction model complexity, requires testing with headsets, and 99% of portfolio reviewers will view on a normal browser. | The orbit controls + click-to-inspect model is the right interaction paradigm for this audience. |
| **Custom shader materials for everything** | Writing GLSL shaders is impressive but slow to develop, hard to debug, and the visual payoff for a monitoring dashboard is marginal vs. MeshStandardMaterial with good parameters. | Use MeshStandardMaterial/MeshPhysicalMaterial with emissive, metalness, roughness, and envMap. Save custom shaders for one or two hero effects (like a holographic display or data-flow particles). |
| **Multi-language / i18n** | It's a demo. It speaks English. | N/A |

## Feature Dependencies

```
Basic 3D Scene (lighting, camera, controls)
  |-> Habitat Geometry (zones as mesh groups)
  |     |-> Zone Highlighting (hover/click raycasting)
  |     |     |-> Zone Detail Panels (UI overlay)
  |     |     |     |-> Mini Trend Charts (sparklines in panels)
  |     |     |-> Camera Transitions (animated zoom to zone)
  |     |-> Color-Coded Status (material color mapping)
  |     |-> Sensor Node Markers (positioned within zones)
  |     |-> Bloom Post-Processing (selective glow on emissive meshes)
  |
  |-> Mars Environment (skybox, ground, fog)
  |     |-> Particle Effects (dust, atmosphere)
  |
Simulated Data Stream (browser-side interval generator)
  |-> Real-Time Value Updates (displayed in panels)
  |     |-> Rolling Sparkline Data (buffer of recent values)
  |-> Threshold Evaluation (green/yellow/red status)
  |     |-> Color-Coded Status (feeds zone mesh colors)
  |     |-> Alert System (warning toasts/banners)
  |
Anomaly Simulator (trigger buttons)
  |-> Anomalous Data Injection (overrides simulation stream)
  |     |-> Visual Anomaly Response (flashing zones, alerts)
  |     |-> System Health Timeline (event log)
  |
Dark Theme + HUD Overlay (CSS layer)
  |-> Zone Detail Panels (styled within dark theme)
  |-> Anomaly Controls Panel (styled within dark theme)
  |-> Loading Sequence (entry animation)
```

## MVP Recommendation

**Prioritize in this order:**

1. **3D scene with procedural habitat geometry and orbit controls** -- the foundation everything else sits on. Without this, there is no demo.

2. **Simulated data stream generator** -- the engine that powers everything dynamic. Build this second because every visual feature consumes its output.

3. **Clickable zones with color-coded status** -- the core interaction. Zone highlight on hover, click to select, material color reflects status. This is the "aha moment."

4. **Dark theme + HUD overlay** -- aesthetic transformation that makes it feel like mission control, not a React starter template. Quick win with massive visual impact.

5. **Zone detail panels with live sensor readings** -- the payoff for clicking a zone. Current values updating in real time prove the system works.

6. **Anomaly trigger controls + visual response** -- the demo's "wow factor." Trigger a crisis, watch the habitat react. This is what people will remember.

7. **Bloom post-processing** -- the visual polish that separates "good" from "impressive." Apply selectively to zone outlines, warning indicators, and sensor nodes.

8. **Mars environment (skybox + ground)** -- contextual grounding. Without it, the habitat floats in void. With it, you're on Mars.

**Defer:**
- **Animated data flow particles:** Beautiful but high effort for incremental visual impact. Only if time permits after core features are solid.
- **Sound design:** Easy to add last but annoying to develop alongside (constant audio during dev). Add as final polish.
- **Loading sequence:** Pure polish. The demo should work great without it. Add if you have time after everything else is polished.
- **System health timeline:** Nice-to-have temporal context but the anomaly triggers + visual response already tell the story.
- **Keyboard shortcuts:** Takes an hour to add once the camera transitions and panels work. Do it last.

## Competitive Landscape & Reference Interfaces

### NASA-Style Monitoring Patterns (HIGH confidence -- well-documented design language)

NASA Mission Control Center (MCC) interfaces and ISS telemetry displays consistently use:

- **Dark backgrounds** with high-contrast text (white/green on near-black)
- **Status colors:** Green = nominal, Yellow = caution, Red = warning/critical (never blue for status -- blue is informational)
- **Monospace fonts** for numerical data (ensures columns align and digits are readable)
- **Dense data layout** -- lots of numbers visible simultaneously, not hidden behind tabs
- **Minimal decoration** -- no gradients, no rounded corners on data panels, no shadows. Function over form. Borders are thin lines, usually 1px gray or color-matched to status.
- **Blinking/flashing for alerts** -- actual rate-limited flashing (not CSS animation infinity), typically alternating between warning color and background at ~1Hz
- **Timestamp omnipresence** -- every panel shows when its data was last updated. Mission Elapsed Time (MET) or UTC clock always visible.
- **Hierarchical status roll-up** -- individual sensor statuses roll up into subsystem status, which rolls up into overall vehicle status. One glance tells you if anything is wrong anywhere.

### Digital Twin / 3D Monitoring Patterns (MEDIUM confidence -- broad domain knowledge)

Modern digital twin dashboards (Siemens MindSphere, Azure Digital Twins viewers, custom industrial dashboards) share:

- **3D model as navigation** -- click physical locations to drill into data, not menu hierarchies
- **Overlay panels** -- data shown in floating panels adjacent to the 3D view, not separate pages
- **Heatmap coloring** -- surfaces change color based on sensor values (temperature gradients on walls, pressure zones)
- **Connectivity lines** -- thin lines or animated paths showing relationships between components
- **Level-of-detail** -- zooming in reveals more sensors/detail; zooming out shows aggregate status

### What Makes Portfolio Demos Stand Out (MEDIUM confidence -- hiring experience)

Based on patterns in impressive portfolio projects:

- **Immediate visual impact** -- the demo must look impressive in the first 3 seconds before any interaction
- **Self-explanatory** -- a reviewer should understand what they're looking at without reading docs
- **One clear interaction path** -- orbit scene -> click zone -> see data -> trigger anomaly -> see response. Don't overwhelm with options.
- **Smooth transitions** -- nothing janky, no layout shifts, no flashing unstyled content
- **Works on first try** -- no setup required, no "click here first" instructions needed

## Mars Habitat Sensor Mapping

For realistic Mars habitat telemetry, each zone should have sensors that make scientific sense:

| Zone | Sensors | Realistic Ranges | Anomaly Scenarios |
|------|---------|-------------------|-------------------|
| **Grow Bays** | PAR light (umol/m2/s), substrate moisture (%), nutrient EC (mS/cm), leaf temperature (C) | PAR: 200-800, moisture: 40-70%, EC: 1.2-2.5, leaf temp: 18-28 | Nutrient crash (EC drops to 0.3), light failure (PAR drops to 0), overwatering (moisture >90%) |
| **Atmosphere** | CO2 (ppm), O2 (%), temperature (C), humidity (%), pressure (kPa) | CO2: 400-1200, O2: 19.5-22, temp: 20-25, humidity: 40-65, pressure: 95-105 | CO2 spike (>5000ppm -- dangerous), O2 depletion (<18%), pressure loss (rapid drop) |
| **Water Recycling** | pH, dissolved O2 (mg/L), turbidity (NTU), flow rate (L/min), reservoir level (%) | pH: 6.0-7.5, DO: 6-9, turbidity: 0-5, flow: 2-10, level: 30-90 | Pump failure (flow drops to 0), contamination (turbidity spike >50), pH crash |
| **Power/Thermal** | Solar input (W/m2), battery SOC (%), internal temp (C), external temp (C), power draw (kW) | Solar: 0-590 (Mars max), SOC: 20-100, int temp: 18-25, ext temp: -60 to +20, draw: 2-8 | Power fluctuation (SOC dropping fast), thermal runaway (internal temp rising), solar panel degradation |

## Sources

- Three.js documentation and examples library (threejs.org/docs, threejs.org/examples) -- HIGH confidence
- NASA Human Spaceflight gallery and Mission Control imagery -- HIGH confidence for UI patterns
- NASA Eyes on the Solar System (eyes.nasa.gov) -- HIGH confidence for web-based space visualization patterns
- Digital twin dashboard patterns from Siemens, Azure, AWS IoT TwinMaker documentation -- MEDIUM confidence
- Mars surface conditions from NASA Mars Fact Sheet -- HIGH confidence for sensor ranges
- Portfolio review patterns from software engineering hiring -- MEDIUM confidence (experiential, not documented)
