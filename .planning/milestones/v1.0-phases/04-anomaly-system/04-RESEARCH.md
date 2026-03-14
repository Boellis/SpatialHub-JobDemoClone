# Phase 4: Anomaly System - Research

**Researched:** 2026-03-13
**Domain:** React state management, simulation modifier injection, CSS animation, Zustand store extension
**Confidence:** HIGH

## Summary

Phase 4 is almost entirely internal logic — no new libraries, no new 3D machinery, no new backend calls. The task is to inject a bias layer into the existing simulation engine, track per-scenario state in Zustand, expose a trigger panel as a collapsible drawer, and fire a distinct scenario-announcement banner through AlertBanner's existing infrastructure.

Every visual effect the user will see (dome pulsing red at 2Hz, zone status escalating, alert toasts firing) is already wired up and reactive to sensor state. The anomaly system's entire job is to shove sensor values into crisis ranges on a timed curve. The heavy lifting was done in phases 2 and 3.

The critical design choice — which CONTEXT.md leaves to Claude's discretion — is the modifier injection point in `engine.ts`. The cleanest approach is to add an `anomalyBias` parameter to `computeNewValue()` that additively biases the pre-clamp result, making the existing clamp/status derivation pipeline do all the downstream work for free.

**Primary recommendation:** Add anomaly state to the Zustand store as a new sub-object (not a separate slice), inject bias values into `computeNewValue()` from a module-scope `getAnomalyBias()` helper that reads store state, and build `AnomalyDrawer.tsx` following the AlertBanner CSS injection pattern for animations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trigger Control Panel**
- Bottom-center collapsible drawer, toggled by a small button at the bottom edge of the screen
- Starts collapsed — keeps the immersive feel clean until the user wants to trigger something
- Contains 4 scenario buttons in a horizontal row with icon + short label (e.g., "CO2 Spike", "Pump Failure", "Nutrient Crash", "Power Flux")
- Drawer has a close [X] button; opens with slide-up animation
- Glassmorphism styling consistent with HUD and ZonePanel

**Scenario Button Behavior**
- Toggle behavior: click to trigger anomaly, click again to cancel early and start recovery
- Button glows/pulses red while scenario is active
- Button returns to dim/outlined state when recovery starts
- No countdown timer or progress bar — just active indicator on button

**Scenario Pacing**
- Onset: ~8-10 seconds (4-5 simulation ticks) gradual ramp from nominal to yellow to red
- Peak: ~10-15 seconds sustained at crisis values
- Recovery: ~10 seconds gradual drift back to nominal after auto-timeout or manual cancel
- Total scenario arc: ~30 seconds
- Auto-timeout: anomaly automatically begins recovering after peak duration
- Early cancel: user clicks toggle to skip to recovery phase immediately

**Concurrent Scenarios**
- Multiple scenarios can run simultaneously — each tracks independently
- Each scenario has its own onset/peak/recovery timer

**Zone Scope**
- CO2 Spike: Grow Bays sensors only (CO2 up, temperature up, humidity down)
- Pump Failure: Water Recycling sensors only (flow down, pH swings, TDS destabilizes)
- Nutrient Crash: Water Recycling sensors only (TDS down or pH swing)
- Power Fluctuation: Power/Thermal sensors only (power down, battery down, coolant up)
- Intra-zone correlations from existing engine.ts `applyCorrelations()` still apply during anomalies

**Visual Drama**
- No extra visual effects beyond existing Phase 2 status-reactive behavior
- No screen vignette, no bloom changes, no ambient light changes
- No auto-camera focus on affected zone

**Alert Escalation**
- Scenario-level announcement banner fires immediately when anomaly triggers
- Styled differently from regular sensor alerts: wider, bolder, zone accent color left border
- Content: "CO2 SPIKE DETECTED — Grow Bays" (scenario name + affected zone)
- Auto-dismisses after ~8 seconds
- No special 'ANOMALY ACTIVE' indicator in HUD

**Recovery Behavior**
- Silent recovery — no 'ALL CLEAR' notification
- Button stops pulsing when recovery starts

