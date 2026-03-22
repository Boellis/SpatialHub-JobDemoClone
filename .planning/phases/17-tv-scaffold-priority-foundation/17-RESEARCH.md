# Phase 17: TV Scaffold + Priority Foundation - Research

**Researched:** 2026-03-21
**Domain:** React + R3F non-interactive route scaffold, Zustand-derived priority ranking hook
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- TV dashboard **replaces** `/habitat` — `TvDashboardView` takes over the existing route
- Old `HabitatView` becomes dead code in the repo (no legacy route, no `/habitat-3d`)
- Anomaly triggering is **dropped entirely** on TV route — no AnomalyDrawer; anomalies only via BioSim REST API or automated `control_loop`
- No nav bar on TV route — full-viewport, zero chrome; reuse existing `isHabitat` conditional in `App.tsx` (already hides nav when `pathname === '/habitat'`)
- Lazy-loaded via `React.lazy()` — same isolated bundle pattern as old HabitatView
- Scoring formula: `(red_count * 10) + (yellow_count * 3)` per zone (from LAYOUT-03)
- 3 consecutive stable ticks required before committing a reorder
- `usePriorityRanking` hook — pure derivation from `habitatStore.zones`, lives in `hooks/`, not in the store
- Zero click/hover/touch handlers in the entire component tree
- R3F Canvas must use `events={null}` — no raycaster activity
- No OrbitControls, no CameraController — these register listeners even when disabled

### Claude's Discretion
- Canvas scaffold approach — whether to include an empty R3F Canvas now (background layer for Phase 20 parallax) or defer to DOM-only scaffold
- Priority tie-breaking logic when zones have equal criticality scores
- Scaffold visual appearance — what renders on screen in Phase 17 (minimal layout placeholder vs dark void with ranked zone IDs)
- Data hook mounting strategy — how `useSimSource` and `useLiveSensors` are wired on the TV route
- Loading spinner design for the lazy-loaded chunk

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LAYOUT-01 | Dashboard replaces `/habitat` as a non-interactive full-viewport TV display (zero click/hover/touch) | Route swap pattern confirmed in App.tsx line 16; `isHabitat` guard at line 41 already handles nav hide; `events={null}` on Canvas is the critical R3F property; confirmed in R3F Canvas docs |
| LAYOUT-03 | Criticality scoring algorithm ranks zones by `(red_count * 10) + (yellow_count * 3)` with stable tie-breaking | `usePriorityRanking` hook pattern documented; 3-tick stability debounce design confirmed; zone sensor data available in habitatStore — `ZoneState.sensors` per zone has per-sensor status; `ZONE_CONFIGS` has 4 zones with 3 sensors each |
</phase_requirements>

## Summary

Phase 17 is a narrow, well-scoped phase: one new page file, one new hook, and a single-line change to `App.tsx`. The entire data infrastructure is already running — `habitatStore`, `useSimSource`, `useLiveSensors`, and the 2s simulation tick are all untouched. This phase delivers the route scaffold (non-interactive Canvas + DOM shell) and the `usePriorityRanking` hook that computes the criticality score and defers reorders until 3 consecutive stable ticks.

The two hard constraints that must be applied from the first line of code: `events={null}` on the R3F Canvas (R3F v9 attaches a full raycaster unconditionally otherwise), and the 3-tick stability debounce on rank commits (sensor noise near yellow thresholds causes thrashing without it). Both are documented pitfalls with known root causes — they are not theoretical.

The discretionary call on Canvas scaffold: include an empty R3F Canvas with `events={null}` now, even if `ParallaxBackground` is Phase 20. This locks in the correct event isolation from day one and avoids a refactor when Phase 20 adds the parallax. A dark background `div` alone would require the planner to later add Canvas without breaking the phase boundary.

**Primary recommendation:** Wire `TvDashboardView` as a pass-through shell (mount hooks, render Canvas + empty DOM container), then implement `usePriorityRanking` as the phase's algorithmic deliverable. The hook can be validated in browser devtools against live store state before any visual components exist.

---

## Standard Stack

### Core

