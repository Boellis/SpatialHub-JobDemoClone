# Project Research Summary

**Project:** SpatialHub Mars Habitat Demo — Physical Sensor Integration (v3.0)
**Domain:** IoT closed-loop control — real hardware driving a physics simulation
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

SpatialHub v3.0 is a closed-loop integration milestone: a Raspberry Pi running an Atlas Scientific EZO pH sensor must drive BioSim's physics simulation by triggering malfunctions when real sensor readings diverge from simulation proxies. This is not a data logging project — it is a digital twin that responds to physical reality. The architecture is a comparator loop, not a value injector: BioSim has no endpoint to receive external state; the only lever available is its malfunction API. The whole milestone narrative depends on the reviewer watching a causal chain — pH drifts, zone turns red, water recycling degrades — entirely driven by real hardware.

The recommended approach is deliberately minimal in new infrastructure. No new packages are needed on the Django side. The Pi client is a config-driven Python script using `requests` and `python-dotenv` that replaces the existing GCP-Pub/Sub-dependent `snyc_to_postgres.py`. The control service is a Django management command (identical pattern to the existing `biosim_bridge`) added as a new Docker Compose service. The frontend change is a secondary pH annotation in the Water Recycling zone panel, polled from the existing `/api/enriched/` endpoint. Every major component has a direct existing analog to follow.

The key risks are all hardware setup concerns, not software design concerns. Two of them will silently corrupt every demo that has not addressed them: the Atlas EZO ships in UART mode (I2C shows nothing until manually switched), and the existing `AtlasI2C.py` truncates pH values above 9.999 due to a hard-coded 4-character slice. Both must be fixed before any code is written or tested. The third systemic risk is namespace collision between BioSim and Pi data in `enriched_sensor_data` — distinct `hub_id` values prevent this with zero migration.

---

## Key Findings

### Recommended Stack

The stack for v3.0 adds exactly two new Pi-side packages and zero new Django packages. `requests==2.32.5` handles HTTP POST from the Pi; `python-dotenv==1.2.2` (or `1.0.1` for Pi OS Bullseye/Python 3.9) replaces hardcoded constants with a `.env` config file. On the Django side, the control loop reuses `aiohttp>=3.9` already in `requirements.txt`, following the exact `asyncio.run()` pattern established in `biosim_bridge.py`. No Celery, no MQTT, no Redis, no new Docker images.

**Core technologies:**
- `requests 2.32.5` (Pi): HTTP POST to Django — simpler and correct for a 5s polling loop on LAN; aiohttp adds complexity for zero gain
- `python-dotenv 1.2.2` (Pi): replaces hardcoded GCP paths and hub IDs with a `.env` file that survives reboots and is version-controlled; use `1.0.1` on Pi OS Bullseye (Python 3.9)
- `aiohttp >=3.9` (Django, already present): async HTTP client for BioSim malfunction POST/DELETE — same library, same pattern as the bridge
- Django management command (built-in): runs the control loop in the existing Django image as a second Docker Compose service; no new Dockerfile, no broker, no task queue
- `AtlasI2C.py` (existing, unchanged except for the 4-char strip bug fix): the I2C driver already works — do not wrap or replace it

**What NOT to use:** `google-cloud-pubsub` on the Pi (the explicit v3.0 goal is eliminating this dependency), MQTT (adds a broker for a single producer/consumer at 5s intervals), WebSocket from Pi to Django (requires django-channels ASGI stack; HTTP POST at 5s intervals is trivially debuggable and already handled by DRF), or `AppConfig.ready()` threads for the control loop (fires in every Gunicorn worker — multiple control loops, duplicate malfunction POSTs).

### Expected Features

The milestone is well-scoped. Six features constitute the v3.0 launch set; four more are explicit v3.x polish; everything else is deferred indefinitely.

**Must have (v3.0 table stakes):**
- Hubcode rewrite — config-driven Pi client, no GCP dependency, direct `requests.post()` over WiFi
- Django `SensorIngestView` at `POST /api/sensor-ingest/` — writes to existing `EnrichedSensorData` model, no migration
- Control service (`ph_control_loop` management command) — reads latest real pH vs. BioSim proxy pH from DB every 10s, triggers `Grey_Water_Store` malfunction on divergence, auto-clears on recovery
- Real pH visible in Water Recycling zone panel — secondary annotation, polled from `/api/enriched/?hub_id=pi-habitat-01` every 10s; no store or WebSocket changes
- HUD badge `real-sensor` state — 5th `SimSource` state, one entry in `BADGE_CONFIG`, reuses existing `badgePulse` animation
- Pi setup guide with `--test` validation flag — reproducibility is a portfolio credibility signal, not optional

