"""relay.py — in-memory bridge between an external survival pilot and the web app.

The "brain" of the survival run is an external pilot — the ``mcp_biosim`` server
driven by a Claude subscription session — NOT a server-side Anthropic call. That
pilot POSTs ``run``/``sol``/``end`` events to ``/api/survival/ingest``; this module
holds the latest snapshot of the active run and wakes any browsers connected to the
read-only ``/api/survival/live`` SSE stream. No ANTHROPIC_API_KEY is involved.

Single-process by design: the ingest writer and the SSE readers share this module
state, so deploy Cloud Run with ``--max-instances=1`` so they land on one instance.

Each slot stores ``(data, version_stamp)`` so a subscriber can tell which of
run/sol/end changed since it last emitted, and replay the current state on connect.
"""

import threading

EVENT_TYPES = ("run", "sol", "end")

_COND = threading.Condition()
_STATE = {
    "version": 0,
    "run": (None, 0),   # latest 'run' event data + the version it was set at
    "sol": (None, 0),   # latest 'sol' event data + version
    "end": (None, 0),   # 'end' event data once the run ends + version
}


def publish(event_type, data):
    """Record an event and wake subscribers; returns the new version.

    A ``run`` event starts a fresh run, clearing any prior sol/end so a stale
    "Survived N sols" card never leaks across runs.
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
        else:
            _STATE[event_type] = (data, v)
        _COND.notify_all()
        return v


def snapshot():
    """Return ``(slots, version)`` for a newly connected subscriber, where slots
    is ``{"run": (data, stamp), "sol": (...), "end": (...)}``."""
    with _COND:
        return (
            {k: _STATE[k] for k in EVENT_TYPES},
            _STATE["version"],
        )


def wait(last_version, timeout):
    """Block until the version advances past ``last_version`` or ``timeout`` seconds
    elapse, then return ``(slots, version)``. If it returns with
    ``version == last_version`` the caller timed out (emit a heartbeat)."""
    with _COND:
        if _STATE["version"] <= last_version:
            _COND.wait(timeout)
        return (
            {k: _STATE[k] for k in EVENT_TYPES},
            _STATE["version"],
        )


def reset():
    """Clear all relay state (tests, or a fresh process)."""
    with _COND:
        _STATE["version"] = 0
        for k in EVENT_TYPES:
            _STATE[k] = (None, 0)
        _COND.notify_all()
