# Requirements: SpatialHub Mars Habitat Demo

**Defined:** 2026-03-09
**Core Value:** The 3D habitat visualization with live sensor data must feel real, responsive, and visually impressive enough to make someone say "this could actually run a Mars greenhouse."

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### 3D Scene

- [x] **SCENE-01**: User sees a 3D procedural habitat with orbit controls on `/habitat` route
- [x] **SCENE-02**: Habitat has four visually distinct zone meshes (Grow Bays, Atmosphere, Water Recycling, Power/Thermal)
- [x] **SCENE-03**: Scene has environmental lighting (ambient + directional) with dark mission-control aesthetic
- [x] **SCENE-04**: Active elements glow with selective bloom post-processing

### Simulation

- [x] **SIM-01**: Simulated telemetry generates realistic Mars habitat sensor values on a 2-second tick
- [x] **SIM-02**: Zone status is derived from sensor thresholds (green/yellow/red) and reflected on zone meshes
- [ ] **SIM-03**: Sensor values show rolling sparkline trend charts (last 30-60 seconds)

### Interaction

- [x] **INT-01**: User can hover zones to see highlight effect
- [x] **INT-02**: User can click a zone to select it and trigger smooth camera transition
- [x] **INT-03**: Sensor nodes are visible as 3D markers at positions within zones

### UI Panels

- [ ] **UI-01**: Selected zone shows a detail panel with live sensor readings updating in real time
- [ ] **UI-02**: Alert/warning banners appear during anomalous conditions
- [ ] **UI-03**: HUD-style glassmorphism overlay shows system overview (sol count, habitat status, active sensors)

### Anomaly

- [ ] **ANOM-01**: User can trigger anomaly scenarios (CO2 spike, pump failure, nutrient crash, power fluctuation)
- [ ] **ANOM-02**: Anomalies produce visual drama (flashing zones, alert escalation, sensor value spikes)
- [ ] **ANOM-03**: Anomalies have gradual onset and recovery curves (not binary toggles)

### Backend

- [x] **API-01**: Django models and API endpoints serve habitat zone and sensor configuration
- [x] **API-02**: Fix double `/api/api/` path bug in existing frontend API client

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Environment

- **ENV-01**: Mars exterior environment with skybox, terrain plane, and atmospheric fog
- **ENV-02**: Particle effects for dust and atmosphere

### Polish

- **POL-01**: Keyboard shortcuts for zone navigation (1-4, Space to reset)
- **POL-02**: Sound design with ambient hum and anomaly alert tones
- **POL-03**: Loading boot-up sequence animation
- **POL-04**: System health timeline showing recent events
- **POL-05**: Animated data flow particles along pipes

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Realistic GLTF habitat model | Procedural geometry with good materials looks more futuristic; asset prep is a time sink |
| Physics simulation | Zero value for a monitoring dashboard |
| User authentication | Portfolio demo — not needed |
| Mobile responsive 3D | Desktop-first; touch controls and mobile GPU perf not worth the effort |
| Database-backed anomaly history | Anomalies are transient demo events per PROJECT.md |
| WebSocket backend | Simulated data runs in-browser; no Django Channels needed |
| VR/AR mode | 99% of reviewers use normal browsers |
| Custom GLSL shaders for everything | MeshStandardMaterial with good params is sufficient; save shaders for bloom |
| Multi-language / i18n | It's a demo |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| API-01 | Phase 1 | Complete |
| API-02 | Phase 1 | Complete |
| SIM-01 | Phase 1 | Complete |
| SIM-02 | Phase 1 | Complete |
| SCENE-01 | Phase 2 | Complete |
| SCENE-02 | Phase 2 | Complete |
| SCENE-03 | Phase 2 | Complete |
| SCENE-04 | Phase 2 | Complete |
| INT-01 | Phase 2 | Complete |
| INT-02 | Phase 2 | Complete |
| INT-03 | Phase 2 | Complete |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| SIM-03 | Phase 3 | Pending |
| ANOM-01 | Phase 4 | Pending |
| ANOM-02 | Phase 4 | Pending |
| ANOM-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 — Traceability updated after roadmap creation*
