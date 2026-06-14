from sensor_data.survival.config import build_survival_config


def test_run_till_crew_death_true():
    assert 'runTillCrewDeath="true"' in build_survival_config(15)


def test_injects_crew_count():
    assert build_survival_config(15).count("<crewPerson") == 15


def test_includes_specialists():
    xml = build_survival_config(15)
    assert "Food Systems Engineer" in xml and "Nutrition Specialist" in xml


def test_schedule_is_whitespace_formatted():
    # BioSim walks the schedule with getFirstChild()/getNextSibling() and throws
    # NullPointerException if the <activity> tags are not whitespace-separated.
    # A collapsed schedule (verified live) breaks sim start, so guard against it.
    xml = build_survival_config(2)
    assert "<schedule><activity" not in xml      # no collapsed schedule open
    assert "/><activity" not in xml              # whitespace between activities
    assert "/></schedule>" not in xml            # whitespace before schedule close


def test_uses_recognized_activity_names_only():
    # "work" is not a BioSim activity; "excercise" (its spelling) is.
    xml = build_survival_config(2)
    assert 'name="excercise"' in xml
    assert 'name="work"' not in xml
