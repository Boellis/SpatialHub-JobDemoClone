import requests


class BiosimError(Exception):
    pass


class BiosimControl:
    """BioSim REST control for survival runs. Mirrors control_loop.py's requests usage."""

    def __init__(self, base_url: str, timeout: float = 30.0):
        self.base = base_url.rstrip("/")
        self.timeout = timeout

    def start_sim(self, config_xml: str) -> int:
        r = requests.post(f"{self.base}/api/simulation/start",
                          data=config_xml.encode("utf-8"),
                          headers={"Content-Type": "text/plain"}, timeout=self.timeout)
        r.raise_for_status()
        data = r.json()
        if "simId" not in data:
            raise BiosimError(f"start failed: {data}")
        return int(data["simId"])

    def get_state(self, sim_id: int) -> dict:
        r = requests.get(f"{self.base}/api/simulation/{sim_id}", timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def set_flows(self, sim_id, module, kind, flow_type, desired_rates):
        r = requests.post(
            f"{self.base}/api/simulation/{sim_id}/modules/{module}/{kind}/{flow_type}",
            json={"desiredFlowRates": list(desired_rates)}, timeout=self.timeout)
        r.raise_for_status()
        return r.json() if r.content else {}

    def tick(self, sim_id, n=1):
        for _ in range(n):
            r = requests.post(f"{self.base}/api/simulation/{sim_id}/tick", timeout=self.timeout)
            r.raise_for_status()

    def add_malfunction(self, sim_id, module, intensity="SEVERE_MALF", length="TEMPORARY_MALF"):
        r = requests.post(
            f"{self.base}/api/simulation/{sim_id}/modules/{module}/malfunctions",
            json={"intensity": intensity, "length": length}, timeout=self.timeout)
        r.raise_for_status()
        return r.json().get("malfunctionID")