### Claude's Discretion
- Exact anomaly modifier math (bias curves, how strongly to push sensors)
- Scenario announcement banner CSS details (width, animation, font weight)
- Drawer toggle button icon/styling
- Drawer slide-up animation implementation
- How anomaly state integrates with Zustand store (new slice vs extending existing)
- Whether to modify engine.ts tick function or inject anomaly modifiers separately

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ANOM-01 | User can trigger anomaly scenarios (CO2 spike, pump failure, nutrient crash, power fluctuation) | AnomalyDrawer component with 4 scenario buttons; triggerAnomaly/cancelAnomaly actions in Zustand store |
| ANOM-02 | Anomalies produce visual drama (flashing zones, alert escalation, sensor value spikes) | Modifier injection into computeNewValue() pushes sensors into red threshold; existing dome pulsing, AlertBanner, and ZonePanel sparklines react automatically |
| ANOM-03 | Anomalies have gradual onset and recovery curves (not binary toggles) | Per-scenario tick counter drives lerp factor from 0 to 1 over onset ticks; recovery phase lerps bias back to 0 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | 5.0.11 | Anomaly state storage | Already in use; anomaly state extends HabitatState |
| React | 19.0.0 | AnomalyDrawer component | Already in use |
| TypeScript | 5.7.2 | Type safety for anomaly definitions | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS keyframe injection via `<style>` tag | N/A | Drawer slide-up and button pulse animations | Follow existing AlertBanner pattern — Tailwind purges custom keyframes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand store extension | Separate anomaly context | Store extension is simpler — no new providers, anomaly state co-located with sensor state it modifies |
| CSS injection via style tag | Tailwind arbitrary animation classes | Tailwind purges custom keyframe names at build — style injection is the established workaround in this codebase |
| Module-scope `getAnomalyBias()` reading store | Passing bias as parameter to tick() | Store read in engine is already the pattern (engine.ts calls `useHabitatStore.getState()` directly); passing parameter would require threading through ZONE_CONFIGS loop |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
spatialhub-frontend/src/
├── simulation/
│   ├── engine.ts             # Modify: add anomaly bias injection into computeNewValue()
│   └── anomalies.ts          # New: scenario definitions, bias curves, getAnomalyBias()
├── store/
│   └── habitatStore.ts       # Modify: add anomaly state + triggerAnomaly/cancelAnomaly actions
├── types/
│   └── habitat.ts            # Modify: extend HabitatState with AnomalyScenarioState
└── components/habitat/
    └── AnomalyDrawer.tsx     # New: collapsible trigger panel + scenario announcement banner
```

### Pattern 1: Anomaly State Shape in Zustand

**What:** Extend `HabitatState` with per-scenario tracking. Each running scenario has a `phase` (onset/peak/recovery), a `ticksInPhase` counter, and derived `biasFactor` (0..1). The engine reads this at tick time.

**When to use:** Any time the engine needs to know how strongly to bias a sensor.

```typescript
// In types/habitat.ts

export type AnomalyPhase = 'onset' | 'peak' | 'recovery' | 'idle';

export interface AnomalyScenarioState {
  phase: AnomalyPhase;
  ticksInPhase: number;
  biasFactor: number; // 0 = no effect, 1 = full crisis bias
}

// AnomalyState: keyed by scenario ID
export type AnomalyState = Record<string, AnomalyScenarioState>;

// Extend HabitatState:
export interface HabitatState {
  // ... existing fields ...
  anomalies: AnomalyState;
  triggerAnomaly: (scenarioId: string) => void;
  cancelAnomaly: (scenarioId: string) => void;
  tickAnomalies: () => void; // called inside tick() to advance phase timers
}
```

### Pattern 2: Scenario Definitions File

**What:** `src/simulation/anomalies.ts` contains the 4 scenario definitions as a typed constant, and the `getAnomalyBias()` function that returns per-sensor bias deltas for injection into `computeNewValue()`.

**When to use:** Engine reads this every tick to determine bias; AnomalyDrawer reads scenario metadata for UI labels.

```typescript
// In simulation/anomalies.ts

