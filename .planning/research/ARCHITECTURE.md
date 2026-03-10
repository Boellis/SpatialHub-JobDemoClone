# Architecture Patterns

**Domain:** 3D IoT Habitat Visualization with Simulated Real-Time Telemetry
**Researched:** 2026-03-09
**Confidence:** MEDIUM (no external source verification available; recommendations based on strong training data for React Three Fiber, Three.js, and real-time simulation patterns)

## Recommended Architecture

The Mars habitat demo introduces three new architectural concerns on top of the existing SpatialHub platform:

1. **3D scene rendering** inside an existing React SPA
2. **Simulated real-time telemetry** that looks realistic without real hardware
3. **Anomaly simulation** with visual feedback loops

The architecture adds two new layers -- a client-side simulation engine and a 3D visualization layer -- while extending the existing Django API layer with habitat-specific endpoints.

### High-Level Component Map

```
                                    BROWSER
 +-----------------------------------------------------------------------+
 |                                                                       |
 |  +------------------+     +-------------------+                       |
 |  | Existing Pages   |     | /habitat Route    |                       |
 |  | /raw, /enriched  |     |                   |                       |
 |  | /trends, etc.    |     |  +--------------+ |                       |
 |  +--------+---------+     |  | R3F Canvas   | |                       |
 |           |               |  | (3D Scene)   | |                       |
 |           |               |  +------+-------+ |                       |
 |           |               |         |         |                       |
 |           |               |  +------+-------+ |  +-----------------+  |
 |           |               |  | Zone Panels  | |  | Anomaly Control |  |
 |           |               |  | (HTML overlay)| |  | Panel (React)   |  |
 |           |               |  +--------------+ |  +-----------------+  |
 |           |               +--------+----------+          |            |
 |           |                        |                     |            |
 |  +--------+------------------------+---------------------+--------+  |
 |  |                     Habitat State Store (Zustand)               |  |
 |  |  - zone statuses, sensor readings, active anomalies, alerts    |  |
 |  +------------------+---------------------+-----------------------+  |
 |                     |                      |                         |
 |  +------------------+---+    +-------------+-----------+             |
 |  | Telemetry Simulator  |    | Anomaly Simulator       |             |
 |  | (client-side engine) |    | (event injection engine) |             |
 |  +----------------------+    +-------------------------+             |
 |                                                                       |
 +-----------------------------------+-----------------------------------+
                                     |
                                     | HTTP (REST)
                                     |
 +-----------------------------------+-----------------------------------+
 |                         Django REST API                               |
 |  Existing: /api/raw/, /api/enriched/, /api/hub/, etc.                |
 |  New:      /api/habitat/zones/, /api/habitat/sensors/                |
 +-----------------------------------------------------------------------+
                                     |
                              PostgreSQL (Cloud SQL)
```

### Why This Shape

**Client-side simulation, not server-side.** The PROJECT.md explicitly says "no new cloud infra" and "simulated data runs locally or in-browser." Pushing simulated telemetry through the existing Pub/Sub pipeline would be architecturally dishonest for a demo -- it adds latency and cloud cost for fake data. The simulation engine runs entirely in the browser using `setInterval` and `requestAnimationFrame`-adjacent timing.

**React Three Fiber (R3F), not raw Three.js.** The existing frontend is React 19 with component-based architecture. R3F wraps Three.js in React's component model -- meshes become JSX elements, the scene graph is the component tree. This means the 3D scene integrates natively with React state, hooks, and the rest of the app. No imperative bridge layer needed.

**Zustand for habitat state, not React Context.** The habitat visualization needs shared state across the 3D scene (R3F Canvas), HTML overlay panels, and the anomaly control panel. React Context triggers full subtree re-renders and does not work inside the R3F Canvas (which is a separate React reconciler). Zustand works across both reconcilers, supports selective subscriptions (preventing unnecessary re-renders of 60fps 3D components), and is tiny (~1KB).

**Django serves zone/sensor config, not live data.** The Django API provides habitat zone definitions and sensor metadata (what sensors exist in which zones, their thresholds, units, display names). The actual "live" readings are generated client-side. This keeps the API simple and avoids WebSocket complexity for fake data. The API's role is: "here's the shape of the habitat" not "here's the current reading."

## Component Boundaries

