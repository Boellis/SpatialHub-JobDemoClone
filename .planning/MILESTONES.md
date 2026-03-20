# Milestones

## v3.0 Physical Sensor Integration (Shipped: 2026-03-20)

**Phases completed:** 7 phases, 11 plans
**Timeline:** 3 days (2026-03-18 → 2026-03-20)

**Key accomplishments:**

- Django SensorIngestView endpoint + Pi hub_client.py with SQLite offline buffer and Atlas I2C driver rewrite
- Full GCP cloud deployment: Django on Cloud Run, frontend on Firebase Hosting, Cloud SQL PostgreSQL
- BioSim + biosim_bridge + Open MCT on GCE VM with Caddy HTTPS (sslip.io auto-cert)
- Pi-to-Cloud pipeline: real Atlas Scientific pH sensor data flowing through Cloud SQL to frontend
- Closed-loop control service: pH divergence triggers Grey_Water_Store malfunction via BioSim REST API with hysteresis deadband
- HUD badge 5th state "BioSim + Real Sensor" (teal) when both BioSim and Pi data active
- Competition package: judge-facing setup guide + deployer verification checklist

**Known gaps:**

- DEPLOY-04 checkbox unchecked (Cloud SQL provisioned and functional, checkbox missed)

**Archive:** `.planning/milestones/v3.0-*`

---

## v1.0 Mars Habitat Demo (Shipped: 2026-03-14)

**Phases completed:** 4 phases, 10 plans, 19 tasks
**Timeline:** 5 days (2026-03-09 → 2026-03-14)
**Commits:** 59 (16 feat, 2 fix, 36 docs)
**LOC:** 3,587 TypeScript/TSX | 3,798 insertions across 28 files

**Key accomplishments:**

- Django HabitatZone API endpoint + fixed double `/api/api/` path bug
- Simulation engine with 12 sensors across 4 zones producing Mars-realistic telemetry on 2s tick
- R3F 3D habitat with 4 procedural domes, orbit controls, and selective bloom post-processing
- Camera transitions, hover highlights, and sensor orbs with live tooltips
- ZonePanel sidebar with live readings, sparkline charts, HabitatHUD, and AlertBanner toasts
- Anomaly system with 4 crisis scenarios, gradual onset/recovery curves, and AnomalyDrawer UI

**Tech debt accepted:**

- `fetchHabitatZones()` exported but never called (Django endpoint is dead leg for demo)
- Seed command thresholds diverged from `constants.ts`
- Sparklines flat for first ~60s on fresh page load
- 03-02-SUMMARY.md missing `requirements_completed` frontmatter

**Git range:** `b478c90` fix(01-01) → `1b294dc` feat(04-02)
**Archive:** `.planning/milestones/v1.0-*`

---
