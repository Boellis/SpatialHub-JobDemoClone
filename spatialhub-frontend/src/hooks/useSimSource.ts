// useSimSource.ts — Orchestration hook for the BioSim WebSocket data pipeline.
//
// Manages the full lifecycle:
//   1. Start client-side sim engine immediately (zero blank-screen time)
//   2. Probe BioSim REST API for a live simulation ID
//   3. If found: SYNC_HISTORY + CONNECT Worker to BioSim WebSocket
//   4. On WS_OPEN: stop client-side engine, start RAF buffer loop
//   5. On WS_CLOSE: exponential-backoff retry (3 attempts) then fall back to client-side
//   6. Background 15s probe auto-reconnects from fallback
//   7. Cleanup on unmount: Worker.terminate(), clear all timers, stop engine
//
// All state surfaces through habitatStore — no local React state.
// PERF-02: Always use useHabitatStore.getState() (imperative), never useHabitatStore() (hook).

import { useEffect, useRef } from 'react';
import { useHabitatStore } from '../store/habitatStore';
import type { SensorReading, WorkerCommand, WorkerMessage } from '../types/habitat';

// ---------------------------------------------------------------------------
// Configuration constants (exported for testing)
// ---------------------------------------------------------------------------
export const BIOSIM_BASE_URL = (import.meta.env.VITE_BIOSIM_URL ?? 'http://localhost:8009') as string;
export const PROBE_INTERVAL_MS = 15_000;
export const PROBE_TIMEOUT_MS = 5_000;
export const RETRY_DELAYS = [1000, 2000, 4000] as const;
export const DISCONNECTED_DISPLAY_MS = 2000;

// ---------------------------------------------------------------------------
// Pure helper functions (exported for testing)
// ---------------------------------------------------------------------------

