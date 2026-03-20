# SpatialHub Mars Habitat Demo -- Competition Setup Guide

A NASA judge with a Raspberry Pi and Atlas Scientific pH sensor can follow this guide from unboxing to seeing live pH data driving the 3D Mars habitat in under 15 minutes.

---

## 1. Prerequisites

### What ships in the box

- Raspberry Pi 4 (4GB+)
- Atlas Scientific pH EZO circuit board
- EZO carrier board or half-size breadboard
- Jumper wires (SDA, SCL, VCC, GND) -- at least 4
- Micro-USB pH probe with BNC connector
- SD card (pre-flashed with Raspberry Pi OS 64-bit Lite + hub software)

### What you provide

- WiFi network with internet access (no captive portals, no enterprise auth required)
- USB-C power supply for the Pi (5V/3A minimum)
- Monitor + micro-HDMI cable (optional -- SSH works headless after initial WiFi config)

**The SD card ships pre-configured. You will only need to set your WiFi credentials.**

---

## 2. Hardware Setup (~5 min)

### 2.1 EZO I2C Mode Switch

The Atlas EZO pH circuit ships in UART mode by default. I2C mode requires a one-time physical configuration.

1. With power **OFF**, connect a jumper wire from the **PGND** pin to the **TX** pin on the EZO circuit board.
2. Power on the Pi.
3. Wait for the EZO LED to change from **green** to **blue** -- this confirms I2C mode is active.
4. Remove the PGND-TX jumper wire.
5. Power cycle the Pi once more.

> **Note:** This only needs to be done once. The EZO remembers its mode after power cycling.

### 2.2 Breadboard Wiring

Connect the Atlas EZO to the Pi GPIO header using 4 jumper wires:

```
Pi GPIO Pin 1  (3.3V)  --> EZO VCC
Pi GPIO Pin 3  (SDA1)  --> EZO SDA
Pi GPIO Pin 5  (SCL1)  --> EZO SCL
Pi GPIO Pin 6  (GND)   --> EZO GND
```

Connect the pH probe to the **BNC connector** on the EZO carrier board.

### 2.3 I2C Bus Configuration

Add the following line to `/boot/firmware/config.txt`:

```
dtparam=i2c_arm=on,i2c_arm_baudrate=10000
```

**Why:** The default 400 kHz baud rate causes sensor drop-off after 30-60 minutes of operation. Setting 10 kHz ensures stable long-term I2C communication with the EZO circuit.

Reboot after making this change:

```bash
sudo reboot
```

> **Note:** The SD card ships with this setting already applied. You only need this step if you reflash the SD card.

### 2.4 Verify Sensor Connection

After boot, run:

```bash
i2cdetect -y 1
```

Expected output: address `63` (hexadecimal) appears in the detection grid. This is the default I2C address for the Atlas EZO pH circuit (0x63 = 99 decimal).

If nothing appears in the grid: go back to Section 2.1. The EZO is likely still in UART mode.

---

## 3. Software Setup (~5 min)

### 3.1 SD Card Contents (Pre-installed)

The following files are already on the SD card at `/home/pi/hubcode/`:

- `hub_client.py` -- main sensor polling and sync client
- `atlas_i2c.py` -- I2C driver for Atlas EZO sensors
- `requirements.txt` -- Python dependencies
- `.env` -- pre-configured with Cloud Run URL and sensor identity

Python dependencies (`requests`, `python-dotenv`) are pre-installed in the system Python environment.

### 3.2 Configure WiFi

**Option A: raspi-config (recommended)**

```bash
sudo raspi-config
```

Navigate to: `System Options` > `Wireless LAN` > enter your SSID and password.

**Option B: Edit wpa_supplicant directly**

Edit `/etc/wpa_supplicant/wpa_supplicant.conf` and add:

```
country=US
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="YourNetworkName"
    psk="YourPassword"
}
```

Verify connectivity:

```bash
ping -c 3 google.com
```

### 3.3 Configure .env (if needed)

The `.env` is pre-configured for the competition deployment. Verify it looks like this:

```
HUB_ID=pi-habitat-01
SENSOR_ID=wr-ph-real
SENSOR_NAME=pH
DEVICE_ADDR=99
DJANGO_URL=https://spatialhub-backend-4vovlomqfa-uc.a.run.app
LOCATION=Water Recycling
OWNER=Mars Habitat
WORKERS=Crew Alpha
POLL_INTERVAL=5
```

> **Note:** The only field you may need to change is `DJANGO_URL` if the Cloud Run service has been redeployed to a new URL.

### 3.4 Start the Sensor Client

```bash
cd /home/pi/hubcode && python hub_client.py
```

Expected startup output:

```
[INFO] Starting hub_client (pi-habitat-01)
[INFO] Poll: 5s / Django: https://spatialhub-backend-4vovlomqfa-uc.a.run.app
[INFO] Detected I2C devices: [99]
[12:34:56] pH=7.02 -> synced
```

