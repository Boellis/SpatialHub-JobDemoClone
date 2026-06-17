"""greenhouse_telemetry.py -- expose the trained RL greenhouse operating point.

Reads the latest ONNX-derived BiomassPS operating point JSON produced by
``DeepSpaceSim/python/derive_biomassps_operating_point.py`` (power/water/biomass
rates derived from the trained RL policies) and returns it for the frontend
greenhouse panel, so that panel reflects the trained RL policy rather than a mock.

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

LABEL = "Trained RL greenhouse operating point (BiomassPS power/water/biomass)"


def oppoint_path():
    return Path(os.environ.get("GREENHOUSE_OPPOINT_PATH", str(DEFAULT_OPPOINT_PATH)))


def load_telemetry():
    """Return ``{"label", "available", "operating_point", ...}``.

    On success: the exported JSON's fields (checkpoint/run/note/operating_point/
    detail) plus a ``label`` and ``available: True``. If the export hasn't been
    produced yet (or is unreadable), returns ``available: False`` with the reason,
    so the endpoint can answer 200 with a clear "not yet exported" payload instead
    of 500-ing the public dashboard.
    """
    path = oppoint_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"label": LABEL, "available": False,
                "reason": f"operating point not yet exported ({path})",
                "operating_point": None}
    except (ValueError, OSError) as e:
        return {"label": LABEL, "available": False,
                "reason": f"could not read operating point: {e}",
                "operating_point": None}

    return {
        "label": LABEL,
        "available": True,
        "checkpoint": data.get("checkpoint"),
        "run": data.get("run"),
        "note": data.get("note"),
        "operating_point": data.get("biomassps_operating_point"),
        "detail": data.get("detail"),
        "source_path": str(path),
    }
