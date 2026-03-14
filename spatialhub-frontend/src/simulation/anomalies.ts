// Mars Habitat anomaly scenario definitions and bias computation
// Each scenario describes a crisis event with per-sensor bias deltas.
// biasFactor (0-1) from the store state scales the crisisDelta linearly.

import type { AnomalyScenarioState } from '../types/habitat';

export interface SensorBias {
  sensorId: string;
  crisisDelta: number; // the delta applied at biasFactor = 1.0
}

export interface AnomalyScenario {
  id: string;
  label: string;
  icon: string;
  zoneId: string;
  zoneName: string;
  onsetTicks: number;    // ticks to ramp biasFactor 0 -> 1
  peakTicks: number;     // ticks to hold biasFactor at 1
  recoveryTicks: number; // ticks to ramp biasFactor 1 -> 0
  sensorBiases: SensorBias[];
}

// Research-validated against constants.ts thresholds.
// All four scenarios use identical pacing: ~30s total arc at 2s/tick.
export const ANOMALY_SCENARIOS: AnomalyScenario[] = [
  {
    id: 'co2-spike',
    label: 'CO2 Spike',
    icon: '☁️',
    zoneId: 'grow-bays',
    zoneName: 'Grow Bays',
    onsetTicks: 5,
    peakTicks: 7,
    recoveryTicks: 5,
    sensorBiases: [
      { sensorId: 'gb-co2',      crisisDelta: 3500  }, // 800 -> ~4300 ppm (deep red; max 5000)
      { sensorId: 'gb-temp',     crisisDelta: 18    }, // 22 -> ~40 C (red; max 50)
      { sensorId: 'gb-humidity', crisisDelta: -30   }, // 55 -> ~25% (red; min 10)
    ],
  },
  {
    id: 'pump-failure',
    label: 'Pump Failure',
    icon: '💧',
    zoneId: 'water-recycling',
    zoneName: 'Water Recycling',
    onsetTicks: 5,
    peakTicks: 7,
    recoveryTicks: 5,
    sensorBiases: [
      { sensorId: 'wr-flow', crisisDelta: -3.5  }, // 3.5 -> ~0 L/min (red; min 0)
      { sensorId: 'wr-ph',   crisisDelta: 3.5   }, // 6.8 -> ~10.3 pH (red; max 11)
      { sensorId: 'wr-tds',  crisisDelta: 900   }, // 400 -> ~1300 ppm (red; max 1500)
    ],
  },
  {
    id: 'nutrient-crash',
    label: 'Nutrient Crash',
    icon: '🌿',
    zoneId: 'water-recycling',
    zoneName: 'Water Recycling',
    onsetTicks: 5,
    peakTicks: 7,
    recoveryTicks: 5,
    sensorBiases: [
      { sensorId: 'wr-tds', crisisDelta: -380 }, // 400 -> ~20 ppm (red; min 0)
      { sensorId: 'wr-ph',  crisisDelta: -2.5 }, // 6.8 -> ~4.3 pH (red; min 3)
    ],
  },
  {
    id: 'power-fluctuation',
    label: 'Power Fluctuation',
    icon: '⚡',
    zoneId: 'power-thermal',
    zoneName: 'Power & Thermal',
    onsetTicks: 5,
    peakTicks: 7,
    recoveryTicks: 5,
    sensorBiases: [
      { sensorId: 'pt-power',   crisisDelta: -65 }, // 100 -> ~35 kW (red; min 30)
      { sensorId: 'pt-battery', crisisDelta: -62 }, // 78 -> ~16% (red; min 10)
      { sensorId: 'pt-coolant', crisisDelta: 45  }, // 24 -> ~69 C (red; max 80)
    ],
  },
];

/**
 * Compute the total anomaly bias for a given sensor across all active scenarios.
 *
 * PURE function — no store access. Receives anomaly state as a parameter.
 * Multiple concurrent anomalies accumulate additively.
 */
export function getAnomalyBias(
  anomalies: Record<string, AnomalyScenarioState>,
  sensorId: string
): number {
  let totalBias = 0;

  for (const scenario of ANOMALY_SCENARIOS) {
    const state = anomalies[scenario.id];

    // Skip idle entries or scenarios with no active bias
    if (!state || state.phase === 'idle' || state.biasFactor === 0) continue;

    const match = scenario.sensorBiases.find((b) => b.sensorId === sensorId);
    if (!match) continue;

    totalBias += match.crisisDelta * state.biasFactor;
  }

  return totalBias;
}
