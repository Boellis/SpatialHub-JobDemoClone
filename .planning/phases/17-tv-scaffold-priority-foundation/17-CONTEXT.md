# Phase 17: TV Scaffold + Priority Foundation - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A non-interactive `/habitat` route (replacing the old 3D HabitatView) with correct R3F setup and a working criticality ranking algorithm that drives zone order without thrashing. This phase delivers the scaffold and algorithm — zone cards, charts, and animation are Phase 18+.

</domain>

<decisions>
## Implementation Decisions

### Route strategy
- TV dashboard **replaces** `/habitat` — `TvDashboardView` takes over the existing route
- Old `HabitatView` becomes dead code in the repo (no legacy route, no `/habitat-3d`)
- Anomaly triggering is **dropped entirely** — no AnomalyDrawer on TV route; anomalies only happen via BioSim REST API or the automated `control_loop` management command
- No nav bar on TV route — full-viewport, zero chrome; reuse existing `isHabitat` conditional in `App.tsx` (already hides nav when `pathname === '/habitat'`)
- Lazy-loaded via `React.lazy()` — same isolated bundle pattern as old HabitatView

### Priority ranking
- Scoring formula: `(red_count * 10) + (yellow_count * 3)` per zone (from LAYOUT-03)
- 3 consecutive stable ticks required before committing a reorder (from success criteria)
- `usePriorityRanking` hook — pure derivation from `habitatStore.zones`, lives in `hooks/`, not in the store

### Non-interactivity
- Zero click/hover/touch handlers in the entire component tree
- R3F Canvas must use `events={null}` — no raycaster activity
- No OrbitControls, no CameraController — these register listeners even when disabled

### Claude's Discretion
- Canvas scaffold approach — whether to include an empty R3F Canvas now (background layer for Phase 20 parallax) or defer to DOM-only scaffold
- Priority tie-breaking logic when zones have equal criticality scores
- Scaffold visual appearance — what renders on screen in Phase 17 (minimal layout placeholder vs dark void with ranked zone IDs)
- Data hook mounting strategy — how `useSimSource` and `useLiveSensors` are wired on the TV route
- Loading spinner design for the lazy-loaded chunk

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — LAYOUT-01 (non-interactive full-viewport), LAYOUT-03 (criticality scoring algorithm)

### Research
- `.planning/research/SUMMARY.md` — Full v4.0 architecture plan, pitfalls, stack decisions
- `.planning/research/ARCHITECTURE.md` — Canvas layering pattern, component tree design
- `.planning/research/PITFALLS.md` — R3F raycaster (Pitfall 1), Zustand cascade re-renders (Pitfall 2), GPU memory (Pitfall 3), priority thrashing (Pitfall 4)

### Existing code (key integration points)
- `spatialhub-frontend/src/App.tsx` — Route definitions, nav bar hide logic (`isHabitat`), lazy loading pattern
- `spatialhub-frontend/src/store/habitatStore.ts` — Zustand store with `zones`, `tick()`, `deriveZoneStatus()`, per-zone selectors
- `spatialhub-frontend/src/hooks/useSimSource.ts` — Data source detection (BioSim WS / client sim / Pi)
- `spatialhub-frontend/src/hooks/useLiveSensors.ts` — Pi sensor polling hook
- `spatialhub-frontend/src/simulation/constants.ts` — `ZONE_CONFIGS` with zone IDs, sensor configs, thresholds
- `spatialhub-frontend/src/pages/HabitatView.tsx` — Old page being replaced (reference for hook mounting pattern)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `habitatStore.ts`: Full Zustand store with zone state, sensor readings, sim source — TV dashboard reads from this directly
- `useSimSource.ts`: Auto-detects BioSim WebSocket availability, falls back to client sim — mount on TV route for data flow
- `useLiveSensors.ts`: Polls Django API for Pi sensor data, overlays as `source: 'live'` — mount for real sensor support
- `deriveZoneStatus()`: Worst-of-sensors status derivation already in store — reuse for ranking input
- `selectZone(zoneId)`: Per-zone Zustand selector — use in future zone cards to avoid cascade re-renders
- `Sparkline.tsx`: Existing sparkline component — reusable in Phase 18 zone cards

### Established Patterns
- Canvas + DOM overlay: HabitatView uses R3F Canvas as background with DOM elements on top via `pointer-events: none` container
- Lazy loading: `React.lazy(() => import('./pages/HabitatView'))` with Suspense fallback — replicate for TvDashboardView
- Nav hide: `isHabitat` check in `AppContent` already hides nav for `/habitat` — zero changes needed
- Module-level engine: Simulation engine stored at module scope (not in Zustand) to avoid serialization

### Integration Points
- `App.tsx` line 16: Swap `HabitatView` import to `TvDashboardView` — single line change
- `habitatStore.startSimulation()`: Called by existing data hooks — TV route just mounts the hooks
- `ZONE_CONFIGS`: 4 zones (grow-bays, water-recycling, atmosphere-control, power-systems) — ranking algorithm iterates these

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-tv-scaffold-priority-foundation*
*Context gathered: 2026-03-21*
