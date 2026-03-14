// Zustand store for Mars Habitat simulation state
// All real-time sensor readings and zone statuses live here.
// The simulation engine writes to this store every 2 seconds.

import { create } from 'zustand';
import type { AnomalyPhase, AnomalyScenarioState, ScenarioAnnouncement, SensorReading, ZoneState, ZoneStatus, HabitatState } from '../types/habitat';
import { ANOMALY_SCENARIOS } from '../simulation/anomalies';
import { ZONE_CONFIGS } from '../simulation/constants';

// Build the initial zone state from ZONE_CONFIGS — all sensors at nominal, all green
function buildInitialZones(): Record<string, ZoneState> {
  const zones: Record<string, ZoneState> = {};

  for (const zone of ZONE_CONFIGS) {
    const sensors: Record<string, SensorReading> = {};

    for (const sensor of zone.sensors) {
      sensors[sensor.sensorId] = {
        sensorId: sensor.sensorId,
        zoneId: zone.zoneId,
        value: sensor.nominalValue,
        status: 'green',
        timestamp: Date.now(),
        history: [],
      };
    }

    zones[zone.zoneId] = {
      zoneId: zone.zoneId,
      status: 'green',
      sensors,
    };
  }

  return zones;
}

// Derive zone status as worst-of-sensors
function deriveZoneStatus(sensors: Record<string, SensorReading>): ZoneStatus {
  let worst: ZoneStatus = 'green';
  for (const reading of Object.values(sensors)) {
    if (reading.status === 'red') return 'red';
    if (reading.status === 'yellow') worst = 'yellow';
  }
  return worst;
}

// Module-level engine instance reference — set by startSimulation, cleared by stopSimulation
// Stored at module scope (not in Zustand state) to avoid serialization issues.
// Uses lazy import to break the circular dependency: store -> engine -> store.
import type { SimulationEngine } from '../simulation/engine';
let activeEngine: SimulationEngine | null = null;

