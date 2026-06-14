import re
from pathlib import Path

CONFIG = Path(__file__).parent / "configs" / "survival.biosim"
_SCHED = ('<schedule><activity intensity="2" name="leisure" length="12"/>'
          '<activity intensity="0" name="sleep" length="8"/>'
          '<activity intensity="4" name="work" length="4"/></schedule>')


def _person(name, age, sex, weight):
    return f'<crewPerson age="{age}" name="{name}" sex="{sex}" weight="{weight}">{_SCHED}</crewPerson>'


def _crew(n):
    ppl = [("Food Systems Engineer", 42, "FEMALE", 68), ("Nutrition Specialist", 38, "MALE", 80)]
    for i in range(len(ppl), n):
        ppl.append((f"Crew {i+1}", 30 + (i % 20), "FEMALE" if i % 2 else "MALE", 65 + (i % 25)))
    return "".join(_person(*p) for p in ppl[:n])


_CREW_MARKER = "@@SURVIVAL_CREW@@"


def build_survival_config(crew_size: int = 15) -> str:
    xml = CONFIG.read_text()
    xml = re.sub(r'runTillCrewDeath="[^"]*"', 'runTillCrewDeath="true"', xml)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", _CREW_MARKER, xml, count=1, flags=re.DOTALL)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", "", xml, flags=re.DOTALL)
    xml = xml.replace(_CREW_MARKER, _crew(crew_size))
    return xml
