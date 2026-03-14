// Mars Habitat simulation engine
// Produces realistic sensor telemetry on a 2-second tick cycle.
// Algorithm: drift (mean-reverting Brownian motion) + noise + sol cycle + intra-zone correlation

import type { SensorReading, SensorStatus } from '../types/habitat';
import { ZONE_CONFIGS, SENSOR_MAP, SOL_CYCLE_PERIOD } from './constants';
import { getAnomalyBias } from './anomalies';
import { useHabitatStore } from '../store/habitatStore';

// Tick interval in ms
const TICK_INTERVAL_MS = 2000;

// ---- Helpers ----------------------------------------------------------------

/** Derive sensor status from threshold config */
function deriveStatus(value: number, sensorId: string): SensorStatus {
  const entry = SENSOR_MAP[sensorId];
  if (!entry) return 'green';
  const { thresholds } = entry.sensor;

  if (value >= thresholds.green.min && value <= thresholds.green.max) return 'green';
  if (value >= thresholds.yellow.min && value <= thresholds.yellow.max) return 'yellow';
  return 'red';
}

/** Clamp a value to the red threshold range (physical bounds) */
function clamp(value: number, sensorId: string): number {
  const entry = SENSOR_MAP[sensorId];
  if (!entry) return value;
  const { red } = entry.sensor.thresholds;
  return Math.max(red.min, Math.min(red.max, value));
}

/** Sol cycle sinusoidal factor in range [-1, 1] */
function solFactor(solElapsed: number): number {
  return Math.sin((2 * Math.PI * solElapsed) / SOL_CYCLE_PERIOD);
}

// ---- Sol cycle amplitudes by sensor type ------------------------------------
// Returns how much the sol wave affects a given sensor type
function solAmplitude(sensorType: string, nominalValue: number): number {
  switch (sensorType) {
    case 'temperature': return 2.0;       // +/-2C (day/night cycle)
    case 'power':       return 15.0;      // +/-15 kW (solar input)
    case 'battery':     return 5.0;       // +/-5% (charges during "day")
    case 'co2':         return nominalValue * 0.03; // +/-3% (plant photosynthesis rhythm)
    case 'humidity':    return nominalValue * 0.02; // +/-2%
    case 'oxygen':      return 0.2;       // +/-0.2% (photosynthesis driven)
    default:            return nominalValue * 0.02; // +/-2% for everything else
  }
}

// ---- Per-tick value computation ---------------------------------------------

function computeNewValue(
  currentValue: number,
  sensorId: string,
  solElapsed: number,
  anomalyBias: number = 0
): number {
  const entry = SENSOR_MAP[sensorId];
  if (!entry) return currentValue;
  const { sensor } = entry;
  const { nominalValue, driftRange, noiseAmplitude, type } = sensor;

  // 1. Drift: mean-reverting random walk
  //    Pull toward nominal (0.02 factor) plus a small random walk component
  const drift =
    (nominalValue - currentValue) * 0.02 +
    (Math.random() - 0.5) * driftRange * 0.1;

  // 2. Noise: pure random jitter per tick
  const noise = (Math.random() - 0.5) * 2 * noiseAmplitude;

  // 3. Sol cycle: sinusoidal based on solElapsed
  const sol = solFactor(solElapsed) * solAmplitude(type, nominalValue);

  const raw = currentValue + drift + noise + sol + anomalyBias;
  return clamp(raw, sensorId);
}

// ---- Intra-zone correlation --------------------------------------------------
// After computing primary values, nudge correlated sensors.
// Strength: ~5-10% of primary sensor's deviation from nominal.

