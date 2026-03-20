/** @vitest-environment jsdom */
/**
 * useLiveSensors regression tests.
 *
 * Guards against two classes of silent failure:
 *  1. PI_HUB_ID reverting to an old provisioned hub ID (frontend polls wrong hub, LIVE badge never fires)
 *  2. SENSOR_MAP key case mismatch vs Pi SENSOR_NAME (readings silently dropped)
 *  3. STALE_THRESHOLD_MS value changing (badge upgrade/downgrade timing broken)
 */

import { describe, it, expect } from 'vitest';
import { PI_HUB_ID, SENSOR_MAP, STALE_THRESHOLD_MS } from '../hooks/useLiveSensors';

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

describe('STALE_THRESHOLD_MS', () => {
  it('is 30000 (30 seconds, 3 missed 10s polls)', () => {
    expect(STALE_THRESHOLD_MS).toBe(30_000);
  });
});
