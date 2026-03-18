# Pitfalls Research

**Domain:** Physical sensor integration — Raspberry Pi + Atlas Scientific I2C → BioSim closed-loop control
**Project:** SpatialHub Mars Habitat Demo v3.0
**Researched:** 2026-03-18
**Confidence:** HIGH (code-level analysis of existing hubcode + verified community sources)

> This file supersedes the v1.0/v2.0 pitfalls (Three.js GPU memory, BioSim tick alignment, etc.) and focuses exclusively on the new v3.0 concerns: adding real Pi hardware to a working simulation-based system. Prior pitfalls still apply; this file addresses what is NEW for this milestone.

---

## Critical Pitfalls

Mistakes that require rewrites, break the demo, or make reproducibility impossible.

---

### Pitfall 1: The 4-Character Strip Bug Will Silently Truncate pH Values

**What goes wrong:**
`AtlasI2C.read_device_data()` strips the response to the first 4 characters: `stripped_response = _cloud_device_response[0:4]`. A pH of `7.312` becomes `"7.31"`. A pH of `10.14` becomes `"10.1"`. Readings above 9.999 lose a digit. Readings like `"7.31"` — still castable to float — succeed silently. No error is logged. The data pipeline happily stores corrupt values.

**Why it happens:**
The original author hard-coded `[0:4]` as a quick hack to strip the device info prefix from the full `read()` response. The full `read()` method prepends `"Success EZO 99: "` — the custom `read_device_data()` strip was supposed to get just the number, but 4 chars is not enough for all valid pH values (range is 0.001–14.000, which requires up to 6 characters including the decimal point).

**How to avoid:**
Replace the hard-coded slice with a proper strip. The correct approach is to strip the null-terminated response, then cast the entire trimmed string to float:

```python
# In AtlasI2C.read_device_data()
stripped_response = _cloud_device_response.strip('\x00').strip()
# Then in the caller: float(stripped_response)
```

Alternatively, use the full `query()` method and parse after `"Success ... : "`, splitting on `": "` and taking `[1]`.

**Warning signs:**
- pH values appear suspiciously rounded when near 10.0 or when the probe is freshly calibrated at pH 10
- Float conversion occasionally raises `ValueError` for values like `"10."` (only 3 chars before decimal)
- BioSim receives pH values that never exceed 9.99 even when probe is in pH 10 buffer

**Phase to address:** Hubcode rewrite phase (Pi client rewrite). Fix before writing a single line of new hubcode. This is a latent bug in the existing code being carried forward.

---

### Pitfall 2: EZO Circuit Ships in UART Mode — I2C Will Not Work Until Manually Switched

**What goes wrong:**
The Atlas Scientific EZO pH circuit (and all EZO circuits) ship from the factory in **UART/serial mode**. When connected to the Pi's I2C bus, `i2cdetect -y 1` shows nothing at 0x63 (decimal 99). `list_i2c_devices()` returns an empty list. The sensor logger loop starts, reports "Sensor returned None" every 5 seconds, and nothing else fails visibly. This is a documentation issue disguised as a hardware failure.

**Why it happens:**
Atlas Scientific's default mode is UART because it's more universally compatible with microcontrollers. Switching to I2C requires connecting PGND to TX on the EZO board with a jumper, then power-cycling. The Atlas sample code PDF documents this, but it is not obvious from the board alone. Reproducibility guides that skip this step will fail on every fresh board.

**How to avoid:**
The Pi setup guide must include, as Step 1 before any software:
1. Confirm the LED is **solid blue** (I2C mode). If it blinks blue/green alternating, it is in UART mode.
2. To switch: short the PGND and TX pads (or pins, depending on circuit version), power-cycle, confirm solid blue LED.
3. Verify with `sudo i2cdetect -y 1` — expect to see `63` in the address grid.

**Warning signs:**
- `i2cdetect -y 1` shows nothing at address 0x63 (99 decimal) after wiring
- LED is not solid blue
- `list_i2c_devices()` returns an empty list or only addresses 0 and 3 (internal Pi devices)

