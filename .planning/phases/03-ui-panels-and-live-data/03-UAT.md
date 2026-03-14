---
status: complete
phase: 03-ui-panels-and-live-data
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-03-13T22:00:00Z
updated: 2026-03-13T22:12:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Zone Panel Opens on Dome Click
expected: Click any dome zone in the 3D scene at /habitat. A ZonePanel sidebar slides in from the right with glassmorphism styling (frosted glass background), a colored accent bar at top matching the zone color, and live sensor readings for that zone.
result: pass

### 2. Animated Sensor Values
expected: Watch sensor values in the open ZonePanel. Numbers should transition smoothly (instrument-style lerp) rather than jumping discretely when simulation ticks update values.
result: pass

### 3. Sparkline Charts
expected: Each sensor row in ZonePanel shows a small inline SVG sparkline (polyline chart) displaying recent data history. The sparkline color reflects sensor status (green/yellow/red).
result: pass

### 4. Zone Switching Cross-Fade
expected: With ZonePanel open, click a different dome zone. Panel content cross-fades to the new zone's data with a slideInRight animation. The accent color bar changes to match the new zone.
result: pass

### 5. Close Zone Panel
expected: Click the close button on ZonePanel. The panel disappears and the 3D scene returns to full width.
result: pass

### 6. Main Nav Hidden on Habitat
expected: Navigate to /habitat. The main navigation bar (top nav with route links) is hidden, giving full-screen real estate to the 3D habitat scene and overlay.
result: pass

### 7. HabitatHUD System Overview
expected: Top-left corner shows a glassmorphism HUD card displaying: sol count (3-digit padded, e.g. SOL 042), colored status dot with NOMINAL/CAUTION/CRITICAL label, active sensor count, and a compact row of 4 zone dots with abbreviations (GB/AC/WR/PT).
result: pass

### 8. Alert Toasts on Sensor Warnings
expected: When a sensor goes out of normal range (caution/yellow), an alert toast appears at top-center showing: zone name, sensor name, HIGH or LOW direction, value with unit, and zone accent color dot. Styled with amber coloring for caution level.
result: pass

### 9. Yellow Alert Auto-Dismiss
expected: Yellow/caution alert toasts automatically disappear after approximately 5 seconds without user interaction.
result: pass

### 10. Red Alert Persistence
expected: When a sensor goes critical (red), the alert toast persists with a pulsing red glow effect and does NOT auto-dismiss. It remains until the sensor recovers to green/nominal range.
result: pass

### 11. Alert Deduplication
expected: The same sensor triggering alerts repeatedly should not spam the toast stack. Only one alert per sensor fires within a ~10s cooldown window. Max 5 alerts visible at once.
result: pass

### 12. Back to Dashboard Button
expected: HabitatHUD card includes a back-to-dashboard button/link. Clicking it navigates back to the main dashboard (/).
result: pass

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
