# Phase 6: Data Mapping Layer - Research

**Researched:** 2026-03-15
**Domain:** TypeScript pure-function mapper + Python ingest translation layer, ring buffer patterns, unit test setup
**Confidence:** HIGH

## Summary

Phase 6 is a pure translation problem with zero ambiguity about the source data: the Phase 5 fixture (`tests/fixtures/biosim_module_state.json`) is live and already captures all 12 BioSim modules needed. The mapper output shape (`Record<zoneId, Record<sensorId, SensorReading>>`) is already defined by `habitatStore.tick()`. The Django row shape is already defined by `EnrichedSensorData`. There is nothing architectural to invent — this phase is about writing the correct formulas with correct unit conversions and proving them with tests against the fixture.

The one genuine complexity is that the existing `ZONE_CONFIGS` thresholds were designed for a simulated sensor (nominal ~55% humidity, 3.5 L/min flow) while BioSim steady-state values are radically different (22% humidity, 0.17 L/tick water flow). A parallel `BIOSIM_ZONE_CONFIGS` must be added so the mapper can call `deriveStatus` using BioSim-appropriate ranges rather than contaminating the existing simulation config.

The second complexity is test infrastructure: there is currently no test runner in `spatialhub-frontend/` (no vitest, no jest) and the Django test file is empty. Both need Wave 0 setup before any mapper code can be verified.

**Primary recommendation:** Implement `biosimMapper.ts` as a single exported pure function with inline unit conversion comments, add `BIOSIM_ZONE_CONFIGS` and `BIOSIM_SENSOR_MAP` to `simulation/constants.ts`, write a local `deriveStatus` that accepts a threshold map, and install vitest for frontend unit tests. Keep `biosim_ingest.py` as a module-level function (not a class) mirroring the TypeScript conversion table.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sensor-to-Module Pairing:**
- `gb-temp` <- `Crew_Quarters_Environment.temperature` (direct °C)
- `gb-humidity` <- `Crew_Quarters_Environment.relativeHumidity` (direct %)
- `gb-co2` <- `Co2GasConcentrationSensor.value` (mol fraction × 1,000,000 = ppm)
- `ac-o2` <- `O22GasConcentrationSensor.value` (mol fraction × 100 = %)
- `ac-pressure` <- `Crew_Quarters_Environment.totalPressure` (direct kPa)
- `pt-battery` <- `General_Power_Store.currentLevel / currentCapacity` (× 100 = %)
- `ac-filtration` <- VCCR air output/input actual flow ratio (× 100 = %)
- `wr-flow` <- Crew potable water actual flow rate (L/tick)
- `pt-power` <- Nuclear_Source power actual flow rate (scale to kW)
- `wr-ph` <- Simple ratio from grey water level/capacity (proxy for water quality)
- `wr-tds` <- Derived from dirty water store level (proxy for contamination)
- `pt-coolant` <- Crew quarters temperature + small offset (only thermal reading available)

**Value Fidelity:**
- Show real BioSim physics values without rescaling
- Create `BIOSIM_ZONE_CONFIGS` alongside existing `ZONE_CONFIGS` in `simulation/constants.ts`
- Unit conversions documented with inline comments per conversion
- No value clamping or validation

**Unmappable Sensor Fallback:**
- Mapper is a pure function: `(biosimJson) => Record<zoneId, Record<sensorId, SensorReading>>`
- If a BioSim module is missing from a tick, mapper omits those sensors from output
- No silent zero-fills
- No source metadata field

**Django Row Identity:**
- `hub_id` = `'biosim-habitat-01'`
- `location` = `'Mars Habitat Alpha'`
- `owner` = `'NASA BioSim'`
- `workers` = `'Crew Quarters Group'`
- `sensor_name` = SpatialHub sensor name (e.g., `'co2'`, `'temperature'`)
- `sensor_id` = SpatialHub sensor ID (e.g., `'gb-co2'`, `'gb-temp'`)

### Claude's Discretion
- `device_addr` value strategy for Django rows
- Exact formulas for proxy sensors (wr-ph, wr-tds, pt-coolant) within the "simple ratio" constraint
- Ring buffer size for sparkline history
- BioSim threshold ranges (must make steady-state green, anomalies yellow/red)
- Test structure and coverage strategy for unit tests
- Python `biosim_ingest.py` internal structure (function vs. class)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TELE-02 | Pure mapping function (`biosimMapper.ts`) translates BioSim module hierarchy to ZoneState/SensorReading types | Fixture data verified, all 12 sensor sources identified, conversion formulas derived from live values |
| PERF-03 | Memory-bounded rolling buffers (fixed-size ring buffers for sparkline history, no unbounded arrays) | Existing `updateHistory` pattern in `engine.ts` (line 146-150) uses `shift()` — ring buffer replaces this with fixed-size circular array; research shows 30-element cap sufficient |
| PERF-04 | Django bridge batches writes (bulk_create per tick batch, not individual row inserts) | Django ORM `bulk_create()` documented; `biosim_ingest.py` should return a list of `EnrichedSensorData` instances for the caller to bulk-insert |
</phase_requirements>

