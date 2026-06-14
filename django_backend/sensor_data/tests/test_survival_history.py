"""Tests for the durable survival decision-log archive: persistence wired through
relay.publish, plus the public /history and /history/<run_id> read endpoints.

Run on macOS:
    USE_SQLITE=1 /tmp/shub_venv/bin/python -m pytest \
        sensor_data/tests/test_survival_history.py -q
"""

from django.test import TestCase
from django.urls import reverse

from sensor_data.models import SurvivalDecision, SurvivalRun
from sensor_data.survival import relay


def _sol(sol, reasoning, actions=None):
    return {
        "sol": sol, "alive": True, "modules": {},
        "reasoning": reasoning,
        "actions": actions or [{"module": "OGS", "kind": "producers",
                                "type": "O2", "desired_rates": [986.0]}],
        "warnings": [],
    }


class HistoryPersistenceTests(TestCase):
    def setUp(self):
        relay.reset()

    def test_run_event_creates_run_row(self):
        relay.publish("run", {"run_id": "abc123", "difficulty": "off", "crew_size": 15})
        run = SurvivalRun.objects.get(run_id="abc123")
        self.assertEqual(run.crew_size, 15)
        self.assertEqual(run.difficulty, "off")
        self.assertIsNone(run.ended_at)

    def test_reasoned_sols_become_decisions(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off", "crew_size": 15})
        relay.publish("sol", _sol(1, "boot config maxes everything"))
        relay.publish("sol", _sol(2, ""))          # blank reasoning -> not a decision
        relay.publish("sol", _sol(3, "trim OGS O2 to 986 to save water"))
        run = SurvivalRun.objects.get(run_id="r1")
        sols = list(run.decisions.values_list("sol", flat=True))
        self.assertEqual(sols, [1, 3])             # blank sol skipped, ordered by sol
        self.assertEqual(run.sols_survived, 3)     # tracks the high-water sol

    def test_decision_keeps_actions(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.publish("sol", _sol(5, "raise power"))
        d = SurvivalDecision.objects.get(run__run_id="r1", sol=5)
        self.assertEqual(d.actions[0]["module"], "OGS")

    def test_end_event_finalizes_run(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.publish("sol", _sol(40, "holding steady"))
        relay.publish("end", {"sols_survived": 42, "ended_reason": "crew_death"})
        run = SurvivalRun.objects.get(run_id="r1")
        self.assertEqual(run.sols_survived, 42)
        self.assertEqual(run.ended_reason, "crew_death")
        self.assertIsNotNone(run.ended_at)

    def test_two_runs_are_isolated(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.publish("sol", _sol(1, "first run move"))
        relay.publish("run", {"run_id": "r2", "difficulty": "malfunctions"})
        relay.publish("sol", _sol(1, "second run move"))
        self.assertEqual(SurvivalRun.objects.count(), 2)
        self.assertEqual(SurvivalDecision.objects.filter(run__run_id="r1").count(), 1)
        self.assertEqual(SurvivalDecision.objects.filter(run__run_id="r2").count(), 1)

    def test_sol_without_run_is_dropped_silently(self):
        # No run context (e.g. process restarted mid-run) -> no crash, no orphan row.
        relay.publish("sol", _sol(1, "orphan decision"))
        self.assertEqual(SurvivalDecision.objects.count(), 0)

    def test_decision_attaches_across_workers(self):
        # Simulate gunicorn's multi-worker reality: the 'run' event is handled by one
        # worker, the 'sol' by another whose process-local state is fresh. reset()
        # mimics that fresh worker. The decision must STILL attach (DB-derived run),
        # which the old module-global design failed to do.
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.reset()  # different worker process -> no in-memory "current run"
        relay.publish("sol", _sol(7, "trim O2 on the other worker"))
        run = SurvivalRun.objects.get(run_id="r1")
        self.assertEqual(run.decisions.count(), 1)
        self.assertEqual(run.decisions.first().sol, 7)

    def test_end_finalizes_across_workers(self):
        relay.publish("run", {"run_id": "r1", "difficulty": "off"})
        relay.reset()
        relay.publish("end", {"sols_survived": 99, "ended_reason": "crew_death"})
        run = SurvivalRun.objects.get(run_id="r1")
        self.assertEqual(run.sols_survived, 99)
        self.assertIsNotNone(run.ended_at)


class HistoryEndpointTests(TestCase):
    def setUp(self):
        relay.reset()
        relay.publish("run", {"run_id": "run-a", "difficulty": "off", "crew_size": 15})
        relay.publish("sol", _sol(1, "alpha decision"))
        relay.publish("sol", _sol(2, "beta decision"))
        relay.publish("end", {"sols_survived": 2, "ended_reason": "crew_death"})

    def test_history_lists_runs(self):
        resp = self.client.get(reverse("survival-history"))
        self.assertEqual(resp.status_code, 200)
        runs = resp.json()["runs"]
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["run_id"], "run-a")
        self.assertEqual(runs[0]["decision_count"], 2)
        self.assertFalse(runs[0]["in_progress"])

    def test_history_post_not_allowed(self):
        self.assertEqual(self.client.post(reverse("survival-history")).status_code, 405)

    def test_run_detail_returns_full_log(self):
        resp = self.client.get(reverse("survival-run-detail", args=["run-a"]))
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["run"]["sols_survived"], 2)
        self.assertEqual([d["sol"] for d in body["decisions"]], [1, 2])
        self.assertEqual(body["decisions"][0]["reasoning"], "alpha decision")

    def test_unknown_run_is_404(self):
        self.assertEqual(
            self.client.get(reverse("survival-run-detail", args=["nope"])).status_code, 404
        )