### Layer 1: Django API Extensions

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `HabitatZoneView` | Serve zone definitions (name, sensors, thresholds, position hints) | Frontend API client |
| `HabitatSensorView` | Serve sensor metadata (type, unit, normal range, warning range, critical range) | Frontend API client |
| `HabitatZone` model | Define zones: Grow Bays, Atmosphere, Water Recycling, Power/Thermal | Database |
| `HabitatSensor` model | Define sensors per zone with threshold configs | Database, `HabitatZone` FK |

**Boundary rule:** The API knows nothing about simulation or anomalies. It provides static configuration that the frontend uses to drive the simulation. Think of it as the "level definition" for the game.

### Layer 2: Frontend API Client

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `api/habitat.ts` | Fetch zone config and sensor metadata from Django | Django API, Zustand store |
| Zone/sensor TypeScript types | Type definitions for habitat domain objects | Used by all habitat components |

**Boundary rule:** This is a thin data-fetching layer. No business logic. Fetches once on mount, feeds into the store.

### Layer 3: Habitat State Store (Zustand)

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `stores/habitatStore.ts` | Central state: zone configs, current readings, zone statuses, active anomalies, alerts | All habitat components |
| Zone status derivation | Compute GREEN/YELLOW/RED from sensor readings vs thresholds | Telemetry simulator output |
| Alert management | Track active alerts, their severity, acknowledgement state | Anomaly simulator, UI panels |

**Boundary rule:** The store is the single source of truth for the entire habitat visualization. Both the 3D scene and the HTML panels read from it. Only the telemetry simulator and anomaly simulator write to it.

**Store shape (conceptual):**

```typescript
interface HabitatStore {
  // Configuration (from API, set once)
  zones: HabitatZone[];
  sensors: HabitatSensor[];

  // Live state (updated by simulators)
  readings: Record<string, SensorReading>;  // sensorId -> latest reading
  zoneStatuses: Record<string, ZoneStatus>; // zoneId -> GREEN/YELLOW/RED
  alerts: Alert[];
  activeAnomalies: ActiveAnomaly[];

  // Interaction state
  selectedZoneId: string | null;
  simulationRunning: boolean;

  // Actions
  updateReading: (sensorId: string, value: number) => void;
  triggerAnomaly: (anomalyType: AnomalyType, zoneId: string) => void;
  clearAnomaly: (anomalyId: string) => void;
  selectZone: (zoneId: string | null) => void;
}
```

### Layer 4: Telemetry Simulation Engine

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `simulation/telemetryEngine.ts` | Generate realistic sensor values on a tick interval | Zustand store (writes readings) |
| `simulation/sensorModels.ts` | Per-sensor-type value generation with drift, noise, diurnal patterns | Telemetry engine |
| `simulation/anomalyEngine.ts` | Override normal simulation with anomaly behavior when triggered | Zustand store (reads anomalies, writes readings) |

**Boundary rule:** The simulation engines are pure logic -- no React, no Three.js, no DOM. They take configuration and produce numbers. They write to the Zustand store via actions. This makes them testable, debuggable, and replaceable with real data later.

**Simulation tick architecture:**

```
Every 2 seconds (configurable):
  1. For each sensor in each zone:
     a. If anomaly active for this sensor -> use anomaly model
     b. Else -> use normal model (base value + drift + noise + diurnal cycle)
  2. Write all new readings to store
  3. Store automatically derives zone statuses from readings vs thresholds
  4. If any zone status changed -> generate alert
```

**Why 2-second intervals:** Fast enough to feel "real-time" for a demo. Slow enough to not churn the React tree. The 3D visual indicators (zone colors) can interpolate between ticks using `useFrame` for smooth transitions.

### Layer 5: 3D Visualization (React Three Fiber)

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `habitat/HabitatScene.tsx` | Top-level R3F `<Canvas>` with scene setup (lights, camera, controls) | Parent route component |
| `habitat/HabitatStructure.tsx` | The dome/greenhouse 3D model -- static geometry, Mars-themed | Scene (child) |
| `habitat/Zone.tsx` | Individual zone mesh with color based on status, click handler, hover effect | Zustand store (reads zone status), parent scene |
| `habitat/ZoneLabel.tsx` | `<Html>` overlay (drei) showing zone name and status icon above each zone | Zone component |
| `habitat/MarsEnvironment.tsx` | Skybox/environment: Mars terrain, sky color, ambient particles | Scene (child) |

**Boundary rule:** 3D components only READ from the store. They never write state. Click events on zones dispatch `selectZone()` to the store, which the HTML panel layer responds to.

