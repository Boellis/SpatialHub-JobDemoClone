# Phase 20: Parallax Polish - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A Three.js parallax background layer adds ambient depth behind the priority grid. Purely cosmetic — floating particles in the existing R3F Canvas. No new data features, no new UI components, no interactivity.

</domain>

<decisions>
## Implementation Decisions

### Geometry style
- Floating particles: 50-100 small spheres (radius 0.02-0.08)
- Varying z-depth (-2 to -8) for layered depth
- Subtle glow via emissive material
- Lightest GPU option — pure atmospheric presence

### Color & opacity
- Barely-there visibility: opacity 0.08-0.15, emissive intensity 0.3-0.5
- Additive blending (glow on dark background)
- You notice them if you look, but they never distract from data
- Muted Mars amber base: `#ff6b35` (Mars dust orange)
- Per-particle hue variation: ±30% shift for natural variety
- At 0.1 opacity: barely visible warm glow that won't conflict with status colors (green/yellow/red)

### Motion character
- Slow glacial drift: each particle on independent sine wave
- Different frequency (0.03-0.1, 10-30s cycle), phase, and amplitude (0.1-0.5 units) per particle
- x and y drift via sine; z stays fixed (depth layer)
- No particle ever leaves the viewport
- No sudden direction changes
- Continuous, sine-wave driven, no mouse/touch input (per success criteria)

### Claude's Discretion
- Exact particle count within 50-100 range (tune for performance)
- Whether to use InstancedMesh for GPU efficiency or individual meshes
- Sphere geometry segment count (low-poly vs smooth at small sizes)
- Whether particles need a useFrame vs clock-based animation approach
- Fog or depth-of-field effects on distant particles
- Whether to add a subtle size variation per particle

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — VIS-01 (Three.js parallax background with auto-drifting geometry, separate Canvas, no interaction)

### Phase 17 context (Canvas setup)
- `.planning/phases/17-tv-scaffold-priority-foundation/17-CONTEXT.md` — R3F Canvas setup, events={null}, alpha: true

### Phase 19 context (GPU memory baseline)
- `.planning/phases/19-flip-animation-long-session-resilience/19-CONTEXT.md` — Long-session resilience, GPU memory must stay flat

### Research
- `.planning/research/SUMMARY.md` — v4.0 architecture plan
- `.planning/research/ARCHITECTURE.md` — Canvas layering pattern
- `.planning/research/PITFALLS.md` — Pitfall 3 (GPU memory growth)

### Existing code (key integration points)
- `spatialhub-frontend/src/pages/TvDashboardView.tsx` — R3F Canvas at zIndex: 0 with comment "ParallaxBackground lands in Phase 20"
- `spatialhub-frontend/src/components/habitat/MarsEnvironment.tsx` — Existing Three.js environment (reference for lighting/material patterns)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- R3F Canvas already in TvDashboardView: `events={null}`, `alpha: true`, `antialias: false`, camera at `[0, 0, 5]` fov 60 — parallax component drops in as a child
- `MarsEnvironment.tsx` in habitat components — reference for Three.js material and lighting patterns in this codebase
- drei library (`@react-three/drei@10.7`) already installed — utilities like `Float` or `Instances` available if needed

### Established Patterns
- R3F components live in `src/components/` (habitat/ has 3D components, tv/ has TV dashboard components)
- Inline styles for TV components
- `useFrame` hook for per-frame animation in R3F (used in existing HabitatDome, SensorOrb)
- Module-level constants for configuration (ZONE_CONFIGS, STATUS_COLORS pattern)

### Integration Points
- `TvDashboardView.tsx` Canvas children — single insertion point for `<ParallaxBackground />`
- GPU memory: Phase 19 verified `geometries: 0` — Phase 20 adds geometry, must monitor that it stays flat (no growth over time)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- Hero card animated chart using the empty center space — captured during Phase 19 checkpoint, belongs in a future phase after v4.0

</deferred>

---

*Phase: 20-parallax-polish*
*Context gathered: 2026-03-22*
