import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fetchEnrichedSensorData } from "../api/api";

const CHART_COLORS = [
  "#00aaff",
  "#00ff88",
  "#8844ff",
  "#ff6600",
  "#ffaa00",
  "#ff2244",
  "#ff44aa",
  "#44ffcc",
];

interface SensorData {
  id: number;
  hub_id: string;
  sensor_name: string;
  sensor_val: number;
  datetime: string;
}

export const SensorTrends = () => {
  const [data, setData] = useState<SensorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSensor, setSelectedSensor] = useState<string>("atemp");
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [compareAllHubs, setCompareAllHubs] = useState<boolean>(false);

  useEffect(() => {
    fetchEnrichedSensorData(1)
      .then((result) => {
        const flat =
          Array.isArray(result) && Array.isArray(result[0])
            ? result[0]
            : result;
        setData(flat);
      })
      .catch((err) => {
        console.error("Error fetching enriched data:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const sensorOptions = Array.from(
    new Set(data.map((d) => d.sensor_name))
  ).sort();
  const hubOptions = Array.from(new Set(data.map((d) => d.hub_id))).sort();

  const filteredData = data
    .filter((d) => d.sensor_name === selectedSensor)
    .filter((d) => compareAllHubs || d.hub_id === selectedHub)
    .sort(
      (a, b) =>
        new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );

  const groupedData: { [key: string]: any }[] = [];

  filteredData.forEach((item) => {
    const time = new Date(item.datetime).toLocaleString();
    const existing = groupedData.find((entry) => entry.datetime === time);

    if (existing) {
      existing[item.hub_id] = item.sensor_val;
    } else {
      groupedData.push({
        datetime: time,
        [item.hub_id]: item.sensor_val,
      });
    }
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">
          <span
            className="page-title-accent"
            style={{ background: "var(--accent-purple)" }}
          />
          Sensor Trends
        </h2>
        <p className="page-subtitle">
          Visualize telemetry patterns over time
        </p>
      </div>

      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header">Filters</div>
        <div className="card-body">
          <div className="form-inline">
            <div className="form-field">
              <label className="form-label">Sensor Type</label>
              <select
                className="form-select"
                value={selectedSensor}
                onChange={(e) => setSelectedSensor(e.target.value)}
                style={{ width: "180px" }}
              >
                {sensorOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label">Hub ID</label>
              <select
                className="form-select"
                value={selectedHub}
                onChange={(e) => setSelectedHub(e.target.value)}
                disabled={compareAllHubs}
                style={{ width: "240px" }}
              >
                {hubOptions.map((hub) => (
                  <option key={hub} value={hub}>
                    {hub}
                  </option>
                ))}
              </select>
            </div>

            <label
              className="form-checkbox"
              style={{ paddingBottom: "2px" }}
            >
              <input
                type="checkbox"
                checked={compareAllHubs}
                onChange={() => setCompareAllHubs(!compareAllHubs)}
              />
              Compare All Hubs
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <div className="loading-text">Loading trend data</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <LineChart data={groupedData}>
                <CartesianGrid
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="datetime"
                  stroke="#454d64"
                  tick={{
                    fill: "#4a5168",
                    fontSize: 11,
                    fontFamily: "'Space Mono', monospace",
                  }}
                />
                <YAxis
                  stroke="#454d64"
                  tick={{
                    fill: "#4a5168",
                    fontSize: 11,
                    fontFamily: "'Space Mono', monospace",
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0c0e16",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "8px",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#e2e5ed" }}
                  itemStyle={{ color: "#7d869c" }}
                />
                <Legend
                  formatter={(value: string) => (
                    <span
                      style={{
                        color: "#7d869c",
                        fontFamily: "'Space Mono', monospace",
                        fontSize: "12px",
                      }}
                    >
                      {value}
                    </span>
                  )}
                />
                {(compareAllHubs ? hubOptions : [selectedHub]).map(
                  (hub, i) => (
                    <Line
                      key={hub}
                      type="monotone"
                      dataKey={hub}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  )
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
