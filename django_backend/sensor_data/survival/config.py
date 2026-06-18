import os
import re
from pathlib import Path

_CONFIG_DIR = Path(__file__).parent / "configs"

# Whitelist of selectable BioSim configs. A request/caller may only ever name one
# of these filenames — anything else falls back to the env/default. NEVER trust a
# client-supplied path: this guards against directory traversal and arbitrary file
# reads. Keep in sync with the frontend mode toggle (survival.ts).
ALLOWED_CONFIGS = frozenset({
    "survival.biosim",
    "survival_defensible.biosim",
    "survival_hard.biosim",
})

# Default BioSim config filename. SURVIVAL_CONFIG_FILE overrides it (e.g.
# "survival_hard.biosim") to switch the feeder/LLM stream to hard mode where the
# crew actually dies and control beats passive (needs the state.py death-detection
# fix to be honest). The env default is itself validated against ALLOWED_CONFIGS.
_ENV_DEFAULT = os.environ.get("SURVIVAL_CONFIG_FILE", "survival.biosim")
DEFAULT_CONFIG_FILE = _ENV_DEFAULT if _ENV_DEFAULT in ALLOWED_CONFIGS else "survival.biosim"

# Back-compat: CONFIG is the env/default config Path (callers that don't select).
CONFIG = _CONFIG_DIR / DEFAULT_CONFIG_FILE


def resolve_config_path(config_name=None) -> Path:
    """Return the configs/ path for a whitelisted config filename.

    `config_name` (e.g. "survival_hard.biosim") is validated against
    ALLOWED_CONFIGS; any unknown/None value falls back to DEFAULT_CONFIG_FILE.
    Bare filename only — never trust a caller-supplied path."""
    name = config_name if config_name in ALLOWED_CONFIGS else DEFAULT_CONFIG_FILE
    return _CONFIG_DIR / name
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


def build_survival_config(crew_size: int = 15, config_name=None) -> str:
    """Build an N-crew survival config XML.

    `config_name` selects which whitelisted config in configs/ to base the build
    on (validated via resolve_config_path); None uses the env/default. This is the
    single lever the difficulty toggle drives — Easy/Hard pick different .biosim
    base configs here."""
    xml = resolve_config_path(config_name).read_text()
    xml = re.sub(r'runTillCrewDeath="[^"]*"', 'runTillCrewDeath="true"', xml)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", _CREW_MARKER, xml, count=1, flags=re.DOTALL)
    xml = re.sub(r"<crewPerson\b.*?</crewPerson>", "", xml, flags=re.DOTALL)
    xml = xml.replace(_CREW_MARKER, _crew(crew_size))
    return xml
