---
phase: 05-docker-infrastructure
plan: 02
subsystem: ui
tags: [react, typescript, vite, navigation, open-mct]

# Dependency graph
requires: []
provides:
  - Open MCT external nav link in SpatialHub frontend nav bar
  - .nav-link--external CSS class with cyan accent styling
affects: [05-docker-infrastructure]

# Tech tracking
tech-stack:
  added: []
  patterns: [plain <a> tag for external nav links instead of React Router NavLink]

key-files:
  created: []
  modified:
    - spatialhub-frontend/src/App.tsx
    - spatialhub-frontend/src/index.css

key-decisions:
  - "Used plain <a> tag not NavLink for external URL — React Router's NavLink can't handle external hrefs correctly"
  - "Styled with --accent-cyan to differentiate from green Mars Habitat link and white internal nav links"
  - "No conditional rendering — link always visible regardless of Docker availability"

patterns-established:
  - "External nav links: plain <a> tag with target=_blank + rel=noopener noreferrer + nav-link--external class"
  - "External link indicator: inline SVG arrow-out-of-box icon at 12x12, opacity 0.5, margin-left 4px"

requirements-completed: [OBS-01]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 5 Plan 02: Open MCT Nav Link Summary

**External Open MCT nav link added to SpatialHub frontend with cyan accent styling and inline SVG external-link icon**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T04:10:27Z
- **Completed:** 2026-03-15T04:12:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Open MCT link appears in nav bar after Mars Habitat on all non-habitat pages
- Plain `<a>` tag with `target="_blank"` and `rel="noopener noreferrer"` opens localhost:9091 in new tab
- Inline SVG external-link icon (12x12 arrow-out-of-box) distinguishes it from internal routes
- `.nav-link--external` class styled with `--accent-cyan` and subtle hover background tint
- TypeScript compiles clean; Vite production build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Open MCT external nav link to App.tsx** - `039cd7e` (feat)
2. **Task 2: Add .nav-link--external styling to index.css** - `8dfe5b8` (feat)

**Plan metadata:** (docs commit, see final_commit step)

## Files Created/Modified

- `spatialhub-frontend/src/App.tsx` - Added `<a>` tag with SVG icon after Mars Habitat NavLink in nav-links div
- `spatialhub-frontend/src/index.css` - Added `.nav-link--external` and `.nav-link--external:hover` rules after `.nav-link--habitat.active::after`

## Decisions Made

- Used plain `<a>` tag instead of React Router `NavLink` — NavLink is for internal routes; external URLs need a real anchor tag
- Styled with `--accent-cyan` to create a three-way visual distinction: white (internal), green (Mars Habitat), cyan (external/observability)
- No active/hover underline indicator added — the link opens a new tab so the current page never changes to an "active" state

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. TypeScript clean, build clean. The pre-existing chunk size warning on HabitatView (1MB) is unrelated to this plan.

## User Setup Required

None — no external service configuration required. Open MCT link will 404 until `docker compose up` brings the stack online, which is expected behavior.

## Next Phase Readiness

- OBS-01 requirement satisfied: Open MCT link is accessible from the nav bar
- Next plans in Phase 5 cover docker-compose configuration and BioSim integration
- No blockers from this plan

---
*Phase: 05-docker-infrastructure*
*Completed: 2026-03-15*
