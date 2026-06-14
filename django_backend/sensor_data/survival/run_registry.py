"""run_registry.py — Threadsafe in-memory registry of cancellable survival runs.

A run gets a uuid via `new_run_id()`. The SSE generator polls `is_cancelled(id)`
each sol; a `POST /survival/stop` calls `request_stop(id)`. `clear(id)` removes a
finished run. All access is guarded by a single Lock.
"""

import threading
import uuid

_lock = threading.Lock()
_active = set()
_cancelled = set()


def new_run_id():
    run_id = uuid.uuid4().hex
    with _lock:
        _active.add(run_id)
    return run_id


def request_stop(run_id):
    with _lock:
        if run_id in _active:
            _cancelled.add(run_id)
            return True
        return False


def is_cancelled(run_id):
    with _lock:
        return run_id in _cancelled


def clear(run_id):
    with _lock:
        _active.discard(run_id)
        _cancelled.discard(run_id)