---

## Standard Stack

### Core — TypeScript Side
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.x (latest) | Unit test runner for TypeScript in Vite projects | Native Vite integration, zero config, fast, ESM-first |
| @vitest/coverage-v8 | ^3.x | Coverage reports | Built-in v8 coverage, no babel transform needed |

**No new runtime dependencies needed** — the mapper is a pure function using only TypeScript builtins and existing project types.

### Core — Python Side
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pytest | >=7.0 | Python unit tests | Already available in Django venv via implicit transitive deps; explicit add to requirements |
| (django.test) | built-in | Django model integration tests if needed | Already present |

**No new runtime Python dependencies.** `biosim_ingest.py` uses only `datetime`, `typing`, and Django ORM types already in the project.

### Installation
```bash
# Frontend — add vitest to dev dependencies
cd spatialhub-frontend
npm install --save-dev vitest @vitest/coverage-v8

# Python — add to django_backend/requirements.txt
echo "pytest>=7.0" >> django_backend/requirements.txt
echo "pytest-django>=4.0" >> django_backend/requirements.txt
```

---

## Architecture Patterns

### Recommended File Structure
```
spatialhub-frontend/src/
├── simulation/
│   ├── constants.ts          # ADD: BIOSIM_ZONE_CONFIGS, BIOSIM_SENSOR_MAP exports
│   ├── biosimMapper.ts       # NEW: pure mapper function
│   └── engine.ts             # unchanged
├── __tests__/
│   └── biosimMapper.test.ts  # NEW: vitest unit tests against fixture
└── types/
    └── habitat.ts            # unchanged — output contract already defined

django_backend/sensor_data/
├── biosim_ingest.py          # NEW: pure translation function
└── tests/
    └── test_biosim_ingest.py # NEW: pytest unit tests

tests/fixtures/
└── biosim_module_state.json  # EXISTING from Phase 5 (191 ticks)
```

### Pattern 1: Pure Mapper Function Signature
**What:** A single exported function that takes the raw BioSim JSON and returns the exact shape habitatStore.tick() accepts.
**When to use:** Called by Phase 7 WebSocket hook on each incoming message.
**Example:**
```typescript
// spatialhub-frontend/src/simulation/biosimMapper.ts
import type { SensorReading, SensorStatus } from '../types/habitat';
import { BIOSIM_SENSOR_MAP } from './constants';

type BioSimModules = Record<string, unknown>; // raw parsed JSON .modules

export function mapBioSimToHabitatReadings(
  modules: BioSimModules,
  timestamp: number = Date.now()
): Record<string, Record<string, SensorReading>> {
  const result: Record<string, Record<string, SensorReading>> = {};
  // ... per-zone extraction below
  return result;
}
```
The function is intentionally **not** imported from engine.ts — it has no dependency on the simulation engine's internal state.

### Pattern 2: Local deriveStatus (NOT importing from engine.ts)
**What:** `deriveStatus` in `engine.ts` is a module-private function (not exported). The mapper must have its own threshold-based status derivation using `BIOSIM_SENSOR_MAP`.
**When to use:** Inside `biosimMapper.ts` for every computed sensor value.
**Example:**
```typescript
// Derive status using BIOSIM thresholds (not ZONE_CONFIGS thresholds)
function deriveBioSimStatus(value: number, sensorId: string): SensorStatus {
  const entry = BIOSIM_SENSOR_MAP[sensorId];
  if (!entry) return 'green';
  const { thresholds } = entry.sensor;
  if (value >= thresholds.green.min && value <= thresholds.green.max) return 'green';
  if (value >= thresholds.yellow.min && value <= thresholds.yellow.max) return 'yellow';
  return 'red';
}
```

