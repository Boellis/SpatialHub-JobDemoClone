# Phase 21: Hero Card Chart + Digital Counter - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The hero zone card gets a large animated area chart in its center showing the primary sensor's history, and sensor values change with a mechanical digit-roll effect. Secondary cards are unchanged. No new data sources, no layout changes.

</domain>

<decisions>
## Implementation Decisions

### Hero area chart
- Full-width animated area chart filling ~60% of the hero card's center space
- Shows the primary sensor's 60-point history (same data as sparkline, bigger canvas)
- Line color: status-reactive (green/yellow/red) matching the sensor's current status
- Fill: gradient from line color to transparent at the bottom
- New data points append smoothly (animated line extension, not full redraw)
- Like a mission control telemetry strip
- SVG-based (consistent with existing Sparkline.tsx pattern)

### Digital counter effect
- Digit roll: each digit rolls independently like a mechanical counter
- Old digit scrolls up/out, new digit scrolls in from below
- 200ms transition per digit, staggered
- Only changed digits animate — unchanged digits stay static
- **Hero card only** — secondary cards keep instant value swap
- Applied to the large sensor values (48px font)

### Claude's Discretion
- Which sensor is "primary" for the area chart (worst-status sensor, or first sensor in config)
- Area chart SVG implementation details (path animation approach)
- Digit roll CSS/JS implementation (CSS transforms vs motion library)
- Whether the area chart replaces the per-sensor sparklines on the hero card or supplements them
- Chart axis labels/scale indicators if any

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 18 context (card anatomy)
- `.planning/phases/18-zone-cards-static-grid/18-CONTEXT.md` — Zone card layout, sparkline sizing, sensor row structure

### Existing code
- `spatialhub-frontend/src/components/tv/ZoneCard.tsx` — Hero card component, isHero prop, sensor rows
- `spatialhub-frontend/src/components/habitat/Sparkline.tsx` — Existing SVG sparkline pattern (reference for area chart)
- `spatialhub-frontend/src/store/habitatStore.ts` — sensor.history array (60 data points), sensor.value

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Sparkline.tsx`: SVG polyline pattern — area chart extends this with fill gradient and larger dimensions
- `ZoneCard.tsx`: `isHero` prop already gates hero-specific rendering (sizes, padding)
- `habitatStore`: `sensor.history` array provides the 60-point data, `sensor.value` for current reading
- `motion/react` already installed (Phase 19) — available for digit roll animation if needed

### Established Patterns
- Inline SVG for data visualization (Sparkline pattern)
- CSS keyframe injection for animations (ConnectionBadge, ZoneCard pulse)
- `isHero` conditional rendering in ZoneCard

### Integration Points
- `ZoneCard.tsx` — area chart renders inside hero card; digit roll wraps sensor value display
- Hero card has ~559px height with 24px padding — plenty of space for area chart

</code_context>

<specifics>
## Specific Ideas

- "Like a mission control telemetry strip" — the area chart should feel like real-time monitoring
- Digit roll should feel mechanical/physical — like an old departure board or odometer

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-hero-card-chart-digital-counter*
*Context gathered: 2026-03-22*
