---
phase: 19-flip-animation-long-session-resilience
verified: 2026-03-22T15:30:00Z
status: human_needed
score: 5/5 automated must-haves verified
human_verification:
  - test: "FLIP animation visual check — cards slide to new positions on reorder"
    expected: "Zone cards animate smoothly to new grid positions over ~500ms easeOut; promoted card grows from secondary to hero size during slide, not after; text, sparklines, and status dots do not stretch or distort; content stays live during animation"
    why_human: "jsdom cannot render CSS layout transitions or motion library FLIP interpolation; structural wiring verified in tests but visual correctness requires a real browser"
  - test: "Tab backgrounding recovery check"
    expected: "After switching away for 30+ seconds and returning, the connection badge recovers within 5 seconds (not 60s)"
    why_human: "visibilitychange handler wiring and guard logic verified in tests; actual browser tab throttling behavior requires a live browser session"
  - test: "GPU memory stability check"
    expected: "After 2+ minutes of continuous running, renderer.info.memory.geometries stays at 0 in the browser console"
    why_human: "Three.js geometry leak detection requires a running R3F Canvas in a real browser; cannot be verified in jsdom or static analysis"
---

# Phase 19: Flip Animation + Long-Session Resilience Verification Report

**Phase Goal:** Zone cards animate into new grid positions when criticality ranking changes, and the dashboard runs without degradation over 8+ hour TV sessions
**Verified:** 2026-03-22T15:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When rankedIds order changes, zone cards slide smoothly to new grid positions (not instant snap) | ? HUMAN | LayoutGroup + motion.div with layoutId and layout prop confirmed in PriorityGrid.tsx; FLIP_TRANSITION={duration:0.5, ease:'easeOut'} confirmed; visual behavior requires browser |
| 2 | Card content (text, sparkline, status dot) does not distort or scale incorrectly during reorder animation | ? HUMAN | motion.div/motion.span with layout prop on all direct ZoneCard children confirmed; structural correctness verified in ZoneCard.test.tsx; visual correctness requires browser |
| 3 | Hero-to-secondary and secondary-to-hero transitions animate both position and size over 500ms ease-out | ? HUMAN | `layout` (full, not `layout="position"`) on all motion.div wrappers confirmed; FLIP_TRANSITION const confirmed; runtime interpolation requires browser |
| 4 | After the browser tab is backgrounded and re-foregrounded, the dashboard reconnects to BioSim within 5 seconds | ? HUMAN | visibilitychange handler wiring confirmed in useSimSource.ts (lines 258-273); all 4 branch tests pass; actual reconnect timing requires browser with real BioSim |
| 5 | After 10 minutes of continuous running in production build, renderer.info.memory.geometries is flat (zero) | ? HUMAN | R3F Canvas is empty (no 3D geometry added in Phase 19); baseline was confirmed during visual checkpoint per 19-02-SUMMARY.md; requires live browser session to reconfirm |

