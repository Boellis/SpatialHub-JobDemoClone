// Mars Habitat simulation constants
// Hardcoded zone/sensor configuration — source of truth for the simulation
// Django endpoint serves this same data for API integration demos, but the
// simulation runs entirely from these client-side constants.

import type { ZoneConfig, ThresholdConfig } from '../types/habitat';

export const ZONE_CONFIGS: ZoneConfig[] = [
  {
    zoneId: 'grow-bays',
    name: 'Grow Bays',
    description: 'Hydroponic crop growth chambers — the food supply for the habitat',
    position: { x: -8, y: 0, z: -4 },
    sensors: [
      {
        sensorId: 'gb-co2',
        name: 'CO2 Level',
        unit: 'ppm',
        type: 'co2',
        nominalValue: 800,
        driftRange: 200,   // ~25% of green range width
        noiseAmplitude: 15,
        thresholds: {
          green:  { min: 400,  max: 1200 },
          yellow: { min: 200,  max: 2500 },
          red:    { min: 0,    max: 5000 },
        },
      },
      {
        sensorId: 'gb-temp',
        name: 'Temperature',
        unit: 'C',
        type: 'temperature',
        nominalValue: 22,
        driftRange: 2.5,   // ~50% of 5C green range
        noiseAmplitude: 0.2,
        thresholds: {
          green:  { min: 18,   max: 28 },
          yellow: { min: 10,   max: 35 },
          red:    { min: -5,   max: 50 },
        },
      },
      {
        sensorId: 'gb-humidity',
        name: 'Humidity',
        unit: '%',
        type: 'humidity',
        nominalValue: 55,
        driftRange: 8,     // ~40% of 20% green range
        noiseAmplitude: 0.8,
        thresholds: {
          green:  { min: 45,   max: 65 },
          yellow: { min: 30,   max: 80 },
          red:    { min: 10,   max: 95 },
        },
      },
    ],
  },
  {
    zoneId: 'atmosphere-control',
    name: 'Atmosphere Control',
    description: 'Life support systems — O2 generation, pressure regulation, and air scrubbing',
    position: { x: 8, y: 0, z: -4 },
    sensors: [
      {
        sensorId: 'ac-o2',
        name: 'O2 Concentration',
        unit: '%',
        type: 'oxygen',
        nominalValue: 20.9,
        driftRange: 0.5,   // narrow band -- life support is tightly controlled
        noiseAmplitude: 0.05,
        thresholds: {
          green:  { min: 19.5, max: 22.0 },
          yellow: { min: 17.0, max: 25.0 },
          red:    { min: 14.0, max: 30.0 },
        },
      },
      {
        sensorId: 'ac-pressure',
        name: 'Pressure',
        unit: 'kPa',
        type: 'pressure',
        nominalValue: 101.3,
        driftRange: 3.0,
        noiseAmplitude: 0.3,
        thresholds: {
          green:  { min: 97,   max: 105 },
          yellow: { min: 90,   max: 115 },
          red:    { min: 70,   max: 140 },
        },
      },
      {
        sensorId: 'ac-filtration',
        name: 'Air Filtration Rate',
        unit: '%',
        type: 'filtration',
        nominalValue: 93,
        driftRange: 4.0,   // scrubber efficiency degrades gradually
        noiseAmplitude: 0.4,
        thresholds: {
          green:  { min: 88,   max: 100 },
          yellow: { min: 75,   max: 100 },
          red:    { min: 50,   max: 100 },
        },
      },
    ],
  },
  {
    zoneId: 'water-recycling',
    name: 'Water Recycling',
    description: 'Closed-loop water reclamation — urine processing, condensate recovery, mineral balancing',
    position: { x: -8, y: 0, z: 4 },
    sensors: [
      {
        sensorId: 'wr-ph',
        name: 'pH Level',
        unit: 'pH',
        type: 'ph',
        nominalValue: 6.8,
        driftRange: 0.5,
        noiseAmplitude: 0.05,
        thresholds: {
          green:  { min: 6.0,  max: 7.5 },
          yellow: { min: 5.0,  max: 8.5 },
          red:    { min: 3.0,  max: 11.0 },
        },
      },
      {
        sensorId: 'wr-flow',
        name: 'Water Flow Rate',
        unit: 'L/min',
        type: 'flow',
        nominalValue: 3.5,
        driftRange: 0.8,
        noiseAmplitude: 0.1,
        thresholds: {
          green:  { min: 2.0,  max: 5.0 },
          yellow: { min: 0.5,  max: 7.0 },
          red:    { min: 0,    max: 10.0 },
        },
      },
      {
        sensorId: 'wr-tds',
        name: 'Total Dissolved Solids',
        unit: 'ppm',
        type: 'tds',
        nominalValue: 400,
        driftRange: 80,
        noiseAmplitude: 8,
        thresholds: {
          green:  { min: 200,  max: 600 },
          yellow: { min: 100,  max: 900 },
          red:    { min: 0,    max: 1500 },
        },
      },
    ],
  },
  {
    zoneId: 'power-thermal',
    name: 'Power & Thermal',
    description: 'Solar array output, nuclear backup, and thermal management systems',
    position: { x: 8, y: 0, z: 4 },
    sensors: [
      {
        sensorId: 'pt-power',
        name: 'Power Output',
        unit: 'kW',
        type: 'power',
        nominalValue: 100,
        driftRange: 12,    // sol cycle will drive this significantly
        noiseAmplitude: 1.5,
        thresholds: {
          green:  { min: 80,   max: 120 },
          yellow: { min: 60,   max: 140 },
          red:    { min: 30,   max: 200 },
        },
      },
      {
        sensorId: 'pt-coolant',
        name: 'Coolant Temperature',
        unit: 'C',
        type: 'temperature',
        nominalValue: 24,
        driftRange: 5.0,
        noiseAmplitude: 0.4,
        thresholds: {
          green:  { min: 15,   max: 35 },
          yellow: { min: 5,    max: 50 },
          red:    { min: -10,  max: 80 },
        },
      },
      {
        sensorId: 'pt-battery',
        name: 'Battery Charge',
        unit: '%',
        type: 'battery',
        nominalValue: 78,
        driftRange: 10,
        noiseAmplitude: 0.5,
        thresholds: {
          green:  { min: 60,   max: 95 },
          yellow: { min: 30,   max: 100 },
          red:    { min: 10,   max: 100 },
        },
      },
    ],
  },
];

