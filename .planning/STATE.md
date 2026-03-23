---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Mars Habitat Revamp
status: unknown
stopped_at: Completed 21-01-PLAN.md — Phase 21 complete, v4.0 milestone done
last_updated: "2026-03-23T00:16:18.453Z"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 9
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** TV ambient dashboard where zone criticality drives visual hierarchy — most critical zone dominates the screen, judges see real data without touching anything.
**Current focus:** Phase 21 — hero-card-chart-digital-counter

## Current Position

Phase: 21 (hero-card-chart-digital-counter) — EXECUTING
Plan: 1 of 1

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
| Phase 19 P01 | 223s | 2 tasks | 5 files |
| Phase 19 P02 | 2min | 2 tasks | 2 files |
| Phase 20-parallax-polish P01 | 2min | 2 tasks | 4 files |
| Phase 21 P01 | 4min | 2 tasks | 4 files |
| Phase 21 P01 | 20min | 3 tasks | 4 files |

## Accumulated Context

### Roadmap Evolution

- Phase 21 added: Hero Card Chart + Digital Counter

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
- [Phase 19]: layout (full) not layout=position on motion.div wrappers — hero/secondary size change must animate, not snap
- [Phase 19]: LayoutGroup scoped to PriorityGrid only — placing it in TvDashboardView would contaminate cross-tree motion elements
- [Phase 19]: ZoneCard style prop removed — positioning on motion.div wrapper in PriorityGrid for correct FLIP behavior
- [Phase 19]: visibilitychange handler only fires when simSource === 'fallback' — prevents duplicate CONNECT when already on BioSim
- [Phase 19]: Deferred: hero card animated chart in empty center space — not in scope for Phase 19
- [Phase 20-parallax-polish]: InstancedMesh with single shared SphereGeometry (6 segments) and MeshBasicMaterial for 80-particle parallax system — GPU-efficient, auto-disposed by R3F declarative JSX
- [Phase 20-parallax-polish]: [Phase 20]: instanceColor seeded in first useFrame frame to avoid R3F mount timing issues; dummy Object3D pattern for zero-allocation matrix updates
- [Phase 21]: AreaChart uses CSS transition on SVG path d attribute recalculation — zero JS animation loop overhead
- [Phase 21]: Primary sensor for hero area chart = worst-status sensor (red>yellow>green) — most dramatic telemetry at a glance
- [Phase 21]: DigitRoll per-digit @keyframes animation with 30ms stagger — unchanged digits stay static
- [Phase 21]: Hero card flexbox height constrained via height:100% + boxSizing:border-box; area chart uses flex:1 1 0 + minHeight:0 to prevent viewport overflow

### Pending Todos

None.

### Blockers/Concerns

- Phase 19 (FLIP): BioSim Worker probe refactor scope unknown — inspect `biosimWorker.ts` message protocol before planning Phase 19.

## Session Continuity

Last session: 2026-03-23T00:16:18.448Z
Stopped at: Completed 21-01-PLAN.md — Phase 21 complete, v4.0 milestone done
Resume file: None