**Phase to address:** Pi setup guide phase. This is Step 1 of the hardware setup — the whole milestone fails without it.

---

### Pitfall 3: I2C Bus Rate Default (400 kHz) Causes Drop-offs on Pi 3/4

**What goes wrong:**
Raspberry Pi 3B and 4 default to I2C bus speed of 400 kHz. The Atlas Scientific EZO pH circuit is rated for 10–100 kHz. At 400 kHz, the sensor may respond correctly for minutes or hours, then silently drop off the bus — `read()` returns `IOError` and `list_i2c_devices()` stops seeing the device. The fix requires power-cycling the sensor, not restarting the script.

**Why it happens:**
The Pi I2C bus speed is set via `/boot/config.txt` (or `/boot/firmware/config.txt` on Bookworm) with `dtparam=i2c_arm_baudrate=`. The Atlas EZO tolerance is not well-documented in their quick-start guides, leading integrators to leave the default in place.

**How to avoid:**
Add to `/boot/firmware/config.txt` (Bookworm) or `/boot/config.txt` (Bullseye):
```
dtparam=i2c_arm_baudrate=10000
```
This forces 10 kHz operation, well within Atlas Scientific specs. Re-test with `i2cdetect` after reboot to confirm the sensor is still visible. This must be in the setup guide.

**Warning signs:**
- Sensor reads successfully for 30–60 minutes then returns `IOError: [Errno 121] Remote I/O error`
- Requires physical power-cycle of the EZO board to recover (script restart is not enough)
- Issue is intermittent under heavy CPU load (I2C timing gets perturbed)

**Phase to address:** Pi setup guide phase. Low-effort config change, high-consequence if missing.

---

### Pitfall 4: BioSim Has No Direct Sensor Value Injection — The Closed Loop Must Use Malfunctions, Not Overrides

**What goes wrong:**
The closed-loop design assumes: "real pH reading → post to BioSim → BioSim pH changes." This is architecturally impossible. BioSim has **no API endpoint to inject sensor values or override module state**. The only way to influence BioSim's behavior from outside is via the malfunction API (`POST /malfunctions`, `DELETE /malfunctions`). BioSim computes all state internally from its physics model — external code cannot write to `Grey_Water_Store.currentLevel` or any other property.

**Why it happens:**
The `docs/biosim-integration-research.md` correctly lists the malfunction API, but the PROJECT.md requirement "real pH divergence triggers BioSim water recycling malfunctions" gets interpreted by implementors as "inject pH value," when the actual mechanism is: compare real pH to computed BioSim proxy pH, and when divergence exceeds a threshold, trigger a malfunction on `WaterRS` module. The BioSim internal state then degrades autonomously.

**How to avoid:**
Design the closed-loop control service as a **comparator + malfunction trigger**, not a value injector:
1. Real Pi pH reading (e.g., 5.2) — posted to Django `/api/sensor/ph/`
2. Django control service reads current BioSim proxy pH from `wr-ph` in `enriched_sensor_data`
3. Computes divergence: `abs(real_ph - biosim_ph) > threshold`
4. If divergent: `POST /api/simulation/{simID}/modules/WaterRS/malfunctions` with intensity based on divergence magnitude
5. When real pH normalizes: `DELETE /api/simulation/{simID}/modules/WaterRS/malfunctions`

The BioSim proxy pH (`wr-ph`) is a derived value in `biosim_ingest.py` (line 134: `(grey_level / grey_capacity) * 1.5 + 6.0`) — not a real pH measurement. The comparison is real sensor vs. simulation proxy, which is exactly the architectural intent.

**Warning signs:**
- Any design doc or plan that mentions "inject pH into BioSim" or "override BioSim water store"
- Looking for a `PUT /api/simulation/{simID}/modules/{name}` endpoint (it does not exist)
- Confusion about why the frontend WebSocket shows no change after a pH reading is posted