/** Derive the BioSim WebSocket URL from a simulation ID. */
export function wsUrl(simId: string): string {
  const base = BIOSIM_BASE_URL.replace(/^http(s?):\/\//, 'ws$1://');
  return `${base}/ws/simulation/${simId}`;
}

/**
 * Probe BioSim REST API for a live simulation.
 * Returns the simulation ID as a string, or null if BioSim is unavailable.
 *
 * Handles both numeric array `[1]` and object array `[{ id: 1 }]` responses.
 */
export async function probeBioSim(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${BIOSIM_BASE_URL}/api/simulation`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: unknown = await response.json();

    // Handle both bare array `[1]` and wrapped `{ simulations: [1] }` formats
    const arr: unknown[] | null =
      Array.isArray(data) ? data
      : (data && typeof data === 'object' && 'simulations' in data && Array.isArray((data as { simulations: unknown }).simulations))
        ? (data as { simulations: unknown[] }).simulations
        : null;

    if (!arr || arr.length === 0) return null;

    const first = arr[0];
    // Handle [1] (numeric) or [{ id: 1 }] (object) formats
    if (typeof first === 'number') return String(first);
    if (first && typeof first === 'object' && 'id' in first) return String((first as { id: unknown }).id);
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: extract current sparkline history from the store
// ---------------------------------------------------------------------------
function extractHistory(): Record<string, Record<string, number[]>> {
  const zones = useHabitatStore.getState().zones;
  const history: Record<string, Record<string, number[]>> = {};
  for (const [zoneId, zone] of Object.entries(zones)) {
    history[zoneId] = {};
    for (const [sensorId, reading] of Object.entries(zone.sensors as Record<string, SensorReading>)) {
      history[zoneId][sensorId] = reading.history;
    }
  }
  return history;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Manage the full BioSim WebSocket pipeline lifecycle. Side effects only — no return value. */
export function useSimSource(): void {
  // ---- Refs (mutable, no re-render on change) ----
  const workerRef = useRef<Worker | null>(null);
  const pendingReadingsRef = useRef<Record<string, Record<string, SensorReading>> | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const probeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(false);
  const simIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const store = useHabitatStore.getState();

    // 1. Signal "connecting" to UI immediately
    store.setSimSource('connecting');

    // 2. Start client-side engine immediately — zero blank-screen time
    store.startSimulation();

    // 3. Create Worker (Vite module Worker pattern)
    const worker = new Worker(
      new URL('../workers/biosimWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    // ---- RAF loop ----

    function rafLoop(): void {
      const readings = pendingReadingsRef.current;
      if (readings !== null) {
        pendingReadingsRef.current = null;
        useHabitatStore.getState().tick(readings);
      }
      rafHandleRef.current = requestAnimationFrame(rafLoop);
    }

    function startRAFLoop(): void {
      if (rafHandleRef.current !== null) return; // already running
      rafHandleRef.current = requestAnimationFrame(rafLoop);
    }

    function stopRAFLoop(): void {
      if (rafHandleRef.current !== null) {
        cancelAnimationFrame(rafHandleRef.current);
        rafHandleRef.current = null;
      }
    }

    // ---- Reconnection / fallback logic ----

    function startFallback(): void {
      stopRAFLoop();
      if (!mountedRef.current) return;
      useHabitatStore.getState().setSimSource('fallback');
      useHabitatStore.getState().setBiosimSimId(null);
      useHabitatStore.getState().startSimulation();
    }

    function scheduleRetry(): void {
      const attempt = retryCountRef.current;

      if (attempt >= RETRY_DELAYS.length) {
        // Retries exhausted — show disconnected badge then fall back
        disconnectedTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          startFallback();
        }, DISCONNECTED_DISPLAY_MS);
        return;
      }

      retryCountRef.current = attempt + 1;

      retryTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;

        const simId = await probeBioSim();
        if (!mountedRef.current) return;

        if (simId !== null) {
          simIdRef.current = simId;
          const history = extractHistory();
          const cmd: WorkerCommand = { type: 'SYNC_HISTORY', history };
          workerRef.current?.postMessage(cmd);
          const connectCmd: WorkerCommand = { type: 'CONNECT', wsUrl: wsUrl(simId) };
          workerRef.current?.postMessage(connectCmd);
        } else {
          scheduleRetry();
        }
      }, RETRY_DELAYS[attempt]);
    }

    // ---- Worker message handler ----

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if (!mountedRef.current) return;
      const msg = e.data;

      switch (msg.type) {
        case 'WS_OPEN':
          // BioSim connected — stop client-side engine, switch to WS path
          useHabitatStore.getState().stopSimulation();
          useHabitatStore.getState().setSimSource('biosim');
          if (simIdRef.current !== null) {
            useHabitatStore.getState().setBiosimSimId(simIdRef.current);
          }
          retryCountRef.current = 0;
          startRAFLoop();
          break;

        case 'READINGS':
          // Buffer: last-value-wins when messages burst between RAF frames (PERF-05/07)
          pendingReadingsRef.current = msg.readings;
          break;

        case 'WS_CLOSE':
          if (!mountedRef.current) return;
          // Stop RAF loop before any state transition (FALL-04 invariant)
          stopRAFLoop();
          useHabitatStore.getState().setSimSource('disconnected');
          useHabitatStore.getState().setBiosimSimId(null);
          scheduleRetry();
          break;

        case 'WS_ERROR':
          // WS_CLOSE always follows WS_ERROR — handle there
          break;
      }
    };

    // ---- Background probe timer ----

    probeTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      // Only act when in fallback — don't interfere with active BioSim connection
      const currentSource = useHabitatStore.getState().simSource;
      if (currentSource !== 'fallback') return;

      const simId = await probeBioSim();
      if (!mountedRef.current) return;
      if (simId === null) return;

      simIdRef.current = simId;
      useHabitatStore.getState().setSimSource('connecting');
      const history = extractHistory();
      const syncCmd: WorkerCommand = { type: 'SYNC_HISTORY', history };
      workerRef.current?.postMessage(syncCmd);
      const connectCmd: WorkerCommand = { type: 'CONNECT', wsUrl: wsUrl(simId) };
      workerRef.current?.postMessage(connectCmd);
    }, PROBE_INTERVAL_MS);

    // ---- Tab foreground recovery (Phase 19 — long-session resilience) ----
    const handleVisibilityChange = () => {
      if (!mountedRef.current || document.hidden) return;
      // Tab became visible — probe immediately if stuck in fallback
      const currentSource = useHabitatStore.getState().simSource;
      if (currentSource !== 'fallback') return;
      void probeBioSim().then((simId) => {
        if (!mountedRef.current || simId === null) return;
        simIdRef.current = simId;
        useHabitatStore.getState().setSimSource('connecting');
        const history = extractHistory();
        workerRef.current?.postMessage({ type: 'SYNC_HISTORY', history } as WorkerCommand);
        workerRef.current?.postMessage({ type: 'CONNECT', wsUrl: wsUrl(simId) } as WorkerCommand);
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ---- Initial probe ----

    probeBioSim().then((simId) => {
      if (!mountedRef.current) return;

      if (simId !== null) {
        simIdRef.current = simId;
        const history = extractHistory();
        const syncCmd: WorkerCommand = { type: 'SYNC_HISTORY', history };
        worker.postMessage(syncCmd);
        const connectCmd: WorkerCommand = { type: 'CONNECT', wsUrl: wsUrl(simId) };
        worker.postMessage(connectCmd);
      } else {
        // BioSim not available — stay on client-side sim, set fallback source
        useHabitatStore.getState().setSimSource('fallback');
      }
    });

    // ---- Cleanup ----

    return () => {
      mountedRef.current = false;

      // Stop RAF loop
      stopRAFLoop();

      // Terminate Worker (sends DISCONNECT first for clean WS close)
      if (workerRef.current) {
        const disconnectCmd: WorkerCommand = { type: 'DISCONNECT' };
        workerRef.current.postMessage(disconnectCmd);
        workerRef.current.terminate();
        workerRef.current = null;
      }

      // Clear all timers
      if (probeTimerRef.current !== null) {
        clearInterval(probeTimerRef.current);
        probeTimerRef.current = null;
      }
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (disconnectedTimerRef.current !== null) {
        clearTimeout(disconnectedTimerRef.current);
        disconnectedTimerRef.current = null;
      }

      // Remove tab visibility listener
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Stop client-side simulation engine
      useHabitatStore.getState().stopSimulation();

      // Null out remaining refs
      pendingReadingsRef.current = null;
      simIdRef.current = null;
    };
  }, []);
}