**Score:** 5/5 truths structurally verified; all 3 require human visual/runtime confirmation

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spatialhub-frontend/package.json` | motion@12.38.0 pinned, no caret | VERIFIED | `"motion": "12.38.0"` — exact match, no caret prefix |
| `spatialhub-frontend/src/components/tv/PriorityGrid.tsx` | LayoutGroup + motion.div with layoutId for FLIP | VERIFIED | Imports from `motion/react`; LayoutGroup wraps grid div; motion.div per slot with `layoutId={zone-${id}}`, `layout`, `transition={FLIP_TRANSITION}` |
| `spatialhub-frontend/src/components/tv/ZoneCard.tsx` | motion.div/motion.span children with layout prop | VERIFIED | Imports from `motion/react`; outer container stays plain div; header row, zone-name span, status badge, sensor rows, left/right groups all use motion.div/motion.span with layout |
| `spatialhub-frontend/src/hooks/useSimSource.ts` | visibilitychange event handler for probe recovery | VERIFIED | handleVisibilityChange defined at line 258; addEventListener at line 273; removeEventListener in cleanup at line 324; guards: !document.hidden + simSource !== 'fallback' |
| `spatialhub-frontend/src/__tests__/useSimSource.test.ts` | 4 visibilitychange tests | VERIFIED | describe('visibilitychange recovery') at line 405 with 4 tests: foreground+fallback probe, no-op on biosim, no-op on background, cleanup removes listener |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| PriorityGrid.tsx | motion/react | `import { motion, LayoutGroup }` | WIRED | Line 9: `import { motion, LayoutGroup } from 'motion/react'` |
| PriorityGrid.tsx | ZoneCard via motion.div | `layoutId={zone-${id}}` | WIRED | Lines 35, 45: `layoutId={\`zone-${...}\`}` — zoneId-based, not index-based |
| ZoneCard.tsx | motion/react | `import { motion }` | WIRED | Line 12: `import { motion } from 'motion/react'` |
| useSimSource.ts | document.addEventListener('visibilitychange') | Page Visibility API | WIRED | Line 273: `document.addEventListener('visibilitychange', handleVisibilityChange)` |
| useSimSource.ts visibilitychange handler | probeBioSim() | immediate probe on tab foreground when simSource=fallback | WIRED | Lines 259, 262-263: guards `document.hidden` then `simSource !== 'fallback'`, then `void probeBioSim().then(...)` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LAYOUT-04 | 19-01-PLAN.md, 19-02-PLAN.md | Zones animate into ranked positions via FLIP when criticality threshold crossings occur (10s debounce) | SATISFIED (pending visual human confirm) | PriorityGrid FLIP wiring complete; LayoutGroup + motion.div + layoutId + layout confirmed; tests verify structural correctness; visual animation behavior flagged for human |

No orphaned requirements found — LAYOUT-04 is the only ID mapped to Phase 19 in REQUIREMENTS.md, and both plans claim it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| PriorityGrid.tsx | 28 | `return null` | Info | Legitimate guard: renders nothing when rankedIds is empty — correct behavior |
| ZoneCard.tsx | 80 | `return null` | Info | Legitimate guard: renders nothing when zone data not in store — correct behavior |
| ZoneCard.tsx | 143 | `return null` | Info | Legitimate guard: skips sensor row when reading is missing — correct behavior |

No blockers or warnings. All `return null` instances are defensive guards, not stubs.

### Human Verification Required

#### 1. FLIP Animation Visual Check

**Test:** Start `npm run dev`, navigate to `http://localhost:5173/tv`. Open DevTools Console and paste:
```javascript
const store = window.__habitatStore;
if (store) {
  const zones = store.getState().zones;
  const zoneId = 'power-thermal';
  const zone = zones[zoneId];
  if (zone) {
    const newSensors = {};
    for (const [sid, reading] of Object.entries(zone.sensors)) {
      newSensors[sid] = { ...reading, status: 'red' };
    }
    store.setState({ zones: { ...zones, [zoneId]: { ...zone, status: 'red', sensors: newSensors } } });
  }
}
```
**Expected:** Cards SLIDE smoothly to new positions over ~500ms. Promoted card GROWS during the slide. Text, sparklines, and status dots do not stretch or warp. Sensor values continue updating during the 500ms transition.
**Why human:** jsdom cannot execute CSS layout transitions or motion library FLIP interpolation. The structural wiring (layoutId, layout, LayoutGroup) is confirmed; whether it produces visually correct output requires a real browser renderer.

#### 2. Tab Backgrounding Recovery Check

**Test:** With the TV dashboard running, switch to a different browser tab for 30+ seconds, then switch back.
**Expected:** The connection badge recovers to BioSim (or confirms fallback) within 5 seconds — not waiting 60s for the throttled interval.
**Why human:** The visibilitychange handler code and its 4 branch tests are verified. Actual browser tab throttling behavior and the resulting timing of recovery cannot be validated without a live Chromium tab being backgrounded and foregrounded.

#### 3. GPU Memory Stability Check

**Test:** Open DevTools Performance tab with Memory checkbox enabled. Let the dashboard run for 2+ minutes. In Console: `document.querySelector('canvas')?.__r3f?.store?.getState()?.gl?.info?.memory`
**Expected:** `geometries` stays at 0 throughout. No upward memory trend in the Performance tab.
**Why human:** Three.js geometry leak detection requires a running R3F Canvas in a real browser. The R3F Canvas is empty in Phase 19 (no 3D geometry added), and the 19-02-SUMMARY documents this as user-approved during visual checkpoint. Reconfirmation requires a live browser session.

### Gaps Summary

No gaps. All automated must-haves are fully verified:
- motion@12.38.0 installed and pinned
- PriorityGrid FLIP wiring is complete and substantive
- ZoneCard distortion correction wiring is complete and substantive
- useSimSource visibilitychange handler is complete and wired
- All 154 tests pass (13 test files)
- 3 documented commit hashes (be08876, 24fbaae, de9ae82) confirmed in git history
- LAYOUT-04 is marked Complete in REQUIREMENTS.md

Phase status is `human_needed` solely because animation correctness, tab recovery timing, and GPU memory stability are by nature runtime/visual properties that cannot be verified by static analysis or jsdom tests.

---

_Verified: 2026-03-22T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