**Phase to address:** Closed-loop control service design phase. Clarify the architecture in the phase plan before a single line of control logic is written.

---

### Pitfall 5: The Sync Script Has a Hard-Coded GCP Dependency That Will Crash Immediately

**What goes wrong:**
`hubcode/snyc_to_postgres.py` line 7 sets `GOOGLE_APPLICATION_CREDENTIALS` and imports `google.cloud.pubsub_v1`. On a freshly reimaged Pi without the GCP service account JSON at `/home/pi/Medshift/spatialhub-service-account.json`, the import fails at startup with `google.auth.exceptions.DefaultCredentialsError`. The script is not optional — it is the sync mechanism. The new hubcode rewrite must eliminate this entirely.

**Why it happens:**
The existing sync was written for the original GCP pipeline (v1.0/v2.0). The v3.0 hubcode rewrite task in PROJECT.md calls for direct REST to Docker stack. The old file is still present and may be copy-pasted as a starting point.

**How to avoid:**
Delete or clearly mark `snyc_to_postgres.py` as deprecated. The new sync is a simple `requests.post()` to `http://{DOCKER_HOST}:{PORT}/api/sensor/ph/`. No GCP SDK, no service account, no Pub/Sub topic. The requirements file for the new hubcode must not include `google-cloud-pubsub`.

**Warning signs:**
- `snyc_to_postgres.py` is still being edited instead of replaced
- `google-cloud-pubsub` appears in any new `requirements.txt`
- Pi setup guide references service account JSON

**Phase to address:** Hubcode rewrite phase. Do not edit the old file — replace it entirely with config-driven REST client.

---

### Pitfall 6: Raspberry Pi OS Bookworm Blocks System-Wide pip — venv Is Mandatory

**What goes wrong:**
On Raspberry Pi OS Bookworm (the current default as of 2024), `pip install requests` fails with `error: externally-managed-environment`. System-wide pip installs are blocked by PEP 668. A naive setup guide that says "pip install -r requirements.txt" will fail immediately on a fresh Pi.

Additionally, `RPi.GPIO` — the classic GPIO library — is dropped in Bookworm in favor of `rpi-lgpio`. Any hubcode that imports `RPi.GPIO` will fail to install or fail at runtime. The hubcode currently uses `AtlasI2C.py` which uses `fcntl` directly (no GPIO library needed), so this is only relevant if the rewrite adds GPIO control (e.g., pump actuation).

**How to avoid:**
The Pi setup guide must:
1. Confirm Bookworm OS version: `cat /etc/os-release`
2. Create venv: `python3 -m venv --system-site-packages ~/spatialhub-venv`
3. Activate and install: `source ~/spatialhub-venv/bin/activate && pip install -r requirements.txt`
4. The `--system-site-packages` flag is required to access `smbus2` if it was installed via `apt install python3-smbus2`

The new hubcode requirements.txt should pin minimal dependencies: `requests`, `smbus2` (optional, for I2C testing), and nothing from GCP.

**Warning signs:**
- `pip install` fails with "externally-managed-environment" on the Pi
- `import RPi.GPIO` raises `ModuleNotFoundError` on Bookworm
- Developer tests on a Pi running Bullseye, guide writer assumes same behavior on Bookworm

**Phase to address:** Pi setup guide phase. The guide is the deliverable — venv setup is paragraph 1.

---

### Pitfall 7: Docker Host Not Reachable from Pi Over WiFi Without Static IP or Reliable DNS

**What goes wrong:**
The Pi posts to `http://{DOCKER_HOST}/api/sensor/ph/`. If `DOCKER_HOST` is a hostname like `macbook.local` or a DHCP IP that changes between reboots, the Pi loses the Django endpoint silently. Sensor data still gets written to SQLite locally, but nothing reaches the stack. The demo fails during a live presentation when the dev machine gets a new DHCP lease.

Additionally, on macOS (where Docker Desktop likely runs during development), `host.docker.internal` resolves inside containers but the Pi on WiFi cannot use it — that is a Docker-internal DNS alias.