function applyCorrelations(
  zoneId: string,
  rawValues: Record<string, number>
): Record<string, number> {
  const corrected = { ...rawValues };

  if (zoneId === 'grow-bays') {
    // Temperature up -> humidity down (evapotranspiration)
    const tempEntry = SENSOR_MAP['gb-temp'];
    if (tempEntry) {
      const tempDev = (rawValues['gb-temp'] ?? tempEntry.sensor.nominalValue) - tempEntry.sensor.nominalValue;
      corrected['gb-humidity'] = (corrected['gb-humidity'] ?? 0) - tempDev * 0.08;
    }
    // CO2 up -> temperature up slightly (greenhouse warming effect)
    const co2Entry = SENSOR_MAP['gb-co2'];
    if (co2Entry) {
      const co2Dev = (rawValues['gb-co2'] ?? co2Entry.sensor.nominalValue) - co2Entry.sensor.nominalValue;
      corrected['gb-temp'] = (corrected['gb-temp'] ?? 0) + co2Dev * 0.005;
    }
  }

  if (zoneId === 'atmosphere-control') {
    // O2 drops -> pressure drops slightly (minor depressurization feel)
    const o2Entry = SENSOR_MAP['ac-o2'];
    if (o2Entry) {
      const o2Dev = (rawValues['ac-o2'] ?? o2Entry.sensor.nominalValue) - o2Entry.sensor.nominalValue;
      corrected['ac-pressure'] = (corrected['ac-pressure'] ?? 0) + o2Dev * 0.5;
    }
  }

  if (zoneId === 'water-recycling') {
    // pH up -> TDS up slightly (mineral concentration with alkalinity)
    const phEntry = SENSOR_MAP['wr-ph'];
    if (phEntry) {
      const phDev = (rawValues['wr-ph'] ?? phEntry.sensor.nominalValue) - phEntry.sensor.nominalValue;
      corrected['wr-tds'] = (corrected['wr-tds'] ?? 0) + phDev * 15;
    }
  }

  if (zoneId === 'power-thermal') {
    // Power drops -> coolant temp rises (heat buildup when output is low)
    const powerEntry = SENSOR_MAP['pt-power'];
    if (powerEntry) {
      const powerDev = (rawValues['pt-power'] ?? powerEntry.sensor.nominalValue) - powerEntry.sensor.nominalValue;
      corrected['pt-coolant'] = (corrected['pt-coolant'] ?? 0) - powerDev * 0.1;
    }
  }

  // Re-clamp after correlation nudges
  for (const sensorId of Object.keys(corrected)) {
    corrected[sensorId] = clamp(corrected[sensorId], sensorId);
  }

  return corrected;
}

// ---- History tracking -------------------------------------------------------

const MAX_HISTORY = 30;

function updateHistory(existing: number[], newValue: number): number[] {
  const next = [...existing, newValue];
  if (next.length > MAX_HISTORY) next.shift();
  return next;
}

// ---- Main tick function -----------------------------------------------------

function tick(): void {
  const state = useHabitatStore.getState();
  const { zones, solElapsed, anomalies } = state;

  const newReadings: Record<string, Record<string, SensorReading>> = {};

  for (const zone of ZONE_CONFIGS) {
    const { zoneId } = zone;
    const currentZone = zones[zoneId];
    if (!currentZone) continue;

    // Step 1: compute raw values per sensor (drift + noise + sol cycle + anomaly bias)
    const rawValues: Record<string, number> = {};
    for (const sensor of zone.sensors) {
      const current = currentZone.sensors[sensor.sensorId];
      rawValues[sensor.sensorId] = computeNewValue(
        current?.value ?? sensor.nominalValue,
        sensor.sensorId,
        solElapsed,
        getAnomalyBias(anomalies, sensor.sensorId)
      );
    }

    // Step 2: apply intra-zone correlations
    const correlatedValues = applyCorrelations(zoneId, rawValues);

    // Step 3: build final SensorReading objects with status and history
    const sensorReadings: Record<string, SensorReading> = {};
    for (const sensor of zone.sensors) {
      const newValue = correlatedValues[sensor.sensorId] ?? rawValues[sensor.sensorId];
      const existing = currentZone.sensors[sensor.sensorId];

      sensorReadings[sensor.sensorId] = {
        sensorId: sensor.sensorId,
        zoneId,
        value: newValue,
        status: deriveStatus(newValue, sensor.sensorId),
        timestamp: Date.now(),
        history: updateHistory(existing?.history ?? [], newValue),
      };
    }

    newReadings[zoneId] = sensorReadings;
  }

  // Push to store — apply sensor readings first, then advance anomaly phase timers.
  // CRITICAL ordering: anomalies state is read at the top of tick(), bias is applied during
  // sensor computation, and THEN tickAnomalies() advances phase counters. This ensures
  // the current tick's biasFactor is applied before it increments to the next value.
  state.tick(newReadings);
  state.tickAnomalies();
}

// ---- Engine factory ---------------------------------------------------------

export interface SimulationEngine {
  start: () => ReturnType<typeof setInterval>;
  stop: () => void;
}

export function createSimulationEngine(): SimulationEngine {
  let interval: ReturnType<typeof setInterval> | null = null;

  return {
    start(): ReturnType<typeof setInterval> {
      if (interval !== null) {
        clearInterval(interval);
      }
      interval = setInterval(tick, TICK_INTERVAL_MS);
      console.log('[SimulationEngine] Started — ticking every 2s');
      return interval;
    },

    stop(): void {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
        console.log('[SimulationEngine] Stopped');
      }
    },
  };
}
