/** @vitest-environment jsdom */
/**
 * biosimWorker tests.
 *
 * Testing Web Workers in Vitest requires a real Worker runner or mocking the Worker
 * global entirely. Since @vitest/web-worker requires a real browser runtime for module
 * Workers and our setup uses Vite-specific ESM import paths, we take the pragmatic
 * approach recommended in the plan: extract the core connect/disconnect functions and
 * test the message protocol logic directly with a mocked WebSocket.
 *
 * What we test:
 *  - The message protocol (Worker posts correct message types on WS events)
 *  - biosimMapper integration (READINGS post contains correctly-shaped data)
 *  - DISCONNECT command closes the WebSocket
 *  - SYNC_HISTORY updates internal history state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapBioSimToHabitatReadings } from '../simulation/biosimMapper';
import fixture from '../../../tests/fixtures/biosim_module_state.json';
import type { WorkerMessage, SensorReading } from '../types/habitat';

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------
type WsEventType = 'open' | 'close' | 'error' | 'message';

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  /** Simulate an event firing from the server side. */
  fire(type: WsEventType, payload?: unknown): void {
    switch (type) {
      case 'open':
        this.onopen?.();
        break;
      case 'close':
        this.onclose?.({ code: (payload as number) ?? 1000 });
        break;
      case 'error':
        this.onerror?.();
        break;
      case 'message':
        this.onmessage?.({ data: payload as string });
        break;
    }
  }

  close = vi.fn();
}

// ---------------------------------------------------------------------------
// Inline re-implementation of the Worker's core logic for testability.
// This mirrors biosimWorker.ts exactly — if the Worker logic changes, update here too.
// ---------------------------------------------------------------------------

function createWorkerCore() {
  const posted: WorkerMessage[] = [];
  let ws: MockWebSocket | null = null;
  let existingHistory: Record<string, Record<string, number[]>> = {};

  function post(msg: WorkerMessage): void {
    posted.push(msg);
  }

  function connect(wsUrl: string): void {
    if (ws !== null) {
      ws.close();
      ws = null;
    }

    ws = new MockWebSocket(wsUrl);

    ws.onopen = () => {
      post({ type: 'WS_OPEN' });
    };

    ws.onclose = (e: { code: number }) => {
      post({ type: 'WS_CLOSE', code: e.code });
    };

    ws.onerror = () => {
      post({ type: 'WS_ERROR' });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.onmessage = (e: { data: string }) => {
      try {
        const payload: { modules?: Record<string, any> } = JSON.parse(e.data);
        const modules = payload?.modules;
        if (!modules) return;

        const readings = mapBioSimToHabitatReadings(modules, Date.now(), existingHistory);

        for (const [zoneId, sensors] of Object.entries(readings)) {
          if (!existingHistory[zoneId]) existingHistory[zoneId] = {};
          for (const [sensorId, reading] of Object.entries(
            sensors as Record<string, SensorReading>
          )) {
            existingHistory[zoneId][sensorId] = reading.history;
          }
        }

        post({ type: 'READINGS', readings });
      } catch {
        // silently ignore parse errors
      }
    };
  }

  function disconnect(): void {
    ws?.close();
    ws = null;
  }

  function syncHistory(history: Record<string, Record<string, number[]>>): void {
    existingHistory = { ...existingHistory, ...history };
  }

  return { posted, connect, disconnect, syncHistory, getWs: () => ws, getHistory: () => existingHistory };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockWebSocket.instances = [];
});

