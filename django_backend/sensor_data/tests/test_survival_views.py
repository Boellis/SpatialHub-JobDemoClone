from unittest import mock

from django.test import Client


def _fake_generator(*args, **kwargs):
    yield {"type": "start", "data": {"sim_id": 1, "max_sols": 200}}
    yield {"type": "sol", "data": {"sol": 1, "alive": True, "modules": {}}}
    yield {"type": "end", "data": {"sols_survived": 1, "ended_reason": "crew_death"}}


@mock.patch("sensor_data.views.build_survival_config", return_value="<x/>")
@mock.patch("sensor_data.views.BotBrain")
@mock.patch("sensor_data.views.BiosimControl")
@mock.patch("sensor_data.views.run_survival", side_effect=_fake_generator)
def test_stream_returns_event_stream(mrun, mctrl, mbrain, mcfg):
    # Avoid importing the anthropic SDK during the test. The stream is lazy, so
    # materialize the body while the patch is still active.
    with mock.patch.dict("sys.modules", {"anthropic": mock.MagicMock()}):
        resp = Client().get("/api/survival/stream")
        assert resp.status_code == 200
        assert resp["Content-Type"].startswith("text/event-stream")
        assert resp["Cache-Control"] == "no-cache"
        assert resp["X-Accel-Buffering"] == "no"
        body = b"".join(resp.streaming_content).decode()
    assert "event: start" in body
    assert "event: sol" in body
    assert "event: end" in body
    assert "data: " in body


@mock.patch("sensor_data.views.build_survival_config", return_value="<x/>")
@mock.patch("sensor_data.views.BotBrain")
@mock.patch("sensor_data.views.BiosimControl")
@mock.patch("sensor_data.views.run_survival", side_effect=_fake_generator)
def test_stream_frames_carry_json_data(mrun, mctrl, mbrain, mcfg):
    with mock.patch.dict("sys.modules", {"anthropic": mock.MagicMock()}):
        resp = Client().get("/api/survival/stream")
        body = b"".join(resp.streaming_content).decode()
    assert '"ended_reason": "crew_death"' in body


def test_stop_returns_200():
    resp = Client().post(
        "/api/survival/stop",
        data='{"run_id": "abc"}',
        content_type="application/json",
    )
    assert resp.status_code == 200
