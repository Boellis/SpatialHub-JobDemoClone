# Phase 19: FLIP Animation + Long-Session Resilience - Research

**Researched:** 2026-03-22
**Domain:** Framer Motion FLIP layout animation, Page Visibility API, BioSim probe resilience
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Duration: 500ms ease-out for all layout transitions
- Size change animated smoothly — card shrinks/grows as it slides (not snap-to-size)
- Hero→secondary: card slides down + shrinks width/height, content reflows
- Secondary→hero: card slides up + grows to full-width, content expands
- No post-move visual cue (no flash, no highlight) — the motion and size change IS the attention signal
- Content stays live during animation — sensor values, sparklines, status dots all continue updating during the 500ms slide
- Less visual noise is better for 8+ hour TV sessions
- `motion@12.x` pinned (not `^12.x`) for React 19 concurrent stability
- Use motion's `layoutAnimation` for FLIP — it handles position + size transitions natively
- No animation library currently installed — Phase 19 adds `motion` as first new dependency
- Reorder fires when `usePriorityRanking` output changes (already debounced with 3-tick stability)
- FLIP animation simply reacts to the new `rankedIds` array — no additional debounce needed

### Claude's Discretion
- Long-session resilience implementation approach (GPU memory monitoring, tab backgrounding recovery, stale connection handling)
- Whether to use `AnimatePresence` for enter/exit or just `layout` prop on cards
- Easing curve specifics (ease-out vs custom spring)
- How to handle rapid successive reorders (queue, interrupt, or let motion handle it)
- Test strategy for layout animations (unit vs visual snapshot)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LAYOUT-04 | Zones animate into ranked positions via FLIP when criticality threshold crossings occur (10s debounce) | motion@12.x `layout` prop + `layoutId` on `ZoneCard` wrappers; `LayoutGroup` on `PriorityGrid`; per-child `layout` prevents distortion; debounce already implemented in `usePriorityRanking` |
</phase_requirements>

---

## Summary

Phase 19 has two distinct deliverables that share a single success condition: a TV dashboard that looks alive and keeps running. The FLIP animation work is surgical — `PriorityGrid` gets `LayoutGroup`, each `ZoneCard` wrapper becomes a `motion.div` with `layout` and `layoutId`, and every direct child inside those wrappers also gets `layout`. That's the whole implementation. The child-distortion trap is the only real pitfall, and it's completely mechanical to avoid once you know about it.

The long-session resilience work is also narrowly scoped. The R3F Canvas is empty in Phase 19 (parallax is Phase 20), so there's no Three.js GPU leak concern here — the geometry count stays at zero. The two active concerns are: (1) the BioSim probe `setInterval` on the main thread is throttled when the browser tab is backgrounded, and (2) `renderer.info.memory.geometries` needs to be confirmed flat to gate Phase 20's parallax work. Both have known, tested fixes.

The `motion` library install is straightforward. The version to pin is `12.38.0` (latest as of 2026-03-22, verified against npm). The `"motion/react"` import path is required — `"framer-motion"` still works as a re-export shim but will emit a deprecation warning in v12.

**Primary recommendation:** Wrap `ZoneCard` in `motion.div` with `layout="position"` + `layoutId`, add `layout` to all direct children of that wrapper, wrap the grid in `LayoutGroup`, add `visibilitychange` handler to `useSimSource` for probe recovery. Four changes across three files.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| motion | 12.38.0 (PINNED, not ^) | FLIP layout animation | Only library that handles CSS grid slot reassignment without manual transform math; native FLIP support via `layout` prop; React 19 concurrent-mode safe |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Page Visibility API | Browser native | Detect tab background/foreground transitions | `visibilitychange` event for probe recovery |
| `renderer.info.memory` | three@0.183.2 (existing) | GPU memory health check | Monitoring only — read during dev; remove before merge |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| motion layout | CSS View Transitions API | VTA is simpler but requires same-document navigation; grid reorder within existing page doesn't trigger it natively without `startViewTransition` polyfill; less mature |
| motion layout | GSAP FLIP plugin | GSAP FLIP is excellent and well-documented but adds a separate commercial license concern; motion is already the project decision |
| visibilitychange + setInterval | Moving probe into biosimWorker | Worker approach is more robust (immune to all main-thread throttling) but requires Worker protocol extension (new command type); visibilitychange is simpler and sufficient for the kiosk TV use case |

