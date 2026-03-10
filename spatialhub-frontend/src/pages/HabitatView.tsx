import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { MarsEnvironment } from '../components/habitat/MarsEnvironment';
import { HabitatStructure } from '../components/habitat/HabitatStructure';
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
    </div>
  );
};

export { HabitatView };
export default HabitatView;
