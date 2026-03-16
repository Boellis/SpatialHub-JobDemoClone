// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BIOSIM_MALFUNCTION_MAP, postMalfunction, deleteMalfunction } from '../simulation/biosimMalfunctions';

// Mock useSimSource to avoid import.meta.env in test environment
vi.mock('../hooks/useSimSource', () => ({
  BIOSIM_BASE_URL: 'http://localhost:8009',
}));

// ---------------------------------------------------------------------------
// biosimMalfunctions service tests
// ---------------------------------------------------------------------------

describe('biosimMalfunctions service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('BIOSIM_MALFUNCTION_MAP', () => {
    it('maps co2-spike to VCCR', () => {
      expect(BIOSIM_MALFUNCTION_MAP['co2-spike']).toBeDefined();
      expect(BIOSIM_MALFUNCTION_MAP['co2-spike'].moduleName).toBe('VCCR');
    });

    it('maps pump-failure to Grey_Water_Store', () => {
      expect(BIOSIM_MALFUNCTION_MAP['pump-failure']).toBeDefined();
      expect(BIOSIM_MALFUNCTION_MAP['pump-failure'].moduleName).toBe('Grey_Water_Store');
    });

    it('maps nutrient-crash to Dirty_Water_Store', () => {
      expect(BIOSIM_MALFUNCTION_MAP['nutrient-crash']).toBeDefined();
      expect(BIOSIM_MALFUNCTION_MAP['nutrient-crash'].moduleName).toBe('Dirty_Water_Store');
    });

    it('maps power-fluctuation to Nuclear_Source', () => {
      expect(BIOSIM_MALFUNCTION_MAP['power-fluctuation']).toBeDefined();
      expect(BIOSIM_MALFUNCTION_MAP['power-fluctuation'].moduleName).toBe('Nuclear_Source');
    });
  });

  describe('postMalfunction', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('sends POST with correct URL, headers, and body', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malfunctionID: 42 }),
      } as Response);

      await postMalfunction('1', 'VCCR', 'SEVERE_MALF', 'TEMPORARY_MALF');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8009/api/simulation/1/modules/VCCR/malfunctions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ intensity: 'SEVERE_MALF', length: 'TEMPORARY_MALF' }),
        })
      );
    });

    it('includes tickToOccur when provided and > 0', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malfunctionID: 7 }),
      } as Response);

      await postMalfunction('1', 'VCCR', 'SEVERE_MALF', 'TEMPORARY_MALF', 10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ intensity: 'SEVERE_MALF', length: 'TEMPORARY_MALF', tickToOccur: 10 }),
        })
      );
    });

    it('omits tickToOccur when undefined', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malfunctionID: 7 }),
      } as Response);

      await postMalfunction('1', 'VCCR', 'SEVERE_MALF', 'TEMPORARY_MALF', undefined);

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).not.toHaveProperty('tickToOccur');
    });

    it('returns malfunctionID on 200', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malfunctionID: 42 }),
      } as Response);

      const result = await postMalfunction('1', 'VCCR', 'SEVERE_MALF', 'TEMPORARY_MALF');
      expect(result).toBe(42);
    });

    it('returns null on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await postMalfunction('1', 'VCCR', 'SEVERE_MALF', 'TEMPORARY_MALF');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await postMalfunction('1', 'VCCR', 'SEVERE_MALF', 'TEMPORARY_MALF');
      expect(result).toBeNull();
    });
  });

  describe('deleteMalfunction', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('sends DELETE with correct URL', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      await deleteMalfunction('1', 'VCCR', 99);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8009/api/simulation/1/modules/VCCR/malfunctions/99',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('returns true on ok response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
      const result = await deleteMalfunction('1', 'VCCR', 99);
      expect(result).toBe(true);
    });

    it('returns false on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
      const result = await deleteMalfunction('1', 'VCCR', 99);
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
      const result = await deleteMalfunction('1', 'VCCR', 99);
      expect(result).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// habitatStore anomaly branching tests (added in Task 2)
// ---------------------------------------------------------------------------

import { useHabitatStore } from '../store/habitatStore';

describe('habitatStore anomaly branching', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Reset store state: simSource back to connecting, clear anomalies and biosim fields
    useHabitatStore.setState({
      simSource: 'connecting',
      biosimSimId: null,
      biosimMalfunctionIds: {},
      anomalies: {},
      scenarioAnnouncements: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('triggerAnomaly in BioSim mode', () => {
    it('fires POST to correct URL when simSource is biosim and biosimSimId is set', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malfunctionID: 42 }),
      } as Response);

      useHabitatStore.setState({ simSource: 'biosim', biosimSimId: '1' });
      useHabitatStore.getState().triggerAnomaly('co2-spike');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8009/api/simulation/1/modules/VCCR/malfunctions',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('anomalies[co2-spike] has phase peak immediately (sentinel for button active state)', () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malfunctionID: 42 }),
      } as Response);

      useHabitatStore.setState({ simSource: 'biosim', biosimSimId: '1' });
      useHabitatStore.getState().triggerAnomaly('co2-spike');

      const state = useHabitatStore.getState();
      expect(state.anomalies['co2-spike']).toBeDefined();
      expect(state.anomalies['co2-spike'].phase).toBe('peak');
    });

    it('biosimMalfunctionIds has the real ID after POST resolves', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malfunctionID: 42 }),
      } as Response);

      useHabitatStore.setState({ simSource: 'biosim', biosimSimId: '1' });
      useHabitatStore.getState().triggerAnomaly('co2-spike');

      // Flush all pending microtasks and promises
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(useHabitatStore.getState().biosimMalfunctionIds['co2-spike']).toBe(42);
    });

    it('calling triggerAnomaly again on active scenario triggers cancelAnomaly (toggle)', async () => {
      const mockFetch = vi.mocked(fetch);
      // First call: POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ malfunctionID: 42 }),
      } as Response);
      // Second call: DELETE (from cancelAnomaly)
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      useHabitatStore.setState({ simSource: 'biosim', biosimSimId: '1' });
      useHabitatStore.getState().triggerAnomaly('co2-spike');

      // Wait for POST to resolve and real ID to be stored
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      // Trigger again — should toggle (cancel)
      useHabitatStore.getState().triggerAnomaly('co2-spike');

      // anomalies entry should now be idle
      expect(useHabitatStore.getState().anomalies['co2-spike'].phase).toBe('idle');
      // biosimMalfunctionIds entry should be removed
      expect(useHabitatStore.getState().biosimMalfunctionIds['co2-spike']).toBeUndefined();
    });
  });

  describe('cancelAnomaly in BioSim mode', () => {
    it('fires DELETE with stored malfunctionID', () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      useHabitatStore.setState({
        simSource: 'biosim',
        biosimSimId: '1',
        biosimMalfunctionIds: { 'co2-spike': 99 },
        anomalies: { 'co2-spike': { phase: 'peak', ticksInPhase: 0, biasFactor: 1 } },
      });

      useHabitatStore.getState().cancelAnomaly('co2-spike');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8009/api/simulation/1/modules/VCCR/malfunctions/99',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('anomalies entry is reset to idle phase', () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

      useHabitatStore.setState({
        simSource: 'biosim',
        biosimSimId: '1',
        biosimMalfunctionIds: { 'co2-spike': 99 },
        anomalies: { 'co2-spike': { phase: 'peak', ticksInPhase: 0, biasFactor: 1 } },
      });

      useHabitatStore.getState().cancelAnomaly('co2-spike');

      expect(useHabitatStore.getState().anomalies['co2-spike'].phase).toBe('idle');
    });

    it('biosimMalfunctionIds entry is removed', () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

      useHabitatStore.setState({
        simSource: 'biosim',
        biosimSimId: '1',
        biosimMalfunctionIds: { 'co2-spike': 99 },
        anomalies: { 'co2-spike': { phase: 'peak', ticksInPhase: 0, biasFactor: 1 } },
      });

      useHabitatStore.getState().cancelAnomaly('co2-spike');

      expect(useHabitatStore.getState().biosimMalfunctionIds['co2-spike']).toBeUndefined();
    });
  });

  describe('triggerAnomaly in fallback mode', () => {
    it('does NOT fire fetch when simSource is fallback', () => {
      const mockFetch = vi.mocked(fetch);

      useHabitatStore.setState({ simSource: 'fallback', biosimSimId: null });
      useHabitatStore.getState().triggerAnomaly('co2-spike');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('anomalies[co2-spike] has phase onset (existing behavior)', () => {
      vi.mocked(fetch);

      useHabitatStore.setState({ simSource: 'fallback', biosimSimId: null });
      useHabitatStore.getState().triggerAnomaly('co2-spike');

      const state = useHabitatStore.getState();
      expect(state.anomalies['co2-spike']).toBeDefined();
      expect(state.anomalies['co2-spike'].phase).toBe('onset');
    });

    it('onset ticksInPhase is 0 and biasFactor is 0 (existing behavior)', () => {
      useHabitatStore.setState({ simSource: 'fallback', biosimSimId: null });
      useHabitatStore.getState().triggerAnomaly('co2-spike');

      const entry = useHabitatStore.getState().anomalies['co2-spike'];
      expect(entry.ticksInPhase).toBe(0);
      expect(entry.biasFactor).toBe(0);
    });
  });

  describe('cancelAnomaly in fallback mode', () => {
    it('transitions to recovery phase (existing behavior)', () => {
      useHabitatStore.setState({
        simSource: 'fallback',
        biosimSimId: null,
        anomalies: { 'co2-spike': { phase: 'onset', ticksInPhase: 3, biasFactor: 0.5 } },
      });

      useHabitatStore.getState().cancelAnomaly('co2-spike');

      const entry = useHabitatStore.getState().anomalies['co2-spike'];
      expect(entry.phase).toBe('recovery');
      expect(entry.ticksInPhase).toBe(0);
      expect(entry.biasFactor).toBe(0.5); // preserved from before
    });
  });

  describe('setSimSource clears biosimMalfunctionIds', () => {
    it('clears biosimMalfunctionIds when transitioning away from biosim', () => {
      useHabitatStore.setState({
        simSource: 'biosim',
        biosimMalfunctionIds: { 'co2-spike': 42 },
      });

      useHabitatStore.getState().setSimSource('fallback');

      expect(useHabitatStore.getState().biosimMalfunctionIds).toEqual({});
    });

    it('does NOT clear biosimMalfunctionIds when staying on biosim', () => {
      useHabitatStore.setState({
        simSource: 'biosim',
        biosimMalfunctionIds: { 'co2-spike': 42 },
      });

      useHabitatStore.getState().setSimSource('biosim');

      expect(useHabitatStore.getState().biosimMalfunctionIds).toEqual({ 'co2-spike': 42 });
    });
  });
});