export interface SensorBias {
  sensorId: string;
  // Additive delta at biasFactor=1 (full crisis). Engine lerps: delta * biasFactor
  crisisDelta: number;
}

export interface AnomalyScenario {
  id: string;
  label: string;
  icon: string;
  zoneId: string;
  zoneName: string;
  sensorBiases: SensorBias[];
  // Phase durations in ticks (1 tick = 2s)
  onsetTicks: number;   // ~5 ticks = 10s onset
  peakTicks: number;    // ~7 ticks = 14s peak
  recoveryTicks: number; // ~5 ticks = 10s recovery
}

export const ANOMALY_SCENARIOS: AnomalyScenario[] = [
  {
    id: 'co2-spike',
    label: 'CO2 Spike',
    icon: '\u{1F32B}',
    zoneId: 'grow-bays',
    zoneName: 'Grow Bays',
    onsetTicks: 5,
    peakTicks: 7,
    recoveryTicks: 5,
    sensorBiases: [
      { sensorId: 'gb-co2',      crisisDelta: +3500 }, // push toward 4300ppm (red: max 5000)
      { sensorId: 'gb-temp',     crisisDelta: +18  }, // heat from CO2 buildup, push toward 40C
      { sensorId: 'gb-humidity', crisisDelta: -30  }, // dryness from heat
    ],
  },
  {
    id: 'pump-failure',
    label: 'Pump Failure',
    icon: '\u{1F4A7}',
    zoneId: 'water-recycling',
    zoneName: 'Water Recycling',
    onsetTicks: 5,
    peakTicks: 7,
    recoveryTicks: 5,
    sensorBiases: [
      { sensorId: 'wr-flow', crisisDelta: -3.5 }, // push toward 0 L/min (red: min 0)
      { sensorId: 'wr-ph',   crisisDelta: +3.5 }, // pH swings alkaline, push toward 10
      { sensorId: 'wr-tds',  crisisDelta: +900 }, // mineral concentration, push toward 1300
    ],
  },
  {
    id: 'nutrient-crash',
    label: 'Nutrient Crash',
    icon: '\u{1F9EA}',
    zoneId: 'water-recycling',
    zoneName: 'Water Recycling',
    onsetTicks: 5,
    peakTicks: 7,
    recoveryTicks: 5,
    sensorBiases: [
      { sensorId: 'wr-tds',  crisisDelta: -380 }, // TDS collapses toward 20ppm (red: min 0)
      { sensorId: 'wr-ph',   crisisDelta: -2.5 }, // acidic crash, push toward 4.3
    ],
  },
  {
    id: 'power-fluctuation',
    label: 'Power Flux',
    icon: '\u26A1',
    zoneId: 'power-thermal',
    zoneName: 'Power & Thermal',
    onsetTicks: 5,
    peakTicks: 7,
    recoveryTicks: 5,
    sensorBiases: [
      { sensorId: 'pt-power',   crisisDelta: -65 },  // drop to ~35kW (red: min 30)
      { sensorId: 'pt-battery', crisisDelta: -62 },  // deplete to ~16% (red: min 10)
      { sensorId: 'pt-coolant', crisisDelta: +45 },  // heat buildup toward 69C (red: max 80)
    ],
  },
];

// Lookup: sensorId -> crisisDelta for all active scenarios
export function getAnomalyBias(
  anomalies: AnomalyState,
  sensorId: string
): number {
  let totalBias = 0;
  for (const scenario of ANOMALY_SCENARIOS) {
    const state = anomalies[scenario.id];
    if (!state || state.phase === 'idle' || state.biasFactor === 0) continue;
    const bias = scenario.sensorBiases.find((b) => b.sensorId === sensorId);
    if (bias) {
      totalBias += bias.crisisDelta * state.biasFactor;
    }
  }
  return totalBias;
}
```

### Pattern 3: Engine Modifier Injection

**What:** Modify `computeNewValue()` to accept an optional `anomalyBias` parameter. In the `tick()` function, call `getAnomalyBias()` (reading store state) and pass it in.

**When to use:** Every tick, for every sensor.

```typescript
// In engine.ts (modified computeNewValue signature)
function computeNewValue(
  currentValue: number,
  sensorId: string,
  solElapsed: number,
  anomalyBias: number = 0   // additive; 0 = no anomaly effect
): number {
  // ... existing drift + noise + sol computation ...
  const raw = currentValue + drift + noise + sol + anomalyBias;
  return clamp(raw, sensorId);
}