All dependencies are already installed. No `npm install` required for Phase 17.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-three/fiber` | `^9.5.0` (installed) | R3F Canvas with `events={null}` | Already in prod bundle; Canvas setup is the non-interactive foundation |
| `zustand` | `^5.0.11` (installed) | `habitatStore` subscriptions in new hook | Existing store; per-zone selectors already exported |
| `react` | `^19.0.0` (installed) | `React.lazy`, `Suspense`, `useState`, `useRef`, `useEffect` | React 19 is the project's pinned version |
| `react-router-dom` | `^7.5.3` (installed) | `/habitat` route already defined — no new routing work | Existing route |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `three` | `^0.183.2` (installed) | Three.js renderer context on Canvas | Needed for `renderer.info` GPU baseline check in dev |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Empty R3F Canvas now | DOM-only scaffold, add Canvas in Phase 20 | Canvas-now locks in `events={null}` from the start; avoids a future refactor that could accidentally reintroduce raycasting |
| `useRef` tick counter for debounce | Zustand state for tick counter | Storing debounce state in Zustand pollutes the store with TV-presentation-layer logic; `useRef` is the right tool |

**Installation:** None — all packages are installed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── pages/
│   ├── HabitatView.tsx         # UNCHANGED — dead code, preserved not deleted
│   └── TvDashboardView.tsx     # NEW — phase 17 delivers this file
├── components/
│   ├── habitat/                # UNCHANGED
│   └── tv/                     # NEW directory — empty in Phase 17
├── hooks/
│   ├── useSimSource.ts         # UNCHANGED
│   ├── useLiveSensors.ts       # UNCHANGED
│   └── usePriorityRanking.ts   # NEW — phase 17 delivers this file
└── store/
    └── habitatStore.ts         # UNCHANGED — no new state
```

### Pattern 1: Route Swap (App.tsx Single-Line Change)

**What:** Change the lazy import target from `HabitatView` to `TvDashboardView`. The `isHabitat` check, `Suspense` fallback, and nav-bar hide logic all work unchanged because the route is still `/habitat`.

**When to use:** Replacing a view while keeping routing, lazy-loading, and bundle isolation identical.

```typescript
// Source: direct codebase inspection — App.tsx line 16
// Before
const HabitatView = React.lazy(() => import("./pages/HabitatView"));

// After
const HabitatView = React.lazy(() => import("./pages/TvDashboardView"));
```

The variable name `HabitatView` does not need to change — it is only used in the JSX below and the Suspense fallback already reads correctly.

### Pattern 2: Non-Interactive Canvas + DOM Shell

**What:** R3F Canvas at `position: absolute, inset: 0, zIndex: 0` with `events={null}`. DOM grid layer as sibling at `zIndex: 1`. Critically: no `pointerEvents: none` needed on the overlay because there are no interactive elements anywhere.

**When to use:** TV ambient mode — the overlay is not hiding interaction, it is displaying data.

```typescript
// Source: ARCHITECTURE.md Pattern 2 — proven in this codebase
export default function TvDashboardView() {
  useSimSource();
  useLiveSensors();

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#050508' }}>
      <Canvas
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={{ antialias: false, alpha: true }}
        events={null}
      >
        {/* Empty in Phase 17 — ParallaxBackground lands in Phase 20 */}
      </Canvas>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {/* PriorityGrid lands in Phase 18 — placeholder div is sufficient here */}
      </div>
    </div>
  );
}
```

**Critical:** `gl={{ antialias: false }}` — no postprocessing, no EffectComposer, no SelectiveBloom. The existing HabitatView uses bloom; TV mode must not inherit it.

### Pattern 3: usePriorityRanking Hook — Score Derivation + Stability Debounce

**What:** Pure derivation hook. Reads `habitatStore.zones`, computes a criticality score per zone using `(red_count * 10) + (yellow_count * 3)`, sorts descending, then requires 3 consecutive ticks of the same ordering before committing to React state.

**Scoring algorithm detail:** For each zone, count the number of sensors in `red` status and the number in `yellow` status. Apply the formula. Zones with identical scores need a tie-breaker — use stable zone ID alphabetical sort to prevent any random swap on equal-score zones.

**Zone IDs (from constants.ts):**
- `atmosphere-control`
- `grow-bays`
- `power-thermal`
- `water-recycling`

