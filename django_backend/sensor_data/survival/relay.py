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

import threading

EVENT_TYPES = ("run", "sol", "end")
_LOG_CAP = 50

_COND = threading.Condition()
_STATE = {
    "version": 0,
    "run": (None, 0),   # latest 'run' event data + the version it was set at
    "sol": (None, 0),   # latest 'sol' event data + version
    "end": (None, 0),   # 'end' event data once the run ends + version
    "log": [],          # [(version, sol_data), ...] for sol events with reasoning
}


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
            _STATE["log"] = []
        elif event_type == "sol":
            _STATE["sol"] = (data, v)
            if isinstance(data, dict) and data.get("reasoning"):
                log = _STATE["log"]
                log.append((v, data))
                if len(log) > _LOG_CAP:
                    del log[0:len(log) - _LOG_CAP]
        else:  # end
            _STATE["end"] = (data, v)
        _COND.notify_all()
        return v


def _read():
    return (
        {k: _STATE[k] for k in EVENT_TYPES},
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


def reset():
    """Clear all relay state (tests, or a fresh process)."""
    with _COND:
        _STATE["version"] = 0
        for k in EVENT_TYPES:
            _STATE[k] = (None, 0)
        _STATE["log"] = []
        _COND.notify_all()