// In tick() function, add before computing rawValues:
const { anomalies } = state;

// Then pass bias per sensor:
rawValues[sensor.sensorId] = computeNewValue(
  current?.value ?? sensor.nominalValue,
  sensor.sensorId,
  solElapsed,
  getAnomalyBias(anomalies, sensor.sensorId)
);
```

### Pattern 4: biasFactor Lerp via ticksInPhase

**What:** `tickAnomalies()` is called at the END of each `tick()` dispatch. It advances each active scenario's phase timer and recomputes `biasFactor`.

```typescript
// biasFactor computation per phase:
// onset:   biasFactor = ticksInPhase / scenario.onsetTicks  (ramps 0 -> 1)
// peak:    biasFactor = 1.0                                 (holds at crisis)
// recovery: biasFactor = 1 - (ticksInPhase / scenario.recoveryTicks) (ramps 1 -> 0)
// idle:    biasFactor = 0

function computeBiasFactor(phase: AnomalyPhase, ticksInPhase: number, scenario: AnomalyScenario): number {
  switch (phase) {
    case 'onset':    return Math.min(1, ticksInPhase / scenario.onsetTicks);
    case 'peak':     return 1.0;
    case 'recovery': return Math.max(0, 1 - ticksInPhase / scenario.recoveryTicks);
    case 'idle':     return 0;
  }
}
```

### Pattern 5: Scenario Announcement Banner

**What:** A separate banner variant fired imperatively from `triggerAnomaly()` via a Zustand action that appends to a queue of scenario announcements. `AnomalyDrawer` (or a sibling `ScenarioAnnouncement` component) renders this queue and auto-dismisses entries after 8 seconds.

**Alternative (simpler):** Store a `scenarioAnnouncements: ScenarioAnnouncement[]` array in Zustand. AnomalyDrawer renders it. Each entry auto-dismisses via setTimeout in the component.

**Recommended:** Keep announcement state in the Zustand store (not component-local) so it survives re-renders and can be triggered from actions. Use the CSS injection pattern from AlertBanner for the slide-down animation.

```typescript
// Announcement banner styling — wider and bolder than AlertBanner
// borderLeft: `4px solid ${ZONE_ACCENT_COLORS[scenario.zoneId]}`  (zone color, not red)
// minWidth: '380px'
// fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em'
// content: `SCENARIO.LABEL DETECTED — ZONE.NAME`
// auto-dismiss: 8000ms setTimeout
```

### Pattern 6: AnomalyDrawer Layout

**What:** Fixed-position drawer at bottom-center. Toggle button always visible. Drawer slides up from the button when open. Glassmorphism matches HUD/ZonePanel.

```typescript
// Toggle button — small, bottom-center, always visible
// position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)'
// pointerEvents: 'auto'

// Drawer — slides up from button when open
// @keyframes drawerSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
// Bottom-anchor position: bottom: '4rem' (just above toggle button)
// Width: auto (4 buttons in a row), padding: '12px 16px'

