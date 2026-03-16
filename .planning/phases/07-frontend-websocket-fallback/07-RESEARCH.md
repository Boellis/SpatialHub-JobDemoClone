# Phase 7: Frontend WebSocket + Fallback - Research

**Researched:** 2026-03-15
**Domain:** React 19 + Vite 6 + Web Workers + WebSocket + Zustand 5 state machine
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Connection Badge UX**
- Badge sits in the bottom area of the HabitatHUD panel (below the zone status row), as a small pill badge
- Four states with distinct visual treatments:
  - Connected: Green dot + "BioSim Live" (green text)
  - Connecting: Grey dot + "Connecting..." (grey text)
  - Disconnected: Red dot + "Disconnected" (red text) — shown for ~2 seconds on WS drop before switching to Fallback
  - Fallback: Amber dot + "Fallback Mode" (amber text)
- Subtle pulse animation on state change: badge scales 1.0 -> 1.1 -> 1.0 two-three times, color cross-fades over ~300ms, then settles to static
- When BioSim reconnects after being down: badge shows "Reconnecting..." (grey) during the attempt, then "BioSim Live" (green) on success

**Source Switching Behavior**
- Initial load strategy: Start client-side simulation immediately on mount (zero blank-screen time). Probe BioSim REST API in background simultaneously. If BioSim responds, seamlessly switch from sim to WebSocket data
- Sparkline history: Preserved across source switches — existing 30-point ring buffer continues, new data source appends to it. biosimMapper's `existingHistory` parameter enables this
- Sol counter: Continues counting regardless of source. Sol is just elapsed time / 600, not tied to simulation physics. No reset on switch
- Auto-switch on availability: When BioSim becomes available mid-session (was down, Docker started), the system auto-detects via background probe and switches from sim to BioSim automatically

**WebSocket URL Configuration**
- Single Vite env var: `VITE_BIOSIM_URL` defaults to `http://localhost:8009` if not set
- REST URL: Use env var as-is for HTTP probe (e.g., `http://localhost:8009/api/simulation/active`)
- WebSocket URL: Derive from REST URL by replacing `http` with `ws` (e.g., `ws://localhost:8009/ws/simulation/{simID}`)
- Simulation ID discovered via HTTP probe to BioSim REST API — not hardcoded

**Reconnection Strategy**
- Fast retries on disconnect: 3 attempts at 1s, 2s, 4s intervals (exponential backoff). Badge shows "Reconnecting..." during retries
- Fallback after retries exhausted: Start client-side simulation. Badge shows "Disconnected" (red) for 2 seconds, then "Fallback Mode" (amber)
- Background probe: Every 15 seconds, probe BioSim REST API. If BioSim comes back online, auto-reconnect WebSocket. No maximum retry limit — keeps trying indefinitely
- Navigation lifecycle: Disconnect WebSocket on /habitat unmount (close WS, stop sim engine, clear probe timer). Reconnect fresh on remount. Navigate away and back 5 times = exactly 1 active WebSocket connection

**Web Worker Architecture**
- Worker owns the WebSocket connection, receives raw messages, runs JSON parsing + biosimMapper conversion, and posts processed readings to main thread
- Main thread only calls `store.tick(processedReadings)` — zero JSON parsing or biosim mapping on the render thread
- RAF buffering: Worker posts at message rate, main thread batches via requestAnimationFrame before calling store.tick()

