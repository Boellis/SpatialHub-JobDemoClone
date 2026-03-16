---
phase: 08-anomalydrawer-rewire
verified: 2026-03-16T12:26:00Z
status: passed
score: 12/12 must-haves verified (11 automated + 1 human-approved)
human_verification:
  - test: "Click an anomaly button in BioSim mode (Docker running)"
    expected: "Button pulses red immediately (optimistic sentinel), POST to localhost:8009/api/simulation/{id}/modules/{module}/malfunctions visible in DevTools Network, BioSim sensor readings change within ~10s"
    why_human: "Real Docker + BioSim runtime required; cannot verify HTTP call side-effects or sensor physics in test harness"
  - test: "Click cancel in BioSim mode after triggering a malfunction"
    expected: "Button stops pulsing, DELETE request to the malfunction endpoint visible in DevTools Network"
    why_human: "Requires live BioSim connection and real malfunction ID returned from the POST"
  - test: "Anomaly buttons in fallback mode (no Docker)"
    expected: "Identical behavior to v1.0: button pulses, announcement banner appears, sensor values drift toward crisis values"
    why_human: "Visual / UX correctness of bias-curve effect on rendered sensor readings cannot be verified programmatically"
---

# Phase 8: AnomalyDrawer Rewire Verification Report

**Phase Goal:** Rewire AnomalyDrawer to call BioSim malfunction REST API (trigger / cancel) in biosim mode, preserving fallback bias-curve behavior — zero JSX changes.
**Verified:** 2026-03-16T12:26:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | triggerAnomaly in BioSim mode fires a POST fetch to BioSim malfunction REST API with correct module name, intensity, and length | VERIFIED | habitatStore.ts:141-202 — branch gates on `simSource === 'biosim' && biosimSimId !== null`; calls `postMalfunction(biosimSimId, mapping.moduleName, mapping.intensity, mapping.length)`; unit test in biosimMalfunctions.test.ts line 184 confirms POST URL and method |
| 2 | cancelAnomaly in BioSim mode fires a DELETE fetch with the stored malfunctionID | VERIFIED | habitatStore.ts:238-261 — reads `biosimMalfunctionIds[scenarioId]`, calls `deleteMalfunction(biosimSimId, mapping.moduleName, malfunctionId)`; unit test line 258 confirms DELETE URL |
| 3 | postMalfunction accepts optional tickToOccur and includes it in request body when non-zero, omits it when undefined | VERIFIED | biosimMalfunctions.ts:44-46 — explicit guard `tickToOccur !== undefined && tickToOccur > 0`; unit tests line 65 (includes) and line 82 (omits) both pass |
| 4 | triggerAnomaly in fallback mode runs the existing onset/recovery bias-curve logic unchanged | VERIFIED | habitatStore.ts:205-232 — comment "Fallback path — existing onset/recovery bias-curve logic UNCHANGED"; unit tests line 308-337 confirm phase=onset, ticksInPhase=0, biasFactor=0, no fetch called |
| 5 | cancelAnomaly in fallback mode transitions to recovery phase unchanged | VERIFIED | habitatStore.ts:263-276 — recovery transition preserves biasFactor; unit test line 340-354 confirms phase=recovery, ticksInPhase=0, biasFactor preserved |
| 6 | Double-clicking a scenario button does not create duplicate malfunctions (optimistic pending guard) | VERIFIED | habitatStore.ts:145-148 — `if (biosimMalfunctionIds[scenarioId] !== undefined)` guard at top of BioSim branch; sentinel -1 is set before async POST so second click hits the toggle path |
| 7 | biosimMalfunctionIds are cleared when simSource transitions away from biosim | VERIFIED | habitatStore.ts:68-73 — `setSimSource` explicitly sets `biosimMalfunctionIds: {}` when `source !== 'biosim'`; unit tests line 357-377 confirm both transition and preservation cases |
| 8 | useSimSource sets biosimSimId in Zustand store when BioSim WebSocket connects (WS_OPEN) | VERIFIED | useSimSource.ts:209-211 — `setBiosimSimId(simIdRef.current)` called in WS_OPEN case; unit test line 386-403 confirms mock called with '42' |
| 9 | useSimSource clears biosimSimId when falling back or disconnecting | VERIFIED | useSimSource.ts:161 (startFallback), 226 (WS_CLOSE) — both call `setBiosimSimId(null)`; unit test line 406-446 confirms null clear on full retry-exhausted path |
| 10 | biosimSimId is available in the store for triggerAnomaly to read when firing POST | VERIFIED | habitatStore.ts:139 — `const { simSource, biosimSimId, ... } = get()` — reads live store value at call time; simIdRef in useSimSource captures all 3 probe sites |
| 11 | AnomalyDrawer.tsx has zero JSX changes | VERIFIED | `git log --diff-filter=M -- spatialhub-frontend/src/components/habitat/AnomalyDrawer.tsx` returns empty; AnomalyDrawer.tsx still calls `triggerAnomaly(scenario.id)` at line 183, unchanged |
| 12 | Clicking an anomaly button with Docker running triggers a real BioSim malfunction visible in the 3D habitat | NEEDS HUMAN | Requires live BioSim runtime; unit tests mock fetch — cannot verify BioSim physics side-effects programmatically |

