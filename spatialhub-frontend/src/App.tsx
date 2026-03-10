import React, { Suspense } from "react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import { ProvisionHub } from "./pages/ProvisionHub";
import { RawSensorData } from "./pages/RawSensorData";
import { EnrichedSensorData } from "./pages/EnrichedSensorData";
import { SensorTrends } from "./pages/SensorTrends";
import SimulateDevices from "./pages/SimulateDevices";
import UnityEmbed from "./pages/UnityEmbed";

const HabitatView = React.lazy(() => import('./pages/HabitatView'));

const App = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white p-4 shadow mb-6">
          <div className="flex gap-4">
            <Link to="/" className="text-blue-600 hover:underline">Provision Hub</Link>
            <Link to="/raw" className="text-blue-600 hover:underline">Raw Data</Link>
            <Link to="/enriched" className="text-blue-600 hover:underline">Enriched Data</Link>
            <Link to="/trends" className="text-blue-600 hover:underline">Sensor Trends</Link>
            <Link to="/simulate" className="text-blue-600 hover:underline">Simulate Devices</Link>
            <Link to="/unity" className="text-blue-600 hover:underline">Unity Simulation</Link>
            <Link to="/habitat" className="text-blue-600 hover:underline">Mars Habitat</Link>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<ProvisionHub />} />
          <Route path="/raw" element={<RawSensorData />} />
          <Route path="/enriched" element={<EnrichedSensorData />} />
          <Route path="/trends" element={<SensorTrends />} />
          <Route path="/simulate" element={<SimulateDevices />} />
          <Route path="/unity" element={<UnityEmbed />} />
          <Route
            path="/habitat"
            element={
              <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>Loading habitat...</div>}>
                <HabitatView />
              </Suspense>
            }
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
