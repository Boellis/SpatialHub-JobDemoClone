"""
Integration tests for the Pi sensor ingest endpoint: POST /api/sensor-ingest/

These tests exercise the HTTP layer end-to-end using DRF's APIClient.
All tests require a live DB connection (in-memory SQLite for test runs).
"""

import pytest
from rest_framework.test import APIClient
from sensor_data.models import EnrichedSensorData


URL = "/api/sensor-ingest/"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def valid_payload():
    return {
        "hub_id": "pi-habitat-01",
        "sensor_id": "wr-ph-real",
        "sensor_name": "pH Sensor",
        "device_addr": "99",
        "sensor_val": 7.42,
        "datetime": "2026-03-18T14:30:05+00:00",
        "location": "Mars Habitat Alpha",
        "owner": "Demo User",
        "workers": "Crew A",
    }


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_single_payload_stored(client, valid_payload):
    """POST a single JSON object -> 201, stored=1, row in DB."""
    response = client.post(URL, valid_payload, format="json")
    assert response.status_code == 201
    assert response.data == {"stored": 1}
    assert EnrichedSensorData.objects.filter(hub_id="pi-habitat-01").count() == 1


@pytest.mark.django_db
def test_batch_payload_stored(client, valid_payload):
    """POST an array of 3 valid payloads -> 201, stored=3, 3 rows in DB."""
    payloads = [
        {**valid_payload, "sensor_val": 7.0 + i}
        for i in range(3)
    ]
    response = client.post(URL, payloads, format="json")
    assert response.status_code == 201
    assert response.data == {"stored": 3}
    assert EnrichedSensorData.objects.filter(hub_id="pi-habitat-01").count() == 3


# ---------------------------------------------------------------------------
# hub_id distinguishability
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_hub_id_is_pi_value(client, valid_payload):
    """Stored row carries 'pi-habitat-01', not 'biosim-habitat-01'."""
    client.post(URL, valid_payload, format="json")
    row = EnrichedSensorData.objects.get(hub_id="pi-habitat-01")
    assert row.hub_id == "pi-habitat-01"
    assert row.hub_id != "biosim-habitat-01"


# ---------------------------------------------------------------------------
# Validation failures -> 400
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_missing_field_returns_400(client, valid_payload):
    """POST missing 'sensor_val' -> 400 with error mentioning missing fields."""
    payload = {k: v for k, v in valid_payload.items() if k != "sensor_val"}
    response = client.post(URL, payload, format="json")
    assert response.status_code == 400
    assert "sensor_val" in str(response.data)


@pytest.mark.django_db
def test_invalid_sensor_val_returns_400(client, valid_payload):
    """POST sensor_val='not_a_number' -> 400."""
    payload = {**valid_payload, "sensor_val": "not_a_number"}
    response = client.post(URL, payload, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_datetime_returns_400(client, valid_payload):
    """POST datetime='not-a-date' -> 400."""
    payload = {**valid_payload, "datetime": "not-a-date"}
    response = client.post(URL, payload, format="json")
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Atomicity
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_batch_rejects_all_if_one_invalid(client, valid_payload):
    """Batch of 3 where item[1] is missing a field -> 400, zero rows stored."""
    bad_payload = {k: v for k, v in valid_payload.items() if k != "location"}
    payloads = [valid_payload, bad_payload, valid_payload]
    response = client.post(URL, payloads, format="json")
    assert response.status_code == 400
    assert EnrichedSensorData.objects.filter(hub_id="pi-habitat-01").count() == 0


@pytest.mark.django_db
def test_empty_array_returns_400(client):
    """POST empty array [] -> 400."""
    response = client.post(URL, [], format="json")
    assert response.status_code == 400