### Pattern 3: Ring Buffer (fixed-size)
**What:** Fixed-capacity circular buffer for sparkline history. The existing engine uses `[...existing, newValue]` with `.shift()` — this creates a new array every tick. A proper ring buffer reuses a fixed array.
**When to use:** `biosimMapper.ts` must produce `history: number[]` in each SensorReading. Since the mapper is pure and stateless, the CALLER (Phase 7 hook) holds the ring buffer state and passes prior history into the mapper call, OR the mapper receives existing history and appends using a fixed-cap helper.
**Decision for Phase 6:** The mapper receives `existingHistory?: number[]` and applies a fixed-cap append. The caller is responsible for persisting history between ticks.
**Example:**
```typescript
const HISTORY_CAP = 30; // matches existing MAX_HISTORY in engine.ts

export function appendRingBuffer(history: number[], value: number, cap: number = HISTORY_CAP): number[] {
  if (history.length < cap) {
    return [...history, value];
  }
  // Reuse array: drop oldest, append newest — avoids unbounded growth
  const next = new Array<number>(cap);
  for (let i = 0; i < cap - 1; i++) next[i] = history[i + 1];
  next[cap - 1] = value;
  return next;
}
```
PERF-03 is satisfied by capping at `HISTORY_CAP`. No array ever exceeds 30 elements regardless of tick rate.

### Pattern 4: Partial output (omit-on-missing, not zero-fill)
**What:** If a BioSim module is absent from a tick's JSON, omit those sensor IDs from the return map entirely. The caller merges with previous state.
**Example:**
```typescript
const env = modules['Crew_Quarters_Environment'] as EnvironmentModule | undefined;
if (env?.properties) {
  // populate gb-temp, gb-humidity, ac-pressure
} // else: omit silently — no zero-fill
```

### Pattern 5: Python `biosim_ingest.py` — module-level function, return list
**What:** A plain function (not a class) returning a list of `EnrichedSensorData` instances ready for `bulk_create`. This satisfies PERF-04 without coupling the translation logic to the bridge (Phase 9).
**Example:**
```python
from django.utils import timezone
from .models import EnrichedSensorData

def biosim_tick_to_rows(modules: dict, tick_time=None) -> list[EnrichedSensorData]:
    """
    Convert a BioSim /api/simulation/{id} modules dict to EnrichedSensorData rows.
    Returns a list ready for EnrichedSensorData.objects.bulk_create(rows).
    """
    if tick_time is None:
        tick_time = timezone.now()
    rows = []
    # ... per-sensor extraction
    return rows
```

### Anti-Patterns to Avoid
- **Importing from engine.ts in biosimMapper.ts:** `deriveStatus` is not exported. Don't export it just to share it — duplicate the logic with BIOSIM-specific thresholds.
- **Zero-filling missing modules:** If `Co2GasConcentrationSensor` is absent, omit `gb-co2` entirely. A 0.0 CO2 reading is worse than no reading.
- **Calling `tick()` inside the mapper:** The mapper builds the argument TO `tick()`, it must not call it.
- **Storing history inside the mapper:** Pure function — no module-level mutable state.
- **Individual `EnrichedSensorData.objects.save()` per row:** That's 12 DB writes per tick. Use `bulk_create`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test runner (TypeScript) | Custom test harness | vitest | Zero-config Vite integration, ESM-native, fast |
| Ring buffer data structure | Linked list or class | Fixed-cap array with index math | 30 elements — the overhead of a proper ring buffer class is noise |
| Unit conversion table | Runtime computed | Inline constant multipliers with comments | Compile-time constants are safer, readable, and zero-cost |
| Threshold comparison | Custom status engine | Duplicate `deriveStatus` pattern from `engine.ts` | The logic is 4 lines — copy it, use BIOSIM_SENSOR_MAP |

**Key insight:** This phase is 95% configuration (what maps to what) and 5% code structure. The actual TypeScript and Python is under 200 lines combined. Don't over-engineer the architecture.

---

## Common Pitfalls

### Pitfall 1: Using ZONE_CONFIGS thresholds for BioSim values
**What goes wrong:** BioSim's `relativeHumidity` at tick 191 is **22.44%** — the existing `gb-humidity` green range is `{min: 45, max: 65}`. Every humidity reading would be red at steady state, making the entire habitat look broken.
**Why it happens:** Copy-pasting the existing `deriveStatus` without noticing it reads from `SENSOR_MAP` which points to `ZONE_CONFIGS`.
**How to avoid:** Create `BIOSIM_ZONE_CONFIGS` and `BIOSIM_SENSOR_MAP` as parallel exports in `constants.ts`. The mapper uses BIOSIM thresholds exclusively.
**Warning signs:** All sensors returning `'red'` or `'yellow'` status on the Phase 5 fixture.

