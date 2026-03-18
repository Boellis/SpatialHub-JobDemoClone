# Feature Research

**Domain:** Physical Sensor Integration — Real Raspberry Pi pH sensor driving BioSim closed-loop simulation (v3.0)
**Researched:** 2026-03-18
**Confidence:** HIGH for integration patterns and hardware setup; MEDIUM for closed-loop UX conventions (no canonical "IoT drives sim" portfolio standard exists — reasoning from first principles + hiring feedback patterns)

---

## Context: What Already Exists (Do Not Rebuild)

v2.0 shipped a complete BioSim integration. Before evaluating new features, be explicit about the baseline.

**Inherited from v2.0 (do not touch):**
- BioSim WebSocket client in `biosimWorker.ts` + `useSimSource.ts` — full reconnect/fallback state machine
- `ConnectionBadge` with 4 states: `connecting`, `biosim`, `fallback`, `disconnected`
- `habitatStore` with `simSource`, `biosimSimId`, `biosimMalfunctionIds` — all BioSim plumbing live
- `biosimMapper.ts` — translates BioSim module JSON to `ZoneState`/`SensorReading`; includes `wr-ph` from grey water fill ratio
- `AnomalyDrawer` + malfunction POST/DELETE to BioSim — fully wired
- Django bridge (`run_biosim_bridge`) writing BioSim ticks to `enriched_sensor_data`
- Docker Compose stack: Django + BioSim + Open MCT + PostgreSQL
- Existing hubcode in `hubcode/` — reads Atlas I2C, writes SQLite, syncs via GCP Pub/Sub

**What v3.0 replaces / extends:**
- `hubcode/snyc_to_postgres.py` — rip out GCP Pub/Sub, replace with direct HTTP POST to Django
- `wr-ph` in biosimMapper — currently a grey water fill ratio proxy; v3.0 replaces the ph reading with real sensor data
- `ConnectionBadge` label set — needs a 5th state: `real-sensor` (or extend `biosim` label to distinguish real vs fully simulated ph)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the reviewer must see for the demo to read as "real hardware in the loop." Missing any of these and the closed loop is just a claim, not a demonstration.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hubcode rewrite — config file replaces hardcoded values + GCP credentials | v2.0 hubcode is hardwired to GCP service account path `/home/pi/Medshift/...` and hardcoded `HUB_ID`; anyone trying to reproduce it hits immediate blockers | LOW | One `.env` or `hub_config.json` file: `DJANGO_URL`, `HUB_ID`, `SENSOR_ADDR`, `POLL_INTERVAL`; no service accounts; direct `requests.post()` to Django |
| Django endpoint to receive real sensor readings from the Pi | The Pi must push data somewhere Django already manages; `/api/raw/` schema (`hub_id`, `sensor_name`, `sensor_val`, `datetime`) already exists and matches what hubcode publishes | LOW | New view `RealSensorIngestView` or reuse existing `RawSensorData` insert path; POST body matches existing `raw_sensor_data` schema |
| Closed-loop control service comparing real pH to BioSim simulated pH | This IS the milestone's headline feature — without it, "Pi data appears" is just data logging, not a closed loop | MEDIUM | Django management command or background thread: poll latest real pH reading from DB every N seconds; compare to `wr-ph` value BioSim is currently simulating; if divergence exceeds threshold, POST malfunction to BioSim WaterRS module |
| Real pH reading visible in the Water Recycling zone panel | The reviewer must see the sensor value on screen alongside the other zone data; "real data appearing in the 3D habitat" is the stated goal | MEDIUM | `wr-ph` in the zone panel currently shows a BioSim-derived proxy; real sensor data must reach the frontend — either via the Django REST API (polling) or by the bridge injecting it into the WS pipeline |
| HUD badge distinguishing real sensor data from fully simulated | "BioSim Live" is already shown; once a real sensor is active, the HUD should say something different — otherwise a reviewer cannot tell if the hardware is actually contributing | LOW | Extend `SimSource` type with a `real-sensor` state or add a second badge; `ConnectionBadge` config map pattern makes this a one-entry addition; requires backend to expose a "Pi is connected" signal |
| Reproducible setup: anyone with a Pi + Atlas I2C sensor can run it | v3.0 goal is explicitly stated as reproducible; without a setup doc, the demo is not reproducible and the milestone objective fails | LOW | `docs/pi-setup.md` or `README-pi.md`: wiring diagram description, I2C enable steps, config values, `pip install -r requirements.txt`, `python sensor_client.py` |

