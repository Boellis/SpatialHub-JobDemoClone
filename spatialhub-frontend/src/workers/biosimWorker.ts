// biosimWorker.ts — Web Worker that owns the BioSim WebSocket connection.
// Runs in a Worker global scope, NOT in the DOM. Instantiated with { type: 'module' }.
//
// Message protocol:
//   Main -> Worker: WorkerCommand (CONNECT | DISCONNECT | SYNC_HISTORY)
//   Worker -> Main: WorkerMessage (READINGS | WS_OPEN | WS_CLOSE | WS_ERROR)

import { mapBioSimToHabitatReadings } from '../simulation/biosimMapper';
import type { WorkerCommand, WorkerMessage, SensorReading } from '../types/habitat';

// Module-level state — owned by this Worker thread
let ws: WebSocket | null = null;
let existingHistory: Record<string, Record<string, number[]>> = {};

/** Post a typed message to the main thread. */
function post(msg: WorkerMessage): void {
  self.postMessage(msg);
}

/** Open a new WebSocket connection to BioSim. */
function connect(wsUrl: string): void {
  // Close any existing connection first
  if (ws !== null) {
    ws.close();
    ws = null;
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    post({ type: 'WS_OPEN' });
  };

  ws.onclose = (e: CloseEvent) => {
    post({ type: 'WS_CLOSE', code: e.code });
  };

  ws.onerror = () => {
    post({ type: 'WS_ERROR' });
  };

  ws.onmessage = (e: MessageEvent) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: { modules?: Record<string, any> } = JSON.parse(e.data as string);
      const modules = payload?.modules;

      if (!modules) return;

      const readings = mapBioSimToHabitatReadings(modules, Date.now(), existingHistory);

      // Update existingHistory from the returned readings for ring buffer continuity
      for (const [zoneId, sensors] of Object.entries(readings)) {
        if (!existingHistory[zoneId]) {
          existingHistory[zoneId] = {};
        }
        for (const [sensorId, reading] of Object.entries(
          sensors as Record<string, SensorReading>
        )) {
          existingHistory[zoneId][sensorId] = reading.history;
        }
      }

      post({ type: 'READINGS', readings });
    } catch (err) {
      // Never crash the Worker on a bad frame — just log and continue
      console.warn('[biosimWorker] Failed to parse BioSim message:', err);
    }
  };
}

/** Close the WebSocket. existingHistory is preserved for reconnection continuity. */
function disconnect(): void {
  ws?.close();
  ws = null;
  // Intentionally NOT clearing existingHistory — sparklines stay continuous on reconnect
}

/** Handle commands from the main thread. */
self.onmessage = (e: MessageEvent<WorkerCommand>) => {
  const cmd = e.data;

  switch (cmd.type) {
    case 'CONNECT':
      connect(cmd.wsUrl);
      break;

    case 'DISCONNECT':
      disconnect();
      break;

    case 'SYNC_HISTORY':
      // Merge incoming history with existing to preserve sparklines across source switches
      existingHistory = { ...existingHistory, ...cmd.history };
      break;

    default: {
      // Type narrowing ensures this is unreachable if WorkerCommand stays in sync
      const _exhaustive: never = cmd;
      console.warn('[biosimWorker] Unknown command:', _exhaustive);
    }
  }
};