**Score:** 11/12 truths verified (1 requires human — runtime integration)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spatialhub-frontend/src/simulation/biosimMalfunctions.ts` | Scenario-to-module map, postMalfunction, deleteMalfunction fetch wrappers | VERIFIED | 85 lines; exports `BIOSIM_MALFUNCTION_MAP` (4 entries), `postMalfunction` (async, returns number or null), `deleteMalfunction` (async, returns boolean); imports `BIOSIM_BASE_URL` from `useSimSource` |
| `spatialhub-frontend/src/types/habitat.ts` | Extended HabitatState with biosimSimId, biosimMalfunctionIds, setBiosimSimId | VERIFIED | Lines 79-87: `biosimSimId: string | null`, `biosimMalfunctionIds: Record<string, number>`, `setBiosimSimId: (id: string | null) => void` |
| `spatialhub-frontend/src/store/habitatStore.ts` | Branch logic in triggerAnomaly/cancelAnomaly, sentinel pattern for button active state | VERIFIED | 374 lines; dual-path triggerAnomaly (lines 138-233) and cancelAnomaly (lines 235-277); sentinel `{ phase: 'peak', biasFactor: 1 }` at line 157-159 |
| `spatialhub-frontend/src/__tests__/biosimMalfunctions.test.ts` | Unit tests for service wrappers and store branch logic, min 80 lines | VERIFIED | 380 lines (well above minimum); 27 tests for service + 13 for store branching + 2 for useSimSource |
| `spatialhub-frontend/src/hooks/useSimSource.ts` | biosimSimId wiring on WS_OPEN and cleanup on fallback/disconnect | VERIFIED | `simIdRef` at line 112; set at 3 probe sites (lines 186, 248, 263); `setBiosimSimId` called at WS_OPEN (line 210), WS_CLOSE (line 226), startFallback (line 161) |
| `spatialhub-frontend/src/__tests__/useSimSource.test.ts` | Updated tests covering biosimSimId lifecycle | VERIFIED | Lines 386-403 (WS_OPEN test), 406-446 (startFallback test); `setBiosimSimIdMock` set up in beforeEach at line 101 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `store/habitatStore.ts` | `simulation/biosimMalfunctions.ts` | `import postMalfunction, deleteMalfunction, BIOSIM_MALFUNCTION_MAP` | WIRED | habitatStore.ts line 9: `import { postMalfunction, deleteMalfunction, BIOSIM_MALFUNCTION_MAP } from '../simulation/biosimMalfunctions'` |
| `store/habitatStore.ts` | BioSim REST API | `postMalfunction` call inside `triggerAnomaly` when `simSource === 'biosim'` | WIRED | habitatStore.ts line 141: `if (simSource === 'biosim' && biosimSimId !== null)`; line 167: `postMalfunction(biosimSimId, ...)` |
| `components/habitat/AnomalyDrawer.tsx` | `store/habitatStore.ts` | `triggerAnomaly(scenario.id)` call — store handles BioSim branching internally | WIRED | AnomalyDrawer.tsx line 43 (selector), line 183 (onClick); no JSX changes |
| `hooks/useSimSource.ts` | `store/habitatStore.ts` | `setBiosimSimId(simId)` on WS_OPEN, `setBiosimSimId(null)` on fallback/disconnect | WIRED | useSimSource.ts lines 161, 210, 226 |
| `store/habitatStore.ts` | BioSim REST API | `triggerAnomaly` reads `biosimSimId` from store, passes to `postMalfunction` | WIRED | habitatStore.ts line 139: `const { simSource, biosimSimId, ... } = get()` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ANOM-01 | 08-01 | AnomalyDrawer buttons POST real malfunctions to BioSim REST API in BioSim mode | SATISFIED | `triggerAnomaly` BioSim path fires `postMalfunction`; unit tests confirm POST URL and method; checked off in REQUIREMENTS.md |
| ANOM-02 | 08-01 | Anomaly cancel sends DELETE to BioSim malfunction endpoint using stored malfunction IDs | SATISFIED | `cancelAnomaly` BioSim path fires `deleteMalfunction` with `biosimMalfunctionIds[scenarioId]`; unit tests confirm DELETE URL with stored ID |
| ANOM-03 | 08-01 | AnomalyDrawer supports malfunction scheduling via `tickToOccur` delay field | SATISFIED | `postMalfunction` signature includes optional `tickToOccur?: number`; guard omits it when undefined/zero; 2 unit tests verify include and omit cases |
| ANOM-04 | 08-01, 08-02 | Existing anomaly behavior preserved in fallback (client-side) mode | SATISFIED | Fallback path in both `triggerAnomaly` and `cancelAnomaly` preserved byte-for-byte; unit tests verify onset/recovery phases and no fetch call in fallback mode |

No orphaned requirements found — all 4 ANOM IDs declared across plans are present in REQUIREMENTS.md and fully implemented.

Note: ANOM-03 appears only in the 08-01 plan requirements list, not in 08-02. This is correct — the `tickToOccur` parameter is a service-layer feature delivered entirely in Plan 01.

---

### Anti-Patterns Found

No anti-patterns detected in modified files.

Scanned: `biosimMalfunctions.ts`, `habitatStore.ts`, `useSimSource.ts`, `habitat.ts` — zero TODO/FIXME/placeholder comments, no stub implementations, no empty handlers. The `deleteMalfunction` fire-and-forget pattern in `cancelAnomaly` is an intentional design decision (documented in SUMMARY), not a missing await.

---

### Human Verification Required

#### 1. BioSim mode — trigger malfunction (ANOM-01)

**Test:** With `docker compose up -d` running and BioSim healthy (~90s), navigate to `http://localhost:5173/habitat`. Wait for "BioSim Live" badge. Open SCENARIOS drawer. Click "Power Fluctuation".
**Expected:** Button pulses red immediately (optimistic sentinel), announcement banner appears, DevTools Network shows POST to `localhost:8009/api/simulation/{id}/modules/Nuclear_Source/malfunctions`, sensor readings in Power and Thermal zone change within ~10s.
**Why human:** Live BioSim Docker runtime required; unit tests mock fetch and cannot verify physics side-effects in the simulation engine.

