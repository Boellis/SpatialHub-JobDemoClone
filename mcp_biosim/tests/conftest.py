"""Shared test fixtures for the biosim MCP server tests.

Critically: isolate the repo's REAL persistent files. Several tests drive
``server.advance`` / ``server._save_state`` and ``doctrine.save`` with fixture
data; without this, they would overwrite the live ``.run_state.json`` (clobbering
a real in-progress run's sim pointer) and the committed ``doctrine.json``. This
autouse fixture redirects all three persistence paths to a per-test tmp dir so no
test can ever touch real state.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest  # noqa: E402

import doctrine  # noqa: E402
import server  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_persistent_files(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "_STATE_FILE", tmp_path / ".run_state.json")
    monkeypatch.setattr(doctrine, "_DOCTRINE_FILE", tmp_path / "doctrine.json")
    monkeypatch.setattr(doctrine, "_MIRROR_FILE", tmp_path / "doctrine.md")
