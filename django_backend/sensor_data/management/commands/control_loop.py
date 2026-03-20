"""
control_loop — Django management command.

Closed-loop pH control service. Polls Cloud SQL every 10 seconds, compares
real Pi pH to BioSim simulated pH, and triggers/clears Grey_Water_Store
malfunctions via BioSim REST API based on divergence thresholds with hysteresis.

State machine:
  - If |pi_ph - biosim_ph| >= PH_THRESHOLD and not malfunction_active:
      POST malfunction (trigger)
  - If malfunction_active and |pi_ph - biosim_ph| < (PH_THRESHOLD - 0.1):
      DELETE malfunction (recovery with hysteresis deadband)
  - If Pi data is older than STALE_SECONDS: hold current state, no changes

Usage:
    python manage.py control_loop

Environment:
    BIOSIM_URL      Base URL of the BioSim server (default: http://biosim:8009)
    PH_THRESHOLD    pH divergence threshold to trigger malfunction (default: 0.5)
    STALE_SECONDS   Max age in seconds before Pi data is considered stale (default: 60)
"""

import os
import time

import requests
from django.core.management.base import BaseCommand
from django.utils import timezone

from sensor_data.models import EnrichedSensorData

# ---------------------------------------------------------------------------
# Module-level constants (configurable via env vars)
# ---------------------------------------------------------------------------

BIOSIM_URL = os.environ.get('BIOSIM_URL', 'http://biosim:8009')
PH_THRESHOLD = float(os.environ.get('PH_THRESHOLD', '0.5'))
STALE_SECONDS = int(os.environ.get('STALE_SECONDS', '60'))
POLL_INTERVAL = 10           # seconds between each cycle
HEARTBEAT_INTERVAL = 6       # emit heartbeat every N loops (~60 seconds)
MODULE_NAME = 'Grey_Water_Store'

PI_HUB_ID = 'pi-habitat-01'
PI_SENSOR_ID = 'wr-ph-real'
BIOSIM_HUB_ID = 'biosim-habitat-01'
BIOSIM_SENSOR_ID = 'wr-ph'


# ---------------------------------------------------------------------------
# Module-level helper functions (importable for testing)
# ---------------------------------------------------------------------------

def get_latest(hub_id, sensor_id):
    """Return the most recent EnrichedSensorData row for the given hub/sensor, or None."""
    return (
        EnrichedSensorData.objects.filter(hub_id=hub_id, sensor_id=sensor_id)
        .order_by('-datetime')
        .first()
    )


def is_stale(row, stale_seconds):
    """Return True if row is None or older than stale_seconds."""
    if row is None:
        return True
    age = (timezone.now() - row.datetime).total_seconds()
    return age > stale_seconds


def probe_sim_id(biosim_url):
    """
    GET /api/simulation and return the first simulation ID, or None.

    Handles both response shapes:
      - {"simulations": [1]}  (wrapped)
      - [1]                   (bare array)

    Returns None instead of raising so the caller can retry.
    """
    resp = requests.get(f"{biosim_url}/api/simulation")
    resp.raise_for_status()
    data = resp.json()

    if isinstance(data, list):
        sims = data
    else:
        sims = data.get('simulations', [])

    return sims[0] if sims else None


def post_malfunction(biosim_url, sim_id):
    """
    POST a SEVERE_MALF/TEMPORARY_MALF malfunction to the Grey_Water_Store module.

    Returns the malfunctionID from the response.
    Raises requests.RequestException on HTTP error.
    """
    url = f"{biosim_url}/api/simulation/{sim_id}/modules/{MODULE_NAME}/malfunctions"
    resp = requests.post(url, json={'intensity': 'SEVERE_MALF', 'length': 'TEMPORARY_MALF'})
    resp.raise_for_status()
    return resp.json()['malfunctionID']


def delete_malfunction(biosim_url, sim_id, malfunction_id):
    """
    DELETE a malfunction from the Grey_Water_Store module.

    Returns resp.ok.
    """
    url = f"{biosim_url}/api/simulation/{sim_id}/modules/{MODULE_NAME}/malfunctions/{malfunction_id}"
    resp = requests.delete(url)
    return resp.ok


# ---------------------------------------------------------------------------
# Command class
# ---------------------------------------------------------------------------

