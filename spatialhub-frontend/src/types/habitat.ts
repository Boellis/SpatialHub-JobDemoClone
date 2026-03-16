// Mars Habitat sensor and zone type definitions
// Source of truth for the simulation data model

export type SensorStatus = 'green' | 'yellow' | 'red';
export type ZoneStatus = 'green' | 'yellow' | 'red';

export interface ThresholdRange {
  min: number; // below this = warning/critical
  max: number; // above this = warning/critical
}

export interface ThresholdConfig {
  green: ThresholdRange;  // nominal operating range
  yellow: ThresholdRange; // caution range (wider than green)
  red: ThresholdRange;    // critical range (widest -- everything outside is critical)
}

export interface SensorConfig {
  sensorId: string;       // e.g., "gb-co2"
  name: string;           // e.g., "CO2 Level"
  unit: string;           // e.g., "ppm"
  type: string;           // e.g., "co2" -- for grouping/icons
  nominalValue: number;   // baseline center value for simulation
  driftRange: number;     // max drift from nominal in normal operation
  noiseAmplitude: number; // random noise magnitude per tick
  thresholds: ThresholdConfig;
}

export interface ZoneConfig {
  zoneId: string;         // e.g., "grow-bays"
  name: string;           // e.g., "Grow Bays"
  description: string;
  sensors: SensorConfig[];
  position: { x: number; y: number; z: number };
}

export interface SensorReading {
  sensorId: string;
  zoneId: string;
  value: number;
  status: SensorStatus;
  timestamp: number;    // Date.now()
  history: number[];    // last 30 values for sparklines (Phase 3)
}

export interface ZoneState {
  zoneId: string;
  status: ZoneStatus;
  sensors: Record<string, SensorReading>;
}

export type AnomalyPhase = 'onset' | 'peak' | 'recovery' | 'idle';

export interface AnomalyScenarioState {
  phase: AnomalyPhase;
  ticksInPhase: number;
  biasFactor: number; // 0 = no effect, 1 = full crisis bias
}

export interface ScenarioAnnouncement {
  scenarioId: string;
  label: string;
  zoneName: string;
  zoneId: string;
  timestamp: number;
}

export type SimSource = 'connecting' | 'biosim' | 'fallback' | 'disconnected';

export interface HabitatState {
  zones: Record<string, ZoneState>;
  solElapsed: number;   // seconds elapsed in current sol cycle
  isRunning: boolean;
  tickCount: number;
  selectedZoneId: string | null;
  anomalies: Record<string, AnomalyScenarioState>;
  scenarioAnnouncements: ScenarioAnnouncement[];
  simSource: SimSource;
  startSimulation: () => void;
  stopSimulation: () => void;
  tick: (readings: Record<string, Record<string, SensorReading>>) => void;
  getZoneStatus: (zoneId: string) => ZoneStatus;
  setSelectedZoneId: (zoneId: string | null) => void;
  setSimSource: (source: SimSource) => void;
  triggerAnomaly: (scenarioId: string) => void;
  cancelAnomaly: (scenarioId: string) => void;
  tickAnomalies: () => void;
  dismissAnnouncement: (timestamp: number) => void;
}

// Worker <-> Main thread message protocol for biosimWorker
export type WorkerCommand =
  | { type: 'CONNECT'; wsUrl: string }
  | { type: 'DISCONNECT' }
  | { type: 'SYNC_HISTORY'; history: Record<string, Record<string, number[]>> };

export type WorkerMessage =
  | { type: 'READINGS'; readings: Record<string, Record<string, SensorReading>> }
  | { type: 'WS_OPEN' }
  | { type: 'WS_CLOSE'; code: number }
  | { type: 'WS_ERROR' };

// For the Django API response shape
export interface HabitatZone {
  id: number;
  zone_id: string;
  name: string;
  description: string;
  sensors: Array<{ sensor_id: string; name: string; unit: string; type: string }>;
  thresholds: Record<string, { green: number[]; yellow: number[]; red: number[] }>;
  position: { x: number; y: number; z: number };
}
