// useLiveSensors — polls Django API for real Raspberry Pi sensor readings
// and overlays them onto the habitat store with source: 'live'.
//
// Maps Pi hub readings to habitat zone sensors:
//   hub sensor_name "ph" → zone "water-recycling", sensor "wr-ph"

import { useEffect, useRef } from 'react';
import { useHabitatStore } from '../store/habitatStore';
import { BASE_URL } from '../api/api';
import { ZONE_CONFIGS } from '../simulation/constants';
import type { SensorReading, SensorStatus, ThresholdConfig } from '../types/habitat';

const POLL_INTERVAL_MS = 10_000; // poll every 10s
const PI_HUB_ID = '9c9Kfeo4SK7BW4hw8dvQ';

// Map Pi sensor names to habitat zone/sensor IDs
const SENSOR_MAP: Record<string, { zoneId: string; sensorId: string }> = {
  ph: { zoneId: 'water-recycling', sensorId: 'wr-ph' },
};

// Build threshold lookup from zone configs
function getThresholds(zoneId: string, sensorId: string): ThresholdConfig | null {
  const zone = ZONE_CONFIGS.find(z => z.zoneId === zoneId);
  if (!zone) return null;
  const sensor = zone.sensors.find(s => s.sensorId === sensorId);
  return sensor?.thresholds ?? null;
}

function evaluateStatus(value: number, thresholds: ThresholdConfig): SensorStatus {
  if (value >= thresholds.green.min && value <= thresholds.green.max) return 'green';
  if (value >= thresholds.yellow.min && value <= thresholds.yellow.max) return 'yellow';
  return 'red';
}

interface ApiReading {
  sensor_name: string;
  sensor_val: number;
  datetime: string;
}

export function useLiveSensors(): void {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function poll() {
      try {
        const response = await fetch(
          `${BASE_URL}/enriched/?hub_id=${PI_HUB_ID}&page_size=5&ordering=-datetime`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!response.ok || !mountedRef.current) return;

        const data: ApiReading[] = await response.json();
        if (!mountedRef.current || !Array.isArray(data) || data.length === 0) return;

        // Group by sensor_name, take most recent
        const latest = new Map<string, ApiReading>();
        for (const row of data) {
          if (!latest.has(row.sensor_name)) {
            latest.set(row.sensor_name, row);
          }
        }

        const readings: Record<string, Record<string, SensorReading>> = {};

        for (const [sensorName, row] of latest) {
          const mapping = SENSOR_MAP[sensorName];
          if (!mapping) continue;

          const thresholds = getThresholds(mapping.zoneId, mapping.sensorId);
          if (!thresholds) continue;

          // Get existing history from the store
          const existingReading = useHabitatStore.getState().zones[mapping.zoneId]
            ?.sensors[mapping.sensorId];
          const history = existingReading?.history
            ? [...existingReading.history.slice(-29), row.sensor_val]
            : [row.sensor_val];

          if (!readings[mapping.zoneId]) readings[mapping.zoneId] = {};
          readings[mapping.zoneId][mapping.sensorId] = {
            sensorId: mapping.sensorId,
            zoneId: mapping.zoneId,
            value: row.sensor_val,
            status: evaluateStatus(row.sensor_val, thresholds),
            timestamp: new Date(row.datetime).getTime(),
            history,
            source: 'live',
          };
        }

        if (Object.keys(readings).length > 0) {
          useHabitatStore.getState().tick(readings);
        }
      } catch {
        // Network error — skip this poll cycle
      }
    }

    // Initial poll
    poll();

    // Recurring poll
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, []);
}
