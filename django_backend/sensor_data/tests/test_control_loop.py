"""
Unit tests for control_loop management command.

Tests cover:
  - Command class importable with handle() method
  - get_latest ORM helper (django_db)
  - is_stale helper (time-based)
  - State machine: malfunction trigger at threshold
  - State machine: no duplicate malfunction
  - State machine: no malfunction on stale Pi data
  - State machine: malfunction cleared below recovery threshold
  - State machine: malfunction held when Pi goes stale
  - State machine: hysteresis deadband (no clear in 0.4-0.5 zone)
  - Heartbeat logged every 6 loops (60 seconds)
  - No heartbeat between intervals
"""

from datetime import timedelta
from io import StringIO
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from sensor_data.management.commands.control_loop import (
    Command,
    get_latest,
    is_stale,
)
from sensor_data.models import EnrichedSensorData


# ---------------------------------------------------------------------------
# Constants matching control_loop module
# ---------------------------------------------------------------------------

PI_HUB_ID = 'pi-habitat-01'
PI_SENSOR_ID = 'wr-ph-real'
BIOSIM_HUB_ID = 'biosim-habitat-01'
BIOSIM_SENSOR_ID = 'wr-ph'
PH_THRESHOLD = 0.5
STALE_SECONDS = 60


# ---------------------------------------------------------------------------
# Test 1: Command class is importable and has handle()
# ---------------------------------------------------------------------------

def test_command_importable():
    """Command class must be importable and have a handle() method."""
    assert callable(Command)
    cmd = Command()
    assert hasattr(cmd, 'handle')
    assert callable(cmd.handle)


# ---------------------------------------------------------------------------
# Tests 2-4: get_latest ORM helper
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_get_latest_pi_ph():
    """get_latest returns most recent EnrichedSensorData row for Pi hub."""
    EnrichedSensorData.objects.create(
        hub_id=PI_HUB_ID,
        sensor_id=PI_SENSOR_ID,
        sensor_name='ph',
        device_addr='water-recycling',
        sensor_val=7.2,
        datetime=timezone.now() - timedelta(seconds=30),
        location='Mars Habitat Alpha',
        owner='Pi Sensor',
        workers='Pi',
    )
    # Newer row -- should be returned
    EnrichedSensorData.objects.create(
        hub_id=PI_HUB_ID,
        sensor_id=PI_SENSOR_ID,
        sensor_name='ph',
        device_addr='water-recycling',
        sensor_val=6.8,
        datetime=timezone.now(),
        location='Mars Habitat Alpha',
        owner='Pi Sensor',
        workers='Pi',
    )

    result = get_latest(PI_HUB_ID, PI_SENSOR_ID)
    assert result is not None
    assert result.sensor_val == 6.8


@pytest.mark.django_db
def test_get_latest_biosim_ph():
    """get_latest returns most recent EnrichedSensorData row for BioSim hub."""
    EnrichedSensorData.objects.create(
        hub_id=BIOSIM_HUB_ID,
        sensor_id=BIOSIM_SENSOR_ID,
        sensor_name='ph',
        device_addr='water-recycling',
        sensor_val=7.0,
        datetime=timezone.now(),
        location='Mars Habitat Alpha',
        owner='BioSim',
        workers='BioSim',
    )

    result = get_latest(BIOSIM_HUB_ID, BIOSIM_SENSOR_ID)
    assert result is not None
    assert result.sensor_val == 7.0


@pytest.mark.django_db
def test_get_latest_returns_none():
    """get_latest returns None when no rows exist."""
    result = get_latest('nonexistent-hub', 'nonexistent-sensor')
    assert result is None


# ---------------------------------------------------------------------------
# Tests 5-7: is_stale helper
# ---------------------------------------------------------------------------

def test_is_stale_when_old():
    """is_stale returns True when row.datetime is 120 seconds ago."""
    row = MagicMock()
    row.datetime = timezone.now() - timedelta(seconds=120)
    assert is_stale(row, 60) is True


def test_is_fresh_when_recent():
    """is_stale returns False when row.datetime is 5 seconds ago."""
    row = MagicMock()
    row.datetime = timezone.now() - timedelta(seconds=5)
    assert is_stale(row, 60) is False


