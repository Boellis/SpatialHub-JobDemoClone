# Architecture Research

**Domain:** 2.5D ambient TV dashboard layered onto existing React/R3F/Zustand app
**Milestone:** v4.0 Mars Habitat Revamp
**Researched:** 2026-03-21
**Confidence:** HIGH — all findings derived from direct codebase inspection

---

## Context: What Already Exists (v3.0 shipped)

This is a subsequent milestone. The full v3.0 stack is live. The data layer is complete and correct. The new dashboard reuses it entirely.

### Existing Frontend Topology

```
HabitatView.tsx (/habitat route)
  useSimSource()           — BioSim WebSocket pipeline + client-side fallback
  useLiveSensors()         — Pi polling, 10s interval
  <Canvas>                 — R3F, camera at [0,25,35], shadows, antialias
    <MarsEnvironment />    — lighting, fog, ground
    <HabitatStructure />   — ZoneDome + SensorOrb meshes, EffectComposer/SelectiveBloom
  <div overlay>
    <HabitatHUD />         — sol count, zone status row, connection badge
    <AlertBanner />        — toast stack for anomaly announcements
    <ZonePanel />          — right sidebar, shows when zone selected
    <AnomalyDrawer />      — bottom panel, anomaly scenario buttons
```

### habitatStore State (Zustand v5)

```
zones: Record<zoneId, ZoneState>
  ZoneState.status: 'green' | 'yellow' | 'red'   (worst-of-sensors)
  ZoneState.sensors: Record<sensorId, SensorReading>
    SensorReading.value: number
    SensorReading.status: 'green' | 'yellow' | 'red'
    SensorReading.history: number[]              (last 30 values)
    SensorReading.source: 'biosim' | 'sim' | 'live'
solElapsed: number
simSource: 'connecting' | 'biosim' | 'biosim-real' | 'fallback' | 'disconnected'
piDataFresh: boolean
```

Everything the TV dashboard needs is already in this store. No new state required.

---

## v4.0 New Architecture: What Changes

### System Overview

```
+------------------------------------------------------------------+
|                    /habitat route (v4.0)                          |
|                   TvDashboardView (NEW PAGE)                      |
+------------------------------------------------------------------+
|  +----------------------------------------------------------+    |
|  |         Three.js Canvas (parallax depth only)             |    |
|  |   position: fixed, inset: 0, zIndex: 0                   |    |
|  |   ParallaxBackground — 2 depth planes, auto-drift        |    |
|  |   NO OrbitControls, NO EffectComposer, NO postprocessing  |    |
|  +----------------------------------------------------------+    |
|  +----------------------------------------------------------+    |
|  |        HTML Priority Grid (DOM, CSS Grid)                 |    |
|  |   position: relative, zIndex: 1                          |    |
|  |   +------------------------+  +----------+  +----------+ |    |
|  |   |  HeroZoneCard          |  | ZoneCard |  | ZoneCard | |    |
|  |   |  rank 1 (most critical)|  | rank 2   |  | rank 3   | |    |
|  |   |  large type + chart    |  | + chart  |  | + chart  | |    |
|  |   +------------------------+  +----------+  +----------+ |    |
|  |                                              +----------+ |    |
|  |                                              | ZoneCard | |    |
|  |                                              | rank 4   | |    |
|  |                                              +----------+ |    |
|  +----------------------------------------------------------+    |
+------------------------------------------------------------------+
|                  Shared Data Layer (UNCHANGED)                     |
|   habitatStore  |  useSimSource  |  useLiveSensors                |
+------------------------------------------------------------------+
```

### Component Responsibilities: New vs Reused vs Unchanged

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `TvDashboardView` | NEW | Page root — mounts data hooks, composes Canvas + Grid |
| `ParallaxBackground` | NEW | R3F Canvas: 2 depth planes, sine-wave auto-drift |
| `PriorityGrid` | NEW | CSS Grid: maps ranked zone IDs to card slots with transition |
| `HeroZoneCard` | NEW | Full-width card for rank-1 zone (large type, expanded chart) |
| `ZoneCard` | NEW | Compact card for ranks 2-4 (sensor summary + chart) |
| `ZoneSensorChart` | NEW | SVG area/line chart extended from Sparkline |
| `usePriorityRanking` | NEW | Derives criticality order from store zones, debounces reorder |
| `habitatStore` | REUSE (unchanged) | Zone state, sensor readings, sim source |
| `useSimSource` | REUSE (unchanged) | BioSim WebSocket pipeline + fallback lifecycle |
| `useLiveSensors` | REUSE (unchanged) | Pi polling, live overlay into store |
| `Sparkline` | REUSE (reference) | Existing SVG sparkline — extend or copy pattern for charts |
| `ZONE_CONFIGS` / `ZONE_MAP` | REUSE (unchanged) | Zone/sensor config constants |
| `HabitatView` | UNCHANGED | Existing 3D scene — kept in codebase, not the active /habitat route |
| All other habitat components | UNCHANGED | ZonePanel, AnomalyDrawer, HabitatHUD, AlertBanner — not mounted in TV mode |

