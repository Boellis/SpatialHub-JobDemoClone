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
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt

from .models import RawSensorData, EnrichedSensorData, HubConfig, HabitatZone
from .serializers import RawSensorSerializer, EnrichedSensorSerializer, HubConfigSerializer, HabitatZoneSerializer
from .survival import run_registry
from .survival import relay
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
    queryset = RawSensorData.objects.all().order_by("-datetime")
    serializer_class = RawSensorSerializer

class HabitatZoneListView(ListAPIView):
    queryset = HabitatZone.objects.all()
    serializer_class = HabitatZoneSerializer

class EnrichedSensorListView(APIView):
    MAX_ROWS = 500

    def get(self, request):
        try:
            queryset = EnrichedSensorData.objects.all().order_by("-datetime")
            sensor_name = request.query_params.get("sensor_name")
            hub_id = request.query_params.get("hub_id")

            if sensor_name:
                queryset = queryset.filter(sensor_name=sensor_name)
            if hub_id:
                queryset = queryset.filter(hub_id=hub_id)

            # Cap results to avoid OOM on Cloud Run (512 MiB limit)
            queryset = queryset[:self.MAX_ROWS]

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
    run_id = run_registry.new_run_id()

    def stream():
        try:
            import anthropic  # lazy: keep module import-safe without the SDK

            client = BiosimControl(settings.SURVIVAL_BIOSIM_URL)
            anthropic_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            brain = BotBrain(anthropic_client, settings.ANTHROPIC_MODEL)
            config_xml = build_survival_config(settings.SURVIVAL_CREW_SIZE)

            yield f"event: run\ndata: {json.dumps({'run_id': run_id})}\n\n"

            for event in run_survival(
                client, brain, config_xml,
                max_sols=settings.SURVIVAL_MAX_SOLS,
                token_budget=settings.SURVIVAL_TOKEN_BUDGET,
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

        data, stamp = slots["end"]
        if data is not None and stamp > sent["end"]:
            sent["end"] = stamp
            yield _sse_frame({"type": "end", "data": data})

    def stream():
        sent = {t: 0 for t in relay.EVENT_TYPES}
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
    return response
