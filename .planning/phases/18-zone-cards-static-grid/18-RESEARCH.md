# Phase 18: Zone Cards + Static Grid - Research

**Researched:** 2026-03-22
**Domain:** React/CSS Grid TV dashboard — zone card components, sparkline wiring, status bar, CSS keyframe pulse animation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Zone card anatomy**
- All sensors shown per card — every sensor gets a row: name, current value, status dot, mini sparkline
- Hero card uses larger sparklines and typography; secondary cards use same layout at smaller scale
- Hero card visual differentiation is **size only** — same card structure, border, background; the 2-col span and larger text IS the hierarchy
- Zone status indicator: top-right badge with status dot + label (NOMINAL / CAUTION / CRITICAL)

**Sparklines**
- Reuse existing `Sparkline.tsx` with configurable width/height (already supported)
- Hero sparklines: ~200x40px, secondary: ~120x30px
- History depth: 60 data points (up from current 30)
- Same SVG polyline approach, just bigger viewBox + more points

**Grid topology**
- 2-row layout: hero spans full width on top row, three secondary cards in a row below
- Hero row gets 55% of available height, secondary row 45%
- Generous spacing: 24px gap between cards, 32px padding from viewport edges
- CSS Grid implementation

**Status bar (HUD)**
- Full-width minimal strip at the very top, above the hero card
- 48px height, transparent background (inherits `#06070b`), no borders/separators
- Layout: status message (left), sol counter (center), connection badge (right)
- Text: 16px monospace, muted gray (`#9ca3af`); sol counter white and slightly larger
- Status dot colored by worst-zone status

**Status bar alert messaging**
- All green: `ALL SYSTEMS NOMINAL` (green dot, gray text)
- Non-nominal: show worst-status zone by name — e.g., `WATER RECYCLING: CRITICAL` (red dot, red text)
- Multiple non-nominal zones: show the worst one

**Critical zone pulse (STAT-02)**
- Red-status cards get a glowing border pulse: box-shadow animation, 2s cycle, `#ff2200`
- Resting: `1px solid rgba(255,34,0, 0.3)` — Peak: `1px solid #ff2200` + `box-shadow: 0 0 20px rgba(255,34,0, 0.4)`
- Card background stays dark; only border + glow breathes
- CSS keyframe injection pattern (same as AlertBanner/ConnectionBadge)

**Zone border states (non-pulse)**
- Green zones: `1px solid rgba(255,255,255, 0.06)` (nearly invisible)
- Yellow zones: `1px solid rgba(255,170,0, 0.4)` (static amber, no animation)
- Red zones: pulsing glow animation (described above)

**Status bar reaction to critical**
- Status bar text and dot change color (red text for critical, amber for caution) — no animation on the bar itself
- Cards carry the visual drama; bar is the text readout

**Component strategy**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LAYOUT-02 | Priority grid with hero slot (large, 2-col span) for most critical zone + 3 smaller secondary cards | CSS Grid `grid-template-columns: 1fr 1fr 1fr` with hero spanning all 3 via `grid-column: 1 / -1`; driven by `usePriorityRanking()` index 0 = hero |
| DATA-01 | Each zone card shows live sensor values with TV-safe typography (48px+ primary, 24px+ labels) | Per-zone Zustand selector `selectZone(zoneId)` feeds card; sensor `.value` and `.status` available; `Space Mono` font already loaded |
| DATA-02 | Each zone card includes sparkline chart of primary sensor's 60-point history | `Sparkline.tsx` supports arbitrary width/height; `history` array on `SensorReading`; engine `MAX_HISTORY=30` must be bumped to 60 in engine.ts + biosimMapper.ts |
| DATA-03 | Sol elapsed counter displayed prominently in HUD | `habitatStore.solElapsed` + `SOL_CYCLE_PERIOD=600`; pattern from `HabitatHUD.tsx` (`solCount = Math.floor(solElapsed / 600)`) |
| DATA-04 | Connection source badge shows active data source (BioSim / Pi Sensor / Client Sim) | `BADGE_CONFIG` from `ConnectionBadge.tsx` has all five states; `selectSimSource` selector exists |
| STAT-01 | Full-width status summary bar derives worst-case zone status ("ALL NOMINAL" or specific alert message) | Worst-zone derivation pattern in `HabitatHUD`; zone names from `ZONE_MAP` in `constants.ts`; new `StatusBar.tsx` owns this logic |
| STAT-02 | Red-status zone cards pulse with animated border/glow to signal critical conditions | CSS keyframe injection pattern from `ConnectionBadge.tsx`; `box-shadow` animation; inject once with style ID guard |
</phase_requirements>

