# SpatialHub: Mars Habitat Demo

## What This Is

A visually stunning demo that reimagines SpatialHub — an existing IoT telemetry platform for indoor farming — as a Martian habitat monitoring system. Users open the app and see a 3D interactive Three.js rendering of a Mars greenhouse habitat. They can orbit, zoom, and click into four distinct zones (Grow Bays, Atmosphere Control, Water Recycling, Power/Thermal), each streaming simulated real-time sensor telemetry. A built-in anomaly simulator lets users trigger crises (CO2 spikes, pump failures) and watch the system detect, alert, and respond with visual drama — flashing zones, warning panels, status changes.

## Core Value

The 3D habitat visualization with live sensor data is the centerpiece — it must feel real, responsive, and visually impressive enough to make someone say "this could actually run a Mars greenhouse."

## Requirements

### Validated

<!-- Existing capabilities from current codebase -->

- ✓ Sensor data ingestion via Pub/Sub pipeline — existing
- ✓ Raw and enriched sensor data storage in PostgreSQL — existing
- ✓ Django REST API serving sensor data (raw, enriched, hub config) — existing
- ✓ Hub provisioning with auto-generated IDs — existing
- ✓ Command dispatch to hubs via Pub/Sub — existing
- ✓ React SPA with client-side routing — existing
- ✓ Sensor data table views with client-side pagination — existing
- ✓ Sensor trends charting with Recharts — existing
- ✓ Device simulation page — existing

### Active

<!-- What we're building for this demo -->

- [ ] 3D interactive Three.js habitat visualization on new `/habitat` route
- [ ] Four clickable habitat zones: Grow Bays, Atmosphere, Water Recycling, Power/Thermal
- [ ] Simulated real-time Mars habitat telemetry (atmospheric, hydroponic, water quality, power sensors)
- [ ] Zone drill-down panels showing live sensor feeds when a zone is clicked
- [ ] Color-coded zone status indicators (green/yellow/red) based on sensor thresholds
- [ ] Anomaly simulation system — trigger events like CO2 spikes, pump failures, nutrient crashes
- [ ] Alert/warning UI — flashing zones, warning panels, status changes during anomalies
- [ ] New Django API endpoints for habitat zones and Mars-context sensors
- [ ] Fix existing backend bugs (double `/api/api/` path, missing pagination)
- [ ] Simulated data stream generator producing realistic Mars habitat telemetry

### Out of Scope

- Real hardware integration / actual Raspberry Pi changes — demo only
- Authentication / authorization — not needed for portfolio demo
- Mobile-responsive 3D experience — desktop-first
- Multiplayer / collaborative viewing — single user
- Persistent anomaly history / incident logs — anomalies are transient demo events
- Replacing existing pages — new `/habitat` route sits alongside existing views

## Context

- **Brownfield project:** Existing IoT telemetry platform with Django + React + GCP infrastructure. The 3D habitat is a new feature layer on top.
- **Codebase state:** Several known bugs (double API path, enrich subscriber error handling, hardcoded sensor names) and tech debt (no tests, hardcoded URLs, `any` types). Backend bugs on the critical path will be fixed; others are out of scope.
- **Existing frontend deps:** React 19, Vite, Recharts, axios, react-router-dom, @tanstack/react-query (installed but unused). Three.js will be added.
- **Mars habitat sensors** will be simulated — not coming from real hardware. The simulation should produce realistic-looking telemetry with gradual drift, occasional spikes, and correlated multi-sensor behavior.
- **Target audience:** Portfolio reviewers, potential employers, anyone evaluating full-stack capability.

## Constraints

- **Tech stack:** Must build on existing Django + React + TypeScript stack. Three.js for 3D.
- **No new cloud infra:** Simulated data runs locally or in-browser; no new GCP services needed for the demo.
- **Existing routes preserved:** All current pages (`/raw`, `/enriched`, `/trends`, `/simulate`, `/unity`) stay untouched. New content goes on `/habitat`.
- **Branch:** All work on `feature/mars-habitat-demo` branch.

## Current Milestone: v1.0 Mars Habitat Demo

**Goal:** Build a visually stunning 3D Mars greenhouse habitat with live simulated telemetry, interactive zones, and anomaly simulation on top of the existing SpatialHub platform.

**Target features:**
- 3D interactive Three.js habitat visualization on `/habitat` route
- Four clickable habitat zones with live sensor feeds
- Simulated real-time Mars habitat telemetry
- Anomaly simulation system with visual alerts
- New Django API endpoints for habitat data
- Fix existing backend bugs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three.js for 3D (not Unity/WebGL export) | Runs natively in React, no plugin needed, lighter weight | — Pending |
| New `/habitat` route (not replacing existing pages) | Preserves existing functionality, reduces risk | — Pending |
| Simulated telemetry (not real hardware) | This is a demo — real Mars sensors aren't available (yet) | — Pending |
| Fix backend bugs as part of scope | No point building on a broken foundation | — Pending |

---
*Last updated: 2026-03-09 after initialization*
