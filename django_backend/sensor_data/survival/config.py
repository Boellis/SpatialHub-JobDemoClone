import re
from pathlib import Path

CONFIG = Path(__file__).parent / "configs" / "survival.biosim"
# BioSim's config parser walks the schedule via getFirstChild()/getNextSibling()
# and REQUIRES whitespace (text nodes) between the <activity> elements — a
# collapsed one-line <schedule><activity/>...</schedule> makes a DOM lookup return
# null and crew creation throws NullPointerException. So the schedule MUST stay
# pretty-printed (newlines between tags), mirroring the stock Buck Rogers crew.
# Activity names must also match BioSim's recognized set (note its "excercise"
# spelling) — an unknown activity name fails the same way.
_SCHED = (
    "\n          <schedule>\n"
    '            <activity intensity="2" name="leisure" length="12" />\n'
    '            <activity intensity="0" name="sleep" length="8" />\n'
    '            <activity intensity="5" name="excercise" length="2" />\n'
    "          </schedule>\n        "
)


def _person(name, age, sex, weight):
    return (f'<crewPerson age="{age}" name="{name}" sex="{sex}" weight="{weight}">'
            f'{_SCHED}</crewPerson>')


def _crew(n):
    ppl = [("Food Systems Engineer", 42, "FEMALE", 68), ("Nutrition Specialist", 38, "MALE", 80)]
    for i in range(len(ppl), n):
        ppl.append((f"Crew {i+1}", 30 + (i % 20), "FEMALE" if i % 2 else "MALE", 65 + (i % 25)))
    # Newline-separate crewPerson elements too (whitespace between tags).
    return "\n        ".join(_person(*p) for p in ppl[:n])


_CREW_MARKER = "@@SURVIVAL_CREW@@"


def build_survival_config(crew_size: int = 15) -> str:
    xml = CONFIG.read_text()
    xml = re.sub(r'runTillCrewDeath="[^"]*"', 'runTillCrewDeath="true"', xml)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", _CREW_MARKER, xml, count=1, flags=re.DOTALL)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", "", xml, flags=re.DOTALL)
    xml = xml.replace(_CREW_MARKER, _crew(crew_size))
    return xml