---

## Summary

Phase 18 is a pure DOM composition phase — no new npm packages, no architectural risk. Every data source, selector, animation pattern, and reusable component is already in the codebase. The work is assembling three new TV components (`StatusBar`, `ZoneCard`, `PriorityGrid`) and wiring them into the existing `TvDashboardView` scaffold built in Phase 17.

The one substantive code change outside the new components is bumping the history ring buffer from 30 to 60 points in `engine.ts` (constant `MAX_HISTORY`) and `biosimMapper.ts` (constant `HISTORY_CAP`). This is a 2-line change but must happen first, as Sparkline history depth depends on it.

The CSS Grid topology is deterministic: hero always at `rankedIds[0]`, three secondaries at `rankedIds[1..3]`. No animation (Phase 19). No parallax (Phase 20). The existing `TvDashboardView.tsx` dev debug overlay (`<ul>` with ranked IDs and scores) gets replaced by `<StatusBar>` + `<PriorityGrid>`. The duplicated `scoreZone` function in `TvDashboardView` is removed — it only existed for the debug display.

**Primary recommendation:** Build in this order: (1) bump history cap, (2) `StatusBar`, (3) `ZoneCard`, (4) `PriorityGrid`, (5) wire into `TvDashboardView`. Tests follow each component.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + TypeScript | 19 / ~5.7 | Component tree | Already in use |
| Zustand | ^5.0.11 | Zone data, sim source, sol elapsed | `selectZone`, `selectSimSource` selectors already exist |
| `Sparkline.tsx` (internal) | — | SVG sparkline per sensor row | Width/height configurable; supports up to N points |
| CSS Grid (native) | — | 2-row priority grid layout | No library needed; locked decision |
| CSS keyframe injection (DOM `<style>`) | — | Red zone pulse animation | Established pattern in AlertBanner + ConnectionBadge |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Space Mono` (Google Fonts) | already loaded | TV monospace typography | All TV component text |
| `ZONE_MAP` / `ZONE_CONFIGS` | internal | Zone full names for status bar | StatusBar alert message construction |

### No New Dependencies
Zero npm installs for this phase. Everything needed is in the existing codebase.

---

## Architecture Patterns

### Recommended Component Structure
```
src/components/tv/
├── StatusBar.tsx        # Full-width top strip: status msg, sol counter, connection badge
├── ZoneCard.tsx         # Single zone — sensor rows, sparklines, status badge, pulse
├── PriorityGrid.tsx     # CSS Grid wrapper: hero slot + 3 secondary slots
└── constants.ts         # (discretionary) shared STATUS_COLORS, STATUS_LABELS, ZONE_NAMES
```

### TvDashboardView after Phase 18
```
TvDashboardView
├── Canvas (R3F, z-index 0, empty until Phase 20)
└── div (z-index 1, full viewport)
    ├── StatusBar        # replaces dev debug <ul>
    └── PriorityGrid
        ├── ZoneCard (hero — rankedIds[0])
        ├── ZoneCard (secondary — rankedIds[1])
        ├── ZoneCard (secondary — rankedIds[2])
        └── ZoneCard (secondary — rankedIds[3])
