import { useRef } from 'react';
import * as THREE from 'three';

// MarsEnvironment renders inside an R3F Canvas — no HTML elements here.
// Ground plane: 200x200 dark rust, rotated flat, roughness 0.9
// Lighting: very dim ambient + warm directional from high angle
// Fog: dense dark fog hides the ground edges for atmosphere

export const MarsEnvironment = () => {
  const groundRef = useRef<THREE.Mesh>(null);

  return (
    <>
      {/* Scene fog — near-black, starts at 30 units, fully opaque at 80 */}
      <fog attach="fog" args={['#050505', 30, 80]} />

      {/* Ambient light — mission-control darkness, just enough to read shapes */}
      <ambientLight intensity={0.15} />

      {/* Directional light — warm low-sun orange-white from upper right */}
      <directionalLight
        color="#ffe0c0"
        intensity={0.6}
        position={[15, 20, 10]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      {/* Ground plane — rotated flat, dark rusty Mars surface color */}
      <mesh
        ref={groundRef}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#2a1510"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
    </>
  );
};
