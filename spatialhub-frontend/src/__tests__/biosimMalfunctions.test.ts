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