```

### Pattern 1: Per-Zone Zustand Selector (CASCADE RE-RENDER PREVENTION)
**What:** Each `ZoneCard` subscribes only to its own zone, not the full `zones` record.
**When to use:** Every card component — mandatory, not optional.
**Example:**
```typescript
// Source: habitatStore.ts — selectZone selector
import { useHabitatStore } from '../../store/habitatStore';
import { selectZone } from '../../store/habitatStore';

const ZoneCard = ({ zoneId }: { zoneId: string }) => {
  const zone = useHabitatStore(selectZone(zoneId));
  // zone.status, zone.sensors — this card only re-renders when ITS zone updates
};
```

### Pattern 2: CSS Grid 2-Row Hero Layout
**What:** Hero spans full width (top row, 100% height proportion), three secondary cards share bottom row.
**When to use:** `PriorityGrid` — this is the locked grid topology.
```typescript
// PriorityGrid layout
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gridTemplateRows: '55fr 45fr',
  gap: '24px',
  padding: '32px',
  height: '100%',
  boxSizing: 'border-box',
};

const heroStyle: React.CSSProperties = {
  gridColumn: '1 / -1',  // spans all 3 columns
  gridRow: '1',
};

const secondaryStyle: React.CSSProperties = {
  gridRow: '2',
};
```

### Pattern 3: CSS Keyframe Injection (RED ZONE PULSE)
**What:** Inject `@keyframes` once via DOM `<style>` tag; apply animation class/inline style when zone is red.
**When to use:** `ZoneCard` for STAT-02 pulse requirement.
```typescript
// Source: ConnectionBadge.tsx pattern
const TV_ANIMATIONS_ID = 'tv-zone-animations';

function ensureTvAnimationsInjected() {
  if (document.getElementById(TV_ANIMATIONS_ID)) return;
  const style = document.createElement('style');
  style.id = TV_ANIMATIONS_ID;
  style.textContent = `
    @keyframes zoneCriticalPulse {
      0%   { border-color: rgba(255,34,0,0.3); box-shadow: none; }
      50%  { border-color: #ff2200; box-shadow: 0 0 20px rgba(255,34,0,0.4); }
      100% { border-color: rgba(255,34,0,0.3); box-shadow: none; }
    }
  `;
  document.head.appendChild(style);
}
```

### Pattern 4: Status Bar Worst-Zone Derivation
**What:** Iterate all zones, find worst status, identify the worst zone by name for alert message.
**When to use:** `StatusBar` component — mirrors `HabitatHUD` pattern with additional zone name lookup.
```typescript
// Source: HabitatHUD.tsx overallStatus pattern + ZONE_MAP
import { ZONE_MAP } from '../../simulation/constants';

const zones = useHabitatStore(s => s.zones);
let worstStatus: ZoneStatus = 'green';
let worstZoneId: string | null = null;
for (const [id, zone] of Object.entries(zones)) {
  if (zone.status === 'red' && worstStatus !== 'red') {
    worstStatus = 'red';
    worstZoneId = id;
  } else if (zone.status === 'yellow' && worstStatus === 'green') {
    worstStatus = 'yellow';
    worstZoneId = id;
  }
}
const alertMessage = worstStatus === 'green'
  ? 'ALL SYSTEMS NOMINAL'
  : `${ZONE_MAP[worstZoneId!]?.name.toUpperCase() ?? worstZoneId}: ${STATUS_LABELS[worstStatus]}`;
