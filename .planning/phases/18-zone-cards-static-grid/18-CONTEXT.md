# Phase 18: Zone Cards + Static Grid - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The TV dashboard displays all four zones in a priority-ordered grid with live sensor readings, sparkline charts, HUD metadata, and status indicators — glanceable from across the room on a wall-mounted TV. No animation (Phase 19), no parallax (Phase 20).

</domain>

<decisions>
## Implementation Decisions

### Zone card anatomy
- All sensors shown per card — every sensor gets a row: name, current value, status dot, mini sparkline
- Hero card uses larger sparklines and typography; secondary cards use same layout at smaller scale
- Hero card visual differentiation is **size only** — same card structure, border, background; the 2-col span and larger text IS the hierarchy
- Zone status indicator: top-right badge with status dot + label (NOMINAL / CAUTION / CRITICAL)

### Sparklines
- Reuse existing `Sparkline.tsx` with configurable width/height (already supported)
- Hero sparklines: ~200x40px, secondary: ~120x30px
- History depth: 60 data points (up from current 30)
- Same SVG polyline approach, just bigger viewBox + more points

### Grid topology
- 2-row layout: hero spans full width on top row, three secondary cards in a row below
- Hero row gets 55% of available height, secondary row 45%
- Generous spacing: 24px gap between cards, 32px padding from viewport edges
- CSS Grid implementation

### Status bar (HUD)
- Full-width minimal strip at the very top, above the hero card
- 48px height, transparent background (inherits `#06070b`), no borders/separators
- Layout: status message (left), sol counter (center), connection badge (right)
- Text: 16px monospace, muted gray (`#9ca3af`); sol counter white and slightly larger
- Status dot colored by worst-zone status

### Status bar alert messaging
- All green: `ALL SYSTEMS NOMINAL` (green dot, gray text)
- Non-nominal: show worst-status zone by name — e.g., `WATER RECYCLING: CRITICAL` (red dot, red text)
- Multiple non-nominal zones: show the worst one

### Critical zone pulse (STAT-02)
- Red-status cards get a glowing border pulse: box-shadow animation, 2s cycle, `#ff2200`
- Resting: `1px solid rgba(255,34,0, 0.3)` — Peak: `1px solid #ff2200` + `box-shadow: 0 0 20px rgba(255,34,0, 0.4)`
- Card background stays dark; only border + glow breathes
- CSS keyframe injection pattern (same as AlertBanner/ConnectionBadge)

### Zone border states (non-pulse)
- Green zones: `1px solid rgba(255,255,255, 0.06)` (nearly invisible)
- Yellow zones: `1px solid rgba(255,170,0, 0.4)` (static amber, no animation)
- Red zones: pulsing glow animation (described above)

### Status bar reaction to critical
- Status bar text and dot change color (red text for critical, amber for caution) — no animation on the bar itself
- Cards carry the visual drama; bar is the text readout

### Component strategy
- Build fresh `StatusBar.tsx` in `src/components/tv/` — not adapted from HabitatHUD
- Reuse color/label config maps from existing `ConnectionBadge` (BADGE_CONFIG) and `HabitatHUD` (STATUS_COLORS, STATUS_LABELS)
- Reuse `solElapsed` calculation pattern from HabitatHUD
- New `ZoneCard.tsx` in `src/components/tv/`
- New `PriorityGrid.tsx` in `src/components/tv/` for grid layout

### Claude's Discretion
- Exact card border radius and inner padding
- Zone name display format (full name vs abbreviated)
- Sparkline line color strategy (per-sensor status color vs fixed palette)
- Sensor row internal layout details (spacing, alignment)
- Whether to extract shared color/label constants to a `tv/constants.ts`
- Loading/empty state while waiting for first telemetry tick

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — LAYOUT-02 (priority grid), DATA-01 (TV-safe typography), DATA-02 (sparkline charts), DATA-03 (sol counter), DATA-04 (connection badge), STAT-01 (status summary bar), STAT-02 (red zone pulse)

### Phase 17 context (upstream dependency)
- `.planning/phases/17-tv-scaffold-priority-foundation/17-CONTEXT.md` — Route strategy, non-interactivity rules, priority ranking decisions, existing code insights

### Research
- `.planning/research/SUMMARY.md` — Full v4.0 architecture plan
- `.planning/research/ARCHITECTURE.md` — Canvas layering pattern, component tree design
- `.planning/research/PITFALLS.md` — Zustand cascade re-renders (Pitfall 2), priority thrashing (Pitfall 4)

### Existing code (key integration points)
- `spatialhub-frontend/src/pages/TvDashboardView.tsx` — Phase 17 scaffold; dev debug overlay to be replaced by PriorityGrid
- `spatialhub-frontend/src/hooks/usePriorityRanking.ts` — Returns ranked zone IDs; drives grid order
- `spatialhub-frontend/src/store/habitatStore.ts` — Zustand store with zones, solElapsed, simSource, per-zone selectors (`selectZone`)
- `spatialhub-frontend/src/components/habitat/Sparkline.tsx` — Reusable SVG sparkline (scale up width/height/points)
- `spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx` — BADGE_CONFIG colors/labels to reuse
- `spatialhub-frontend/src/components/habitat/HabitatHUD.tsx` — STATUS_COLORS, STATUS_LABELS, solElapsed calc pattern to reuse
- `spatialhub-frontend/src/simulation/constants.ts` — ZONE_CONFIGS with zone IDs, sensor configs, thresholds

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Sparkline.tsx`: Inline SVG sparkline with configurable width/height — scale up for TV cards (200x40 hero, 120x30 secondary)
- `habitatStore.ts`: Full Zustand store with `zones`, `solElapsed`, `simSource` — all data this phase needs
- `selectZone(zoneId)`: Per-zone Zustand selector — use in ZoneCard to avoid cascade re-renders across all 4 cards
- `usePriorityRanking()`: Returns `string[]` of ranked zone IDs — drives grid ordering
- `BADGE_CONFIG` (ConnectionBadge): Color/label map for data source states — import for StatusBar
- `STATUS_COLORS` / `STATUS_LABELS` (HabitatHUD): Color/label maps for zone status — import for ZoneCard and StatusBar
- `ZONE_ABBREVIATIONS` (HabitatHUD): Zone ID to 2-letter abbreviation map

### Established Patterns
- CSS keyframe injection via DOM `<style>` tag (AlertBanner, ConnectionBadge) — use for red zone pulse animation
- Per-zone Zustand selectors prevent cascade re-renders — each ZoneCard subscribes to its own zone only
- Monospace font (`Space Mono`) already used in TvDashboardView debug overlay
- Inline styles (not Tailwind) for habitat/TV components — consistent with existing R3F overlay pattern

### Integration Points
- `TvDashboardView.tsx`: Replace dev debug overlay with PriorityGrid + StatusBar
- `scoreZone()` duplicated in TvDashboardView — remove when PriorityGrid lands (noted in STATE.md decisions)
- `habitatStore.zones[zoneId].sensors` — sensor data with `.value`, `.status`, `.history` per sensor
- `habitatStore.solElapsed` — elapsed seconds for sol counter calculation
- `selectSimSource` selector — data source for connection badge

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

*Phase: 18-zone-cards-static-grid*
*Context gathered: 2026-03-22*
