import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import pytest
import doctrine as d


@pytest.fixture
def tmp_doctrine(tmp_path, monkeypatch):
    monkeypatch.setattr(d, "_DOCTRINE_FILE", tmp_path / "doctrine.json")
    monkeypatch.setattr(d, "_MIRROR_FILE", tmp_path / "doctrine.md")
    return tmp_path


def test_load_missing_returns_bootstrap(tmp_doctrine):
    doc = d.load()
    assert doc["version"] >= 1
    assert "Potable_Water_Store" in doc["guardrails"]["reserve_bands"]
    assert doc["guardrails"]["reserve_bands"]["Potable_Water_Store"]["floor_pct"] == 30
    assert doc["lessons"] == []


def test_save_then_load_roundtrip(tmp_doctrine):
    doc = d.bootstrap()
    d.save(doc)
    assert (tmp_doctrine / "doctrine.json").exists()
    assert (tmp_doctrine / "doctrine.md").exists()
    assert d.load()["guardrails"] == doc["guardrails"]


def test_load_corrupt_falls_back_to_bootstrap(tmp_doctrine):
    (tmp_doctrine / "doctrine.json").write_text("{not json")
    doc = d.load()
    assert doc["guardrails"]["reserve_bands"]["O2_Store"]["floor_pct"] == 20


def test_merge_overrides_band_and_appends_lesson(tmp_doctrine):
    d.save(d.bootstrap())
    doc = d.merge(
        guardrails={"reserve_bands": {"Potable_Water_Store": {"floor_pct": 35, "target_pct": 45}}},
        lessons=[{"run_id": "abc", "sol": 100, "text": "raised potable floor", "source": "after-action"}],
        now="2026-06-14T00:00:00Z",
    )
    assert doc["guardrails"]["reserve_bands"]["Potable_Water_Store"] == {"floor_pct": 35, "target_pct": 45}
    assert doc["lessons"][-1]["id"] == 1
    assert doc["lessons"][-1]["text"] == "raised potable floor"
    assert doc["version"] == d.bootstrap()["version"] + 1
    assert doc["updated_at"] == "2026-06-14T00:00:00Z"


def test_merge_rejects_unknown_store(tmp_doctrine):
    d.save(d.bootstrap())
    with pytest.raises(ValueError):
        d.merge(guardrails={"reserve_bands": {"Nope_Store": {"floor_pct": 10, "target_pct": 20}}})


def test_merge_rejects_floor_above_target(tmp_doctrine):
    d.save(d.bootstrap())
    with pytest.raises(ValueError):
        d.merge(guardrails={"reserve_bands": {"O2_Store": {"floor_pct": 80, "target_pct": 40}}})


def test_violations_flags_below_floor_only(tmp_doctrine):
    d.save(d.bootstrap())
    v = d.violations([
        {"name": "Potable_Water_Store", "pct": 0.0},
        {"name": "O2_Store", "pct": 100.0},
        {"name": "Food_Store", "pct": 10.0},
        {"name": "Biomass_Store", "pct": 0.0},  # not life-critical -> ignored
    ])
    flagged = {x["store"] for x in v}
    assert flagged == {"Potable_Water_Store", "Food_Store"}
    pot = next(x for x in v if x["store"] == "Potable_Water_Store")
    assert pot["kind"] == "reserve_floor" and pot["floor"] == 30
