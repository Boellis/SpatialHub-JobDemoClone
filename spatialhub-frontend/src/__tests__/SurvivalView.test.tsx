/** @vitest-environment jsdom */
/**
 * SurvivalView page tests — SPECTATOR mode.
 *
 * Tests verify the read-only SSE spectator view:
 *  - On render the page AUTO-CONNECTS an EventSource to the `/live` URL (no Run click).
 *  - A `sol` event drives the habitat store (zone state updates via solEventToReadings),
 *    bumps the big SOL counter, and surfaces the bot's reasoning.
 *  - An `end` event renders the "Survived N sols" result card.
 *
 * EventSource is mocked so we can drive named events synchronously.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import SurvivalView from '../pages/SurvivalView';
import { useHabitatStore } from '../store/habitatStore';

// ---- EventSource mock --------------------------------------------------------
type Listener = (ev: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, Listener[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    (this.listeners[type] ??= []).push(cb);
  }

  removeEventListener(type: string, cb: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== cb);
  }

  close() {
    this.closed = true;
  }

  // Test helper: emit a named SSE event with a JSON payload.
  emit(type: string, data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const cb of this.listeners[type] ?? []) cb(ev);
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  (globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource;
  // Silence the stopSurvival fetch.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderView() {
  return render(
    <MemoryRouter>
      <SurvivalView />
    </MemoryRouter>,
  );
}

describe('SurvivalView', () => {
  it('auto-connects an EventSource and drives store + SOL counter + reasoning on a sol event', () => {
    renderView();

    // Spectator mode: auto-connects on render, no Run click.
    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain('/live');

    act(() => {
      es.emit('run', { run_id: 'run-123', difficulty: 'malfunctions', crew_size: 4 });
      es.emit('sol', {
        sol: 5,
        alive: true,
        modules: {
          Crew_Quarters_Environment: {
            properties: { temperature: 22, relativeHumidity: 40, totalPressure: 101 },
          },
        },
        reasoning: 'Venting CO2 to stabilize the grow bays.',
        actions: [],
        warnings: [],
      });
    });

    // Big SOL counter reflects the event value.
    expect(screen.getByTestId('survival-sol').textContent).toContain('5');

    // Bot reasoning surfaced in the overlay.
    expect(screen.getByText(/Venting CO2 to stabilize the grow bays\./)).toBeInTheDocument();

    // Zone state updated via the shared habitat store.
    expect(useHabitatStore.getState().zones['grow-bays'].sensors['gb-temp'].value).toBe(22);
  });

  it('renders a "Survived N sols" result card on an end event', () => {
    renderView();
    const es = MockEventSource.instances[0];

    act(() => {
      es.emit('end', { sols_survived: 5, ended_reason: 'crew_dead' });
    });

    expect(screen.getByText(/Survived 5 sols/i)).toBeInTheDocument();
  });
});
