# Phase 3: UI Panels and Live Data - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Live sensor data panels, sparkline trend charts, alert banners, and a HUD system overview — all layered as HTML overlays on top of the existing 3D habitat scene. Users click a dome to open a detail panel with live readings, see alerts when sensors cross thresholds, and always have a system overview visible. No anomaly triggers or scenario controls — those are Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Zone Detail Panel
- Right sidebar layout, ~350px wide, slides in from right edge
- Slide + fade animation (~300ms ease-out), synced with camera transition timing
- Each sensor row shows: status dot (green/yellow/red) + sensor name + current value with unit + mini sparkline
- Panel header: zone name as title, zone description as subtitle, thin accent-colored bar at top/left matching dome glow color (green/blue/purple/orange)
- Small X close button in top-right corner of panel
- Closing panel deselects zone (camera zooms back to overview)
- Also deselectable via clicking empty 3D background or pressing Escape (existing behavior)

### Panel Navigation
- Clicking another dome while panel is open: panel content cross-fades to new zone's data, camera transitions simultaneously — no close/reopen flicker
- `selectedZoneId` needs to be shared between R3F tree (HabitatStructure) and HTML overlay layer (panel) — lift to Zustand store or HabitatView level

### Alert/Warning Banners
- Top-center toast stack, slides down from top
- Yellow (caution) alerts: amber border, warning icon, subtle styling — auto-dismiss after ~5 seconds
- Red (critical) alerts: red border, pulsing glow effect, more urgent styling — persist until sensor recovers to green/yellow
- Alert content: zone name + sensor name + value (e.g., "Grow Bays - CO2 HIGH - 1245 ppm")
- Accent-colored left border matching zone dome color
- Alerts stack vertically if multiple fire simultaneously

### HUD System Overview
- Top-left corner, glassmorphism card (frosted glass backdrop-blur + dark semi-transparent background)
- Always visible, consistent glass style with zone panel
- Content: Sol count (ticking number derived from solElapsed, every 600s = 1 sol), overall habitat status (worst zone status), active sensor count (12), compact 4-zone status row with colored dots + zone abbreviation
- Small "← Dashboard" back button near HUD for navigating back to main app

### Sparkline Charts
- Minimal inline SVG path — just the line, no axes, no labels, no threshold bands
- ~80px wide, ~24px tall per sparkline
- Line color matches current sensor status dynamically (green/yellow/red) — whole line recolors
- Uses full history[] array: 30 data points = 60 seconds of data
- No library needed (not recharts) — history[] is just 30 numbers, raw SVG polyline

### Value Display
- Smooth number transition (~200ms) when values update on each 2s tick — feels like a real instrument readout
- Sensor-appropriate decimal precision: temperature 1 decimal (22.1°C), pH 1 decimal (6.8), CO2 integer (812 ppm), power integer (100 kW), percentages 1 decimal (55.3%)

### Empty State / No Selection
- When no zone is selected: HUD visible (top-left), 3D scene fills page, subtle faded hint text near bottom: "Click a dome to inspect" — disappears after first interaction

### Page Composition
- All HTML overlays use pointer-events: none on container, pointer-events: auto on interactive elements (HUD, panel, alerts) — allows clicking/orbiting 3D scene through empty overlay space
- Main app nav hidden on /habitat (full-screen immersion) — back button in HUD provides escape hatch

### Claude's Discretion
- Exact glassmorphism CSS values (blur radius, background opacity, border styling)
- Alert deduplication logic (don't spam same sensor alert every 2s tick)
- Sparkline SVG path smoothing (linear vs bezier between points)
- Exact panel slide/fade animation implementation (CSS transitions vs framer-motion)
- How to share selectedZoneId between R3F tree and HTML overlay (Zustand vs lifting to HabitatView)
- Z-index layering strategy for overlays
- Responsive fallback behavior (not required — desktop-first per PROJECT.md)

</decisions>

<specifics>
## Specific Ideas

- The smooth number transitions should feel like a real mission control instrument readout — not jumpy, not laggy
- Alert banners should feel urgent without being annoying — yellow is informational, red demands attention
- The HUD's sol count ticking up gives that NASA long-duration mission atmosphere
- Zone accent colors (green/blue/purple/orange from HabitatStructure) must carry through to panel headers and alert borders — visual thread from 3D to 2D
- "Click a dome to inspect" hint should be subtle enough that it doesn't cheapen the immersive feel

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `store/habitatStore.ts`: Zustand store with `zones`, `solElapsed`, `tickCount`, selectors (`selectZone`, `selectSensorReading`, `selectAllZoneStatuses`) — panels and HUD subscribe directly
- `simulation/engine.ts`: Already populates `history: number[]` (MAX_HISTORY=30) on every tick — sparklines consume this directly
- `simulation/constants.ts`: `ZONE_CONFIGS` with names, descriptions, sensor configs, thresholds, positions — panel content source of truth
- `components/habitat/HabitatStructure.tsx`: `ZONE_ACCENT_COLORS` map (grow-bays=#00ff88, atmosphere=#00aaff, water=#8844ff, power=#ff6600) — panels match these
- `types/habitat.ts`: `SensorReading.history` field already typed for sparklines; `HabitatState` interface has all store fields

### Established Patterns
- Tailwind CSS for HTML overlay styling
- Named exports for components
- R3F components in `src/components/habitat/`
- `selectedZoneId` state currently in HabitatStructure (useState) — needs lifting for HTML panel access
- HabitatView is `position: fixed; inset: 0` with Canvas filling it — overlays go as sibling divs

### Integration Points
- `HabitatView.tsx`: Add HTML overlay layer as sibling div next to Canvas — pointer-events: none container
- `HabitatStructure.tsx`: `selectedZoneId` + `setSelectedZoneId` need sharing mechanism with overlay components
- `habitatStore.ts`: May need `selectedZoneId` added to store, or use a separate UI state slice
- New files: `src/components/habitat/ZonePanel.tsx`, `src/components/habitat/HabitatHUD.tsx`, `src/components/habitat/AlertBanner.tsx`, `src/components/habitat/Sparkline.tsx`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-ui-panels-and-live-data*
*Context gathered: 2026-03-13*
