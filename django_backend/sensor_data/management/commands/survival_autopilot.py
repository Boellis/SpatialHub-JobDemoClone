"""survival_autopilot -- always-on deterministic survival feeder.

Loops forever: start a BioSim run from ``survival_defensible.biosim``, drive it
sol-by-sol with the deterministic doctrine controller
(``survival.doctrine_controller.decide``), POST ``run``/``sol``/``end`` events to
the Cloud Run relay's ``/api/survival/ingest`` endpoint, and on crew death record
the result and start a fresh run. NO Anthropic API -- this is the free, defensible
"baseline pilot" that keeps the public dashboard showing REAL BioSim data 24/7.

Resilient by design: transient BioSim/relay errors are retried with backoff; a run
that wedges is abandoned and a new one started. The per-sol token/cost meter fields
are set to 0 (deterministic controller spends no tokens).

Usage:
    python manage.py survival_autopilot
    python manage.py survival_autopilot --cap 400 --difficulty malfunctions --crew 15
    python manage.py survival_autopilot --once     # one run then exit (for testing)

Environment (required for the relay POST):
    BIOSIM_URL            BioSim base URL          (default http://localhost:8009)
    SURVIVAL_RELAY_URL    relay base URL; /ingest is appended (e.g. the Cloud Run URL)
    SURVIVAL_RELAY_TOKEN  bearer token matching the relay's SURVIVAL_RELAY_TOKEN

If SURVIVAL_RELAY_URL / SURVIVAL_RELAY_TOKEN are unset, the feeder still drives
BioSim and logs locally but skips the POST (useful for a dry run).
"""
import os
import time
import uuid

import requests
from django.core.management.base import BaseCommand

from sensor_data.survival import doctrine_controller, playground
from sensor_data.survival.biosim_control import BiosimControl
from sensor_data.survival.state import TICKS_PER_SOL, summarize_state

MALF_MODULE = "Grey_Water_Store"


class Command(BaseCommand):
    help = ("Always-on deterministic feeder: drives BioSim with the doctrine "
            "controller and POSTs run/sol/end events to the survival relay.")

    def add_arguments(self, parser):
        parser.add_argument("--cap", type=int, default=int(os.environ.get("AUTOPILOT_CAP", "500")),
                            help="max sols per run before forcing a fresh run")
        parser.add_argument("--difficulty", choices=["off", "malfunctions"],
                            default=os.environ.get("AUTOPILOT_DIFFICULTY", "off"))
        parser.add_argument("--crew", type=int, default=int(os.environ.get("BIOSIM_CREW_SIZE", "15")))
        parser.add_argument("--once", action="store_true",
                            help="run a single survival run then exit (testing)")
        parser.add_argument("--biosim-url", default=os.environ.get("BIOSIM_URL", "http://localhost:8009"))
        parser.add_argument("--relay-url", default=os.environ.get("SURVIVAL_RELAY_URL", ""))
        parser.add_argument("--relay-token", default=os.environ.get("SURVIVAL_RELAY_TOKEN", ""))

    # -- relay POST ---------------------------------------------------------
    def _post_event(self, relay_url, token, etype, data):
        """Best-effort POST of one {type,data} event to the relay /ingest. Retries
        a couple times on transient errors; never raises (a relay hiccup must not
        kill the feeder)."""
        if not relay_url or not token:
            return  # dry run: no relay configured
        url = relay_url.rstrip("/") + "/ingest"
        body = {"type": etype, "data": data}
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        for attempt in range(3):
            try:
                r = requests.post(url, json=body, headers=headers, timeout=15)
                if r.status_code < 500:
                    return
            except requests.RequestException as e:
                self.stderr.write(f"[autopilot] relay POST {etype} failed ({e})")
            time.sleep(2 * (attempt + 1))

    # -- one run ------------------------------------------------------------
    def _run_once(self, client, relay_url, token, cap, difficulty, crew):
        run_id = uuid.uuid4().hex
        xml, _, _ = playground.build_config({}, crew)
        sim_id = client.start_sim(xml)
        self.stdout.write(f"[autopilot] started run {run_id} sim {sim_id} "
                          f"(cap={cap}, difficulty={difficulty}, crew={crew})")
        self._post_event(relay_url, token, "run", {
            "run_id": run_id, "difficulty": difficulty, "crew_size": crew,
            "pilot": "deterministic_doctrine"})

        sol = 0
        reason = "sol_cap"
        while sol < cap:
            try:
                raw = client.get_state(sim_id)
                snap = summarize_state(raw)
                if snap["ended"]:
                    reason = "crew_death"
                    break
                decision = doctrine_controller.decide(snap)
                for a in decision["actions"]:
                    try:
                        client.set_flows(sim_id, a["module"], a["kind"], a["type"], a["rates"])
                    except Exception:
                        pass
                if difficulty == "malfunctions" and sol > 0 and sol % 10 == 0:
                    try:
                        client.add_malfunction(sim_id, MALF_MODULE)
                    except Exception:
                        pass
                client.tick(sim_id, TICKS_PER_SOL)
                sol += 1
                raw = client.get_state(sim_id)
                snap = summarize_state(raw)
                alive = not snap["ended"]
                # Deterministic controller: token/cost meter is always 0.
                self._post_event(relay_url, token, "sol", {
                    "sol": sol, "alive": alive, "modules": raw.get("modules", {}),
                    "reasoning": " | ".join(decision["trace"]),
                    "actions": decision["actions"], "warnings": snap["warnings"],
                    "mode": decision["mode"],
                    "tokens_this_sol": 0, "tokens_total": 0, "est_cost_usd_total": 0.0})
                if not alive:
                    reason = "crew_death"
                    sol -= 1  # crew died during the tick into sol N+1; report N
                    break
            except requests.RequestException as e:
                # Transient BioSim error: brief backoff then retry the sol loop.
                self.stderr.write(f"[autopilot] BioSim error at sol {sol} ({e}); retrying")
                time.sleep(3)
                continue

        sols_survived = max(sol, 0)
        self._post_event(relay_url, token, "end", {
            "run_id": run_id, "sols_survived": sols_survived, "ended_reason": reason,
            "difficulty": difficulty, "tokens_total": 0, "est_cost_usd_total": 0.0})
        self.stdout.write(f"[autopilot] run {run_id} ended: {sols_survived} sols ({reason})")
        return sols_survived, reason

    def handle(self, *args, **opts):
        biosim_url = opts["biosim_url"]
        relay_url = opts["relay_url"]
        token = opts["relay_token"]
        cap, difficulty, crew = opts["cap"], opts["difficulty"], opts["crew"]

        self.stdout.write(f"[autopilot] BIOSIM_URL={biosim_url} "
                          f"relay={'configured' if (relay_url and token) else 'DRY-RUN (no POST)'}")
        client = BiosimControl(biosim_url)

        backoff = 5
        while True:
            try:
                self._run_once(client, relay_url, token, cap, difficulty, crew)
                backoff = 5  # reset after a clean run
            except Exception as e:  # start_sim failure or unexpected error
                self.stderr.write(f"[autopilot] run failed to start/complete ({e}); "
                                  f"backing off {backoff}s")
                time.sleep(backoff)
                backoff = min(backoff * 2, 120)
                if opts["once"]:
                    raise
                continue
            if opts["once"]:
                break
            time.sleep(2)  # brief pause between runs