**Should have (v3.x polish, add after P1 verified end-to-end):**
- `LIVE HW` tag on the pH value in ZonePanel — visually distinguishes hardware from simulated readings
- pH sparkline continuity — inject real readings into existing ring buffer via `appendRingBuffer` (already exported from `biosimMapper.ts`)
- Control service decision logging — timestamped malfunction trigger/clear events to file
- Auto-recovery DELETE malfunction — already designed into the control service; low effort once P1 is running

**Defer indefinitely (v4+):**
- Multiple sensor types (DO, EC, CO2) — weeks of work per sensor for marginal portfolio value; the architecture is extensible, state that explicitly
- MQTT transport — production-realistic but adds a broker with no additional demo signal
- Sensor calibration UI — Atlas calibration is a hardware CLI procedure; no web UI needed

### Architecture Approach

The v3.0 architecture adds two new Docker Compose services (`control` and `SensorIngestView`) and one new component on the Pi, while leaving the entire existing v2.0 stack — BioSim WebSocket pipeline, `biosimMapper.ts`, `habitatStore.ts`, `useSimSource.ts`, `biosimWorker.ts`, the bridge service — completely untouched. The key architectural insight is using PostgreSQL as an integration bus: the Pi posts on its own 5s schedule, BioSim ticks at its own rate, and the control loop queries the stable `.latest()` snapshot from each source every 10s. This decoupling intentionally introduces ~10s latency, which prevents thrashing malfunctions on momentary sensor noise.

**Major components:**
1. `hub_client.py` (NEW, Pi) — config-driven YAML, reads Atlas I2C pH, POSTs to Django, SQLite buffer for offline resilience; replaces `basic_funcs.py` + `snyc_to_postgres.py` entirely
2. `SensorIngestView` (NEW, Django) — 15-line DRF `APIView` POST that validates payload and writes one `EnrichedSensorData` row with `hub_id='pi-habitat-01'`; no serializer, no enrichment step needed because the Pi sends all metadata fields directly
3. `ph_control_loop` management command (NEW, Django) — async management command, same `asyncio.run()` pattern as `biosim_bridge.py`; reads real pH vs. BioSim proxy pH from DB, POST/DELETE `Grey_Water_Store` malfunctions; runs as a separate `control` Docker service
4. Water Recycling zone panel (MODIFIED, React) — adds a `useEffect`-based 10s polling fetch for `pi-habitat-01` readings; renders secondary "Real pH" annotation alongside existing BioSim sensor orb
5. `docker-compose.yml` (MODIFIED) — adds `control` service; one-liner diff from the existing `bridge` service
6. All other components (UNCHANGED) — BioSim WS pipeline, `biosimMapper.ts`, `habitatStore.ts`, `useSimSource.ts`, the bridge — zero changes required

**Build order enforced by dependencies:** `SensorIngestView` first (testable with `curl` immediately, no hardware needed) → `hub_client.py` rewrite (develop against local Django) → `ph_control_loop` (smoke-test with manually inserted DB rows) → `control` Docker service (one-liner diff) → frontend real pH overlay → end-to-end test.

**Critical architectural constraint:** BioSim has no state injection API. The closed loop must operate via the malfunction API (`POST/DELETE /api/simulation/{id}/modules/Grey_Water_Store/malfunctions`). Any design or plan mentioning "inject pH into BioSim" or "override BioSim water store" is architecturally wrong. The `wr-ph` sensor orb in the 3D scene must continue showing BioSim's physics output so that the visual response to the malfunction is observable.

### Critical Pitfalls

1. **4-character pH strip bug in `AtlasI2C.py`** — `read_device_data()` slices `[0:4]`, silently truncating pH >= 10.0 (e.g., `10.14` becomes `10.1`). Replace with `stripped_response.strip('\x00').strip()` before casting to float. Fix before writing any hubcode. Unit test: parse `"7.312"`, `"10.14"`, `"14.00"` — all must return correct floats.