// Scenario button state:
// active:   background: 'rgba(255,34,0,0.15)', border: '1px solid #ff2200', animation: buttonPulse
// inactive: background: 'transparent', border: '1px solid rgba(255,255,255,0.15)'
// @keyframes buttonPulse { 0%,100% { box-shadow: 0 0 6px rgba(255,34,0,0.3) } 50% { box-shadow: 0 0 14px rgba(255,34,0,0.7) } }
```

### Anti-Patterns to Avoid

- **Reading anomaly state inside `computeNewValue()` directly:** `computeNewValue()` does not have store access — keep it a pure function, pass bias as parameter.
- **Storing anomaly state outside Zustand:** If anomaly state lives in a module-scope variable (not store), AnomalyDrawer cannot subscribe to it reactively — buttons won't update.
- **Calling `tickAnomalies()` before applying biases:** Bias must be applied with the CURRENT tick's bias factor, then `tickAnomalies()` advances to next tick's factor. Call `tickAnomalies()` AFTER reading `anomalies` for bias, at end of `tick()`.
- **Overriding current sensor value instead of biasing it:** Snapping values defeats ANOM-03 (gradual onset). Always bias additively — let the existing clamp handle extremes.
- **Using a new Zustand slice/store:** This codebase uses a single `useHabitatStore` store. Adding a second store creates import coordination problems. Extend HabitatState instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS slide animation | Manual JS transform transitions | CSS keyframe injection (AlertBanner pattern) | Smooth GPU-accelerated, no JS frame loop needed |
| Alert auto-dismiss | Custom timer class | `setTimeout` in useEffect (AlertBanner pattern) | Same pattern already proven stable in this codebase |
| Scenario persistence | LocalStorage / backend | In-memory Zustand state only | REQUIREMENTS.md explicitly rules out database-backed anomaly history |
| Phase timer advancement | `setInterval` | Advance counter inside existing `tick()` call | One tick interval already runs — piggyback on it, don't add another |

**Key insight:** The simulation engine's 2-second tick is the clock. Anomaly phase advancement is measured in ticks, not wall-clock milliseconds. This means the anomaly system is automatically synchronized with sensor value updates — no timing drift.

## Common Pitfalls

### Pitfall 1: Scenario Announcement Banner conflicts with AlertBanner

**What goes wrong:** Scenario announcements and threshold alerts are both at top-center. If rendered as children of AlertBanner they compete for slots in the MAX_VISIBLE_ALERTS=5 cap.

**Why it happens:** AlertBanner is self-contained and doesn't expose an injection point.

**How to avoid:** Render scenario announcements SEPARATELY from AlertBanner — either as a distinct component positioned slightly differently (e.g., `top: '1.5rem'` for alerts, `top: '0.5rem'` for scenario banners, or use a different vertical offset). They should coexist visually, not share the same queue.

**Warning signs:** Scenario announcement immediately evicted by a flood of threshold alerts when anomaly triggers.

### Pitfall 2: biasFactor Overcorrection at Phase Boundaries

**What goes wrong:** When transitioning onset->peak, `biasFactor` snaps from computed ratio to 1.0, causing a visible value jump on the tick boundary.

**Why it happens:** Integer tick counting creates step boundaries.

**How to avoid:** At the end of onset phase (ticksInPhase >= onsetTicks), set biasFactor = 1.0 before transitioning to 'peak'. This is what the formula already does if `Math.min(1, ticksInPhase / onsetTicks)` — double check the transition logic clamps at 1 before phase flip.

### Pitfall 3: Concurrent Pump Failure + Nutrient Crash (same zone)

**What goes wrong:** Both scenarios bias `wr-ph` in opposite directions simultaneously — pump failure pushes pH alkaline, nutrient crash pushes pH acidic. `getAnomalyBias()` sums both deltas, potentially canceling the effect.

**Why it happens:** Design allows concurrent scenarios; two scenarios share water-recycling zone.

**How to avoid:** This is acceptable and realistic (multi-system failure creates chaotic readings). The `wr-flow` drop from pump failure and `wr-tds` drop from nutrient crash will both still be visible. Document this as intentional behavior.

**Warning signs:** pH appears suspiciously stable during dual water-recycling anomaly.

### Pitfall 4: Button Visual State Lagging Behind Store

**What goes wrong:** User clicks a scenario button; the button's active state doesn't update immediately because it's subscribed to `anomalies[scenarioId].phase` which updates on the next tick (2 seconds).

**Why it happens:** `triggerAnomaly()` sets phase to 'onset' synchronously in Zustand — but if the component re-renders aren't flushed before the next event loop, there's a perceived lag.

**How to avoid:** `triggerAnomaly()` is a synchronous Zustand `set()` call — React will batch and re-render before the next tick. The button should update immediately. However, verify by ensuring the button reads from `anomalies[scenarioId]?.phase` directly from the store, not from a local useState.

### Pitfall 5: `tickAnomalies()` Called Outside `tick()` Causes Double-Advance

**What goes wrong:** If `tickAnomalies()` is accidentally wired to a useEffect or a second interval, anomaly phases advance twice per simulation tick, halving the apparent duration.

**Why it happens:** Anomaly phase advancement looks like it needs its own timer.

**How to avoid:** Call `tickAnomalies()` ONLY from inside the engine's `tick()` function, via `state.tickAnomalies()` at the end of the tick dispatch, exactly like `state.tick(newReadings)` is called today.

## Code Examples

Verified patterns from existing codebase (HIGH confidence — source: read directly from code):

### Zustand Store Pattern (from habitatStore.ts)
```typescript
// Engine reads store state directly — anomaly state follows same access pattern
function tick(): void {
  const state = useHabitatStore.getState();
  const { zones, solElapsed, anomalies } = state;  // <-- add anomalies here
  // ...
  state.tick(newReadings);
  state.tickAnomalies();  // <-- advance phase timers after applying current tick's bias
}
```

### CSS Keyframe Injection Pattern (from AlertBanner.tsx)
```typescript
const ANIMATION_ID = 'anomaly-drawer-animations';

