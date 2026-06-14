/** @vitest-environment jsdom */
/**
 * SurvivalView page tests — SPECTATOR mode (self-contained mission-control dashboard).
 *
 *  - On render the page AUTO-CONNECTS an EventSource to the `/live` URL (no Run click).
 *  - A `sol` event bumps the big SOL counter, renders life-support resource cards from
 *    the event's `stores`, and surfaces the bot's reasoning in the decision log.
 *  - An `end` event renders the "Run Complete · N sols" climax card.
 *
 * EventSource is mocked so we can drive named events synchronously.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import SurvivalView from '../pages/SurvivalView';

// ---- EventSource mock --------------------------------------------------------
type Listener = (ev: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, Listener[]> = {};
  onopen: (() => void) | null = null;
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

  emit(type: string, data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const cb of this.listeners[type] ?? []) cb(ev);
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  (globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource;
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
  it('auto-connects and drives the SOL counter, resource cards, and reasoning on a sol event', () => {
    renderView();

    // Spectator mode: auto-connects on render, no Run click.
    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain('/live');

    act(() => {
      es.emit('run', { run_id: 'run-123', difficulty: 'off', crew_size: 6 });
      es.emit('sol', {
        sol: 5,
        alive: true,
        modules: {},
        reasoning: 'Trimming OGS O2 to stop wasting potable water.',
        actions: [{ module: 'OGS', kind: 'producers', type: 'O2', desired_rates: [990] }],
        warnings: [],
        stores: [
          { name: 'O2_Store', pct: 75 },
          { name: 'Potable_Water_Store', pct: 87, runway_sols: 119 },
        ],
        balances: [{ resource: 'O2', net: 15.4 }],
      });
    });

    // Big SOL counter reflects the event value (zero-padded to 3).
    expect(screen.getByTestId('survival-sol').textContent).toContain('5');

    // A resource card rendered from the event's stores.
    expect(screen.getByText('Oxygen')).toBeInTheDocument();

    // Bot reasoning surfaced in the decision log.
    expect(
      screen.getByText(/Trimming OGS O2 to stop wasting potable water\./),
    ).toBeInTheDocument();

    // Last command echoed.
    expect(screen.getByText(/OGS · producers · O2/)).toBeInTheDocument();
  });

  it('renders the run-complete card on an end event', () => {
    renderView();
    const es = MockEventSource.instances[0];

    act(() => {
      es.emit('end', { sols_survived: 42, ended_reason: 'crew_death' });
    });

    expect(screen.getByText('Run Complete')).toBeInTheDocument();
    expect(screen.getByText('Run Complete').parentElement?.textContent).toContain('42 sols');
  });
});
