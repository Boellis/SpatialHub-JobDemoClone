import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Module-level constants (user decisions from 20-CONTEXT.md)
// ---------------------------------------------------------------------------
const PARTICLE_COUNT = 80;
const BASE_COLOR = '#ff6b35';
const Z_MIN = -8;
const Z_MAX = -2;
const OPACITY = 0.12;
const FREQ_MIN = 0.03;
const FREQ_MAX = 0.1;
const AMP_MIN = 0.1;
const AMP_MAX = 0.5;
const HUE_VARIATION = 0.3;

// ---------------------------------------------------------------------------
// Per-particle data shape
// ---------------------------------------------------------------------------
interface Particle {
  baseX: number;
  baseY: number;
  z: number;
  radius: number;
  freqX: number;
  freqY: number;
  phaseX: number;
  phaseY: number;
  ampX: number;
  ampY: number;
  hueShift: number;
}

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ParallaxBackground = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Generate per-particle data once — stable across renders
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
      baseX: rnd(-6, 6),
      baseY: rnd(-4, 4),
      z: rnd(Z_MIN, Z_MAX),
      radius: rnd(0.02, 0.08),
      freqX: rnd(FREQ_MIN, FREQ_MAX),
      freqY: rnd(FREQ_MIN, FREQ_MAX),
      phaseX: rnd(0, Math.PI * 2),
      phaseY: rnd(0, Math.PI * 2),
      ampX: rnd(AMP_MIN, AMP_MAX),
      ampY: rnd(AMP_MIN, AMP_MAX),
      hueShift: rnd(-HUE_VARIATION, HUE_VARIATION),
    }));
  }, []);

  // Set per-instance color and initial matrices on first render
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorBase = useMemo(() => new THREE.Color(BASE_COLOR), []);

  // Seed initial matrices and colors after mesh mounts
  const initialized = useRef(false);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // First frame: seed instance colors
    if (!initialized.current) {
      particles.forEach((p, i) => {
        const c = colorBase.clone().offsetHSL(p.hueShift, 0, 0);
        mesh.setColorAt(i, c);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      initialized.current = true;
    }

    const elapsed = clock.getElapsedTime();

    particles.forEach((p, i) => {
      const x = p.baseX + Math.sin(elapsed * p.freqX + p.phaseX) * p.ampX;
      const y = p.baseY + Math.sin(elapsed * p.freqY + p.phaseY) * p.ampY;

      dummy.position.set(x, y, p.z);
      dummy.scale.setScalar(p.radius);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        color={BASE_COLOR}
        transparent
        opacity={OPACITY}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
};
