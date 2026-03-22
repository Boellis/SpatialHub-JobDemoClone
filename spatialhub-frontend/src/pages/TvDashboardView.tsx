import { Canvas } from '@react-three/fiber';
import { useSimSource } from '../hooks/useSimSource';
import { useLiveSensors } from '../hooks/useLiveSensors';
import { StatusBar } from '../components/tv/StatusBar';
import { PriorityGrid } from '../components/tv/PriorityGrid';
import { ParallaxBackground } from '../components/tv/ParallaxBackground';

const TvDashboardView = () => {
  useSimSource();
  useLiveSensors();

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06070b', overflow: 'hidden' }}>
      <Canvas
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={{ antialias: false, alpha: true }}
        events={null as unknown as undefined}
      >
        <ParallaxBackground />
      </Canvas>
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <StatusBar />
        <div style={{ flex: 1, minHeight: 0 }}>
          <PriorityGrid />
        </div>
      </div>
    </div>
  );
};

export default TvDashboardView;
