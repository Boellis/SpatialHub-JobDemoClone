---
phase: 19-flip-animation-long-session-resilience
plan: 02
subsystem: ui
tags: [page-visibility-api, websocket, tab-recovery, resilience, vitest, useSimSource]

# Dependency graph
requires:
  - phase: 19-01
    provides: FLIP animation infrastructure (PriorityGrid LayoutGroup, ZoneCard motion children)
  - phase: 18-tv-dashboard-data-rendering
    provides: useSimSource hook with BioSim probe + Worker messaging

provides:
  - visibilitychange handler in useSimSource for instant BioSim probe on tab foreground
  - guard conditions: only fires when simSource === 'fallback' and !document.hidden
  - listener cleanup on hook unmount
  - 4 new tests covering all visibilitychange branches
  - visual verification: FLIP slides smoothly, no distortion, GPU geometries = 0, tab recovery < 5s

affects:
  - 20-parallax (long-session resilience confirmed, no GPU leaks, safe to add parallax)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "visibilitychange handler placed inside useEffect after probeTimerRef setup — shares mountedRef and simIdRef scope"
    - "Guard order: !document.hidden first (cheap), then simSource !== 'fallback' (Zustand read) — avoids store read on background events"
    - "Handler sends SYNC_HISTORY + CONNECT in sequence on successful probe — matches full reconnect path"

key-files:
  modified:
    - spatialhub-frontend/src/hooks/useSimSource.ts
    - spatialhub-frontend/src/__tests__/useSimSource.test.ts

key-decisions:
  - "visibilitychange handler only fires when simSource === 'fallback' — prevents duplicate CONNECT messages when already on BioSim"
  - "Handler placed after probeTimerRef setup (line ~255) so it shares the same closure refs without additional wiring"
  - "Deferred idea: hero card richer animated chart using empty center space — not in scope for Phase 19"

patterns-established:
  - "Tab recovery pattern: addEventListener in useEffect, removeEventListener in cleanup, guard on document.hidden + store state"

requirements-completed: [LAYOUT-04]

# Metrics
duration: ~2min
completed: 2026-03-22
---

# Phase 19 Plan 02: visibilitychange Handler + Visual Verification Summary

**Page Visibility API handler wired into useSimSource so backgrounded TV kiosk sessions probe BioSim immediately on tab foreground instead of waiting up to 60s for the throttled interval; FLIP animations and GPU stability visually verified**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-22
- **Completed:** 2026-03-22
- **Tasks:** 2 (1 code, 1 visual checkpoint)
- **Files modified:** 2

## Accomplishments

- useSimSource now listens for `visibilitychange` events — when the tab comes back to foreground while in `fallback` state, it probes BioSim immediately instead of waiting up to 60s for the next throttled interval tick
- Guard conditions prevent noise: `document.hidden` check skips background transitions, `simSource !== 'fallback'` check skips when already connected to BioSim
- Listener removed on unmount via cleanup return — no event listener leak after hook unmounts
- 4 new tests cover all branches: probe on foreground+fallback, no-op when biosim, no-op on background, cleanup removes listener
- Visual checkpoint approved: FLIP cards slide smoothly with size change over 500ms, no content distortion, GPU geometries = 0, tab recovery < 5s

## Task Commits

1. **Task 1: Add visibilitychange handler to useSimSource + update tests** - `de9ae82` (feat)
2. **Task 2: Visual verification checkpoint** - no code commit (verification only, user-approved)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `spatialhub-frontend/src/hooks/useSimSource.ts` - visibilitychange handler added; cleanup removes listener
- `spatialhub-frontend/src/__tests__/useSimSource.test.ts` - 4 new visibilitychange tests

## Decisions Made

- Handler guards on `simSource !== 'fallback'` first principle — the only state where a probe makes sense; `connecting` and `biosim` are already working, `disconnected` has no worker to send CONNECT to
- Deferred idea captured: hero card should use its empty center space for a richer animated chart — not in scope for Phase 19, deferred to a future phase

## Deviations from Plan

None — plan executed exactly as written. Task 2 was a visual checkpoint with no code changes; user approved on first pass.

## Deferred Items

**Hero card animated chart (deferred idea from visual verification):**
The empty center space in the hero card was noted as an opportunity for a richer animated chart. Deferred to a future phase — not in scope for Phase 19.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 19 complete — FLIP animation + long-session resilience both verified
- GPU geometry count confirmed at 0 — Phase 20 parallax can add R3F Canvas effects without baseline contamination
- Tab recovery confirmed working — TV kiosk sessions will reconnect within 5s after OS screensaver backgrounds the tab

---
*Phase: 19-flip-animation-long-session-resilience*
*Completed: 2026-03-22*