**Installation:**
```bash
cd spatialhub-frontend && npm install motion@12.38.0
```

**Version verified:** `npm view motion version` → `12.38.0` (2026-03-22)

---

## Architecture Patterns

### Pattern 1: LayoutGroup + motion.div layout (The FLIP)

**What:** Wrap all animated siblings in `LayoutGroup`. Each card becomes `motion.div` with `layout` and `layoutId`. All direct children of the card wrapper also get `layout`.

**When to use:** Any time you want React key-based reorder to animate instead of snap.

**Example:**
```typescript
// Source: https://motion.dev/docs/react-layout-animations
import { motion, LayoutGroup } from 'motion/react';

// PriorityGrid — grid wrapper
<LayoutGroup>
  <div style={gridStyle} data-testid="priority-grid">
    <motion.div
      key={rankedIds[0]}
      layoutId={`zone-${rankedIds[0]}`}
      layout="position"
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{ gridColumn: '1 / -1', gridRow: '1' }}
    >
      <ZoneCard zoneId={rankedIds[0]} isHero={true} />
    </motion.div>
    {rankedIds.slice(1, 4).map((id) => (
      <motion.div
        key={id}
        layoutId={`zone-${id}`}
        layout="position"
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ gridRow: '2' }}
      >
        <ZoneCard zoneId={id} isHero={false} />
      </motion.div>
    ))}
  </div>
</LayoutGroup>
```

**Note on `layout` vs `layout="position"`:** `layout` animates position AND size. `layout="position"` animates position only, delegating size to the natural reflow. For this use case — cards changing from hero (full-width) to secondary (1/3-width) — use `layout` (full), not `layout="position"`, so the size change is also animated. The CONTEXT.md decision "card shrinks/grows as it slides" confirms full `layout` is correct.

### Pattern 2: Child `layout` Prop (Anti-Distortion Fix)

**What:** Every direct child of an animated `motion.div` also needs `layout` to prevent scale-distortion during the parent's size change.

**When to use:** Always, on every direct child of any `motion.div` that uses `layout`. This is non-negotiable.

**Example:**
```typescript
// Source: https://motion.dev/docs/react-layout-animations#scale-correction
// Inside ZoneCard — each direct child needs layout:
<motion.div layoutId={`zone-${zoneId}`} layout transition={{ duration: 0.5, ease: 'easeOut' }}>
  {/* Header row: MUST have layout */}
  <motion.div layout style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <motion.span layout>{zoneName}</motion.span>
    <motion.div layout style={{ display: 'flex' }}>...</motion.div>
  </motion.div>

  {/* Sensor rows: MUST have layout */}
  {sensorConfigs.map((cfg) => (
    <motion.div layout key={cfg.sensorId} style={{ display: 'flex' }}>
      ...
    </motion.div>
  ))}
</motion.div>
```

**The specific ZoneCard children that need `layout`:**
1. Header row `div` (zone name + status badge row)
2. Zone name `span`
3. Status badge container `div`
4. Each sensor row `div`
5. Sparkline container `div` (the right-side group with Sparkline + dot)

The `Sparkline` component itself renders SVG — verify it doesn't distort. If it does, wrap the SVG output in a `motion.div` with `layout`.

### Pattern 3: visibilitychange Probe Recovery

**What:** When the browser tab transitions from hidden to visible (`document.hidden` goes from `true` to `false`), immediately probe BioSim regardless of the 15s interval state.

**When to use:** Long-running TV sessions where the OS may background the browser (screensaver, standby, kiosk sleep mode).

**Example:**
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
// Add to useSimSource.ts useEffect, after the probeTimerRef setup:

const handleVisibilityChange = () => {
  if (!mountedRef.current) return;
  if (document.hidden) return; // tab going background — nothing to do
  // Tab became visible — probe immediately if in fallback
  const currentSource = useHabitatStore.getState().simSource;
  if (currentSource !== 'fallback') return;
  probeBioSim().then((simId) => {
    if (!mountedRef.current || simId === null) return;
    simIdRef.current = simId;
    useHabitatStore.getState().setSimSource('connecting');
    const history = extractHistory();
    workerRef.current?.postMessage({ type: 'SYNC_HISTORY', history } as WorkerCommand);
    workerRef.current?.postMessage({ type: 'CONNECT', wsUrl: wsUrl(simId) } as WorkerCommand);
  });
};

