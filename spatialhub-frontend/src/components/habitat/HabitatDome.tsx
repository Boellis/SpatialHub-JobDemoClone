import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useHabitatStore, selectZone } from '../../store/habitatStore';
import type { ZoneStatus } from '../../types/habitat';

// Status colors for emissive and badge rendering
const STATUS_COLORS: Record<ZoneStatus, string> = {
  green: '#00ff44',
  yellow: '#ffaa00',
  red: '#ff2200',
};

interface HabitatDomeProps {
  zoneId: string;
  name: string;
  position: [number, number, number];
  accentColor: string; // hex color, e.g., '#00ff88'
}

// Lerp two hex colors at a given factor — used to shift emissive toward red on alert
function lerpHexColor(colorA: string, colorB: string, t: number): THREE.Color {
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  return a.lerp(b, t);
}

export const HabitatDome = ({ zoneId, name, position, accentColor }: HabitatDomeProps) => {
  const rimRef = useRef<THREE.Mesh>(null);
  const accentRef = useRef<THREE.Mesh>(null);

  // Subscribe to this zone's live state from Zustand
  const zone = useHabitatStore(selectZone(zoneId));
  const status: ZoneStatus = zone?.status ?? 'green';

  // Animate emissive intensity and color on every frame
  useFrame(({ clock }) => {
    if (!rimRef.current) return;

    const material = rimRef.current.material as THREE.MeshStandardMaterial;

    let intensity: number;
    let emissiveColor: THREE.Color;

    if (status === 'green') {
      intensity = 1.5;
      emissiveColor = new THREE.Color(accentColor);
    } else if (status === 'yellow') {
      intensity = 3.0;
      emissiveColor = new THREE.Color(accentColor);
    } else {
      // Red: pulsing at ~2Hz between 2.0 and 5.0
      intensity = 2.0 + 3.0 * Math.abs(Math.sin(clock.elapsedTime * 4));
      // Lerp accent color toward red at 0.7 factor
      emissiveColor = lerpHexColor(accentColor, '#ff2200', 0.7);
    }

    material.emissiveIntensity = intensity;
    material.emissive.copy(emissiveColor);
  });

  // The dome sits with flat base at y=0. sphereGeometry with phiLength=PI/2 gives upper hemisphere.
  // radius=5, 32 segments, full circle azimuth, upper half only
  return (
    <group position={position}>
      {/* Main dome — dark metallic half-sphere */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[5, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#1a1a2e"
          metalness={0.7}
          roughness={0.3}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Accent rim ring at the base — this is where emissive bloom comes from */}
      <mesh
        ref={rimRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
      >
        <torusGeometry args={[5, 0.25, 16, 64]} />
        <meshStandardMaterial
          color="#000000"
          emissive={accentColor}
          emissiveIntensity={1.5}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Inner dome accent ring — slightly smaller, creates depth */}
      <mesh
        ref={accentRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.1, 0]}
      >
        <torusGeometry args={[4, 0.08, 8, 48]} />
        <meshStandardMaterial
          color="#000000"
          emissive={accentColor}
          emissiveIntensity={0.8}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Floating HTML label above the dome */}
      <Html
        position={[0, 7.5, 0]}
        center
        distanceFactor={15}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: 'rgba(10, 10, 10, 0.8)',
            border: `1px solid ${STATUS_COLORS[status]}44`,
            borderRadius: '6px',
            padding: '4px 10px',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffffff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            userSelect: 'none',
          }}
        >
          {/* Status dot badge */}
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: STATUS_COLORS[status],
              boxShadow: `0 0 6px ${STATUS_COLORS[status]}`,
              flexShrink: 0,
            }}
          />
          <span style={{ opacity: 0.9 }}>{name}</span>
        </div>
      </Html>
    </group>
  );
};