### Claude's Discretion
- State machine implementation pattern (enum states, reducer, or simple boolean flags)
- Worker file structure and communication protocol
- RAF buffering implementation details
- Exact probe interval tuning (15s is the target, fine to adjust)
- Connection timeout values for HTTP probe and WebSocket handshake
- How to handle the simID becoming stale (BioSim restart with new simID)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TELE-01 | Frontend WebSocket hook (`useBioSimWS`) connects to BioSim WS and drives habitatStore | Worker-owned WebSocket pattern, BioSim WS URL structure confirmed |
| TELE-03 | WebSocket messages buffered via useRef and flushed on requestAnimationFrame cadence | RAF buffering on main thread, useRef for pending message queue |
| TELE-04 | 3D habitat scene displays real BioSim physics data with no component changes | store.tick() is the single gateway — all 3D components already subscribe via Zustand selectors |
| FALL-01 | `useSimSource` hook auto-detects BioSim availability within 2-5 seconds | HTTP probe to /api/simulation/active on mount, 5s timeout |
| FALL-02 | Habitat gracefully falls back to client-side simulation when BioSim unavailable | engine.ts createSimulationEngine() already exists, lazy import pattern established |
| FALL-03 | HabitatHUD shows connection badge ("BioSim Connected" green / "Fallback Mode" amber) | DOM-injection CSS animation pattern established by AlertBanner |
| FALL-04 | Exactly one data source active at any time (state machine enforced) | simSource enum state in habitatStore, XOR guard at tick() boundary |
| PERF-01 | WebSocket data processing runs in a Web Worker to keep main thread free for rendering | Vite 6 `new Worker(new URL(..., import.meta.url), {type:'module'})` pattern |
| PERF-02 | Zustand store uses granular selectors so only affected zone/sensor components re-render on tick | selectZone/selectSensorReading selectors already exist and are used |
| PERF-05 | 3D scene maintains 60fps during peak telemetry throughput (10+ ticks/sec) | Worker offloads JSON parse + mapper; RAF batching smooths burst delivery |
| PERF-06 | Sub-100ms latency from BioSim state change to visual update in habitat view | Worker posts immediately on message; RAF flush is at most one frame (16ms) behind |
| PERF-07 | Frontend handles 10+ ticks/sec burst rate without dropping messages or leaking memory | RAF buffer accumulates messages, applies last-value-wins on burst, ring buffer caps at 30 |
</phase_requirements>

---

## Summary

Phase 7 wires a Web Worker-owned WebSocket into the existing Zustand habitatStore via the `store.tick()` gateway, with no changes to 3D scene components. The Worker receives raw BioSim JSON, runs `mapBioSimToHabitatReadings`, and posts processed readings to the main thread. The main thread batches via `requestAnimationFrame` before calling `tick()`. A `useSimSource` hook orchestrates the full state machine: immediate fallback on mount, background REST probe, automatic promotion to BioSim when available, exponential-backoff reconnection on drop, and re-promotion from background probe.

The stack is entirely native browser APIs (WebSocket, Web Workers, requestAnimationFrame) with no additional library dependencies. Vite 6's built-in Web Worker support handles bundling via `new Worker(new URL('./biosimWorker.ts', import.meta.url), { type: 'module' })`. The existing `AlertBanner` pattern for DOM-injected CSS keyframes applies directly to the connection badge pulse animation. TypeScript Worker types work by adding `"WebWorker"` to the `lib` array in `tsconfig.app.json`.

The primary complexity is the state machine lifecycle: ensuring exactly one cleanup path on unmount (no leaked sockets on navigate-away-and-back), handling the 2-second "Disconnected" display before transitioning to "Fallback Mode", and extracting the simID from the BioSim REST probe (`GET /api/simulation/active` or equivalent). The BioSim WebSocket message shape matches the fixture: `{ globals: {...}, modules: {...} }` — same structure `mapBioSimToHabitatReadings` already consumes.

**Primary recommendation:** Build `useSimSource.ts` as the single orchestration hook, `useBioSimWS.ts` as the pure WS connection hook it delegates to, and `biosimWorker.ts` as the Worker file. Add `simSource` as a new field on `habitatStore` (four-state enum). Connection badge lives in `HabitatHUD` reading `simSource` from the store.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native WebSocket API | Browser built-in | BioSim WS connection owned by Worker | No library needed; BioSim uses plain WS protocol |
| Web Workers API | Browser built-in | Off-main-thread JSON parse + biosimMapper | PERF-01 requirement; Vite 6 handles bundling natively |
| requestAnimationFrame | Browser built-in | RAF-cadence batch flush from Worker messages | PERF-03/PERF-07; prevents burst-induced jank |
| Zustand 5.0.11 | Already installed | simSource state field + tick() gateway | Already the state management system; no new dependency |
| Vite 6.3.1 | Already installed | Worker bundling via `new Worker(new URL(...))` | Built-in, no plugin needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vitest/web-worker` | Latest (^4.x peer) | Test Web Worker message protocol in Vitest | Unit testing the Worker's postMessage output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native Worker + postMessage | Comlink (proxy RPC layer) | Comlink simplifies async RPC but adds a dependency and obscures the simple one-way message flow this phase needs |
| Plain enum state in Zustand | XState state machine | XState is more formal and testable but adds ~15KB and this phase's state machine has only 4 states with simple transitions |
| RAF buffer in main thread | Throttling in Worker | Worker-side throttling loses BioSim tick data; main-thread RAF retains all messages and applies last-value-wins on burst |

**Installation:**
```bash
cd spatialhub-frontend
npm install --save-dev @vitest/web-worker
```

---

## Architecture Patterns

### Recommended Project Structure
```
spatialhub-frontend/src/
├── hooks/
│   ├── useSimSource.ts       # Orchestration hook: state machine, probe, lifecycle
│   └── useBioSimWS.ts        # Pure WS connection hook (used by useSimSource)
├── workers/
│   └── biosimWorker.ts       # Web Worker: owns WS, parses JSON, runs biosimMapper, postMessage
├── store/
│   └── habitatStore.ts       # Add simSource field + selectSimSource selector
└── components/habitat/
    └── HabitatHUD.tsx        # Add ConnectionBadge below zone row, reads simSource
