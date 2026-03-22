import { Canvas } from '@react-three/fiber';
import { useSimSource } from '../hooks/useSimSource';
import { useLiveSensors } from '../hooks/useLiveSensors';
import { usePriorityRanking } from '../hooks/usePriorityRanking';
import { useHabitatStore } from '../store/habitatStore';
import type { ZoneState } from '../types/habitat';

function scoreZone(zone: ZoneState): number {
  let red = 0, yellow = 0;
  for (const sensor of Object.values(zone.sensors)) {
    if (sensor.status === 'red') red++;
    else if (sensor.status === 'yellow') yellow++;
  }
  return (red * 10) + (yellow * 3);
}

const TvDashboardView = () => {
  useSimSource();
  useLiveSensors();

  const rankedIds = usePriorityRanking();
  const zones = useHabitatStore(s => s.zones);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06070b', overflow: 'hidden' }}>
      <Canvas
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={{ antialias: false, alpha: true }}
        events={null as unknown as undefined}
      >
        {/* Empty in Phase 17 — ParallaxBackground lands in Phase 20 */}
      </Canvas>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {/* Dev debug: ranked zone IDs — remove in Phase 18 when PriorityGrid lands */}
        <ul
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            fontFamily: 'Space Mono, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            listStyle: 'none',
            padding: 0,
            margin: 0,
            pointerEvents: 'none',
          }}
        >
          {rankedIds.length === 0 ? (
            <li style={{ color: '#454d64', fontFamily: 'Space Mono, monospace', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              AWAITING TELEMETRY...
            </li>
          ) : (
            rankedIds.map((id, i) => (
              <li key={id}>
                <span style={{ color: '#00aaff' }}>{i + 1}. </span>
                <span style={{ color: '#e2e5ed' }}>
                  {id} [score: {zones[id] ? scoreZone(zones[id]) : 0}]
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default TvDashboardView;
