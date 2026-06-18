from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
try:
    from google.cloud import pubsub_v1
except ImportError:  # pragma: no cover
    pubsub_v1 = None
import json

from django.conf import settings
from django.db.models import Count
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt

from .models import RawSensorData, EnrichedSensorData, HubConfig, HabitatZone, SurvivalRun, SurvivalPlan
from .serializers import RawSensorSerializer, EnrichedSensorSerializer, HubConfigSerializer, HabitatZoneSerializer
from .survival import run_registry
from .survival import relay
from .survival import control as survival_control_mod
from .survival.biosim_control import BiosimControl
from .survival.bot_brain import BotBrain
from .survival.config import build_survival_config
from .survival.loop import run_survival

import hmac
import secrets
import string
import traceback
from django.utils.dateparse import parse_datetime

class RawSensorListView(ListAPIView):
    serializer_class = RawSensorSerializer
    # No DRF pagination is configured, so a bare ListAPIView would dump the whole
    # table. Bound it (same class of fix as EnrichedSensorListView) and honor an
    # optional page_size so a busy raw_sensor_data table can never full-scan.
    MAX_ROWS = 500
    DEFAULT_ROWS = 100

    def get_queryset(self):
        try:
            limit = int(self.request.query_params.get("page_size", self.DEFAULT_ROWS))
        except (TypeError, ValueError):
            limit = self.DEFAULT_ROWS
        limit = max(1, min(limit, self.MAX_ROWS))
        return RawSensorData.objects.all().order_by("-datetime")[:limit]

class HabitatZoneListView(ListAPIView):
    queryset = HabitatZone.objects.all()
    serializer_class = HabitatZoneSerializer