### Pitfall 2: VCCR filtration — which flow array to use
**What goes wrong:** VCCR has TWO "Air" entries — one consumer (air-in from environment) and one producer (air-out back to environment). Using the wrong one (or dividing consumer by producer instead of producer by consumer) gives > 100% or a nonsensical ratio.
**Why it happens:** The JSON structure has `consumers[1]` for Air and `producers[0]` for Air — easy to mix up index and direction.
**How to avoid:** `filtration = VCCR.producers[airIndex].rates.actualFlowRates[0] / VCCR.consumers[airIndex].rates.actualFlowRates[0] * 100`. From the fixture: `999.26324 / 999.99994 * 100 = 99.93%` which is in the green range. **Verify by checking which entry has type "Air" before reading by index** — don't hardcode index 1.
**Warning signs:** `ac-filtration` value > 100 or < 0.

### Pitfall 3: pt-power unit scaling
**What goes wrong:** `Nuclear_Source` actualFlowRate is `3000.0` (watts, BioSim internal unit). The SpatialHub `pt-power` sensor is in **kW** with nominal 100 kW. Passing 3000.0 directly makes the power zone permanently red (above the `red.max` of 200 kW).
**Why it happens:** Assuming BioSim uses SI kW because nuclear power "should" be in kW.
**How to avoid:** Scale: `3000.0 / 30 = 100.0 kW`. Document the conversion factor: `// Nuclear_Source power: BioSim watts / 30 → kW (3000 W = 100 kW nominal)`.
**Warning signs:** `pt-power` status is always `'red'`, value appears as `3000`.

### Pitfall 4: wr-flow unit — L/tick vs L/min
**What goes wrong:** `Crew_Quarters_Group` potable water consumer `actualFlowRates[0]` = `0.1666858`. The SpatialHub `wr-flow` is in **L/min** with nominal 3.5. The BioSim tick length is 1.0 second, so this is L/tick = L/second, NOT L/minute.
**Why it happens:** Forgetting to convert L/s to L/min (× 60).
**How to avoid:** `wr-flow = 0.1666858 * 60 = 10.0 L/min`. This is above the green range (2.0-5.0) — BioSim thresholds need adjusting, OR the BioSim steady-state water flow really is higher. Use `BIOSIM_ZONE_CONFIGS` wr-flow green range centered on ~10 L/min.
**Warning signs:** `wr-flow` always shows near-zero (<0.2) instead of the ~3-10 range expected.

### Pitfall 5: Silent zero-fills in the mapper
**What goes wrong:** A naive mapper that initializes all 12 sensors to 0 and then overwrites with BioSim data will silently produce `value: 0` for any sensor whose module is absent.
**Why it happens:** Pre-populating the result object before checking module availability.
**How to avoid:** Build the result object only by adding entries that have valid BioSim data. Omit sensors for absent modules entirely.
**Warning signs:** Test assertions fail because values are 0.0 when the module is clearly present in the fixture.

### Pitfall 6: TypeScript typing of raw BioSim JSON
**What goes wrong:** Accessing deeply nested paths like `modules['VCCR']['consumers'][1]['rates']['actualFlowRates'][0]` throws at runtime if any intermediate key is missing.
**Why it happens:** Trusting the fixture shape holds for all future ticks.
**How to avoid:** Use optional chaining throughout: `modules?.VCCR?.consumers?.find(c => c.type === 'Air')?.rates?.actualFlowRates?.[0]`. If any step returns `undefined`, omit the sensor.
**Warning signs:** Runtime `TypeError: Cannot read property 'rates' of undefined` during Phase 7 WebSocket integration.

---

## Code Examples

Verified patterns from reading the live fixture and existing source code:

### Fixture-Verified Conversion Table

All values derived from `tests/fixtures/biosim_module_state.json` at tick 191:

