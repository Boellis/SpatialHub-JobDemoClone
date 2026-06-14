# Habitat Survival Bot — Design Spec (v3.0-grounded)

**Date:** 2026-06-13
**Status:** Revised after codebase pivot — awaiting re-approval
**Branch:** `feat/survival-bot` (off tag `v3.0`)
**Supersedes:** the greenfield draft built against the stale `main` (now on branch `feat/habitat-survival-bot`).

---

## 0. Why this was rewritten

The first spec/plan were written against a stale `main` checkout that lacked the real app. The
canonical codebase is **tag `v3.0`** — a mature "Mars Habitat" demo that **already integrates
BioSim**. The survival bot must build *on top of* that, not reinvent it. User decisions:
**stay in the `~/dev` git repo (now based on `v3.0`)** and **reuse the existing habitat
zones/store** for visualization.

---

## 1. Goal

Add a **"Habitat Survival"** tab. The user clicks **Run**; an autonomous Claude bot takes
control of a fresh BioSim life-support simulation and keeps the 15-person crew alive as many
sols as possible. The user watches the existing habitat zone dashboard update live, with the
bot's reasoning streaming alongside a big **SOL counter**. **Score = sols survived.**

Autonomous spectator experience (decided earlier): bot drives; human only Run/Stop + difficulty.

---

## 2. What already exists (reuse — do NOT rebuild)

### Frontend (`spatialhub-frontend/src/`)
- `types/habitat.ts` — `ZoneState`, `SensorReading`, `SensorStatus` (green/yellow/red), the
  `HabitatState` Zustand interface. **4 zones** (`grow-bays`, `atmosphere-control`,
  `water-recycling`, `power-thermal`), **12 sensors**.
- `simulation/biosimMapper.ts` — `mapBioSimToHabitatReadings(modules, ts, history)`:
  **pure function** turning a BioSim state's `modules` object into the
  `Record<zoneId, Record<sensorId, SensorReading>>` shape `habitatStore.tick()` consumes.
  **This is the bridge we reuse.**
- `store/habitatStore.ts` — Zustand store; `.tick(readings)`, zone status, anomalies.
- `hooks/useSimSource.ts` + `workers/biosimWorker.ts` — BioSim WebSocket pipeline
  (probe → connect → map → store) with fallback. Reads `VITE_BIOSIM_URL` (default `:8009`).
- Zone visuals: `components/habitat/` → `ZonePanel`, `HabitatHUD`, `AlertBanner`,
  `AnomalyDrawer`, `Sparkline`, `ConnectionBadge`; 3D in `HabitatView` /dashboard in
  `TvDashboardView`.

### Backend (`django_backend/sensor_data/`)
- `management/commands/control_loop.py` — an **existing closed-loop controller** that drives
  BioSim malfunctions. Confirms the malfunction API: `POST .../modules/{m}/malfunctions`
  body `{"intensity":"SEVERE_MALF","length":"TEMPORARY_MALF"}` → `{"malfunctionID":N}`;
  `DELETE .../malfunctions/{id}`.
- `biosim_ingest.py` — `discover_sim_id(base_url)` and BioSim REST helpers.
- `biosim_bridge.py` — WS→zone ingest command.

### Infra (verified live, 2026-06-13)
- BioSim VM `spatialhub-biosim` @ `http://34.66.244.62:8009` (Firebase `nasa-comp-demo`),
  port 8009 open. `tickLength=1` ⇒ **1 sol = 24 ticks**. Controllable flow surfaces confirmed:
  `OGS` (O2/power), `VCCR` (air/CO2/power), `BiomassPS` (food/power/water), `Nuclear_Source`
  (power), `Crew_Quarters_Group` (food/water rations).
- ⚠️ **BLOCKER P0:** fresh-sim start currently returns `No space left on device` — the VM disk
  is full. Live runs blocked until logs are cleared / tick-logging disabled / disk resized.
  Unit tests + the whole build do not depend on this.

---

## 3. Architecture (reuse-first)

