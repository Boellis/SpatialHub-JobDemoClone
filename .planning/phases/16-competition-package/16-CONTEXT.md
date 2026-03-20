# Phase 16: Competition Package - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A complete competition submission package — SD card preparation instructions, cloud deployment verification checklist, and a demo walkthrough so a NASA judge can go from "unboxing the Pi" to "seeing live pH data in the 3D Mars habitat" in under 15 minutes. Documentation only — no code changes.

</domain>

<decisions>
## Implementation Decisions

### Guide structure
- **Two documents:**
  1. `COMPETITION_GUIDE.md` (repo root) — The judge-facing document. Covers hardware setup, software setup, and the demo walkthrough. This is what ships on the SD card.
  2. `deploy/DEPLOY_CHECKLIST.md` — Deployer-facing verification checklist for cloud services. Ensures all GCP resources are live before handing off to a judge.
- Single markdown files, no external dependencies (no generated PDFs, no web hosting)

### Guide sections (COMPETITION_GUIDE.md)
1. **Prerequisites** — What's in the box (Pi, Atlas sensor, breadboard, jumper wires), what the judge provides (WiFi, monitor optional, power supply)
2. **Hardware Setup** (~5 min) — EZO I2C mode switch (PGND-TX jumper + power cycle), breadboard wiring diagram (SDA/SCL/VCC/GND), sensor connection verification
3. **Software Setup** (~5 min) — SD card already pre-flashed with Raspberry Pi OS + hub_client. Judge edits `.env` for WiFi credentials only. Boot, SSH, start hub_client
4. **Demo Walkthrough** (~5 min) — Scripted sequence with expected outcomes at each step. The "wow" moment.

### Audience assumptions
- Technical evaluator — comfortable with terminal, SSH, editing a config file
- Can flash an SD card if needed (Raspberry Pi Imager), but the SD card ships pre-configured
- Has WiFi network with internet access (no captive portals)
- Does NOT need to know Docker, GCP, Django, or React
- Steps are explicit: exact commands with expected output, not "configure your network"

### Demo walkthrough sequence
1. **Verify data flowing:** Open `https://nasa-comp-demo.web.app/enriched`, filter by `hub_id=pi-habitat-01`, confirm rows appearing every 10s
2. **Open 3D habitat:** Navigate to `/habitat`, confirm BioSim connected (green badge), wait for teal "BioSim + Real Sensor" badge
3. **The wow:** Click Water Recycling zone → see LIVE pH reading. Dip sensor in vinegar → zone turns red within ~10s. Badge stays teal.
4. **Recovery:** Rinse sensor in water → pH normalizes → zone turns green → automatic recovery
5. **Troubleshooting:** "If you don't see data" → check WiFi, check hub_client logs, check Cloud Run URL. "If zone doesn't turn red" → check control_loop logs on VM.

### Deploy checklist (DEPLOY_CHECKLIST.md)
- Cloud SQL instance running and accessible
- Cloud Run service healthy (GET /api/enriched/ returns 200)
- Firebase Hosting serving latest build
- GCE VM running with biosim, bridge, control_loop all healthy
- BioSim simulation active (GET {VM_IP}:8009/api/simulation returns simID)
- Pi `.env` has correct Cloud Run URL

### SD card contents
- Raspberry Pi OS (64-bit Lite) pre-configured with SSH enabled
- `hub_client.py`, `atlas_i2c.py`, `.env` pre-installed in `/home/pi/hubcode/`
- `.env` pre-configured with Cloud Run URL, HUB_ID, SENSOR_ID — judge only needs to set WiFi
- Auto-start via systemd or cron on boot (Claude's discretion on mechanism)

### Claude's Discretion
- Exact wiring diagram format (ASCII art vs description vs both)
- Whether to include screenshots of the 3D habitat in expected states
- Systemd unit vs cron @reboot for hub_client auto-start
- Whether `.env` WiFi config uses `wpa_supplicant` or `nmcli` instructions
- Markdown formatting and section ordering within each document
- Whether troubleshooting is inline per step or a separate section at the end

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hub client
- `hubcode/hub_client.py` — Pi client with --test mode, .env config, SQLite buffer
- `hubcode/.env.example` — All 10 config fields documented
- `hubcode/atlas_i2c.py` — I2C driver, MSB glitch handling, detect_devices()

### Deployment
- `deploy/deploy.sh` — Full idempotent deployment script (Cloud SQL + Cloud Run + Firebase + GCE VM)
- `deploy/teardown.sh` — VM stop/delete for cost management
- `docker-compose.vm.yml` — GCE VM services (biosim, bridge, control_loop, caddy, openmct)

### Known hardware issues (from STATE.md)
- Atlas EZO ships in UART mode — I2C needs PGND-TX jumper + power cycle
- I2C baud rate must be 10000 Hz in `/boot/firmware/config.txt`
- Default 400 kHz causes sensor drop-off after 30-60 min

### Cloud endpoints
- Cloud Run: `https://spatialhub-backend-4vovlomqfa-uc.a.run.app`
- Firebase: `https://nasa-comp-demo.web.app`
- GCE VM IP: documented in deploy.sh output

### Requirements
- `.planning/REQUIREMENTS.md` — SETUP-01, SETUP-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hubcode/.env.example`: Template with all config fields — basis for SD card `.env`
- `deploy/deploy.sh`: Smoke checks in Sections 8 and 16 — reusable as deploy checklist verification commands
- `hub_client.py --test`: Dry-run mode that validates sensor connectivity without posting to Django

### Established Patterns
- `deploy.sh` idempotent provisioning pattern — deploy checklist mirrors its sections
- `.env` config pattern — judge only touches WiFi, everything else pre-configured

### Integration Points
- SD card `.env` → Cloud Run URL (must match deployed service)
- `hub_client.py` → Cloud SQL via Cloud Run → frontend via API polling
- `control_loop` on VM → BioSim malfunction API → frontend WebSocket → 3D habitat zone status

</code_context>

<specifics>
## Specific Ideas

- The SD card should be as close to "plug and play" as possible — minimize judge setup steps
- The guide's tone should be professional but not dry — this is a competition submission, it should convey competence and polish
- Include the exact vinegar/water demo sequence with timing expectations so the judge knows what to look for
- "Under 15 minutes" target from roadmap — budget 5 min hardware, 5 min software, 5 min demo

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-competition-package*
*Context gathered: 2026-03-20*