**Why it happens:**
Local network address management is the most boring part of the project, so it gets skipped. mDNS (`macbook.local`) looks reliable but Avahi on Pi Bookworm + Docker on macOS interact unpredictably — Avahi may publish the Docker bridge IP alongside the WiFi IP, causing the Pi to route to an unreachable address.

**How to avoid:**
Use a static IP on the development machine's WiFi interface for the demo. Document this in the setup guide:
```bash
# On the Pi, set the DOCKER_HOST in config.json
{
  "docker_host": "192.168.1.50",  # static IP of dev machine
  "django_port": 8000,
  "hub_id": "pi-habitat-sensor-01"
}
```
The Pi setup guide must include "assign a static IP to your dev machine" or use `raspberrypi.local` only after confirming it resolves consistently on the target network.

For production-realistic setups, the Pi should retry on connection failure with exponential backoff and fall back to local SQLite buffering (exactly the existing `synced=0` pattern) — but the config must be correct on first boot.

**Warning signs:**
- Pi can ping the dev machine by IP but not by hostname
- `curl http://macbook.local:8000/api/` fails intermittently
- Django logs show no incoming requests from the Pi even though the script is running

**Phase to address:** Hubcode rewrite phase (config design) and Pi setup guide. Static IP requirement goes in the guide; retry logic goes in the hubcode.

---

### Pitfall 8: Real and Simulated pH Coexistence — Same sensor_id Namespace Will Collide

**What goes wrong:**
BioSim rows in `enriched_sensor_data` use `hub_id='biosim-habitat-01'` and `sensor_id='wr-ph'`. The real Pi pH sensor will also write to `enriched_sensor_data`. If the Pi rows use the same `sensor_id='wr-ph'` or the same `hub_id`, the frontend's zone panel cannot distinguish which value to display, historical queries mix real and simulated data, and the `/trends` endpoint returns a meaningless blend of physics-model proxies and actual probe readings.

**Why it happens:**
The existing model has no `data_source` discriminator field. When v3.0 adds a real sensor, the path of least resistance is to reuse the same `sensor_id` naming convention. The BioSim proxy `wr-ph` was always a fake — real pH should replace it visually but the old rows should remain for historical purposes.

**How to avoid:**
Assign the Pi sensor a distinct `hub_id` (e.g., `pi-habitat-sensor-01`) and a sensor-specific `sensor_id` (e.g., `pi-ph-probe`). The frontend water recycling zone panel can prioritize real sensor data when available by querying by `sensor_name='ph'` and ordering by `hub_id` precedence. The control service comparison logic queries by `sensor_name` across both hub IDs and computes divergence.

Do NOT add a migration to `enriched_sensor_data` to add a `data_source` column — that touches a table also written to by Cloud Functions, and the constraint says no new cloud infra. Keep hub_id as the discriminator.

**Warning signs:**
- Pi hubcode using `hub_id='biosim-habitat-01'` in its config
- Frontend query for `wr-ph` returning mixed BioSim and real rows in the same series
- `/trends` chart showing a step discontinuity when real sensor comes online

**Phase to address:** Hubcode rewrite phase (Pi client config) and Django ingest endpoint design. The `hub_id` must be set correctly before any data is written.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep existing `AtlasI2C.py` with `[0:4]` strip | Avoids rewrite | Silent pH truncation above 9.999 | Never — fix before use |
| Use mDNS hostname for `DOCKER_HOST` | Easier dev setup | Demo fails on network change | Never for portfolio demos |
| Hardcode `HUB_ID` in Pi script | Quick start | All Pis report same hub, data collides if two Pis run | Acceptable for single-Pi demo, must be documented |
| Skip venv on Pi, use `--break-system-packages` | Faster install | Corrupts OS Python, fails on fresh reimages | Never — venv is 2 commands |
| Use same `sensor_id` namespace for real and BioSim data | No frontend changes | Unmixable blended data stream | Never — assign distinct hub_id |
| Poll BioSim state directly from Pi instead of via Django | Simpler architecture | Pi now depends on both Docker network and BioSim API structure | Never — Django is the integration boundary |

