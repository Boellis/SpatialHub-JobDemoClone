import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { MarsEnvironment } from '../components/habitat/MarsEnvironment';
import { HabitatStructure } from '../components/habitat/HabitatStructure';
import { ZonePanel } from '../components/habitat/ZonePanel';
import { HabitatHUD } from '../components/habitat/HabitatHUD';
import { AlertBanner } from '../components/habitat/AlertBanner';
import { useHabitatStore } from '../store/habitatStore';

// Full-screen R3F Canvas for the Mars habitat scene.
// Camera is elevated and pulled back to give an overview of the habitat area
// (zone positions span x:-8..8, z:-4..4 — camera at y:25, z:35 frames it well).
// Lazy-loaded via React.lazy in App.tsx — R3F bundle only loads on /habitat.
//
// Note: OrbitControls is no longer here — it lives inside CameraController
// (via HabitatStructure) so that CameraController can own the controls ref
// and drive smooth camera transitions on zone select/deselect.

const HabitatView = () => {
  // Start the simulation on mount so dome glow is reactive from the first frame.
  // Note: hooks must live in the React component (outside Canvas), not inside R3F nodes.
  const startSimulation = useHabitatStore((s) => s.startSimulation);
  const isRunning = useHabitatStore((s) => s.isRunning);
  const selectedZoneId = useHabitatStore((s) => s.selectedZoneId);
  const setSelectedZoneId = useHabitatStore((s) => s.setSelectedZoneId);

  useEffect(() => {
    if (!isRunning) {
      startSimulation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a0a',
      }}
    >
      <Canvas
        camera={{ position: [0, 25, 35], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        shadows
        onCreated={({ gl }) => gl.setClearColor('#050505')}
      >
        <MarsEnvironment />
        <HabitatStructure />
      </Canvas>

      {/* HTML overlay layer — sits on top of Canvas, transparent to pointer events
          except on interactive elements (panels, HUD, alerts) */}
      <div style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        {/* HabitatHUD — always visible, top-left corner */}
        <HabitatHUD />

        {/* AlertBanner — top-center toast stack, self-positioned */}
        <AlertBanner />

        {/* ZonePanel — conditionally rendered when a zone is selected */}
        {selectedZoneId && (
          <ZonePanel
            zoneId={selectedZoneId}
            onClose={() => setSelectedZoneId(null)}
          />
        )}

        {/* Hint text — only visible when no zone is selected */}
        {!selectedZoneId && (
          <div style={{
            position: 'absolute',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.25)',
            fontFamily: 'monospace',
            fontSize: '13px',
            letterSpacing: '0.05em',
            pointerEvents: 'none',
          }}>
            Click a dome to inspect
          </div>
        )}
      </div>
    </div>
  );
};

export { HabitatView };
export default HabitatView;
