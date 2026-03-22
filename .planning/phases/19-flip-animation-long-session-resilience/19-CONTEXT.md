# Phase 19: FLIP Animation + Long-Session Resilience - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Zone cards animate into new grid positions when criticality ranking changes (FLIP transitions), and the dashboard runs without degradation over 8+ hour TV sessions. No new data features, no new UI components — this phase adds motion and stability to the existing Phase 18 grid.

</domain>

<decisions>
## Implementation Decisions

### Animation feel
- Duration: 500ms ease-out for all layout transitions
- Size change animated smoothly — card shrinks/grows as it slides (not snap-to-size)
- Hero→secondary: card slides down + shrinks width/height, content reflows
- Secondary→hero: card slides up + grows to full-width, content expands
- No post-move visual cue (no flash, no highlight) — the motion and size change IS the attention signal
- Content stays live during animation — sensor values, sparklines, status dots all continue updating during the 500ms slide
- Less visual noise is better for 8+ hour TV sessions

### Animation library
- `motion@12.x` pinned (not `^12.x`) for React 19 concurrent stability (prior research decision from STATE.md)
- Use motion's `layoutAnimation` for FLIP — it handles position + size transitions natively
- No animation library currently installed — Phase 19 adds `motion` as first new dependency

### Reorder trigger
- Reorder fires when `usePriorityRanking` output changes (already debounced with 3-tick stability)
- LAYOUT-04 specifies 10s debounce for threshold crossings — already implemented in the hook
- FLIP animation simply reacts to the new `rankedIds` array — no additional debounce needed

### Claude's Discretion
- Long-session resilience implementation approach (GPU memory monitoring, tab backgrounding recovery, stale connection handling)
- Whether to use `AnimatePresence` for enter/exit or just `layout` prop on cards
- Easing curve specifics (ease-out vs custom spring)
- How to handle rapid successive reorders (queue, interrupt, or let motion handle it)
- Test strategy for layout animations (unit vs visual snapshot)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — LAYOUT-04 (zones animate into ranked positions via FLIP, 10s debounce)

### Phase 18 context (upstream dependency)
- `.planning/phases/18-zone-cards-static-grid/18-CONTEXT.md` — Grid topology (55fr/45fr, CSS Grid), card anatomy, component locations
- `.planning/phases/18-zone-cards-static-grid/18-RESEARCH.md` — Zustand cascade re-render pitfalls, per-zone selector pattern

### Research (v4.0 level)
- `.planning/research/SUMMARY.md` — v4.0 architecture plan, motion@12.x decision
- `.planning/research/PITFALLS.md` — Pitfall 2 (Zustand cascade re-renders), Pitfall 3 (GPU memory growth), Pitfall 4 (priority thrashing)

### Existing code (key integration points)
- `spatialhub-frontend/src/components/tv/PriorityGrid.tsx` — Grid layout to receive FLIP; already uses zoneId as React key
- `spatialhub-frontend/src/components/tv/ZoneCard.tsx` — Card component; isHero prop drives size
- `spatialhub-frontend/src/hooks/usePriorityRanking.ts` — Returns rankedIds; 3-tick debounce
- `spatialhub-frontend/src/pages/TvDashboardView.tsx` — Top-level page with R3F Canvas (GPU memory concern)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PriorityGrid.tsx`: Already uses `zoneId` as React key (comment: "Phase 19 FLIP animation needs stable keys"). Ready for `motion` wrapping.
- `usePriorityRanking()`: Returns `string[]` — FLIP triggers on this array changing. 3-tick debounce already prevents thrashing.
- `ZoneCard.tsx`: `isHero` prop controls sizing (48px vs 28px, 200px vs 120px sparklines). Size transition needs to animate these.
- R3F Canvas: `events={null}`, empty scene (Phase 20 parallax). Monitor `renderer.info.memory.geometries` for GPU leak detection.

### Established Patterns
- CSS keyframe injection via DOM `<style>` tag (AlertBanner, ConnectionBadge, ZoneCard) — could be used for fallback animations
- Per-zone Zustand selectors prevent cascade re-renders — critical during animation to avoid jank
- Inline styles (not Tailwind) for all TV components

### Integration Points
- `PriorityGrid.tsx` is the primary target — wrap in motion layout components
- `ZoneCard.tsx` needs `motion.div` wrapper or `layout` prop for FLIP to work
- `package.json` needs `motion@12.x` added (pinned, not caret)

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

*Phase: 19-flip-animation-long-session-resilience*
*Context gathered: 2026-03-22*