---

## Recommended Project Structure

```
src/
├── pages/
│   ├── HabitatView.tsx          # UNCHANGED (v1-v3 feature, preserved not deleted)
│   └── TvDashboardView.tsx      # NEW — v4.0 page root
├── components/
│   ├── habitat/                 # UNCHANGED — all existing components untouched
│   └── tv/                     # NEW — TV-specific components only
│       ├── ParallaxBackground.tsx
│       ├── PriorityGrid.tsx
│       ├── HeroZoneCard.tsx
│       ├── ZoneCard.tsx
│       └── ZoneSensorChart.tsx
├── hooks/
│   ├── useSimSource.ts          # UNCHANGED
│   ├── useLiveSensors.ts        # UNCHANGED
│   └── usePriorityRanking.ts    # NEW
├── store/
│   └── habitatStore.ts          # UNCHANGED — no new state
├── simulation/                  # UNCHANGED
└── types/
    └── habitat.ts               # UNCHANGED — existing types sufficient
```

### Structure Rationale

- **`components/tv/`:** Isolates new TV components. No risk of accidentally importing interactive 3D components into TV mode.
- **`hooks/usePriorityRanking.ts`:** Extracted so PriorityGrid stays layout-only. Ranking logic is independently testable with store data.
- **`pages/TvDashboardView.tsx`:** Mirrors `HabitatView.tsx` structure — mounts hooks, composes Canvas + HTML overlay. One file = one route.

---

## Architectural Patterns

### Pattern 1: Route Swap — Replace Page, Preserve Data Layer

**What:** `App.tsx` lazy-loads `HabitatView` under `/habitat`. v4.0 changes the import target to `TvDashboardView`. The existing `isHabitat` guard (`location.pathname === '/habitat'`) that hides the nav bar already works for the new page with zero changes.

**When to use:** Replacing a view while keeping all data infrastructure, routing, and bundle isolation identical.

**Trade-offs:** Minimal diff. Old 3D view is one import change away from restoration. The `React.lazy()` wrapper and `Suspense` fallback stay identical.

```typescript
// App.tsx — the only required change in this file
const HabitatView = React.lazy(() => import("./pages/TvDashboardView")); // was HabitatView
```

### Pattern 2: Layered Canvas + DOM (Proven Pattern in This Codebase)

**What:** R3F Canvas at `position: fixed, inset: 0, zIndex: 0`. HTML priority grid as a sibling at `zIndex: 1`. This is the identical pattern already used in `HabitatView.tsx` — Canvas + `pointerEvents: none` overlay div. It is proven to work in this exact codebase.

**When to use:** Any time Three.js visuals need to coexist with HTML UI.

**Key difference from HabitatView:** TV mode is non-interactive. No pointer-event management is needed on the Three.js layer. The overlay div does NOT need `pointerEvents: none` because there are no interactive elements in TV mode at all.

```typescript
// TvDashboardView.tsx
export default function TvDashboardView() {
  useSimSource();
  useLiveSensors();

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#050508' }}>
      <Canvas
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={{ antialias: false, alpha: true }}
      >
        <ParallaxBackground />
      </Canvas>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        <PriorityGrid />
      </div>
    </div>
  );
}
```

### Pattern 3: Priority Ranking with Reorder Debounce

**What:** `usePriorityRanking` subscribes to `habitatStore.zones` and computes a ranked zone ID array. Ranking criteria: red > yellow > green, then within same status sort by worst sensor delta from nominal. To prevent layout animation on every 2s tick (oscillating zones), a new rank order is only committed after it has been stable for `REORDER_STABILITY_TICKS` consecutive ticks.

**When to use:** Any time live data should drive visual ordering without causing constant reshuffling.

