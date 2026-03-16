/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { useHabitatStore, selectSimSource } from '../store/habitatStore';

// Reset store state before each test to avoid bleed between tests
beforeEach(() => {
  useHabitatStore.setState({
    simSource: 'connecting',
    solElapsed: 0,
    tickCount: 0,
  });
});

describe('habitatStore simSource field', () => {
  it('initial simSource is "connecting"', () => {
    expect(useHabitatStore.getState().simSource).toBe('connecting');
  });

  it('setSimSource("biosim") updates simSource', () => {
    useHabitatStore.getState().setSimSource('biosim');
    expect(useHabitatStore.getState().simSource).toBe('biosim');
  });

  it('setSimSource("fallback") updates simSource', () => {
    useHabitatStore.getState().setSimSource('fallback');
    expect(useHabitatStore.getState().simSource).toBe('fallback');
  });

  it('setSimSource("disconnected") updates simSource', () => {
    useHabitatStore.getState().setSimSource('disconnected');
    expect(useHabitatStore.getState().simSource).toBe('disconnected');
  });

  it('selectSimSource returns current simSource value', () => {
    useHabitatStore.getState().setSimSource('biosim');
    const state = useHabitatStore.getState();
    expect(selectSimSource(state)).toBe('biosim');
  });

  it('setSimSource does not affect zones or solElapsed', () => {
    const before = useHabitatStore.getState();
    const zonesBefore = before.zones;
    const solBefore = before.solElapsed;

    useHabitatStore.getState().setSimSource('fallback');

    const after = useHabitatStore.getState();
    expect(after.zones).toBe(zonesBefore);
    expect(after.solElapsed).toBe(solBefore);
  });
});
