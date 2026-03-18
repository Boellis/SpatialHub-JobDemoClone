---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Physical Sensor Integration
status: planning
stopped_at: Completed 10-02-PLAN.md (Hubcode Rewrite)
last_updated: "2026-03-18T18:59:43.212Z"
last_activity: 2026-03-18 — v3.0 roadmap created (Phases 10-13)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 3
  completed_plans: 1
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** 3D habitat visualization with live sensor data that feels real, responsive, and impressive enough to make someone say "this could actually run a Mars greenhouse."
**Current focus:** v3.0 Physical Sensor Integration — Phase 10: Django Ingest + Hubcode Rewrite

## Current Position

Milestone: v3.0 Physical Sensor Integration
Phase: 10 of 13 (Django Ingest + Hubcode Rewrite)
Plan: — (ready to plan)
Status: Ready to plan
Last activity: 2026-03-18 — v3.0 roadmap created (Phases 10-13)

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full v1.0/v2.0 log.

Key v3.0 architectural decisions:
- Pi bypasses GCP entirely — direct REST POST to Docker stack over WiFi; no Pub/Sub
- Closed loop operates via BioSim malfunction API (POST/DELETE `Grey_Water_Store`) — BioSim has no state injection endpoint
- Control service is a Django management command running as a separate Docker Compose service (same pattern as `biosim_bridge`)
- Pi uses `hub_id='pi-habitat-01'` and `sensor_id='wr-ph-real'` — set in config before any data is written to avoid namespace collision
- Real pH is a secondary annotation in ZonePanel (not a replacement for BioSim `wr-ph` sensor orb)
- Frontend polls `/api/enriched/?hub_id=pi-habitat-01` directly (not via bridge injection) for real sensor display
- [Phase 10-django-ingest-hubcode-rewrite]: atlas_i2c.py: MSB glitch handling inlined into read_value(), detect_devices() is static, no Python 2 compat
- [Phase 10-django-ingest-hubcode-rewrite]: hub_client.py: sync_readings sends batch list, prunes only on 201, timezone-aware UTC datetime

### Pending Todos

None.

### Blockers/Concerns

- Atlas EZO ships in UART mode — I2C shows nothing until PGND-TX jumper is installed and power-cycled; document as Setup Guide Step 1
- `AtlasI2C.py` 4-char truncation bug (`[0:4]` slice) must be fixed before any hubcode is written or tested
- I2C baud rate must be set to 10000 Hz in `/boot/firmware/config.txt` — default 400 kHz causes drop-off after 30-60 min
- pH divergence threshold (default 0.5 units) must be validated against actual sensor noise floor on physical Pi during Phase 11

## Session Continuity

Last session: 2026-03-18T18:59:43.206Z
Stopped at: Completed 10-02-PLAN.md (Hubcode Rewrite)
Resume file: None