```typescript
// Source: ARCHITECTURE.md Pattern 3 + PITFALLS.md Pitfall 7
const REORDER_STABILITY_TICKS = 3;

function scoreZone(zone: ZoneState): number {
  let red = 0, yellow = 0;
  for (const sensor of Object.values(zone.sensors)) {
    if (sensor.status === 'red') red++;
    else if (sensor.status === 'yellow') yellow++;
  }
  return (red * 10) + (yellow * 3);
}

function rankZones(zones: Record<string, ZoneState>): string[] {
  return Object.values(zones)
    .sort((a, b) => {
      const diff = scoreZone(b) - scoreZone(a); // descending score
      if (diff !== 0) return diff;
      return a.zoneId.localeCompare(b.zoneId);  // stable tie-break
    })
    .map(z => z.zoneId);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function usePriorityRanking(): string[] {
  const zones = useHabitatStore(s => s.zones);
  const [committed, setCommitted] = useState(() => rankZones(zones));
  const candidateRef = useRef<{ order: string[]; ticks: number }>({
    order: rankZones(zones),
    ticks: 0,
  });

  useEffect(() => {
    const ranked = rankZones(zones);
    const c = candidateRef.current;

    if (arraysEqual(ranked, c.order)) {
      c.ticks++;
      if (c.ticks >= REORDER_STABILITY_TICKS) {
        setCommitted(prev => arraysEqual(prev, ranked) ? prev : [...ranked]);
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

**Key subtlety:** `setCommitted` uses the functional form with `arraysEqual` guard to avoid triggering a re-render when the stable order matches the already-committed order. Without this, the hook fires a state update every 3rd tick even when order has not changed.

### Anti-Patterns to Avoid

- **`OrbitControls` with `enabled={false}`:** Still attaches event listeners. Remove `CameraController.tsx` entirely from the TV route — do not conditionally disable it.
- **Storing ranked IDs in habitatStore:** Priority ranking is TV presentation state only. Store stays clean.
- **Calling `useSimSource` inside the Canvas:** R3F has its own reconciler; `useEffect` semantics differ. Must mount at DOM React level in `TvDashboardView`.
- **Importing HabitatHUD, AnomalyDrawer, AlertBanner, ZonePanel:** These carry pointer-events and interactive state. Build TV scaffold from scratch.
- **`setSelectedZoneId`, `triggerAnomaly`, `cancelAnomaly`:** Never call these from TV route.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Non-interactive Canvas | Custom event suppression logic | `events={null}` on `<Canvas>` | R3F's built-in prop cleanly disables the EventManager; hand-rolled suppression misses internal raycaster paths |
| Hysteresis debounce | Custom timer/debounce library | `useRef` tick counter | Pure counter logic; no external dep needed; mirrors the store's `tickCount` pattern already in codebase |
| Zone score computation | Backend endpoint | Pure client-side function from `habitatStore.zones` | All sensor status is already in Zustand; no round-trip needed |

**Key insight:** The entire feature is derivation of data that already exists. The only code to write is the hook logic and the route scaffold shell.

---

## Common Pitfalls

### Pitfall 1: R3F Raycaster Active Without events={null}

**What goes wrong:** R3F v9 registers `pointermove`, `pointerdown`, `pointerup`, and `click` on the Canvas DOM element unconditionally. Even with no mesh pointer handlers, the GPU raycast runs on every cursor event.

**Why it happens:** Developers remove mesh handlers and assume Canvas is passive. It is not. `CameraController.tsx` uses `OrbitControls` from drei — `enabled={false}` does not remove its DOM listeners (Three.js issue #19917).

**How to avoid:** Pass `events={null}` to `<Canvas>`. Do not include `CameraController.tsx` or `OrbitControls` in the TV component tree at all.

**Warning signs:** Chrome DevTools Performance tab shows raycasting activity while no user interaction is occurring.

### Pitfall 2: Priority Ranking Thrashes Near Threshold Boundaries

**What goes wrong:** Sensor noise near yellow thresholds causes zone status to oscillate green/yellow each tick. Without debounce, the ranking re-sorts every 2s, producing continuous visual thrashing.

**Why it happens:** `deriveZoneStatus` in the store is a pure threshold comparison with no hysteresis. `noiseAmplitude` values in `constants.ts` (0.05–15 per sensor) make boundary crossings common.

**How to avoid:** The 3-tick stability requirement must be in the initial `usePriorityRanking` implementation, not added afterward. `candidateRef.ticks` counter pattern above handles this without Zustand.

**Warning signs:** Grid would reorder more than once per 6 seconds when sensors are near threshold values.

### Pitfall 3: Committed Order Fires Spurious Re-renders

**What goes wrong:** If `setCommitted` is called with a new array reference containing the same values, React schedules a re-render unnecessarily.

**Why it happens:** `rankZones` always returns a new array. If the check is `if (ticks >= 3) setCommitted(ranked)`, a tick-3 event fires a state update even if the committed order was already identical.

**How to avoid:** Guard the `setCommitted` call: `setCommitted(prev => arraysEqual(prev, ranked) ? prev : [...ranked])`. React bails out of re-render when the same reference is returned from the functional updater.

### Pitfall 4: candidateRef Initial State Mismatch

**What goes wrong:** If `candidateRef` is initialized to `{ order: [], ticks: 0 }`, the first call to `useEffect` always sees a mismatch (empty array vs. 4-element array), resets to ticks=1, and the hook takes 3 full ticks (6s) to commit the initial ordering — showing no ranking on first render.

**How to avoid:** Initialize `candidateRef` with the initial ranked result: `useRef({ order: rankZones(zones), ticks: 0 })`. Initial `committed` state is also set from `rankZones(zones)` via `useState` lazy initializer so first render shows correct order immediately.

---

## Code Examples

### Scoring Formula Implementation

```typescript
// Source: REQUIREMENTS.md LAYOUT-03 + habitatStore.ts ZoneState shape
function scoreZone(zone: ZoneState): number {
  let red = 0, yellow = 0;
  for (const sensor of Object.values(zone.sensors)) {
    if (sensor.status === 'red') red++;
    else if (sensor.status === 'yellow') yellow++;
  }
  return (red * 10) + (yellow * 3);
}
```

With 3 sensors per zone, score range is: 0 (all green) → 30 (all red).

### Verifying Non-Interactivity in Dev

```typescript
// Add temporarily in TvDashboardView for Phase 17 verification
// Source: R3F Canvas docs — gl.info property
import { useThree } from '@react-three/fiber';