def test_is_stale_when_none():
    """is_stale returns True when row is None."""
    assert is_stale(None, 60) is True


# ---------------------------------------------------------------------------
# Helper to build a run_cycle caller
# ---------------------------------------------------------------------------

def _make_cmd():
    """Return a Command instance with stdout wired to a StringIO."""
    cmd = Command()
    cmd.stdout = StringIO()
    cmd.stderr = StringIO()
    cmd.style = MagicMock()
    cmd.style.SUCCESS = lambda s: s
    cmd.style.WARNING = lambda s: s
    cmd.style.ERROR = lambda s: s
    return cmd


def _make_pi_row(val, age_seconds=5):
    """Return a MagicMock row representing a Pi pH reading."""
    row = MagicMock()
    row.sensor_val = val
    row.datetime = timezone.now() - timedelta(seconds=age_seconds)
    return row


def _make_biosim_row(val):
    """Return a MagicMock row representing a BioSim pH reading."""
    row = MagicMock()
    row.sensor_val = val
    row.datetime = timezone.now()
    return row


# ---------------------------------------------------------------------------
# Tests 8-14: _run_cycle state machine
# ---------------------------------------------------------------------------

def test_malfunction_triggered_at_threshold():
    """run_cycle with divergence=0.6 (>= 0.5) and malfunction_active=False posts malfunction."""
    cmd = _make_cmd()
    pi_row = _make_pi_row(7.8)       # Pi pH = 7.8
    biosim_row = _make_biosim_row(7.2)  # BioSim pH = 7.2 => divergence = 0.6

    mock_post_resp = MagicMock()
    mock_post_resp.json.return_value = {'malfunctionID': 42}
    mock_post_resp.raise_for_status.return_value = None

    mock_delete_resp = MagicMock()
    mock_delete_resp.ok = True

    with patch('sensor_data.management.commands.control_loop.get_latest') as mock_get, \
         patch('sensor_data.management.commands.control_loop.requests') as mock_requests:

        mock_get.side_effect = [pi_row, biosim_row]
        mock_requests.post.return_value = mock_post_resp
        mock_requests.delete.return_value = mock_delete_resp

        malfunction_active, malfunction_id, was_stale = cmd._run_cycle(
            sim_id=1, loop_count=1,
            malfunction_active=False, malfunction_id=None, was_stale=False,
        )

    assert malfunction_active is True
    assert malfunction_id == 42
    mock_requests.post.assert_called_once()
    post_url = mock_requests.post.call_args[0][0]
    assert 'Grey_Water_Store/malfunctions' in post_url
    post_body = mock_requests.post.call_args[1]['json']
    assert post_body == {'intensity': 'SEVERE_MALF', 'length': 'TEMPORARY_MALF'}


def test_no_duplicate_malfunction():
    """run_cycle with divergence=0.8 and malfunction_active=True does NOT call requests.post."""
    cmd = _make_cmd()
    pi_row = _make_pi_row(8.0)
    biosim_row = _make_biosim_row(7.2)  # divergence = 0.8

    with patch('sensor_data.management.commands.control_loop.get_latest') as mock_get, \
         patch('sensor_data.management.commands.control_loop.requests') as mock_requests:

        mock_get.side_effect = [pi_row, biosim_row]

        cmd._run_cycle(
            sim_id=1, loop_count=1,
            malfunction_active=True, malfunction_id=99, was_stale=False,
        )

    mock_requests.post.assert_not_called()


def test_no_malfunction_on_stale_data():
    """run_cycle with stale Pi data (None row) does not call requests.post."""
    cmd = _make_cmd()

    with patch('sensor_data.management.commands.control_loop.get_latest') as mock_get, \
         patch('sensor_data.management.commands.control_loop.requests') as mock_requests:

        mock_get.return_value = None  # Pi data missing = stale

        malfunction_active, malfunction_id, was_stale = cmd._run_cycle(
            sim_id=1, loop_count=1,
            malfunction_active=False, malfunction_id=None, was_stale=False,
        )

    mock_requests.post.assert_not_called()
    assert was_stale is True


