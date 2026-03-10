import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MarsEnvironment } from '../components/habitat/MarsEnvironment';

// Full-screen R3F Canvas for the Mars habitat scene.
// Camera is elevated and pulled back to give an overview of the habitat area
// (zone positions span x:-8..8, z:-4..4 — camera at y:25, z:35 frames it well).
// Lazy-loaded via React.lazy in App.tsx — R3F bundle only loads on /habitat.

const HabitatView = () => {
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
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={8}
          maxDistance={60}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  );
};

export { HabitatView };
export default HabitatView;
