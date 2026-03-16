"""
Unit tests for biosim_import_log management command.

Tests cover:
  - Command class importability
  - discover_sim_id: happy path and no-active-sim error
  - fetch_tick_log: happy path and empty-ticks error
  - import_ticks: idempotency (same row count on double run)
  - import_ticks: correct bulk_create call count per tick
  - import_ticks: clears existing hub_id='biosim-habitat-01' rows before importing

HTTP calls are mocked with unittest.mock.patch.
DB tests use @pytest.mark.django_db.
Fixture data loaded from tests/fixtures/biosim_module_state.json for realistic tick data.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

FIXTURE_PATH = (
    Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "biosim_module_state.json"
)


@pytest.fixture(scope="module")
def fixture_modules():
    with open(FIXTURE_PATH) as f:
        data = json.load(f)
    return data["modules"]


# ---------------------------------------------------------------------------
# Test 1: Command class is importable
# ---------------------------------------------------------------------------
def test_command_class_importable():
    from sensor_data.management.commands.biosim_import_log import Command

    assert Command is not None
    assert hasattr(Command, "handle")


# ---------------------------------------------------------------------------
# Test 2: discover_sim_id returns simID from mock GET /api/simulation/active
# ---------------------------------------------------------------------------
def test_discover_sim_id_returns_first_id():
    from sensor_data.management.commands.biosim_import_log import discover_sim_id

    mock_response = MagicMock()
    mock_response.json.return_value = {"simulations": [42]}
    mock_response.raise_for_status = MagicMock()

    with patch("requests.get", return_value=mock_response) as mock_get:
        result = discover_sim_id("http://biosim:8009")

    mock_get.assert_called_once_with("http://biosim:8009/api/simulation/active")
    assert result == 42


# ---------------------------------------------------------------------------
# Test 3: discover_sim_id raises CommandError when no active simulation found
# ---------------------------------------------------------------------------
def test_discover_sim_id_raises_when_no_active():
    from django.core.management.base import CommandError

    from sensor_data.management.commands.biosim_import_log import discover_sim_id

    mock_response = MagicMock()
    mock_response.json.return_value = {"simulations": []}
    mock_response.raise_for_status = MagicMock()

    with patch("requests.get", return_value=mock_response):
        with pytest.raises(CommandError, match="No active simulation"):
            discover_sim_id("http://biosim:8009")


# ---------------------------------------------------------------------------
# Test 4: fetch_tick_log returns ticks list from mock GET .../log
# ---------------------------------------------------------------------------
def test_fetch_tick_log_returns_ticks(fixture_modules):
    from sensor_data.management.commands.biosim_import_log import fetch_tick_log

    ticks = [
        {"globals": {"ticksGoneBy": 1}, "modules": fixture_modules},
        {"globals": {"ticksGoneBy": 2}, "modules": fixture_modules},
    ]
    mock_response = MagicMock()
    mock_response.json.return_value = {"ticks": ticks}
    mock_response.raise_for_status = MagicMock()

    with patch("requests.get", return_value=mock_response) as mock_get:
        result = fetch_tick_log("http://biosim:8009", 1)

    mock_get.assert_called_once_with("http://biosim:8009/api/simulation/1/log")
    assert result == ticks
    assert len(result) == 2


# ---------------------------------------------------------------------------
# Test 5: fetch_tick_log raises CommandError when ticks list is empty (--writeTicks hint)
# ---------------------------------------------------------------------------
def test_fetch_tick_log_raises_when_empty():
    from django.core.management.base import CommandError

    from sensor_data.management.commands.biosim_import_log import fetch_tick_log

    mock_response = MagicMock()
    mock_response.json.return_value = {"ticks": []}
    mock_response.raise_for_status = MagicMock()

    with patch("requests.get", return_value=mock_response):
        with pytest.raises(CommandError, match="writeTicks"):
            fetch_tick_log("http://biosim:8009", 1)


# ---------------------------------------------------------------------------
# Test 6: import_ticks is idempotent — same row count after double import
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_import_ticks_is_idempotent(fixture_modules):
    from io import StringIO

    from sensor_data.management.commands.biosim_import_log import import_ticks
    from sensor_data.models import EnrichedSensorData

    ticks = [
        {"globals": {"ticksGoneBy": 1}, "modules": fixture_modules},
        {"globals": {"ticksGoneBy": 2}, "modules": fixture_modules},
    ]
    stdout = StringIO()
    mock_stdout = MagicMock()

    import_ticks(ticks, mock_stdout)
    count_after_first = EnrichedSensorData.objects.filter(
        hub_id="biosim-habitat-01"
    ).count()

    import_ticks(ticks, mock_stdout)
    count_after_second = EnrichedSensorData.objects.filter(
        hub_id="biosim-habitat-01"
    ).count()

    assert count_after_first == count_after_second
    assert count_after_first > 0


# ---------------------------------------------------------------------------
# Test 7: import_ticks calls bulk_create with correct row count per tick
# ---------------------------------------------------------------------------
def test_import_ticks_bulk_create_row_count(fixture_modules):
    from io import StringIO

    from sensor_data.management.commands.biosim_import_log import import_ticks

    ticks = [
        {"globals": {"ticksGoneBy": 1}, "modules": fixture_modules},
        {"globals": {"ticksGoneBy": 2}, "modules": fixture_modules},
        {"globals": {"ticksGoneBy": 3}, "modules": fixture_modules},
    ]
    mock_stdout = MagicMock()

    bulk_calls = []

    def fake_bulk_create(rows):
        bulk_calls.append(len(rows))

    with patch(
        "sensor_data.management.commands.biosim_import_log.EnrichedSensorData.objects"
    ) as mock_manager:
        mock_manager.filter.return_value.delete.return_value = (0, {})
        mock_manager.bulk_create.side_effect = fake_bulk_create

        tick_count, total_rows = import_ticks(ticks, mock_stdout)

    # 3 ticks, each with the full fixture (12 sensors) = 36 rows total
    assert tick_count == 3
    assert total_rows == 36
    assert len(bulk_calls) == 3
    assert all(c == 12 for c in bulk_calls)


# ---------------------------------------------------------------------------
# Test 8: import_ticks deletes existing hub_id='biosim-habitat-01' rows before importing
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_import_ticks_clears_existing_rows(fixture_modules):
    from sensor_data.biosim_ingest import HUB_ID, biosim_tick_to_rows
    from sensor_data.management.commands.biosim_import_log import import_ticks
    from sensor_data.models import EnrichedSensorData

    # Pre-populate with existing rows
    existing_rows = biosim_tick_to_rows(fixture_modules)
    EnrichedSensorData.objects.bulk_create(existing_rows)
    pre_count = EnrichedSensorData.objects.filter(hub_id=HUB_ID).count()
    assert pre_count > 0

    ticks = [{"globals": {"ticksGoneBy": 99}, "modules": fixture_modules}]
    mock_stdout = MagicMock()

    import_ticks(ticks, mock_stdout)

    post_count = EnrichedSensorData.objects.filter(hub_id=HUB_ID).count()
    # After import: only the 1 tick's rows remain, not pre_count + tick_rows
    assert post_count == len(existing_rows)  # same number — 1 tick worth
    # Specifically, no doubling happened
    assert post_count < pre_count + len(existing_rows)