### Differentiators (Competitive Advantage)

Features that transform "Pi sends data to a web app" into something a senior engineer remembers.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Visible divergence trigger: real pH threshold breach fires a BioSim malfunction in real time | This is the "wow" moment — reviewer watches pH drift on-screen, BioSim water recycling degrades, zone status shifts red; the causal chain is visible end-to-end | MEDIUM | Control service threshold logic: `abs(real_ph - biosim_ph) > THRESHOLD` triggers POST to BioSim WaterRS malfunction; auto-clears when readings converge; visual effect on Water Recycling zone is already wired |
| Real sensor badge pulse animation on first reading arrival | Tiny detail: when the Pi connects and first reading arrives, the badge should pulse (same `badgePulse` animation already in `ConnectionBadge.tsx`); signals "hardware is live" to reviewer | LOW | Same CSS keyframe injection pattern already in `ConnectionBadge.tsx`; just a new `SimSource` state triggering it |
| pH value shown in zone panel with a "REAL" or "LIVE HW" tag | Distinguishes the real pH from the simulated sensors in the same zone; shows the reviewer exactly which reading is hardware-sourced | LOW | Add a `source: 'real' | 'biosim'` field to `SensorReading` type or add a separate `realSensorOverrides` map in habitatStore; render a small colored tag in `ZonePanel` next to the value |
| Automatic recovery: when real pH returns to normal range, control service sends DELETE malfunction to BioSim | Closes the loop completely — not just "sensor triggers fault" but "sensor recovery resolves fault"; demo flows naturally from crisis to resolution without any manual intervention | LOW after control service exists | Add recovery branch to control service: if malfunction active and divergence below threshold, DELETE the malfunction ID; store active malfunction ID in Django (model field or in-memory) |
| Pi setup guide with first-run validation command (`python sensor_client.py --test`) | Directly addresses "reproducible for anyone" goal; shows hiring reviewer that production thinking (self-testing tooling) was applied even to the hardware setup | LOW | `--test` flag: reads one sample from the sensor, prints it, POSTs to Django, prints confirmation; exits 0 on success |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multiple sensor types (DO, EC, CO2, water temp) on the Pi | "More sensors = more impressive" | Each new sensor type requires: I2C address discovery, calibration, unit mapping, a new BioSim module binding, and new frontend display; weeks of work per sensor for marginal additional portfolio value; pH alone is sufficient to demonstrate the full closed-loop architecture | Ship one sensor type (pH) end-to-end; the architecture is extensible — state that explicitly in the setup guide |
| Pi running a local MQTT broker instead of direct REST | "Production IoT uses MQTT" | Adds Mosquitto broker to the local stack, requires MQTT client on Pi and Django, doubles the moving parts for zero additional portfolio signal; the point of v3.0 is the closed loop, not the transport protocol | Direct HTTP POST is simpler, easier to reproduce, and perfectly valid for a local WiFi setup |
| Auth tokens for Pi-to-Django communication | "Production would have auth" | PROJECT.md explicitly marks auth out of scope; adding API key management for the Pi adds setup steps without demonstrating any new capability; reviewers understand this is a demo | Skip auth entirely; note absence intentionally in the setup guide ("this is a local-network demo; add token auth before production") |
| Real-time WebSocket push from Django to frontend for Pi readings | "Latency matters for IoT" | Adds Django Channels + Redis to the stack (already avoided in v2.0 for good reason); pH sensor accuracy at 30s poll intervals is entirely sufficient for demo; the existing BioSim WS already drives the live 3D scene | Poll-based approach: Django bridge reads latest real pH from DB every ~30s and injects it into the BioSim-derived sensor stream or directly updates habitatStore via the existing REST `/api/enriched/` endpoint |
| Custom calibration UI for the Atlas sensor | "Real hydroponics systems need calibration" | Atlas Scientific calibration is a hardware CLI procedure (send `Cal,mid,7.00` over I2C); building a web UI for it is weeks of work with near-zero demo impact; the sensor ships pre-calibrated | Document the I2C calibration command in the setup guide; no UI needed |
| Fully automated Pi discovery (mDNS, zero-config networking) | "Should just work on any network" | mDNS/Bonjour/Avahi setup on Pi + Django consumer is 2-3 additional network configuration steps; the target audience (hiring reviewers) just needs `python sensor_client.py` to work with a config file | Config file with explicit `DJANGO_URL = http://192.168.x.x:8000`; document once, works everywhere |
| Persist control service decisions to a new DB table | "Audit trail of closed-loop events" | Requires migration, new model, new serializer, new API endpoint; zero portfolio value over just having the visual malfunction trigger visible in the 3D scene | Log control service decisions to stdout/file; the visual response in the 3D habitat IS the audit trail for demo purposes |