**Performance pattern:** Use Zustand's `useStore(store, selector)` pattern so each Zone component only re-renders when its own zone status changes, not when any reading updates. The store holds readings by sensorId; zone status is a derived value updated only when it actually changes (GREEN -> YELLOW).

### Layer 6: HTML Overlay Panels (React)

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `habitat/panels/ZoneDrilldown.tsx` | When a zone is selected: show all sensors, live values, sparkline trends | Zustand store (reads readings for selected zone) |
| `habitat/panels/AlertPanel.tsx` | List of active alerts with severity, timestamp, zone affected | Zustand store (reads alerts) |
| `habitat/panels/AnomalyControls.tsx` | Buttons to trigger anomaly scenarios (CO2 spike, pump failure, etc.) | Zustand store (writes anomaly triggers) |
| `habitat/panels/HabitatHeader.tsx` | Overall system status, simulation controls (start/stop/speed) | Zustand store |

**Boundary rule:** Panels are positioned as standard React DOM elements outside the Canvas, using CSS (flexbox/grid) for layout. They do NOT use drei's `<Html>` component (which renders inside the 3D scene). The only exception is `ZoneLabel`, which is a small overlay pinned to 3D positions.

## Data Flow

### Flow 1: Initial Load

```
1. User navigates to /habitat
2. HabitatPage mounts, fetches zone + sensor config from Django API
3. Config stored in Zustand store
4. R3F Canvas renders: HabitatStructure + Zone meshes positioned per config
5. Telemetry engine starts: begins generating readings at 2s intervals
6. Zone colors begin reflecting GREEN status (all nominal)
7. Panels render with initial readings
```

### Flow 2: Normal Telemetry Tick

```
1. telemetryEngine tick fires (every 2 seconds)
2. For each sensor: generate value = baseValue + drift + noise + diurnalOffset
3. Write batch of readings to store: store.updateReadings(newReadings)
4. Store middleware: for each zone, compute status from its sensors' readings vs thresholds
5. If status changed: add to zoneStatuses map, create alert if escalation
6. React re-renders:
   - Zone.tsx: reads own zone status -> updates mesh color (lerped over ~500ms via useFrame)
   - ZoneDrilldown.tsx (if zone selected): reads sensor readings -> updates values + sparklines
   - AlertPanel.tsx: reads alerts array -> shows new alerts
```

### Flow 3: Anomaly Trigger

```
1. User clicks "CO2 Spike" in AnomalyControls panel
2. store.triggerAnomaly('co2_spike', 'atmosphere_zone')
3. Store adds ActiveAnomaly { type, zoneId, startTime, severity: 'warning' }
4. Next telemetry tick:
   a. Anomaly engine checks activeAnomalies
   b. For CO2 sensor in atmosphere zone: override normal model with spike curve
      - Rapid rise: base 800 -> 2500 ppm over ~10 seconds (5 ticks)
      - Plateau: hold at dangerous level
   c. Other sensors in zone may show correlated effects (temperature rise)
5. Store status derivation: atmosphere zone -> RED
6. 3D: atmosphere zone mesh flashes red (pulsing emissive via useFrame)
7. AlertPanel: CRITICAL alert appears with anomaly description
8. ZoneDrilldown (if atmosphere selected): values shown in red with warning icons
```

### Flow 4: Anomaly Resolution

```
1. User clicks "Clear" on the active anomaly OR anomaly auto-resolves after timeout
2. store.clearAnomaly(anomalyId)
3. Anomaly engine stops overriding sensor values
4. Normal simulation resumes -> values drift back to nominal over several ticks
5. Zone status: RED -> YELLOW -> GREEN (gradual recovery)
6. Alert marked as resolved
```

### Flow 5: Zone Click Interaction

```
1. User clicks zone mesh in 3D scene
2. Zone.tsx onClick -> store.selectZone(zoneId)
3. Camera smoothly orbits/zooms toward selected zone (drei CameraControls or manual tween)
4. ZoneDrilldown panel slides in from right (CSS transition)
5. Panel shows all sensors for zone with live-updating values
6. User clicks elsewhere or close button -> store.selectZone(null) -> panel slides out
```

## Patterns to Follow

### Pattern 1: Zustand Selector Subscriptions for R3F Performance

**What:** Each 3D component subscribes to exactly the slice of state it needs, preventing cascading re-renders across the scene.

**When:** Always, for any component inside the R3F Canvas that reads from the store.

**Example:**