---

## Integration Gotchas

Common mistakes when connecting the Pi to the existing stack.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Atlas EZO pH | Assume UART mode works on I2C bus | Switch to I2C mode (PGND-TX jumper) before any software testing |
| Atlas EZO pH | Parse response as `string[0:4]` | Strip null bytes and cast full trimmed string to float |
| BioSim malfunction API | POST pH value to BioSim expecting it to change water pH | POST malfunction to `WaterRS` when real pH diverges from proxy |
| Django ingest endpoint | Reuse BioSim `hub_id` for Pi readings | Use distinct `hub_id` (`pi-habitat-sensor-01`) and `sensor_id` |
| Pi network | Rely on mDNS (`macbook.local`) for Docker host | Use static IP in `config.json`, document in setup guide |
| Pi Python env | `pip install` system-wide on Bookworm | Create venv with `--system-site-packages`, activate before install |
| `snyc_to_postgres.py` | Edit the existing GCP sync script | Delete it; replace with a config-driven `requests.post()` client |
| I2C bus speed | Leave default 400 kHz on Pi 3/4 | Add `dtparam=i2c_arm_baudrate=10000` to `/boot/firmware/config.txt` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Blocking I2C read inside the sensor loop with no timeout | Script hangs indefinitely if EZO stops responding | Wrap `device.query_device_data()` in a `threading.Timer` or use `signal.alarm` | First time the sensor drops off the bus |
| Writing to SQLite and POSTing to Django synchronously in the same loop | 5s sensor interval becomes 5s + network RTT; readings pile up | Separate read/write/sync threads or use async; or keep sync as a separate process (existing pattern is correct) | Network latency > 4.5s (rare but possible on congested WiFi) |
| Opening new SQLite connection per insert | No perf issue at 5s interval, but wastes file handles | Use a persistent connection or connection pool | N/A for this scale |
| BioSim proxy pH comparison against a stale `enriched_sensor_data` row | Control service triggers malfunction based on 60-second-old simulation state | Query only rows within the last 2 ticks (10 seconds); discard stale comparisons | Whenever the Django bridge experiences lag |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **EZO I2C mode:** `i2cdetect -y 1` must show `63` — if not, the sensor is in UART mode and nothing will work
- [ ] **I2C bus speed:** `dtparam=i2c_arm_baudrate=10000` must be in config.txt — default 400 kHz causes intermittent drops
- [ ] **pH parsing:** `float(stripped[0:4])` is not float-safe for pH >= 10.0 or negative readings — verify with pH 10 buffer solution
- [ ] **BioSim no-injection:** confirm the control service design uses malfunctions, not state writes — re-read the API reference
- [ ] **Namespace separation:** Pi `hub_id` must be different from `biosim-habitat-01` — verify in config before first run
- [ ] **Static IP:** dev machine must have a fixed IP documented in the Pi config — test by rebooting the dev machine and confirming Pi reconnects
- [ ] **venv activation:** Pi systemd service or cron job must activate the venv before running the script — `python3 sensor_logger.py` from outside the venv will fail to import `AtlasI2C`
- [ ] **GCP removal:** `google-cloud-pubsub` must not appear in any new requirements.txt — run `pip show google-cloud-pubsub` in the Pi venv to confirm

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| pH truncation produces corrupt historical data | MEDIUM | Delete affected rows from `enriched_sensor_data` where `hub_id='pi-habitat-sensor-01'` and `sensor_val` < 10; patch the parser; re-run |
| EZO stuck in UART mode on a demo day | LOW | Short PGND-TX jumper, power-cycle — 30-second fix; keep a jumper wire on the bench |
| I2C bus drop-off during demo | LOW | Physical power-cycle of EZO board only (no Pi reboot needed); increase I2C delay in script |
| BioSim no-injection discovery mid-build | MEDIUM | Redesign control service as comparator+trigger (the correct architecture); existing malfunction API is sufficient — no BioSim changes needed |
| Pi DHCP IP change breaks Django connection | LOW | Update `DOCKER_HOST` in `config.json`; assign static IP going forward; restart Pi script |
| Mixed real/simulated data in DB | HIGH | Requires identifying and deleting misattributed rows; no migration needed if `hub_id` is the discriminator — but fixing retroactively is painful |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 4-char pH strip bug | Hubcode rewrite | Unit test: parse `"7.312"`, `"10.14"`, `"14.00"` — all return correct float |
| EZO UART/I2C mode confusion | Pi setup guide | `i2cdetect -y 1` shows `63` before running any code |
| I2C bus speed 400 kHz drops | Pi setup guide | `/boot/firmware/config.txt` contains `i2c_arm_baudrate=10000`; 24h stress test |
| BioSim no-injection architectural limit | Closed-loop design | Phase plan explicitly states "malfunction trigger, not value inject" |
| GCP dependency in sync script | Hubcode rewrite | `grep -r "google.cloud" hubcode/` returns nothing |
| Bookworm pip blocked | Pi setup guide | `python3 -m venv --system-site-packages` documented as Step 1 |
| Network discovery instability | Hubcode rewrite + Pi setup guide | Static IP config in `config.json`; curl test from Pi to Django before demo |
| hub_id collision between Pi and BioSim | Hubcode rewrite | Pi config uses `pi-habitat-sensor-01`; Django endpoint test confirms rows stored with correct `hub_id` |

