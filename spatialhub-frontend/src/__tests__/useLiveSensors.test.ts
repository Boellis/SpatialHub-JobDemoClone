/** @vitest-environment jsdom */
/**
 * useLiveSensors regression tests.
 *
 * Guards against two classes of silent failure:
 *  1. PI_HUB_ID reverting to an old provisioned hub ID (frontend polls wrong hub, LIVE badge never fires)
 *  2. SENSOR_MAP key case mismatch vs Pi SENSOR_NAME (readings silently dropped)
 */

import { describe, it, expect } from 'vitest';
import { PI_HUB_ID, SENSOR_MAP } from '../hooks/useLiveSensors';

describe('PI_HUB_ID', () => {
  it('is pi-habitat-01 — not an old provisioned alphanumeric ID', () => {
    expect(PI_HUB_ID).toBe('pi-habitat-01');
  });
});

describe('SENSOR_MAP', () => {
  it('has key "ph" (lowercase) matching Pi SENSOR_NAME in .env', () => {
    expect(SENSOR_MAP).toHaveProperty('ph');
  });

  it('maps "ph" to water-recycling zone and wr-ph sensor', () => {
    expect(SENSOR_MAP['ph']).toEqual({
      zoneId: 'water-recycling',
      sensorId: 'wr-ph',
    });
  });
});