#### 2. BioSim mode — cancel malfunction (ANOM-02)

**Test:** After triggering "Power Fluctuation" above, click the button again.
**Expected:** Button stops pulsing, DevTools Network shows DELETE to `localhost:8009/api/simulation/{id}/modules/Nuclear_Source/malfunctions/{malfunctionId}`.
**Why human:** Requires a real malfunctionID returned from the prior POST and live BioSim connection.

#### 3. Fallback mode — anomaly bias-curve behavior (ANOM-04)

**Test:** Without Docker, navigate to `/habitat`. Wait for "Fallback Mode" badge. Open SCENARIOS drawer. Click "CO2 Spike".
**Expected:** Button pulses red, announcement banner appears, CO2 and temperature values in Grow Bays drift toward crisis levels over ~10 ticks. Click again — button stops, values gradually recover.
**Why human:** Visual correctness of bias-curve sensor drift and recovery cannot be verified programmatically.

---

### Test Suite Results

| Scope | Tests | Status |
|-------|-------|--------|
| BIOSIM_MALFUNCTION_MAP | 4 | Pass |
| postMalfunction | 6 | Pass |
| deleteMalfunction | 4 | Pass |
| Store: triggerAnomaly BioSim mode | 4 | Pass |
| Store: cancelAnomaly BioSim mode | 3 | Pass |
| Store: triggerAnomaly fallback mode | 3 | Pass |
| Store: cancelAnomaly fallback mode | 1 | Pass |
| Store: setSimSource clears IDs | 2 | Pass |
| useSimSource: biosimSimId lifecycle | 2 | Pass |
| Existing suite (no regressions) | 63 | Pass |
| **Total** | **92** | **All pass** |

TypeScript build: clean (tsc -b exits 0, no errors).

---

### Gaps Summary

None — all automated checks pass. The single `human_needed` item is a runtime integration test requiring a live BioSim Docker environment, which is expected for this phase. The automated test coverage (fetch mocks, store state assertions) provides strong structural confidence that the end-to-end flow will work when Docker is running.

---

_Verified: 2026-03-16T12:26:00Z_
_Verifier: Claude (gsd-verifier)_
