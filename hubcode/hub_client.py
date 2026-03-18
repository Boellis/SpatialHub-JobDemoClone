"""
hub_client.py -- Raspberry Pi sensor client for SpatialHub.

Reads pH (or any Atlas EZO I2C sensor), buffers readings to SQLite,
and syncs to the Django REST API via HTTP POST.

Config is loaded from a .env file (see .env.example).

Usage:
    python hub_client.py           # Normal poll loop
    python hub_client.py --test    # One-shot: read, POST, print result, exit
    python hub_client.py -v        # Verbose HTTP logging
    python hub_client.py --test -v # Both
"""
import argparse
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config loading -- must happen before any function uses these module globals
# so that tests can patch os.environ before importing this module.
# ---------------------------------------------------------------------------
load_dotenv()

HUB_ID = os.environ.get("HUB_ID", "")
SENSOR_ID = os.environ.get("SENSOR_ID", "")
SENSOR_NAME = os.environ.get("SENSOR_NAME", "")
DEVICE_ADDR = os.environ.get("DEVICE_ADDR", "")
LOCATION = os.environ.get("LOCATION", "")
OWNER = os.environ.get("OWNER", "")
WORKERS = os.environ.get("WORKERS", "")
DJANGO_URL = os.environ.get("DJANGO_URL", "")
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "5") or "5")

# ---------------------------------------------------------------------------
# SQLite buffer -- DB_FILE is overridable for tests
# ---------------------------------------------------------------------------
DB_FILE = str(Path(__file__).parent / "hub_buffer.db")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def init_db():
    """Create the readings table if it doesn't exist."""
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hub_id TEXT NOT NULL,
                sensor_id TEXT NOT NULL,
                sensor_name TEXT NOT NULL,
                device_addr TEXT NOT NULL,
                sensor_val REAL NOT NULL,
                datetime TEXT NOT NULL,
                location TEXT NOT NULL,
                owner TEXT NOT NULL,
                workers TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.commit()


def buffer_reading(payload: dict):
    """Insert a reading into the local SQLite buffer with synced=0."""
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            """
            INSERT INTO readings
                (hub_id, sensor_id, sensor_name, device_addr, sensor_val,
                 datetime, location, owner, workers, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                payload["hub_id"],
                payload["sensor_id"],
                payload["sensor_name"],
                payload["device_addr"],
                payload["sensor_val"],
                payload["datetime"],
                payload["location"],
                payload["owner"],
                payload["workers"],
            ),
        )
        conn.commit()


def get_unsynced() -> list:
    """Return all unsynced rows as a list of dicts, ordered by id."""
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM readings WHERE synced = 0 ORDER BY id"
        ).fetchall()
    return [dict(row) for row in rows]


def mark_synced_and_prune():
    """Mark all pending rows synced=1, then delete all synced rows."""
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute("UPDATE readings SET synced = 1 WHERE synced = 0")
        conn.execute("DELETE FROM readings WHERE synced = 1")
        conn.commit()


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------

def build_payload(sensor_val: float) -> dict:
    """
    Build the full 9-field payload dict for the sensor-ingest endpoint.

    Uses timezone-aware UTC datetime to avoid naive-datetime issues with
    PostgreSQL when USE_TZ=True is set in Django settings.
    """
    return {
        "hub_id": HUB_ID,
        "sensor_id": SENSOR_ID,
        "sensor_name": SENSOR_NAME,
        "device_addr": DEVICE_ADDR,
        "sensor_val": sensor_val,
        "datetime": datetime.now(timezone.utc).isoformat(),
        "location": LOCATION,
        "owner": OWNER,
        "workers": WORKERS,
    }


# ---------------------------------------------------------------------------
# Sync loop
# ---------------------------------------------------------------------------

def sync_readings():
    """
    POST all unsynced readings to Django as a JSON batch.

    On 201 response: mark rows synced and prune.
    On network error or non-201 response: leave rows buffered (they'll
    be included in the next sync attempt).
    """
    rows = get_unsynced()
    if not rows:
        return

    # Build batch -- strip the internal 'id' and 'synced' columns
    batch = [
        {
            "hub_id": r["hub_id"],
            "sensor_id": r["sensor_id"],
            "sensor_name": r["sensor_name"],
            "device_addr": r["device_addr"],
            "sensor_val": r["sensor_val"],
            "datetime": r["datetime"],
            "location": r["location"],
            "owner": r["owner"],
            "workers": r["workers"],
        }
        for r in rows
    ]

    url = f"{DJANGO_URL}/api/sensor-ingest/"
    try:
        response = requests.post(url, json=batch, timeout=10)
        if response.status_code in (200, 201):
            mark_synced_and_prune()
            synced_count = len(rows)
            log.debug("Synced %d reading(s) to Django.", synced_count)
            return synced_count
        else:
            log.warning(
                "Sync failed: HTTP %d from %s. Keeping rows buffered.",
                response.status_code, url,
            )
    except requests.exceptions.ConnectionError as exc:
        log.warning("Sync offline: %s. Keeping rows buffered.", exc)
    except requests.exceptions.Timeout:
        log.warning("Sync timed out after 10s. Keeping rows buffered.")

    return 0


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="SpatialHub Pi sensor client")
    parser.add_argument(
        "--test",
        action="store_true",
        help="Read one sensor value, POST to Django, print result, then exit.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose HTTP logging (DEBUG level).",
    )
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
        logging.getLogger("urllib3").setLevel(logging.DEBUG)

    # Late import -- atlas_i2c requires actual I2C hardware on the Pi
    from atlas_i2c import AtlasI2C

    init_db()

    # Startup banner
    detected = AtlasI2C.detect_devices()
    log.info("[INFO] Starting hub_client (%s)", HUB_ID)
    log.info("[INFO] Poll: %ss / Django: %s", int(POLL_INTERVAL), DJANGO_URL)
    log.info("[INFO] Detected I2C devices: %s", detected)

    if args.test:
        sensor = AtlasI2C(address=int(DEVICE_ADDR))
        try:
            val = sensor.query("R")
            payload = build_payload(val)
            buffer_reading(payload)
            synced = sync_readings()
            status = "synced" if synced else "buffered (offline)"
            print(f"[TEST] pH={val:.3f} -> {status}")
            print(f"[TEST] Payload: {payload}")
        finally:
            sensor.close()
        return

    # Normal poll loop
    sensor = AtlasI2C(address=int(DEVICE_ADDR))
    try:
        while True:
            try:
                val = sensor.query("R")
                payload = build_payload(val)
                buffer_reading(payload)
                synced = sync_readings()

                ts = datetime.now().strftime("%H:%M:%S")
                unsynced_remaining = len(get_unsynced())
                if synced and unsynced_remaining == 0:
                    log.info("[%s] pH=%.2f -> synced", ts, val)
                elif synced and unsynced_remaining > 0:
                    log.info("[%s] pH=%.2f -> synced (+ %d buffered)", ts, val, unsynced_remaining)
                else:
                    log.info("[%s] pH=%.2f -> buffered (offline)", ts, val)

            except ValueError as exc:
                log.warning("Sensor read error: %s. Skipping cycle.", exc)
            except Exception as exc:
                log.warning("Unexpected error: %s. Continuing.", exc)

            time.sleep(POLL_INTERVAL)
    finally:
        sensor.close()


if __name__ == "__main__":
    main()
