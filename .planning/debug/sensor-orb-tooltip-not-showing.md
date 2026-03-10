---
status: investigating
trigger: "Investigate why sensor orb tooltips are not appearing when hovering over sensor orbs in the 3D habitat scene."
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:00:00Z
---

## Current Focus

hypothesis: The dome mesh (radius 5, half-sphere) geometrically encloses the sensor orbs, intercepting all pointer events before they can reach the orbs. The dome has onPointerOver/onPointerOut/onClick handlers that call stopPropagation, which kills event propagation to children inside.
test: Analyze dome geometry vs sensor orb positions to confirm occlusion
expecting: Sensor orbs are physically inside the dome sphere, making raycasts hit dome first
next_action: Document spatial analysis and event propagation findings

## Symptoms

expected: Hovering over a sensor orb shows a tooltip with sensor name, current value, and unit
actual: No tooltip appears when hovering over sensor orbs
errors: None reported
reproduction: Hover over any sensor orb inside any dome
started: Likely since initial implementation

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-10T00:01:00Z
  checked: SensorOrb.tsx hover logic (lines 32, 50-57, 82-129)
  found: Hover state management and conditional Html rendering are correctly implemented. useState(false), onPointerOver sets true, onPointerOut sets false, Html rendered when hovered && reading.
  implication: The tooltip rendering logic itself is correct; the problem is upstream -- the pointer events never reach the orbs.

- timestamp: 2026-03-10T00:02:00Z
  checked: HabitatDome.tsx dome geometry and event handlers (lines 99-138)
  found: Dome mesh uses sphereGeometry args=[5, 32, 32, 0, PI*2, 0, PI/2] (upper hemisphere, radius 5). Dome has onPointerOver/onPointerOut/onClick handlers that ALL call stopPropagation(). Sensor orbs are rendered as children of the same <group>.
  implication: CRITICAL -- The dome is a solid half-sphere of radius 5. It has event handlers with stopPropagation. This is the primary suspect.

- timestamp: 2026-03-10T00:03:00Z
  checked: Sensor orb positions (HabitatDome.tsx lines 18-22) vs dome geometry
  found: SENSOR_OFFSETS are [-1.2, 2.0, -0.8], [1.0, 3.0, 0.5], [0.0, 1.5, 1.2]. Dome radius is 5. All orbs have position magnitude < 5 (e.g., sqrt(1.2^2 + 2^2 + 0.8^2) = ~2.5). Orb radius is 0.25 (SensorOrb.tsx line 72). Every single orb is geometrically INSIDE the dome hemisphere.
  implication: Raycasts from the camera hit the dome mesh first because it's a closed surface surrounding the orbs. The dome's onPointerOver calls stopPropagation, so events never propagate to the orb meshes.

- timestamp: 2026-03-10T00:04:00Z
  checked: R3F event propagation model
  found: In R3F, pointer events raycast through the scene. When multiple meshes are hit, events fire on the NEAREST intersected mesh first. Since the dome is a solid half-sphere enclosing the orbs, the raycast hits the dome surface BEFORE reaching any orb inside. The dome's stopPropagation() on lines 99-101 prevents the event from reaching the orbs.
  implication: This is the root cause. The dome mesh acts as an opaque event shield around the orbs.

- timestamp: 2026-03-10T00:05:00Z
  checked: Whether dome transparency helps with events
  found: The dome material has transparent: true, opacity: 0.85 (line 134). However, R3F raycast intersection is based on GEOMETRY, not material opacity. A transparent mesh still blocks raycasts.
  implication: Visual transparency does NOT equal event transparency. The dome blocks pointer events regardless of its visual opacity.

## Resolution

root_cause: The dome mesh (HabitatDome.tsx line 121-138) is a solid upper hemisphere (radius 5) that geometrically encloses all three sensor orbs (which sit at positions with magnitude ~1.5-3.5, well inside the radius-5 dome). In R3F's pointer event system, raycasts intersect the nearest mesh first. Since the dome surface is between the camera and the orbs, pointer events always hit the dome first. The dome's onPointerOver handler (line 99-101) calls stopPropagation(), preventing events from ever reaching the SensorOrb meshes inside. Even without stopPropagation, the dome mesh would still be the primary intersection target. The orbs are effectively invisible to pointer events.
fix: (not applied -- diagnosis only)
verification: (not performed)
files_changed: []
