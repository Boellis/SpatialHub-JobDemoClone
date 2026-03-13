import React, { Suspense } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from "react-router-dom";
import { ProvisionHub } from "./pages/ProvisionHub";
import { RawSensorData } from "./pages/RawSensorData";
import { EnrichedSensorData } from "./pages/EnrichedSensorData";
import { SensorTrends } from "./pages/SensorTrends";
import SimulateDevices from "./pages/SimulateDevices";
import UnityEmbed from "./pages/UnityEmbed";

const HabitatView = React.lazy(() => import('./pages/HabitatView'));

// AppContent uses useLocation to hide nav on /habitat for full-screen immersion.
// Must be rendered inside <Router> so useLocation works.
const AppContent = () => {
  const location = useLocation();
  const isHabitat = location.pathname === '/habitat';

  return (
    <div className={isHabitat ? '' : 'min-h-screen bg-gray-100'}>
      {!isHabitat && (
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
      )}

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
  );
};

const App = () => (
  <Router>
    <AppContent />
  </Router>
);

export default App;