// Convenience lookup map: zoneId -> ZoneConfig
export const ZONE_MAP: Record<string, ZoneConfig> = Object.fromEntries(
  ZONE_CONFIGS.map((z) => [z.zoneId, z])
);

// Convenience lookup map: sensorId -> SensorConfig (across all zones)
export const SENSOR_MAP: Record<string, { sensor: ZoneConfig['sensors'][number]; zoneId: string }> =
  Object.fromEntries(
    ZONE_CONFIGS.flatMap((z) =>
      z.sensors.map((s) => [s.sensorId, { sensor: s, zoneId: z.zoneId }])
    )
  );

// Sol cycle period in seconds (compressed: 10 minutes = 600s)
export const SOL_CYCLE_PERIOD = 600;

// BioSim-specific thresholds derived from Phase 5 fixture steady-state values (tick 191).
// Steady-state BioSim values land in green range; yellow/red reserved for anomalies.
// These are used by biosimMapper.ts exclusively -- existing simulation uses ZONE_CONFIGS.
export const BIOSIM_SENSOR_THRESHOLDS: Record<string, ThresholdConfig> = {
  'gb-co2':        { green: { min: 400,  max: 1200 }, yellow: { min: 200,  max: 2500 }, red: { min: 0,    max: 5000 } },
  'gb-temp':       { green: { min: 18,   max: 28   }, yellow: { min: 10,   max: 35   }, red: { min: -5,   max: 50   } },
  'gb-humidity':   { green: { min: 15,   max: 35   }, yellow: { min: 8,    max: 50   }, red: { min: 0,    max: 80   } },
  'ac-o2':         { green: { min: 19.5, max: 22.0 }, yellow: { min: 17.0, max: 25.0 }, red: { min: 14.0, max: 30.0 } },
  'ac-pressure':   { green: { min: 97,   max: 105  }, yellow: { min: 90,   max: 115  }, red: { min: 70,   max: 140  } },
  'ac-filtration': { green: { min: 85,   max: 100  }, yellow: { min: 60,   max: 100  }, red: { min: 0,    max: 100  } },
  'wr-flow':       { green: { min: 8,    max: 12   }, yellow: { min: 3,    max: 20   }, red: { min: 0,    max: 50   } },
  'wr-ph':         { green: { min: 6.0,  max: 7.5  }, yellow: { min: 5.0,  max: 8.5  }, red: { min: 3.0,  max: 11.0 } },
  'wr-tds':        { green: { min: 0,    max: 200  }, yellow: { min: 0,    max: 600  }, red: { min: 0,    max: 2000 } },
  'pt-power':      { green: { min: 80,   max: 120  }, yellow: { min: 60,   max: 140  }, red: { min: 30,   max: 200  } },
  'pt-battery':    { green: { min: 75,   max: 100  }, yellow: { min: 40,   max: 100  }, red: { min: 0,    max: 100  } },
  'pt-coolant':    { green: { min: 15,   max: 35   }, yellow: { min: 5,    max: 50   }, red: { min: -10,  max: 80   } },
};
