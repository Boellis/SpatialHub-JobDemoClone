/** @vitest-environment jsdom */
/**
 * useSimSource tests.
 *
 * Tests are split into two layers:
 *  1. Pure function tests: probeBioSim, wsUrl (fast, no hook machinery)
 *  2. Hook integration tests: state machine transitions, reconnection, RAF batching, cleanup
 *
 * Worker and fetch are mocked. The simulation engine's startSimulation/stopSimulation are
 * patched at the store level to avoid triggering the real 2s setInterval (which causes
 * infinite timer loops with vi.useFakeTimers).
 *
 * Timers use vi.useFakeTimers() with advanceTimersByTimeAsync (not runAllTimersAsync).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  probeBioSim,
  wsUrl,
  useSimSource,
  BIOSIM_BASE_URL,
  RETRY_DELAYS,
  DISCONNECTED_DISPLAY_MS,
} from '../hooks/useSimSource';
import { useHabitatStore } from '../store/habitatStore';
import type { WorkerMessage } from '../types/habitat';

// ---------------------------------------------------------------------------
// MockWorker — captures postMessage commands and lets tests inject messages
// ---------------------------------------------------------------------------
class MockWorker {
  static instances: MockWorker[] = [];
  sentMessages: unknown[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  terminate = vi.fn();

  constructor(_url: URL | string, _opts?: WorkerOptions) {
    MockWorker.instances.push(this);
  }

  postMessage(msg: unknown): void {
    this.sentMessages.push(msg);
  }

  /** Simulate a message arriving from the Worker thread. */
  fireMessage(msg: WorkerMessage): void {
    this.onmessage?.({ data: msg } as MessageEvent);
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let startSimMock: ReturnType<typeof vi.fn>;
let stopSimMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  MockWorker.instances = [];

  // Replace Worker global
  vi.stubGlobal('Worker', MockWorker);

  // Mock requestAnimationFrame / cancelAnimationFrame
  let rafId = 0;
  const rafCallbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafCallbacks.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id);
  });
  (globalThis as Record<string, unknown>).__rafCallbacks = rafCallbacks;

  // Default fetch: BioSim unavailable
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

  // Reset store state
  useHabitatStore.setState({
    simSource: 'connecting',
    isRunning: false,
    solElapsed: 0,
    tickCount: 0,
  });

  // Patch startSimulation and stopSimulation to no-ops that just update isRunning.
  // This prevents the real engine from creating setInterval loops with fake timers.
  startSimMock = vi.fn(() => {
    useHabitatStore.setState({ isRunning: true });
  });
  stopSimMock = vi.fn(() => {
    useHabitatStore.setState({ isRunning: false });
  });
  useHabitatStore.setState({
    startSimulation: startSimMock as unknown as () => void,
    stopSimulation: stopSimMock as unknown as () => void,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  MockWorker.instances = [];
});

function getWorker(): MockWorker {
  return MockWorker.instances[MockWorker.instances.length - 1];
}

