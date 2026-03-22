/** @vitest-environment jsdom */
/**
 * Unit tests for usePriorityRanking hook.
 *
 * Tests cover:
 *  - Scoring formula: (red * 10) + (yellow * 3)
 *  - Descending sort by score
 *  - Alphabetical tie-breaking on equal scores
 *  - 3-tick stability debounce (order only commits after 3 consecutive stable ticks)
 *  - Counter reset when candidate changes between ticks
 *  - Immediate initial render (no 3-tick delay on mount)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ZoneState, SensorReading } from '../types/habitat';
import { usePriorityRanking } from '../hooks/usePriorityRanking';

// Mock the Zustand store so we can control zones state
vi.mock('../store/habitatStore', () => {
  let currentZones: Record<string, ZoneState> = {};

  const mockSelector = vi.fn((selector: (s: { zones: Record<string, ZoneState> }) => unknown) =>
    selector({ zones: currentZones })
  );

  return {
    useHabitatStore: mockSelector,
    __setZones: (zones: Record<string, ZoneState>) => {
      currentZones = zones;
    },
    __getSelector: () => mockSelector,
  };
});

// Helper to get the mock controls
async function getMockControls() {
  const mod = await import('../store/habitatStore');
  return mod as unknown as {
    useHabitatStore: ReturnType<typeof vi.fn>;
    __setZones: (zones: Record<string, ZoneState>) => void;
    __getSelector: () => ReturnType<typeof vi.fn>;
  };
}

// Build mock ZoneState objects for all 4 zones with configurable red/yellow counts
function makeZones(overrides: Record<string, { red?: number; yellow?: number }>): Record<string, ZoneState> {
  const zoneIds = ['atmosphere-control', 'grow-bays', 'power-thermal', 'water-recycling'];
  const zones: Record<string, ZoneState> = {};

  for (const zoneId of zoneIds) {
    const o = overrides[zoneId] ?? {};
    const redCount = o.red ?? 0;
    const yellowCount = o.yellow ?? 0;
    const greenCount = 3 - redCount - yellowCount;
    const sensors: Record<string, SensorReading> = {};
    let i = 0;
    for (let r = 0; r < redCount; r++, i++) {
      sensors[`s${i}`] = { sensorId: `s${i}`, zoneId, value: 0, status: 'red', timestamp: 0, history: [] };
    }
    for (let y = 0; y < yellowCount; y++, i++) {
      sensors[`s${i}`] = { sensorId: `s${i}`, zoneId, value: 0, status: 'yellow', timestamp: 0, history: [] };
    }
    for (let g = 0; g < greenCount; g++, i++) {
      sensors[`s${i}`] = { sensorId: `s${i}`, zoneId, value: 0, status: 'green', timestamp: 0, history: [] };
    }
    zones[zoneId] = {
      zoneId,
      status: redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : 'green',
      sensors,
    };
  }

  return zones;
}

describe('usePriorityRanking', () => {
  let controls: Awaited<ReturnType<typeof getMockControls>>;

  beforeEach(async () => {
    controls = await getMockControls();
    vi.clearAllMocks();
  });

  // Test 1: All sensors green => all zones score 0 => alphabetical order
  it('returns alphabetical order when all zones score 0 (all green)', async () => {
    const zones = makeZones({});
    controls.__setZones(zones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones })
    );

    const { result } = renderHook(() => usePriorityRanking());

    expect(result.current).toEqual([
      'atmosphere-control',
      'grow-bays',
      'power-thermal',
      'water-recycling',
    ]);
  });

  // Test 2: One zone has 1 red sensor => that zone ranks first (score 10 vs 0)
  it('places the zone with 1 red sensor first (score 10 vs 0)', async () => {
    const zones = makeZones({ 'grow-bays': { red: 1 } });
    controls.__setZones(zones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones })
    );

    const { result } = renderHook(() => usePriorityRanking());

    expect(result.current[0]).toBe('grow-bays');
  });

  // Test 3: One zone 2 red + 1 yellow (score 23) outranks one zone 1 red (score 10)
  it('correctly ranks zone with 2 red + 1 yellow (score 23) above zone with 1 red (score 10)', async () => {
    const zones = makeZones({
      'power-thermal': { red: 2, yellow: 1 }, // score 23
      'water-recycling': { red: 1 },           // score 10
    });
    controls.__setZones(zones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones })
    );

    const { result } = renderHook(() => usePriorityRanking());

    expect(result.current[0]).toBe('power-thermal');
    expect(result.current[1]).toBe('water-recycling');
  });

  // Test 4: Two zones with equal score => alphabetical zoneId tie-break
  it('breaks ties alphabetically by zoneId when scores are equal', async () => {
    const zones = makeZones({
      'grow-bays': { red: 1 },        // score 10
      'water-recycling': { red: 1 },  // score 10
    });
    controls.__setZones(zones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones })
    );

    const { result } = renderHook(() => usePriorityRanking());

    // 'grow-bays' comes before 'water-recycling' alphabetically
    const growIdx = result.current.indexOf('grow-bays');
    const waterIdx = result.current.indexOf('water-recycling');
    expect(growIdx).toBeLessThan(waterIdx);
  });

  // Test 5: Ranking does NOT change after 1 tick of different order (debounce not met)
  it('does not commit new order after 1 tick (debounce requires 3)', async () => {
    // Start with all green (alphabetical order)
    const allGreenZones = makeZones({});
    controls.__setZones(allGreenZones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: allGreenZones })
    );

    const { result, rerender } = renderHook(() => usePriorityRanking());
    const initialOrder = [...result.current];

    // Tick 1: different candidate, new object reference
    const zones1 = makeZones({ 'water-recycling': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: zones1 })
    );
    rerender();

    // Order should NOT have changed yet (only 1 tick)
    expect(result.current).toEqual(initialOrder);
  });

  // Test 6: Ranking does NOT change after 2 ticks of different order (debounce not met)
  it('does not commit new order after 2 ticks (debounce requires 3)', async () => {
    const allGreenZones = makeZones({});
    controls.__setZones(allGreenZones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: allGreenZones })
    );

    const { result, rerender } = renderHook(() => usePriorityRanking());
    const initialOrder = [...result.current];

    // Tick 1: new reference
    const zones1 = makeZones({ 'water-recycling': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: zones1 })
    );
    rerender();

    // Tick 2: same logical order, new reference
    const zones2 = makeZones({ 'water-recycling': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: zones2 })
    );
    rerender();

    // Still should not have committed (only 2 ticks)
    expect(result.current).toEqual(initialOrder);
  });

  // Test 7: Ranking DOES change after 3 consecutive ticks of same different order
  it('commits new order after 3 consecutive ticks of the same candidate', async () => {
    const allGreenZones = makeZones({});
    controls.__setZones(allGreenZones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: allGreenZones })
    );

    const { result, rerender } = renderHook(() => usePriorityRanking());

    // Each rerender must provide a new object reference so the useEffect [zones] dep fires.
    // The zone IDs and sensor statuses are identical across ticks (stable candidate),
    // but the object identity changes — simulating what Zustand does on each tick update.

    // Tick 1
    const zones1 = makeZones({ 'water-recycling': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: zones1 })
    );
    rerender();

    // Tick 2 — same logical order, new reference
    const zones2 = makeZones({ 'water-recycling': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: zones2 })
    );
    rerender();

    // Tick 3 — same logical order, new reference — should commit now
    const zones3 = makeZones({ 'water-recycling': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: zones3 })
    );
    rerender();

    // After 3 ticks, 'water-recycling' should be committed first
    expect(result.current[0]).toBe('water-recycling');
  });

  // Test 8: Counter resets if candidate changes between ticks
  it('resets tick counter when candidate changes mid-sequence', async () => {
    const allGreenZones = makeZones({});
    controls.__setZones(allGreenZones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: allGreenZones })
    );

    const { result, rerender } = renderHook(() => usePriorityRanking());
    const initialOrder = [...result.current];

    // Tick 1: candidate A (water-recycling red) — new reference
    const candidateA1 = makeZones({ 'water-recycling': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: candidateA1 })
    );
    rerender();

    // Tick 2: candidate B (grow-bays red) — different candidate, resets counter
    const candidateB = makeZones({ 'grow-bays': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: candidateB })
    );
    rerender();

    // Tick 3: candidate A again (new reference) — counter was reset when B appeared,
    // so this is only tick 1 for A again (not tick 2)
    const candidateA2 = makeZones({ 'water-recycling': { red: 1 } });
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones: candidateA2 })
    );
    rerender();

    // Should NOT have committed (counter reset, only 1 tick for A at this point)
    expect(result.current).toEqual(initialOrder);
  });

  // Test 9: Initial render returns correct order immediately (no 3-tick delay on mount)
  it('returns the correct ranking immediately on first render without waiting for 3 ticks', async () => {
    const zones = makeZones({ 'atmosphere-control': { red: 3 } }); // score 30, clearly first
    controls.__setZones(zones);
    controls.__getSelector().mockImplementation(
      (selector: (s: { zones: Record<string, ZoneState> }) => unknown) => selector({ zones })
    );

    const { result } = renderHook(() => usePriorityRanking());

    // Should immediately show atmosphere-control first — no ticks required
    expect(result.current[0]).toBe('atmosphere-control');
  });
});
