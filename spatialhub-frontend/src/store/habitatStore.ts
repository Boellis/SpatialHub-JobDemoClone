// Zustand store for Mars Habitat simulation state
// All real-time sensor readings and zone statuses live here.
// The simulation engine writes to this store every 2 seconds.

import { create } from 'zustand';
import type { SensorReading, ZoneState, ZoneStatus, HabitatState } from '../types/habitat';
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

// Module-level engine reference — set by startSimulation, cleared by stopSimulation
// This avoids circular import: the engine import happens lazily inside startSimulation
let engineInterval: ReturnType<typeof setInterval> | null = null;

export const useHabitatStore = create<HabitatState>()((set, get) => ({
  zones: buildInitialZones(),
  solElapsed: 0,
  isRunning: false,
  tickCount: 0,

  startSimulation: () => {
    if (get().isRunning) {
      console.log('[Habitat] Simulation already running — ignoring duplicate start');
      return;
    }

    console.log('[Habitat] Simulation start requested');
    set({ isRunning: true });

    // Lazy-import the engine to avoid circular dep at module init time
    import('../simulation/engine').then(({ createSimulationEngine }) => {
      const engine = createSimulationEngine();

      if (engineInterval !== null) {
        clearInterval(engineInterval);
        engineInterval = null;
      }

      engineInterval = engine.start();
    });
  },

  stopSimulation: () => {
    console.log('[Habitat] Simulation stop requested');

    if (engineInterval !== null) {
      clearInterval(engineInterval);
      engineInterval = null;
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

// Expose to window in dev mode for DevTools verification
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__habitatStore = useHabitatStore;
}