function flushRaf(): void {
  const callbacks = (globalThis as Record<string, unknown>).__rafCallbacks as Map<number, FrameRequestCallback>;
  const entries = [...callbacks.entries()];
  callbacks.clear();
  for (const [, cb] of entries) {
    cb(performance.now());
  }
}

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('wsUrl', () => {
  it('replaces http with ws', () => {
    const expected = BIOSIM_BASE_URL.replace(/^http(s?):\/\//, 'ws$1://') + '/ws/simulation/42';
    expect(wsUrl('42')).toBe(expected);
  });

  it('derived URL contains /ws/simulation/{id} suffix', () => {
    const result = wsUrl('99');
    expect(result).toContain('/ws/simulation/99');
    expect(result).not.toContain('http://');
  });
});

describe('probeBioSim', () => {
  it('returns null when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(probeBioSim()).resolves.toBeNull();
  });

  it('returns null when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
    await expect(probeBioSim()).resolves.toBeNull();
  });

  it('returns null when response body is empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    await expect(probeBioSim()).resolves.toBeNull();
  });

  it('returns simId string from numeric array [1]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [1] }));
    await expect(probeBioSim()).resolves.toBe('1');
  });

  it('returns simId string from object array [{ id: 1 }]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 1, name: 'sim' }] }));
    await expect(probeBioSim()).resolves.toBe('1');
  });

  it('returns null when json is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) }));
    await expect(probeBioSim()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hook integration tests
// ---------------------------------------------------------------------------

describe('useSimSource hook', () => {
  // FALL-01: probe null -> fallback
  it('when probeBioSim returns null, simSource transitions to fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const { unmount } = renderHook(() => useSimSource());

    // Allow microtasks (Promise chains) to settle — advance 0ms to flush microtask queue
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(useHabitatStore.getState().simSource).toBe('fallback');

    unmount();
  });

  it('when probeBioSim returns null, startSimulation is called', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const { unmount } = renderHook(() => useSimSource());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // startSimulation was called on mount (immediate client-side sim start)
    expect(startSimMock).toHaveBeenCalled();
    expect(useHabitatStore.getState().isRunning).toBe(true);

    unmount();
  });

  // FALL-02: probe success -> Worker receives CONNECT
  it('when probeBioSim returns simId, Worker receives SYNC_HISTORY then CONNECT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [1] }));

    const { unmount } = renderHook(() => useSimSource());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const worker = getWorker();
    const commands = worker.sentMessages as Array<{ type: string; wsUrl?: string }>;

    const syncCmd = commands.find((c) => c.type === 'SYNC_HISTORY');
    expect(syncCmd).toBeDefined();

    const connectCmd = commands.find((c) => c.type === 'CONNECT');
    expect(connectCmd).toBeDefined();
    expect(connectCmd?.wsUrl).toContain('/ws/simulation/1');

    unmount();
  });

  // FALL-04: WS_OPEN -> stopSimulation called, simSource = 'biosim'
  it('on WS_OPEN, stopSimulation is called and simSource becomes biosim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [1] }));

    const { unmount } = renderHook(() => useSimSource());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    act(() => {
      getWorker().fireMessage({ type: 'WS_OPEN' });
    });

    expect(useHabitatStore.getState().simSource).toBe('biosim');
    expect(stopSimMock).toHaveBeenCalled();
    expect(useHabitatStore.getState().isRunning).toBe(false);

    unmount();
  });

  // PERF-05/PERF-07: multiple READINGS between RAF frames -> one tick
  it('multiple READINGS messages between RAF frames result in exactly one store.tick()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [1] }));

    const { unmount } = renderHook(() => useSimSource());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Switch to BioSim path
    act(() => {
      getWorker().fireMessage({ type: 'WS_OPEN' });
    });

    const initialTickCount = useHabitatStore.getState().tickCount;

    // Send 5 READINGS messages (burst)
    const mockReadings = { 'grow-bays': {} };
    act(() => {
      for (let i = 0; i < 5; i++) {
        getWorker().fireMessage({ type: 'READINGS', readings: mockReadings });
      }
    });

    // Flush ONE RAF frame
    act(() => {
      flushRaf();
    });

    // Should have ticked exactly once
    expect(useHabitatStore.getState().tickCount).toBe(initialTickCount + 1);

    unmount();
  });

  // TELE-03: WS_CLOSE -> retry backoff -> fallback
  it('on WS_CLOSE, retries exponentially then falls back after retries exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [1] }) // initial probe
      .mockRejectedValue(new Error('BioSim down')) // retry probes
    );

    const { unmount } = renderHook(() => useSimSource());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    act(() => {
      getWorker().fireMessage({ type: 'WS_OPEN' });
    });

    // Trigger disconnect
    act(() => {
      getWorker().fireMessage({ type: 'WS_CLOSE', code: 1006 });
    });

    expect(useHabitatStore.getState().simSource).toBe('disconnected');

    // Advance through all retry delays + disconnected display delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0] + 200);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[1] + 200);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[2] + 200);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DISCONNECTED_DISPLAY_MS + 200);
    });

    expect(useHabitatStore.getState().simSource).toBe('fallback');
    expect(useHabitatStore.getState().isRunning).toBe(true);

    unmount();
  });

  // Cleanup: Worker.terminate() called on unmount
  it('unmounting the hook calls Worker.terminate()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const { unmount } = renderHook(() => useSimSource());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const worker = getWorker();
    unmount();

    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('unmounting sends DISCONNECT command to Worker before terminating', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const { unmount } = renderHook(() => useSimSource());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const worker = getWorker();
    unmount();

    const sentTypes = (worker.sentMessages as Array<{ type: string }>).map((m) => m.type);
    expect(sentTypes).toContain('DISCONNECT');
  });
});