```

### Pattern 5: Sol Counter
**What:** Derive `solCount` from store `solElapsed` using `SOL_CYCLE_PERIOD = 600`.
**Source:** `HabitatHUD.tsx` — identical logic, reuse verbatim.
```typescript
import { SOL_CYCLE_PERIOD } from '../../simulation/constants';
const solElapsed = useHabitatStore(s => s.solElapsed);
const solCount = Math.floor(solElapsed / SOL_CYCLE_PERIOD);
const solDisplay = `SOL ${String(solCount).padStart(3, '0')}`;
```

### Anti-Patterns to Avoid
- **Subscribing to full `zones` in ZoneCard:** `useHabitatStore(s => s.zones)` inside a card causes ALL four cards to re-render every 2s tick. Use `selectZone(zoneId)` instead.
- **Subscribing to full `zones` in PriorityGrid:** Grid parent only needs `rankedIds` from `usePriorityRanking()`, never `zones` directly.
- **Putting scoreZone in PriorityGrid:** It already exists in `usePriorityRanking`. The duplicated copy in `TvDashboardView` is being removed this phase — do not re-introduce it in any new component.
- **Using array index as React key for zone cards:** Must use `zoneId` as key. Phase 19 FLIP animation requires stable `layoutId` tied to `zoneId`, not index.
- **CSS animation on StatusBar text:** Locked decision — bar has no animation; only cards pulse.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sparkline chart | Custom SVG polyline from scratch | `Sparkline.tsx` (already exists) | Width/height/color already configurable; handles < 2 data points gracefully |
| Sol counter | Custom time calculation | `HabitatHUD` `solCount` pattern + `SOL_CYCLE_PERIOD` | Already correct; includes `padStart` formatting |
| Data source badge | Custom badge component | Import `ConnectionBadge.tsx` directly OR import `BADGE_CONFIG` for StatusBar integration | Five states, colors, labels already defined |
| Status color/label maps | New constants | `STATUS_COLORS` + `STATUS_LABELS` from `HabitatHUD.tsx` | Already correct — `#00ff88`, `#ffaa00`, `#ff2200`; NOMINAL/CAUTION/CRITICAL |
| Zone priority ranking | Sorting logic in grid | `usePriorityRanking()` hook | Already built with 3-tick debounce hysteresis |
| CSS keyframe injection | New animation approach | DOM `<style>` injection pattern from `ConnectionBadge.tsx` | Consistent; idempotent (ID guard prevents double-inject) |
| Zone name lookup | Hardcoded string map | `ZONE_MAP[zoneId].name` from `constants.ts` | All four zone full names already defined |

---

## Common Pitfalls

### Pitfall 1: Cascade Re-Renders from Full `zones` Subscription
**What goes wrong:** A card or grid parent subscribing to `useHabitatStore(s => s.zones)` causes all four cards to simultaneously re-render every 2s tick, because `tick()` always creates a new zones object reference.
**Why it happens:** Zustand `tick()` does `{ ...state.zones, ... }` — the reference always changes even if a specific zone's data did not.
**How to avoid:** `selectZone(zoneId)` per card; `usePriorityRanking()` (not `zones`) drives grid order.
**Warning signs:** React DevTools Profiler shows all 4 cards rendering simultaneously on every 2s interval.

### Pitfall 2: History Cap Still at 30 When Sparklines Expect 60
**What goes wrong:** `Sparkline` receives only 30 points max even though hero sparklines are configured for 60-point history. Charts look sparse on the hero card.
**Why it happens:** `engine.ts` has `MAX_HISTORY = 30` and `biosimMapper.ts` has `HISTORY_CAP = 30`. The CONTEXT.md decision to use 60 points requires bumping both constants.
**How to avoid:** Change both constants to 60 as Wave 0 / first task. No other code changes required — `appendRingBuffer` already accepts a `cap` parameter and `Sparkline` renders whatever array length it receives.
**Warning signs:** Hero sparkline never shows more than 30 data points even after extended runtime.

### Pitfall 3: Double Keyframe Injection
**What goes wrong:** If `ensureTvAnimationsInjected()` runs without an ID guard, hot-reload or React Strict Mode double-mount adds duplicate `@keyframes` rules — browsers handle this but it's wasteful.
**Why it happens:** `useEffect` runs twice in Strict Mode dev.
**How to avoid:** Follow the exact `ConnectionBadge` pattern — check `document.getElementById(ANIMATION_ID)` before creating the `<style>` tag.

