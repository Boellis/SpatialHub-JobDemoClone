// BioSim -> Habitat data mapper
// Translates BioSim raw physics module JSON into the SensorReading shape
// consumed by habitatStore.tick(). Pure function — no side effects.
//
// Phase 7's WebSocket hook calls mapBioSimToHabitatReadings on every incoming
// BioSim message, passing the previous history arrays as existingHistory.

import type { SensorReading, SensorStatus } from '../types/habitat';
import { BIOSIM_SENSOR_THRESHOLDS } from './constants';

/** Fixed ring-buffer cap. Matches MAX_HISTORY in engine.ts. */
export const HISTORY_CAP = 60;

/**
 * Append a value to a fixed-capacity ring buffer.
 * Never returns an array longer than `cap` (default: HISTORY_CAP).
 */
export function appendRingBuffer(
  history: number[],
  value: number,
  cap: number = HISTORY_CAP,
): number[] {
  if (history.length < cap) {
    return [...history, value];
  }
  // Slide the window: drop oldest, append newest
  const next = new Array<number>(cap);
  for (let i = 0; i < cap - 1; i++) {
    next[i] = history[i + 1];
  }
  next[cap - 1] = value;
  return next;
}

/** Derive sensor status using BIOSIM_SENSOR_THRESHOLDS. */
function deriveBioSimStatus(value: number, sensorId: string): SensorStatus {
  const thresholds = BIOSIM_SENSOR_THRESHOLDS[sensorId];
  if (!thresholds) return 'green';
  const { green, yellow } = thresholds;
  if (value >= green.min && value <= green.max) return 'green';
  if (value >= yellow.min && value <= yellow.max) return 'yellow';
  return 'red';
}

