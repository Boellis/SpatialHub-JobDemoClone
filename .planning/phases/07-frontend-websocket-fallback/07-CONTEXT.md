# Phase 7: Frontend WebSocket + Fallback - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

The 3D habitat is driven by real BioSim physics when Docker is running, automatically falls back to the v1.0 client-side simulation when BioSim is unavailable, and the HabitatHUD shows which data source is active — all without any changes to 3D scene components.

</domain>

<decisions>
## Implementation Decisions

### Connection Badge UX
- Badge sits in the bottom area of the HabitatHUD panel (below the zone status row), as a small pill badge
- Four states with distinct visual treatments:
  - **Connected:** Green dot + "BioSim Live" (green text)
  - **Connecting:** Grey dot + "Connecting..." (grey text)
  - **Disconnected:** Red dot + "Disconnected" (red text) — shown for ~2 seconds on WS drop before switching to Fallback
  - **Fallback:** Amber dot + "Fallback Mode" (amber text)
- Subtle pulse animation on state change: badge scales 1.0 → 1.1 → 1.0 two-three times, color cross-fades over ~300ms, then settles to static
- When BioSim reconnects after being down: badge shows "Reconnecting..." (grey) during the attempt, then "BioSim Live" (green) on success

### Source Switching Behavior
- **Initial load strategy:** Start client-side simulation immediately on mount (zero blank-screen time). Probe BioSim REST API in background simultaneously. If BioSim responds, seamlessly switch from sim to WebSocket data
- **Sparkline history:** Preserved across source switches — existing 30-point ring buffer continues, new data source appends to it. biosimMapper's `existingHistory` parameter enables this
- **Sol counter:** Continues counting regardless of source. Sol is just elapsed time ÷ 600, not tied to simulation physics. No reset on switch
- **Auto-switch on availability:** When BioSim becomes available mid-session (was down, Docker started), the system auto-detects via background probe and switches from sim to BioSim automatically. Badge transition makes the switch visible

### WebSocket URL Configuration
- Single Vite env var: `VITE_BIOSIM_URL` defaults to `http://localhost:8009` if not set
- REST URL: Use env var as-is for HTTP probe (e.g., `http://localhost:8009/api/simulation/active`)
- WebSocket URL: Derive from REST URL by replacing `http` with `ws` (e.g., `ws://localhost:8009/ws/simulation/{simID}`)
- Simulation ID discovered via HTTP probe to BioSim REST API — not hardcoded

### Reconnection Strategy
- **Fast retries on disconnect:** 3 attempts at 1s, 2s, 4s intervals (exponential backoff). Badge shows "Reconnecting..." during retries
- **Fallback after retries exhausted:** Start client-side simulation. Badge shows "Disconnected" (red) for 2 seconds, then "Fallback Mode" (amber)
- **Background probe:** Every 15 seconds, probe BioSim REST API. If BioSim comes back online, auto-reconnect WebSocket. No maximum retry limit — keeps trying indefinitely
- **Navigation lifecycle:** Disconnect WebSocket on `/habitat` unmount (close WS, stop sim engine, clear probe timer). Reconnect fresh on remount. Navigate away and back 5 times = exactly 1 active WebSocket connection

### Web Worker Architecture
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

</decisions>

<specifics>
## Specific Ideas

- The "mic drop moment": User starts demo without Docker, shows 3D habitat on client-side sim, then runs `docker compose up` — within 15 seconds the badge flips to "BioSim Live" and the habitat is now running on real NASA physics
- Navigate away/back 5 times test: Success criteria #4 requires exactly 1 WebSocket connection in DevTools — clean useEffect cleanup is critical
- biosimMapper's `existingHistory` parameter was specifically designed for Phase 7 source switching (Phase 6 decision)
- Badge pulse animation should use CSS keyframes via DOM injection (same pattern as existing alert animations — Tailwind purges custom animation names)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `biosimMapper.ts`: Pure function `mapBioSimToHabitatReadings(modules, timestamp?, existingHistory?)` — Phase 7 WebSocket handler calls this in the Worker
- `habitatStore.ts`: `tick(readings)` method accepts `Record<string, Record<string, SensorReading>>` — the single gateway for all data sources
- `engine.ts`: `createSimulationEngine()` returns `{ start(), stop() }` — used by fallback mode
- `constants.ts`: `BIOSIM_SENSOR_THRESHOLDS` — used by biosimMapper for status derivation
- `HabitatHUD.tsx`: Existing glassmorphism panel with sol count, status, zone badges — add connection badge below zone row

### Established Patterns
- Lazy import for simulation engine (`import('../simulation/engine')`) — breaks circular dependency, code-splits the engine chunk
- Zustand selectors (`selectZone`, `selectSensorReading`) — granular subscriptions prevent re-render cascading
- CSS keyframes injected via DOM (`document.head.appendChild(style)`) — Tailwind-safe animation pattern
- Alert cooldown via Map ref — prevents re-render cascade on high-frequency ticks

### Integration Points
- `HabitatView.tsx`: Currently calls `startSimulation()` on mount — this becomes `useSimSource()` hook which manages both sim and WS
- `habitatStore.ts`: May need new state field for `simSource: 'biosim' | 'engine' | 'connecting' | 'disconnected'` (read by HUD badge and Phase 8 anomaly routing)
- `HabitatHUD.tsx`: Add connection badge component reading `simSource` from store
- New files: `hooks/useSimSource.ts`, `hooks/useBioSimWS.ts`, `workers/biosimWorker.ts`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-frontend-websocket-fallback*
*Context gathered: 2026-03-15*