**Trade-offs:** Introduces intentional latency to rank promotion (typically 4-6 seconds at 2s tick rate). A genuine sustained crisis still reorders; transient noise does not.

```typescript
// hooks/usePriorityRanking.ts

const REORDER_STABILITY_TICKS = 3; // must hold rank for 3 consecutive ticks (~6s)

function rankZones(zones: Record<string, ZoneState>): string[] {
  const STATUS_WEIGHT = { red: 0, yellow: 1, green: 2 };
  return Object.values(zones)
    .sort((a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status])
    .map(z => z.zoneId);
}

export function usePriorityRanking(): string[] {
  const zones = useHabitatStore(s => s.zones);
  const [committed, setCommitted] = useState(() => rankZones(zones));
  const candidateRef = useRef<{ order: string[]; ticks: number }>({ order: [], ticks: 0 });

  useEffect(() => {
    const ranked = rankZones(zones);
    const c = candidateRef.current;

    if (arraysEqual(ranked, c.order)) {
      c.ticks++;
      if (c.ticks >= REORDER_STABILITY_TICKS) {
        setCommitted([...ranked]);
        c.ticks = 0;
      }
    } else {
      c.order = ranked;
      c.ticks = 1;
    }
  }, [zones]);

  return committed;
}
```

### Pattern 4: Parallax Auto-Drift via useFrame

**What:** `ParallaxBackground` uses R3F's `useFrame` to animate 2 depth planes with different sine-wave offsets on X and Y. No mouse input. Planes are `<planeGeometry>` scaled larger than viewport to prevent edge visibility during drift. Material is `meshBasicMaterial` with Mars-toned color and low opacity — wireframe on the far plane for topology-grid look.

**When to use:** TV ambient mode — "alive but not distracting."

**Trade-offs:** `useFrame` runs at 60fps for simple uniform transforms — minimal GPU cost. Do NOT import `EffectComposer` or `SelectiveBloom` here. The existing `/habitat` R3F scene uses postprocessing; TV mode must not share or duplicate it.

```typescript
// components/tv/ParallaxBackground.tsx
const LAYERS = [
  { z: -8, speed: 0.00025, amplitude: { x: 1.5, y: 0.8 }, opacity: 0.12, wireframe: true },
  { z: -4, speed: 0.00045, amplitude: { x: 0.8, y: 0.5 }, opacity: 0.07, wireframe: false },
];

function DriftPlane({ z, speed, amplitude, opacity, wireframe }: LayerConfig) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.x = Math.sin(t * speed * 1000) * amplitude.x;
    ref.current.position.y = Math.cos(t * speed * 700) * amplitude.y;
  });
  return (
    <mesh ref={ref} position={[0, 0, z]}>
      <planeGeometry args={[28, 18]} />
      <meshBasicMaterial color="#c0501a" transparent opacity={opacity} wireframe={wireframe} />
    </mesh>
  );
}
```

### Pattern 5: ZoneSensorChart — Extend Sparkline, Avoid New Dependencies

**What:** The existing `Sparkline` component (80×24px polyline) is extended for the TV dashboard. The TV chart needs larger dimensions, area fill beneath the line, and threshold color bands. All achievable in pure SVG — same approach as Sparkline.

**Recommendation:** Extend the Sparkline pattern into a new `ZoneSensorChart` component. Do NOT add Recharts, Nivo, or Victory for v4.0.

**Why not a chart library:** The TV display has no interactive tooltips, no click-to-zoom, no axes labels requiring complex tick math. The data shape (`history: number[]`) maps directly to SVG polyline coordinates. A chart library adds 60-100KB gzipped for features the TV mode explicitly does not use.

**Data already available:** Every `SensorReading` in the store has a `history: number[]` array (last 30 values, updated each 2s tick). No new data fetching needed.

---

## Data Flow

### Data Flow: Priority Grid

```
habitatStore.zones (Zustand subscription)
        |
usePriorityRanking()
        |  rankZones() on each tick
        |  debounce: only commit after 3 stable ticks
        v
committed: string[]   (e.g., ['water-recycling', 'atmosphere-control', 'grow-bays', 'power-thermal'])
        |
PriorityGrid
        |  maps over committed array
        |  index 0 → HeroZoneCard (isHero=true)
        |  index 1-3 → ZoneCard
        v
CSS Grid: grid-template-areas or column-span driven by isHero prop
CSS transition on grid 'order' property animates rank change
```