describe('biosimWorker core logic', () => {
  it('posts WS_OPEN when WebSocket opens after CONNECT', () => {
    const { posted, connect } = createWorkerCore();
    connect('ws://localhost:8009/ws/simulation/1');

    const ws = MockWebSocket.instances[0];
    ws.fire('open');

    expect(posted).toEqual([{ type: 'WS_OPEN' }]);
  });

  it('posts WS_CLOSE with code when WebSocket closes', () => {
    const { posted, connect } = createWorkerCore();
    connect('ws://localhost:8009/ws/simulation/1');
    const ws = MockWebSocket.instances[0];
    ws.fire('close', 1006);

    expect(posted).toEqual([{ type: 'WS_CLOSE', code: 1006 }]);
  });

  it('posts WS_ERROR when WebSocket errors', () => {
    const { posted, connect } = createWorkerCore();
    connect('ws://localhost:8009/ws/simulation/1');
    const ws = MockWebSocket.instances[0];
    ws.fire('error');

    expect(posted).toEqual([{ type: 'WS_ERROR' }]);
  });

  it('posts READINGS with correctly-shaped data when WS receives a BioSim message', () => {
    const { posted, connect } = createWorkerCore();
    connect('ws://localhost:8009/ws/simulation/1');
    const ws = MockWebSocket.instances[0];

    // The BioSim WebSocket sends a payload wrapping the module state
    ws.fire('message', JSON.stringify({ modules: fixture.modules }));

    expect(posted).toHaveLength(1);
    const msg = posted[0];
    expect(msg.type).toBe('READINGS');

    if (msg.type !== 'READINGS') return;
    // Should have all four zones
    expect(Object.keys(msg.readings)).toEqual(
      expect.arrayContaining(['grow-bays', 'atmosphere-control', 'water-recycling', 'power-thermal'])
    );
    // Spot-check a sensor
    const gbTemp = msg.readings['grow-bays']?.['gb-temp'];
    expect(gbTemp).toBeDefined();
    expect(gbTemp.value).toBeCloseTo(23.0, 2);
    expect(gbTemp.status).toBe('green');
  });

  it('does not crash on malformed JSON — just silently drops the message', () => {
    const { posted, connect } = createWorkerCore();
    connect('ws://localhost:8009/ws/simulation/1');
    const ws = MockWebSocket.instances[0];
    ws.fire('message', 'not-valid-json{{{');

    // No READINGS posted, no crash
    expect(posted).toHaveLength(0);
  });

  it('DISCONNECT command closes the WebSocket', () => {
    const { connect, disconnect, getWs } = createWorkerCore();
    connect('ws://localhost:8009/ws/simulation/1');
    const ws = MockWebSocket.instances[0];
    expect(ws.close).not.toHaveBeenCalled();

    disconnect();

    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(getWs()).toBeNull();
  });

  it('SYNC_HISTORY updates internal history state', () => {
    const { syncHistory, getHistory } = createWorkerCore();

    syncHistory({
      'grow-bays': { 'gb-temp': [20, 21, 22] },
    });

    expect(getHistory()['grow-bays']['gb-temp']).toEqual([20, 21, 22]);
  });

  it('SYNC_HISTORY merges with existing history (does not wipe other zones)', () => {
    const { syncHistory, getHistory } = createWorkerCore();

    syncHistory({ 'grow-bays': { 'gb-temp': [20, 21] } });
    syncHistory({ 'atmosphere-control': { 'ac-o2': [19, 20] } });

    expect(getHistory()['grow-bays']['gb-temp']).toEqual([20, 21]);
    expect(getHistory()['atmosphere-control']['ac-o2']).toEqual([19, 20]);
  });

  it('existingHistory is preserved after disconnect (for reconnection ring buffer continuity)', () => {
    const { connect, disconnect, syncHistory, getHistory } = createWorkerCore();

    syncHistory({ 'grow-bays': { 'gb-temp': [22, 23] } });
    connect('ws://localhost:8009/ws/simulation/1');
    disconnect();

    // History must survive disconnect so sparklines are continuous on reconnect
    expect(getHistory()['grow-bays']['gb-temp']).toEqual([22, 23]);
  });

  it('history is updated from READINGS so next call benefits from ring buffer continuity', () => {
    const { connect, getHistory } = createWorkerCore();
    connect('ws://localhost:8009/ws/simulation/1');
    const ws = MockWebSocket.instances[0];

    ws.fire('message', JSON.stringify({ modules: fixture.modules }));

    // After receiving a message, existingHistory should contain grow-bays sensors
    expect(getHistory()['grow-bays']).toBeDefined();
    expect(Array.isArray(getHistory()['grow-bays']['gb-temp'])).toBe(true);
    expect(getHistory()['grow-bays']['gb-temp'].length).toBeGreaterThan(0);
  });

  it('closes existing WebSocket before opening new one on re-CONNECT', () => {
    const { connect } = createWorkerCore();
    connect('ws://localhost:8009/ws/simulation/1');
    const firstWs = MockWebSocket.instances[0];

    connect('ws://localhost:8009/ws/simulation/2');

    expect(firstWs.close).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