document.addEventListener('visibilitychange', handleVisibilityChange);

// In cleanup:
document.removeEventListener('visibilitychange', handleVisibilityChange);
```

### Pattern 4: GPU Memory Stability Verification

**What:** Log `renderer.info.memory.geometries` periodically in dev to confirm no leak before Phase 20's parallax work.

**When to use:** Phase 19 gate check — Canvas is empty, expect geometries = 0. If non-zero, leak is already present from somewhere unexpected.

**Example:**
```typescript
// Source: Three.js docs — renderer.info
// In TvDashboardView or a temporary dev-only component:
// Add useFrame check (dev only, remove before merge):
useFrame(({ gl }) => {
  if (frameCount++ % 300 === 0) {
    console.debug('[GPU] geometries:', gl.info.memory.geometries, 'textures:', gl.info.memory.textures);
  }
});
```

### Recommended File Changes

```
spatialhub-frontend/
├── package.json                      # Add motion@12.38.0
├── src/components/tv/
│   ├── PriorityGrid.tsx              # Add LayoutGroup, convert divs to motion.div with layoutId
│   └── ZoneCard.tsx                  # Convert internal divs to motion.div with layout (child distortion fix)
└── src/hooks/useSimSource.ts         # Add visibilitychange handler
```

No new files. No new components. No store changes.

### Anti-Patterns to Avoid

- **Using `layoutId` with array index as key suffix:** `layoutId="zone-0"` — wrong. Zone identity is lost on reorder. Use `layoutId={\`zone-${zoneId}\`}`.
- **`layout` on the grid container `div` itself:** The outer grid div must NOT be a `motion.div` — it's a fixed layout; only the card wrappers inside it animate.
- **`AnimatePresence` for this use case:** Cards don't enter/exit — all 4 are always rendered. `AnimatePresence` is for mounting/unmounting. Using it here adds complexity without benefit.
- **Wrapping `Sparkline` SVG in motion directly:** SVG element types (`motion.svg`, `motion.path`) are supported by motion but SVG scale correction behaves differently. Keep Sparkline as-is, wrap its container div.
- **Adding `transition` inside ZoneCard instead of on the motion wrapper:** Transition must be on the `motion.div` with `layoutId` to control the FLIP timing. Children inherit parent transition for layout animations.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FLIP position math | Calculate translate() from old/new getBoundingClientRect | `motion` `layout` prop | motion does First/Last/Invert/Play internally; manual FLIP breaks with CSS Grid gap and border-box sizing |
| Animation interrupts | Queue system for rapid reorders | Let motion handle it | motion cancels in-flight animations and starts from current position; hand-rolled queues cause visible position jumps |
| Scale distortion correction | Counter-scale children manually | `layout` prop on children | motion's scale correction uses a correction matrix that handles nested transforms; manual counter-scale drifts on non-square cards |

**Key insight:** The FLIP technique has deceptively complex edge cases (viewport scroll, border-box, gap, concurrent animations). motion has been solving these for years. Any custom implementation will rediscover all those bugs.

---

## Common Pitfalls

### Pitfall 1: Child Distortion During Hero Slot Size Change
**What goes wrong:** Zone card promotes from secondary (1/3 width) to hero (full width). Parent `motion.div` scales during FLIP. Zone name text stretches horizontally. Sparkline SVG aspect ratio distorts. Status dot becomes oval.
**Why it happens:** motion implements size change via `scaleX`/`scaleY` transforms. Children are not counter-scaled unless they also have `layout`.
**How to avoid:** Add `layout` to every direct child `div` and `span` inside the ZoneCard. Check the rendered DOM tree — every element that is a direct child of the `motion.div` with `layoutId` needs `layout`. This is mechanical, not clever.
**Warning signs:** Text visibly stretches during card size transition. Status dot deforms. Sparkline becomes taller/shorter than expected.

### Pitfall 2: Wrong `layout` Variant for Size-Changing Cards
**What goes wrong:** Using `layout="position"` when cards also change size (hero vs secondary). Size transition snaps instead of animating.
**Why it happens:** `layout="position"` only animates x/y position. Size changes are instant.
**How to avoid:** Use `layout` (no argument, or `layout={true}`) to animate both position and size. The CONTEXT.md explicitly requires "card shrinks/grows as it slides."

### Pitfall 3: Background Tab Throttles BioSim Probe Timer
**What goes wrong:** TV display is backgrounded (OS screensaver, kiosk sleep). `probeTimerRef` `setInterval` is throttled to ~1-minute intervals by Chromium. BioSim restarts on the GCE VM. Dashboard stays stuck on `fallback` for up to 60 seconds after wakeup.
**Why it happens:** Chromium background timer throttling (Page Visibility API spec behavior). The Worker WebSocket is NOT throttled — only main-thread `setInterval`/`setTimeout`.
**How to avoid:** Add `visibilitychange` event listener in `useSimSource`. On `document.hidden === false` (tab foreground), immediately probe BioSim if in fallback state.
**Warning signs:** After covering/uncovering the browser window, connection badge stays on `fallback` for more than 5 seconds.

### Pitfall 4: motion Import Path
**What goes wrong:** Importing from `"framer-motion"` in new code. Works (re-export shim exists) but emits deprecation warning in v12 and will break in v13.
**Why it happens:** Muscle memory from the old package name.
**How to avoid:** Always import from `"motion/react"`. No exceptions.

### Pitfall 5: LayoutGroup Scope
**What goes wrong:** `LayoutGroup` placed too high in the tree (wrapping the entire `TvDashboardView`). This causes ALL `motion.div` elements in the tree to participate in the same layout group, creating unexpected interactions between unrelated animated elements.
**Why it happens:** `LayoutGroup` scopes which elements can share `layoutId` transitions. Too-broad scope = contamination.
**How to avoid:** Place `LayoutGroup` directly in `PriorityGrid`, wrapping only the card wrappers. Not in `TvDashboardView`.

---

## Code Examples

Verified patterns from official sources:

### motion installation (pinned)
```bash
npm install motion@12.38.0
```

### PriorityGrid with FLIP
```typescript
// Source: https://motion.dev/docs/react-layout-animations
import { motion, LayoutGroup } from 'motion/react';
import { usePriorityRanking } from '../../hooks/usePriorityRanking';
import { ZoneCard } from './ZoneCard';

const FLIP_TRANSITION = { duration: 0.5, ease: 'easeOut' } as const;

export const PriorityGrid = () => {
  const rankedIds = usePriorityRanking();
  if (rankedIds.length === 0) return null;

  return (
    <LayoutGroup>
      <div style={gridStyle} data-testid="priority-grid">
        <motion.div
          key={rankedIds[0]}
          layoutId={`zone-${rankedIds[0]}`}
          layout
          transition={FLIP_TRANSITION}
          style={{ gridColumn: '1 / -1', gridRow: '1' }}
        >
          <ZoneCard zoneId={rankedIds[0]} isHero={true} />
        </motion.div>
        {rankedIds.slice(1, 4).map((id) => (
          <motion.div
            key={id}
            layoutId={`zone-${id}`}
            layout
            transition={FLIP_TRANSITION}
            style={{ gridRow: '2' }}
          >
            <ZoneCard zoneId={id} isHero={false} />
          </motion.div>
        ))}
      </div>
    </LayoutGroup>
  );
};
```

### ZoneCard children with layout (distortion fix)
```typescript
// Source: https://motion.dev/docs/react-layout-animations#scale-correction
// ZoneCard internal structure — every direct child of the card gets layout:
import { motion } from 'motion/react';

// Replace the outer <div> with motion.div and add layout to direct children:
return (
  <div style={containerStyle} data-testid={`zone-card-${zoneId}`}>
    {/* Header row */}
    <motion.div layout style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <motion.span layout data-testid="zone-name" style={...}>{zoneName}</motion.span>
      <motion.div layout style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* status dot + label */}
      </motion.div>
    </motion.div>

    {/* Sensor rows */}
    {sensorConfigs.map((cfg) => (
      <motion.div layout key={cfg.sensorId} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <motion.div layout style={{ flex: 1, minWidth: 0 }}>
          {/* label + value */}
        </motion.div>
        <motion.div layout style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Sparkline + status dot */}
        </motion.div>
      </motion.div>
    ))}
  </div>
);
```

**Note:** The outer `containerStyle` div in `ZoneCard` does NOT need to be a `motion.div` — the `motion.div` with `layoutId` lives in `PriorityGrid` as the wrapper. `ZoneCard` gets a plain `div` outer container. The `layout` children inside `ZoneCard` correct distortion from the parent's scale transform.

### visibilitychange handler in useSimSource
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
// Add inside the useEffect in useSimSource, after probeTimerRef setup:

const handleVisibilityChange = () => {
  if (!mountedRef.current || document.hidden) return;
  const currentSource = useHabitatStore.getState().simSource;
  if (currentSource !== 'fallback') return;
  void probeBioSim().then((simId) => {
    if (!mountedRef.current || simId === null) return;
    simIdRef.current = simId;
    useHabitatStore.getState().setSimSource('connecting');
    const history = extractHistory();
    workerRef.current?.postMessage({ type: 'SYNC_HISTORY', history } as WorkerCommand);
    workerRef.current?.postMessage({ type: 'CONNECT', wsUrl: wsUrl(simId) } as WorkerCommand);
  });
};

document.addEventListener('visibilitychange', handleVisibilityChange);
// Add to cleanup: document.removeEventListener('visibilitychange', handleVisibilityChange);
```

---

## BioSim Worker Probe Scope Analysis

STATE.md flagged this as an unknown: "BioSim Worker probe refactor scope unknown." After reading `biosimWorker.ts` and `useSimSource.ts`, the scope is clear:

**Option A (chosen): `visibilitychange` on main thread** — 8 lines in `useSimSource.ts`. No Worker protocol changes. No new command types. The probe itself stays on the main thread but fires immediately on tab-foreground rather than waiting for the throttled interval. This is sufficient because the Worker's WebSocket connection itself survives backgrounding — only the reconnection discovery (probe) is at risk.

**Option B (not chosen): Move probe into Worker** — Would require:
1. New `WorkerCommand` type: `PROBE`
2. New `WorkerMessage` type: `PROBE_RESULT` (with `simId: string | null`)
3. Worker imports `probeBioSim` (currently a `useSimSource` export — needs restructure or duplication)
4. Main thread listens for `PROBE_RESULT` and drives reconnect logic
5. Worker gets its own interval or responds to main-thread trigger

This is a non-trivial refactor of the Worker protocol. The simpler Option A covers the actual failure mode (throttled interval on wakeup) without touching the Worker. Option B is overkill for the TV kiosk deployment target.

**Decision: Option A.** The Worker probe refactor scope is LOW (8 lines, one file).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `framer-motion` package | `motion` package, import `"motion/react"` | motion v11 (2024) | Import path change; `framer-motion` shim still works in v12 but deprecated |
| Manual FLIP (getBoundingClientRect) | `layout` prop on `motion.div` | motion v5+ | Eliminates transform math entirely |
| `AnimateSharedLayout` component | `LayoutGroup` component | motion v6 | `AnimateSharedLayout` was removed; `LayoutGroup` is the replacement |

**Deprecated/outdated:**
- `AnimateSharedLayout`: Removed in motion v6. Documentation examples using it are stale. Use `LayoutGroup`.
- `import { motion } from "framer-motion"`: Works as shim in v12, will break in v13. Use `import { motion } from "motion/react"`.

---

## Open Questions

1. **Sparkline SVG distortion under scale correction**
   - What we know: `Sparkline` renders `<svg>` directly. motion's scale correction for SVG uses different attribute handling than DOM elements.
   - What's unclear: Whether wrapping the Sparkline container `div` in `motion.div layout` is sufficient, or whether the SVG itself needs explicit width/height preservation.
   - Recommendation: Test visually during implementation. If the sparkline distorts, add `style={{ width: isHero ? 200 : 120, height: isHero ? 40 : 30 }}` to the sparkline container `motion.div` to pin dimensions during animation.

2. **isHero prop change timing vs animation**
   - What we know: When rank 0 changes, `rankedIds[0]` changes, which changes which `ZoneCard` receives `isHero={true}`. The card with `layoutId="zone-X"` moves AND its `isHero` prop changes simultaneously.
   - What's unclear: Whether React processes the prop change before or after motion captures the FLIP snapshot. If props change before snapshot, the "before" position is wrong.
   - Recommendation: The CONTEXT.md decision says content stays live during animation, implying `isHero` change is immediate. This is standard motion behavior — motion snapshots position in `useLayoutEffect` before paint, so prop changes visible in the "after" state are correct. No workaround needed, but verify visually that hero card expands during the animation (not after).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 + @testing-library/react 16.3.2 |
| Config file | `spatialhub-frontend/vitest.config.ts` |
| Quick run command | `cd spatialhub-frontend && npm test` |
| Full suite command | `cd spatialhub-frontend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAYOUT-04 | PriorityGrid renders motion.div wrappers with `data-layout-id` matching `zone-{zoneId}` | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| LAYOUT-04 | `layoutId` uses zoneId (not index) — verify `zone-water-recycling` not `zone-0` | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| LAYOUT-04 | ZoneCard internal children are motion elements (smoke: motion renders without crash) | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 (update ZoneCard.test.tsx) |
| LAYOUT-04 | visibilitychange handler calls probeBioSim when simSource=fallback and tab becomes visible | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 (update useSimSource.test.ts) |
| LAYOUT-04 | visibilitychange handler does NOT call probeBioSim when simSource=biosim | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| GPU health | renderer.info.memory.geometries = 0 in empty Canvas | manual (production build) | N/A — manual verification | N/A |

**Note on layout animation testing:** motion's actual FLIP animation (position interpolation) is not testable in jsdom — it requires a real browser with layout engine. Tests verify structural correctness (correct props, correct layoutId values) rather than animation correctness. Visual verification is the gate for animation behavior.

### Sampling Rate
- **Per task commit:** `cd spatialhub-frontend && npm test`
- **Per wave merge:** `cd spatialhub-frontend && npm test`
- **Phase gate:** Full suite green + manual visual FLIP verification in production build

### Wave 0 Gaps
- [ ] `src/__tests__/PriorityGrid.test.tsx` — update to verify motion.div wrappers have `layoutId="zone-{id}"` attribute
- [ ] `src/__tests__/ZoneCard.test.tsx` — update to verify motion children render without crash (motion mock required)
- [ ] `src/__tests__/useSimSource.test.ts` — add visibilitychange handler tests (mock `document.addEventListener`, verify probe called on visibility=visible+fallback)

**motion mock for tests:**
```typescript
// Add to test files that render PriorityGrid or ZoneCard:
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, layoutId, layout, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div data-layout-id={layoutId} data-layout={String(layout)} {...props}>{children}</div>
    ),
    span: ({ children, layout, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span data-layout={String(layout)} {...props}>{children}</span>
    ),
  },
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
```

---

## Sources

### Primary (HIGH confidence)
- `spatialhub-frontend/src/components/tv/PriorityGrid.tsx` — direct inspection; uses zoneId as React key, ready for motion wrapping
- `spatialhub-frontend/src/components/tv/ZoneCard.tsx` — direct inspection; identified all direct children needing `layout` prop
- `spatialhub-frontend/src/hooks/useSimSource.ts` — direct inspection; confirmed `probeTimerRef` is main-thread `setInterval`; Worker protocol not touched by visibilitychange approach
- `spatialhub-frontend/src/workers/biosimWorker.ts` — direct inspection; confirmed Worker protocol (CONNECT/DISCONNECT/SYNC_HISTORY); Worker approach would require new command types
- `npm view motion version` → `12.38.0` (verified 2026-03-22)
- [motion layout animations docs](https://motion.dev/docs/react-layout-animations) — `layout` prop, `LayoutGroup`, `layoutId`, scale correction for children
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) — `visibilitychange` event, `document.hidden` semantics, timer throttling behavior

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` Pitfall 5 — FLIP child distortion; Pitfall 6 — background throttling; confirmed against official motion docs
- `.planning/research/SUMMARY.md` — motion@12.x React 19 concurrent stability decision rationale

### Tertiary (LOW confidence)
- [Maxime Heckel — Framer Motion layout animations](https://blog.maximeheckel.com/posts/framer-motion-layout-animations/) — scale distortion and child correction patterns (MEDIUM confidence; consistent with official docs)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — motion@12.38.0 verified against npm; import path verified against official docs; existing stack unchanged
- Architecture: HIGH — all integration points verified by direct file inspection; three affected files identified with specific line-level changes
- BioSim probe scope: HIGH — Worker protocol read directly; visibilitychange option confirmed sufficient without Worker changes
- Pitfalls: HIGH — all from prior research with official source verification; FLIP child distortion and background throttling both confirmed against official docs
- Test strategy: MEDIUM — motion FLIP is not testable in jsdom; structural tests confirm correct props; visual verification is required for animation correctness

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (motion is active; Page Visibility API is stable)
