// SensorOrb — a small glowing sphere inside a dome representing a single sensor.
// Position is relative to the parent dome group (i.e., relative to dome center).
// Color reflects live sensor status from Zustand, updating every 2s with the sim tick.
// Hover shows an Html tooltip with sensor name, current value, and unit.
// Orbs gently bob up and down using Math.sin — phase offset per sensor so they
// don't move in sync and the scene feels organic.

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useHabitatStore, selectSensorReading } from '../../store/habitatStore';
import type { SensorStatus } from '../../types/habitat';

// Status color palette matching the dome rings and tooltips
const STATUS_COLORS: Record<SensorStatus, string> = {
  green: '#00ff44',
  yellow: '#ffaa00',
  red: '#ff2200',
};

interface SensorOrbProps {
  sensorId: string;
  zoneId: string;
  sensorName: string;
  unit: string;
  position: [number, number, number]; // relative to dome center (the parent group)
}

export const SensorOrb = ({ sensorId, zoneId, sensorName, unit, position }: SensorOrbProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Live sensor reading from store — updates every 2s as simulation ticks
  const reading = useHabitatStore(selectSensorReading(zoneId, sensorId));
  const status: SensorStatus = reading?.status ?? 'green';
  const statusColor = STATUS_COLORS[status];

  // Phase offset per sensor so orbs bob out of sync — feels alive
  const phaseOffset = sensorId.charCodeAt(0) * 0.5 + sensorId.charCodeAt(sensorId.length - 1) * 0.3;
  // Store the base Y so we animate relative to it, not drift over time
  const baseY = position[1];

  // Gentle bobbing animation
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    meshRef.current.position.y = baseY + Math.sin(clock.elapsedTime * 1.5 + phaseOffset) * 0.1;
  });

  const handlePointerOver = (e: THREE.Event) => {
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
    setHovered(true);
  };

  const handlePointerOut = () => {
    setHovered(false);
  };

  // Prevent orb clicks from bubbling up to the dome click handler (which would trigger zone selection)
  const handleClick = (e: THREE.Event) => {
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
  };

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <sphereGeometry args={[0.25, 16, 16]} />
      <meshStandardMaterial
        color={statusColor}
        emissive={statusColor}
        emissiveIntensity={2.0}
        transparent
        opacity={0.9}
      />

      {/* Tooltip — only rendered when hovered to avoid 12 always-present DOM overlays */}
      {hovered && reading && (
        <Html
          center
          distanceFactor={8}
          position={[0, 0.6, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(10, 10, 10, 0.85)',
              border: `1px solid ${statusColor}55`,
              borderRadius: '4px',
              padding: '6px 10px',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#ffffff',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              minWidth: '110px',
            }}
          >
            {/* Sensor name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: statusColor,
                  flexShrink: 0,
                }}
              />
              <span style={{ opacity: 0.85, fontSize: '10px' }}>{sensorName}</span>
            </div>
            {/* Value row */}
            <div style={{ color: statusColor, fontWeight: 'bold', fontSize: '13px' }}>
              {reading.value.toFixed(1)}{' '}
              <span style={{ color: '#aaaaaa', fontSize: '10px', fontWeight: 'normal' }}>
                {unit}
              </span>
            </div>
          </div>
        </Html>
      )}
    </mesh>
  );
};