```typescript
// GOOD: Zone only re-renders when its own status changes
function Zone({ zoneId }: { zoneId: string }) {
  const status = useHabitatStore((s) => s.zoneStatuses[zoneId]);
  // ...
}

// BAD: Re-renders on ANY store change
function Zone({ zoneId }: { zoneId: string }) {
  const store = useHabitatStore();
  const status = store.zoneStatuses[zoneId];
  // ...
}
```

### Pattern 2: useFrame for Smooth Visual Transitions

**What:** Use R3F's `useFrame` hook (runs every animation frame) to interpolate visual properties (color, emissive intensity, scale) rather than jumping between states.

**When:** Zone status color changes, anomaly flashing, camera transitions.

**Example:**

```typescript
function Zone({ zoneId }: { zoneId: string }) {
  const status = useHabitatStore((s) => s.zoneStatuses[zoneId]);
  const meshRef = useRef<THREE.Mesh>(null);
  const targetColor = statusToColor(status); // GREEN -> #00ff00, etc.

  useFrame((_, delta) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.color.lerp(new THREE.Color(targetColor), delta * 3);
    }
  });

  return <mesh ref={meshRef} onClick={() => selectZone(zoneId)}>...</mesh>;
}
```

### Pattern 3: Simulation Engine as Pure Module (No React)

**What:** The telemetry and anomaly engines are plain TypeScript modules with no React imports. They export `start()`, `stop()`, `tick()` functions. A single React hook (`useSimulation`) manages the lifecycle.

**When:** Always. Keeps simulation logic testable and decoupled.

**Example:**

```typescript
// simulation/telemetryEngine.ts -- NO React imports
export class TelemetryEngine {
  private intervalId: number | null = null;
  private sensorModels: Map<string, SensorModel>;

  constructor(config: SensorConfig[], store: HabitatStoreActions) { ... }

  start(intervalMs = 2000) {
    this.intervalId = window.setInterval(() => this.tick(), intervalMs);
  }

  tick() {
    const readings = this.sensorModels.entries().map(([id, model]) => ({
      sensorId: id,
      value: model.generate(),
      timestamp: Date.now(),
    }));
    this.store.updateReadings(readings);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}
```

### Pattern 4: drei Html for 3D-Anchored Labels

**What:** Use `@react-three/drei`'s `<Html>` component to render React DOM elements anchored to 3D positions. Used sparingly -- only for zone name labels that need to track 3D geometry.

**When:** Zone labels only. All other UI panels live outside the Canvas.

**Why sparingly:** Each `<Html>` instance creates a DOM element that gets repositioned every frame via CSS transforms. More than ~10 of these tanks performance.

### Pattern 5: Sensor Models with Realistic Behavior

**What:** Each sensor type has a model that produces believable telemetry, not just `Math.random()`.

**When:** All simulated sensors.

**Model components:**

```typescript
interface SensorModel {
  baseValue: number;       // Nominal center (e.g., 22 for temp in Celsius)
  drift: number;           // Slow random walk, bounded (simulates real sensor drift)
  noiseAmplitude: number;  // Per-tick noise (simulates measurement noise)
  diurnalAmplitude: number; // Sin wave over "24h" cycle (simulates day/night)
  diurnalPeriod: number;    // Real seconds per simulated day (e.g., 120s = 2min "day")
  clampMin: number;
  clampMax: number;
}
```

This produces readings that look like real sensor data: smooth trends with noise, not random jumps.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Polling Django for "Live" Simulated Data

**What:** Running simulation server-side, storing fake readings in PostgreSQL, polling via REST.

**Why bad:** Adds latency (2s polling at best), clutters the real database with fake rows, requires server-side timer management, and violates the "no new cloud infra" constraint if you want decent update rates. It's also architecturally dishonest -- you're round-tripping through a database for data that was generated 50 lines of code away.

**Instead:** Client-side simulation engine writing directly to Zustand store. The readings never touch the network.

### Anti-Pattern 2: WebSocket/SSE for Simulated Data

**What:** Setting up Django Channels or SSE endpoints to "stream" simulated data to the frontend.

**Why bad:** Massive complexity (Django Channels requires Redis, ASGI, new deployment config) for zero benefit. The data is fake -- it originates and terminates in the same browser tab. Adding a server round-trip for theater is engineering vanity.

**Instead:** `setInterval` in the browser. If real data integration is ever needed, the store interface stays the same -- swap the simulation engine for a WebSocket consumer.

### Anti-Pattern 3: Putting Complex UI Inside R3F Canvas via drei Html

**What:** Rendering data tables, charts, or control panels inside the 3D scene using `<Html>`.

