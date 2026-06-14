from sensor_data.survival.config import build_survival_config


def test_run_till_crew_death_true():
    assert 'runTillCrewDeath="true"' in build_survival_config(15)


def test_injects_crew_count():
    assert build_survival_config(15).count("<crewPerson") == 15


def test_includes_specialists():
    xml = build_survival_config(15)
    assert "Food Systems Engineer" in xml and "Nutrition Specialist" in xml
