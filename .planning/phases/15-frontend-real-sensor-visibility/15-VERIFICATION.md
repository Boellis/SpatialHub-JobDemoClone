---
phase: 15-frontend-real-sensor-visibility
verified: 2026-03-20T18:45:00Z
status: gaps_found
score: 3/4 must-haves verified
gaps:
  - truth: "Phase 15 changes deployed to Firebase Hosting"
    status: failed
    reason: "Firebase cache references asset hashes from a pre-Phase-15 build (11:36 deploy). Current dist/ was built at 13:23 (after Phase 15 commits at 13:17/13:19) with correct biosim-real assets, but firebase deploy was never run against this build."
    artifacts:
      - path: "spatialhub-frontend/.firebase/hosting.ZGlzdA.cache"
        issue: "Cache lists HabitatView-rGy5ijsJ.js (pre-Phase-15). Current dist/ has HabitatView-BKzML4_z.js (Phase 15 build). Hashes differ — Firebase Hosting still serves the old build."
    missing:
      - "Run: cd spatialhub-frontend && npm run build && firebase deploy --only hosting"
human_verification:
  - test: "Open Firebase Hosting URL in browser — verify HUD badge shows teal 'BioSim + Real Sensor' when BioSim is connected and Pi is polling"
    expected: "Badge transitions from green 'BioSim Live' to teal 'BioSim + Real Sensor' within 10s of Pi data arriving"
    why_human: "Requires live BioSim + Pi hardware; automated checks confirm code is correct but cannot exercise the runtime badge state machine"
  - test: "In Water Recycling zone panel, verify the wr-ph sensor row shows LIVE badge and 'Hardware Sensor — Raspberry Pi' subtitle when Pi is sending data"
    expected: "Sensor row renders with teal dot pulse, LIVE badge chip, and subtitle — simultaneously with value display"
    why_human: "UI-01 visual rendering requires a browser with live Pi data flowing"
---

# Phase 15: Frontend Real Sensor Visibility — Verification Report

**Phase Goal:** The Water Recycling zone panel shows the real Pi pH value as a secondary annotation alongside the BioSim physics reading, and the HUD connection badge gains a fifth "Real Sensor" state that activates when Pi data is flowing — deployed to Firebase Hosting
**Verified:** 2026-03-20T18:45:00Z
**Status:** gaps_found — 1 gap blocking full goal achievement (Firebase deploy not run)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HUD badge shows 'BioSim + Real Sensor' in teal when BioSim connected AND Pi polled within 30s | VERIFIED | `ConnectionBadge.tsx` BADGE_CONFIG has `'biosim-real': { dot: '#00ffcc', label: 'BioSim + Real Sensor' }`; `useLiveSensors.ts` calls `setSimSource('biosim-real')` on successful poll when `simSource === 'biosim'` |
| 2 | Badge downgrades to 'BioSim Live' when Pi data stale (>30s) | VERIFIED | Staleness check at poll start AND in catch/empty-data branches; `setPiDataFresh(false)` + `setSimSource('biosim')` when `Date.now() - lastSuccessfulPollRef.current > STALE_THRESHOLD_MS` |
| 3 | All 4 existing badge states still render correctly (no regression) | VERIFIED | 100/100 tests pass across 8 test files; 8 existing badge tests confirmed in ConnectionBadge.test.tsx |
| 4 | Phase 15 changes deployed to Firebase Hosting | FAILED | Firebase cache from 11:36 deploy references pre-Phase-15 asset hashes. dist/ rebuilt at 13:23 with Phase 15 code was never deployed. |

