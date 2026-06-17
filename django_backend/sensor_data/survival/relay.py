"""relay.py — in-memory bridge between an external survival pilot and the web app.

The "brain" of the survival run is an external pilot — the ``mcp_biosim`` server
driven by a Claude subscription session — NOT a server-side Anthropic call. That
pilot POSTs ``run``/``sol``/``end`` events to ``/api/survival/ingest``; this module
holds the latest snapshot of the active run and wakes any browsers connected to the
read-only ``/api/survival/live`` SSE stream. No ANTHROPIC_API_KEY is involved.

Single-process by design: the ingest writer and the SSE readers share this module
state, so deploy Cloud Run with ``--max-instances=1`` so they land on one instance.

Two kinds of state are kept:
  * The latest ``run``/``sol``/``end`` slots (version-stamped) — for the resource
    cards / counter, which only ever need the most recent value.
  * A bounded LOG of the sol events that carried reasoning. Reasoning is sparse
    (the pilot tags one sol per decision) and historical, so the latest-snapshot
    model would lose it. The log lets a late-joining browser replay the decision
    history, and lets the live stream deliver every reasoning frame even when rapid
    sol events coalesce between SSE wake-ups.
"""

import json
import os
import threading

EVENT_TYPES = ("run", "sol", "end", "plan")
# Slots replayed to a late-joining browser. `status` (paused/running) is broadcast
# like the telemetry slots but is NOT in EVENT_TYPES — the pilot can't inject it via
# /ingest; only the web pause/resume controls set it (see set_paused).
SLOT_TYPES = EVENT_TYPES + ("status",)
# Replay buffer for late-joining browsers. The durable, unbounded history lives in
# Postgres (see history.py); this just keeps the current run replayable from memory.
_LOG_CAP = 500

_COND = threading.Condition()
_STATE = {
    "version": 0,
    "run": (None, 0),   # latest 'run' event data + the version it was set at
    "sol": (None, 0),   # latest 'sol' event data + version
    "end": (None, 0),   # 'end' event data once the run ends + version
    "plan": (None, 0),  # latest 'plan' (farm layout + food plan) + version
    "status": ({"paused": False}, 0),  # run paused/running — broadcast to all screens
    "log": [],          # [(version, sol_data), ...] for sol events with reasoning
}

# Reverse channel: a single pending command the web app sets for the external
# supervisor to act on (e.g. "new_session" — respawn a fresh pilot subagent that
# resume_run's, compacting context without losing the run). Consume-once: the
# supervisor polls take_command(), acts, and the slot clears. Kept separate from the
# version-stamped telemetry above so polling it never disturbs the SSE stream.
_COMMAND = {"pending": None}
KNOWN_COMMANDS = ("new_session",)

# ---------------------------------------------------------------------------
# Sols high-score — the best `sols_survived` ever seen across runs. Survives a
# Cloud Run restart via a small JSON file (best-effort) when HIGHSCORE_PATH is
# set; otherwise it is in-memory only. Updated on every `end` event.
# ---------------------------------------------------------------------------
# Default location is writable on Cloud Run (/tmp). Override with HIGHSCORE_PATH.
_HIGHSCORE_PATH = os.environ.get("SURVIVAL_HIGHSCORE_PATH", "/tmp/survival_highscore.json")
_HIGHSCORE = {"best_sols": 0, "run_id": None, "ended_reason": None,
              "difficulty": None, "when": None}
_HIGHSCORE_LOADED = [False]


def _highscore_load():
    """Lazily hydrate the high-score from disk once per process (best-effort)."""
    if _HIGHSCORE_LOADED[0]:
        return
    _HIGHSCORE_LOADED[0] = True
    try:
        with open(_HIGHSCORE_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict) and isinstance(data.get("best_sols"), int):
            _HIGHSCORE.update({k: data.get(k) for k in _HIGHSCORE})
    except Exception:  # pragma: no cover - missing/corrupt file is fine
        pass


def _highscore_save():
    try:
        with open(_HIGHSCORE_PATH, "w", encoding="utf-8") as fh:
            json.dump(_HIGHSCORE, fh)
    except Exception:  # pragma: no cover - read-only fs etc.
        pass


def _maybe_update_highscore(end_data):
    """If this `end` event beat the record, persist the new high-score. Caller
    must hold _COND. Returns True when the record advanced."""
    if not isinstance(end_data, dict):
        return False
    _highscore_load()
    try:
        sols = int(end_data.get("sols_survived", 0) or 0)
    except (TypeError, ValueError):
        return False
    if sols <= _HIGHSCORE["best_sols"]:
        return False
    import datetime
    _HIGHSCORE.update({
        "best_sols": sols,
        "run_id": end_data.get("run_id"),
        "ended_reason": end_data.get("ended_reason"),
        "difficulty": end_data.get("difficulty"),
        "when": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })
    _highscore_save()
    return True