```
"Habitat Survival" tab (new page, reuses zone store + visuals)
   │  EventSource (SSE)  ── bot reasoning + sol status + BioSim modules snapshot
   ▼
Django  GET /api/biosim/survival/stream            (new, in sensor_data)
   │  per sol:
   │   1. GET  BioSim /api/simulation/{id}                 (read state)
   │   2. Claude tool-call (server-clamped actions)        (decide flows)
   │   3. POST BioSim consumers/producers + (difficulty) malfunctions
   │   4. POST BioSim /tick ×24
   │   5. yield {sol, alive, modules, reasoning, actions, status}
   └─► until crew death | sol cap | token budget | stop
        │                                   │
        ▼                                   ▼
     Claude (ANTHROPIC_API_KEY, server)  BioSim VM :8009 (reuse biosim_ingest helpers)
```

Frontend per sol event: feed `modules` → `mapBioSimToHabitatReadings` → a **survival-scoped
zone state** → render existing `ZonePanel`/`HabitatHUD`/`AlertBanner`. The bot's reasoning +
SOL counter + Run/Stop + difficulty live in a thin new overlay.

**Why SSE (not the existing WS pipeline):** the existing WS path streams raw BioSim and probes
for *any* sim. The survival run needs Claude-in-the-loop, a private fresh sim, and a reasoning
channel — all server-side. One SSE stream carries both the mapped state and the bot's thinking,
so the tab stays a pure consumer. We still reuse the *mapper* and *zone UI*, just not the WS
hook.

---

## 4. Backend (new code in `django_backend/sensor_data/`, following existing patterns)

- `survival/biosim_control.py` — BioSim flow/tick/state helpers (reuse `biosim_ingest` +
  `control_loop` patterns; add `set_flows`, `start_survival_sim`, `tick`).
- `survival/bot_brain.py` — Claude tool-use → validated, **server-clamped** flow actions on the
  confirmed controllable surfaces. (Invoke the `claude-api` skill before writing.)
- `survival/loop.py` — per-sol generator yielding events; termination on crew death / sol cap /
  token budget / cooperative stop.
- `survival/config.py` — survival start config (default.biosim with `runTillCrewDeath="true"`,
  15-person crew).
- `survival/run_registry.py` — in-memory cancel registry.
- `views.py` (extend) — `survival_stream` (SSE) + `survival_stop`; `urls.py` adds
  `biosim/survival/stream` + `biosim/survival/stop`.
- Config (env): `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `BIOSIM_URL` (already used by
  control_loop), `BIOSIM_MAX_SOLS`, `BIOSIM_TOKEN_BUDGET`, `BIOSIM_CREW_SIZE`.
- Difficulty `malfunctions`: reuse `control_loop.post_malfunction/delete_malfunction` shape.

## 5. Frontend (new tab, reusing zone infra)

- `App.tsx` — add `<NavLink to="/survival">Survival</NavLink>` + `<Route path="/survival">`.
- `pages/SurvivalView.tsx` — `EventSource` consumer:
  - `sol` event → `mapBioSimToHabitatReadings(modules,…)` → push into a survival zone state →
    render reused `ZonePanel` / `HabitatHUD` / `AlertBanner`.
  - Overlay: big **SOL N**, ALIVE/DEAD, Run/Stop, difficulty toggle, **bot reasoning log**,
    end **"Survived N sols"** card.
- `api/biosim.ts` (or extend `api/api.ts`) — SSE URL builder + `stopRun`; types
  (`SurvivalSolEvent`, `SurvivalEndEvent`).
- Decision: reuse the **2D dashboard** (`ZonePanel`/`HUD`) for the survival tab MVP; the 3D dome
  is a stretch (its `useSimSource` WS coupling needs a survival-sim-id variant). Keep MVP 2D.

## 6. Out of scope / phase 2
- Leaderboard / run history (deferred).
- Driving the 3D dome from the survival stream (MVP uses 2D zone panels).
- Replacing the existing `/habitat` WS pipeline (untouched).

## 7. Testing
- Backend: `biosim_control` (mocked HTTP), `bot_brain` (mocked Claude, assert clamping),
  `loop` (fake client/brain, assert event sequence + termination reasons), `views` (SSE framing
  + stop) — Claude/BioSim mocked, so green without the VM.
- Frontend: `SurvivalView` — mock `EventSource`, emit a `sol` event, assert zones render via the
  real mapper + a result card on `end`. Reuse existing Vitest setup.

## 8. Risks
- P0 VM disk (live only). Mapper coupling: survival state must use the same `modules` keys the
  mapper expects (verified against live sim). Cloud Run SSE timeout → sol cap < 60 min. Token
  cost → budget cap.