function DevRaycasterCheck() {
  const { gl } = useThree();
  useEffect(() => {
    console.log('[TV] Renderer info on mount:', gl.info.render);
  }, [gl]);
  return null;
}
```

Remove before merge. Raycaster is confirmed absent when `renderer.info.render.calls` does not increase on cursor movement.

### Zustand Subscription Pattern for PriorityGrid (Phase 18 preview)

```typescript
// Source: habitatStore.ts — selectZone exported selector
// This is how Phase 18 ZoneCard will consume data without cascade re-renders
import { shallow } from 'zustand/shallow';

// In PriorityGrid — subscribes only to ranked IDs, not full zones object
const rankedIds = usePriorityRanking(); // returns string[]

// In ZoneCard — subscribes only to its own zone slice
const zone = useHabitatStore(selectZone(zoneId));
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `HabitatView` as interactive 3D scene | `TvDashboardView` as non-interactive ambient display | Route swap, not refactor — existing scene preserved |
| Zone order static in 3D scene | Priority-scored dynamic ordering with debounce | Judges see most critical zone without any interaction |
| `CameraController` with OrbitControls | No controls at all — `events={null}` on Canvas | Eliminates hidden raycasting overhead |

---

## Open Questions

1. **Canvas scaffold: include empty Canvas now or DOM-only?**
   - What we know: CONTEXT.md marks this as Claude's Discretion
   - Recommendation: Include empty Canvas with `events={null}` in Phase 17. Reason: locks in the correct non-interactive foundation now; avoids a later refactor risk when Phase 20 adds `ParallaxBackground`. A DOM-only scaffold would require opening `TvDashboardView` again in Phase 20 with the risk of accidentally removing `events={null}`.
   - Risk: minimal — empty Canvas with `gl={{ antialias: false, alpha: true }}` adds negligible bundle weight.

2. **Scaffold visual appearance**
   - What we know: CONTEXT.md marks this as Claude's Discretion
   - Recommendation: Dark void (`background: #050508`) with a minimal dev-only ranked zone ID list (`<ul>` or `<pre>`) so `usePriorityRanking` output is visually verifiable in the browser without devtools. Remove in Phase 18 when real cards land.

