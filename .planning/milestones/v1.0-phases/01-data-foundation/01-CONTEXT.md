# Phase 1: Data Foundation - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend API extensions (minimal zone list endpoint), fix the double `/api/api/` path bug, TypeScript type definitions, Zustand store skeleton, and a browser-side simulation engine producing realistic Mars habitat telemetry. Verifiable without any UI — console/DevTools only.

</domain>

<decisions>
## Implementation Decisions

### Simulation Realism
- Realistic drift with noise and gradual fluctuations — not simple random values
- Light correlation between sensors in the same zone (e.g., temp rises → humidity drifts down)
- Sensors are independent across zones — no cross-zone physics
- Subtle compressed sol cycle (~10 minutes) affecting solar input and temperature drift
- Normal operation should occasionally drift sensors into yellow thresholds — creates tension without anomalies

### Sensor Density
- 3 sensors per zone (trimmed from research's 4-5 per zone)
- Claude picks the 3 most visually interesting/meaningful per zone based on Mars context
- Total: 12 sensors across 4 zones

### Demo Independence
- Zone/sensor configuration hardcoded in TypeScript constants — frontend runs standalone
- Django serves a minimal zone list endpoint (GET /api/habitat/zones/) — fetched on habitat page mount to show API integration
- Simulation engine, thresholds, and all real-time logic run entirely client-side (browser setInterval + Zustand)
- No WebSocket, no Django Channels, no polluting real database with simulated data

### Threshold Behavior
- Three-state status: green (nominal), yellow (caution), red (critical)
- Symmetric thresholds per sensor — both high and low warnings where appropriate (e.g., temperature too cold AND too hot)
- Zone status = worst sensor status (if any sensor is red, zone is red)
- Threshold values defined alongside sensor config in TypeScript constants

### Claude's Discretion
- Which 3 sensors to keep per zone (guided by what looks most interesting in panels)
- Exact threshold values for each sensor (guided by research's Mars-realistic ranges)
- Zustand store structure and selector design
- Simulation engine tick architecture (setInterval vs requestAnimationFrame, pure module pattern)

</decisions>

<specifics>
## Specific Ideas

- Research's Mars sensor mapping table (FEATURES.md) has scientifically grounded ranges — use those as the basis for thresholds and simulation bounds
- The simulation should "feel alive" — a reviewer watching for 30 seconds should see values moving, occasionally a sensor drifting toward yellow, then recovering
- The sol cycle should be subtle enough that it's noticeable over a minute but doesn't dominate the experience

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@tanstack/react-query` (installed, unused): Use for fetching zone config from Django on habitat page mount
- `axios` + `api.ts`: Centralized API client — add habitat endpoint here after fixing the `/api/api/` bug

### Established Patterns
- Django: Class-based views (ListAPIView, APIView) with ModelSerializer in `sensor_data/` app
- Django: Explicit `db_table` in model Meta (shared tables with Cloud Functions)
- Frontend types: `spatialhub-frontend/src/types/` — add habitat types here, not inline
- Frontend API: All calls should go through `src/api/api.ts` (existing pattern, even if inconsistently followed)

### Integration Points
- `django_backend/sensor_data/models.py`: Add HabitatZone model here (same app)
- `django_backend/sensor_data/urls.py`: Add `habitat/zones/` path
- `spatialhub-frontend/src/api/api.ts`: Fix BASE_URL bug (line 6: `${BASE_URL}/api/raw/` double-prefixes), add `fetchHabitatZones()`
- New files needed: `src/store/` (Zustand), `src/simulation/` (engine), `src/types/habitat.ts` or extend `types.ts`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-03-09*