---

## Sources

- Code analysis: `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/hubcode/AtlasI2C.py` lines 150–151, 195–196 (4-char strip)
- Code analysis: `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/hubcode/snyc_to_postgres.py` lines 7–9 (GCP hard-coding)
- Code analysis: `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/django_backend/sensor_data/biosim_ingest.py` lines 29, 134 (hub_id namespace, pH proxy formula)
- [Raspberry Pi Forums: Atlas Scientific OEM pH Sensor I2C issues](https://forums.raspberrypi.com/viewtopic.php?t=304760)
- [Raspberry Pi Forums: Atlas pH EZO solved — I2C vs UART mode](https://forums.raspberrypi.com/viewtopic.php?t=127133)
- [Raspberry Pi Forums: RPi 5 Atlas Scientific pH sensor issues](https://forums.raspberrypi.com/viewtopic.php?t=364457)
- [Atlas Scientific: pH EZO Datasheet — I2C timing specs](https://files.atlas-scientific.com/pH_EZO_Datasheet.pdf)
- [Atlas Scientific: How to calibrate a pH meter](https://atlas-scientific.com/blog/how-to-calibrate-ph-meter/)
- [Atlas Scientific: EZO I2C library — GitHub](https://github.com/Atlas-Scientific/Ezo_I2c_lib)
- [Jeff Geerling: Resolving DNS failure on Pi OS Bookworm with Docker](https://www.jeffgeerling.com/blog/2024/resolving-temporary-failure-name-resolution-on-pi-os-12-bookworm/)
- [Raspberry Pi Forums: Bookworm Python library hell (pip blocked)](https://forums.raspberrypi.com/viewtopic.php?t=358063)
- [Pimoroni: Python venv on Bookworm](https://pimoroni.github.io/venv-python/)
- [BioSim GitHub: scottbell/biosim — REST API (no state-inject endpoint)](https://github.com/scottbell/biosim)
- [Raspberry Pi Forums: I2C multi-threading contention](https://forums.raspberrypi.com/viewtopic.php?t=325971)
- [mDNS in Docker containers — Nathan Peck](https://nathanpeck.com/mdns-resolution-in-scratch-docker-containers/)

---
*Pitfalls research for: Physical sensor integration (Raspberry Pi + Atlas Scientific I2C → BioSim closed-loop)*
*Researched: 2026-03-18*