2. **Atlas EZO ships in UART mode** — `i2cdetect -y 1` shows nothing at address 0x63 until PGND-TX jumper is installed and board is power-cycled. Setup guide Step 1: confirm solid blue LED; verify with `sudo i2cdetect -y 1`. Without this, the entire milestone fails and no software debugging will help.

3. **I2C bus speed default 400 kHz causes intermittent sensor drop-off** — Atlas EZO is rated 10–100 kHz; at 400 kHz it drops off after 30–60 minutes with `IOError: [Errno 121] Remote I/O error` requiring physical power-cycle. Fix: `dtparam=i2c_arm_baudrate=10000` in `/boot/firmware/config.txt`. Low effort, high consequence if missing.

4. **hub_id namespace collision between Pi and BioSim data** — if the Pi writes rows with `hub_id='biosim-habitat-01'`, data sources become indistinguishable, `/trends` returns a meaningless blend, and retroactive correction is painful. Fix: Pi uses `hub_id='pi-habitat-01'` and `sensor_id='wr-ph-real'` — set in config before any data is written.

5. **Pi OS Bookworm blocks system-wide pip** — `pip install requests` fails with `externally-managed-environment` on Bookworm (current Pi OS default). Setup guide must document `python3 -m venv --system-site-packages ~/spatialhub-venv` as Step 1 of software installation.

---

## Implications for Roadmap

Based on the dependency graph in FEATURES.md and the build order in ARCHITECTURE.md, three phases are the natural structure for this milestone.

### Phase 1: Hubcode Rewrite + Django Ingest Endpoint

**Rationale:** This is the unlock for everything. Without a Pi successfully POSTing to Django, there is no real data, no control service comparison, no closed loop. The Django endpoint is standalone — testable with `curl` before any Pi hardware is involved — and its existence allows all subsequent phases to develop against real DB rows.

**Delivers:** Pi client (`hub_client.py`) that posts real Atlas I2C pH readings to Django over WiFi with no GCP dependency; Django `SensorIngestView` endpoint that writes readings to `enriched_sensor_data` with a distinct `hub_id`; Pi setup guide with hardware wiring, I2C config, venv setup, and `--test` validation command.

**Addresses features:** Hubcode rewrite, Django real sensor ingest endpoint, Pi setup guide, `--test` validation flag.

**Avoids pitfalls:**
- Fix `AtlasI2C.py` 4-char strip bug before writing a single line of hubcode (Pitfall 1)
- Document EZO UART→I2C mode switch as setup guide Step 1 (Pitfall 2)
- Document `dtparam=i2c_arm_baudrate=10000` as required Pi config (Pitfall 3)
- Delete `snyc_to_postgres.py` entirely; no GCP imports in new `requirements.txt` (Pitfall 5 from PITFALLS.md)
- Document venv creation as setup guide Step 1 of software installation (Pitfall 6 from PITFALLS.md)
- Use static IP for dev machine in Pi config and document before demo (Pitfall 7 from PITFALLS.md)
- Set `hub_id='pi-habitat-01'` and `sensor_id='wr-ph-real'` from day one (Pitfall 4 above / Pitfall 8 from PITFALLS.md)

**Research flag:** Standard patterns — DRF APIView POST, requests HTTP client, python-dotenv config. Skip `/gsd:research-phase`.

---

### Phase 2: Closed-Loop Control Service

**Rationale:** Depends on Phase 1 being live so there are real rows in `enriched_sensor_data` to query. The control loop can be smoke-tested by inserting fake `pi-habitat-01` rows manually — physical Pi hardware not required. The `control` Docker Compose service is a one-liner diff from the existing `bridge` service, which is the proven pattern.

**Delivers:** Django management command (`ph_control_loop`) that reads latest real pH vs. BioSim proxy pH from DB every 10s, POSTs scaled malfunctions to `Grey_Water_Store` when divergence exceeds threshold, and DELETEs malfunction on recovery; `control` Docker service added to `docker-compose.yml`; intensity scaling (LOW/MEDIUM/SEVERE) based on divergence magnitude.

**Addresses features:** Control service (pH divergence → BioSim malfunction), auto-recovery DELETE malfunction.

**Uses:** `aiohttp` (already in `requirements.txt`), `asyncio.run()` pattern from `biosim_bridge.py`, BioSim malfunction API at `POST/DELETE http://biosim:8009/api/simulation/{id}/modules/Grey_Water_Store/malfunctions`.

