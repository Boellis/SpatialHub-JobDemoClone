import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { ZONE_CONFIGS } from '../../simulation/constants';
import { HabitatDome } from './HabitatDome';
import { CameraController } from './CameraController';
import { useHabitatStore } from '../../store/habitatStore';

// Accent colors per zone — chosen for immediate semantic legibility
// Exported so ZonePanel can use consistent colors for accent bars
export const ZONE_ACCENT_COLORS: Record<string, string> = {
  'grow-bays': '#00ff88',           // green — plants, growth
  'atmosphere-control': '#00aaff',  // blue — air, sky
  'water-recycling': '#8844ff',     // purple — water processing
  'power-thermal': '#ff6600',       // orange — energy, heat
};

// Helper: compute corridor mesh properties between two dome centers.
// Corridors are cylindrical tubes connecting dome bases (y=0 level, offset up slightly).
interface CorridorConfig {
  position: [number, number, number];
  rotation: [number, number, number];
  length: number;
}

function createCorridor(
  from: [number, number, number],
  to: [number, number, number]
): CorridorConfig {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.sqrt(dx * dx + dz * dz);

  // Midpoint between the two dome centers
  const midX = (from[0] + to[0]) / 2;
  const midZ = (from[2] + to[2]) / 2;
  // Slight Y offset so the tube sits just above the ground plane
  const midY = 0.4;

  // Rotation: CylinderGeometry is vertical by default (along Y axis).
  // We need to lay it horizontal. Rotate around Z by PI/2 (lays along X),
  // then rotate around Y to point from->to.
  const angleY = Math.atan2(dx, dz);

  return {
    position: [midX, midY, midZ],
    rotation: [Math.PI / 2, angleY, 0],
    length,
  };
}

// The four dome positions as tuples (mirroring ZONE_CONFIGS positions)
// Corridors: form a rectangular loop — top row, bottom row, left column, right column
const CORRIDORS: Array<{ from: [number, number, number]; to: [number, number, number] }> = [
  // Top row: grow-bays (-8,-4) -> atmosphere-control (8,-4)
  { from: [-8, 0, -4], to: [8, 0, -4] },
  // Bottom row: water-recycling (-8,4) -> power-thermal (8,4)
  { from: [-8, 0, 4], to: [8, 0, 4] },
  // Left column: grow-bays (-8,-4) -> water-recycling (-8,4)
  { from: [-8, 0, -4], to: [-8, 0, 4] },
  // Right column: atmosphere-control (8,-4) -> power-thermal (8,4)
  { from: [8, 0, -4], to: [8, 0, 4] },
];

// HabitatStructure renders the complete habitat layout:
// 4 domes + 4 connecting corridors + selective bloom post-processing.
// Also owns the selectedZoneId state — lifted here so both CameraController
// and individual HabitatDomes can access it without prop-drilling through HabitatView.
// Must be a child of the R3F Canvas in HabitatView.
export const HabitatStructure = () => {
  const selectedZoneId = useHabitatStore((s) => s.selectedZoneId);
  const setSelectedZoneId = useHabitatStore((s) => s.setSelectedZoneId);

  const handleDeselect = () => setSelectedZoneId(null);

  return (
    <>
      {/* CameraController owns OrbitControls and handles smooth camera transitions.
          It also listens for the Escape key and calls onDeselect. */}
      <CameraController selectedZoneId={selectedZoneId} onDeselect={handleDeselect} />

      {/* Dome group — onPointerMissed fires when clicking anything NOT a dome mesh.
          This gives us background-click-to-deselect without a separate invisible plane. */}
      <group onPointerMissed={handleDeselect}>
        {/* Four zone domes — positioned from ZONE_CONFIGS */}
        {ZONE_CONFIGS.map((zone) => (
          <HabitatDome
            key={zone.zoneId}
            zoneId={zone.zoneId}
            name={zone.name}
            position={[zone.position.x, zone.position.y, zone.position.z]}
            accentColor={ZONE_ACCENT_COLORS[zone.zoneId] ?? '#ffffff'}
            isSelected={selectedZoneId === zone.zoneId}
            onSelect={setSelectedZoneId}
          />
        ))}

        {/* Connecting corridors — semi-transparent tubes with subtle glow */}
        {CORRIDORS.map(({ from, to }, idx) => {
          const { position, rotation, length } = createCorridor(from, to);
          return (
            <mesh key={idx} position={position} rotation={rotation}>
              {/* radius=0.4, length between dome edges minus dome radius on each side */}
              <cylinderGeometry args={[0.4, 0.4, length - 10, 16]} />
              <meshStandardMaterial
                color="#1a1a2e"
                transparent
                opacity={0.4}
                emissive="#334455"
                emissiveIntensity={0.5}
              />
            </mesh>
          );
        })}
      </group>

      {/* Selective bloom — luminanceThreshold 0.8 means only highly emissive
          elements (the dome rings at intensity >1) bloom. Ground and dome bodies
          stay crisp. This is what makes the scene look cinematic vs flat. */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.8}
          luminanceSmoothing={0.3}
          intensity={1.5}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
};