```

### Pattern 1: Vite 6 Web Worker Instantiation (Module Worker)

**What:** Vite 6 supports module Workers natively. Use `new Worker(new URL(..., import.meta.url), { type: 'module' })`. The Worker file can use ESM imports (e.g., `import { mapBioSimToHabitatReadings } from '../simulation/biosimMapper'`).
**When to use:** Always for this project — enables importing biosimMapper directly in the Worker without bundling complexity.

```typescript
// Source: https://vite.dev/guide/features#web-workers
// In useBioSimWS.ts or useSimSource.ts
const worker = new Worker(
  new URL('../workers/biosimWorker.ts', import.meta.url),
  { type: 'module' }
);
```

**TypeScript types for the Worker file:** Add `"WebWorker"` to `lib` in `tsconfig.app.json`:
```json
"lib": ["ES2020", "DOM", "DOM.Iterable", "WebWorker"]
```
This gives `self`, `postMessage`, `WebSocket`, and `MessageEvent` types inside the Worker file without a separate tsconfig.

### Pattern 2: Worker-Owned WebSocket with postMessage

**What:** The Worker opens the WebSocket, parses `event.data`, calls `mapBioSimToHabitatReadings`, and posts processed readings. Main thread receives and applies via RAF buffer.
**When to use:** PERF-01 — keeps JSON.parse + biosimMapper off the render thread.

```typescript
// Source: biosimWorker.ts pattern — Worker global scope
import { mapBioSimToHabitatReadings } from '../simulation/biosimMapper';

let ws: WebSocket | null = null;
let existingHistory: Record<string, Record<string, number[]>> = {};

// Main thread sends: { type: 'CONNECT', wsUrl: string }
// Main thread sends: { type: 'DISCONNECT' }
// Worker posts:     { type: 'READINGS', readings: Record<string, Record<string, SensorReading>> }
// Worker posts:     { type: 'WS_OPEN' }
// Worker posts:     { type: 'WS_CLOSE', code: number }
// Worker posts:     { type: 'WS_ERROR' }

self.onmessage = (event: MessageEvent) => {
  const { type, wsUrl } = event.data as WorkerCommand;
  if (type === 'CONNECT') connect(wsUrl);
  if (type === 'DISCONNECT') disconnect();
};

function connect(wsUrl: string) {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => self.postMessage({ type: 'WS_OPEN' });
  ws.onclose = (e) => self.postMessage({ type: 'WS_CLOSE', code: e.code });
  ws.onerror = () => self.postMessage({ type: 'WS_ERROR' });
  ws.onmessage = (e) => {
    const payload = JSON.parse(e.data as string);
    const readings = mapBioSimToHabitatReadings(
      payload.modules,
      payload.globals?.ticksGoneBy ? Date.now() : undefined,
      existingHistory,
    );
    // Update existingHistory for ring buffer continuity
    for (const [zoneId, sensors] of Object.entries(readings)) {
      if (!existingHistory[zoneId]) existingHistory[zoneId] = {};
      for (const [sensorId, reading] of Object.entries(sensors)) {
        existingHistory[zoneId][sensorId] = reading.history;
      }
    }
    self.postMessage({ type: 'READINGS', readings });
  };
}

function disconnect() {
  ws?.close();
  ws = null;
}
```

### Pattern 3: RAF Buffer on Main Thread

**What:** A `useRef` holds the most recent `readings` payload from the Worker. A `requestAnimationFrame` loop reads and clears the ref, calling `store.tick()` only when new data exists. This decouples the Worker's post rate from the render rate.
**When to use:** TELE-03, PERF-05, PERF-07.

```typescript
// Source: established pattern for RAF-batched store updates
const pendingReadings = useRef<Record<string, Record<string, SensorReading>> | null>(null);
const rafHandle = useRef<number | null>(null);