### Pitfall 4: StatusBar Subscribing to Full `zones` Map
**What goes wrong:** `StatusBar` iterating `useHabitatStore(s => s.zones)` re-renders the bar every tick, including recomputing worst-zone string every 2s.
**Why it happens:** StatusBar needs to see all zone statuses to derive the worst-case message.
**How to avoid:** This is acceptable — StatusBar is a single component, not four. The re-render is cheap (string comparison over 4 zones). Alternatively, use `selectAllZoneStatuses()` (exported from `habitatStore.ts`) which returns a `Record<string, ZoneStatus>` — a smaller slice than full `zones`.

### Pitfall 5: Sensor Row Order Unstable Across Ticks
**What goes wrong:** `Object.values(zone.sensors)` returns sensors in insertion order, which should be stable. But if sensor iteration order differs from `ZONE_CONFIGS` sensor array order, rows appear to jump.
**Why it happens:** Store builds sensors from `ZONE_CONFIGS` order, so insertion order is deterministic. However, reading from `Object.values()` depends on JS engine insertion order — V8 preserves string key insertion order for non-integer keys, so this is safe. Just don't sort differently in the card vs the config.
**How to avoid:** Iterate sensors using the `ZONE_CONFIGS` sensor array as the source of truth for ordering: `ZONE_MAP[zoneId].sensors.map(cfg => zone.sensors[cfg.sensorId])`. This is canonical and survives any future store refactor.

---

## Code Examples

### ZoneCard sensor iteration (stable order)
```typescript
// Source: constants.ts ZONE_MAP pattern
import { ZONE_MAP } from '../../simulation/constants';
import { useHabitatStore, selectZone } from '../../store/habitatStore';

const ZoneCard = ({ zoneId, isHero }: { zoneId: string; isHero: boolean }) => {
  const zone = useHabitatStore(selectZone(zoneId));
  const sensorConfigs = ZONE_MAP[zoneId]?.sensors ?? [];

  return (
    <div style={cardStyle(zone.status, isHero)}>
      {sensorConfigs.map(cfg => {
        const reading = zone.sensors[cfg.sensorId];
        return reading ? (
          <SensorRow key={cfg.sensorId} config={cfg} reading={reading} isHero={isHero} />
        ) : null;
      })}
    </div>
  );
};
```

### PriorityGrid wiring (no zones subscription)
```typescript
// Source: usePriorityRanking.ts + CSS Grid locked decisions
import { usePriorityRanking } from '../../hooks/usePriorityRanking';

const PriorityGrid = () => {
  const rankedIds = usePriorityRanking();

  if (rankedIds.length === 0) {
    return <AwaitingTelemetry />;  // loading state — Claude's discretion
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '55fr 45fr', gap: 24, padding: 32, height: '100%', boxSizing: 'border-box' }}>
      <ZoneCard key={rankedIds[0]} zoneId={rankedIds[0]} isHero={true}  style={{ gridColumn: '1 / -1' }} />
      <ZoneCard key={rankedIds[1]} zoneId={rankedIds[1]} isHero={false} />
      <ZoneCard key={rankedIds[2]} zoneId={rankedIds[2]} isHero={false} />
      <ZoneCard key={rankedIds[3]} zoneId={rankedIds[3]} isHero={false} />
    </div>
  );
};
```

### Red zone pulse inline style
```typescript
// Source: ConnectionBadge.tsx pattern adapted for border animation
function cardBorderStyle(status: ZoneStatus): React.CSSProperties {
  switch (status) {
    case 'red':    return { border: '1px solid rgba(255,34,0,0.3)', animation: 'zoneCriticalPulse 2s ease-in-out infinite' };
    case 'yellow': return { border: '1px solid rgba(255,170,0,0.4)' };
    default:       return { border: '1px solid rgba(255,255,255,0.06)' };
  }
}
```