class EnrichedSensorListView(APIView):
    MAX_ROWS = 500

    DEFAULT_ROWS = 50

    def get(self, request):
        try:
            queryset = EnrichedSensorData.objects.all().order_by("-datetime")
            sensor_name = request.query_params.get("sensor_name")
            hub_id = request.query_params.get("hub_id")

            if sensor_name:
                queryset = queryset.filter(sensor_name=sensor_name)
            if hub_id:
                queryset = queryset.filter(hub_id=hub_id)

            # Honor the caller's page_size (clamped to MAX_ROWS) instead of always
            # serializing 500 rows. The frontend's live poll asks for 5; respecting
            # that keeps each request cheap and avoids hammering the DB/Cloud Run.
            try:
                limit = int(request.query_params.get("page_size", self.DEFAULT_ROWS))
            except (TypeError, ValueError):
                limit = self.DEFAULT_ROWS
            limit = max(1, min(limit, self.MAX_ROWS))
            queryset = queryset[:limit]

            serializer = EnrichedSensorSerializer(queryset, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            print("Error in EnrichedSensorListView:", str(e))
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class HubListView(APIView):
    def get(self, request):
        try:
            hubs = HubConfig.objects.all()
            serializer = HubConfigSerializer(hubs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            print("Error in HubListView:", str(e))
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class HubProvisionView(APIView):
    def post(self, request):
        try:
            hub_id = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(20))
            data = request.data.copy()
            data['hub_id'] = hub_id

            serializer = HubConfigSerializer(data=data)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            print("Error in HubProvisionView:", str(e))
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
class SendHubCommand(APIView):
    def post(self, request):
        try:
            hub_id = request.data.get("hub_id")
            command = request.data.get("command")

            print("Received hub_id:", hub_id)
            print("Received command:", command)

            if not hub_id or not command:
                return Response({"error": "hub_id and command are required"}, status=status.HTTP_400_BAD_REQUEST)

            publisher = pubsub_v1.PublisherClient()
            topic_path = publisher.topic_path("interviewing-457222", "hub-commands")
            payload = json.dumps({
                "hub_id": hub_id,
                "command": command,
                "collection_type": "command"
            }).encode("utf-8")

            future = publisher.publish(topic_path, payload)
            msg_id = future.result()
            print("Published command with msg_id:", msg_id)

            return Response({"status": "published", "msg_id": msg_id}, status=status.HTTP_200_OK)
        except Exception as e:
            print("Error in SendHubCommand:", str(e))
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


REQUIRED_FIELDS = {'hub_id', 'sensor_id', 'sensor_name', 'device_addr', 'sensor_val', 'datetime', 'location', 'owner', 'workers'}


class SensorIngestView(APIView):
    def post(self, request):
        try:
            data = request.data

            # Normalise single object to list
            if isinstance(data, dict):
                items = [data]
            else:
                items = list(data)

            # Reject empty batch
            if not items:
                return Response({"error": "Payload must not be empty"}, status=status.HTTP_400_BAD_REQUEST)

            # Validate all items before touching the DB (atomic all-or-nothing)
            rows = []
            for idx, item in enumerate(items):
                missing = REQUIRED_FIELDS - set(item.keys())
                if missing:
                    return Response(
                        {"error": f"Item {idx}: missing required fields: {sorted(missing)}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                try:
                    sensor_val = float(item['sensor_val'])
                except (TypeError, ValueError):
                    return Response(
                        {"error": f"Item {idx}: sensor_val must be numeric, got {item['sensor_val']!r}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                parsed_dt = parse_datetime(str(item['datetime']))
                if parsed_dt is None:
                    return Response(
                        {"error": f"Item {idx}: datetime is not a valid ISO datetime: {item['datetime']!r}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                rows.append(EnrichedSensorData(
                    hub_id=item['hub_id'],
                    sensor_id=item['sensor_id'],
                    sensor_name=item['sensor_name'],
                    device_addr=str(item['device_addr']),
                    sensor_val=sensor_val,
                    datetime=parsed_dt,
                    location=item['location'],
                    owner=item['owner'],
                    workers=item['workers'],
                ))

            EnrichedSensorData.objects.bulk_create(rows)
            return Response({"stored": len(rows)}, status=status.HTTP_201_CREATED)

        except Exception as e:
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _sse_frame(event):
    """Serialize a loop event dict into an SSE frame."""
    return f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"


@csrf_exempt
def survival_stream(request):
    """SSE endpoint: streams an autonomous Claude-driven BioSim survival run.

    Each loop event is framed as `event: {type}\\ndata: {json}\\n\\n`. The
    `anthropic` SDK is imported lazily so the test suite (and any env without
    the package) can import this module.
    """
    difficulty = request.GET.get("difficulty", "off")
    # Clamp difficulty server-side to the known set (never trust the client).
    if difficulty not in ("off", "malfunctions"):
        difficulty = "off"
    # Config selection: a whitelisted .biosim filename. Unknown/absent -> the
    # env/default (build_survival_config validates against ALLOWED_CONFIGS, so a
    # hostile value can never escape configs/ or pick a non-whitelisted file).
    config_name = request.GET.get("config")
    run_id = run_registry.new_run_id()

    # Per-run Claude sols cap (cost control). Default to the configured
    # SURVIVAL_MAX_SOLS when the param is absent; otherwise CLAMP server-side to
    # [10, 500] — never trust the client and never exceed the hard ceiling of 500.
    raw_max_sols = request.GET.get("max_sols")
    if raw_max_sols is None:
        max_sols = settings.SURVIVAL_MAX_SOLS
    else:
        try:
            max_sols = int(raw_max_sols)
        except (TypeError, ValueError):
            max_sols = settings.SURVIVAL_MAX_SOLS
        max_sols = max(10, min(max_sols, 500))
    # Scale the token budget with the run length so a longer run isn't killed
    # early by the old fixed 200k budget, but keep a hard ceiling.
    token_budget = min(max_sols * 5000, 2_600_000)

    def stream():
        try:
            import anthropic  # lazy: keep module import-safe without the SDK

            client = BiosimControl(settings.SURVIVAL_BIOSIM_URL)
            anthropic_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            brain = BotBrain(anthropic_client, settings.ANTHROPIC_MODEL)
            config_xml = build_survival_config(
                settings.SURVIVAL_CREW_SIZE, config_name=config_name)

            yield f"event: run\ndata: {json.dumps({'run_id': run_id})}\n\n"

            for event in run_survival(
                client, brain, config_xml,
                max_sols=max_sols,
                token_budget=token_budget,
                difficulty=difficulty,
                cancel=lambda: run_registry.is_cancelled(run_id),
            ):
                yield _sse_frame(event)
        except Exception as e:  # pragma: no cover - defensive streaming guard
            traceback.print_exc()
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            run_registry.clear(run_id)

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    # Opt out of GZipMiddleware: compressing an SSE stream buffers it, so the
    # browser's EventSource never receives events (curl without gzip is unaffected).
    # GZipMiddleware skips any response that already declares a Content-Encoding.
    response["Content-Encoding"] = "identity"
    return response


@csrf_exempt
def survival_stop(request):
    """Cooperatively cancel an in-flight survival run."""
    try:
        body = json.loads(request.body or b"{}")
    except (ValueError, TypeError):
        body = {}
    run_id = body.get("run_id")
    stopped = run_registry.request_stop(run_id) if run_id else False
    return JsonResponse({"stopped": stopped})


# ---------------------------------------------------------------------------
# Relay: external pilot (mcp_biosim on a Claude subscription) -> web app.
# The pilot POSTs run/sol/end events; browsers watch them over read-only SSE.
# No ANTHROPIC_API_KEY path — the brain is the external pilot. See survival/relay.py.
# ---------------------------------------------------------------------------

# Cap the ingest body so a bad/hostile POST can't exhaust memory. A full raw-modules
# `sol` payload is a few KB; 256 KB is generous headroom.
_MAX_INGEST_BYTES = 256 * 1024
# SSE heartbeat cadence (seconds) — keeps proxies from killing an idle connection.
_LIVE_HEARTBEAT_SECS = 15


@csrf_exempt
def survival_ingest(request):
    """Authenticated write endpoint for the external survival pilot.

    Requires ``Authorization: Bearer <SURVIVAL_RELAY_TOKEN>``. Fails closed when no
    token is configured. Validates and forwards a ``{"type", "data"}`` event into the
    in-memory relay, which fans it out to connected ``/live`` subscribers.
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)

    token = getattr(settings, "SURVIVAL_RELAY_TOKEN", "")
    if not token:
        return JsonResponse({"error": "ingest disabled (no SURVIVAL_RELAY_TOKEN)"}, status=503)

    auth = request.headers.get("Authorization", "")
    provided = auth[7:] if auth.startswith("Bearer ") else ""
    if not hmac.compare_digest(provided, token):
        return JsonResponse({"error": "unauthorized"}, status=401)

    body = request.body or b""
    if len(body) > _MAX_INGEST_BYTES:
        return JsonResponse({"error": "payload too large"}, status=413)

    try:
        payload = json.loads(body or b"{}")
    except (ValueError, TypeError):
        return JsonResponse({"error": "invalid json"}, status=400)

    etype = payload.get("type")
    data = payload.get("data")
    if etype not in relay.EVENT_TYPES or not isinstance(data, dict):
        return JsonResponse({"error": "bad event"}, status=400)

    version = relay.publish(etype, data)
    return JsonResponse({"ok": True, "version": version})


def survival_live(request):
    """Read-only SSE stream of the live survival run for the web app.

    On connect it replays the current run/sol/end so a late-joining judge sees the
    state immediately, then streams subsequent events as the pilot pushes them.
    Public read — no run is started here and no secrets are exposed.
    """

    def emit(slots, log, sent, log_ver):
        """Yield frames for whatever advanced past the caller's cursors.

        Reasoning frames live in `log` and are emitted in order (so the decision
        history is never lost to sol-event coalescing); the latest `sol` slot keeps
        the resource cards fresh. A sol already emitted via the log isn't repeated.
        """
        # run first (so a late joiner sees crew size / difficulty before telemetry)
        data, stamp = slots["run"]
        if data is not None and stamp > sent["run"]:
            sent["run"] = stamp
            yield _sse_frame({"type": "run", "data": data})

        # paused/running status — broadcast on every transition and replayed on
        # connect so a late-joining screen knows immediately if the run is paused.
        data, stamp = slots["status"]
        if data is not None and stamp > sent["status"]:
            sent["status"] = stamp
            yield _sse_frame({"type": "status", "data": data})

        # every new reasoning frame, oldest -> newest
        last_log_ver = log_ver[0]
        for ver, sol_data in log:
            if ver > last_log_ver:
                log_ver[0] = ver
                yield _sse_frame({"type": "sol", "data": sol_data})

        # latest sol (skip if the log already delivered this exact version)
        data, stamp = slots["sol"]
        if data is not None and stamp > sent["sol"] and stamp > log_ver[0]:
            sent["sol"] = stamp
            yield _sse_frame({"type": "sol", "data": data})

        data, stamp = slots["plan"]
        if data is not None and stamp > sent["plan"]:
            sent["plan"] = stamp
            yield _sse_frame({"type": "plan", "data": data})

        data, stamp = slots["end"]
        if data is not None and stamp > sent["end"]:
            sent["end"] = stamp
            yield _sse_frame({"type": "end", "data": data})

    def stream():
        sent = {t: 0 for t in relay.SLOT_TYPES}
        log_ver = [0]  # highest reasoning-frame version already emitted
        slots, log, version = relay.snapshot()
        yield from emit(slots, log, sent, log_ver)
        last = version

        while True:
            slots, log, version = relay.wait(last, _LIVE_HEARTBEAT_SECS)
            if version == last:
                yield ": keepalive\n\n"
                continue
            yield from emit(slots, log, sent, log_ver)
            last = version

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    # Opt out of GZipMiddleware: compressing an SSE stream buffers it, so the
    # browser's EventSource never receives events (curl without gzip is unaffected).
    # GZipMiddleware skips any response that already declares a Content-Encoding.
    response["Content-Encoding"] = "identity"
    return response


@csrf_exempt
def survival_control(request):
    """Authenticated control endpoint for the web app's control panel.

    Same Bearer-token gate as ingest (SURVIVAL_RELAY_TOKEN) — the page is public but
    the controls are inert without the secret. Drives a server-side BioSim run and
    publishes telemetry to the relay so every viewer sees it. No Anthropic key.

    Body: {"action": "start"|"advance"|"set_flow"|"inject"|"stop", ...params}.
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)

    # The control panel has its own password (rotate it independently of the MCP
    # token); fall back to the relay token if it's unset.
    token = getattr(settings, "SURVIVAL_CONTROL_TOKEN", "") or getattr(settings, "SURVIVAL_RELAY_TOKEN", "")
    if not token:
        return JsonResponse({"error": "control disabled (no control token)"}, status=503)
    auth = request.headers.get("Authorization", "")
    provided = auth[7:] if auth.startswith("Bearer ") else ""
    if not hmac.compare_digest(provided, token):
        return JsonResponse({"error": "unauthorized"}, status=401)

    try:
        body = json.loads(request.body or b"{}")
    except (ValueError, TypeError):
        return JsonResponse({"error": "invalid json"}, status=400)

    action = body.get("action")
    url = settings.SURVIVAL_BIOSIM_URL
    try:
        if action == "start":
            out = survival_control_mod.start(url, body.get("crew_size", 15), body.get("difficulty", "off"))
        elif action == "advance":
            out = survival_control_mod.advance(body.get("sols", 1), body.get("note", ""))
        elif action == "set_flow":
            out = survival_control_mod.set_flow(body["module"], body["kind"], body["type"], body["rate"])
        elif action == "inject":
            out = survival_control_mod.inject(
                body.get("module", "Grey_Water_Store"),
                body.get("intensity", "SEVERE_MALF"),
                body.get("length", "TEMPORARY_MALF"),
            )
        elif action == "stop":
            out = survival_control_mod.stop()
        elif action == "pause":
            out = survival_control_mod.pause()
        elif action == "resume":
            out = survival_control_mod.resume()
        elif action == "new_session":
            # Reverse-channel signal, NOT a server-side run command: queue a
            # "respawn the pilot" request the external supervisor polls via
            # /survival/command. Lets the operator compact the live MCP-piloted
            # run from the web app without touching the run itself.
            relay.set_command("new_session")
            out = {"ok": True, "command": "new_session"}
        else:
            return JsonResponse({"error": "unknown action"}, status=400)
    except (KeyError, ValueError) as e:
        return JsonResponse({"error": str(e)}, status=400)
    except Exception as e:  # pragma: no cover - BioSim/network guard
        traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=502)

    return JsonResponse(out)


def survival_command(request):
    """Consume-once poll endpoint for the external survival supervisor.

    Same Bearer gate as ingest (SURVIVAL_RELAY_TOKEN — the MCP already holds it).
    Returns ``{"command": "new_session"|null}`` and clears the slot, so a web-app
    'New Pilot Session' click reaches the supervisor exactly once. GET only.
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)

    token = getattr(settings, "SURVIVAL_RELAY_TOKEN", "")
    if not token:
        return JsonResponse({"error": "command channel disabled (no SURVIVAL_RELAY_TOKEN)"}, status=503)

    auth = request.headers.get("Authorization", "")
    provided = auth[7:] if auth.startswith("Bearer ") else ""
    if not hmac.compare_digest(provided, token):
        return JsonResponse({"error": "unauthorized"}, status=401)

    # `paused` is the steady-state pause flag (not consume-once) so the pilot can
    # idle for as long as the run is paused, then resume when it clears.
    return JsonResponse({"command": relay.take_command(), "paused": relay.is_paused()})


def _run_summary(run):
    return {
        "run_id": run.run_id,
        "difficulty": run.difficulty,
        "crew_size": run.crew_size,
        "sols_survived": run.sols_survived,
        "ended_reason": run.ended_reason,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
        "decision_count": run.decision_count,
        "in_progress": run.ended_at is None,
    }


def survival_history(request):
    """Public read: list past survival runs (newest first) with decision counts.

    The durable archive of every run's decision log. No secrets — the live decision
    log is already public on the dashboard.
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)
    try:
        limit = min(max(int(request.GET.get("limit", 50)), 1), 200)
    except (TypeError, ValueError):
        limit = 50
    runs = SurvivalRun.objects.annotate(decision_count=Count('decisions'))[:limit]
    response = JsonResponse({"runs": [_run_summary(r) for r in runs]})
    response["Cache-Control"] = "public, max-age=300"
    return response


def survival_run_detail(request, run_id):
    """Public read: one run plus its complete, ordered decision log."""
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)
    try:
        run = SurvivalRun.objects.get(run_id=run_id)
    except SurvivalRun.DoesNotExist:
        return JsonResponse({"error": "run not found"}, status=404)
    decisions = [
        {
            "sol": d.sol,
            "reasoning": d.reasoning,
            "actions": d.actions,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in run.decisions.all()
    ]
    # Reuse the already-loaded decisions instead of a separate COUNT query.
    run.decision_count = len(decisions)
    response = JsonResponse({"run": _run_summary(run), "decisions": decisions})
    response["Cache-Control"] = "public, max-age=3600"
    return response


def survival_plans(request):
    """Public read: the full history of generated habitat plans (newest first).

    Each entry is a Claude-generated farm layout + crew food plan with its timestamp
    and the sol it was generated at. Browsed independently of runs.
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)
    try:
        limit = min(max(int(request.GET.get("limit", 50)), 1), 200)
    except (TypeError, ValueError):
        limit = 50
    plans = [
        {
            "id": p.id,
            "run_id": p.run_id,
            "sol": p.sol,
            "farm_layout": p.farm_layout,
            "food_plan": p.food_plan,
            "note": p.note,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in SurvivalPlan.objects.all()[:limit]
    ]
    return JsonResponse({"plans": plans})


# ---------------------------------------------------------------------------
# Phase 2 additions: highscore, farmer config playground, RL greenhouse telemetry.
# ---------------------------------------------------------------------------


def survival_highscore(request):
    """Public read: the best ``sols_survived`` ever seen across all runs.

    The relay updates this on every ``end`` event (see relay.highscore /
    relay._maybe_update_highscore). Returns the record holder's run metadata.
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)
    hs = relay.highscore()
    response = JsonResponse({
        "best_sols": hs.get("best_sols", 0),
        "run_id": hs.get("run_id"),
        "ended_reason": hs.get("ended_reason"),
        "difficulty": hs.get("difficulty"),
        "when": hs.get("when"),
    })
    response["Cache-Control"] = "public, max-age=15"
    return response


# Cap the playground body so a hostile POST can't exhaust memory.
_MAX_PLAYGROUND_BYTES = 64 * 1024
_PLAYGROUND_CAP_MAX = 1000


@csrf_exempt
def survival_playground_run(request):
    """Farmer config playground: build a BioSim config from the defensible base
    with the supplied overrides, run it against BioSim, and return its metrics
    alongside the unmodified-baseline result for comparison.

    Body: {"overrides": {dirty_water_level, nuclear_power, biomass_power,
            biomass_water, crop_area, food_store, ...}, "mode": "passive"|"maxctrl",
            "difficulty": "off"|"malfunctions", "cap": int, "crew": int}

    Returns: {sols, in_band_sols, mars_grown_cal_pct, ended_reason,
              baseline: {...same shape...}, applied_overrides, ignored_overrides}.

    NOTE: this runs ONE BioSim sim at a time (sequential). It must run on a host
    that can reach BioSim (the parent wires it to the VM via SURVIVAL_BIOSIM_URL).
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    body_bytes = request.body or b""
    if len(body_bytes) > _MAX_PLAYGROUND_BYTES:
        return JsonResponse({"error": "payload too large"}, status=413)
    try:
        body = json.loads(body_bytes or b"{}")
    except (ValueError, TypeError):
        return JsonResponse({"error": "invalid json"}, status=400)

    overrides = body.get("overrides") or {}
    if not isinstance(overrides, dict):
        return JsonResponse({"error": "overrides must be an object"}, status=400)
    mode = body.get("mode", "passive")
    if mode not in ("passive", "maxctrl"):
        return JsonResponse({"error": "mode must be passive|maxctrl"}, status=400)
    difficulty = body.get("difficulty", "off")
    if difficulty not in ("off", "malfunctions"):
        return JsonResponse({"error": "difficulty must be off|malfunctions"}, status=400)
    # Optional base-config selection (whitelisted in config.ALLOWED_CONFIGS); None
    # keeps the playground's defensible base. build_config validates it, so a
    # hostile value can never escape configs/.
    from .survival.config import ALLOWED_CONFIGS
    config_name = body.get("config")
    if config_name is not None and config_name not in ALLOWED_CONFIGS:
        return JsonResponse(
            {"error": f"config must be one of {sorted(ALLOWED_CONFIGS)}"}, status=400)
    try:
        cap = int(body.get("cap", 200))
    except (TypeError, ValueError):
        cap = 200
    cap = max(1, min(cap, _PLAYGROUND_CAP_MAX))
    try:
        crew = int(body.get("crew", settings.SURVIVAL_CREW_SIZE))
    except (TypeError, ValueError):
        crew = settings.SURVIVAL_CREW_SIZE

    from .survival import playground
    try:
        result = playground.run_playground(
            settings.SURVIVAL_BIOSIM_URL, overrides,
            mode=mode, difficulty=difficulty, cap=cap, crew_size=crew,
            config_name=config_name)
    except Exception as e:  # pragma: no cover - BioSim/network guard
        traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=502)
    return JsonResponse(result)


def survival_greenhouse_telemetry(request):
    """Public read: the latest ONNX-exported RL greenhouse operating point
    (BiomassPS power/water/biomass rates) + a short label, so the frontend
    greenhouse panel reflects the trained RL policy.

    Always answers 200; if the export hasn't been produced yet the payload carries
    ``available: false`` with a reason rather than erroring the dashboard.
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)
    from .survival import greenhouse_telemetry
    data = greenhouse_telemetry.load_telemetry()
    response = JsonResponse(data)
    response["Cache-Control"] = "public, max-age=60"
    return response
