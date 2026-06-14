"""Tests for the survival relay: the in-memory bridge + the /ingest (authenticated
write) and /live (read-only SSE replay) endpoints. No live BioSim, no Anthropic key.

Run on macOS:
    USE_SQLITE=1 /tmp/shub_venv/bin/python -m pytest \
        sensor_data/tests/test_survival_relay.py -q
"""

import json

from django.test import TestCase, override_settings
from django.urls import reverse

from sensor_data.survival import relay


TOKEN = "test-relay-secret-0123456789"

SOL_DATA = {
    "sol": 5, "alive": True, "modules": {"O2_Store": {"properties": {}}},
    "reasoning": "raising OGS O2 to cover the -100 deficit",
    "actions": [{"module": "OGS", "kind": "producers", "type": "O2",
                 "desired_rates": [900.0]}],
    "warnings": [],
}


class RelayStoreTests(TestCase):
    def setUp(self):
        relay.reset()

    def test_publish_bumps_version_and_snapshots(self):
        v1 = relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        v2 = relay.publish("sol", SOL_DATA)
        self.assertEqual((v1, v2), (1, 2))
        slots, log, version = relay.snapshot()
        self.assertEqual(version, 2)
        self.assertEqual(slots["run"][0]["run_id"], "r1")
        self.assertEqual(slots["sol"][0]["sol"], 5)
        self.assertIsNone(slots["end"][0])
        # SOL_DATA carries reasoning -> it lands in the decision log.
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0][1]["reasoning"], SOL_DATA["reasoning"])

    def test_reasoning_log_buffers_history_blank_skipped(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.publish("sol", {**SOL_DATA, "sol": 1, "reasoning": "first decision"})
        relay.publish("sol", {**SOL_DATA, "sol": 2, "reasoning": ""})   # no reasoning
        relay.publish("sol", {**SOL_DATA, "sol": 3, "reasoning": "third decision"})
        _, log, _ = relay.snapshot()
        self.assertEqual([e[1]["sol"] for e in log], [1, 3])  # blank sol skipped

    def test_run_event_clears_prior_sol_end_and_log(self):
        relay.publish("sol", SOL_DATA)
        relay.publish("end", {"sols_survived": 5, "ended_reason": "crew_death"})
        relay.publish("run", {"run_id": "r2", "difficulty": "malfunctions"})
        slots, log, _ = relay.snapshot()
        self.assertIsNone(slots["sol"][0])   # stale sol gone
        self.assertIsNone(slots["end"][0])   # stale result card gone
        self.assertEqual(slots["run"][0]["run_id"], "r2")
        self.assertEqual(log, [])            # decision log reset

    def test_plan_event_stored_and_replayable(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.publish("plan", {"farm_layout": {"total_kcal_per_day": 41000},
                               "food_plan": None, "note": "layout"})
        slots, _, _ = relay.snapshot()
        self.assertEqual(slots["plan"][0]["farm_layout"]["total_kcal_per_day"], 41000)

    def test_run_event_clears_stale_plan(self):
        relay.publish("plan", {"farm_layout": {"x": 1}, "food_plan": None})
        relay.publish("run", {"run_id": "r2", "difficulty": "off"})
        slots, _, _ = relay.snapshot()
        self.assertIsNone(slots["plan"][0])  # fresh run drops the prior plan

    def test_publish_rejects_unknown_event_type(self):
        with self.assertRaises(ValueError):
            relay.publish("explode", {})

    def test_wait_times_out_without_change(self):
        relay.publish("sol", SOL_DATA)
        _, _, version = relay.snapshot()
        slots, log, v = relay.wait(version, timeout=0.05)   # no new publish -> times out
        self.assertEqual(v, version)


@override_settings(SURVIVAL_RELAY_TOKEN=TOKEN)
class IngestEndpointTests(TestCase):
    def setUp(self):
        relay.reset()
        self.url = reverse("survival-ingest")

    def _post(self, body, token=TOKEN, content_type="application/json"):
        headers = {}
        if token is not None:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return self.client.post(self.url, data=body, content_type=content_type, **headers)

    def test_valid_event_is_published(self):
        resp = self._post(json.dumps({"type": "sol", "data": SOL_DATA}))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["ok"])
        slots, _, _ = relay.snapshot()
        self.assertEqual(slots["sol"][0]["sol"], 5)

    def test_missing_token_is_unauthorized(self):
        resp = self._post(json.dumps({"type": "sol", "data": SOL_DATA}), token=None)
        self.assertEqual(resp.status_code, 401)
        self.assertIsNone(relay.snapshot()[0]["sol"][0])

    def test_wrong_token_is_unauthorized(self):
        resp = self._post(json.dumps({"type": "sol", "data": SOL_DATA}), token="nope")
        self.assertEqual(resp.status_code, 401)

    def test_bad_shape_is_rejected(self):
        # 'data' must be a dict, 'type' must be known
        self.assertEqual(self._post(json.dumps({"type": "sol", "data": []})).status_code, 400)
        self.assertEqual(self._post(json.dumps({"type": "x", "data": {}})).status_code, 400)

    def test_invalid_json_is_rejected(self):
        self.assertEqual(self._post("not json{").status_code, 400)

    def test_oversize_payload_is_rejected(self):
        big = {"type": "sol", "data": {"blob": "x" * (300 * 1024)}}
        self.assertEqual(self._post(json.dumps(big)).status_code, 413)

    def test_get_is_method_not_allowed(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)


@override_settings(SURVIVAL_RELAY_TOKEN="")
class IngestDisabledTests(TestCase):
    def setUp(self):
        relay.reset()

    def test_ingest_fails_closed_without_token(self):
        resp = self.client.post(
            reverse("survival-ingest"),
            data=json.dumps({"type": "sol", "data": SOL_DATA}),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer anything",
        )
        self.assertEqual(resp.status_code, 503)


@override_settings(SURVIVAL_RELAY_TOKEN=TOKEN)
class ControlEndpointTests(TestCase):
    def setUp(self):
        relay.reset()
        self.url = reverse("survival-control")

    def _post(self, body, token=TOKEN):
        headers = {}
        if token is not None:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return self.client.post(self.url, data=json.dumps(body),
                                content_type="application/json", **headers)

    def test_requires_token(self):
        self.assertEqual(self._post({"action": "stop"}, token=None).status_code, 401)
        self.assertEqual(self._post({"action": "stop"}, token="nope").status_code, 401)

    def test_get_not_allowed(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_unknown_action_rejected(self):
        self.assertEqual(self._post({"action": "explode"}).status_code, 400)

    def test_stop_is_authorized_and_ok(self):
        resp = self._post({"action": "stop"})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["ok"])

    def test_advance_without_run_is_400(self):
        # No active run -> control.advance raises ValueError -> 400 (not a 502).
        self.assertEqual(self._post({"action": "advance", "sols": 1}).status_code, 400)

    def test_new_session_queues_command_without_touching_the_run(self):
        # 'new_session' is a reverse-channel signal: it queues a command for the
        # supervisor and never calls into the server-side run, so it's OK with no run.
        resp = self._post({"action": "new_session"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["command"], "new_session")
        self.assertEqual(relay.take_command(), "new_session")


class CommandChannelTests(TestCase):
    """The web→supervisor reverse channel: relay store + consume-once poll endpoint."""

    def setUp(self):
        relay.reset()

    def test_set_and_take_is_consume_once(self):
        self.assertIsNone(relay.take_command())
        relay.set_command("new_session")
        self.assertEqual(relay.take_command(), "new_session")
        self.assertIsNone(relay.take_command())  # cleared after one read

    def test_latest_command_wins(self):
        relay.set_command("new_session")
        relay.set_command("new_session")
        self.assertEqual(relay.take_command(), "new_session")
        self.assertIsNone(relay.take_command())

    def test_unknown_command_rejected(self):
        with self.assertRaises(ValueError):
            relay.set_command("self_destruct")

    def test_reset_clears_pending_command(self):
        relay.set_command("new_session")
        relay.reset()
        self.assertIsNone(relay.take_command())


@override_settings(SURVIVAL_RELAY_TOKEN=TOKEN)
class CommandEndpointTests(TestCase):
    def setUp(self):
        relay.reset()
        self.url = reverse("survival-command")

    def _get(self, token=TOKEN):
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token is not None else {}
        return self.client.get(self.url, **headers)

    def test_requires_token(self):
        self.assertEqual(self._get(token=None).status_code, 401)
        self.assertEqual(self._get(token="nope").status_code, 401)

    def test_post_not_allowed(self):
        self.assertEqual(self.client.post(self.url).status_code, 405)

    def test_returns_null_when_no_command(self):
        self.assertIsNone(self._get().json()["command"])

    def test_consumes_pending_command_once(self):
        relay.set_command("new_session")
        self.assertEqual(self._get().json()["command"], "new_session")
        self.assertIsNone(self._get().json()["command"])  # already consumed


@override_settings(SURVIVAL_RELAY_TOKEN="")
class CommandDisabledTests(TestCase):
    def test_command_fails_closed_without_token(self):
        resp = self.client.get(reverse("survival-command"),
                               HTTP_AUTHORIZATION="Bearer anything")
        self.assertEqual(resp.status_code, 503)


@override_settings(SURVIVAL_RELAY_TOKEN="relay-tok", SURVIVAL_CONTROL_TOKEN="control-pw")
class ControlSeparateTokenTests(TestCase):
    def setUp(self):
        relay.reset()
        self.url = reverse("survival-control")

    def _stop(self, tok):
        return self.client.post(self.url, data=json.dumps({"action": "stop"}),
                                content_type="application/json",
                                HTTP_AUTHORIZATION=f"Bearer {tok}")

    def test_control_password_works(self):
        self.assertEqual(self._stop("control-pw").status_code, 200)

    def test_relay_token_rejected_when_control_password_set(self):
        # Once a separate control password exists, the MCP relay token can't drive controls.
        self.assertEqual(self._stop("relay-tok").status_code, 401)


@override_settings(SURVIVAL_RELAY_TOKEN="")
class ControlDisabledTests(TestCase):
    def test_control_fails_closed_without_token(self):
        resp = self.client.post(
            reverse("survival-control"),
            data=json.dumps({"action": "stop"}),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer anything",
        )
        self.assertEqual(resp.status_code, 503)


class LiveStreamTests(TestCase):
    def setUp(self):
        relay.reset()

    def test_live_replays_current_state_on_connect(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.publish("sol", SOL_DATA)

        resp = self.client.get(reverse("survival-live"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "text/event-stream")

        # Pull only the two replay frames; don't drain into the infinite wait loop.
        gen = iter(resp.streaming_content)
        first = next(gen).decode()
        second = next(gen).decode()

        self.assertIn("event: run", first)
        self.assertIn("event: sol", second)
        self.assertIn('"sol": 5', second)

    def test_live_replays_plan_on_connect(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.publish("plan", {"farm_layout": {"total_kcal_per_day": 41000},
                               "food_plan": None, "note": "layout"})

        resp = self.client.get(reverse("survival-live"))
        gen = iter(resp.streaming_content)
        first = next(gen).decode()    # run
        second = next(gen).decode()   # plan
        self.assertIn("event: run", first)
        self.assertIn("event: plan", second)
        self.assertIn("41000", second)

    def test_live_replays_reasoning_history_on_connect(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.publish("sol", {**SOL_DATA, "sol": 1, "reasoning": "boot"})
        relay.publish("sol", {**SOL_DATA, "sol": 2, "reasoning": ""})
        relay.publish("sol", {**SOL_DATA, "sol": 3, "reasoning": "trim O2"})

        resp = self.client.get(reverse("survival-live"))
        gen = iter(resp.streaming_content)
        # run, then both reasoning sols (1 and 3) replay in order; the blank sol 2 is
        # the latest slot but shares no new version beyond the log, so no dup flood.
        frames = [next(gen).decode() for _ in range(3)]

        self.assertIn("event: run", frames[0])
        self.assertIn('"reasoning": "boot"', frames[1])
        self.assertIn('"reasoning": "trim O2"', frames[2])