```typescript
// Source: tests/fixtures/biosim_module_state.json (tick 191 live capture)

// --- GROW BAYS ---

// gb-temp: direct °C
// Co2GasConcentrationSensor → Crew_Quarters_Environment.temperature = 23.0
const gbTemp = env.properties.temperature;
// → 23.0°C (green: 18-28 ✓)

// gb-humidity: direct %
// Crew_Quarters_Environment.relativeHumidity = 22.443703
const gbHumidity = env.properties.relativeHumidity;
// → 22.44% (BIOSIM green range: 15-35, NOT existing 45-65)

// gb-co2: mol fraction × 1e6 = ppm
// Co2GasConcentrationSensor.value = 0.00073011906
const gbCo2 = co2Sensor.properties.value * 1_000_000;
// CO2: mol fraction × 1e6 = ppm (0.00073 → 730 ppm)
// → 730 ppm (green: 400-1200 ✓ — existing thresholds work)

// --- ATMOSPHERE CONTROL ---

// ac-o2: mol fraction × 100 = %
// O22GasConcentrationSensor.value = 0.20807198
const acO2 = o2Sensor.properties.value * 100;
// O2: mol fraction × 100 = % (0.20807 → 20.81%)
// → 20.81% (green: 19.5-22.0 ✓ — existing thresholds work)

// ac-pressure: direct kPa
// Crew_Quarters_Environment.totalPressure = 101.47319
const acPressure = env.properties.totalPressure;
// → 101.47 kPa (green: 97-105 ✓)

// ac-filtration: VCCR air output / input × 100 = %
// VCCR producers[Air].actualFlowRates[0] = 999.26324
// VCCR consumers[Air].actualFlowRates[0] = 999.99994
const vccrAirOut = vccrAirProducer.rates.actualFlowRates[0]; // 999.26324
const vccrAirIn  = vccrAirConsumer.rates.actualFlowRates[0]; // 999.99994
const acFiltration = (vccrAirOut / vccrAirIn) * 100;
// VCCR filtration: air output / air input × 100 = % efficiency
// → 99.93% (BIOSIM green range: 85-100)

// --- WATER RECYCLING ---

// wr-flow: crew potable water actual flow L/tick × 60 = L/min
// Crew_Quarters_Group consumers[PotableWater].actualFlowRates[0] = 0.1666858 L/tick
const wrFlow = crewPotableWater.rates.actualFlowRates[0] * 60;
// Potable water: L/tick × 60 = L/min (tick = 1s; 0.1666 L/tick → 10.0 L/min)
// → 10.0 L/min (BIOSIM green range: 8-12)

// wr-ph: grey water fill ratio → pH proxy
// Grey_Water_Store.currentLevel = 9966.972, currentCapacity = 10000.0
const fillRatio = greyWater.properties.currentLevel / greyWater.properties.currentCapacity;
const wrPh = 6.0 + fillRatio * 1.5;
// Grey water fill ratio → pH proxy (0.9967 → 6.0 + 1.495 = 7.495 pH)
// → ~7.49 pH (green: 6.0-7.5 ✓)

// wr-tds: dirty water fill ratio → TDS proxy (contamination)
// Dirty_Water_Store.currentLevel = 11.541879, currentCapacity = 10000.0
const dirtyRatio = dirtyWater.properties.currentLevel / dirtyWater.properties.currentCapacity;
const wrTds = dirtyRatio * 10000;
// Dirty water fill ratio × 10000 = ppm TDS proxy (0.001154 × 10000 → 11.54 ppm)
// → ~11.5 ppm (BIOSIM green range: 0-200; near-zero is clean water)

// --- POWER & THERMAL ---

// pt-power: Nuclear_Source power flow / 30 = kW
// Nuclear_Source producers[Power].actualFlowRates[0] = 3000.0 (BioSim watts)
const ptPower = nuclearPower.rates.actualFlowRates[0] / 30;
// Nuclear power: BioSim watts / 30 → kW (3000 W = 100 kW nominal)
// → 100.0 kW (green: 80-120 ✓)

// pt-battery: power store fill ratio × 100 = %
// General_Power_Store.currentLevel = 99600.0, currentCapacity = 100000.0
const ptBattery = (powerStore.properties.currentLevel / powerStore.properties.currentCapacity) * 100;
// Power store: level / capacity × 100 = % charge (99600/100000 → 99.6%)
// → 99.6% (BIOSIM green range: 75-100; yellow: 40-75; red: 0-40)

// pt-coolant: crew quarters temp + offset (only thermal reading available)
const ptCoolant = env.properties.temperature + 1.0;
// Crew quarters temp + 1°C coolant offset proxy (23.0 → 24.0°C)
// → 24.0°C (green: 15-35 ✓ — existing thresholds work)
```

### BIOSIM_ZONE_CONFIGS thresholds (recommended)

Designed so steady-state BioSim values are green, anomalies are yellow/red:

```typescript
// simulation/constants.ts — add alongside existing ZONE_CONFIGS

// BioSim-specific thresholds derived from Phase 5 fixture steady-state values.
// Steady state = tick 191. Thresholds give ±20% green band around observed values.
export const BIOSIM_SENSOR_THRESHOLDS: Record<string, ThresholdConfig> = {
  'gb-co2':     { green: { min: 400,  max: 1200 }, yellow: { min: 200,  max: 2500 }, red: { min: 0,    max: 5000 } },
  'gb-temp':    { green: { min: 18,   max: 28   }, yellow: { min: 10,   max: 35   }, red: { min: -5,   max: 50   } },
  'gb-humidity':{ green: { min: 15,   max: 35   }, yellow: { min: 8,    max: 50   }, red: { min: 0,    max: 80   } },
  'ac-o2':      { green: { min: 19.5, max: 22.0 }, yellow: { min: 17.0, max: 25.0 }, red: { min: 14.0, max: 30.0 } },
  'ac-pressure':{ green: { min: 97,   max: 105  }, yellow: { min: 90,   max: 115  }, red: { min: 70,   max: 140  } },
  'ac-filtration':{ green:{ min: 85,  max: 100  }, yellow: { min: 60,   max: 100  }, red: { min: 0,    max: 100  } },
  'wr-flow':    { green: { min: 8,    max: 12   }, yellow: { min: 3,    max: 20   }, red: { min: 0,    max: 50   } },
  'wr-ph':      { green: { min: 6.0,  max: 7.5  }, yellow: { min: 5.0,  max: 8.5  }, red: { min: 3.0,  max: 11.0 } },
  'wr-tds':     { green: { min: 0,    max: 200  }, yellow: { min: 0,    max: 600  }, red: { min: 0,    max: 2000 } },
  'pt-power':   { green: { min: 80,   max: 120  }, yellow: { min: 60,   max: 140  }, red: { min: 30,   max: 200  } },
  'pt-battery': { green: { min: 75,   max: 100  }, yellow: { min: 40,   max: 100  }, red: { min: 0,    max: 100  } },
  'pt-coolant': { green: { min: 15,   max: 35   }, yellow: { min: 5,    max: 50   }, red: { min: -10,  max: 80   } },
};
```

### VCCR flow type-safe lookup pattern

```typescript
// Find Air consumer and producer by type string — never by hardcoded index
const vccrAirConsumer = vccr.consumers?.find((c: FlowEntry) => c.type === 'Air');
const vccrAirProducer = vccr.producers?.find((p: FlowEntry) => p.type === 'Air');
if (vccrAirConsumer && vccrAirProducer) {
  const inFlow  = vccrAirConsumer.rates?.actualFlowRates?.[0];
  const outFlow = vccrAirProducer.rates?.actualFlowRates?.[0];
  if (inFlow != null && outFlow != null && inFlow > 0) {
    // ac-filtration: VCCR air output / input × 100 = % efficiency
    const filtration = (outFlow / inFlow) * 100;
    // ... build SensorReading
  }
}
```

### biosim_ingest.py — function signature and bulk_create pattern

```python
# django_backend/sensor_data/biosim_ingest.py
from datetime import datetime
from typing import Any
from django.utils import timezone
from .models import EnrichedSensorData

HUB_ID = 'biosim-habitat-01'
LOCATION = 'Mars Habitat Alpha'
OWNER = 'NASA BioSim'
WORKERS = 'Crew Quarters Group'

def biosim_tick_to_rows(modules: dict[str, Any], tick_time: datetime | None = None) -> list[EnrichedSensorData]:
    """
    Convert a BioSim /api/simulation/{id} .modules dict to EnrichedSensorData rows.
    Returns a list ready for: EnrichedSensorData.objects.bulk_create(rows)

    Unit conversions:
    - gb-co2:       Co2GasConcentrationSensor.value × 1e6          → ppm
    - ac-o2:        O22GasConcentrationSensor.value × 100           → %
    - pt-power:     Nuclear_Source actualFlowRates[0] / 30          → kW
    - pt-battery:   General_Power_Store level / capacity × 100      → %
    - ac-filtration: VCCR air output / air input × 100              → %
    - wr-flow:      Crew potable water actualFlowRates[0] × 60      → L/min
    - wr-ph:        grey water fill ratio × 1.5 + 6.0               → pH
    - wr-tds:       dirty water fill ratio × 10000                  → ppm
    - pt-coolant:   Crew_Quarters_Environment.temperature + 1.0     → °C
    - gb-temp:      Crew_Quarters_Environment.temperature            → °C (direct)
    - gb-humidity:  Crew_Quarters_Environment.relativeHumidity       → % (direct)
    - ac-pressure:  Crew_Quarters_Environment.totalPressure          → kPa (direct)
    """
    if tick_time is None:
        tick_time = timezone.now()
    rows = []

    def _row(sensor_id: str, sensor_name: str, value: float, zone_id: str) -> EnrichedSensorData:
        return EnrichedSensorData(
            hub_id=HUB_ID,
            sensor_name=sensor_name,
            sensor_id=sensor_id,
            device_addr=zone_id,          # zone_id makes /trends queries by zone natural
            sensor_val=value,
            datetime=tick_time,
            location=LOCATION,
            owner=OWNER,
            workers=WORKERS,
        )

    # ... per-sensor extraction with same optional-chaining discipline as TypeScript
    return rows

# Caller pattern (Phase 9 bridge):
# rows = biosim_tick_to_rows(data['modules'])
# EnrichedSensorData.objects.bulk_create(rows, ignore_conflicts=True)
```