**Why bad:** Each `<Html>` element is a CSS-transformed div overlaid on the WebGL canvas. Complex UIs inside it: break accessibility, can't be scrolled naturally, interfere with 3D mouse events, and perform terribly with frequent updates.

**Instead:** Split the layout: Canvas takes ~70% of the viewport, panels live in normal React DOM alongside it. Only small labels (zone names, status icons) use `<Html>`.

### Anti-Pattern 4: Storing Per-Frame Data in React State

**What:** Using `useState` or even Zustand for values that change every animation frame (e.g., interpolated colors, camera position during transition).

**Why bad:** React reconciliation at 60fps = pain. State updates trigger re-renders; re-renders at 60fps means the component tree is thrashing.

**Instead:** Use refs (`useRef`) for per-frame animated values. Mutate the Three.js objects directly in `useFrame`. Only use state/store for discrete changes (status changed from GREEN to RED).

### Anti-Pattern 5: Monolithic Scene Component

**What:** One giant component that renders the entire 3D scene: dome, all zones, labels, lights, environment, everything.

**Why bad:** Any state change re-renders the entire scene. Impossible to reason about, test, or optimize.

**Instead:** Decompose into focused components (HabitatStructure, Zone, MarsEnvironment, etc.), each managing its own slice. Compose them in a parent `HabitatScene`.

## Scalability Considerations

These are less critical for a portfolio demo, but demonstrate architectural thinking.

| Concern | Demo Scale (4 zones, ~20 sensors) | Production Scale (100+ zones) | Notes |
|---------|-----------------------------------|-------------------------------|-------|
| Simulation tick cost | Negligible (~20 calculations per tick) | Could bottleneck main thread | Move to Web Worker at scale |
| Zustand store size | Trivial (~100 entries) | Fine up to ~10K entries | Zustand is just a Map under the hood |
| 3D mesh count | ~10-15 meshes total | Use instanced meshes for many zones | `<instancedMesh>` in R3F |
| Zone label overlays | 4 `<Html>` elements, fine | 100+ `<Html>` = DOM explosion | Switch to SDF text rendering (drei `<Text>`) |
| Sensor reading history | Keep last 30 readings per sensor (sparklines) | Ring buffer, discard old data | Cap array length on write |

## Suggested Build Order

Based on component dependencies, the following build order minimizes blocked work and delivers visible progress early.

### Phase 1: Foundation (no 3D yet)

**Build:**
1. Django models for `HabitatZone` and `HabitatSensor` + API endpoints
2. TypeScript types for habitat domain
3. Zustand store skeleton (zones, readings, statuses)
4. Telemetry simulation engine (pure TypeScript, no UI)

**Rationale:** Everything downstream depends on the data shape. Get the models, types, and store right first. The simulation engine can be tested with console.log before any UI exists.

**Delivers:** Data flowing through the store, verifiable via React DevTools / console.

### Phase 2: 3D Scene Shell

**Build:**
1. Install `@react-three/fiber`, `@react-three/drei`, `three` + types
2. `/habitat` route with basic `<Canvas>`
3. `HabitatStructure` -- simple dome/greenhouse geometry (primitives first, replace with model later)
4. `MarsEnvironment` -- background color, ambient light, one directional light
5. Camera controls (OrbitControls from drei)

**Rationale:** Get a renderable 3D scene on screen. No data integration yet -- just verify R3F works in this React 19 setup and the route sits alongside existing pages.

**Delivers:** Navigable 3D greenhouse on `/habitat`.

### Phase 3: Zone Interaction + Status Visualization

**Build:**
1. `Zone` components positioned inside the habitat structure
2. Wire zone status from store to zone mesh colors
3. Click handler on zones -> store.selectZone
4. Zone labels via drei `<Html>`
5. Connect telemetry engine start/stop to page mount/unmount

**Rationale:** This is where the demo gets interesting -- zones light up based on simulated data. Requires Phase 1 (store + engine) and Phase 2 (scene exists).

**Delivers:** 3D habitat with zones that change color based on simulated sensor data. Clickable zones (no panel yet).

### Phase 4: HTML Panels + Drill-Down

**Build:**
1. Page layout: Canvas + side panel area
2. `ZoneDrilldown` panel (sensor values, sparklines for selected zone)
3. `HabitatHeader` (system overview, simulation controls)
4. `AlertPanel` (list of alerts)

**Rationale:** The 3D scene provides visual overview; panels provide detail. This split is a natural UI pattern (overview + detail). Requires Phase 3 (zone selection working).