class Command(BaseCommand):
    help = (
        "Closed-loop pH control: monitors Pi vs BioSim pH divergence "
        "and triggers Grey_Water_Store malfunctions"
    )

    def handle(self, *args, **options):
        self.stdout.write(
            f"[control_loop] Starting -- BIOSIM_URL={BIOSIM_URL}, "
            f"PH_THRESHOLD={PH_THRESHOLD}, STALE_SECONDS={STALE_SECONDS}"
        )
        self.stdout.write(
            f"[control_loop] Querying Pi: hub_id={PI_HUB_ID}, sensor_id={PI_SENSOR_ID}"
        )
        self.stdout.write(
            f"[control_loop] Querying BioSim: hub_id={BIOSIM_HUB_ID}, sensor_id={BIOSIM_SENSOR_ID}"
        )

        sim_id = self._probe_with_retry()

        malfunction_active = False
        malfunction_id = None
        was_stale = False
        loop_count = 0

        while True:
            loop_count += 1
            malfunction_active, malfunction_id, was_stale = self._run_cycle(
                sim_id, loop_count, malfunction_active, malfunction_id, was_stale
            )
            time.sleep(POLL_INTERVAL)

    def _probe_with_retry(self):
        """Probe BioSim for an active simulation ID, with exponential backoff."""
        delays = [2, 4, 8, 16, 30]
        attempt = 0

        while True:
            try:
                sim_id = probe_sim_id(BIOSIM_URL)
                if sim_id is not None:
                    self.stdout.write(f"[control_loop] Found simulation ID: {sim_id}")
                    return sim_id
                self.stdout.write("[control_loop] No active simulation found, retrying...")
            except Exception as e:
                self.stdout.write(f"[control_loop] BioSim probe failed ({e}), retrying...")

            delay = delays[min(attempt, len(delays) - 1)]
            time.sleep(delay)
            attempt += 1

    def _run_cycle(self, sim_id, loop_count, malfunction_active, malfunction_id, was_stale):
        """
        Core state machine cycle. Returns (malfunction_active, malfunction_id, was_stale).

        1. Fetch latest Pi pH row.
        2. If stale: hold current state, log once on transition.
        3. Fetch latest BioSim pH row.
        4. Compute divergence.
        5. Trigger malfunction if divergence >= PH_THRESHOLD and not active.
        6. Clear malfunction if active and divergence < recovery threshold (PH_THRESHOLD - 0.1).
        7. Emit heartbeat every HEARTBEAT_INTERVAL loops.
        """
        # Step 1: fetch Pi data
        pi_row = get_latest(PI_HUB_ID, PI_SENSOR_ID)

        # Step 2: staleness guard
        if is_stale(pi_row, STALE_SECONDS):
            if not was_stale:
                self.stdout.write("[control_loop] Pi data went stale -- holding malfunction state")
            return malfunction_active, malfunction_id, True

        # Step 3: log resume if we were stale
        if was_stale:
            self.stdout.write(
                f"[control_loop] Pi data resumed -- Pi pH={pi_row.sensor_val:.2f}"
            )

        # Step 4: fetch BioSim data
        biosim_row = get_latest(BIOSIM_HUB_ID, BIOSIM_SENSOR_ID)
        if biosim_row is None:
            return malfunction_active, malfunction_id, False

        # Step 5: compute divergence
        divergence = abs(pi_row.sensor_val - biosim_row.sensor_val)
        recovery_threshold = PH_THRESHOLD - 0.1  # hysteresis deadband

        # Step 6: trigger or clear
        if not malfunction_active and divergence >= PH_THRESHOLD:
            try:
                malfunction_id = post_malfunction(BIOSIM_URL, sim_id)
                malfunction_active = True
                self.stdout.write(
                    f"[control_loop] MALFUNCTION triggered -- divergence={divergence:.2f} "
                    f"(Pi pH={pi_row.sensor_val:.2f}, BioSim pH={biosim_row.sensor_val:.2f})"
                )
            except requests.RequestException as e:
                self.stdout.write(
                    f"[control_loop] BioSim POST failed ({e}) -- skipping cycle"
                )

        elif malfunction_active and divergence < recovery_threshold:
            try:
                delete_malfunction(BIOSIM_URL, sim_id, malfunction_id)
                malfunction_active = False
                malfunction_id = None
                self.stdout.write(
                    f"[control_loop] MALFUNCTION cleared -- divergence={divergence:.2f} "
                    f"(Pi pH={pi_row.sensor_val:.2f}, BioSim pH={biosim_row.sensor_val:.2f})"
                )
            except requests.RequestException as e:
                self.stdout.write(
                    f"[control_loop] BioSim DELETE failed ({e}) -- skipping cycle"
                )

        # Step 7: heartbeat
        if loop_count % HEARTBEAT_INTERVAL == 0:
            state = (
                'malfunction' if malfunction_active
                else ('stale' if is_stale(pi_row, STALE_SECONDS) else 'normal')
            )
            self.stdout.write(
                f"[control_loop] alive -- Pi pH={pi_row.sensor_val:.2f}, "
                f"BioSim pH={biosim_row.sensor_val:.2f}, "
                f"divergence={divergence:.2f}, state={state}"
            )

        return malfunction_active, malfunction_id, False