export const useHabitatStore = create<HabitatState>()((set, get) => ({
  zones: buildInitialZones(),
  solElapsed: 0,
  isRunning: false,
  tickCount: 0,
  selectedZoneId: null,
  anomalies: {} as Record<string, AnomalyScenarioState>,
  scenarioAnnouncements: [] as ScenarioAnnouncement[],

  startSimulation: () => {
    if (get().isRunning) {
      console.log('[Habitat] Simulation already running — ignoring duplicate start');
      return;
    }

    console.log('[Habitat] Simulation start requested');
    set({ isRunning: true });

    // Lazy-import the engine to break the circular dependency at module init time.
    // By the time this promise resolves, both modules are fully initialized.
    import('../simulation/engine').then(({ createSimulationEngine }) => {
      // Stop any previously running engine before creating a new one
      if (activeEngine !== null) {
        activeEngine.stop();
        activeEngine = null;
      }

      activeEngine = createSimulationEngine();
      activeEngine.start();
    });
  },

  stopSimulation: () => {
    console.log('[Habitat] Simulation stop requested');

    if (activeEngine !== null) {
      activeEngine.stop();
      activeEngine = null;
    }

    set({ isRunning: false });
  },

  tick: (readings: Record<string, Record<string, SensorReading>>) => {
    set((state) => {
      const updatedZones: Record<string, ZoneState> = {};

      for (const [zoneId, sensorReadings] of Object.entries(readings)) {
        const zoneStatus = deriveZoneStatus(sensorReadings);
        updatedZones[zoneId] = {
          zoneId,
          status: zoneStatus,
          sensors: sensorReadings,
        };
      }

      return {
        zones: updatedZones,
        solElapsed: state.solElapsed + 2, // 2-second tick = 2 sol-seconds
        tickCount: state.tickCount + 1,
      };
    });
  },

  getZoneStatus: (zoneId: string): ZoneStatus => {
    const zone = get().zones[zoneId];
    if (!zone) return 'green';
    return zone.status;
  },

  setSelectedZoneId: (zoneId: string | null) => set({ selectedZoneId: zoneId }),

  triggerAnomaly: (scenarioId: string) => {
    const scenario = ANOMALY_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;

    const state = get();
    const current = state.anomalies[scenarioId];

    // Toggle: if already active, cancel it instead
    if (current && current.phase !== 'idle') {
      state.cancelAnomaly(scenarioId);
      return;
    }

    set((s) => ({
      anomalies: {
        ...s.anomalies,
        [scenarioId]: { phase: 'onset', ticksInPhase: 0, biasFactor: 0 },
      },
      scenarioAnnouncements: [
        ...s.scenarioAnnouncements,
        {
          scenarioId,
          label: scenario.label,
          zoneName: scenario.zoneName,
          zoneId: scenario.zoneId,
          timestamp: Date.now(),
        },
      ],
    }));
  },

  cancelAnomaly: (scenarioId: string) => {
    const state = get();
    const current = state.anomalies[scenarioId];
    if (!current || current.phase === 'idle') return;

    set((s) => ({
      anomalies: {
        ...s.anomalies,
        [scenarioId]: {
          phase: 'recovery',
          ticksInPhase: 0,
          biasFactor: current.biasFactor, // preserve current bias as starting point for recovery
        },
      },
    }));
  },

  tickAnomalies: () => {
    set((state) => {
      const updated: Record<string, AnomalyScenarioState> = {};
      let changed = false;

      for (const [id, entry] of Object.entries(state.anomalies)) {
        if (entry.phase === 'idle') {
          updated[id] = entry;
          continue;
        }

        const scenario = ANOMALY_SCENARIOS.find((s) => s.id === id);
        if (!scenario) {
          updated[id] = entry;
          continue;
        }

        // Advance ticksInPhase first
        const newTicks = entry.ticksInPhase + 1;

        // Compute biasFactor based on current phase and advanced ticks
        let newBias: number;
        let newPhase: AnomalyPhase = entry.phase;
        let finalTicks = newTicks;

        switch (entry.phase) {
          case 'onset':
            newBias = Math.min(1, newTicks / scenario.onsetTicks);
            if (newTicks >= scenario.onsetTicks) {
              newPhase = 'peak';
              finalTicks = 0;
              newBias = 1.0;
            }
            break;

          case 'peak':
            newBias = 1.0;
            if (newTicks >= scenario.peakTicks) {
              // Auto-timeout: transition to recovery
              newPhase = 'recovery';
              finalTicks = 0;
              newBias = 1.0; // recovery starts from full
            }
            break;

          case 'recovery':
            newBias = Math.max(0, 1 - newTicks / scenario.recoveryTicks);
            if (newTicks >= scenario.recoveryTicks) {
              newPhase = 'idle';
              finalTicks = 0;
              newBias = 0;
            }
            break;

          default:
            newBias = entry.biasFactor;
        }

        updated[id] = { phase: newPhase, ticksInPhase: finalTicks, biasFactor: newBias };
        changed = true;
      }

      return changed ? { anomalies: updated } : {};
    });
  },

  dismissAnnouncement: (timestamp: number) => {
    set((state) => ({
      scenarioAnnouncements: state.scenarioAnnouncements.filter(
        (a) => a.timestamp !== timestamp
      ),
    }));
  },
}));

// Selectors — exported for use in components (stable references, avoid re-renders)
export const selectZone = (zoneId: string) => (state: HabitatState) =>
  state.zones[zoneId];

export const selectSensorReading = (zoneId: string, sensorId: string) =>
  (state: HabitatState) => state.zones[zoneId]?.sensors[sensorId];

export const selectAllZoneStatuses = () => (state: HabitatState): Record<string, ZoneStatus> =>
  Object.fromEntries(
    Object.entries(state.zones).map(([id, zone]) => [id, zone.status])
  );

export const selectSelectedZoneId = (state: HabitatState) => state.selectedZoneId;

// Expose to window in dev mode for DevTools verification
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__habitatStore = useHabitatStore;
}