**Avoids pitfalls:**
- Phase plan must state "malfunction trigger, not value injector" explicitly (PITFALLS.md Pitfall 4)
- Query DB rows with recency guard (within last 2 ticks) to avoid comparing against stale BioSim bridge lag data
- Run as separate Docker service, NOT as `AppConfig.ready()` thread, to avoid duplicate loops in multiple Gunicorn workers

**Research flag:** BioSim malfunction API patterns are verified (HIGH confidence). `biosim_bridge.py` is the exact template. Skip `/gsd:research-phase`.

---

### Phase 3: Frontend Real Sensor Visibility + HUD Badge

**Rationale:** Can proceed in parallel with Phase 2 after Phase 1 is live, since it only requires `GET /api/enriched/?hub_id=pi-habitat-01` to return data. Grouped last because the full demo story — "pH drifts, zone turns red, LIVE HW badge is green" — only reads coherently once the control loop is wired. The frontend changes are intentionally minimal and localized.

**Delivers:** Secondary "Real pH" annotation in Water Recycling zone panel polled every 10s from existing endpoint; new `real-sensor` SimSource state in `ConnectionBadge` that activates on first successful Pi reading poll; `LIVE HW` tag on the pH value in ZonePanel (P2 polish, add after P1 verified).

**Addresses features:** Real pH visible in Water Recycling zone, HUD badge `real-sensor` state, `LIVE HW` tag on pH reading.

**Implements:** Water Recycling zone panel modification (the one MODIFIED React component), `SimSource` type extension (one new string literal), `BADGE_CONFIG` map addition (one new entry) — all minimal, localized changes. Reuses existing `badgePulse` keyframe animation already in `ConnectionBadge.tsx`.

**Avoids pitfalls:**
- Do NOT replace `wr-ph` in `biosimMapper.ts` with the real reading — the BioSim physics proxy must remain as the primary sensor orb so the malfunction response is visible (Anti-Pattern 2 from ARCHITECTURE.md)
- Real pH is a secondary annotation, not a replacement; both values displayed simultaneously
- Use Option B (frontend polls `/api/enriched/` directly) — not Option A (bridge injection) — to keep real sensor display independent of BioSim availability

**Research flag:** Standard React polling pattern (useEffect + fetch). Skip `/gsd:research-phase`.

---

### Phase Ordering Rationale

- **Phases 1 and 2 are sequentially dependent**: the control service reads from `enriched_sensor_data`; rows must exist before the loop has anything to compare. Phase 1 delivers the data; Phase 2 consumes it.
- **Phase 3 can proceed in parallel with Phase 2**: both depend on Phase 1 producing data; neither depends on the other. In practice, Phase 2 is more complex and should be the primary focus after Phase 1.
- **Hardware setup can proceed in parallel with all phases**: Pi hardware testing (`i2cdetect`, UART→I2C switch, baud rate config) is independent of the Django stack work and can run on a physical Pi concurrently.
- **The build order within phases is dictated by testability**: write the Django endpoint first (testable with `curl`), then the Pi client (testable against the running endpoint), then the control loop (testable with manually inserted DB rows).

### Research Flags

Phases needing deeper research during planning:
- **None.** All three phases use well-documented, established patterns. The BioSim malfunction API is verified from source. The DRF POST pattern is standard. The React polling pattern has no unknowns.

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1:** requests HTTP client + python-dotenv config — canonical IoT REST client pattern
- **Phase 2:** asyncio management command + BioSim malfunction API — existing bridge is the exact template
- **Phase 3:** React useEffect polling + Zustand SimSource extension — the `BADGE_CONFIG` pattern is already in the codebase

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via PyPI; aiohttp/DRF patterns confirmed against repo source; BioSim malfunction API confirmed against `configuration/default.biosim` and README; no `WaterRS` in default config confirmed (use `Grey_Water_Store`) |
| Features | HIGH | Integration surface derived from direct codebase analysis; anti-features well-reasoned; MEDIUM confidence only on closed-loop UX conventions (no canonical portfolio standard exists — reasoned from hiring feedback patterns) |
| Architecture | HIGH | All findings derived from direct source code reads with file paths and line numbers; zero guesswork; build order validated against component dependencies; all existing file paths confirmed |
| Pitfalls | HIGH | Pitfalls 1, 5, and 8 confirmed via direct code analysis with line numbers; hardware pitfalls 2, 3, 6 confirmed via Atlas Scientific datasheets and Raspberry Pi Forums; Pitfall 4 confirmed via BioSim GitHub (no state injection endpoint exists) |