function startRAFLoop() {
  function loop() {
    if (pendingReadings.current !== null) {
      useHabitatStore.getState().tick(pendingReadings.current);
      pendingReadings.current = null;
    }
    rafHandle.current = requestAnimationFrame(loop);
  }
  rafHandle.current = requestAnimationFrame(loop);
}

function stopRAFLoop() {
  if (rafHandle.current !== null) {
    cancelAnimationFrame(rafHandle.current);
    rafHandle.current = null;
  }
}

// Worker message handler — overwrite pending, don't queue
worker.onmessage = (e) => {
  if (e.data.type === 'READINGS') {
    pendingReadings.current = e.data.readings; // last-value-wins on burst
  }
};
```

**Why last-value-wins:** BioSim ticks carry full simulation state — each message is a snapshot, not a delta. Dropping intermediate messages during a burst never loses information, only skips intermediate frames. The ring buffer in biosimMapper appends one point per WS message regardless of RAF drop rate.

### Pattern 4: simSource State in habitatStore

**What:** A new `simSource` field with four string values acts as the single source of truth for which data source is active. Components (HabitatHUD badge) and hooks (useSimSource decides transitions) read this field.
**When to use:** FALL-04 — exactly one source active at any time.

```typescript
// Add to HabitatState in habitat.ts
export type SimSource = 'connecting' | 'biosim' | 'fallback' | 'disconnected';

// Add to HabitatState interface
simSource: SimSource;
setSimSource: (source: SimSource) => void;

// Add selector
export const selectSimSource = (state: HabitatState) => state.simSource;
```

**State transitions:**
```
mount
  -> 'connecting' (probe starts, sim engine starts immediately)
  -> 'biosim'     (probe succeeds, WS opens, sim engine stops)
  -> 'disconnected' (WS drops, shown for 2s)
  -> 'connecting' (retry attempt 1/2/3)
  -> 'fallback'   (retries exhausted, sim engine starts)
  -> 'connecting' (background probe succeeds after 15s poll)
  -> 'biosim'     (WS re-opens)
unmount
  -> all cleanup: WS close, sim engine stop, probe timer cleared
```

### Pattern 5: BioSim REST Probe for simID

**What:** On mount, `useSimSource` fires a `fetch` to `GET /api/simulation/active` (or equivalent) to discover the active simulation ID. This avoids hardcoding the simID.
**When to use:** Initial connection and every background probe cycle.

```typescript
// Source: BioSim REST API — confirmed from Phase 5 research
// GET /api/simulation returns array of simulation objects
// First element's ID (globals.myID or similar) is the simID