If `synced` appears: data is flowing to the cloud. If `buffered (offline)` appears: check WiFi connectivity and verify the `DJANGO_URL` in `.env`.

### 3.5 Test Mode (Quick End-to-End Check)

Read one sensor value, POST once, exit:

```bash
python hub_client.py --test
```

Use this to verify sensor connectivity and cloud sync without starting the continuous poll loop.

### 3.6 Auto-start on Boot

The systemd service `hubclient.service` is pre-installed and enabled on the SD card. The sensor client starts automatically on boot -- no manual intervention needed.

For reference, the unit file is at `/etc/systemd/system/hubclient.service`:

```ini
[Unit]
Description=SpatialHub pH Sensor Client
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/hubcode
ExecStart=/usr/bin/python3 hub_client.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Check status at any time:

```bash
sudo systemctl status hubclient
```

To manually restart:

```bash
sudo systemctl restart hubclient
```

---

## 4. Demo Walkthrough (~5 min)

### 4.1 Verify Data Flowing

Open `https://nasa-comp-demo.web.app/enriched` in a browser.

Filter by hub_id: look for rows with `hub_id = pi-habitat-01`. New rows appear every 5 seconds with real pH readings -- typically 6.5-7.5 for tap water.

### 4.2 Open the 3D Habitat

Navigate to `https://nasa-comp-demo.web.app/habitat`.

Confirm: a green **"BioSim Connected"** badge appears in the HUD overlay. This indicates the frontend has established a WebSocket connection to the BioSim life support simulation running on the GCE VM.

Wait 5-10 seconds: the badge changes to teal **"BioSim + Real Sensor"**. This confirms the Pi's pH data is being received alongside the BioSim simulation -- two independent sources merging in real time.

### 4.3 The Wow Moment

1. Click the **Water Recycling** zone in the 3D habitat.
2. The zone panel shows two pH values: the BioSim simulated pH and a **"Real pH"** annotation sourced from the Pi sensor.
3. **Dip the pH probe into vinegar** (acetic acid, pH ~2.5).
4. Within **~10 seconds**: the Water Recycling zone turns **RED** as the closed-loop control system detects divergence between the Pi pH reading and the BioSim simulation value, and triggers a BioSim malfunction.
5. The teal badge remains -- real sensor data continues flowing throughout the anomaly.

### 4.4 Recovery

Rinse the pH probe in tap water or pH 7.0 buffer solution.

Within **~10 seconds**: pH normalizes, the control loop detects recovery, cancels the BioSim malfunction, and the Water Recycling zone returns to **GREEN**.

No manual intervention required. This is fully autonomous closed-loop control: sensor reads pH -> control loop compares to simulation -> triggers/cancels malfunction -> 3D visualization responds.

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `i2cdetect` shows no devices | EZO in UART mode | Redo Section 2.1 (PGND-TX jumper, power cycle) |
| `pH=X.XX -> buffered (offline)` | Can't reach Cloud Run | Check WiFi (`ping google.com`), verify `DJANGO_URL` in `.env` |
| Hub badge stays green (no teal) | Pi data not reaching frontend | Check hub_client is running (`sudo systemctl status hubclient`), verify Cloud Run URL responds: `curl https://spatialhub-backend-4vovlomqfa-uc.a.run.app/api/enriched/?hub_id=pi-habitat-01` |
| Zone doesn't turn red with vinegar | Control loop not running | SSH to VM: `sudo docker compose -f /opt/spatialhub/docker-compose.vm.yml logs control_loop` |
| Sensor values drift after 30+ min | I2C baud rate too high | Verify `/boot/firmware/config.txt` has `i2c_arm_baudrate=10000`, reboot |
| `Sensor error code: 255` | No data ready | Wait 2 seconds between reads (driver uses 1.5s LONG_TIMEOUT). Check probe BNC connection. |

---

## 6. Architecture Overview (Reference)

The Pi reads pH via I2C -> `hub_client.py` POSTs the reading to the Cloud Run Django API -> stored in Cloud SQL PostgreSQL -> the React frontend polls the API every few seconds for real sensor values.

In parallel, a NASA BioSim life support simulator runs on a GCE VM. A bridge service ingests BioSim WebSocket telemetry ticks into Cloud SQL. The frontend connects to BioSim via WebSocket for real-time 3D physics and zone status. A `control_loop` service on the VM reads both Pi pH and BioSim pH values from Cloud SQL, and triggers or cancels BioSim malfunctions (specifically the `Grey_Water_Store` malfunction) when the two values diverge beyond a 0.5 unit threshold. The 3D habitat visualization responds to malfunction state changes in real time.

### Reference URLs

| Resource | URL |
|----------|-----|
| Dashboard | `https://nasa-comp-demo.web.app` |
| API (Cloud Run) | `https://spatialhub-backend-4vovlomqfa-uc.a.run.app` |
| BioSim VM | Documented in `deploy/deploy.sh` output |