### StatusBar layout
```typescript
// Locked decision: 48px height, 3-column (msg left, sol center, badge right)
<div style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 32px', fontFamily: 'Space Mono, monospace', fontSize: 16 }}>
  <span style={{ flex: 1, color: statusTextColor }}>{alertMessage}</span>
  <span style={{ color: 'white', fontSize: 18, letterSpacing: '0.1em' }}>{solDisplay}</span>
  <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
    {/* ConnectionBadge content or BADGE_CONFIG inline */}
  </span>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `MAX_HISTORY = 30` in engine.ts | Bump to 60 for Phase 18 | Phase 18 | Hero sparklines get full 60-point history |
| Dev debug `<ul>` in TvDashboardView | Remove; replace with `PriorityGrid` + `StatusBar` | Phase 18 | Dashboard is now a real display, not a debug overlay |
| `scoreZone` duplicated in TvDashboardView | Remove (STATE.md noted this) | Phase 18 | Single canonical implementation in `usePriorityRanking` |

**Deprecated/outdated this phase:**
- Dev debug `<ul>` block in `TvDashboardView.tsx`: remove in its entirety
- Duplicate `scoreZone` function in `TvDashboardView.tsx`: remove (not exported, only existed for debug display)

---

## Open Questions

1. **StatusBar connection badge: full `ConnectionBadge` component or inline from `BADGE_CONFIG`?**
   - What we know: `ConnectionBadge.tsx` includes a pulse animation on state change that's designed for HabitatHUD's vertical layout; StatusBar is horizontal
   - What's unclear: Whether the pulse animation is desirable in the TV status bar
   - Recommendation: Import `BADGE_CONFIG` and render inline in `StatusBar` — simpler, avoids the pulse, matches locked decision of "bar has no animation"

2. **`tv/constants.ts` extraction?**
   - What we know: `STATUS_COLORS` and `STATUS_LABELS` live in `HabitatHUD.tsx` (not exported); `BADGE_CONFIG` lives in `ConnectionBadge.tsx` (not exported)
   - What's unclear: Planner's discretion on whether to extract shared TV constants
   - Recommendation: Extract to `src/components/tv/constants.ts` — three new TV components all need the same color/label maps; avoids re-importing from non-TV components

3. **Loading/empty state for `PriorityGrid` before first telemetry tick?**
   - What we know: `usePriorityRanking` initializes from `buildInitialZones()` so `rankedIds` is never empty — all zones start green with alphabetical ordering
   - What's unclear: Whether the initial all-nominal state counts as "no telemetry yet"
   - Recommendation: No special loading state needed. Initial zone state is valid data. The existing `AWAITING TELEMETRY...` placeholder in Phase 17 was a debug artifact.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.0 + @testing-library/react ^16.3.2 |
| Config file | `spatialhub-frontend/vitest.config.ts` |
| Quick run command | `cd spatialhub-frontend && npx vitest run src/__tests__/TvDashboardView.test.tsx` |
| Full suite command | `cd spatialhub-frontend && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAYOUT-02 | Hero card has `gridColumn: 1 / -1`; secondary cards occupy bottom row | unit | `npx vitest run src/__tests__/PriorityGrid.test.tsx` | ❌ Wave 0 |
| LAYOUT-02 | `rankedIds[0]` maps to hero slot; `rankedIds[1..3]` map to secondary slots | unit | `npx vitest run src/__tests__/PriorityGrid.test.tsx` | ❌ Wave 0 |
| DATA-01 | ZoneCard renders sensor name, value, and status dot for each sensor | unit | `npx vitest run src/__tests__/ZoneCard.test.tsx` | ❌ Wave 0 |
| DATA-01 | Hero card renders at `isHero=true`; secondary at `isHero=false` | unit | `npx vitest run src/__tests__/ZoneCard.test.tsx` | ❌ Wave 0 |
| DATA-02 | ZoneCard includes Sparkline for each sensor with correct history array | unit | `npx vitest run src/__tests__/ZoneCard.test.tsx` | ❌ Wave 0 |
| DATA-03 | StatusBar shows `SOL {n}` derived from `solElapsed / 600` | unit | `npx vitest run src/__tests__/StatusBar.test.tsx` | ❌ Wave 0 |
| DATA-04 | StatusBar shows connection badge (dot + label) matching current `simSource` | unit | `npx vitest run src/__tests__/StatusBar.test.tsx` | ❌ Wave 0 |
| STAT-01 | StatusBar shows `ALL SYSTEMS NOMINAL` when all zones green | unit | `npx vitest run src/__tests__/StatusBar.test.tsx` | ❌ Wave 0 |
| STAT-01 | StatusBar shows `{ZONE NAME}: CRITICAL` when worst zone is red | unit | `npx vitest run src/__tests__/StatusBar.test.tsx` | ❌ Wave 0 |
| STAT-02 | Red-status ZoneCard has `animation` style containing `zoneCriticalPulse` | unit | `npx vitest run src/__tests__/ZoneCard.test.tsx` | ❌ Wave 0 |
| STAT-02 | Green/yellow ZoneCard does NOT have animation style | unit | `npx vitest run src/__tests__/ZoneCard.test.tsx` | ❌ Wave 0 |
| LAYOUT-02 | TvDashboardView renders PriorityGrid and StatusBar (smoke) | smoke | `npx vitest run src/__tests__/TvDashboardView.test.tsx` | ✅ exists (needs extension) |

