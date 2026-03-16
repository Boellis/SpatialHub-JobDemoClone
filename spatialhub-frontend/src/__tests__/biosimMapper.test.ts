import { describe, it, expect } from 'vitest';
import { mapBioSimToHabitatReadings, appendRingBuffer, HISTORY_CAP } from '../simulation/biosimMapper';
import fixture from '../../../tests/fixtures/biosim_module_state.json';

// Fixture: BioSim steady-state at tick 191
// All expected values derived from biosim_module_state.json

describe('mapBioSimToHabitatReadings', () => {
  const result = mapBioSimToHabitatReadings(fixture.modules);

  it('returns all four zone keys', () => {
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['grow-bays', 'atmosphere-control', 'water-recycling', 'power-thermal'])
    );
    expect(Object.keys(result).length).toBe(4);
  });

  // --- GROW BAYS ---

  it('gb-temp is direct Celsius', () => {
    const reading = result['grow-bays']['gb-temp'];
    expect(reading).toBeDefined();
    expect(reading.value).toBeCloseTo(23.0, 2);
    expect(reading.status).toBe('green');
    expect(reading.zoneId).toBe('grow-bays');
    expect(reading.sensorId).toBe('gb-temp');
  });

  it('gb-humidity is direct percent', () => {
    const reading = result['grow-bays']['gb-humidity'];
    expect(reading).toBeDefined();
    // relativeHumidity = 22.443703 -> green with BIOSIM thresholds (15-35)
    expect(reading.value).toBeCloseTo(22.44, 1);
    expect(reading.status).toBe('green');
  });

  it('gb-co2 converts mol fraction to ppm', () => {
    const reading = result['grow-bays']['gb-co2'];
    expect(reading).toBeDefined();
    // 0.00073011906 * 1_000_000 = 730.11906 ppm
    expect(reading.value).toBeCloseTo(730.12, 1);
    expect(reading.status).toBe('green');
  });

  // --- ATMOSPHERE CONTROL ---

  it('ac-o2 converts mol fraction to percent', () => {
    const reading = result['atmosphere-control']['ac-o2'];
    expect(reading).toBeDefined();
    // 0.20807198 * 100 = 20.807198 %
    expect(reading.value).toBeCloseTo(20.81, 1);
    expect(reading.status).toBe('green');
  });

  it('ac-pressure is direct kPa', () => {
    const reading = result['atmosphere-control']['ac-pressure'];
    expect(reading).toBeDefined();
    // totalPressure = 101.47319 kPa
    expect(reading.value).toBeCloseTo(101.47, 1);
    expect(reading.status).toBe('green');
  });

  it('ac-filtration computes VCCR air ratio', () => {
    const reading = result['atmosphere-control']['ac-filtration'];
    expect(reading).toBeDefined();
    // air producer 999.26324 / air consumer 999.99994 * 100 = 99.926...%
    expect(reading.value).toBeCloseTo(99.93, 1);
    expect(reading.status).toBe('green');
  });

  // --- WATER RECYCLING ---

  it('wr-flow converts L/tick to L/min', () => {
    const reading = result['water-recycling']['wr-flow'];
    expect(reading).toBeDefined();
    // 0.1666858 * 60 = 10.001148 L/min
    expect(reading.value).toBeCloseTo(10.0, 1);
    expect(reading.status).toBe('green');
  });

  it('wr-ph derives grey water pH proxy', () => {
    const reading = result['water-recycling']['wr-ph'];
    expect(reading).toBeDefined();
    // 6.0 + (9966.972 / 10000.0) * 1.5 = 6.0 + 1.4950458 = 7.4950458
    expect(reading.value).toBeCloseTo(7.50, 1);
    expect(reading.status).toBe('green');
  });

  it('wr-tds derives dirty water TDS proxy', () => {
    const reading = result['water-recycling']['wr-tds'];
    expect(reading).toBeDefined();
    // 11.541879 / 10000.0 * 10000 = 11.541879 ppm
    expect(reading.value).toBeCloseTo(11.54, 1);
    expect(reading.status).toBe('green');
  });

  // --- POWER & THERMAL ---

  it('pt-power scales BioSim watts to kW', () => {
    const reading = result['power-thermal']['pt-power'];
    expect(reading).toBeDefined();
    // 3000.0 / 30 = 100.0 kW
    expect(reading.value).toBeCloseTo(100.0, 2);
    expect(reading.status).toBe('green');
  });

  it('pt-battery computes power store percent', () => {
    const reading = result['power-thermal']['pt-battery'];
    expect(reading).toBeDefined();
    // 99600.0 / 100000.0 * 100 = 99.6 %
    expect(reading.value).toBeCloseTo(99.6, 1);
    expect(reading.status).toBe('green');
  });

  it('pt-coolant is temp + 1C offset', () => {
    const reading = result['power-thermal']['pt-coolant'];
    expect(reading).toBeDefined();
    // 23.0 + 1.0 = 24.0 C
    expect(reading.value).toBeCloseTo(24.0, 2);
    expect(reading.status).toBe('green');
  });

  it('produces no silent zero-fills for present modules', () => {
    const zones = Object.values(result);
    for (const sensors of zones) {
      for (const [sensorId, reading] of Object.entries(sensors)) {
        expect(reading.value, `sensor ${sensorId} should not be zero-filled`).not.toBe(0);
      }
    }
  });

  it('each SensorReading has required fields', () => {
    for (const [zoneId, sensors] of Object.entries(result)) {
      for (const [sensorId, reading] of Object.entries(sensors)) {
        expect(reading.sensorId).toBe(sensorId);
        expect(reading.zoneId).toBe(zoneId);
        expect(typeof reading.value).toBe('number');
        expect(isFinite(reading.value)).toBe(true);
        expect(['green', 'yellow', 'red']).toContain(reading.status);
        expect(typeof reading.timestamp).toBe('number');
        expect(Array.isArray(reading.history)).toBe(true);
      }
    }
  });

  it('omits sensors when BioSim module is missing', () => {
    const emptyResult = mapBioSimToHabitatReadings({});
    // With no modules, no sensors can be extracted — result should be empty or have empty zones
    const allSensors = Object.values(emptyResult).flatMap((z) => Object.values(z));
    expect(allSensors.length).toBe(0);
  });
});

describe('appendRingBuffer', () => {
  it('never exceeds HISTORY_CAP when filled past cap', () => {
    let history: number[] = [];
    for (let i = 0; i < 50; i++) {
      history = appendRingBuffer(history, i);
    }
    expect(history.length).toBeLessThanOrEqual(HISTORY_CAP);
    expect(history.length).toBe(HISTORY_CAP);
  });

  it('grows when under cap', () => {
    let history: number[] = [];
    for (let i = 0; i < 5; i++) {
      history = appendRingBuffer(history, i);
    }
    expect(history.length).toBe(5);
  });

  it('slides the window when at cap', () => {
    let history: number[] = Array.from({ length: HISTORY_CAP }, (_, i) => i);
    history = appendRingBuffer(history, 999);
    expect(history.length).toBe(HISTORY_CAP);
    expect(history[HISTORY_CAP - 1]).toBe(999);
    // oldest value (0) should be gone
    expect(history[0]).toBe(1);
  });

  it('uses default cap of HISTORY_CAP', () => {
    expect(HISTORY_CAP).toBe(30);
  });
});
