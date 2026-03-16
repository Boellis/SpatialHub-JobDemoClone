"""
biosim_import_log — Django management command.

Fetches the full tick log from BioSim's REST /log endpoint and bulk-imports
all historical ticks into enriched_sensor_data (idempotent clear + reimport).

Usage:
    python manage.py biosim_import_log

Environment:
    BIOSIM_URL  Base URL of the BioSim server (default: http://biosim:8009)

Requires BioSim to have been started with --writeTicks so the /log endpoint
contains tick data.
"""

import os

import requests
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from sensor_data.biosim_ingest import HUB_ID, biosim_tick_to_rows
from sensor_data.models import EnrichedSensorData

BIOSIM_URL = os.environ.get("BIOSIM_URL", "http://biosim:8009")


def discover_sim_id(biosim_url):
    """
    GET /api/simulation and return the first simulation ID.

    Handles both response shapes:
      - {"simulations": [1]}  (wrapped)
      - [1]                   (bare array)

    Raises CommandError if no active simulation is found.
    """
    resp = requests.get(f"{biosim_url}/api/simulation")
    resp.raise_for_status()
    data = resp.json()

    if isinstance(data, list):
        simulations = data
    else:
        simulations = data.get("simulations", [])

    if not simulations:
        raise CommandError("No active simulation found on BioSim server.")

    return simulations[0]


def fetch_tick_log(biosim_url, sim_id):
    """
    GET /api/simulation/{sim_id}/log and return the list of ticks.

    Raises CommandError with a --writeTicks hint if ticks list is empty.
    """
    resp = requests.get(f"{biosim_url}/api/simulation/{sim_id}/log")
    resp.raise_for_status()
    data = resp.json()

    ticks = data.get("ticks", [])
    if not ticks:
        raise CommandError(
            "0 ticks returned from BioSim /log endpoint. "
            "BioSim may not have been started with --writeTicks. "
            "Restart BioSim with the --writeTicks flag and re-run the simulation."
        )

    return ticks


def import_ticks(ticks, stdout):
    """
    Idempotent tick log importer.

    Step 1: Delete all existing rows for hub_id='biosim-habitat-01'.
    Step 2: Convert each tick's modules dict and bulk_create the resulting rows.

    Returns (tick_count, total_row_count).
    """
    # Step 1: Clear existing biosim rows (idempotent)
    deleted, _ = EnrichedSensorData.objects.filter(hub_id=HUB_ID).delete()
    stdout.write(f"Cleared {deleted} existing BioSim rows")

    # Step 2: Import each tick
    total_rows = 0
    for i, tick_data in enumerate(ticks):
        modules = tick_data.get("modules", {})
        tick_time = timezone.now()
        rows = biosim_tick_to_rows(modules, tick_time)
        EnrichedSensorData.objects.bulk_create(rows)
        total_rows += len(rows)
        if (i + 1) % 10 == 0:
            stdout.write(f"Importing tick {i + 1}/{len(ticks)}... ({total_rows} rows)")

    return len(ticks), total_rows


class Command(BaseCommand):
    help = "Bulk import BioSim tick log into enriched_sensor_data (idempotent clear+reimport)"

    def handle(self, *args, **options):
        sim_id = discover_sim_id(BIOSIM_URL)
        self.stdout.write(f"Found active simulation: {sim_id}")

        ticks = fetch_tick_log(BIOSIM_URL, sim_id)
        self.stdout.write(f"Fetched {len(ticks)} ticks from log")

        tick_count, row_count = import_ticks(ticks, self.stdout)
        self.stdout.write(
            self.style.SUCCESS(f"Done. {tick_count} ticks, {row_count} rows imported.")
        )