function ensureAnimationsInjected() {
  if (document.getElementById(ANIMATION_ID)) return;
  const style = document.createElement('style');
  style.id = ANIMATION_ID;
  style.textContent = `
    @keyframes drawerSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes scenarioBtnPulse {
      0%, 100% { box-shadow: 0 0 6px rgba(255,34,0,0.3); }
      50%       { box-shadow: 0 0 14px rgba(255,34,0,0.7); }
    }
  `;
  document.head.appendChild(style);
}
```

### Glassmorphism Pattern (from AlertBanner.tsx)
```typescript
// Consistent glassmorphism — use these exact values
background: 'rgba(10, 12, 18, 0.85)',
backdropFilter: 'blur(12px)',
WebkitBackdropFilter: 'blur(12px)',
borderRadius: '8px',
```

### Overlay Pointer Events Pattern (from HabitatView.tsx)
```typescript
// Container: pointer-events: none
// Interactive children: pointer-events: auto
// AnomalyDrawer follows same pattern — drawer rendered in the existing overlay div
<div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
  <HabitatHUD />
  <AlertBanner />
  <AnomalyDrawer />   {/* add here — always rendered, manages its own open/closed state */}
  {selectedZoneId && <ZonePanel ... />}
</div>
```

### Zustand Store Extension Pattern
```typescript
// In habitatStore.ts — add to create() call
triggerAnomaly: (scenarioId: string) => {
  set((state) => ({
    anomalies: {
      ...state.anomalies,
      [scenarioId]: {
        phase: 'onset',
        ticksInPhase: 0,
        biasFactor: 0,
      },
    },
    // Also push to scenario announcements queue
    scenarioAnnouncements: [
      ...state.scenarioAnnouncements,
      { scenarioId, timestamp: Date.now() },
    ],
  }));
},