**Delivers:** Full read path: see zones, click one, see sensor details.

### Phase 5: Anomaly Simulation

**Build:**
1. `AnomalyControls` panel with scenario buttons
2. Anomaly engine (overrides normal sensor models)
3. Anomaly visual effects (zone flashing, alert escalation)
4. Correlated sensor behavior during anomalies
5. Anomaly resolution flow (manual clear or auto-timeout)

**Rationale:** This is the "wow" feature but depends on everything else working. It's an overlay on the normal simulation, not a parallel system. Requires Phase 3 + 4 (zones responding to data, alerts visible).

**Delivers:** The full demo experience: normal operation -> trigger crisis -> watch the system respond.

### Phase 6: Polish

**Build:**
1. Better 3D models (GLTF if desired, or refined procedural geometry)
2. Particle effects (dust, atmosphere haze)
3. Sound effects (optional, alerts)
4. Loading states, error boundaries
5. Performance optimization if needed

**Rationale:** Polish is last because it has zero dependencies and infinite scope. Timeboxed.

## File Structure Recommendation

```
spatialhub-frontend/src/
  features/
    habitat/
      components/
        HabitatScene.tsx       # R3F Canvas + scene composition
        HabitatStructure.tsx   # Static greenhouse geometry
        MarsEnvironment.tsx    # Skybox, terrain, lighting
        Zone.tsx               # Interactive zone mesh
        ZoneLabel.tsx          # drei Html label per zone
      panels/
        ZoneDrilldown.tsx      # Sensor detail panel
        AlertPanel.tsx         # Alert list
        AnomalyControls.tsx    # Trigger anomaly scenarios
        HabitatHeader.tsx      # System status + sim controls
      simulation/
        telemetryEngine.ts     # Core simulation loop
        anomalyEngine.ts       # Anomaly behavior injection
        sensorModels.ts        # Per-sensor-type generators
        types.ts               # Simulation-specific types
      store/
        habitatStore.ts        # Zustand store
      api/
        habitat.ts             # Django API client for zone/sensor config
      types/
        index.ts               # HabitatZone, HabitatSensor, etc.
      HabitatPage.tsx          # Route page component, orchestrates everything
      index.ts                 # Public exports

django_backend/sensor_data/
  models.py                    # Add HabitatZone, HabitatSensor models
  serializers.py               # Add zone/sensor serializers
  views.py                     # Add habitat views
  urls.py                      # Add habitat URL patterns
```

**Why `features/habitat/` not scattered across existing dirs:** The habitat is a self-contained feature with its own state, simulation logic, and rendering approach. Co-locating everything under `features/habitat/` makes it removable (if needed), discoverable, and avoids polluting the existing flat page/component structure. The existing pages continue to live in `pages/` untouched.

## Technology Integration Notes

### React Three Fiber + React 19

R3F v8+ supports React 19. Key install:

```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

R3F uses its own React reconciler for the Canvas subtree. This means:
- Context from outside the Canvas does NOT propagate into it automatically
- Zustand works because it's reconciler-agnostic (operates via `useSyncExternalStore`)
- React Query, React Router, etc. work normally outside the Canvas

### Zustand Setup

```bash
npm install zustand
```

Zustand v5 (current) works with React 19. The store is created outside React, so no provider needed. Components import the hook directly.

### drei Helpers to Use

| Helper | Purpose |
|--------|---------|
| `OrbitControls` | Camera orbit/zoom/pan |
| `Html` | 3D-anchored DOM elements (zone labels) |
| `Text` | SDF text rendering (if Html performance is an issue) |
| `Environment` | HDR environment maps for realistic lighting |
| `Float` | Subtle floating animation for visual interest |
| `useGLTF` | Load GLTF/GLB 3D models if we upgrade from primitives |

## Sources

- Training data knowledge of React Three Fiber (pmndrs/react-three-fiber), Three.js, drei, Zustand
- Direct codebase analysis of existing SpatialHub platform
- No external sources were accessible for verification (WebSearch and WebFetch were unavailable)

**Confidence note:** React Three Fiber, drei, and Zustand are all libraries I have strong training data coverage on. The architectural patterns (R3F Canvas separation, Zustand selectors for performance, simulation engine as pure module) are well-established community patterns. However, version-specific API details (exact R3F v8 / React 19 compatibility, drei API surface) should be verified against current documentation during implementation.

---

*Architecture research: 2026-03-09*