3. **Data hook mounting**
   - What we know: CONTEXT.md marks this as Claude's Discretion; HabitatView mounts both `useSimSource()` and `useLiveSensors()` at the page root level
   - Recommendation: Mirror HabitatView exactly — call both hooks at the top of `TvDashboardView`. The hooks are already designed for this pattern and `startSimulation()` is idempotent.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `spatialhub-frontend/vitest.config.ts` |
| Quick run command | `cd spatialhub-frontend && npx vitest run src/__tests__/usePriorityRanking.test.ts` |
| Full suite command | `cd spatialhub-frontend && npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAYOUT-01 | `/habitat` route renders without any event handlers in the component tree | unit (smoke) | `npx vitest run src/__tests__/TvDashboardView.test.tsx` | Wave 0 |
| LAYOUT-01 | Canvas `events` prop is `null` (not undefined) | unit | included in TvDashboardView test | Wave 0 |
| LAYOUT-03 | `scoreZone` returns `(red*10)+(yellow*3)` for known inputs | unit | `npx vitest run src/__tests__/usePriorityRanking.test.ts` | Wave 0 |
| LAYOUT-03 | `rankZones` sorts descending by score with stable zoneId tie-break | unit | included in usePriorityRanking test | Wave 0 |
| LAYOUT-03 | Hook does not commit new order until 3 consecutive stable ticks | unit | included in usePriorityRanking test | Wave 0 |
| LAYOUT-03 | Hook does NOT thrash when candidate flips back before tick 3 | unit | included in usePriorityRanking test | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd spatialhub-frontend && npx vitest run src/__tests__/usePriorityRanking.test.ts`
- **Per wave merge:** `cd spatialhub-frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `spatialhub-frontend/src/__tests__/usePriorityRanking.test.ts` — covers LAYOUT-03 scoring formula and stability debounce
- [ ] `spatialhub-frontend/src/__tests__/TvDashboardView.test.tsx` — covers LAYOUT-01 non-interactive scaffold (jsdom environment, verify no event handlers registered, Canvas rendered)

Note: existing test infrastructure (`vitest.config.ts`, `@testing-library/react`, `jsdom`) is already in place. The `vitest.config.ts` uses `environment: 'node'` globally — individual test files that need jsdom must use the `/** @vitest-environment jsdom */` directive at the top, which is already established practice in `App.test.tsx`.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection:
  - `spatialhub-frontend/src/App.tsx` — route definition, lazy load pattern, isHabitat guard
  - `spatialhub-frontend/src/store/habitatStore.ts` — ZoneState shape, `tick()` pattern, exported selectors
  - `spatialhub-frontend/src/pages/HabitatView.tsx` — hook mounting pattern, Canvas setup
  - `spatialhub-frontend/src/simulation/constants.ts` — 4 zones, 3 sensors each, noiseAmplitude values confirming threshold jitter risk
  - `spatialhub-frontend/package.json` — confirmed installed package versions
  - `spatialhub-frontend/vitest.config.ts` — test framework configuration
  - `spatialhub-frontend/src/__tests__/App.test.tsx` — jsdom directive pattern
- `.planning/research/ARCHITECTURE.md` — Canvas layering pattern, route swap, component topology
- `.planning/research/PITFALLS.md` — Pitfalls 1 (R3F raycaster), 7 (priority thrashing)
- `.planning/research/SUMMARY.md` — stack decisions, build order rationale
- `.planning/phases/17-tv-scaffold-priority-foundation/17-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)

- [R3F Canvas docs](https://r3f.docs.pmnd.rs/api/canvas) — `events` prop confirmed in ARCHITECTURE.md research
- [Three.js issue #19917](https://github.com/mrdoob/three.js/issues/19917) — OrbitControls `enabled=false` still attaches listeners (cited in PITFALLS.md)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed installed at exact versions from package.json
- Architecture: HIGH — all patterns derived from direct codebase inspection; `HabitatView.tsx` is the working reference
- Pitfalls: HIGH — sourced from PITFALLS.md which is grounded in codebase-specific evidence; scoring formula and zone sensor counts verified in constants.ts and habitatStore.ts
- Test infrastructure: HIGH — vitest config, existing test files, and jsdom directive pattern all confirmed present

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable stack, no external API surface, no fast-moving dependencies in scope)
