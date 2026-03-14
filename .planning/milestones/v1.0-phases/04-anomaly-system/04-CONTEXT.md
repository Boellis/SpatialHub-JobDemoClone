# Phase 4: Anomaly System - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

User-triggerable crisis scenarios that override normal simulation drift, pushing specific zone sensors into crisis ranges with gradual onset and recovery curves. Four named scenarios (CO2 spike, pump failure, nutrient crash, power fluctuation), a trigger control panel, scenario-level alert announcements, and toggle-to-cancel behavior. No new 3D visual effects beyond what Phase 2 already provides — anomalies leverage existing status-reactive dome pulsing and Phase 3 alert infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Trigger Control Panel
- Bottom-center collapsible drawer, toggled by a small button at the bottom edge of the screen
- Starts collapsed — keeps the immersive feel clean until the user wants to trigger something
- Contains 4 scenario buttons in a horizontal row with icon + short label (e.g., "🌫 CO2 Spike", "💧 Pump Failure", "🧪 Nutrient Crash", "⚡ Power Flux")
- Drawer has a close [✕] button; opens with slide-up animation
- Glassmorphism styling consistent with HUD and ZonePanel

### Scenario Button Behavior
- Toggle behavior: click to trigger anomaly, click again to cancel early and start recovery
- Button glows/pulses red while scenario is active
- Button returns to dim/outlined state when recovery starts
- No countdown timer or progress bar — just active indicator on button

### Scenario Pacing
- Onset: ~8-10 seconds (4-5 simulation ticks) gradual ramp from nominal → yellow → red
- Peak: ~10-15 seconds sustained at crisis values
- Recovery: ~10 seconds gradual drift back to nominal after auto-timeout or manual cancel
- Total scenario arc: ~30 seconds
- Auto-timeout: anomaly automatically begins recovering after peak duration — user doesn't have to manually stop it
- Early cancel: user clicks toggle to skip to recovery phase immediately

### Concurrent Scenarios
- Multiple scenarios can run simultaneously — each tracks independently
- E.g., CO2 Spike + Power Fluctuation at once = multi-zone crisis
- Each scenario has its own onset/peak/recovery timer

### Zone Scope
- Each scenario affects only its primary zone — no cross-zone cascading
- CO2 Spike → Grow Bays sensors only (CO2 ↑↑, temperature ↑, humidity ↓)
- Pump Failure → Water Recycling sensors only (flow ↓↓, pH swings, TDS destabilizes)
- Nutrient Crash → Water Recycling sensors only (TDS ↓↓ or pH swing)
- Power Fluctuation → Power/Thermal sensors only (power ↓↓, battery ↓, coolant ↑)
- Intra-zone correlations from existing engine.ts `applyCorrelations()` still apply during anomalies

### Visual Drama
- No extra visual effects beyond existing Phase 2 status-reactive behavior
- Dome rim already pulses red at 2Hz and lerps accent color toward red on `red` status — this fires naturally when anomaly pushes sensors into red
- No screen vignette, no bloom changes, no ambient light changes
- No auto-camera focus on affected zone — user stays in control of camera

### Alert Escalation
- Scenario-level announcement banner fires immediately when anomaly triggers
- Styled differently from regular sensor alerts: wider, bolder, zone accent color left border (not red/yellow)
- Content: "⚠ CO2 SPIKE DETECTED — Grow Bays" (scenario name + affected zone)
- Auto-dismisses after ~8 seconds
- Regular per-sensor threshold alerts (existing AlertBanner) fire naturally as sensors cross thresholds during onset
- No special 'ANOMALY ACTIVE' indicator in HUD — HUD reflects zone status naturally (worst-zone-status logic already exists)

### Recovery Behavior
- Silent recovery — no 'ALL CLEAR' or 'RESOLVED' notification
- Visual de-escalation IS the notification: dome calms, alerts auto-clear, panel values trend down
- Button stops pulsing when recovery starts

### Claude's Discretion
- Exact anomaly modifier math (bias curves, how strongly to push sensors)
- Scenario announcement banner CSS details (width, animation, font weight)
- Drawer toggle button icon/styling
- Drawer slide-up animation implementation
- How anomaly state integrates with Zustand store (new slice vs extending existing)
- Whether to modify engine.ts tick function or inject anomaly modifiers separately

</decisions>

<specifics>
## Specific Ideas

- The anomaly system should feel like a "demo button" — a portfolio reviewer clicks it and watches the system respond dramatically, then recover gracefully
- Leverage existing infrastructure maximally — the dome pulsing, alert banners, zone panels, and sparklines all react to sensor state already. The anomaly system just needs to force sensors into crisis ranges.
- The ~30 second total arc (onset + peak + recovery) should be long enough to observe and appreciate, short enough to not bore a demo audience
- Multiple simultaneous anomalies should create a genuinely impressive multi-zone crisis moment

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `simulation/engine.ts`: `computeNewValue()` applies drift + noise + sol cycle — anomaly modifiers can layer on top of this computation
- `simulation/engine.ts`: `applyCorrelations()` handles intra-zone sensor correlations — these continue during anomalies for realistic multi-sensor effects
- `store/habitatStore.ts`: Zustand store with `tick()`, `zones`, `selectedZoneId` — anomaly state can extend this store
- `components/habitat/AlertBanner.tsx`: Toast stack with deduplication (10s cooldown), red/yellow styling — scenario announcement banners fit alongside this
- `components/habitat/HabitatStructure.tsx`: `ZONE_ACCENT_COLORS` map — scenario banners use these for zone-colored borders
- `components/habitat/HabitatDome.tsx`: Status-reactive dome glow with red pulsing at 2Hz, lerp toward red — fires automatically when anomaly pushes zone to `red` status
- `components/habitat/HabitatHUD.tsx`: Overall status = worst zone status — reflects anomaly impact automatically
- `types/habitat.ts`: `HabitatState` interface — needs extension for anomaly state

### Established Patterns
- Glassmorphism styling: `rgba(10, 12, 18, 0.85)` background + `backdrop-filter: blur(12px)` — used in HUD, ZonePanel, AlertBanner
- CSS keyframe animations injected as style tags (AlertBanner pattern) — drawer animations can follow this
- Module-scope engine instance with lazy import to break circular deps (store ↔ engine)
- `pointer-events: none` on overlay containers, `pointer-events: auto` on interactive elements

### Integration Points
- `simulation/engine.ts`: `computeNewValue()` needs anomaly modifier injection point — bias sensor values toward crisis ranges when anomaly is active
- `store/habitatStore.ts`: Add anomaly state (active scenarios, phase per scenario) and actions (triggerAnomaly, cancelAnomaly)
- `components/habitat/AlertBanner.tsx`: Add scenario announcement banner support (different styling, fired on anomaly trigger, not on threshold cross)
- New files: `src/components/habitat/AnomalyDrawer.tsx` (trigger panel), possibly `src/simulation/anomalies.ts` (scenario definitions and modifier logic)
- `pages/HabitatView.tsx`: Add AnomalyDrawer as sibling overlay in the pointer-events: none container

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-anomaly-system*
*Context gathered: 2026-03-13*
