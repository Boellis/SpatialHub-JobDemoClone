"""history.py — durable persistence of survival runs and their decision logs.

The relay (``relay.py``) keeps only the latest snapshot + a bounded in-memory decision
log, all of which is lost on a Cloud Run restart. This module mirrors every
``run``/``sol``/``end`` event into Postgres so the full decision history survives
restarts and can be browsed across runs (see ``views.survival_history``).

It is wired in via ``relay.publish`` and is **best-effort**: every write is wrapped so
a database hiccup can never break the live demo. It also runs *outside* the relay lock,
so DB I/O never blocks the SSE fan-out.

**Worker-safe by design.** Gunicorn runs multiple worker processes, so the ``run``
event and a later ``sol`` event may be handled by *different* processes. We therefore
do NOT track the "current run" in a module global — we derive it from the DB: the
current run is the most-recently-started run that hasn't ended yet. Every worker sees
the same committed row, so decisions attach correctly no matter which worker handles
each event. (Only one survival run is driven at a time, so "latest open run" is
unambiguous.)
"""

import logging

logger = logging.getLogger(__name__)


def reset():
    """No-op. Kept for ``relay.reset()`` compatibility — there is no module state to
    clear now that the current run is derived from the database."""
    return None


def record(event_type, data):
    """Persist one relay event. Never raises — failures are logged and swallowed."""
    try:
        if not isinstance(data, dict):
            return
        if event_type == "run":
            _record_run(data)
        elif event_type == "sol":
            _record_sol(data)
        elif event_type == "end":
            _record_end(data)
        elif event_type == "plan":
            _record_plan(data)
    except Exception:  # pragma: no cover - defensive: persistence must never break the live run
        logger.exception("survival history persistence failed (%s)", event_type)


def _current_run():
    """The run currently in progress: latest started, not yet ended. None if no open
    run exists. DB-derived so it is consistent across all gunicorn workers."""
    from sensor_data.models import SurvivalRun

    return (
        SurvivalRun.objects.filter(ended_at__isnull=True)
        .order_by("-started_at", "-id")
        .first()
    )


def _record_run(data):
    from sensor_data.models import SurvivalRun

    run_id = data.get("run_id")
    if not run_id:
        return
    SurvivalRun.objects.update_or_create(
        run_id=run_id,
        defaults={
            "difficulty": data.get("difficulty", "off"),
            "crew_size": int(data.get("crew_size", 15) or 15),
        },
    )


def _record_sol(data):
    from sensor_data.models import SurvivalDecision

    reasoning = (data.get("reasoning") or "").strip()
    if not reasoning:
        return  # only reasoned sols are decisions
    run = _current_run()
    if run is None:
        return
    sol = int(data.get("sol", 0) or 0)
    SurvivalDecision.objects.create(
        run=run,
        sol=sol,
        reasoning=reasoning,
        actions=data.get("actions", []) or [],
    )
    if sol > run.sols_survived:
        run.sols_survived = sol
        run.save(update_fields=["sols_survived"])


def _record_plan(data):
    """Persist one generated habitat plan (farm layout + food plan). Skips empties and
    exact consecutive duplicates so re-published identical plans don't pile up. Tags the
    open run (if any) for context, but plans are browsed independently of runs."""
    from sensor_data.models import SurvivalPlan

    farm = data.get("farm_layout")
    food = data.get("food_plan")
    if not farm and not food:
        return  # nothing generated yet
    last = SurvivalPlan.objects.order_by("-id").first()
    if last is not None and last.farm_layout == farm and last.food_plan == food:
        return  # identical to the most recent — don't duplicate
    run = _current_run()
    SurvivalPlan.objects.create(
        run_id=run.run_id if run is not None else "",
        sol=int(data.get("sol", 0) or 0),
        farm_layout=farm,
        food_plan=food,
        note=(data.get("note") or "").strip(),
    )


def _record_end(data):
    from django.utils import timezone

    run = _current_run()
    if run is None:
        return
    run.sols_survived = max(run.sols_survived, int(data.get("sols_survived", 0) or 0))
    run.ended_reason = data.get("ended_reason", "") or ""
    run.ended_at = timezone.now()
    run.save(update_fields=["sols_survived", "ended_reason", "ended_at"])