---

## Feature Dependencies

```
[Hubcode Rewrite — config-driven, no GCP]
    └── required by ──> [Django Real Sensor Endpoint]
                            └── required by ──> [Control Service]
                                                    └── required by ──> [BioSim Malfunction on pH Divergence]
                                                    └── required by ──> [Auto-recovery DELETE malfunction]
    └── required by ──> [Real pH in Water Recycling Zone]
                            └── required by ──> [HUD "Real Sensor" badge state]

[Django Real Sensor Endpoint]
    └── writes to ──> raw_sensor_data (already exists, zero schema changes)
    └── required by ──> [Control Service reads latest pH from DB]

[Control Service]
    └── requires ──> BioSim running (depends on existing docker-compose stack)
    └── requires ──> biosimSimId (probe from BioSim REST API, same pattern as bridge)
    └── stores ──> active malfunction ID (in-memory or Django model field)

[Real pH visible in frontend]
    └── option A ──> Control service bridge injects real pH into the existing BioSim WS pipeline
                        └── requires ──> override logic in biosimMapper.ts for wr-ph
    └── option B ──> Frontend polls /api/raw/?sensor_name=ph&latest=1 every 30s
                        └── no WebSocket needed, no store changes needed
    └── option C ──> Django bridge patches habitatStore via a new Django endpoint frontend polls
                        └── simpler than A, slightly more complex than B

[HUD "Real Sensor" badge]
    └── requires ──> frontend knowing Pi is active (signal from backend or first real-data poll)
    └── extends ──> SimSource type (one new string literal)
    └── extends ──> BADGE_CONFIG map (one new entry)
    └── pulse animation already exists ──> badgePulse keyframe in ConnectionBadge.tsx
```

### Dependency Notes

- **Hubcode rewrite is the unlock for everything.** Without the Pi successfully POSTing to Django, there is no real data, no control service, no closed loop. This is the first phase.
- **Django endpoint is a thin wrapper.** `RawSensorData` model and schema already exist; the new endpoint is just a POST-accepting view that inserts a row. No migration needed.
- **Control service reads from DB, not directly from Pi.** Decouples Pi polling rate from control loop rate. Pi posts every 5s; control service polls DB every 30s; this is intentional latency hiding that makes the architecture cleaner, not sloppier.
- **Real pH in frontend has three implementation options.** Option B (frontend polls `/api/raw/` directly) is the lowest-complexity path, requires no bridge changes, and is sufficient for demo. Options A and C are more elegant but add complexity. Prefer B unless the plan phase makes a different call.
- **Control service and Django bridge are both long-running processes.** They can run in the same Docker Compose service via a supervisor or as separate services. The bridge already runs as a management command; the control service should follow the same pattern.
- **Auto-recovery depends on the control service storing the active malfunction ID.** If the service restarts, the in-memory ID is lost. Acceptable for a demo — worst case, the malfunction persists until BioSim restarts. No DB table needed.

---

## MVP Definition

### Launch With (v3.0)

Minimum set that makes the portfolio entry read as "real hardware drives simulation."

