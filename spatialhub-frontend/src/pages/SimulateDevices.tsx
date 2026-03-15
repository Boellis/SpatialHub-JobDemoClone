import { useEffect, useState } from "react";
import axios from "axios";

const CLOUD_FUNCTION_URL =
  "https://us-central1-interviewing-457222.cloudfunctions.net/ingest_data_publisher";
const COMMAND_URL =
  "https://spatialhub-backend-823061962201.us-central1.run.app/api/send-command/";

type SensorName = "ph" | "do" | "atemp" | "wtemp" | "hum" | "co2";

const sensorTypes: SensorName[] = ["ph", "do", "atemp", "wtemp", "hum", "co2"];

const sensorAddressMap: Record<SensorName, string> = {
  ph: "99",
  do: "97",
  atemp: "102",
  wtemp: "102",
  hum: "101",
  co2: "104",
};

const SimulateDevices = () => {
  const [hubIds, setHubIds] = useState<string[]>([]);
  const [selectedHubId, setSelectedHubId] = useState("");
  const [selectedSensors, setSelectedSensors] = useState<SensorName[]>([]);
  const [batchSize, setBatchSize] = useState(5);
  const [batchCount, setBatchCount] = useState(3);
  const [intervalMs, setIntervalMs] = useState(1000);
  const [log, setLog] = useState<string[]>([]);
  const [pumpAmount, setPumpAmount] = useState(10);

  useEffect(() => {
    axios
      .get(
        "https://spatialhub-backend-823061962201.us-central1.run.app/api/hub/"
      )
      .then((res) => setHubIds(res.data.map((h: any) => h.hub_id)))
      .catch(console.error);
  }, []);

  const getRandomValue = (sensor: SensorName): number => {
    const valueRanges: Record<SensorName, [number, number]> = {
      ph: [0.0, 14.0],
      do: [0.0, 2000.0],
      atemp: [32.0, 110.0],
      wtemp: [32.0, 110.0],
      hum: [0.0, 100.0],
      co2: [400.0, 5000.0],
    };
    const [min, max] = valueRanges[sensor];
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
  };

  const sendPayload = async (payload: any) => {
    try {
      await axios.post(CLOUD_FUNCTION_URL, payload);
      setLog((prev) => [
        `Sent ${payload.sensor_name} (${payload.sensor_val})`,
        ...prev.slice(0, 49),
      ]);
    } catch (e) {
      setLog((prev) => [
        `Error sending ${payload.sensor_name}: ${e}`,
        ...prev.slice(0, 49),
      ]);
    }
  };

  const simulateBatch = async () => {
    if (!selectedHubId || selectedSensors.length === 0) {
      alert("Please select a hub and at least one sensor.");
      return;
    }

    for (let b = 0; b < batchCount; b++) {
      const batchPayloads = Array.from({ length: batchSize }).flatMap(() =>
        selectedSensors.map((sensor) => {
          const sensor_val = getRandomValue(sensor);
          return {
            hub_id: selectedHubId,
            sensor_name: sensor,
            device_addr: sensorAddressMap[sensor],
            sensor_val,
            datetime: new Date().toISOString(),
            sensor_id: `${selectedHubId}_${sensorAddressMap[sensor]}`,
            collection_type: "sensor_data",
          };
        })
      );

      for (const payload of batchPayloads) {
        await sendPayload(payload);
      }

      if (b < batchCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  };

  const sendPumpCommand = async () => {
    if (!selectedHubId) {
      alert("Please select a hub to send command");
      return;
    }
    try {
      await axios.post(COMMAND_URL, {
        hub_id: selectedHubId,
        command: `D,${pumpAmount}`,
      });
      setLog((prev) => [
        `Sent Pump Command: D,${pumpAmount}`,
        ...prev.slice(0, 49),
      ]);
    } catch (e) {
      setLog((prev) => [
        `Error sending pump command: ${e}`,
        ...prev.slice(0, 49),
      ]);
    }
  };

  const toggleSensor = (sensor: SensorName) => {
    setSelectedSensors((prev) =>
      prev.includes(sensor)
        ? prev.filter((s) => s !== sensor)
        : [...prev, sensor]
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">
          <span
            className="page-title-accent"
            style={{ background: "var(--accent-orange)" }}
          />
          Device Simulation
        </h2>
        <p className="page-subtitle">
          Inject test telemetry and send hub commands
        </p>
      </div>

      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header">Configuration</div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Select Hub</label>
            <select
              className="form-select"
              value={selectedHubId}
              onChange={(e) => setSelectedHubId(e.target.value)}
              style={{ maxWidth: "360px" }}
            >
              <option value="">-- Choose Hub --</option>
              {hubIds.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Sensor Types</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {sensorTypes.map((sensor) => (
                <button
                  key={sensor}
                  type="button"
                  className={`sensor-chip ${selectedSensors.includes(sensor) ? "active" : ""}`}
                  onClick={() => toggleSensor(sensor)}
                >
                  {sensor}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Batch Settings</label>
            <div className="form-inline">
              <div className="form-field">
                <label className="form-label form-label--sm">Batches</label>
                <input
                  className="form-input"
                  type="number"
                  value={batchCount}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                  style={{ width: "100px" }}
                />
              </div>
              <div className="form-field">
                <label className="form-label form-label--sm">
                  Readings / Batch
                </label>
                <input
                  className="form-input"
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  style={{ width: "120px" }}
                />
              </div>
              <div className="form-field">
                <label className="form-label form-label--sm">
                  Interval (ms)
                </label>
                <input
                  className="form-input"
                  type="number"
                  value={intervalMs}
                  onChange={(e) => setIntervalMs(Number(e.target.value))}
                  style={{ width: "120px" }}
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Pump Amount (ml)</label>
            <input
              className="form-input"
              type="number"
              value={pumpAmount}
              onChange={(e) => setPumpAmount(Number(e.target.value))}
              style={{ maxWidth: "160px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn btn-success" onClick={simulateBatch}>
              Start Simulation
            </button>
            <button className="btn btn-primary" onClick={sendPumpCommand}>
              Send Pump Command
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Mission Log</div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="log-console">
            {log.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  padding: "16px",
                }}
              >
                Awaiting transmissions...
              </div>
            ) : (
              log.map((l, i) => (
                <div
                  key={i}
                  className={`log-entry ${l.startsWith("Error") ? "log-entry--error" : ""}`}
                >
                  {l}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulateDevices;