cancelAnomaly: (scenarioId: string) => {
  set((state) => {
    const current = state.anomalies[scenarioId];
    if (!current || current.phase === 'idle') return {};
    return {
      anomalies: {
        ...state.anomalies,
        [scenarioId]: {
          phase: 'recovery',
          ticksInPhase: 0,
          biasFactor: current.biasFactor,  // start recovery from current bias level
        },
      },
    };
  });
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Binary anomaly toggle | Phase-based timer with biasFactor lerp | Phase 4 design decision | ANOM-03: gradual onset/recovery |
| Separate anomaly store | HabitatState extension | Phase 4 design decision | Avoids multi-store coordination; anomaly state co-located with sensor state |

**Deprecated/outdated:**
- None — this is a new system.

## Open Questions

1. **Should `pump-failure` and `nutrient-crash` share the water-recycling zone and be independently triggerable?**
   - What we know: Both are in water-recycling per CONTEXT.md; concurrent scenarios are allowed
   - What's unclear: Whether simultaneous triggering of both is considered a supported UI path or an edge case
   - Recommendation: Support it — the interactive chaos is a feature for demo audiences. Document pH cancellation behavior.

2. **Exact scenario announcement banner position relative to AlertBanner**
   - What we know: AlertBanner is at `top: 1.5rem, left: 50%`. Scenario banners need to coexist.
   - What's unclear: Whether they should stack in the same column or appear in a separate area
   - Recommendation: Position scenario banners above regular alerts (`top: 0.5rem`) with larger width. They auto-dismiss in 8s before alert stack can get crowded.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed — no vitest/jest config detected in spatialhub-frontend |
| Config file | None — see Wave 0 |
| Quick run command | `npm run lint` (TypeScript + ESLint is the only automated check) |
| Full suite command | `npm run build` (tsc -b compilation catches type errors) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANOM-01 | triggerAnomaly() sets phase to 'onset' in store | manual | Browser DevTools: `window.__habitatStore.getState().anomalies` | No test file — verify via dev console |
| ANOM-01 | AnomalyDrawer renders 4 scenario buttons | manual | Visual inspection at /habitat | No test file |
| ANOM-02 | Triggering CO2 spike causes gb-co2 to climb to red within 10s | manual | Visual: zone dome pulses red; ZonePanel shows rising sparkline | No test file |
| ANOM-02 | Scenario announcement banner appears immediately on trigger | manual | Visual inspection | No test file |
| ANOM-03 | biasFactor lerps 0->1 over 5 ticks on onset | manual | `window.__habitatStore.getState().anomalies['co2-spike'].biasFactor` per tick | No test file |
| ANOM-03 | Recovery brings sensors back to green within ~10s after cancel | manual | Visual: dome returns to green/accent color | No test file |

### Sampling Rate
- **Per task commit:** `cd spatialhub-frontend && npm run build` (TypeScript compilation)
- **Per wave merge:** `npm run build && npm run lint`
- **Phase gate:** Full build green + manual browser walkthrough before `/gsd:verify-work`

### Wave 0 Gaps
- No test framework installed — all validation is manual + TypeScript compilation
- `window.__habitatStore` dev exposure (already implemented in habitatStore.ts) enables console-based verification of anomaly state transitions
- No Wave 0 test file infrastructure needed — manual validation is the established pattern for this project

## Sources

### Primary (HIGH confidence)
- Direct code read: `spatialhub-frontend/src/simulation/engine.ts` — tick loop, computeNewValue signature, clamp/status derivation
- Direct code read: `spatialhub-frontend/src/store/habitatStore.ts` — Zustand store shape, HabitatState interface, module-scope engine pattern
- Direct code read: `spatialhub-frontend/src/types/habitat.ts` — HabitatState interface
- Direct code read: `spatialhub-frontend/src/components/habitat/AlertBanner.tsx` — CSS injection pattern, glassmorphism values, pointer-events pattern
- Direct code read: `spatialhub-frontend/src/simulation/constants.ts` — all sensor IDs, threshold ranges, nominal values
- Direct code read: `spatialhub-frontend/src/pages/HabitatView.tsx` — overlay structure, component mounting pattern
- Direct code read: `spatialhub-frontend/src/components/habitat/HabitatStructure.tsx` — ZONE_ACCENT_COLORS map
- Direct code read: `spatialhub-frontend/src/components/habitat/HabitatDome.tsx` — status-reactive rim animation (red pulsing at 2Hz)
- Direct code read: `.planning/phases/04-anomaly-system/04-CONTEXT.md` — locked decisions and discretion areas
- Direct code read: `.planning/config.json` — nyquist_validation: true

### Secondary (MEDIUM confidence)
- None required — all critical information sourced from direct code inspection.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use; no new dependencies
- Architecture: HIGH — all patterns derived from direct code reading; no speculation
- Pitfalls: HIGH — identified from concrete code-level analysis of existing patterns and scenario interactions
- Modifier math (bias deltas): MEDIUM — `crisisDelta` values calculated from threshold ranges in constants.ts; exact values are Claude's discretion per CONTEXT.md and may need tuning for feel

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (stable — no external dependencies changing)
