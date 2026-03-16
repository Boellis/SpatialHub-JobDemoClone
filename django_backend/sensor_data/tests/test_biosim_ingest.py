"""
Unit tests for biosim_ingest.biosim_tick_to_rows.

Tests are pinned to the Phase 5 live fixture at tests/fixtures/biosim_module_state.json.
All 12 sensors are covered, plus missing-module and return-type assertions.
"""

import json
import pytest
from pathlib import Path

from sensor_data.biosim_ingest import biosim_tick_to_rows
from sensor_data.models import EnrichedSensorData


FIXTURE_PATH = Path(__file__).resolve().parents[3] / 'tests' / 'fixtures' / 'biosim_module_state.json'


@pytest.fixture(scope='module')
def fixture_data():
    with open(FIXTURE_PATH) as f:
        return json.load(f)


@pytest.fixture(scope='module')
def rows(fixture_data):
    return biosim_tick_to_rows(fixture_data['modules'])


@pytest.mark.django_db
def test_returns_12_rows(rows):
    assert len(rows) == 12


@pytest.mark.django_db
def test_all_hub_ids_are_sentinel(rows):
    assert all(r.hub_id == 'biosim-habitat-01' for r in rows)


@pytest.mark.django_db
def test_gb_co2_conversion(rows):
    row = next(r for r in rows if r.sensor_id == 'gb-co2')
    # CO2: mol fraction * 1e6 = ppm (0.00073011906 -> ~730.1 ppm)
    assert row.sensor_val == pytest.approx(730.1, abs=0.5)


@pytest.mark.django_db
def test_ac_o2_conversion(rows):
    row = next(r for r in rows if r.sensor_id == 'ac-o2')
    # O2: mol fraction * 100 = % (0.20807198 -> ~20.81%)
    assert row.sensor_val == pytest.approx(20.81, abs=0.5)


@pytest.mark.django_db
def test_ac_filtration_conversion(rows):
    row = next(r for r in rows if r.sensor_id == 'ac-filtration')
    # VCCR: air output / air input * 100 = % efficiency
    assert row.sensor_val == pytest.approx(99.93, abs=0.5)


@pytest.mark.django_db
def test_pt_power_conversion(rows):
    row = next(r for r in rows if r.sensor_id == 'pt-power')
    # Nuclear power: BioSim watts / 30 -> kW (3000 W = 100 kW nominal)
    assert row.sensor_val == pytest.approx(100.0, abs=0.5)


@pytest.mark.django_db
def test_pt_battery_conversion(rows):
    row = next(r for r in rows if r.sensor_id == 'pt-battery')
    # Power store: level / capacity * 100 = % charge
    assert row.sensor_val == pytest.approx(99.6, abs=0.5)


@pytest.mark.django_db
def test_wr_flow_conversion(rows):
    row = next(r for r in rows if r.sensor_id == 'wr-flow')
    # Potable water: L/tick * 60 = L/min
    assert row.sensor_val == pytest.approx(10.0, abs=0.5)


@pytest.mark.django_db
def test_wr_ph_proxy(rows):
    row = next(r for r in rows if r.sensor_id == 'wr-ph')
    # Grey water fill ratio -> pH proxy: (level/capacity * 1.5) + 6.0
    assert row.sensor_val == pytest.approx(7.49, abs=0.5)


@pytest.mark.django_db
def test_wr_tds_proxy(rows):
    row = next(r for r in rows if r.sensor_id == 'wr-tds')
    # Dirty water fill ratio * 10000 = ppm TDS proxy
    assert row.sensor_val == pytest.approx(11.54, abs=0.5)


@pytest.mark.django_db
def test_pt_coolant_proxy(rows):
    row = next(r for r in rows if r.sensor_id == 'pt-coolant')
    # Crew quarters temp + 1C coolant offset proxy
    assert row.sensor_val == pytest.approx(24.0, abs=0.5)


@pytest.mark.django_db
def test_device_addr_is_zone_id(rows):
    valid_zones = {'grow-bays', 'atmosphere-control', 'water-recycling', 'power-thermal'}
    assert all(r.device_addr in valid_zones for r in rows)


@pytest.mark.django_db
def test_location_and_owner_fields(rows):
    assert all(r.location == 'Mars Habitat Alpha' for r in rows)
    assert all(r.owner == 'NASA BioSim' for r in rows)
    assert all(r.workers == 'Crew Quarters Group' for r in rows)


@pytest.mark.django_db
def test_missing_modules_omit_rows():
    # Empty modules dict must produce zero rows — no zero-fills
    result = biosim_tick_to_rows({})
    assert len(result) == 0


@pytest.mark.django_db
def test_rows_are_model_instances(rows):
    assert all(isinstance(r, EnrichedSensorData) for r in rows)


@pytest.mark.django_db
def test_rows_not_saved_to_db(rows):
    # Unsaved instances have pk=None — caller is responsible for bulk_create
    assert all(r.pk is None for r in rows)
