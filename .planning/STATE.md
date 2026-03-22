---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Mars Habitat Revamp
status: unknown
stopped_at: Completed 18-03-PLAN.md
last_updated: "2026-03-22T12:57:30.953Z"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** TV ambient dashboard where zone criticality drives visual hierarchy — most critical zone dominates the screen, judges see real data without touching anything.
**Current focus:** Phase 18 — zone-cards-static-grid

## Current Position

Phase: 18 (zone-cards-static-grid) — EXECUTING
Plan: 2 of 3

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 17 P01 | 156s | 1 tasks | 2 files |
| Phase 17 P02 | 3min | 1 tasks | 4 files |
| Phase 18 P01 | 12min | 2 tasks | 6 files |
| Phase 18 P02 | 4min | 2 tasks | 6 files |
| Phase 18 P03 | 5min | 1 tasks | 1 files |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full log.
Recent decisions affecting v4.0:

- v4.0 roadmap: Coarse granularity → 4 phases (17-20); ranking hook merged into scaffold phase to front-load architectural risk
- v4.0 research: FLIP animation is Phase 19 (after static grid validated), parallax is Phase 20 (cosmetic, ships last)
- v4.0 research: `motion@12.x` pinned (not `^12.x`) for React 19 concurrent stability
- [Phase 17]: Test object identity: each simulated tick provides new zones reference so useEffect dep fires — matches real Zustand behavior
- [Phase 17-02]: R3F events=null cast: `null as unknown as undefined` satisfies TypeScript while preserving null at runtime — raycaster disabled
- [Phase 17-02]: scoreZone duplicated locally in TvDashboardView (not exported from usePriorityRanking) — dev debug duplication acceptable, removed Phase 18
- [Phase 18-01]: biosimMapper ring buffer test loop fixed from 50 to 80 iterations to correctly exercise cap of 60
- [Phase 18-01]: StatusBar uses three separate useHabitatStore granular selectors matching PERF-02 pattern from ConnectionBadge
- [Phase 18-01]: TV constants extracted to src/components/tv/constants.ts; HabitatHUD and ConnectionBadge retain their own copies
- [Phase 18-02]: ZoneCard border tests use getAttribute('style') + regex — jsdom normalizes rgba() with spaces, making toHaveStyle() unreliable for border color assertions
- [Phase 18-02]: TvDashboardView fully delegates zone ranking to PriorityGrid and zone status to StatusBar — no direct store reads in the page component
- [Phase 18-02]: PriorityGrid has no zones subscription — only consumes rankedIds to avoid unnecessary re-renders on every sensor tick
- [Phase 18]: Sensor values display to 1 decimal (.toFixed(1)) — floating point precision beyond 1 decimal is noise on ambient TV display
- [Phase 18]: Sensor row: label stacked above value (left), sparkline+dot (right) — reduces horizontal eye travel on wide screens; mirrors instrument panel conventions
- [Phase 18]: Zone name minimum 16px bold #e2e5ed — 12px was unreadable at TV viewing distance; 16px is practical floor for 3m glanceable ambient displays

### Pending Todos

None.

### Blockers/Concerns

- Phase 19 (FLIP): BioSim Worker probe refactor scope unknown — inspect `biosimWorker.ts` message protocol before planning Phase 19.

## Session Continuity

Last session: 2026-03-22T12:51:35.452Z
Stopped at: Completed 18-03-PLAN.md
Resume file: None
