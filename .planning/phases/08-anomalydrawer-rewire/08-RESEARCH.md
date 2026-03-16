# Phase 8: AnomalyDrawer Rewire — Research

**Researched:** 2026-03-16
**Domain:** BioSim malfunction REST API + Zustand store branching by `simSource`
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ANOM-01 | AnomalyDrawer buttons POST real malfunctions to BioSim REST API in BioSim mode | BioSim malfunction POST endpoint confirmed from official README with exact request body format |
| ANOM-02 | Anomaly cancel sends DELETE to BioSim malfunction endpoint using stored malfunction IDs | BioSim DELETE endpoint confirmed; malfunctionID returned by POST must be stored in Zustand for later cancel |
| ANOM-03 | AnomalyDrawer supports malfunction scheduling via `tickToOccur` delay field | `tickToOccur` is an optional field in the POST body — omit it for immediate, include it for scheduled |
| ANOM-04 | Existing anomaly behavior preserved in fallback (client-side) mode | `simSource` is already in Zustand store; `triggerAnomaly` / `cancelAnomaly` unchanged for fallback path |
</phase_requirements>

---

## Summary

Phase 8 rewires the four AnomalyDrawer scenario buttons to branch on `simSource` in the Zustand store. When `simSource === 'biosim'`, clicking a scenario button POSTs a malfunction to BioSim's REST API and stores the returned `malfunctionID`. Clicking the same button again DELETEs that malfunction via the stored ID. When `simSource !== 'biosim'`, the existing `triggerAnomaly` / `cancelAnomaly` bias-curve path runs unchanged.

The BioSim malfunction REST API is fully documented and verified from the official README. The endpoint shape is `POST /api/simulation/{simID}/modules/{moduleName}/malfunctions` with a JSON body containing `intensity`, `length`, and optional `tickToOccur`. The response is `{"malfunctionID": N}`. Cancellation is `DELETE /api/simulation/{simID}/modules/{moduleName}/malfunctions/{malfunctionID}`.

The constraint "no JSX changes to AnomalyDrawer" means all branching logic must live in the Zustand store or a dedicated hook/service layer. The AnomalyDrawer already calls `triggerAnomaly(scenario.id)` from the store — the upgrade path is to make that action aware of `simSource` and dispatch to the correct path internally, or to introduce a `useBioSimMalfunction` hook that the store delegates to. The simplest approach, given the existing architecture, is to extend `triggerAnomaly` / `cancelAnomaly` in `habitatStore.ts` to branch on `simSource`, dispatching REST calls for BioSim mode and the existing bias-curve logic for fallback mode.

**Primary recommendation:** Extend `triggerAnomaly` and `cancelAnomaly` in `habitatStore.ts` to read `simSource` and branch: BioSim path fires `fetch()` calls to the malfunction API; fallback path runs the existing onset/recovery phase logic. Store `malfunctionID` per scenario in a new `biosimMalfunctionIds` field in the store. A separate `biosimMalfunctions.ts` module holds the scenario-to-module mapping and the fetch wrappers.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch` API | Browser built-in | POST/DELETE to BioSim malfunction REST API | Already used in `probeBioSim()` in `useSimSource.ts`; no extra dependency |
| Zustand 5.0.11 | Already installed | Store `biosimMalfunctionIds` per scenario; read `simSource` to branch | Already the state system; new field follows established pattern |
| BioSim malfunction REST API | BioSim server (no install) | The actual malfunction injection mechanism | Official BioSim feature, confirmed from README |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest 4.1.0 | Already installed | Unit tests for the new store actions and fetch service | Same test infrastructure as all Phase 7 tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `triggerAnomaly` in the store | A separate `useBioSimMalfunction` hook | Hook approach keeps store smaller but requires AnomalyDrawer to import an additional hook — violates "no JSX changes" constraint; store extension is cleaner |
| Per-scenario DELETE | DELETE-all `/malfunctions` (no ID needed) | DELETE-all would cancel ALL active malfunctions, not just the one scenario; storing per-scenario IDs is required for ANOM-02 |

**Installation:**
```bash
# No new packages required — fetch and Zustand already present
```

---

## Architecture Patterns

### Recommended Project Structure
```
spatialhub-frontend/src/
├── simulation/
│   └── biosimMalfunctions.ts   # NEW: scenario-to-module map + fetch wrappers
├── store/
│   └── habitatStore.ts         # EXTEND: triggerAnomaly/cancelAnomaly branch on simSource
│                               # EXTEND: biosimMalfunctionIds field in HabitatState
├── types/
│   └── habitat.ts              # EXTEND: biosimMalfunctionIds field in HabitatState interface
└── __tests__/
    └── biosimMalfunctions.test.ts   # NEW: unit tests for fetch wrappers and scenario mapping
