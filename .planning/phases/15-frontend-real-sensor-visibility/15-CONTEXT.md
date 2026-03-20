# Phase 15: Frontend Real Sensor Visibility - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The Water Recycling zone panel shows the real Pi pH value as a secondary annotation alongside the BioSim physics reading, and the HUD connection badge gains a fifth "Real Sensor" state that activates when Pi data is flowing. Deployed to Firebase Hosting. No new polling logic (useLiveSensors already exists), no new zone panel rendering (SensorRow already handles `isLive`).

**Scope reduction:** UI-01 is already implemented — `useLiveSensors.ts` polls Pi data, sets `source: 'live'`, and `ZonePanel.tsx` renders it with teal LIVE badge and "Hardware Sensor — Raspberry Pi" subtitle. Only UI-02 (HUD badge 5th state) needs new code.

</domain>

<decisions>
## Implementation Decisions

### Badge model
- **Combined state** — when BioSim is connected AND Pi data has been polled within the last 30 seconds, the ConnectionBadge upgrades to a 5th state: "BioSim + Real Sensor"
- Color: **teal (#00ffcc)** — matches the existing LIVE badge color in ZonePanel for visual consistency
- Falls back to "BioSim Live" (green) if Pi data goes stale (>30s since last successful poll)
- Falls back to "Fallback Mode" (amber) if BioSim disconnects but Pi is still flowing — Pi status is irrelevant without BioSim
- Single badge, richer label — not a dual-badge approach

### SimSource type change
- Add `'biosim-live'` (or similar) as a 5th value to the `SimSource` union type in `habitat.ts`
- ConnectionBadge `BADGE_CONFIG` gets a 5th entry
- `useLiveSensors` or `useSimSource` sets the combined state when both conditions are met

### Pi data freshness tracking
- `useLiveSensors` already polls every 10s — track `lastPiPollSuccess` timestamp in habitatStore (or via a ref in useLiveSensors)
- "Fresh" = last successful poll was within 30s (3 missed polls = stale)
- The freshness check determines badge upgrade — no other behavior changes

### Deploy
- Frontend rebuild with existing env vars and Firebase deploy — same as Section 15 of deploy.sh

### Claude's Discretion
- Exact SimSource value name for the 5th state (`'biosim-live'`, `'biosim-real'`, etc.)
- Whether freshness tracking lives in habitatStore or as a module-level ref in useLiveSensors
- Whether to add a `piDataFresh` boolean selector to habitatStore or derive it in ConnectionBadge
- Pulse animation behavior when transitioning to/from the 5th state

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Badge component
- `spatialhub-frontend/src/components/habitat/ConnectionBadge.tsx` — Current 4-state badge with BADGE_CONFIG, pulse animation, selectSimSource selector
- `spatialhub-frontend/src/types/habitat.ts` line 71 — `SimSource` union type definition (4 values)
- `spatialhub-frontend/src/store/habitatStore.ts` — `simSource` state, `setSimSource` action, `selectSimSource` selector

### Live sensor hook (already built)
- `spatialhub-frontend/src/hooks/useLiveSensors.ts` — Pi data polling, PI_HUB_ID, SENSOR_MAP, source: 'live' tagging
- `spatialhub-frontend/src/components/habitat/ZonePanel.tsx` — SensorRow `isLive` rendering (already handles UI-01)

### Sim source management
- `spatialhub-frontend/src/hooks/useSimSource.ts` — BioSim connection state machine, BIOSIM_BASE_URL

### Requirements
- `.planning/REQUIREMENTS.md` — UI-01, UI-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConnectionBadge.tsx`: BADGE_CONFIG record pattern — just add a 5th entry with dot/label/textColor
- `useLiveSensors.ts`: Already polls Pi data every 10s — can track last successful poll timestamp
- `habitatStore.ts`: `setSimSource()` action already exists — just needs to accept the new SimSource value
- ZonePanel LIVE badge: teal (#00ffcc) color already established — badge should match

### Established Patterns
- `SimSource` type → `BADGE_CONFIG` record → `ConnectionBadge` renders — extend the type, extend the config
- CSS keyframe injection pattern (AlertBanner, ConnectionBadge) — reuse for any new animations
- Granular Zustand selectors (`selectSimSource`) — badge only re-renders when simSource changes

### Integration Points
- `habitat.ts` line 71: Add 5th value to `SimSource` union type
- `ConnectionBadge.tsx` line 46: Add 5th entry to `BADGE_CONFIG`
- `habitatStore.ts`: May need `piDataFresh` state or similar to track Pi poll status
- `useLiveSensors.ts`: Track last successful poll, call `setSimSource` to upgrade badge when both sources active
- `useSimSource.ts`: May need to coordinate with useLiveSensors to avoid race conditions on simSource

</code_context>

<specifics>
## Specific Ideas

- The teal (#00ffcc) color creates a visual thread: LIVE badge in ZonePanel and "BioSim + Real Sensor" badge in HUD both teal — judge sees the connection immediately
- The badge upgrade is the "second wow" — first they see the zone turn red (Phase 14), then they see the badge confirm real hardware is connected

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-frontend-real-sensor-visibility*
*Context gathered: 2026-03-20*
