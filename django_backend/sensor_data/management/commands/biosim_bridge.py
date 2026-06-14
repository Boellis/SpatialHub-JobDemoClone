"""
biosim_bridge.py — Long-running Django management command that ingests BioSim
WebSocket ticks into the enriched_sensor_data table.

Connection lifecycle:
  1. HTTP probe GET /api/simulation -> discover simID
  2. WebSocket connect ws://{host}/ws/simulation/{simID}
  3. Per-tick: biosim_tick_to_rows(modules) -> bulk_create (via asyncio.to_thread)
  4. On disconnect: exponential backoff + re-probe for new simID

Usage:
  python manage.py biosim_bridge
"""

import asyncio
import json
import os
import time

import aiohttp
from django.core.management.base import BaseCommand
from django.utils import timezone

from sensor_data.biosim_ingest import biosim_tick_to_rows
from sensor_data.models import EnrichedSensorData


BIOSIM_URL = os.environ.get('BIOSIM_URL', 'http://biosim:8009')
BACKOFF_DELAYS = [1, 2, 4, 8, 16, 30]


async def probe_sim_id(session, biosim_url):
    """
    GET /api/simulation and return the first simID, or None.

    Handles two response shapes:
      {"simulations": [1]}  -- wrapped dict
      [1]                   -- bare list
    """
    url = biosim_url.rstrip('/') + '/api/simulation'
    async with session.get(url) as resp:
        data = await resp.json(content_type=None)

    if isinstance(data, list):
        sims = data
    else:
        sims = data.get('simulations', [])

    return sims[0] if sims else None


def _bulk_create_and_close(rows):
    """Insert rows, then ALWAYS close this thread's DB connection.

    biosim_bridge is a long-running management command, and these writes run inside
    ``asyncio.to_thread`` worker threads. There is no request/response cycle here, so
    Django never auto-closes the thread-local connections those worker threads open —
    without this explicit close they accumulate (one leaked connection per executor
    thread) until Cloud SQL's connection pool is exhausted and EVERY DB endpoint
    starts failing. Closing per write keeps the bridge to one short-lived connection
    at a time. ``connection.close()`` is a safe no-op when nothing is open.
    """
    from django.db import connection
    try:
        EnrichedSensorData.objects.bulk_create(rows)
    finally:
        connection.close()


async def write_rows(rows):
    """
    Write rows to enriched_sensor_data via asyncio.to_thread bulk_create.
    Swallows all exceptions so a single DB blip never kills the bridge.
    """
    try:
        await asyncio.to_thread(_bulk_create_and_close, rows)
    except Exception as e:
        print(f"bulk_create failed: {e} -- skipping tick")


async def process_tick(payload, stats, stdout):
    """
    Translate one BioSim tick payload and persist rows.
    Increments stats['ticks'] by 1 and stats['rows'] by the number of rows written.
    Logs progress every 100 ticks.
    """
    modules = payload.get('modules', {})
    rows = biosim_tick_to_rows(modules, timezone.now())
    await write_rows(rows)

    stats['ticks'] += 1
    stats['rows'] += len(rows)

    if stats['ticks'] % 100 == 0:
        elapsed = time.time() - stats['start']
        print(
            f"Ingested 100 ticks ({len(rows)} rows) in {elapsed:.1f}s"
            f" -- total: {stats['ticks']} ticks"
        )
        stats['start'] = time.time()


class Command(BaseCommand):
    help = "Long-running BioSim WebSocket bridge -- ingests ticks into enriched_sensor_data"

    def handle(self, *args, **options):
        asyncio.run(self._run())

    async def _run(self):
        db_name = os.environ.get('DB_NAME', 'spatialhub_db')
        db_host = os.environ.get('DB_HOST', 'db')
        print(f"[biosim_bridge] Starting — BioSim URL: {BIOSIM_URL}")
        print(f"[biosim_bridge] Database: {db_name}@{db_host}")
        print("[biosim_bridge] Connecting to BioSim WebSocket...")

        async with aiohttp.ClientSession() as session:
            await self._connect_with_retry(session)

    async def _connect_with_retry(self, session):
        attempt = 0
        while True:
            try:
                sim_id = await probe_sim_id(session, BIOSIM_URL)
                if sim_id is None:
                    raise RuntimeError("No active simulation found")
                print(f"[biosim_bridge] Connected to simulation {sim_id}")
                await self._ingest_loop(session, sim_id)
            except Exception as e:
                delay = BACKOFF_DELAYS[min(attempt, len(BACKOFF_DELAYS) - 1)]
                print(f"[biosim_bridge] Connection lost ({e}). Retry in {delay}s...")
                await asyncio.sleep(delay)
                attempt += 1
            else:
                attempt = 0  # reset on clean disconnect

    async def _ingest_loop(self, session, sim_id):
        ws_url = BIOSIM_URL.rstrip('/').replace('http', 'ws') + f"/ws/simulation/{sim_id}"
        print(f"[biosim_bridge] WebSocket URL: {ws_url}")
        stats = {'ticks': 0, 'rows': 0, 'start': time.time()}

        async with session.ws_connect(ws_url) as ws:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    payload = json.loads(msg.data)
                    await process_tick(payload, stats, self.stdout)
                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