### Sampling Rate
- **Per task commit:** `cd spatialhub-frontend && npx vitest run src/__tests__/TvDashboardView.test.tsx`
- **Per wave merge:** `cd spatialhub-frontend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/StatusBar.test.tsx` — covers DATA-03, DATA-04, STAT-01
- [ ] `src/__tests__/ZoneCard.test.tsx` — covers DATA-01, DATA-02, STAT-02
- [ ] `src/__tests__/PriorityGrid.test.tsx` — covers LAYOUT-02
- [ ] `TvDashboardView.test.tsx` needs mock extensions for `StatusBar` + `PriorityGrid` once those components exist

Existing test infrastructure (Vitest + jsdom + @testing-library/react + @testing-library/jest-dom) covers all Phase 18 needs. Mock pattern for Zustand store already established in `usePriorityRanking.test.ts` and `TvDashboardView.test.tsx`.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `TvDashboardView.tsx`, `usePriorityRanking.ts`, `habitatStore.ts`, `Sparkline.tsx`, `HabitatHUD.tsx`, `ConnectionBadge.tsx`, `constants.ts`, `types/habitat.ts`, `engine.ts`, `biosimMapper.ts`
- Existing test files: `TvDashboardView.test.tsx`, `usePriorityRanking.test.ts`, `ConnectionBadge.test.tsx`
- `.planning/phases/18-zone-cards-static-grid/18-CONTEXT.md` — all implementation decisions locked

### Secondary (HIGH confidence)
- `.planning/research/SUMMARY.md` — Zustand cascade re-render pitfall (Pitfall 2), per-zone selector strategy
- `.planning/research/PITFALLS.md` — Pitfall 2 (cascade re-renders), Pitfall 7 (priority thrashing — already solved in Phase 17)

### No external research required
This phase has no external API surface or new library dependencies. All patterns are established in the codebase with direct file evidence.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all libraries in `package.json`
- Architecture: HIGH — all patterns verified by direct codebase inspection with file paths
- Pitfalls: HIGH — grounded in actual code (Zustand `tick()` implementation, `MAX_HISTORY` constant, keyframe injection pattern)

**Research date:** 2026-03-22
**Valid until:** Until Phase 19 planning (FLIP animation adds `motion` library; no impact on Phase 18)
