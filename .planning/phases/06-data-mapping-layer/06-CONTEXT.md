# Phase 6: Data Mapping Layer - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure translation functions (`biosimMapper.ts` and `biosim_ingest.py`) that convert BioSim's raw physics module hierarchy to the existing ZoneState/SensorReading types (TypeScript) and EnrichedSensorData rows (Python) — tested against the Phase 5 live JSON fixture before any live connection code is written. No WebSocket wiring, no UI changes, no live data flow — that's Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Sensor-to-Module Pairing

**Direct 1:1 mappings (6 sensors):**
- `gb-temp` <- `Crew_Quarters_Environment.temperature` (direct °C)
- `gb-humidity` <- `Crew_Quarters_Environment.relativeHumidity` (direct %)
- `gb-co2` <- `Co2GasConcentrationSensor.value` (mol fraction × 1,000,000 = ppm)
- `ac-o2` <- `O22GasConcentrationSensor.value` (mol fraction × 100 = %)
- `ac-pressure` <- `Crew_Quarters_Environment.totalPressure` (direct kPa)
- `pt-battery` <- `General_Power_Store.currentLevel / currentCapacity` (× 100 = %)

**Derived mappings (3 sensors):**
- `ac-filtration` <- VCCR air output/input actual flow ratio (× 100 = %)
- `wr-flow` <- Crew potable water actual flow rate (L/tick)
- `pt-power` <- Nuclear_Source power actual flow rate (scale to kW)

**Proxy derivations (3 sensors with no BioSim equivalent):**
- `wr-ph` <- Simple ratio from grey water level/capacity (proxy for water quality)
- `wr-tds` <- Derived from dirty water store level (proxy for contamination)
- `pt-coolant` <- Crew quarters temperature + small offset (only thermal reading available)
- All use simple one-liner formulas — no multi-variable chemistry simulation

**Single environment source:** All 4 zones draw from `Crew_Quarters_Environment` (shared atmosphere is physically correct). Zone distinction comes from WHICH properties are pulled, not separate environments. No per-zone offsets.

**Excluded from mapper:**
- Malfunction state — Phase 8's job, not Phase 6
- Crew data (activity schedule, O2/CO2 consumption) — already reflected in environment readings, using directly would double-count

### Value Fidelity

- Show real BioSim physics values without rescaling — if BioSim says 22.4% humidity, display 22.4%
- Create BioSim-specific threshold configs (`BIOSIM_ZONE_CONFIGS`) alongside existing `ZONE_CONFIGS` in `simulation/constants.ts` so steady-state BioSim values show green, with yellow/red reserved for actual anomalies
- Unit conversions documented with inline comments per conversion (e.g., `// CO2: mol fraction × 1e6 = ppm (0.00073 → 730 ppm)`)
- No value clamping or validation — BioSim IS the physics engine; extreme values represent real simulation states

### Unmappable Sensor Fallback

- Mapper is a **pure function**: `(biosimJson) => Record<zoneId, Record<sensorId, SensorReading>>` — no internal state
- Last-known-good caching lives in the caller (Phase 7 WebSocket hook), not the mapper
- If a BioSim module is missing from a tick, the mapper omits those sensors from output; caller merges with cached previous readings
- No source metadata field — all readings look identical regardless of whether they're direct BioSim, derived, or proxy
- No silent zero-fills — every value is either computed from BioSim data or omitted

### Django Row Identity

- `hub_id` = `'biosim-habitat-01'` (fixed sentinel, distinguishes BioSim from real IoT data)
- `location` = `'Mars Habitat Alpha'`
- `owner` = `'NASA BioSim'`
- `workers` = `'Crew Quarters Group'`
- `sensor_name` = SpatialHub sensor name (e.g., `'co2'`, `'temperature'`)
- `sensor_id` = SpatialHub sensor ID (e.g., `'gb-co2'`, `'gb-temp'`)
- `device_addr` = Claude's discretion (zone ID or BioSim module name — whichever makes /trends queries most useful)

### Claude's Discretion

- `device_addr` value strategy for Django rows
- Exact formulas for proxy sensors (wr-ph, wr-tds, pt-coolant) within the "simple ratio" constraint
- Ring buffer size for sparkline history
- BioSim threshold ranges (must make steady-state green, anomalies yellow/red)
- Test structure and coverage strategy for unit tests
- Python `biosim_ingest.py` internal structure (function vs. class)

</decisions>

<specifics>
## Specific Ideas

- The Phase 5 fixture (`tests/fixtures/biosim_module_state.json`) has 191 ticks elapsed — use this as the primary test fixture for all unit tests
- VCCR air flow ratio gives a real "filtration efficiency" proxy — when VCCR loses power during a malfunction, this drops to 0% which is dramatic
- Nuclear_Source power flow is 3000.0 W — needs scaling to match the existing `pt-power` nominal of 100 kW (either divide by 30 or treat BioSim watts as a different scale)
- The `biosim_ingest.py` success criteria requires "documented unit conversions (mol, Pa, flow rates)" — same conversion table as TypeScript mapper but in Python

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `simulation/constants.ts`: `ZONE_CONFIGS` array and `SENSOR_MAP` lookup — BioSim thresholds should live alongside these
- `types/habitat.ts`: `SensorReading` and `ZoneState` types — mapper output contract already defined
- `store/habitatStore.ts`: `tick()` method accepts `Record<string, Record<string, SensorReading>>` — exact mapper output shape
- `simulation/engine.ts`: `deriveStatus()` function (lines 16-24) derives green/yellow/red from thresholds — reusable for BioSim mapper
- `tests/fixtures/biosim_module_state.json`: Live BioSim fixture captured in Phase 5

### Established Patterns
- Simulation engine produces `SensorReading` objects with `sensorId`, `zoneId`, `value`, `status`, `timestamp`, `history[]`
- Status derivation uses threshold comparison against `ThresholdConfig` type
- All sensor configs define `nominalValue`, `driftRange`, `noiseAmplitude`, `thresholds`
- Django `EnrichedSensorData` model uses `db_table = 'enriched_sensor_data'` (shared with Cloud Functions)

### Integration Points
- `simulation/constants.ts`: Add `BIOSIM_ZONE_CONFIGS` export
- `spatialhub-frontend/src/`: New file `simulation/biosimMapper.ts`
- `django_backend/sensor_data/`: New file `biosim_ingest.py`
- `tests/fixtures/biosim_module_state.json`: Primary test fixture input
- Store's `tick()` method: Mapper output feeds directly into this

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-data-mapping-layer*
*Context gathered: 2026-03-15*