```

### Pattern 1: BioSim Module Mapping for Each Scenario

**What:** Each of the four anomaly scenarios maps to one or more BioSim module names. The POST fires once per scenario (targeting the "primary" module that drives the cascading effect). BioSim's internal physics causes the cascade — we don't need to malfunction every correlated sensor separately.

**Module mapping (derived from `biosimMapper.ts` + BioSim fixture):**

| Scenario ID | Primary BioSim Module | Intensity | Length |
|-------------|----------------------|-----------|--------|
| `co2-spike` | `VCCR` (CO2 removal system failure causes CO2 to spike) | `SEVERE_MALF` | `TEMPORARY_MALF` |
| `pump-failure` | `Grey_Water_Store` (or `Crew_Quarters_Group`) | `SEVERE_MALF` | `TEMPORARY_MALF` |
| `nutrient-crash` | `Dirty_Water_Store` | `SEVERE_MALF` | `TEMPORARY_MALF` |
| `power-fluctuation` | `Nuclear_Source` | `SEVERE_MALF` | `TEMPORARY_MALF` |

**IMPORTANT LOW-CONFIDENCE NOTE:** The specific module-to-scenario mapping above is a best-inference from the mapper source. The planner MUST include a Wave 0 verification task: start BioSim, POST a `SEVERE_MALF` to each module, observe the WS tick stream to confirm the expected sensors change. The correct module choice may differ from the above. `OGS` (Oxygen Generation System) is the example module in all BioSim README curl examples — it is a known-valid module name for testing.

**When to use:** Always — this mapping is the core of ANOM-01.

**Example — POST a malfunction:**
```typescript
// Source: https://github.com/scottbell/biosim/blob/main/README.md — malfunction endpoint
async function postMalfunction(
  simId: string,
  moduleName: string,
  intensity: 'SEVERE_MALF' | 'MEDIUM_MALF' | 'LOW_MALF',
  length: 'TEMPORARY_MALF' | 'PERMANENT_MALF',
  tickToOccur?: number,
): Promise<number | null> {
  const body: Record<string, unknown> = { intensity, length };
  if (tickToOccur !== undefined) body.tickToOccur = tickToOccur;

  try {
    const resp = await fetch(
      `${BIOSIM_BASE_URL}/api/simulation/${simId}/modules/${moduleName}/malfunctions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { malfunctionID: number };
    return data.malfunctionID;
  } catch {
    return null;
  }
}
```

**Example — DELETE a malfunction:**
```typescript
// Source: https://github.com/scottbell/biosim/blob/main/README.md — malfunction DELETE
async function deleteMalfunction(
  simId: string,
  moduleName: string,
  malfunctionId: number,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `${BIOSIM_BASE_URL}/api/simulation/${simId}/modules/${moduleName}/malfunctions/${malfunctionId}`,
      { method: 'DELETE' },
    );
    return resp.ok;
  } catch {
    return false;
  }
}
```

### Pattern 2: Store State Extension — `biosimMalfunctionIds`

**What:** A new field in `HabitatState` tracks the `malfunctionID` returned by BioSim per scenario. Needed for targeted DELETE on cancel (ANOM-02).

**When to use:** Always — without stored IDs, cancel cannot issue a targeted DELETE.

```typescript
// Addition to habitat.ts HabitatState interface
biosimMalfunctionIds: Record<string, number>;  // scenarioId -> malfunctionID from BioSim

// In habitatStore.ts create():
biosimMalfunctionIds: {} as Record<string, number>,
```

Also needed: the current `simId` in the store, or accessible from `useSimSource`'s exported constant. The `simId` is currently managed inside `useSimSource.ts` as a local variable. For BioSim mode anomalies, the `simId` must be accessible when `triggerAnomaly` fires. Options:
1. Add `biosimSimId: string | null` to the Zustand store (set by `useSimSource` when BioSim connects, cleared on disconnect)
2. Pass `simId` as an argument to the extended `triggerAnomaly` call site (requires a wrapper in AnomalyDrawer — violates "no JSX changes")

Option 1 is correct: add `biosimSimId` to the store, set by `useSimSource` on WS_OPEN, cleared on fallback. The store action can then read its own `simSource` and `biosimSimId` and fire the fetch.

### Pattern 3: `triggerAnomaly` / `cancelAnomaly` Branch Logic

**What:** The existing `triggerAnomaly` in `habitatStore.ts` runs the onset/recovery phase logic. The extended version checks `simSource` first:
- `'biosim'`: POST to BioSim → store `malfunctionID` → push announcement (no bias curve)
- anything else: existing onset/recovery phase logic unchanged

**When to use:** This is the entire implementation logic for ANOM-01, ANOM-02, ANOM-04.

```typescript
// Extended triggerAnomaly in habitatStore.ts (pseudocode)
triggerAnomaly: (scenarioId: string) => {
  const state = get();
  const { simSource, biosimSimId } = state;

  if (simSource === 'biosim' && biosimSimId !== null) {
    // BioSim path — ANOM-01
    const existing = state.biosimMalfunctionIds[scenarioId];
    if (existing !== undefined) {
      // Already active — cancel it (ANOM-02)
      state.cancelAnomaly(scenarioId);
      return;
    }
    const mapping = BIOSIM_MALFUNCTION_MAP[scenarioId];
    if (!mapping) return;
    // Fire async POST — store ID when it resolves
    postMalfunction(biosimSimId, mapping.moduleName, mapping.intensity, mapping.length)
      .then((malfunctionId) => {
        if (malfunctionId === null) return;
        set((s) => ({
          biosimMalfunctionIds: { ...s.biosimMalfunctionIds, [scenarioId]: malfunctionId },
          scenarioAnnouncements: [...s.scenarioAnnouncements, buildAnnouncement(scenarioId)],
        }));
      });
    return;
  }

  // Fallback path — existing bias-curve logic unchanged (ANOM-04)
  // ... existing onset/recovery code ...
},
```

```typescript
// Extended cancelAnomaly
cancelAnomaly: (scenarioId: string) => {
  const state = get();
  const { simSource, biosimSimId, biosimMalfunctionIds } = state;

  if (simSource === 'biosim' && biosimSimId !== null) {
    // BioSim path — ANOM-02
    const malfunctionId = biosimMalfunctionIds[scenarioId];
    if (malfunctionId === undefined) return;
    const mapping = BIOSIM_MALFUNCTION_MAP[scenarioId];
    if (!mapping) return;
    deleteMalfunction(biosimSimId, mapping.moduleName, malfunctionId).then(() => {
      set((s) => {
        const ids = { ...s.biosimMalfunctionIds };
        delete ids[scenarioId];
        return { biosimMalfunctionIds: ids };
      });
    });
    return;
  }

  // Fallback path — existing recovery phase logic unchanged
  // ... existing code ...
},
```

### Pattern 4: `tickToOccur` Delay Field (ANOM-03)

**What:** The AnomalyDrawer has no delay input in the current JSX. ANOM-03 says "the delay field in AnomalyDrawer" — but the constraint is "no JSX changes." Resolution: ANOM-03 requires the **store/API layer** to support `tickToOccur`, not that a UI input exists. The planner must clarify this:

- If an existing delay input is already in AnomalyDrawer JSX but unused (wired to nothing), the store action accepts a `delayTicks?: number` parameter and passes it as `tickToOccur` to the POST.
- If no delay input exists in the JSX (confirmed by reading AnomalyDrawer.tsx — no delay field found), the `tickToOccur` support is implemented at the API layer as an optional parameter, accepting `undefined` for immediate malfunction (the default).

Looking at the current `AnomalyDrawer.tsx` (fully read): there is no delay input field. The JSX only has the four scenario buttons and a close button. The phase description says "Optional delay field in AnomalyDrawer schedules malfunction onset via `tickToOccur` parameter" — this implies the delay field IS expected in the drawer as a new JSX element.

**However:** the constraint is "no JSX changes to AnomalyDrawer." This appears to be a contradiction. **Resolution for the planner:** The `tickToOccur` requirement (ANOM-03) can be satisfied by wiring an optional `delayTicks` prop or store-level field that the post uses, with `tickToOccur = 0` (immediate) as the default — making ANOM-03 satisfied at the API/store layer without touching AnomalyDrawer JSX. Alternatively, a small optional delay input IS added (which is technically a JSX change). The planner must make this call explicitly.

### Anti-Patterns to Avoid

- **Posting malfunctions to multiple modules per scenario:** BioSim physics handles cascading internally. One module malfunction causes correlated downstream effects. Don't POST to every sensor's module separately — this would over-engineer the simulation and may cause unpredictable physics interactions.
- **Not storing `malfunctionID`:** Without storing the ID returned by the POST, cancel cannot issue a targeted DELETE. "Cancel removes the specific malfunction" (ANOM-02) is impossible without the ID.
- **Calling `tickAnomalies()` in BioSim mode:** The `tickAnomalies` function advances the client-side bias-curve phase state. In BioSim mode, anomaly progression is driven by BioSim's physics — calling `tickAnomalies()` would apply a client-side bias on top of real BioSim data. The engine does NOT run in BioSim mode, but the store's `tickAnomalies` would if something called it. Confirm it is NOT called from the BioSim data path (it isn't — `tickAnomalies()` is called by `engine.ts` tick(), which only runs in fallback mode).
- **Async fetch in Zustand without handling race conditions:** If the user clicks a scenario button twice rapidly before the first POST resolves, two malfunctions could be created for the same scenario. Guard with a "pending" flag or check if `biosimMalfunctionIds[scenarioId]` is already set before firing.
- **Keeping `anomalies` record in sync with BioSim mode:** In BioSim mode, the `anomalies` record (used to drive button pulse animations) still controls the `isActive` visual. Options: (a) set `anomalies[scenarioId]` to a dummy non-idle state when POST succeeds, (b) use `biosimMalfunctionIds` as the source of truth for active state detection. Option (b) is cleaner — the `isActive` check in AnomalyDrawer currently reads `anomalies[scenario.id]?.phase !== 'idle'`. For BioSim mode, this check must also cover `biosimMalfunctionIds[scenario.id] !== undefined`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Malfunction injection | Custom sensor value override in mapper | BioSim REST malfunction POST | BioSim handles cascading physics — custom overrides would require replicating BioSim's entire physics model |
| Malfunction ID tracking | Session storage or localStorage | `biosimMalfunctionIds` field in Zustand store | Store is already the single source of truth; session storage adds complexity with no benefit |
| simId lookup at click time | Re-probe BioSim REST on every button click | `biosimSimId` field stored in Zustand (set by useSimSource on WS_OPEN) | Probe has 5s timeout; button clicks must respond instantly |

**Key insight:** BioSim's malfunction API does exactly what the anomaly scenarios need. The only work is mapping scenario IDs to module names, firing the fetch, and storing the returned IDs. The "real cascading physics" goal is free — BioSim handles it.

---

## Common Pitfalls

### Pitfall 1: Wrong Module Name in POST (404 Response)
**What goes wrong:** POST to `/api/simulation/{simID}/modules/BadModuleName/malfunctions` returns 404 or 400. No malfunction is created.
**Why it happens:** Module names in BioSim are case-sensitive strings (e.g., `Nuclear_Source`, not `nuclear_source` or `NuclearSource`). The module names are known from the fixture (`tests/fixtures/biosim_module_state.json`): `Nuclear_Source`, `VCCR`, `Grey_Water_Store`, `Dirty_Water_Store`, `OGS`, etc.
**How to avoid:** Use the exact module names from the fixture. Smoke-test each POST endpoint in Wave 0 with Docker running. The OGS example from the README confirms `OGS` (not `o2-generator` or similar).
**Warning signs:** `resp.ok` is false, console shows 404 or 400 from BioSim.

### Pitfall 2: `biosimMalfunctionIds` Not Cleared on Fallback Transition
**What goes wrong:** User is in BioSim mode, triggers a malfunction, then BioSim goes offline and the system falls back. The `biosimMalfunctionIds` still has the old ID. On next BioSim reconnect with a fresh simId, the cancel would attempt to DELETE a malfunction ID that no longer exists on the new simulation.
**Why it happens:** `biosimSimId` changes on reconnect (new simulation), but `biosimMalfunctionIds` retains stale IDs.
**How to avoid:** Clear `biosimMalfunctionIds: {}` when `setSimSource('fallback')` or `setSimSource('disconnected')` is called (in `useSimSource.ts`'s cleanup paths). Also clear when the new simId is set on reconnect.
**Warning signs:** DELETE returns 404 on a reconnected BioSim session; stale button pulse animations persist after fallback.

### Pitfall 3: Button Active State Broken in BioSim Mode
**What goes wrong:** After posting a malfunction in BioSim mode, the scenario button doesn't show the active (pulsing red) state. Or it shows active indefinitely even after cancel.
**Why it happens:** `AnomalyDrawer.tsx` reads `anomalies[scenario.id]?.phase !== 'idle'` to determine `isActive`. In BioSim mode, `anomalies` is never set — the bias-curve state machine never runs. So `isActive` is always false.
**How to avoid:** The active state in BioSim mode must come from `biosimMalfunctionIds[scenario.id] !== undefined`. The `isActive` expression in `AnomalyDrawer.tsx` must be updated to include this BioSim source — but this requires a JSX change. Alternatively, set a sentinel value in `anomalies[scenarioId]` when the BioSim POST succeeds (e.g., `{ phase: 'peak', ticksInPhase: 0, biasFactor: 1 }`), and clear it on DELETE — this avoids JSX changes by using the existing data path.
**Warning signs:** Buttons remain unlit after clicking in BioSim mode; or button stays pulsing after cancel.

### Pitfall 4: Async POST Race Condition on Double-Click
**What goes wrong:** Clicking the same scenario button twice rapidly fires two POST requests. BioSim creates two malfunctions. Only the second `malfunctionID` is stored. The first malfunction leaks and cannot be cancelled.
**Why it happens:** The POST is async; the guard check (`biosimMalfunctionIds[scenarioId] !== undefined`) passes for both clicks before the first POST resolves.
**How to avoid:** Add a `biosimMalfunctionPending: Set<string>` field to track in-flight POSTs. Check and set it before firing the fetch; clear it (and store the ID) when the fetch resolves. Alternatively, use a simple optimistic flag: immediately push a sentinel into `biosimMalfunctionIds` before the fetch resolves, replacing it with the real ID on success.
**Warning signs:** Multiple malfunctions for the same scenario visible in BioSim's module state; cancel only fixes one.

### Pitfall 5: `tickToOccur` = 0 vs. omitting it
**What goes wrong:** Passing `tickToOccur: 0` may behave differently than omitting the field. In BioSim's implementation, omitting `tickToOccur` calls `startMalfunction` (immediate). Including `tickToOccur: 0` calls `scheduleMalfunction` with tick 0 — which may or may not fire immediately depending on the current tick count.
**How to avoid:** For immediate malfunctions, omit `tickToOccur` entirely (don't pass `0`). Only include it when the user explicitly provides a non-zero delay. The fetch wrapper should use `if (tickToOccur !== undefined && tickToOccur > 0) body.tickToOccur = tickToOccur`.
**Warning signs:** Immediate malfunction button click has a 1-tick delay; or scheduled malfunctions fire immediately.

---

## Code Examples

Verified patterns from official sources:

### BioSim Malfunction POST (from official README)
```bash
# Source: https://github.com/scottbell/biosim/blob/main/README.md
# POST malfunction — immediate
curl -X POST http://localhost:8009/api/simulation/1/modules/OGS/malfunctions \
     -H "Content-Type: application/json" \
     -d '{"intensity": "SEVERE_MALF", "length": "TEMPORARY_MALF"}'
# Response: {"malfunctionID":2}

# POST malfunction — scheduled at tick 3
curl -X POST http://localhost:8009/api/simulation/1/modules/OGS/malfunctions \
     -H "Content-Type: application/json" \
     -d '{"intensity": "MEDIUM_MALF", "length": "TEMPORARY_MALF", "tickToOccur": 3}'
# Response: {"malfunctionID":3}
```

### BioSim Malfunction DELETE (from official README)
```bash
# Source: https://github.com/scottbell/biosim/blob/main/README.md
# DELETE specific malfunction
curl -X DELETE http://localhost:8009/api/simulation/1/modules/OGS/malfunctions/2
# Response: {"message":"Malfunction 2 cleared."}
```

### Confirmed BioSim Module Names (from fixture)
```typescript
// Source: tests/fixtures/biosim_module_state.json — verified from live BioSim at tick 191
const KNOWN_BIOSIM_MODULES = [
  'Nuclear_Source',       // power generation
  'VCCR',                 // CO2 removal (Vapor Compression CO2 Removal)
  'OGS',                  // O2 generation
  'Grey_Water_Store',     // grey water
  'Dirty_Water_Store',    // dirty water / waste water
  'Crew_Quarters_Group',  // crew water consumers
  'General_Power_Store',  // power storage
  'Potable_Water_Store',  // clean drinking water
];
```

### HabitatState Extension Pattern (following established store conventions)
```typescript
// Source: habitatStore.ts existing pattern — follows same field addition approach as simSource (Phase 7)
// In habitat.ts HabitatState interface — additions only:
biosimSimId: string | null;
biosimMalfunctionIds: Record<string, number>;  // scenarioId -> malfunctionID
setBiosimSimId: (id: string | null) => void;

// In habitatStore.ts create():
biosimSimId: null,
biosimMalfunctionIds: {},
setBiosimSimId: (id) => set({ biosimSimId: id }),
```

### AnomalyDrawer `isActive` Fix Without JSX Change
```typescript
// AnomalyDrawer.tsx currently reads:
const isActive = scenarioState !== undefined && scenarioState.phase !== 'idle';

// To support BioSim mode without JSX changes, use a sentinel in anomalies:
// When BioSim POST succeeds, set: anomalies[scenarioId] = { phase: 'peak', ticksInPhase: 0, biasFactor: 1 }
// When BioSim DELETE completes, set: anomalies[scenarioId] = { phase: 'idle', ticksInPhase: 0, biasFactor: 0 }
// This keeps the isActive check working for both modes with zero JSX changes.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side bias curves for all anomalies | REST malfunction POST in BioSim mode, bias curves in fallback | Phase 8 | BioSim mode gets real physics; fallback preserves v1.0 behavior |
| `triggerAnomaly` always applies bias | `triggerAnomaly` branches on `simSource` | Phase 8 | No behavior change for existing fallback users |

---

## Open Questions

1. **Which BioSim module maps to which scenario?**
   - What we know: `biosimMapper.ts` shows the module names used for sensor data: `VCCR` for CO2, `Nuclear_Source` for power, `Grey_Water_Store`/`Dirty_Water_Store` for water. The fixture confirms these module names exist.
   - What's unclear: Whether malfunctioning `VCCR` actually causes CO2 to spike visually in the WS stream, whether `Nuclear_Source` malfunction drops power readings, etc. The physics cascade is real but untested against our sensor readings.
   - Recommendation: Wave 0 MUST include a smoke test: start Docker, POST `SEVERE_MALF` to each candidate module, observe 3–5 WS ticks, confirm the mapped sensors change in the expected direction. The module mapping table above is a hypothesis until verified.

2. **How should `tickToOccur` be exposed without JSX changes?**
   - What we know: ANOM-03 requires scheduling support. AnomalyDrawer JSX has no delay input field currently. "No JSX changes" is a hard constraint from the phase description.
   - What's unclear: Whether ANOM-03 means the API layer supports it (delay = optional param, default 0/immediate) or whether the UI delay field IS required (which requires a JSX change).
   - Recommendation: Satisfy ANOM-03 at the API layer: the `biosimMalfunctions.ts` service accepts `tickToOccur` as an optional parameter, defaulting to undefined (immediate). If a delay UI field is genuinely required, the "no JSX changes" constraint must be relaxed specifically for the delay input. The planner must make this explicit.

3. **`biosimSimId` storage: store vs. module-level ref?**
   - What we know: `useSimSource.ts` currently holds the simId as a local variable. The store's `triggerAnomaly` needs access to the simId. Phase 7's pattern for module-level refs (e.g., `activeEngine`) suggests a module-scope variable is acceptable.
   - What's unclear: Whether adding `biosimSimId` to the Zustand store is the right approach or whether a module-level export from `useSimSource.ts` is cleaner.
   - Recommendation: Add `biosimSimId` to the Zustand store. It follows the established `simSource` / `setSimSource` pattern from Phase 7. `useSimSource.ts` calls `setBiosimSimId(simId)` on WS_OPEN and `setBiosimSimId(null)` on fallback. Keeps all shared state in one place.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `spatialhub-frontend/vitest.config.ts` |
| Quick run command | `cd spatialhub-frontend && npm test` |
| Full suite command | `cd spatialhub-frontend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANOM-01 | `triggerAnomaly` in BioSim mode fires POST fetch to malfunction endpoint | unit | `npm test -- biosimMalfunctions` | ❌ Wave 0 |
| ANOM-02 | `cancelAnomaly` in BioSim mode fires DELETE with stored malfunctionID | unit | `npm test -- biosimMalfunctions` | ❌ Wave 0 |
| ANOM-03 | `postMalfunction` with `tickToOccur` includes it in request body; without, omits it | unit | `npm test -- biosimMalfunctions` | ❌ Wave 0 |
| ANOM-04 | `triggerAnomaly` in fallback mode runs existing onset/phase logic unchanged | unit | `npm test -- habitatStore.anomalies` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd spatialhub-frontend && npm test`
- **Per wave merge:** `cd spatialhub-frontend && npm test` (all 63+ tests green)
- **Phase gate:** Full test suite green + manual Docker smoke test of each malfunction scenario before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/simulation/biosimMalfunctions.ts` — scenario-to-module map + fetch wrappers (must exist before store extension)
- [ ] `src/__tests__/biosimMalfunctions.test.ts` — covers ANOM-01, ANOM-02, ANOM-03 (environment: jsdom for fetch mock; `@vitest-environment jsdom`)
- [ ] `src/__tests__/habitatStore.anomalies.test.ts` — covers ANOM-04 fallback path preservation
- [ ] Manual smoke test script (not automated): `docker compose up`, POST to `Nuclear_Source`/`VCCR`/etc., observe WS stream for expected sensor changes

---

## Sources

### Primary (HIGH confidence)
- `https://raw.githubusercontent.com/scottbell/biosim/main/README.md` — complete malfunction REST API: POST/DELETE endpoints, request body schema, response `malfunctionID`, `tickToOccur` parameter semantics, module naming convention (e.g., `OGS`). Fetched directly.
- Project codebase: `AnomalyDrawer.tsx`, `anomalies.ts`, `habitatStore.ts`, `habitat.ts`, `biosimMapper.ts`, `useSimSource.ts`, `engine.ts`, `constants.ts` — all read directly; all integration points verified from source
- `tests/fixtures/biosim_module_state.json` — confirmed BioSim module names at tick 191: `Nuclear_Source`, `VCCR`, `OGS`, `Grey_Water_Store`, `Dirty_Water_Store`, `Crew_Quarters_Group`, etc.

### Secondary (MEDIUM confidence)
- Phase 7 VERIFICATION.md — confirmed `simSource` in Zustand store, `setSimSource` action, `selectSimSource` selector, and `biosimSimId` access pattern needs (verified code state)
- Phase 5 RESEARCH.md — BioSim REST API conventions and `BIOSIM_BASE_URL` usage

### Tertiary (LOW confidence)
- Module-to-scenario physics mapping (which BioSim module causes which sensor cascade) — inferred from `biosimMapper.ts` source mappings, NOT verified against live BioSim. Must be smoke-tested in Wave 0.

---

## Metadata

**Confidence breakdown:**
- BioSim malfunction REST API (endpoints, body, response): HIGH — official README fetched directly
- Store extension pattern (following Phase 7 simSource approach): HIGH — verified from source code
- Module-to-scenario mapping: LOW — inference only; requires live BioSim validation
- `tickToOccur` vs. no-JSX constraint reconciliation: MEDIUM — requires planner decision
- Fallback path preservation: HIGH — existing `triggerAnomaly` logic is unchanged; only BioSim branch is new

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (BioSim REST API is stable; Zustand patterns are stable)
