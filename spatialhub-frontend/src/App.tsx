import React, { Suspense } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  useLocation,
} from "react-router-dom";
import { ProvisionHub } from "./pages/ProvisionHub";
import { RawSensorData } from "./pages/RawSensorData";
import { EnrichedSensorData } from "./pages/EnrichedSensorData";
import { SensorTrends } from "./pages/SensorTrends";
import SimulateDevices from "./pages/SimulateDevices";
import UnityEmbed from "./pages/UnityEmbed";

const HabitatView = React.lazy(() => import("./pages/HabitatView"));

const NavLink = ({
  to,
  children,
  className = "",
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`nav-link ${isActive ? "active" : ""} ${className}`}
    >
      {children}
    </Link>
  );
};

const AppContent = () => {
  const location = useLocation();
  const isHabitat = location.pathname === "/habitat";

  return (
    <>
      {!isHabitat && (
        <nav className="nav">
          <Link to="/" className="nav-brand">
            <span className="nav-brand-dot" />
            <span>
              Spatial<span className="nav-brand-accent">Hub</span>
            </span>
          </Link>
          <div className="nav-links">
            <NavLink to="/">Provision</NavLink>
            <NavLink to="/raw">Raw Data</NavLink>
            <NavLink to="/enriched">Enriched</NavLink>
            <NavLink to="/trends">Trends</NavLink>
            <NavLink to="/simulate">Simulate</NavLink>
            <NavLink to="/unity">Unity</NavLink>
            <NavLink to="/habitat" className="nav-link--habitat">
              Mars Habitat
            </NavLink>
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
            <Suspense
              fallback={
                <div
                  style={{
                    width: "100vw",
                    height: "100vh",
                    background: "#0a0a0a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div className="loading-state">
                    <div className="loading-spinner" />
                    <div className="loading-text">Initializing Habitat</div>
                  </div>
                </div>
              }
            >
              <HabitatView />
            </Suspense>
          }
        />
      </Routes>
    </>
  );
};

const App = () => (
  <Router>
    <AppContent />
  </Router>
);

export default App;