def highscore():
    """Return the current sols high-score snapshot (a fresh dict)."""
    with _COND:
        _highscore_load()
        return dict(_HIGHSCORE)


def publish(event_type, data):
    """Record an event and wake subscribers; returns the new version.

    A ``run`` event starts a fresh run, clearing any prior sol/end/log so stale
    state never leaks across runs. A ``sol`` event that carries non-empty
    ``reasoning`` is also appended to the bounded decision log.
    """
    if event_type not in EVENT_TYPES:
        raise ValueError(f"unknown event type: {event_type}")
    with _COND:
        _STATE["version"] += 1
        v = _STATE["version"]
        if event_type == "run":
            _STATE["run"] = (data, v)
            _STATE["sol"] = (None, v)
            _STATE["end"] = (None, v)
            _STATE["plan"] = (None, v)  # fresh run -> drop any stale habitat plan
            # A fresh run is running. Clear any stale paused flag, but keep the slot's
            # stamp so we don't emit a redundant "running" frame on every connect —
            # the `run` event itself tells the client the run is live.
            _STATE["status"] = ({"paused": False}, _STATE["status"][1])
            _STATE["log"] = []
        elif event_type == "sol":
            _STATE["sol"] = (data, v)
            if isinstance(data, dict) and data.get("reasoning"):
                log = _STATE["log"]
                log.append((v, data))
                if len(log) > _LOG_CAP:
                    del log[0:len(log) - _LOG_CAP]
        elif event_type == "plan":
            _STATE["plan"] = (data, v)
        else:  # end
            _STATE["end"] = (data, v)
            # An ended/stopped run is not "paused". Clear the flag without bumping the
            # stamp (the `end` event already moves the client out of the paused view).
            _STATE["status"] = ({"paused": False}, _STATE["status"][1])
            # Update the persistent sols high-score on every run end.
            _maybe_update_highscore(data)
        _COND.notify_all()
    # Durable archive — best-effort, outside the lock so DB I/O never blocks readers.
    _persist(event_type, data)
    return v


def _persist(event_type, data):
    """Mirror the event into Postgres. Lazily imported and fully guarded so the relay
    stays Django-free to import and a DB failure can never break the live run."""
    try:
        from . import history
        history.record(event_type, data)
    except Exception:  # pragma: no cover - defensive
        pass


def _read():
    return (
        {k: _STATE[k] for k in SLOT_TYPES},
        list(_STATE["log"]),
        _STATE["version"],
    )


def snapshot():
    """Return ``(slots, log, version)`` for a newly connected subscriber, where
    slots is ``{"run": (data, stamp), "sol": (...), "end": (...)}`` and log is a
    list of ``(version, sol_data)`` reasoning frames."""
    with _COND:
        return _read()


def wait(last_version, timeout):
    """Block until the version advances past ``last_version`` or ``timeout`` seconds
    elapse, then return ``(slots, log, version)``. If it returns with
    ``version == last_version`` the caller timed out (emit a heartbeat)."""
    with _COND:
        if _STATE["version"] <= last_version:
            _COND.wait(timeout)
        return _read()


def set_paused(paused):
    """Set the run's paused flag and wake subscribers so every screen reflects it
    immediately. Broadcast as a version-stamped ``status`` slot (replayed to late
    joiners), independent of the discrete telemetry events. Returns the new version."""
    with _COND:
        _STATE["version"] += 1
        _STATE["status"] = ({"paused": bool(paused)}, _STATE["version"])
        _COND.notify_all()
        return _STATE["version"]


def is_paused():
    """Whether the current run is paused — the single source of truth read by the
    web controls, the server-side advance loop, and the MCP pilot's command poll."""
    with _COND:
        return bool(_STATE["status"][0].get("paused", False))


def set_command(command):
    """Queue a single web→supervisor command (latest wins). Raises on unknown ones
    so a typo can't silently strand the supervisor waiting for a command that the
    poller will never recognise."""
    if command not in KNOWN_COMMANDS:
        raise ValueError(f"unknown command: {command}")
    with _COND:
        _COMMAND["pending"] = command


def take_command():
    """Return the pending command and clear it (consume-once); None if none queued."""
    with _COND:
        cmd = _COMMAND["pending"]
        _COMMAND["pending"] = None
        return cmd


def reset():
    """Clear all relay state (tests, or a fresh process)."""
    with _COND:
        _STATE["version"] = 0
        for k in EVENT_TYPES:
            _STATE[k] = (None, 0)
        _STATE["status"] = ({"paused": False}, 0)
        _STATE["log"] = []
        _COMMAND["pending"] = None
        _HIGHSCORE.update({"best_sols": 0, "run_id": None, "ended_reason": None,
                           "difficulty": None, "when": None})
        _HIGHSCORE_LOADED[0] = False
        _COND.notify_all()
    try:
        from . import history
        history.reset()
    except Exception:  # pragma: no cover - defensive
        pass
