"""
Unit tests for biosim_bridge management command.

Tests cover:
  - Command importability
  - probe_sim_id parses simulation IDs from HTTP responses
  - write_rows calls bulk_create via asyncio.to_thread
  - write_rows swallows bulk_create exceptions
  - process_tick calls biosim_tick_to_rows and write_rows
  - process_tick increments tick/row counters
  - DB integration: rows with hub_id='biosim-habitat-01' queryable via ORM

All tests use unittest.mock; async functions mocked with AsyncMock.
The DB test (Test 9) uses @pytest.mark.django_db.
"""

import asyncio
import json
import time
from io import StringIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sensor_data.management.commands.biosim_bridge import (
    Command,
    probe_sim_id,
    process_tick,
    write_rows,
)
from sensor_data.models import EnrichedSensorData


# ---------------------------------------------------------------------------
# Test 1: Command class is importable
# ---------------------------------------------------------------------------

def test_command_class_importable():
    """Command class must be importable and have async _run method."""
    assert callable(Command)
    cmd = Command()
    assert hasattr(cmd, '_run')
    assert asyncio.iscoroutinefunction(cmd._run)


# ---------------------------------------------------------------------------
# Test 2: probe_sim_id returns integer from {"simulations": [1]}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_probe_sim_id_wrapped_response():
    """probe_sim_id parses wrapped {'simulations': [1]} response."""
    mock_response = AsyncMock()
    mock_response.json = AsyncMock(return_value={"simulations": [1]})

    mock_session = MagicMock()
    mock_get_ctx = MagicMock()
    mock_get_ctx.__aenter__ = AsyncMock(return_value=mock_response)
    mock_get_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_session.get = MagicMock(return_value=mock_get_ctx)

    result = await probe_sim_id(mock_session, 'http://biosim:8009')

    assert result == 1


# ---------------------------------------------------------------------------
# Test 3: probe_sim_id handles both response shapes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_probe_sim_id_bare_list():
    """probe_sim_id handles bare list [1] response shape."""
    mock_response = AsyncMock()
    mock_response.json = AsyncMock(return_value=[1])

    mock_session = MagicMock()
    mock_get_ctx = MagicMock()
    mock_get_ctx.__aenter__ = AsyncMock(return_value=mock_response)
    mock_get_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_session.get = MagicMock(return_value=mock_get_ctx)

    result = await probe_sim_id(mock_session, 'http://biosim:8009')

    assert result == 1


# ---------------------------------------------------------------------------
# Test 4: probe_sim_id returns None for empty simulations list
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_probe_sim_id_empty_list():
    """probe_sim_id returns None when simulations list is empty."""
    mock_response = AsyncMock()
    mock_response.json = AsyncMock(return_value={"simulations": []})

    mock_session = MagicMock()
    mock_get_ctx = MagicMock()
    mock_get_ctx.__aenter__ = AsyncMock(return_value=mock_response)
    mock_get_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_session.get = MagicMock(return_value=mock_get_ctx)

    result = await probe_sim_id(mock_session, 'http://biosim:8009')

    assert result is None


# ---------------------------------------------------------------------------
# Test 5: write_rows calls bulk_create via asyncio.to_thread
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_write_rows_calls_bulk_create():
    """write_rows must call EnrichedSensorData.objects.bulk_create via asyncio.to_thread."""
    rows = [MagicMock(spec=EnrichedSensorData), MagicMock(spec=EnrichedSensorData)]

    with patch(
        'sensor_data.management.commands.biosim_bridge.EnrichedSensorData'
    ) as mock_model:
        mock_model.objects.bulk_create = MagicMock(return_value=rows)

        await write_rows(rows)

        mock_model.objects.bulk_create.assert_called_once_with(rows)


# ---------------------------------------------------------------------------
# Test 6: write_rows catches bulk_create exception and does not propagate
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_write_rows_swallows_exception():
    """write_rows must catch bulk_create exceptions and not propagate them."""
    rows = [MagicMock(spec=EnrichedSensorData)]

    with patch(
        'sensor_data.management.commands.biosim_bridge.EnrichedSensorData'
    ) as mock_model:
        mock_model.objects.bulk_create = MagicMock(
            side_effect=Exception("DB connection error")
        )

        # Should not raise
        await write_rows(rows)


# ---------------------------------------------------------------------------
# Test 6b/6c: write_rows closes the thread-local connection (leak fix)
# ---------------------------------------------------------------------------

