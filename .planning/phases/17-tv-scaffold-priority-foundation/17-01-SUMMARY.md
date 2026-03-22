---
phase: 17-tv-scaffold-priority-foundation
plan: "01"
subsystem: frontend-hooks
tags: [tdd, ranking, zustand, vitest, react-hooks]
dependency_graph:
  requires: []
  provides: [usePriorityRanking]
  affects: [spatialhub-frontend/src/hooks/usePriorityRanking.ts]
tech_stack:
  added: []
  patterns: [zustand-selector, useRef-debounce, renderHook-testing]
key_files:
  created:
    - spatialhub-frontend/src/hooks/usePriorityRanking.ts
    - spatialhub-frontend/src/__tests__/usePriorityRanking.test.ts
  modified: []
decisions:
  - "Test object identity: each simulated tick provides a new zones reference so useEffect [zones] dep fires — matches real Zustand behavior where every tick() call produces a new zones object"
  - "Debounce init: candidateRef starts at ticks:0, mount effect fires and sets ticks:1 for all-green baseline, then new candidate resets to ticks:1 cleanly"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-03-22"
  tasks_completed: 1
  files_changed: 2
---

# Phase 17 Plan 01: usePriorityRanking Hook Summary

**One-liner:** Priority ranking hook with `(red*10)+(yellow*3)` scoring, alphabetical tie-breaking, and 3-tick stability debounce via `useRef`.

## What Was Built

`usePriorityRanking` — the algorithmic core of Phase 17's TV dashboard. Subscribes to `useHabitatStore(s => s.zones)`, scores each zone by sensor criticality, sorts descending, and requires 3 consecutive ticks of a stable ranking before committing it to React state. Prevents spurious re-renders via `arraysEqual` guard in `setCommitted`.

## Task Breakdown

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | TDD — usePriorityRanking hook (RED-GREEN-REFACTOR) | 4a97cc9 | Done |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test object reference identity for useEffect dependency**
- **Found during:** Task 1 (GREEN phase, test 7 failed)
- **Issue:** Tests 5–8 reused the same `zones` object reference across `rerender()` calls. Since `useEffect` depends on `[zones]`, React's equality check skips the effect when the reference is unchanged — test 7 expected a commit after 3 rerenders but the effect never fired for rerenders 2 and 3.
- **Fix:** Each simulated tick creates a fresh `makeZones(...)` object. This mirrors real Zustand behavior: the store's `tick()` action always produces a new `zones` object reference.
- **Files modified:** `spatialhub-frontend/src/__tests__/usePriorityRanking.test.ts`
- **Commit:** 4a97cc9 (incorporated in same commit)

## Verification

- `npx vitest run src/__tests__/usePriorityRanking.test.ts` — 9/9 tests pass
- `npx vitest run` — 109/109 tests pass (0 regressions)
- Hook exports `usePriorityRanking` as named export
- `REORDER_STABILITY_TICKS = 3` constant at module scope
- Scoring formula `(red * 10) + (yellow * 3)` confirmed by test 3
- Tie-breaking via `a.zoneId.localeCompare(b.zoneId)` confirmed by test 4
- Immediate initial render confirmed by test 9

## Self-Check: PASSED

- FOUND: spatialhub-frontend/src/hooks/usePriorityRanking.ts
- FOUND: spatialhub-frontend/src/__tests__/usePriorityRanking.test.ts
- FOUND: commit 4a97cc9