/** Build a SensorReading, or return undefined if value is not finite. */
function makeReading(
  sensorId: string,
  zoneId: string,
  rawValue: number | undefined | null,
  timestamp: number,
  existingHistory: Record<string, Record<string, number[]>> | undefined,
): SensorReading | undefined {
  if (typeof rawValue !== 'number' || !isFinite(rawValue)) return undefined;
  const prevHistory = existingHistory?.[zoneId]?.[sensorId] ?? [];
  return {
    sensorId,
    zoneId,
    value: rawValue,
    status: deriveBioSimStatus(rawValue, sensorId),
    timestamp,
    history: appendRingBuffer(prevHistory, rawValue),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BioSimModules = Record<string, any>;

/**
 * Map BioSim module state to the Record<zoneId, Record<sensorId, SensorReading>>
 * shape accepted by habitatStore.tick().
 *
 * @param modules       - The `modules` property of a BioSim simulation state response.
 * @param timestamp     - Unix ms timestamp for all readings (defaults to Date.now()).
 * @param existingHistory - Previous history arrays per zone/sensor (for ring buffer continuity).
 *
 * Rules:
 * - All intermediate property accesses use optional chaining.
 * - A sensor is only included if its extracted value is a finite number (no zero-fills).
 * - Missing BioSim modules produce sensor omission, not zero-fills.
 */
export function mapBioSimToHabitatReadings(
  modules: BioSimModules,
  timestamp?: number,
  existingHistory?: Record<string, Record<string, number[]>>,
): Record<string, Record<string, SensorReading>> {
  const ts = timestamp ?? Date.now();

  // Helper to add a reading to the result if the value is valid
  function add(
    result: Record<string, Record<string, SensorReading>>,
    zoneId: string,
    sensorId: string,
    rawValue: number | undefined | null,
  ): void {
    const reading = makeReading(sensorId, zoneId, rawValue, ts, existingHistory);
    if (reading === undefined) return;
    if (!result[zoneId]) result[zoneId] = {};
    result[zoneId][sensorId] = reading;
  }

  const result: Record<string, Record<string, SensorReading>> = {};

  // -------------------------------------------------------------------------
  // GROW BAYS (zoneId: 'grow-bays')
  // -------------------------------------------------------------------------
  const env = modules?.Crew_Quarters_Environment?.properties;
  const co2Sensor = modules?.Co2GasConcentrationSensor?.properties;

  // gb-temp: direct Celsius from crew quarters environment
  add(result, 'grow-bays', 'gb-temp', env?.temperature);

  // gb-humidity: direct percent from crew quarters environment
  add(result, 'grow-bays', 'gb-humidity', env?.relativeHumidity);

  // gb-co2: mol fraction -> ppm (multiply by 1e6)
  const co2MolFraction: number | undefined = co2Sensor?.value;
  add(result, 'grow-bays', 'gb-co2',
    co2MolFraction !== undefined ? co2MolFraction * 1_000_000 : undefined,
  );

  // -------------------------------------------------------------------------
  // ATMOSPHERE CONTROL (zoneId: 'atmosphere-control')
  // -------------------------------------------------------------------------
  const o2Sensor = modules?.O22GasConcentrationSensor?.properties;

  // ac-o2: mol fraction -> % (multiply by 100)
  const o2MolFraction: number | undefined = o2Sensor?.value;
  add(result, 'atmosphere-control', 'ac-o2',
    o2MolFraction !== undefined ? o2MolFraction * 100 : undefined,
  );

  // ac-pressure: direct kPa from crew quarters environment
  add(result, 'atmosphere-control', 'ac-pressure', env?.totalPressure);

  // ac-filtration: VCCR air output / air input * 100 = % efficiency
  const vccr = modules?.VCCR;
  const vccrAirConsumer = vccr?.consumers?.find(
    (c: { type: string }) => c.type === 'Air',
  );
  const vccrAirProducer = vccr?.producers?.find(
    (p: { type: string }) => p.type === 'Air',
  );
  const airIn: number | undefined = vccrAirConsumer?.rates?.actualFlowRates?.[0];
  const airOut: number | undefined = vccrAirProducer?.rates?.actualFlowRates?.[0];
  add(result, 'atmosphere-control', 'ac-filtration',
    airIn !== undefined && airOut !== undefined && airIn > 0
      ? (airOut / airIn) * 100
      : undefined,
  );

  // -------------------------------------------------------------------------
  // WATER RECYCLING (zoneId: 'water-recycling')
  // -------------------------------------------------------------------------
  const greyWater = modules?.Grey_Water_Store?.properties;
  const dirtyWater = modules?.Dirty_Water_Store?.properties;
  const crewGroup = modules?.Crew_Quarters_Group;

  // wr-flow: potable water consumption L/tick * 60 = L/min
  const potableWaterConsumer = crewGroup?.consumers?.find(
    (c: { type: string }) => c.type === 'PotableWater',
  );
  const flowLPerTick: number | undefined =
    potableWaterConsumer?.rates?.actualFlowRates?.[0];
  add(result, 'water-recycling', 'wr-flow',
    flowLPerTick !== undefined ? flowLPerTick * 60 : undefined,
  );

  // wr-ph: grey water fill ratio -> pH proxy (6.0 + ratio * 1.5)
  const greyLevel: number | undefined = greyWater?.currentLevel;
  const greyCap: number | undefined = greyWater?.currentCapacity;
  add(result, 'water-recycling', 'wr-ph',
    greyLevel !== undefined && greyCap !== undefined && greyCap > 0
      ? 6.0 + (greyLevel / greyCap) * 1.5
      : undefined,
  );

  // wr-tds: dirty water fill ratio * 10000 = ppm TDS proxy
  const dirtyLevel: number | undefined = dirtyWater?.currentLevel;
  const dirtyCap: number | undefined = dirtyWater?.currentCapacity;
  add(result, 'water-recycling', 'wr-tds',
    dirtyLevel !== undefined && dirtyCap !== undefined && dirtyCap > 0
      ? (dirtyLevel / dirtyCap) * 10_000
      : undefined,
  );

  // -------------------------------------------------------------------------
  // POWER & THERMAL (zoneId: 'power-thermal')
  // -------------------------------------------------------------------------
  const nuclearSource = modules?.Nuclear_Source;
  const powerStore = modules?.General_Power_Store?.properties;

  // pt-power: nuclear power watts / 30 = kW
  const nuclearProducer = nuclearSource?.producers?.find(
    (p: { type: string }) => p.type === 'Power',
  );
  const nuclearWatts: number | undefined =
    nuclearProducer?.rates?.actualFlowRates?.[0];
  add(result, 'power-thermal', 'pt-power',
    nuclearWatts !== undefined ? nuclearWatts / 30 : undefined,
  );

  // pt-battery: power store level / capacity * 100 = % charge
  const powerLevel: number | undefined = powerStore?.currentLevel;
  const powerCap: number | undefined = powerStore?.currentCapacity;
  add(result, 'power-thermal', 'pt-battery',
    powerLevel !== undefined && powerCap !== undefined && powerCap > 0
      ? (powerLevel / powerCap) * 100
      : undefined,
  );

  // pt-coolant: crew quarters temp + 1C offset (coolant proxy)
  add(result, 'power-thermal', 'pt-coolant',
    env?.temperature !== undefined ? env.temperature + 1.0 : undefined,
  );

  return result;
}