**Score:** 3/4 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spatialhub-frontend/src/types/habitat.ts` | SimSource union with 5th value 'biosim-real' | VERIFIED | Line 71: `export type SimSource = 'connecting' \| 'biosim' \| 'biosim-real' \| 'fallback' \| 'disconnected'`; HabitatState interface has `piDataFresh: boolean` and `setPiDataFresh: (fresh: boolean) => void` |
| `spatialhub-frontend/src/store/habitatStore.ts` | piDataFresh boolean state and setPiDataFresh action | VERIFIED | Line 64: `piDataFresh: false`; line 68: `setPiDataFresh: (fresh: boolean) => set({ piDataFresh: fresh })`; line 386: `export const selectPiDataFresh`; setSimSource condition updated to `source !== 'biosim' && source !== 'biosim-real'` |
| `spatialhub-frontend/src/hooks/useLiveSensors.ts` | Freshness tracking and simSource upgrade logic | VERIFIED | `export const STALE_THRESHOLD_MS = 30_000`; `lastSuccessfulPollRef`; `setPiDataFresh(true)` + `setSimSource('biosim-real')` on success; downgrade logic in catch and empty-data branches; staleness check at poll start |
| `spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx` | 5th BADGE_CONFIG entry for biosim-real | VERIFIED | Line 50: `'biosim-real': { dot: '#00ffcc', label: 'BioSim + Real Sensor', textColor: '#00ffcc' }`; header comment lists all 5 states |
| `spatialhub-frontend/src/__tests__/ConnectionBadge.test.tsx` | Test for 5th badge state | VERIFIED | Tests at lines 84-97: renders "BioSim + Real Sensor" and dot color `rgb(0, 255, 204)` for `simSource: 'biosim-real'` |
| `spatialhub-frontend/src/__tests__/useLiveSensors.test.ts` | STALE_THRESHOLD_MS regression guard | VERIFIED | Line 33-37: `expect(STALE_THRESHOLD_MS).toBe(30_000)` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useLiveSensors.ts` | `habitatStore.ts` | `setPiDataFresh(true)` on successful poll | WIRED | Lines 136: `store.setPiDataFresh(true)` after `tick(readings)` call with `readings.length > 0` |
| `useLiveSensors.ts` | `habitatStore.ts` | `setSimSource('biosim-real')` when biosim connected AND piDataFresh | WIRED | Lines 137-139: `if (store.simSource === 'biosim') { store.setSimSource('biosim-real'); }` |
| `ConnectionBadge.tsx` | `habitatStore.ts` | `selectSimSource` reads 'biosim-real' and renders teal badge | WIRED | Line 60: `const simSource = useHabitatStore(selectSimSource)`; BADGE_CONFIG lookup at line 79 includes 'biosim-real' entry |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| UI-01 | 15-01-PLAN.md | Real Pi pH value visible in Water Recycling zone panel alongside BioSim data | SATISFIED (pre-existing) | `ZonePanel.tsx` line 371: `isLive={reading.source === 'live'}` triggers LIVE badge and "Hardware Sensor — Raspberry Pi" annotation. Confirmed pre-Phase-15 per CONTEXT.md scope reduction. Store tick() preserves live readings via `source === 'live'` guard at line 124. |
| UI-02 | 15-01-PLAN.md | HUD connection badge shows 5th "Real Sensor" state when Pi data is flowing | SATISFIED | `biosim-real` SimSource value, BADGE_CONFIG entry, freshness tracking in useLiveSensors, piDataFresh store state — all verified. 2 new tests pass. |

**Note on UI-01:** The success criterion says "displays both BioSim simulated pH and real Pi pH simultaneously." The CONTEXT.md and PLAN explicitly declare UI-01 as pre-existing: when source is 'live', the sensor row renders with the live Pi value, LIVE badge chip, and "Hardware Sensor — Raspberry Pi" subtitle. The store's tick() merge logic preserves live readings over BioSim readings for the same sensor slot — so the zone panel shows one value (Pi pH) with live annotation rather than two separate values side-by-side. This is the accepted design per phase context, not a gap.

---

## Anti-Patterns Found

No blocker or warning-level anti-patterns found across modified files.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

---

## Human Verification Required

### 1. Badge state machine runtime verification

**Test:** With BioSim connected (WS open) and Pi posting data to Cloud Run, wait 10s and observe HUD badge.
**Expected:** Badge transitions from green "BioSim Live" to teal "BioSim + Real Sensor".
**Why human:** Requires live BioSim WebSocket and real Pi data arriving at Cloud Run. Code path is fully wired but runtime behavior cannot be exercised programmatically.

### 2. Badge downgrade on Pi stale

**Test:** Disconnect Pi (or stop hub_client) and wait 30s with BioSim still connected.
**Expected:** Badge reverts to green "BioSim Live" within one poll cycle after the 30s stale window.
**Why human:** Requires live hardware; stale detection timing cannot be mocked without a full test harness.

### 3. UI-01 zone panel visual annotation

**Test:** Open Water Recycling zone panel with Pi sending pH data.
**Expected:** wr-ph sensor row shows teal pulsing dot, LIVE chip, "Hardware Sensor — Raspberry Pi" subtitle, and pH value in threshold color.
**Why human:** Visual rendering requires a browser session with live Pi data.

---

## Gaps Summary

One gap blocks complete goal achievement: **Firebase Hosting was not redeployed after Phase 15 changes.**

The code is fully correct — all artifacts verified, key links wired, 100 tests pass, TypeScript compiles clean, production build succeeds (built at 13:23 on 2026-03-20). However, the Firebase Hosting cache shows the last deploy occurred at 11:36, referencing pre-Phase-15 asset hashes (`HabitatView-rGy5ijsJ.js`). The current `dist/` contains the correct Phase 15 build (`HabitatView-BKzML4_z.js` with `biosim-real` in the minified output) but was never deployed.

**Fix:** One command closes this gap:
```bash
cd spatialhub-frontend && firebase deploy --only hosting
```

---

_Verified: 2026-03-20T18:45:00Z_
_Verifier: Claude (gsd-verifier)_
