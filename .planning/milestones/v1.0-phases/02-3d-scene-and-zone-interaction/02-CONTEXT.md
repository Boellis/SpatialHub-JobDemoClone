# Phase 2: 3D Scene and Zone Interaction - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

R3F Canvas on `/habitat` route with procedural Mars habitat geometry, environment, post-processing (selective bloom), and interactive clickable zones with smooth camera transitions. Users can orbit, zoom, hover-highlight, and click into four visually distinct zone domes. Sensor node markers are visible inside domes with live status colors. No UI panels or drill-down data views — those are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Habitat Geometry
- Interconnected domes layout — 4 geodesic/smooth domes arranged in a 2x2 grid, connected by tube corridors
- All domes same size — zone identity comes from materials and glow color, not scale
- Connecting corridors are transparent tubes with subtle inner glow (plays well with bloom)
- Mars surface ground plane beneath the habitat — flat rusty-red/brown with subtle fog at edges, dark sky above

### Zone Differentiation
- Each dome has a unique emissive accent color — base dome material is the same dark metallic across all zones
- Accent color shows on rim lighting, interior glow, and connecting tube segments
- Zone status from simulation affects dome visuals in real-time: green = calm steady glow in accent color, yellow = brighter with warmer tint, red = pulsing glow shifting toward red
- Floating HTML overlay labels (drei Html) anchored above each dome showing zone name + status badge

### Camera & Interaction
- Clicking a dome triggers a smooth camera transition (~0.8-1.2s, ease-out) to close orbit around that dome — dome fills ~60% of viewport
- User can still orbit/zoom from the focused position; clicking another dome transitions to it
- Deselect by clicking empty background or pressing Escape — smoothly zooms back to full habitat overview
- Hover highlight: emissive glow intensifies + subtle edge/outline effect (drei Outlines or similar)

### Sensor Node Markers
- Floating glowing orbs inside each dome — 3 per dome (12 total), one per sensor
- Orbs hover at different heights inside domes for visual separation
- Always visible from both overview and zoomed-in views (small glowing dots from afar, prominent up close)
- Orb color reflects live sensor status from Zustand store — updates every 2s tick (green/yellow/red)
- Hovering an orb shows an HTML tooltip (drei Html) with sensor name, current value, and unit

### Claude's Discretion
- Specific accent colors for each zone (4 distinct colors that work against dark materials + bloom)
- Dome geometry details (geodesic segments vs smooth sphere, exact dimensions, dome-to-corridor proportions)
- Exact sensor orb positions within each dome (different heights/offsets for visual separation)
- Ground plane material details (roughness, fog intensity, edge fade)
- Lighting setup (ambient + directional intensities, shadow configuration)
- Orbit controls configuration (min/max zoom, rotation limits, damping)
- Bloom post-processing parameters (intensity, threshold, radius)
- Camera overview starting position and angle

</decisions>

<specifics>
## Specific Ideas

- The scene should read as "cinematic" rather than "dev prototype" — selective bloom on emissive elements is key to this
- Domes should feel like they're ON Mars (ground plane + fog grounds the scene), not floating in a void
- Status-reactive dome glow connects the 3D visuals to the running simulation — the scene should feel alive even without any UI panels
- Sensor orbs function like holographic data points — minimal, clean, glowing

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `store/habitatStore.ts`: Zustand store with zone states, sensor readings, and selectors (`selectZone`, `selectSensorReading`, `selectAllZoneStatuses`) — 3D components subscribe directly
- `simulation/constants.ts`: `ZONE_CONFIGS` with positions (`{x, y, z}`), sensor configs, and thresholds — source of truth for dome placement and sensor orb data
- `simulation/engine.ts`: Running simulation engine producing 2s ticks — orbs and dome glow consume this data live
- `@tanstack/react-query` (installed): Use for fetching zone config from Django on habitat page mount

### Established Patterns
- Named exports for page components (`export const PageName = () => {}`)
- Tailwind CSS for any HTML overlay styling
- TypeScript strict mode — all new 3D components need proper typing
- React 19 — verify R3F v9 compatibility before installing

### Integration Points
- `App.tsx`: Add `/habitat` route with `React.lazy()` code-split (R3F + drei + postprocessing are heavy — ~300-350KB gzipped)
- `simulation/constants.ts`: Zone positions already defined — dome placement should derive from these coordinates
- `store/habitatStore.ts`: 3D components read zone/sensor state via existing selectors
- New files: `src/pages/HabitatView.tsx` (page), `src/components/habitat/` (3D component directory)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-3d-scene-and-zone-interaction*
*Context gathered: 2026-03-10*
