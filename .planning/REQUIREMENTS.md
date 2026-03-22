# Requirements: SpatialHub Mars Habitat Revamp

**Defined:** 2026-03-21
**Core Value:** The 3D habitat visualization with live sensor data must feel real, responsive, and visually impressive enough to make someone say "this could actually run a Mars greenhouse."

## v4.0 Requirements

Requirements for the ambient TV dashboard milestone. Each maps to roadmap phases.

### Layout

- [x] **LAYOUT-01**: Dashboard replaces `/habitat` as a non-interactive full-viewport TV display (zero click/hover/touch)
- [x] **LAYOUT-02**: Priority grid with hero slot (large, 2-col span) for most critical zone + 3 smaller secondary cards
- [x] **LAYOUT-03**: Criticality scoring algorithm ranks zones by `(red_count * 10) + (yellow_count * 3)` with stable tie-breaking
- [ ] **LAYOUT-04**: Zones animate into ranked positions via FLIP when criticality threshold crossings occur (10s debounce)

### Data Display

- [x] **DATA-01**: Each zone card shows live sensor values with TV-safe typography (48px+ primary, 24px+ labels)
- [x] **DATA-02**: Each zone card includes sparkline chart of primary sensor's 60-point history
- [x] **DATA-03**: Sol elapsed counter displayed prominently in HUD
- [x] **DATA-04**: Connection source badge shows active data source (BioSim / Pi Sensor / Client Sim)

### Status

- [x] **STAT-01**: Full-width status summary bar derives worst-case zone status ("ALL NOMINAL" or specific alert message)
- [x] **STAT-02**: Red-status zone cards pulse with animated border/glow to signal critical conditions

### Visual

- [ ] **VIS-01**: Three.js parallax background layer with auto-drifting geometry behind the grid (separate Canvas, no interaction)

## Future Requirements

Deferred to v4.1+. Tracked but not in current roadmap.

### Layout Presets

- **PRESET-01**: Multiple TV layout modes (2-up, 4-up equal grid, single-zone focus)
- **PRESET-02**: Kiosk URL param (`?zone=water-recycling`) locks to one zone full-screen

### Multi-Display

- **MULTI-01**: Second-screen split — TV shows overview, tablet shows drilldown

## Out of Scope

| Feature | Reason |
|---------|--------|
| Click/hover/touch interaction | TV wall display — no operator input |
| Mouse-driven parallax | No mouse on TV — auto-drift only |
| AnomalyDrawer on TV route | Breaks non-interactive contract; use `/habitat` for triggering |
| Glassmorphism on zone cards | Reduces contrast at TV viewing distance; solid dark cards with strong borders |
| Animated number counters | Unreadable mid-animation from 3m; instant value swap instead |
| 1-second chart updates | Causes jank at TV resolution; 2-5s repaint sufficient |
| Continuous layout reorder every tick | Visually exhausting; debounce to threshold crossings + 10s cooldown |
| Direct BioSim WebSocket on TV route | habitatStore already fed by existing WS; no duplicate connection |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAYOUT-01 | Phase 17 | Complete |
| LAYOUT-03 | Phase 17 | Complete |
| LAYOUT-02 | Phase 18 | Complete |
| DATA-01 | Phase 18 | Complete |
| DATA-02 | Phase 18 | Complete |
| DATA-03 | Phase 18 | Complete |
| DATA-04 | Phase 18 | Complete |
| STAT-01 | Phase 18 | Complete |
| STAT-02 | Phase 18 | Complete |
| LAYOUT-04 | Phase 19 | Pending |
| VIS-01 | Phase 20 | Pending |

**Coverage:**
- v4.0 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 — traceability updated after roadmap creation*
