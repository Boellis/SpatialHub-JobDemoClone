// CameraController manages smooth camera transitions when a zone is selected.
// It lives inside the R3F Canvas and owns the OrbitControls instance,
// giving it direct access to both camera position and controls.target.
//
// Transition approach:
//   - Keep mutable ref vectors (targetPos, targetLookAt) that useEffect updates
//     when selectedZoneId changes.
//   - useFrame lerps camera.position and controls.target toward those refs each
//     frame at factor 0.04 (~0.8-1.2s to converge, ease-out feel).
//   - Once converged (distance < 0.01) lerping stops — no fighting with user drag.
//
// Escape key and background clicks both call onDeselect(), which the parent
// handles by setting selectedZoneId = null, triggering an overview return.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ZONE_MAP } from '../../simulation/constants';

// Overview camera position/target — matches the initial camera setup in HabitatView
const OVERVIEW_POS = new THREE.Vector3(0, 25, 35);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);

// Offset from zone center for the focused camera position.
// Positions the camera above and slightly to the side of the dome for a close orbit.
const FOCUS_OFFSET = new THREE.Vector3(5, 8, 10);

interface CameraControllerProps {
  selectedZoneId: string | null;
  onDeselect: () => void;
}

export const CameraController = ({ selectedZoneId, onDeselect }: CameraControllerProps) => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  // Mutable target vectors — updated by useEffect, consumed by useFrame
  const targetPos = useRef<THREE.Vector3>(OVERVIEW_POS.clone());
  const targetLookAt = useRef<THREE.Vector3>(OVERVIEW_TARGET.clone());

  // Track whether we're still lerping or have converged
  const isTransitioning = useRef(false);

  // When selectedZoneId changes, update the target position/lookAt
  useEffect(() => {
    if (selectedZoneId) {
      const zone = ZONE_MAP[selectedZoneId];
      if (!zone) return;

      const zonePos = new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z);
      targetPos.current.copy(zonePos).add(FOCUS_OFFSET);
      targetLookAt.current.copy(zonePos);
    } else {
      // Deselected — return to overview
      targetPos.current.copy(OVERVIEW_POS);
      targetLookAt.current.copy(OVERVIEW_TARGET);
    }
    isTransitioning.current = true;
  }, [selectedZoneId]);

  // Lerp camera and controls.target toward target vectors every frame
  useFrame(() => {
    if (!isTransitioning.current) return;
    const controls = controlsRef.current;
    if (!controls) return;

    // Lerp camera position
    camera.position.lerp(targetPos.current, 0.04);

    // Lerp the OrbitControls target (the point the camera orbits around)
    controls.target.lerp(targetLookAt.current, 0.04);
    controls.update();

    // Stop lerping once we're close enough to avoid fighting user drag
    const posConverged = camera.position.distanceTo(targetPos.current) < 0.01;
    const targetConverged = controls.target.distanceTo(targetLookAt.current) < 0.01;
    if (posConverged && targetConverged) {
      isTransitioning.current = false;
    }
  });

  // Escape key handler — deselect current zone
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDeselect();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeselect]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={8}
      maxDistance={60}
      maxPolarAngle={Math.PI / 2.1}
    />
  );
};
