"""greenhouse_telemetry.py -- expose the trained RL greenhouse operating point.

Reads the latest ONNX-derived BiomassPS operating point JSON produced by
``DeepSpaceSim/python/derive_biomassps_operating_point.py`` (power/water/biomass
rates derived from the trained RL policies) and returns it for the frontend
greenhouse panel, so that panel reflects the trained RL policy rather than a mock.

HONEST FRAMING (see DeepSpaceSim/ONNX_ROLE.md). The served operating point is the
grow-environment optimizer's hand-off: RL-derived power/water/biomass conversion
*sizing* that feeds the design + food-model deliverables (ConOps Production Methods,
the #6 Python food-model rates, meal-plan crop yields, the greenhouse blueprint). It
is NOT a BioSim sol-survival driver. This module never fabricates a value: when the
export is missing it returns ``available: False`` (so the panel shows "not yet
exported" rather than an invented number), and when it is present it passes through
the export's own provenance (checkpoint obs-dim match, legacy/current layout) so the
panel can label a legacy-obs derivation honestly instead of implying it is current.

The export path is configurable via ``GREENHOUSE_OPPOINT_PATH``; it defaults to the
location the derive script writes to. The endpoint that uses this
(``GET /api/survival/greenhouse/telemetry``) wraps the JSON with a short label.
"""
import json
import os
from pathlib import Path

# Default: where derive_biomassps_operating_point.py writes its output.
#   <DeepSpaceSim>/results/aligned_validate/biomassps_operating_point.json
DEFAULT_OPPOINT_PATH = (
    Path(r"C:\Users\brand\ProgrammingProjects\DeepSpaceSim")
    / "results" / "aligned_validate" / "biomassps_operating_point.json"
)

LABEL = "Trained RL greenhouse operating point (BiomassPS power/water/biomass sizing)"

# Honest one-liner the panel can show so a viewer never reads this as a survival
# number. Mirrors ONNX_ROLE.md.
ROLE_NOTE = ("Grow-environment optimizer sizing (power/water/biomass) that feeds the "
             "food model, meal-plan yields and greenhouse blueprint; not a BioSim "
             "survival driver.")


def oppoint_path():
    return Path(os.environ.get("GREENHOUSE_OPPOINT_PATH", str(DEFAULT_OPPOINT_PATH)))


def _provenance_summary(data):
    """Condense the export's obs-dim provenance into a small, panel-friendly dict.

    Returns ``{"is_real_export": True, "obs_contract_current": bool,
    "checkpoints": {agent: {...}}, "caveat": str|None}`` so the frontend can show a
    clear badge distinguishing a CURRENT-contract export from a legacy-obs one. If
    the export predates provenance stamping, ``obs_contract_current`` is ``None``
    (unknown) rather than silently ``True``.
    """
    contract = data.get("obs_contract")
    provenance = data.get("provenance") or {}
    if contract is None and not provenance:
        # Older export without provenance fields; do not assert it is current.
        return {"is_real_export": True, "obs_contract_current": None,
                "checkpoints": {}, "caveat": "export predates obs-dim provenance stamping"}

    all_match = contract.get("all_checkpoints_match_current_contract") if contract else None
    checkpoints = {
        agent: {
            "checkpoint_obs_dim": p.get("checkpoint_obs_dim"),
            "expected_obs_dim": p.get("expected_obs_dim"),
            "obs_dim_match": p.get("obs_dim_match"),
            "layout": p.get("layout"),
        }
        for agent, p in provenance.items()
    }
    caveat = None
    if all_match is False:
        caveat = ("Derived from a LEGACY-obs checkpoint (pre Level-2 budget-frac "
                  "observations); reflects the older policy, not the current obs "
                  "contract. Re-export at the current obs width to refresh.")
    return {"is_real_export": True, "obs_contract_current": all_match,
            "checkpoints": checkpoints, "caveat": caveat}


def load_telemetry():
    """Return ``{"label", "available", "operating_point", ...}``.

    On success: the exported JSON's fields (checkpoint/run/note/operating_point/
    detail) plus a ``label``, ``available: True``, and a ``provenance`` summary that
    tells the panel whether the served value is a REAL current-contract export or a
    legacy-obs one. If the export hasn't been produced yet (or is unreadable),
    returns ``available: False`` with the reason and ``data_source: "none"``, so the
    endpoint can answer 200 with a clear "not yet exported" payload instead of
    500-ing the public dashboard -- and never implies an absent value is real.
    """
    path = oppoint_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"label": LABEL, "role_note": ROLE_NOTE, "available": False,
                "data_source": "none",
                "reason": f"operating point not yet exported ({path})",
                "operating_point": None}
    except (ValueError, OSError) as e:
        return {"label": LABEL, "role_note": ROLE_NOTE, "available": False,
                "data_source": "none",
                "reason": f"could not read operating point: {e}",
                "operating_point": None}

    return {
        "label": LABEL,
        "role_note": ROLE_NOTE,
        "available": True,
        "data_source": "exported_operating_point",
        "checkpoint": data.get("checkpoint"),
        "run": data.get("run"),
        "note": data.get("note"),
        "operating_point": data.get("biomassps_operating_point"),
        "detail": data.get("detail"),
        "provenance": _provenance_summary(data),
        "source_path": str(path),
    }