- [ ] **Hubcode rewrite** — config-driven Python client, no GCP dependency; POST to Django over WiFi
- [ ] **Django real sensor ingest endpoint** — `POST /api/real-sensor/` or reuse raw ingest path; writes to `raw_sensor_data`; no schema migration
- [ ] **Control service** — reads latest real pH from DB; compares to current BioSim `wr-ph` proxy; triggers WaterRS malfunction on divergence; auto-clears on recovery
- [ ] **Real pH visible in Water Recycling zone** — frontend polls `/api/raw/?sensor_name=ph&limit=1` and overlays value in ZonePanel; MEDIUM complexity
- [ ] **HUD badge updated** — new `real-sensor` SimSource state lights up when Pi readings arrive; `ConnectionBadge` shows "Real Sensor" in hardware green
- [ ] **Pi setup guide** — wiring + I2C config + config file values + `python sensor_client.py --test` validation command

### Add After Validation (v3.x)

Add once the core pipeline is verified end-to-end.

- [ ] **"LIVE HW" tag on the pH value in ZonePanel** — adds a small colored tag; low effort, makes the real-vs-simulated distinction visually unambiguous
- [ ] **pH sparkline continuity** — real readings extend the existing `wr-ph` sparkline history; requires injecting real readings into the ring buffer via `appendRingBuffer` from `biosimMapper.ts` (already exported)
- [ ] **Control service decision logging** — log malfunction trigger/clear events with timestamps to a file; useful for debugging during live demo

### Future Consideration (v4+)

Defer indefinitely for this portfolio context.

- [ ] **Multiple sensor types on Pi** — DO, EC, water temp, CO2; full multi-sensor hub; worthwhile only if the project evolves into a real product
- [ ] **MQTT transport** — Mosquitto + paho-mqtt on Pi; demonstrably more production-like; but adds a new service dependency without changing the architecture story
- [ ] **Sensor calibration UI** — Atlas I2C calibration commands exposed through a web form; far more complexity than value for a portfolio demo

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Hubcode rewrite (config-driven, no GCP) | HIGH | LOW | P1 |
| Django real sensor ingest endpoint | HIGH | LOW | P1 |
| Control service (pH divergence → BioSim malfunction) | HIGH | MEDIUM | P1 |
| Real pH overlay in Water Recycling zone | HIGH | MEDIUM | P1 |
| HUD "Real Sensor" badge | MEDIUM | LOW | P1 |
| Pi setup guide + `--test` validation | MEDIUM | LOW | P1 |
| Auto-recovery DELETE malfunction | MEDIUM | LOW | P2 |
| "LIVE HW" tag on pH reading in ZonePanel | LOW | LOW | P2 |
| pH sparkline continuity (real readings in ring buffer) | LOW | LOW | P2 |
| Control service decision logging | LOW | LOW | P2 |
| Multiple sensor types on Pi | LOW | HIGH | P3 |
| MQTT transport layer | LOW | MEDIUM | P3 |
| Sensor calibration UI | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v3.0 launch
- P2: Add once P1 verified end-to-end
- P3: Future consideration only

---

## Architecture Decision: How Real pH Reaches the Frontend

Three options with materially different complexity profiles. This is the most ambiguous design decision for this milestone.

### Option A: Django bridge injects real pH into the BioSim WS pipeline

The bridge, which already receives BioSim ticks, also reads the latest real pH from DB and overrides the `wr-ph` value before writing to `enriched_sensor_data`. Frontend reads from the BioSim WS (already wired) — no frontend changes.

**Pro:** No frontend changes. Real data flows through the same channel as BioSim data. Fully transparent.
**Con:** Couples real sensor data to the BioSim tick cadence. If BioSim is down, real pH disappears. Requires bridge changes.

### Option B: Frontend polls `/api/raw/?sensor_name=ph&limit=1` directly (RECOMMENDED)

Frontend adds a `useRealSensor` hook that polls the Django REST endpoint every 30s. On response, overlays the value in the Water Recycling zone panel independent of BioSim. HUD badge activates on first successful poll.

**Pro:** Completely independent of BioSim availability. No bridge changes. No WebSocket. Aligns with existing REST pattern in the codebase. Easiest to test.
**Con:** Second data path (WS for BioSim, REST for real sensor). Slight duplication.