### Data Flow: Live Charts

```
habitatStore.zones[zoneId].sensors[sensorId].history: number[]
        |
        (updated by habitatStore.tick() every 2s)
        |
ZoneCard → ZoneSensorChart props
        |
SVG polyline re-render (React memo, shallow array comparison)
```

### Data Flow: Data Sources (UNCHANGED FROM v3)

```
BioSim WebSocket (GCE VM)            Pi Django REST API (Cloud Run)
        |                                    |
  biosimWorker.ts                   useLiveSensors.ts (10s poll)
        |                                    |
        +---------> habitatStore.tick() <----+
                          |
                   zones[*].sensors[*]
                   (same store, same selectors as before)
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 4 zones (current) | CSS Grid + SVG charts — no changes needed |
| 8-12 zones | PriorityGrid needs off-screen handling: show top 4 in grid, rest in a collapsed strip |
| 20+ zones | Switch ZoneSensorChart to OffscreenCanvas rendering; virtualize card list |

### Scaling Priorities

1. **First bottleneck:** 12 `ZoneSensorChart` SVG rerenders every 2s tick. Fix: `React.memo` on `ZoneSensorChart` with shallow history array comparison. History array is slice-constructed on each tick — must compare by value, not reference.
2. **Second bottleneck:** CSS Grid transition jank if rank changes frequently. Fix: the `REORDER_STABILITY_TICKS` debounce prevents this by design. Tune the constant if needed.

---

## Anti-Patterns

### Anti-Pattern 1: Calling useSimSource Inside the R3F Canvas

**What people do:** Call `useSimSource()` or `useLiveSensors()` inside `ParallaxBackground` or any R3F descendant of `<Canvas>`.

**Why it's wrong:** R3F has its own reconciler. React hooks inside R3F components run in R3F reconciler context — `useEffect` timing and cleanup semantics differ from DOM React. `useSimSource` uses `setInterval`, `AbortController`, Worker lifecycle management, and `useRef` patterns designed for DOM React. `HabitatView.tsx` correctly mounts both hooks outside Canvas. `TvDashboardView` must do the same.

**Do this instead:** Mount `useSimSource()` and `useLiveSensors()` in `TvDashboardView` at the DOM React level.

### Anti-Pattern 2: Adding EffectComposer to TV Canvas

**What people do:** Copy the `SelectiveBloom` / `EffectComposer` setup from `HabitatStructure` into `ParallaxBackground` for visual consistency.

**Why it's wrong:** The existing postprocessing stack is designed for the 3D scene graph — selective bloom on zone dome meshes, emissive rim rings, sensor orbs. TV mode has 2 flat planes with no emissive meshes. EffectComposer processes the entire framebuffer; adding it for 2 planes is GPU overhead that serves nothing.

**Do this instead:** `meshBasicMaterial` with controlled opacity. Any glow on HTML elements uses CSS `box-shadow` or `filter: blur()`.

### Anti-Pattern 3: Storing Priority Order in habitatStore

**What people do:** Add `rankedZoneIds: string[]` to `HabitatState` and derive it inside the store on every `tick()`.

**Why it's wrong:** Priority ranking is presentation-layer derived state. The store should not know about TV-specific layout logic. Storing it in the store means every component subscribed to the store rerenders on every reorder, not just `PriorityGrid`. It also pollutes the store's API contract with a concern that is meaningless outside TV mode.

**Do this instead:** `usePriorityRanking` derives order locally, subscribed only by `PriorityGrid`. Store stays clean.

### Anti-Pattern 4: Wiring Click/Hover Handlers for TV "Convenience"

**What people do:** Add `onClick` to `ZoneCard` to open a ZonePanel detail drawer "just in case someone wants to click."

**Why it's wrong:** TV mode is explicitly non-interactive by requirement. Adding interactive affordances sends mixed signals about what the interface is. It also reintroduces the interactive complexity (ZonePanel close button, AnomalyDrawer, selectedZoneId state) that was intentionally excluded.

**Do this instead:** All zone information is displayed inline in the cards. `selectedZoneId` is never set by TV mode.

### Anti-Pattern 5: Importing HabitatView Components Into TV Mode

**What people do:** Reuse `HabitatHUD`, `AnomalyDrawer`, `AlertBanner`, or `ZonePanel` inside `TvDashboardView` to save time.

**Why it's wrong:** These components carry pointer-events, interactive state (`onClose`, `triggerAnomaly`), and complex positioning logic designed for the 3D overlay. Their CSS and inline styles assume a fixed-position Canvas below them. TV mode has different layout requirements. Pulling them in creates subtle z-index, pointer-event, and styling conflicts.

**Do this instead:** Build TV-specific card components from scratch. They share the same data selectors but have independent styling. The `Sparkline` component and `formatSensorValue` utility from `ZonePanel` are safe to import — they are pure/stateless.

---

## Integration Points

### App.tsx — Single Required Change

```typescript
// Before
const HabitatView = React.lazy(() => import("./pages/HabitatView"));

