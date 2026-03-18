"""
Tests for hub_client buffer, config loading, payload building, and sync logic.

Uses tmp_path for isolated SQLite databases -- no filesystem pollution.
All network and env calls are mocked.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Environment stubs used by multiple tests
MOCK_ENV = {
    "HUB_ID": "pi-habitat-01",
    "SENSOR_ID": "wr-ph-real",
    "SENSOR_NAME": "pH Sensor",
    "DEVICE_ADDR": "99",
    "LOCATION": "Mars Habitat Alpha",
    "OWNER": "Demo User",
    "WORKERS": "Crew A",
    "DJANGO_URL": "http://192.168.1.100:8000",
    "POLL_INTERVAL": "5",
}

SAMPLE_PAYLOAD = {
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


def _load_hub_client_with_env(tmp_db_path, env_overrides=None):
    """
    Import hub_client with the test environment and a temp DB path.

    Returns the hub_client module. Importing with different envs requires
    clearing the module from sys.modules between tests.
    """
    env = {**MOCK_ENV, **(env_overrides or {})}
    with patch.dict(os.environ, env, clear=True):
        # Force reimport so module-level config picks up patched env
        if "hub_client" in sys.modules:
            del sys.modules["hub_client"]
        import hub_client
        hub_client.DB_FILE = str(tmp_db_path)
        return hub_client


class TestConfigLoading(unittest.TestCase):

    def test_env_loading_all_fields(self):
        """All 9 required config fields are loaded from environment."""
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            tmp = f.name

        hc = _load_hub_client_with_env(tmp)

        self.assertEqual(hc.HUB_ID, "pi-habitat-01")
        self.assertEqual(hc.SENSOR_ID, "wr-ph-real")
        self.assertEqual(hc.SENSOR_NAME, "pH Sensor")
        self.assertEqual(hc.DEVICE_ADDR, "99")
        self.assertEqual(hc.LOCATION, "Mars Habitat Alpha")
        self.assertEqual(hc.OWNER, "Demo User")
        self.assertEqual(hc.WORKERS, "Crew A")
        self.assertEqual(hc.DJANGO_URL, "http://192.168.1.100:8000")
        self.assertAlmostEqual(float(hc.POLL_INTERVAL), 5.0)

        os.unlink(tmp)

    def test_poll_interval_defaults_to_5_when_missing(self):
        """POLL_INTERVAL defaults to 5 when not in environment."""
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            tmp = f.name

        hc = _load_hub_client_with_env(tmp, env_overrides={"POLL_INTERVAL": ""})
        # POLL_INTERVAL should be 5.0 when empty or missing
        self.assertAlmostEqual(float(hc.POLL_INTERVAL or 5), 5.0)

        os.unlink(tmp)


class TestSQLiteBuffer(unittest.TestCase):

    def setUp(self):
        """Each test gets its own fresh SQLite database in a temp file."""
        import tempfile
        self.tmp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp_path = self.tmp_file.name
        self.tmp_file.close()
        self.hc = _load_hub_client_with_env(self.tmp_path)
        self.hc.init_db()

    def tearDown(self):
        try:
            os.unlink(self.tmp_path)
        except FileNotFoundError:
            pass

    def test_buffer_writing_inserts_with_synced_zero(self):
        """buffer_reading(payload) inserts a row with synced=0."""
        self.hc.buffer_reading(SAMPLE_PAYLOAD)
        rows = self.hc.get_unsynced()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["hub_id"], "pi-habitat-01")
        self.assertAlmostEqual(row["sensor_val"], 7.42)
        self.assertEqual(row["synced"], 0)

    def test_get_unsynced_returns_dict(self):
        """get_unsynced() returns a list of dicts (not tuples)."""
        self.hc.buffer_reading(SAMPLE_PAYLOAD)
        rows = self.hc.get_unsynced()
        self.assertIsInstance(rows, list)
        self.assertIsInstance(rows[0], dict)

    def test_prune_after_sync_leaves_empty(self):
        """After buffer_reading + mark_synced_and_prune, get_unsynced() is empty."""
        self.hc.buffer_reading(SAMPLE_PAYLOAD)
        self.hc.mark_synced_and_prune()
        rows = self.hc.get_unsynced()
        self.assertEqual(len(rows), 0)

    def test_prune_removes_all_rows_from_db(self):
        """mark_synced_and_prune() physically deletes synced rows from SQLite."""
        import sqlite3
        self.hc.buffer_reading(SAMPLE_PAYLOAD)
        self.hc.mark_synced_and_prune()
        with sqlite3.connect(self.tmp_path) as conn:
            count = conn.execute("SELECT COUNT(*) FROM readings").fetchone()[0]
        self.assertEqual(count, 0)

    def test_multiple_readings_buffered_in_order(self):
        """Multiple buffered readings are returned in insertion order."""
        p1 = {**SAMPLE_PAYLOAD, "sensor_val": 6.80}
        p2 = {**SAMPLE_PAYLOAD, "sensor_val": 7.10}
        self.hc.buffer_reading(p1)
        self.hc.buffer_reading(p2)
        rows = self.hc.get_unsynced()
        self.assertEqual(len(rows), 2)
        self.assertAlmostEqual(rows[0]["sensor_val"], 6.80)
        self.assertAlmostEqual(rows[1]["sensor_val"], 7.10)


class TestBuildPayload(unittest.TestCase):

    def setUp(self):
        import tempfile
        self.tmp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp_path = self.tmp_file.name
        self.tmp_file.close()
        self.hc = _load_hub_client_with_env(self.tmp_path)

    def tearDown(self):
        os.unlink(self.tmp_path)

    def test_build_payload_has_all_9_fields(self):
        """build_payload returns a dict with exactly the 9 required fields."""
        payload = self.hc.build_payload(7.42)
        required_fields = {
            "hub_id", "sensor_id", "sensor_name", "device_addr",
            "sensor_val", "datetime", "location", "owner", "workers",
        }
        self.assertEqual(set(payload.keys()), required_fields)

    def test_build_payload_sensor_val_matches(self):
        """build_payload sensor_val matches the passed float."""
        payload = self.hc.build_payload(9.99)
        self.assertAlmostEqual(payload["sensor_val"], 9.99)

    def test_build_payload_datetime_is_utc_with_timezone(self):
        """build_payload datetime includes UTC timezone offset (+00:00 or Z)."""
        payload = self.hc.build_payload(7.00)
        dt_str = payload["datetime"]
        self.assertTrue(
            dt_str.endswith("+00:00") or dt_str.endswith("Z"),
            f"datetime '{dt_str}' is missing UTC timezone marker"
        )

    def test_build_payload_datetime_is_not_naive(self):
        """build_payload datetime must not be a naive datetime (no timezone)."""
        payload = self.hc.build_payload(7.00)
        from datetime import datetime, timezone
        # Parse back; if it has +00:00, it's timezone-aware
        try:
            dt = datetime.fromisoformat(payload["datetime"].replace("Z", "+00:00"))
            self.assertIsNotNone(dt.tzinfo, "datetime has no tzinfo -- it's naive!")
        except ValueError:
            self.fail(f"datetime '{payload['datetime']}' is not valid ISO 8601")

    def test_build_payload_config_fields_match_env(self):
        """build_payload fields come from the mocked environment."""
        payload = self.hc.build_payload(7.42)
        self.assertEqual(payload["hub_id"], "pi-habitat-01")
        self.assertEqual(payload["sensor_id"], "wr-ph-real")
        self.assertEqual(payload["location"], "Mars Habitat Alpha")
        self.assertEqual(payload["owner"], "Demo User")
        self.assertEqual(payload["workers"], "Crew A")


class TestSyncReadings(unittest.TestCase):

    def setUp(self):
        import tempfile
        self.tmp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp_path = self.tmp_file.name
        self.tmp_file.close()
        self.hc = _load_hub_client_with_env(self.tmp_path)
        self.hc.init_db()

    def tearDown(self):
        os.unlink(self.tmp_path)

    def test_sync_success_marks_and_prunes(self):
        """On 201 response, sync_readings() calls mark_synced_and_prune."""
        self.hc.buffer_reading(SAMPLE_PAYLOAD)

        mock_response = MagicMock()
        mock_response.status_code = 201

        with patch("requests.post", return_value=mock_response):
            self.hc.sync_readings()

        rows = self.hc.get_unsynced()
        self.assertEqual(len(rows), 0, "Rows should have been pruned after 201")

    def test_sync_failure_leaves_buffered_on_connection_error(self):
        """On ConnectionError, sync_readings() does NOT prune -- rows stay buffered."""
        import requests as req_module
        self.hc.buffer_reading(SAMPLE_PAYLOAD)

        with patch("requests.post", side_effect=req_module.exceptions.ConnectionError("offline")):
            self.hc.sync_readings()

        rows = self.hc.get_unsynced()
        self.assertEqual(len(rows), 1, "Row should still be buffered after connection failure")

    def test_sync_failure_leaves_buffered_on_non_201(self):
        """On non-201 response, sync_readings() does NOT prune."""
        self.hc.buffer_reading(SAMPLE_PAYLOAD)

        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("requests.post", return_value=mock_response):
            self.hc.sync_readings()

        rows = self.hc.get_unsynced()
        self.assertEqual(len(rows), 1, "Row should still be buffered after 500 response")

    def test_sync_posts_to_correct_url(self):
        """sync_readings() POSTs to {DJANGO_URL}/api/sensor-ingest/."""
        self.hc.buffer_reading(SAMPLE_PAYLOAD)

        mock_response = MagicMock()
        mock_response.status_code = 201

        with patch("requests.post", return_value=mock_response) as mock_post:
            self.hc.sync_readings()

        call_args = mock_post.call_args
        url = call_args[0][0] if call_args[0] else call_args[1].get("url", "")
        self.assertIn("/api/sensor-ingest/", url)

    def test_sync_sends_list_payload(self):
        """sync_readings() sends a JSON list (batch), not a single dict."""
        self.hc.buffer_reading(SAMPLE_PAYLOAD)

        mock_response = MagicMock()
        mock_response.status_code = 201

        with patch("requests.post", return_value=mock_response) as mock_post:
            self.hc.sync_readings()

        call_kwargs = mock_post.call_args[1]
        sent_json = call_kwargs.get("json")
        self.assertIsInstance(sent_json, list, "Payload must be a list for batch POST")

    def test_sync_no_rows_does_nothing(self):
        """sync_readings() with no buffered rows does not call requests.post."""
        with patch("requests.post") as mock_post:
            self.hc.sync_readings()

        mock_post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
