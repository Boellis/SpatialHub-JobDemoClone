// Zustand store for Mars Habitat simulation state
// All real-time sensor readings and zone statuses live here.
// The simulation engine writes to this store every 2 seconds.

import { create } from 'zustand';
import type { AnomalyPhase, AnomalyScenarioState, ScenarioAnnouncement, SensorReading, ZoneState, ZoneStatus, HabitatState, SimSource } from '../types/habitat';
import { ANOMALY_SCENARIOS } from '../simulation/anomalies';
import { ZONE_CONFIGS } from '../simulation/constants';
import { postMalfunction, deleteMalfunction, BIOSIM_MALFUNCTION_MAP } from '../simulation/biosimMalfunctions';

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
  simSource: 'connecting' as SimSource,
  piDataFresh: false,
  biosimSimId: null as string | null,
  biosimMalfunctionIds: {} as Record<string, number>,
  setBiosimSimId: (id: string | null) => set({ biosimSimId: id }),
  setPiDataFresh: (fresh: boolean) => set({ piDataFresh: fresh }),
  setSimSource: (source: SimSource) => {
    const update: Partial<HabitatState> = { simSource: source };
    if (source !== 'biosim' && source !== 'biosim-real') {
      update.biosimMalfunctionIds = {};
    }
    set(update as HabitatState);
  },

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
      const updatedZones: Record<string, ZoneState> = { ...state.zones };

      for (const [zoneId, sensorReadings] of Object.entries(readings)) {
        const existingZone = state.zones[zoneId];
        // Merge incoming sensors with existing ones (preserves sensors not in this tick).
        // Live hardware readings take priority — don't let sim/biosim overwrite them.
        const mergedSensors = existingZone
          ? { ...existingZone.sensors }
          : {};
        for (const [sensorId, reading] of Object.entries(sensorReadings)) {
          const existing = mergedSensors[sensorId];
          if (existing?.source === 'live' && reading.source !== 'live') {
            // Keep the live reading; don't overwrite with sim data
            continue;
          }
          mergedSensors[sensorId] = reading;
        }
        const zoneStatus = deriveZoneStatus(mergedSensors);
        updatedZones[zoneId] = {
          zoneId,
          status: zoneStatus,
          sensors: mergedSensors,
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
    const { simSource, biosimSimId, biosimMalfunctionIds, anomalies } = get();

    if ((simSource === 'biosim' || simSource === 'biosim-real') && biosimSimId !== null) {
      // BioSim path

      // Toggle: if already active (sentinel -1 or real ID), cancel it instead
      if (biosimMalfunctionIds[scenarioId] !== undefined) {
        get().cancelAnomaly(scenarioId);
        return;
      }

      const mapping = BIOSIM_MALFUNCTION_MAP[scenarioId];
      if (!mapping) return;

      // Optimistic pending guard: set sentinel so AnomalyDrawer isActive works immediately
      // and double-clicks are blocked (biosimMalfunctionIds[-1] is the sentinel)
      set((s) => ({
        anomalies: {
          ...s.anomalies,
          [scenarioId]: { phase: 'peak', ticksInPhase: 0, biasFactor: 1 },
        },
        biosimMalfunctionIds: {
          ...s.biosimMalfunctionIds,
          [scenarioId]: -1,
        },
      }));

      // Fire POST — update with real ID on success, rollback on failure
      postMalfunction(biosimSimId, mapping.moduleName, mapping.intensity, mapping.length)
        .then((malfunctionId) => {
          if (malfunctionId !== null) {
            // Update sentinel with real ID and push announcement
            const scenario = ANOMALY_SCENARIOS.find((s) => s.id === scenarioId);
            set((s) => ({
              biosimMalfunctionIds: {
                ...s.biosimMalfunctionIds,
                [scenarioId]: malfunctionId,
              },
              scenarioAnnouncements: scenario
                ? [
                    ...s.scenarioAnnouncements,
                    {
                      scenarioId,
                      label: scenario.label,
                      zoneName: scenario.zoneName,
                      zoneId: scenario.zoneId,
                      timestamp: Date.now(),
                    },
                  ]
                : s.scenarioAnnouncements,
            }));
          } else {
            // POST failed — rollback sentinel
            set((s) => {
              const newAnomalies = { ...s.anomalies };
              delete newAnomalies[scenarioId];
              const newMalfunctionIds = { ...s.biosimMalfunctionIds };
              delete newMalfunctionIds[scenarioId];
              return { anomalies: newAnomalies, biosimMalfunctionIds: newMalfunctionIds };
            });
          }
        });

      return;
    }

    // Fallback path — existing onset/recovery bias-curve logic UNCHANGED
    const scenario = ANOMALY_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;

    const current = anomalies[scenarioId];

    // Toggle: if already active, cancel it instead
    if (current && current.phase !== 'idle') {
      get().cancelAnomaly(scenarioId);
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
    const { simSource, biosimSimId, biosimMalfunctionIds, anomalies } = get();

    if ((simSource === 'biosim' || simSource === 'biosim-real') && biosimSimId !== null) {
      // BioSim path
      const malfunctionId = biosimMalfunctionIds[scenarioId];
      if (malfunctionId === undefined) return;

      const mapping = BIOSIM_MALFUNCTION_MAP[scenarioId];
      if (!mapping) return;

      // Optimistic UI update — clear locally immediately
      set((s) => {
        const newAnomalies = {
          ...s.anomalies,
          [scenarioId]: { phase: 'idle' as const, ticksInPhase: 0, biasFactor: 0 },
        };
        const newMalfunctionIds = { ...s.biosimMalfunctionIds };
        delete newMalfunctionIds[scenarioId];
        return { anomalies: newAnomalies, biosimMalfunctionIds: newMalfunctionIds };
      });

      // Fire DELETE — fire and forget (UI already cleared)
      deleteMalfunction(biosimSimId, mapping.moduleName, malfunctionId);

      return;
    }

    // Fallback path — existing recovery transition logic UNCHANGED
    const current = anomalies[scenarioId];
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

export const selectSimSource = (state: HabitatState) => state.simSource;

export const selectPiDataFresh = (state: HabitatState) => state.piDataFresh;

// Expose to window in dev mode for DevTools verification
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__habitatStore = useHabitatStore;
}
