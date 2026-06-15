"""Self-improving pilot doctrine: reserve-band guardrails + accumulated lessons.

Canonical state lives in doctrine.json beside this module; a human-readable
doctrine.md mirror is regenerated on every save (audit / Human-in-the-Loop).
Pure and file-backed — no server imports, so it is unit-testable in isolation.
"""
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

_DOCTRINE_FILE = Path(__file__).parent / "doctrine.json"
_MIRROR_FILE = Path(__file__).parent / "doctrine.md"

# Stores whose reserve we defend. Order is the display order in the mirror.
LIFE_CRITICAL = ["Potable_Water_Store", "O2_Store", "Food_Store", "General_Power_Store"]


def bootstrap() -> dict:
    """Seed doctrine — encodes the two failures already observed in real runs."""
    return {
        "version": 1,
        "updated_at": None,
        "guardrails": {
            "reserve_bands": {
                "Potable_Water_Store": {"floor_pct": 30, "target_pct": 40},
                "O2_Store": {"floor_pct": 20, "target_pct": 40},
                "Food_Store": {"floor_pct": 15, "target_pct": 30},
                "General_Power_Store": {"floor_pct": 20, "target_pct": 40},
            },
            "rules": [
                "Survival is necessary but not sufficient — hold every life-critical "
                "store inside its reserve band.",
                "If all store deltas == 0 AND all recoverable balances == 0 across "
                ">2 sols, the engine has stalled — report it, do not treat it as "
                "equilibrium.",
            ],
        },
        "lessons": [],
    }


def load() -> dict:
    try:
        return json.loads(_DOCTRINE_FILE.read_text())
    except Exception:
        return bootstrap()


def _atomic_write(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(path.parent))
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.replace(tmp, str(path))
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def save(doc: dict) -> None:
    _atomic_write(_DOCTRINE_FILE, json.dumps(doc, indent=2))
    _atomic_write(_MIRROR_FILE, render_markdown(doc))


def _validate_band(store: str, band: dict) -> None:
    if store not in LIFE_CRITICAL:
        raise ValueError(f"unknown life-critical store: {store}")
    floor = band.get("floor_pct")
    target = band.get("target_pct")
    if floor is None or target is None:
        raise ValueError(f"{store}: band needs floor_pct and target_pct")
    if not (0 <= floor <= target <= 100):
        raise ValueError(f"{store}: require 0 <= floor({floor}) <= target({target}) <= 100")


def merge(guardrails: dict | None = None, lessons: list | None = None,
          now: str | None = None) -> dict:
    """Merge guardrail overrides + new lessons into the doctrine, persist, return it."""
    doc = load()
    if guardrails:
        rb = doc["guardrails"]["reserve_bands"]
        for store, band in (guardrails.get("reserve_bands") or {}).items():
            _validate_band(store, band)
            rb[store] = {"floor_pct": band["floor_pct"], "target_pct": band["target_pct"]}
        if guardrails.get("rules") is not None:
            doc["guardrails"]["rules"] = list(guardrails["rules"])
    if lessons:
        next_id = max((l.get("id", 0) for l in doc["lessons"]), default=0)
        for l in lessons:
            next_id += 1
            doc["lessons"].append({
                "id": next_id,
                "run_id": l.get("run_id"),
                "sol": l.get("sol"),
                "text": l.get("text", ""),
                "source": l.get("source", "after-action"),
            })
    doc["version"] = doc.get("version", 0) + 1
    doc["updated_at"] = now or datetime.now(timezone.utc).isoformat()
    save(doc)
    return doc


def violations(stores: list) -> list:
    """Given [{name, pct}, ...], return reserve_floor violations vs current bands."""
    bands = load()["guardrails"]["reserve_bands"]
    out = []
    for s in stores:
        band = bands.get(s["name"])
        if band is not None and s["pct"] < band["floor_pct"]:
            out.append({
                "store": s["name"],
                "kind": "reserve_floor",
                "value": round(s["pct"], 2),
                "floor": band["floor_pct"],
                "msg": "below reserve floor — rebuild",
            })
    return out


def render_markdown(doc: dict) -> str:
    rb = doc["guardrails"]["reserve_bands"]
    lines = [
        "# Survival Pilot Doctrine (auto-generated mirror)",
        "",
        f"_Version {doc.get('version')} · updated {doc.get('updated_at')}_",
        "",
        "> Canonical source is `doctrine.json`. Edit there (or via the reviewer); "
        "this file is regenerated on every update. Audit/veto surface for the "
        "self-improving loop.",
        "",
        "## Reserve bands (life-critical stores)",
        "",
        "| Store | Floor % | Target % |",
        "|---|---:|---:|",
    ]
    for store in LIFE_CRITICAL:
        b = rb.get(store)
        if b:
            lines.append(f"| {store} | {b['floor_pct']} | {b['target_pct']} |")
    lines += ["", "## Rules", ""]
    for r in doc["guardrails"]["rules"]:
        lines.append(f"- {r}")
    lines += ["", "## Lessons (newest first)", ""]
    if not doc["lessons"]:
        lines.append("_None yet._")
    for l in reversed(doc["lessons"]):
        prov = f"run {l.get('run_id')}, sol {l.get('sol')}"
        lines.append(f"- **#{l['id']}** ({prov}): {l['text']}")
    return "\n".join(lines) + "\n"
