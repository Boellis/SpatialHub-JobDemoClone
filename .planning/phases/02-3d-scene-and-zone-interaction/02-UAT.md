---
status: diagnosed
phase: 02-3d-scene-and-zone-interaction
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-03-10T06:00:00Z
updated: 2026-03-10T06:10:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. /habitat Route Loads
expected: Navigate to /habitat (or click "Mars Habitat" in the nav). A full-screen 3D scene renders with a dark Mars-like surface. The page loads via lazy code-splitting (you may see a brief dark loading screen before the 3D scene appears).
result: pass

### 2. Mars Environment
expected: The scene shows a large rust-colored ground plane stretching into the distance. Lighting is warm and dim. Atmospheric fog fades distant objects to black.
result: pass

### 3. Four Domes with Glowing Rims
expected: Four half-sphere domes are visible on the ground, each with a distinct accent color (green, blue, purple, orange). Each dome has a glowing ring at its base that produces a soft bloom/glow effect matching the dome's color.
result: pass

### 4. Corridors and Floating Labels
expected: Semi-transparent tube corridors connect the domes to each other. Each dome has a floating HTML label above it showing the zone name and a small colored status dot.
result: pass

### 5. Live Simulation Running
expected: The scene is alive — sensor status colors on dome rims and sensor orbs shift over time (green/yellow/red) as the simulation engine generates data automatically on page load.
result: pass

### 6. Dome Hover and Click-to-Zoom
expected: Hovering over a dome brightens its emissive glow and changes the cursor to a pointer. Clicking a dome smoothly zooms the camera to focus on that dome over ~1 second with an ease-out feel.
result: pass

### 7. Deselect via Escape or Background Click
expected: While zoomed into a dome, pressing Escape or clicking the background (not on a dome) smoothly returns the camera to the overview position.
result: pass

### 8. Sensor Orbs with Status Colors
expected: Inside/near each dome, 3 small glowing spheres (sensor orbs) are visible. They bob gently up and down with a floating animation. Each orb is colored by its sensor status (green, yellow, or red).
result: pass

### 9. Sensor Orb Hover Tooltip
expected: Hovering over a sensor orb shows a tooltip displaying the sensor name, current value (1 decimal place), and unit (e.g., "Temperature: 22.5 °C").
result: issue
reported: "I do not see a tooltip over each sensor when I tap on a dome"
severity: major

### 10. OrbitControls Navigation
expected: You can rotate the view by dragging, zoom with scroll wheel. The camera cannot go below the ground plane (can't flip under the scene). Zoom has sensible min/max limits.
result: pass

## Summary

total: 10
passed: 9
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Hovering over a sensor orb shows a tooltip displaying the sensor name, current value (1 decimal place), and unit"
  status: failed
  reason: "User reported: I do not see a tooltip over each sensor when I tap on a dome"
  severity: major
  test: 9
  root_cause: "Dome half-sphere mesh (radius 5) geometrically encloses all sensor orbs (magnitude < 3.5). R3F raycasts hit dome surface first, and dome's stopPropagation() kills event propagation — orb hover handlers never fire."
  artifacts:
    - path: "spatialhub-frontend/src/components/habitat/HabitatDome.tsx"
      issue: "Dome mesh intercepts all pointer events before they reach enclosed sensor orbs; stopPropagation on lines 99-101 blocks propagation"
  missing:
    - "Disable raycasting on dome mesh (raycast={()=>{}}) so events pass through to orbs"
    - "Move dome pointer handlers (onPointerOver/Out/onClick) from mesh to parent group"
  debug_session: ".planning/debug/sensor-orb-tooltip-not-showing.md"