def test_bulk_create_and_close_closes_connection():
    """The DB write helper must close its thread-local connection after each write, or
    the long-running bridge leaks one connection per executor thread (no request cycle
    auto-closes them) until Cloud SQL's pool is exhausted."""
    from sensor_data.management.commands.biosim_bridge import _bulk_create_and_close
    rows = [MagicMock(spec=EnrichedSensorData)]
    with patch(
        'sensor_data.management.commands.biosim_bridge.EnrichedSensorData'
    ) as mock_model, patch('django.db.connection') as mock_conn:
        mock_model.objects.bulk_create = MagicMock(return_value=rows)
        _bulk_create_and_close(rows)
        mock_model.objects.bulk_create.assert_called_once_with(rows)
        mock_conn.close.assert_called_once()


def test_bulk_create_and_close_closes_connection_even_on_error():
    """The connection must be closed even when bulk_create raises (finally block)."""
    from sensor_data.management.commands.biosim_bridge import _bulk_create_and_close
    rows = [MagicMock(spec=EnrichedSensorData)]
    with patch(
        'sensor_data.management.commands.biosim_bridge.EnrichedSensorData'
    ) as mock_model, patch('django.db.connection') as mock_conn:
        mock_model.objects.bulk_create = MagicMock(side_effect=Exception("DB blip"))
        with pytest.raises(Exception):
            _bulk_create_and_close(rows)  # helper re-raises; write_rows swallows
        mock_conn.close.assert_called_once()


# ---------------------------------------------------------------------------
# Test 7: process_tick calls biosim_tick_to_rows with modules dict
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_process_tick_calls_biosim_tick_to_rows():
    """process_tick extracts modules dict and passes to biosim_tick_to_rows."""
    fake_rows = [MagicMock(spec=EnrichedSensorData)] * 3
    payload = {
        "globals": {"ticksGoneBy": 5},
        "modules": {"Crew_Quarters_Environment": {"properties": {"temperature": 22.0}}}
    }
    stats = {'ticks': 0, 'rows': 0, 'start': time.time()}
    stdout = StringIO()

    with patch(
        'sensor_data.management.commands.biosim_bridge.biosim_tick_to_rows',
        return_value=fake_rows,
    ) as mock_translate, patch(
        'sensor_data.management.commands.biosim_bridge.write_rows',
        new_callable=AsyncMock,
    ) as mock_write:
        await process_tick(payload, stats, stdout)

        mock_translate.assert_called_once()
        call_args = mock_translate.call_args
        assert call_args[0][0] == payload['modules']

        mock_write.assert_awaited_once_with(fake_rows)


# ---------------------------------------------------------------------------
# Test 8: process_tick increments counters correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_process_tick_increments_counters():
    """process_tick must increment stats['ticks'] by 1 and stats['rows'] by len(rows)."""
    fake_rows = [MagicMock(spec=EnrichedSensorData)] * 5
    payload = {"globals": {}, "modules": {}}
    stats = {'ticks': 10, 'rows': 50, 'start': time.time()}
    stdout = StringIO()

    with patch(
        'sensor_data.management.commands.biosim_bridge.biosim_tick_to_rows',
        return_value=fake_rows,
    ), patch(
        'sensor_data.management.commands.biosim_bridge.write_rows',
        new_callable=AsyncMock,
    ):
        await process_tick(payload, stats, stdout)

        assert stats['ticks'] == 11
        assert stats['rows'] == 55


# ---------------------------------------------------------------------------
# Test 9: DB integration — hub_id='biosim-habitat-01' rows queryable after bulk_create
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_biosim_rows_queryable_after_bulk_create():
    """Rows with hub_id='biosim-habitat-01' inserted via bulk_create are ORM-queryable."""
    from sensor_data.biosim_ingest import biosim_tick_to_rows

    modules = {
        'Crew_Quarters_Environment': {
            'properties': {
                'temperature': 22.5,
                'relativeHumidity': 45.0,
                'totalPressure': 101.0,
            }
        }
    }

    rows = biosim_tick_to_rows(modules)
    assert len(rows) > 0

    EnrichedSensorData.objects.bulk_create(rows)

    saved = EnrichedSensorData.objects.filter(hub_id='biosim-habitat-01')
    assert saved.count() == len(rows)
    assert all(r.hub_id == 'biosim-habitat-01' for r in saved)