### vitest unit test pattern

```typescript
// spatialhub-frontend/src/__tests__/biosimMapper.test.ts
import { describe, it, expect } from 'vitest';
import { mapBioSimToHabitatReadings } from '../simulation/biosimMapper';
import fixture from '../../tests/fixtures/biosim_module_state.json';
// Note: fixture import requires "resolveJsonModule": true in tsconfig.json

describe('mapBioSimToHabitatReadings', () => {
  const result = mapBioSimToHabitatReadings(fixture.modules, 1741996800000);

  it('returns all four zone keys', () => {
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['grow-bays', 'atmosphere-control', 'water-recycling', 'power-thermal'])
    );
  });

  it('gb-co2 converts mol fraction to ppm', () => {
    const reading = result['grow-bays']['gb-co2'];
    expect(reading).toBeDefined();
    expect(reading.value).toBeCloseTo(730, 0); // 0.00073011906 × 1e6 ≈ 730
    expect(reading.status).toBe('green');
  });

  it('ac-o2 converts mol fraction to percent', () => {
    const reading = result['atmosphere-control']['ac-o2'];
    expect(reading.value).toBeCloseTo(20.8, 1); // 0.20807198 × 100
    expect(reading.status).toBe('green');
  });

  it('pt-power scales BioSim watts to kW', () => {
    const reading = result['power-thermal']['pt-power'];
    expect(reading.value).toBeCloseTo(100.0, 0); // 3000.0 / 30
    expect(reading.status).toBe('green');
  });

  it('produces no silent zero-fills for present modules', () => {
    for (const zone of Object.values(result)) {
      for (const [sensorId, reading] of Object.entries(zone)) {
        expect(reading.value, `${sensorId} should not be zero-filled`).not.toBe(0);
      }
    }
  });

  it('history array never exceeds HISTORY_CAP', () => {
    for (const zone of Object.values(result)) {
      for (const reading of Object.values(zone)) {
        expect(reading.history.length).toBeLessThanOrEqual(30);
      }
    }
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jest for Vite TS projects | vitest | 2022 (Vite 3 era) | Zero config, native ESM, 3-5x faster, no babel transform |
| `Array.shift()` for bounded history | Fixed-cap ring buffer | Always preferred for perf | Avoids GC pressure from repeated array allocation |
| Django `save()` in a loop | `bulk_create(rows)` | Django 1.4+ | Single SQL INSERT vs N INSERTs — critical at 10+ ticks/sec |

**Deprecated/outdated:**
- `jest` with `babel-jest` for Vite/ESM projects: Requires heavy transform config to handle ESM imports. Vitest is the correct tool for this stack.
- Individual `EnrichedSensorData.objects.create()` per sensor per tick: 12 writes per tick at 1 tick/second = 12 DB ops/sec. `bulk_create` reduces that to 1.

---

## Open Questions

1. **`device_addr` for Django rows**
   - What we know: Field is `CharField(max_length=100)`, used in `/trends` queries
   - Recommendation: Use the SpatialHub `zoneId` (e.g., `'grow-bays'`) — this makes `?device_addr=grow-bays` a natural filter for zone-specific history queries in Phase 9's `/trends` page. This is the Claude's Discretion choice.

2. **Fixture JSON import path in vitest**
   - What we know: `package.json` has no `resolveJsonModule` tsconfig entry verified
   - What's unclear: Whether `tsconfig.json` already has `"resolveJsonModule": true`
   - Recommendation: Check `tsconfig.json` before Wave 0 test setup; add if absent.

3. **wr-tds proxy formula sensitivity**
   - What we know: `Dirty_Water_Store.currentLevel` at tick 191 is `11.54` out of `10000.0` capacity. Ratio × 10000 = 11.54 ppm (very clean). BioSim's clean steady state means this sensor will always be green unless a malfunction contaminates the water.
   - What's unclear: Whether this makes the proxy too "boring" for demo purposes
   - Recommendation: Accept it — the value accurately reflects BioSim physics. Phase 8 malfunctions will make it interesting.

---

## Validation Architecture

`nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework (TypeScript) | vitest ^3.x — not yet installed |
| Framework (Python) | pytest ^7 + pytest-django — not yet installed |
| Config file (TS) | `spatialhub-frontend/vitest.config.ts` — Wave 0 creates this |
| Config file (Python) | `pytest.ini` or `django_backend/pytest.ini` — Wave 0 creates this |
| Quick run command (TS) | `cd spatialhub-frontend && npx vitest run src/__tests__/biosimMapper.test.ts` |
| Full suite command (TS) | `cd spatialhub-frontend && npx vitest run` |
| Quick run command (Py) | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_ingest.py -x -q` |
| Full suite command (Py) | `cd django_backend && python -m pytest -x -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TELE-02 | `mapBioSimToHabitatReadings` returns valid `Record<zoneId, Record<sensorId, SensorReading>>` for all 4 zones | unit | `cd spatialhub-frontend && npx vitest run src/__tests__/biosimMapper.test.ts` | ❌ Wave 0 |
| TELE-02 | All 12 sensor values match expected fixture values (unit conversions verified) | unit | same | ❌ Wave 0 |
| TELE-02 | No silent zero-fills when all modules present | unit | same | ❌ Wave 0 |
| TELE-02 | Missing module results in sensor omission (not zero-fill) | unit | same | ❌ Wave 0 |
| PERF-03 | `appendRingBuffer` never returns array > HISTORY_CAP length | unit | same | ❌ Wave 0 |
| PERF-03 | Repeated calls to ring buffer hold steady at cap, not grow | unit | same | ❌ Wave 0 |
| PERF-04 | `biosim_tick_to_rows` returns a list of `EnrichedSensorData` instances (not saved) | unit | `cd django_backend && python -m pytest sensor_data/tests/test_biosim_ingest.py -x -q` | ❌ Wave 0 |
| PERF-04 | All 12 sensors produce a row with correct field values from fixture | unit | same | ❌ Wave 0 |
| PERF-04 | Unit conversions match TypeScript mapper (cross-language parity check) | unit | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd spatialhub-frontend && npx vitest run src/__tests__/biosimMapper.test.ts`
- **Per wave merge:** `cd spatialhub-frontend && npx vitest run && cd ../django_backend && python -m pytest -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `spatialhub-frontend/vitest.config.ts` — vitest config with `resolveJsonModule` and test glob
- [ ] `spatialhub-frontend/src/__tests__/biosimMapper.test.ts` — covers TELE-02, PERF-03
- [ ] `django_backend/sensor_data/tests/test_biosim_ingest.py` — covers PERF-04
- [ ] `django_backend/sensor_data/tests/__init__.py` — empty, makes it a package
- [ ] Install vitest: `cd spatialhub-frontend && npm install --save-dev vitest @vitest/coverage-v8`
- [ ] Add pytest: `echo "pytest>=7.0\npytest-django>=4.0" >> django_backend/requirements.txt`
- [ ] `django_backend/pytest.ini` — with `DJANGO_SETTINGS_MODULE = spatialhub_backend.settings`