// After
const HabitatView = React.lazy(() => import("./pages/TvDashboardView"));
```

The `isHabitat` check, `Suspense` fallback, and nav-bar hiding logic all work unchanged.

### External Services

| Service | Integration Pattern | Status |
|---------|---------------------|--------|
| BioSim WebSocket (GCE VM) | `useSimSource` — biosimWorker.ts WebSocket pipeline | UNCHANGED |
| Pi Django REST (Cloud Run) | `useLiveSensors` — 10s poll to `/api/enriched/?hub_id=pi-habitat-01` | UNCHANGED |
| Firebase Hosting | Static build — same Vite output | UNCHANGED |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `TvDashboardView` → `habitatStore` | Zustand subscriptions (read-only) | Never calls `setSelectedZoneId`, `triggerAnomaly`, `cancelAnomaly` |
| `TvDashboardView` → `ParallaxBackground` | No props needed | Canvas is self-contained once mounted |
| `PriorityGrid` → `usePriorityRanking` | Hook returns `string[]` ranked zone IDs | Grid maps over array, passes `isHero` (index === 0) to each card |
| `HeroZoneCard` / `ZoneCard` → `habitatStore` | `selectZone(zoneId)` selector | Each card subscribes to its own zone slice only — granular rerenders |
| `ZoneSensorChart` → store | Prop-drilled from card | Receives `history: number[]` and `status` — pure/stateless |

---

## Build Order

Steps 2-5 are parallelizable after step 1 is done.

```
1. usePriorityRanking hook
   No UI deps. Test directly against live store in dev.
   Establish REORDER_STABILITY_TICKS and ranking sort order.

   THEN (parallel):

2. ZoneSensorChart                    3. ParallaxBackground
   Pure SVG component.                   Pure R3F component.
   Extend Sparkline pattern.             DriftPlane + useFrame.
   Accepts history: number[].            No store dependency.

   THEN:

4. ZoneCard + HeroZoneCard
   Depends on (1) ranking hook output and (2) chart component.
   Wire selectZone(zoneId) store selectors.
   HeroZoneCard = ZoneCard with isHero prop for larger layout.

   THEN:

5. PriorityGrid
   Depends on (1) + (4).
   CSS Grid layout.
   CSS transition on reorder.

   THEN (parallel):

6a. TvDashboardView                   6b. App.tsx import swap
    Compose Canvas (3) + Grid (5).        One-line change.
    Mount useSimSource + useLiveSensors.
    Full-page layout shell.

   DONE.
```

---

## Sources

- Direct codebase inspection (2026-03-21):
  - `spatialhub-frontend/src/pages/HabitatView.tsx` — Canvas/overlay pattern
  - `spatialhub-frontend/src/store/habitatStore.ts` — store shape, selectors
  - `spatialhub-frontend/src/hooks/useSimSource.ts` — hook placement constraints
  - `spatialhub-frontend/src/hooks/useLiveSensors.ts` — Pi polling
  - `spatialhub-frontend/src/components/habitat/ZonePanel.tsx` — Sparkline usage, sensor row patterns
  - `spatialhub-frontend/src/components/habitat/Sparkline.tsx` — SVG chart baseline
  - `spatialhub-frontend/src/components/habitat/HabitatHUD.tsx` — store subscription patterns
  - `spatialhub-frontend/src/types/habitat.ts` — type definitions
  - `spatialhub-frontend/src/simulation/constants.ts` — ZONE_CONFIGS structure
  - `spatialhub-frontend/src/App.tsx` — routing, lazy-load, isHabitat guard
- Project context: `.planning/PROJECT.md`

---

*Architecture research for: v4.0 2.5D ambient TV dashboard integration with existing React/R3F/Zustand habitat app*
*Researched: 2026-03-21*