**Overall confidence:** HIGH

### Gaps to Address

- **pH divergence threshold tuning**: the control service uses `DIVERGENCE_THRESHOLD = 0.5` pH units as a starting value. This must be validated against the actual sensor noise floor on the physical Pi before the demo. A probe in still water typically drifts ±0.02–0.05 pH units; 0.5 gives 10x headroom. If the BioSim proxy `wr-ph` range is narrow (6.0–7.5 per the `biosim_ingest.py` formula), thresholds below 0.5 may thrash malfunctions. Validate during Phase 2 integration testing.
- **simID stability on BioSim restart**: the architecture doc recommends probing BioSim `GET /api/simulation` fresh each control loop cycle to handle restarts. Confirm this is the actual behavior of the BioSim API (does it return the same simID after restart or a new one?). Low risk for a demo; document the restart sequence in the setup guide.
- **Offline buffer scope decision**: ARCHITECTURE.md recommends SQLite buffering for Pi offline resilience, but FEATURES.md notes that direct LAN POST failure is immediately detectable and the buffer adds complexity. Phase 1 planning must make a final call: either include basic SQLite buffering (the existing pattern already demonstrates this) or log failures to a flat file only.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `hubcode/AtlasI2C.py` (4-char strip bug, lines 150–151), `hubcode/snyc_to_postgres.py` (GCP hard-coding, lines 7–9), `django_backend/sensor_data/views.py`, `django_backend/sensor_data/models.py`, `django_backend/sensor_data/biosim_ingest.py` (hub_id namespace, `wr-ph` proxy formula, line 134), `django_backend/sensor_data/management/commands/biosim_bridge.py`, `spatialhub-frontend/src/simulation/biosimMapper.ts`, `spatialhub-frontend/src/workers/biosimWorker.ts`, `spatialhub-frontend/src/hooks/useSimSource.ts`, `spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx`, `spatialhub-frontend/src/store/habitatStore.ts`, `docker-compose.yml`
- [BioSim default.biosim config](https://raw.githubusercontent.com/scottbell/biosim/main/configuration/default.biosim) — confirmed `Grey_Water_Store` module name; no `WaterRS` in default config
- [BioSim GitHub README](https://github.com/scottbell/biosim) — malfunction API endpoint pattern, intensity/duration values confirmed
- [PyPI requests 2.32.5](https://pypi.org/project/requests/) — current stable, Python >=3.9
- [PyPI python-dotenv 1.2.2](https://pypi.org/project/python-dotenv/) — current stable, Python >=3.10; use 1.0.1 for Python 3.9
- [PyPI aiohttp 3.13.3](https://pypi.org/project/aiohttp/) — current stable as of January 2026
- [Atlas Scientific pH EZO Datasheet](https://files.atlas-scientific.com/pH_EZO_Datasheet.pdf) — I2C timing specs, 10–100 kHz operating range
- [Django REST Framework CSRF docs](https://www.django-rest-framework.org/api-guide/authentication/#sessionauthentication) — APIView CSRF exemption confirmed for non-session auth

### Secondary (MEDIUM confidence)
- [Raspberry Pi Forums: Atlas Scientific I2C issues](https://forums.raspberrypi.com/viewtopic.php?t=304760) — UART vs I2C mode confusion, community-confirmed
- [Raspberry Pi Forums: Bookworm Python pip blocked](https://forums.raspberrypi.com/viewtopic.php?t=358063) — PEP 668 enforcement, venv workaround
- [Pimoroni: Python venv on Bookworm](https://pimoroni.github.io/venv-python/) — `--system-site-packages` pattern
- WebSearch (IoT portfolio norms): causal chain visibility, "minimal done well > broad done poorly," reproducibility as credibility signal

### Tertiary (LOW confidence)
- Hiring feedback patterns (inferred): closed-loop architecture distinguishes "IoT homework" from "digital twin"; `--test` flag signals production-readiness thinking — reasonable inference, not citable

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