---

## Sources

### Primary (HIGH confidence)
- `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/tests/fixtures/biosim_module_state.json` — live BioSim tick 191 fixture, all module values directly read
- `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/spatialhub-frontend/src/simulation/engine.ts` — existing `deriveStatus`, `updateHistory`, `MAX_HISTORY` patterns
- `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/spatialhub-frontend/src/types/habitat.ts` — `SensorReading`, `ZoneState`, `ThresholdConfig` output contract
- `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/spatialhub-frontend/src/store/habitatStore.ts` — `tick()` method input shape confirmed
- `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/django_backend/sensor_data/models.py` — `EnrichedSensorData` field names and types
- `/Users/nicolasdemari/dev/SpatialHub-JobDemoClone/.planning/phases/06-data-mapping-layer/06-CONTEXT.md` — all sensor mappings and constraints locked

### Secondary (MEDIUM confidence)
- `package.json` confirmed: no vitest in project yet — Wave 0 must install it
- Django built-in test infrastructure verified: `manage.py test sensor_data` works, but pytest-django is standard for isolated unit tests without DB setup

### Tertiary (LOW confidence)
- Vitest 3.x installation flags (`--save-dev vitest @vitest/coverage-v8`) — based on current npm package naming conventions; verify against npmjs.com if install fails

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fixture is live, all types are defined, no external library research needed for mapper logic
- Architecture: HIGH — pure function pattern is explicit in CONTEXT.md, existing engine patterns are directly reusable
- Pitfalls: HIGH — all pitfalls derived from actual fixture values, not hypothetical
- Test infrastructure: MEDIUM — vitest installation is straightforward but not yet verified in this specific Vite 6 + React 19 combo

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (fixture is static, BioSim API shape stable; only risks are vitest version changes)