async function probeBioSim(baseUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000); // 5s timeout
  try {
    const resp = await fetch(`${baseUrl}/api/simulation`, {
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json() as unknown[];
    if (!Array.isArray(data) || data.length === 0) return null;
    // BioSim returns array of simulation IDs or objects
    const first = data[0];
    return typeof first === 'number' ? String(first) : String((first as Record<string, unknown>).id ?? first);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

**Note:** Phase 5 research confirmed `GET /api/simulation` returns the list of running simulation IDs. The fixture shows `globals.myID = 1`, and the docker-compose start script captures the POST response as `SIM_ID`. The probe should handle both numeric-ID-in-array and object-with-id formats.

### Pattern 6: CSS Keyframe Injection (Connection Badge Pulse)

**What:** Identical to the established AlertBanner pattern. Inject a `<style>` tag once into `document.head` with a unique ID guard.
**When to use:** Badge state-change pulse animation — Tailwind would purge custom animation names.

```typescript
// Source: AlertBanner.tsx — established pattern in this codebase
const BADGE_ANIMATION_ID = 'connection-badge-animations';

function ensureBadgeAnimationsInjected() {
  if (document.getElementById(BADGE_ANIMATION_ID)) return;
  const style = document.createElement('style');
  style.id = BADGE_ANIMATION_ID;
  style.textContent = `
    @keyframes badgePulse {
      0%   { transform: scale(1.0); }
      50%  { transform: scale(1.1); }
      100% { transform: scale(1.0); }
    }
  `;
  document.head.appendChild(style);
}
```

### Anti-Patterns to Avoid

- **Opening WebSocket on main thread:** JSON.parse of BioSim tick payloads (large module objects) on the render thread causes frame drops at 10+ ticks/sec. Worker ownership is required.
- **Storing Worker instance in Zustand state:** Workers are non-serializable. Store the Worker ref in a `useRef` or module-level variable, not in Zustand state.
- **Not canceling the RAF loop on unmount:** A running RAF loop after unmount keeps calling `store.tick()` with stale data and prevents garbage collection. Always `cancelAnimationFrame` in the useEffect cleanup.
- **Multiple useEffect deps on [] with different closures:** The `useEffect` that starts the Worker and RAF loop must have `[]` deps and use `useRef` to communicate — never close over mutable variables.
- **Forgetting to clear the background probe timer on unmount:** `setInterval` for the 15s probe continues firing after navigation away. This creates phantom reconnection attempts. Always `clearInterval` in cleanup.
- **Calling `startSimulation` without stopping the engine first when switching to BioSim:** The `habitatStore.stopSimulation()` must be called before handing off to BioSim. Otherwise two sources write to the store simultaneously.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnection library | Custom retry manager | Implement directly in `useBioSimWS` with `setTimeout` | 3 retries + exponential backoff is trivial; a library adds more API surface than the problem warrants |
| Worker bundling | Custom webpack/rollup config | Vite 6 `new Worker(new URL(...), { type: 'module' })` | Native Vite support handles dev and prod build automatically |
| State machine library | XState, Robot, etc. | Simple `simSource` enum + `setSimSource` in Zustand | 4 states, linear transitions — formal state machine library is overkill |
| BioSim history extraction | Custom history tracking in hook | `biosimMapper.ts` `existingHistory` parameter | Already designed for Phase 7 in Phase 6; the ring buffer continuity is solved |

**Key insight:** Every "complex" part of this phase (WebSocket, Workers, RAF, reconnection) is native browser API with well-understood lifecycle. The existing codebase already contains the two hardest pieces: `biosimMapper.ts` (the data transform) and `habitatStore.tick()` (the store gateway). This phase is plumbing, not invention.

---

## Common Pitfalls

### Pitfall 1: WebSocket Leak on Navigate-Away-and-Back
**What goes wrong:** The DevTools Network panel shows 2, 3, N active WebSocket connections after navigating between routes. Memory and server connections accumulate.
**Why it happens:** `useEffect(() => { const ws = new WebSocket(...); }, [])` without a cleanup function. React Strict Mode also double-fires effects in dev, which is a useful canary.
**How to avoid:** The Worker-owned WS approach means the cleanup path is: `worker.postMessage({ type: 'DISCONNECT' })` then `worker.terminate()` in the `useEffect` return. One `useEffect` with one cleanup — no Worker outlives the component.
**Warning signs:** DevTools > Network > WS tab shows accumulating connections that never close.

### Pitfall 2: simID Goes Stale (BioSim Restart)
**What goes wrong:** BioSim Docker container restarts mid-session. The old simID is no longer valid. WebSocket connection to `ws://.../ws/simulation/1` gets a 404 or immediately closes. Reconnect retries all fail because the simID is wrong.
**Why it happens:** simID is captured at probe time and used directly in the WS URL. If BioSim restarts, it may start a new simulation with a different ID.
**How to avoid (Claude's Discretion area):** Re-probe the REST API on each reconnect attempt (not just on initial mount). The `connect(simId)` call in `useBioSimWS` should be preceded by a fresh `probeBioSim()` call in the reconnect logic. The background 15s probe already does this implicitly — the discovered simID from the probe should always be the freshest.
**Warning signs:** WS `onclose` fires immediately after `onopen` with code 1006 (abnormal closure).

### Pitfall 3: TypeScript Errors in Worker File (DOM vs WebWorker lib conflict)
**What goes wrong:** `self.postMessage` and `WebSocket` are not recognized in the Worker file, or they conflict with DOM types. TypeScript errors block compilation.
**Why it happens:** The current `tsconfig.app.json` has `"lib": ["ES2020", "DOM", "DOM.Iterable"]`. DOM and WebWorker libs define some conflicting types. Adding `"WebWorker"` makes both available.
**How to avoid:** Add `"WebWorker"` to `lib` in `tsconfig.app.json`. This is explicitly supported — the conflict was resolved in TypeScript 4.x by shipping WebWorker types that are compatible with DOM.
**Warning signs:** `error TS2304: Cannot find name 'DedicatedWorkerGlobalScope'` or `postMessage` typed incorrectly.

### Pitfall 4: Worker Cannot Import from `../simulation/biosimMapper`
**What goes wrong:** The Worker file uses `import { mapBioSimToHabitatReadings } from '../simulation/biosimMapper'` but the import fails at runtime in development, or the Worker bundles differently in production.
**Why it happens:** Only `{ type: 'module' }` Workers support ESM imports. The default Worker type is `'classic'` which uses `importScripts()` syntax.
**How to avoid:** Always instantiate with `new Worker(new URL('...', import.meta.url), { type: 'module' })`. Vite 6 handles this correctly for both dev (native ESM) and prod (bundled chunk).
**Warning signs:** `Uncaught SyntaxError: Cannot use import statement in worker` in browser console.

### Pitfall 5: RAF Loop Not Stopped During Fallback Mode
**What goes wrong:** When switching to fallback (sim engine), both the RAF loop and the sim engine's setInterval are writing to `store.tick()` simultaneously. Zone values flicker between BioSim and engine data.
**Why it happens:** The RAF loop was started for BioSim mode and not stopped before enabling the fallback engine.
**How to avoid:** `stopRAFLoop()` before `startSimulation()`. The `useSimSource` state machine enforces this ordering: only one data path is active at a time (FALL-04).
**Warning signs:** Sensor values oscillating rapidly between two different ranges.

### Pitfall 6: Vitest environment: 'node' Blocks Browser API Tests
**What goes wrong:** Tests for `useBioSimWS` or the Worker message protocol fail because `WebSocket`, `Worker`, or `requestAnimationFrame` are not defined in the Node environment.
**Why it happens:** Current `vitest.config.ts` sets `environment: 'node'`. Web APIs are not available in Node.
**How to avoid:** Add `environment: 'jsdom'` for hook tests. Install `@vitest/web-worker` for Worker message protocol tests. The existing `biosimMapper.test.ts` runs in Node (pure function, no browser APIs) — keep it that way. Separate worker/hook tests get a `jsdom` environment override.
**Warning signs:** `ReferenceError: WebSocket is not defined` in test output.

---

## Code Examples

Verified patterns from official sources:

### Vite 6 Module Worker Instantiation
```typescript
// Source: https://vite.dev/guide/features#web-workers
// useBioSimWS.ts or useSimSource.ts
const workerRef = useRef<Worker | null>(null);

useEffect(() => {
  const worker = new Worker(
    new URL('../workers/biosimWorker.ts', import.meta.url),
    { type: 'module' }
  );
  workerRef.current = worker;
  return () => {
    worker.postMessage({ type: 'DISCONNECT' });
    worker.terminate();
    workerRef.current = null;
  };
}, []);
```

### useEffect Cleanup Pattern for WebSocket (Prevention of Navigation Leak)
```typescript
// Source: MDN Web Docs — Writing WebSocket client applications
// Inside useBioSimWS.ts
useEffect(() => {
  let active = true; // guard against post-unmount state updates
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => { if (active) onOpen(); };
  ws.onclose = (e) => { if (active) onClose(e.code); };
  ws.onerror = () => { if (active) onError(); };
  ws.onmessage = (e) => { if (active) onMessage(e.data as string); };

  return () => {
    active = false;
    ws.close();
  };
}, [wsUrl]); // re-runs if wsUrl changes (new simID)
```

Note: In the Worker-owned approach, this pattern lives inside `biosimWorker.ts`'s `connect()` function. The main thread closes the WS indirectly via `worker.postMessage({ type: 'DISCONNECT' })` → `ws.close()` → `worker.terminate()`.

### Zustand simSource Field Addition
```typescript
// Source: Zustand 5 create<T>()() pattern — https://github.com/pmndrs/zustand
// Additions to habitatStore.ts

export type SimSource = 'connecting' | 'biosim' | 'fallback' | 'disconnected';

// In HabitatState interface (habitat.ts):
simSource: SimSource;
setSimSource: (source: SimSource) => void;

// In store create():
simSource: 'connecting' as SimSource,
setSimSource: (source: SimSource) => set({ simSource: source }),

// Selector:
export const selectSimSource = (state: HabitatState) => state.simSource;
```

### Connection Badge Component Skeleton
```typescript
// HabitatHUD.tsx — new section below zone status row
const simSource = useHabitatStore(selectSimSource);

const BADGE_CONFIG: Record<SimSource, { dot: string; label: string; textColor: string }> = {
  connecting:   { dot: '#9ca3af', label: 'Connecting...',  textColor: '#9ca3af' },
  biosim:       { dot: '#00ff88', label: 'BioSim Live',    textColor: '#00ff88' },
  disconnected: { dot: '#ff2200', label: 'Disconnected',   textColor: '#ff2200' },
  fallback:     { dot: '#f59e0b', label: 'Fallback Mode',  textColor: '#f59e0b' },
};

// Rendered below zone row, above nothing
const badge = BADGE_CONFIG[simSource];
```

### @vitest/web-worker Usage for Worker Tests
```typescript
// Source: https://vitest.dev/guide/features (worker support section)
// vitest.config.ts — add webWorker support
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',       // default for mapper tests
    // Per-file environment overrides via test file comments or separate config
  },
});

// In hook test files — add at top of file to use jsdom:
// @vitest-environment jsdom
```

---

## BioSim WebSocket Message Shape (Confirmed)

The WebSocket message at `ws://localhost:8009/ws/simulation/{simID}` broadcasts the same JSON structure as `GET /api/simulation/{simID}`. Confirmed from Phase 5 fixture and Phase 6 mapper tests:

```typescript
// Confirmed from tests/fixtures/biosim_module_state.json
interface BioSimTickMessage {
  globals: {
    myID: number;
    simulationIsPaused: boolean;
    simulationStarted: boolean;
    simulationEnded: boolean;
    ticksGoneBy: number;
    runTillN: number;
    tickLength: number;
    // ...
  };
  modules: Record<string, BioSimModule>; // same shape as fixture
}
```

The `modules` property is passed directly to `mapBioSimToHabitatReadings(payload.modules)` — no transformation needed before the mapper call.

**simID discovery:** `POST /api/simulation/start` returns the simID as a plain string/number. `GET /api/simulation` returns the list of active IDs. The probe should use `GET /api/simulation` and take `data[0]` as the active simID. If the array is empty, BioSim has no running simulation — probe returns null.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `?worker` Vite import suffix | `new Worker(new URL(...), { type: 'module' })` | Vite 2+ (standards-aligned) | Module Worker enables ESM imports inside the Worker file |
| Separate `tsconfig.worker.json` | Add `"WebWorker"` to main `tsconfig.app.json` lib | TypeScript 4.x resolved conflict | Single tsconfig, no build complications |
| Polling WebSocket state with `ws.readyState` | Event-driven `onopen`/`onclose`/`onerror` handlers | Always correct | Event handlers are the canonical pattern; readyState polling is fragile |
| `SharedWorker` for cross-tab WS sharing | `Worker` per page load | N/A for this use case | Only one `/habitat` tab is expected; SharedWorker adds complexity with no benefit |

**Deprecated/outdated:**
- `importScripts()` in Workers — replaced by ESM imports when `{ type: 'module' }` is used
- `?worker&inline` Vite suffix — creates base64 blob Workers; fine for tiny workers but adds code size for a Worker that imports biosimMapper

---

## Open Questions

1. **BioSim `GET /api/simulation` response format for simID extraction**
   - What we know: Docker-compose captures `SIM_ID=$(curl ... POST /api/simulation/start)`. Phase 5 fixture shows `globals.myID = 1`. GET /api/simulation returns array.
   - What's unclear: Whether GET /api/simulation returns `[1]` (array of numeric IDs) or `[{ id: 1, ... }]` (array of objects). The docker-compose one-liner suggests it's a plain number/string.
   - Recommendation: Write the probe to handle both: `const first = data[0]; return typeof first === 'number' ? String(first) : String(first.id ?? first)`. Verify against live BioSim in Wave 0 smoke test.

2. **stale simID after BioSim restart mid-session**
   - What we know: BioSim Docker restart creates a new simulation with a potentially different ID.
   - What's unclear: Whether the ID resets to 1 (likely, since it's a fresh JVM process) or increments.
   - Recommendation (Claude's Discretion): Re-probe `GET /api/simulation` on every reconnect attempt in `useBioSimWS`. The freshest simID from the probe replaces any cached value. Cost: one extra HTTP call per reconnect, which is negligible.

3. **Vitest environment for hook tests**
   - What we know: Current environment is `'node'`; hook tests need browser APIs.
   - What's unclear: Whether per-file `@vitest-environment jsdom` comments work cleanly with Vitest 4.x or require config changes.
   - Recommendation: Use inline docblock `/** @vitest-environment jsdom */` at the top of hook test files. This is Vitest's documented per-file override mechanism and avoids a global environment change that would break the existing node-environment mapper tests.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + @vitest/web-worker |
| Config file | `spatialhub-frontend/vitest.config.ts` |
| Quick run command | `cd spatialhub-frontend && npm test` |
| Full suite command | `cd spatialhub-frontend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TELE-01 | `useBioSimWS` posts WS_OPEN message on connect | unit | `npm test -- useBioSimWS` | ❌ Wave 0 |
| TELE-03 | RAF loop calls tick() at most once per animation frame | unit | `npm test -- useSimSource` | ❌ Wave 0 |
| TELE-04 | store.tick() receives correctly shaped readings from Worker | unit | `npm test -- biosimWorker` | ❌ Wave 0 |
| FALL-01 | Probe returns null when BioSim unreachable within 5s | unit | `npm test -- useSimSource` | ❌ Wave 0 |
| FALL-02 | simSource transitions to 'fallback' after 3 retries | unit | `npm test -- useSimSource` | ❌ Wave 0 |
| FALL-03 | ConnectionBadge renders correct text for each simSource value | unit | `npm test -- ConnectionBadge` | ❌ Wave 0 |
| FALL-04 | Switching to BioSim stops sim engine before starting WS | unit | `npm test -- useSimSource` | ❌ Wave 0 |
| PERF-01 | Worker postMessage called for each WS message; main thread tick() count matches RAF frames | unit | `npm test -- biosimWorker` | ❌ Wave 0 |
| PERF-02 | selectSimSource selector returns stable reference | unit | `npm test -- habitatStore` | ❌ Wave 0 |
| PERF-05 | Manual: 60fps during BioSim mode (Chrome DevTools Performance panel) | manual | N/A | n/a |
| PERF-06 | Manual: sub-100ms WS-to-visual latency (DevTools Timeline) | manual | N/A | n/a |
| PERF-07 | Worker handles burst of 20 messages without OOM (heap snapshot stable) | manual | N/A | n/a |

### Sampling Rate
- **Per task commit:** `cd spatialhub-frontend && npm test`
- **Per wave merge:** `cd spatialhub-frontend && npm test` (all tests green)
- **Phase gate:** Full test suite green + manual DevTools verification of WS connection count before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/useSimSource.test.ts` — covers FALL-01, FALL-02, FALL-04, TELE-03 (environment: jsdom)
- [ ] `src/__tests__/useBioSimWS.test.ts` — covers TELE-01 (environment: jsdom)
- [ ] `src/__tests__/biosimWorker.test.ts` — covers TELE-04, PERF-01 (requires @vitest/web-worker)
- [ ] `src/__tests__/ConnectionBadge.test.ts` — covers FALL-03 (environment: jsdom)
- [ ] `src/__tests__/habitatStore.simSource.test.ts` — covers PERF-02 (node environment is fine)
- [ ] Install: `cd spatialhub-frontend && npm install --save-dev @vitest/web-worker`

---

## Sources

### Primary (HIGH confidence)
- Vite 6 Features docs — https://vite.dev/guide/features#web-workers — Worker instantiation patterns, module Worker support
- Project codebase: `habitatStore.ts`, `engine.ts`, `biosimMapper.ts`, `AlertBanner.tsx`, `HabitatHUD.tsx`, `HabitatView.tsx` — read directly; all integration points verified from source
- `tests/fixtures/biosim_module_state.json` — BioSim WS message shape (`{ globals, modules }`)
- Phase 5 research (05-RESEARCH.md) — BioSim REST API endpoints: `GET /api/simulation`, `ws://localhost:8009/ws/simulation/{simID}`

### Secondary (MEDIUM confidence)
- Web Workers MDN — https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers — postMessage patterns, lifecycle
- Vitest docs — https://vitest.dev/guide/features — web worker test support, per-file environment overrides
- TypeScript WebWorker lib discussion — GitHub microsoft/TypeScript#20595 — confirmed `"WebWorker"` in lib array is the current approach

### Tertiary (LOW confidence)
- WebSearch: BioSim WS message format — corroborated by fixture inspection (HIGH) but WS-specific message format not in official docs
- WebSearch: `@vitest/web-worker` npm package behavior — verify against installed version in Wave 0

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed except @vitest/web-worker; Vite 6 Worker support verified via official docs
- Architecture: HIGH — all integration points read directly from source code; biosimMapper, store.tick(), engine.ts, AlertBanner pattern all confirmed
- BioSim WS message shape: HIGH — fixture `{ globals, modules }` verified; same shape the mapper already handles
- simID probe format: MEDIUM — pattern inferred from docker-compose + fixture; exact GET /api/simulation response format needs live verification
- Pitfalls: HIGH — navigation leak, RAF stop-on-fallback, stale simID, Worker ESM type errors all verified from source and official patterns

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (Vite, Vitest, Zustand are stable; BioSim API is internal and unlikely to change)