### Option C: Dedicated `/api/real-sensor/latest/` endpoint frontend polls

Same as B but with a purpose-built endpoint that returns `{ sensor_name: 'ph', value: float, timestamp: str, has_real_data: bool }`. Marginally cleaner API contract.

**Pro:** Explicit endpoint with a clear schema. `has_real_data: false` when no Pi readings exist — frontend can gracefully show "waiting for Pi."
**Con:** One more endpoint to write and maintain.

**Recommendation:** Option B for the initial implementation. It is the fastest path, uses existing endpoints, and works today. Option C is a v3.x polish upgrade if the plan phase decides cleaner API contract matters.

---

## What Makes This Demo Impressive to Portfolio Reviewers

Based on hiring feedback patterns and IoT portfolio norms:

**What lands:** The causal chain must be visible on screen. Reviewer must see: pH drops → zone turns yellow/red → "(LIVE HW)" indicator next to the value → malfunction fires → Water Recycling zone status degrades. The full cause-and-effect in under 10 seconds of watching.

**What does not land:** Just "Pi sends data to a database." Data logging is not a closed loop. The simulation response to real data is what elevates this from "IoT homework" to "I built a digital twin."

**Reproducibility signals expertise.** A `--test` flag, a config file with clear comments, and a setup guide with numbered steps tell reviewers "this person thinks about onboarding and production-readiness." Reviewers who try to run the demo and hit immediate blockers (GCP service account? where?) form a negative impression that is hard to recover from.

**Minimal is better than broken.** One sensor type, one zone, one closed-loop trigger done cleanly and completely is vastly more impressive than three sensor types with one working and two silently erroring. pH → WaterRS malfunction is the story; tell it well, not broadly.

---

## v2.0 vs v3.0 Feature Comparison

| Aspect | v2.0 (BioSim) | v3.0 (Physical Sensor) |
|--------|--------------|------------------------|
| Data source for `wr-ph` | Grey water fill ratio proxy (BioSim internal) | Real Atlas Scientific EZO pH sensor via I2C |
| Hub code transport | GCP Pub/Sub via service account JSON | Direct HTTP POST to Django over WiFi |
| Malfunction trigger | User-triggered via AnomalyDrawer | Automatic: control service fires on pH divergence |
| HUD badge states | connecting / biosim / fallback / disconnected | + real-sensor (5th state) |
| Anomaly recovery | Manual AnomalyDrawer cancel | Automatic: control service sends DELETE when pH normalizes |
| Setup reproducibility | Docker Compose: one command | Docker Compose + Pi config file + setup guide |
| Portfolio narrative | "I integrated NASA's life support simulator" | "Real pH sensor drives a NASA simulator via closed-loop control" |

---

## Sources

- Existing codebase: `hubcode/sensor_logger.py`, `hubcode/snyc_to_postgres.py`, `django_backend/sensor_data/views.py`, `spatialhub-frontend/src/types/habitat.ts`, `spatialhub-frontend/src/simulation/biosimMapper.ts`, `spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx`, `spatialhub-frontend/src/hooks/useSimSource.ts`, `spatialhub-frontend/src/store/habitatStore.ts` — integration surface analysis — HIGH confidence
- Atlas Scientific GitHub (Atlas-Scientific/Raspberry-Pi-sample-code): I2C communication patterns, EZO pH sensor address (99), command format — HIGH confidence
- atlas-i2c PyPI package and forum threads: Pi I2C baud rate requirement (100K not 400K), direct sensor polling patterns — MEDIUM confidence
- .planning/PROJECT.md v3.0 milestone definition: explicit scope, constraints, out-of-scope list — HIGH confidence (authoritative)
- Prior research FEATURES.md (v2.0): inherited patterns, confirmed BioSim integration surfaces — HIGH confidence
- Hiring feedback patterns (WebSearch): causal chain visibility, reproducibility as credibility signal, "minimal done well > broad done poorly" — MEDIUM confidence

---
*Feature research for: Physical Sensor Integration — Mars Habitat Demo v3.0*
*Researched: 2026-03-18*