def test_malfunction_cleared_below_recovery():
    """run_cycle with divergence=0.3 (< 0.4 recovery) and malfunction_active=True calls delete."""
    cmd = _make_cmd()
    pi_row = _make_pi_row(7.5)
    biosim_row = _make_biosim_row(7.2)  # divergence = 0.3

    mock_delete_resp = MagicMock()
    mock_delete_resp.ok = True

    with patch('sensor_data.management.commands.control_loop.get_latest') as mock_get, \
         patch('sensor_data.management.commands.control_loop.requests') as mock_requests:

        mock_get.side_effect = [pi_row, biosim_row]
        mock_requests.delete.return_value = mock_delete_resp

        malfunction_active, malfunction_id, was_stale = cmd._run_cycle(
            sim_id=1, loop_count=1,
            malfunction_active=True, malfunction_id=42, was_stale=False,
        )

    assert malfunction_active is False
    assert malfunction_id is None
    mock_requests.delete.assert_called_once()
    delete_url = mock_requests.delete.call_args[0][0]
    assert '42' in delete_url


def test_malfunction_held_when_stale():
    """run_cycle with stale Pi data and malfunction_active=True does NOT call requests.delete."""
    cmd = _make_cmd()

    with patch('sensor_data.management.commands.control_loop.get_latest') as mock_get, \
         patch('sensor_data.management.commands.control_loop.requests') as mock_requests:

        mock_get.return_value = None  # stale

        malfunction_active, malfunction_id, was_stale = cmd._run_cycle(
            sim_id=1, loop_count=1,
            malfunction_active=True, malfunction_id=42, was_stale=False,
        )

    mock_requests.delete.assert_not_called()
    assert malfunction_active is True
    assert malfunction_id == 42


def test_hysteresis_no_clear_in_deadband():
    """run_cycle with divergence=0.45 (between 0.4 and 0.5) and malfunction_active=True does NOT delete."""
    cmd = _make_cmd()
    pi_row = _make_pi_row(7.65)
    biosim_row = _make_biosim_row(7.2)  # divergence = 0.45

    with patch('sensor_data.management.commands.control_loop.get_latest') as mock_get, \
         patch('sensor_data.management.commands.control_loop.requests') as mock_requests:

        mock_get.side_effect = [pi_row, biosim_row]

        malfunction_active, malfunction_id, was_stale = cmd._run_cycle(
            sim_id=1, loop_count=1,
            malfunction_active=True, malfunction_id=42, was_stale=False,
        )

    mock_requests.delete.assert_not_called()
    mock_requests.post.assert_not_called()
    assert malfunction_active is True


def test_heartbeat_logged_every_6_loops():
    """run_cycle with loop_count=6 writes heartbeat containing 'alive' to stdout."""
    cmd = _make_cmd()
    pi_row = _make_pi_row(7.2)
    biosim_row = _make_biosim_row(7.2)

    with patch('sensor_data.management.commands.control_loop.get_latest') as mock_get, \
         patch('sensor_data.management.commands.control_loop.requests'):

        mock_get.side_effect = [pi_row, biosim_row]

        cmd._run_cycle(
            sim_id=1, loop_count=6,
            malfunction_active=False, malfunction_id=None, was_stale=False,
        )

    output = cmd.stdout.getvalue()
    assert 'alive' in output


def test_no_heartbeat_between_intervals():
    """run_cycle with loop_count=3 does NOT write heartbeat to stdout."""
    cmd = _make_cmd()
    pi_row = _make_pi_row(7.2)
    biosim_row = _make_biosim_row(7.2)

    with patch('sensor_data.management.commands.control_loop.get_latest') as mock_get, \
         patch('sensor_data.management.commands.control_loop.requests'):

        mock_get.side_effect = [pi_row, biosim_row]

        cmd._run_cycle(
            sim_id=1, loop_count=3,
            malfunction_active=False, malfunction_id=None, was_stale=False,
        )

    output = cmd.stdout.getvalue()
    assert 'alive' not in output
