from unittest import mock
from sensor_data.survival.biosim_control import BiosimControl, BiosimError


@mock.patch("sensor_data.survival.biosim_control.requests")
def test_start_sim_returns_id(mreq):
    mreq.post.return_value = mock.Mock(status_code=200, content=b"{}",
                                       json=lambda: {"simId": 5}, raise_for_status=lambda: None)
    c = BiosimControl("http://fake:8009")
    assert c.start_sim("<biosim/>") == 5
    assert mreq.post.call_args.kwargs["headers"]["Content-Type"] == "text/plain"


@mock.patch("sensor_data.survival.biosim_control.requests")
def test_start_sim_raises_on_error_payload(mreq):
    mreq.post.return_value = mock.Mock(status_code=200, content=b"{}",
                                       json=lambda: {"error": "No space left"}, raise_for_status=lambda: None)
    c = BiosimControl("http://fake:8009")
    try:
        c.start_sim("<x/>"); assert False
    except BiosimError as e:
        assert "No space" in str(e)


@mock.patch("sensor_data.survival.biosim_control.requests")
def test_set_flows_posts_to_module_endpoint(mreq):
    mreq.post.return_value = mock.Mock(status_code=200, content=b"{}", json=lambda: {}, raise_for_status=lambda: None)
    BiosimControl("http://fake:8009").set_flows(5, "OGS", "consumers", "Power", [800.0])
    url = mreq.post.call_args.args[0]
    assert url.endswith("/api/simulation/5/modules/OGS/consumers/Power")
    assert mreq.post.call_args.kwargs["json"] == {"desiredFlowRates": [800.0]}


@mock.patch("sensor_data.survival.biosim_control.requests")
def test_tick_calls_endpoint_n_times(mreq):
    mreq.post.return_value = mock.Mock(status_code=200, content=b"", raise_for_status=lambda: None)
    BiosimControl("http://fake:8009").tick(5, 24)
    assert mreq.post.call_count == 24
