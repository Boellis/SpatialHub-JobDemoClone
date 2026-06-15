/** @vitest-environment jsdom */
/**
 * TvDashboardView (the /habitat dashboard) tests — it MIRRORS the live survival test.
 *
 *  - With no run it shows an explicit standby state (NO ACTIVE TEST).
 *  - It auto-connects an EventSource to the same `/live` relay as the survival screen.
 *  - A run+sol drives the phase pill to LIVE, the SOL counter, and the crew's
 *    life-support resource cards (the same cards the survival screen shows).
 *  - A `status` paused event flips it to PAUSED; an `end` event reflects STOPPED/ended.
 *
 * EventSource is mocked so we can drive named events synchronously.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import TvDashboardView from '../pages/TvDashboardView';

type Listener = (ev: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  static readonly CLOSED = 2;
  url: string;
  readyState = 0;
  listeners: Record<string, Listener[]> = {};
  onerror: (() => void) | null = null;

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
  close() { this.readyState = MockEventSource.CLOSED; }
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

const SOL = {
  sol: 5, alive: true, modules: {}, reasoning: '', actions: [], warnings: [],
  stores: [
    { name: 'O2_Store', pct: 75 },
    { name: 'Potable_Water_Store', pct: 87, runway_sols: 119 },
  ],
  balances: [{ resource: 'O2', net: 2.1 }],
};

describe('TvDashboardView (habitat mirror)', () => {
  it('shows an explicit standby state when no test is running', () => {
    render(<TvDashboardView />);
    expect(screen.getByText(/NO ACTIVE TEST/i)).toBeInTheDocument();
  });

  it('auto-connects to the same /live relay as the survival screen', () => {
    render(<TvDashboardView />);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain('/live');
  });

  it('mirrors the live test: phase LIVE, sol counter, and crew resource cards', () => {
    render(<TvDashboardView />);
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('run', { run_id: 'r1', difficulty: 'malfunctions', crew_size: 15 });
      es.emit('sol', SOL);
    });
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText(/SOL 005/)).toBeInTheDocument();
    expect(screen.getByText('Oxygen')).toBeInTheDocument();      // same card label as the survival screen
    expect(screen.getByText('Potable Water')).toBeInTheDocument();
  });

  it('reflects a paused test via the status broadcast', () => {
    render(<TvDashboardView />);
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('run', { run_id: 'r1', difficulty: 'off', crew_size: 15 });
      es.emit('sol', SOL);
      es.emit('status', { paused: true });
    });
    // 'PAUSED' shows in both the phase pill and the watermark.
    expect(screen.getAllByText(/PAUSED/).length).toBeGreaterThan(0);
  });

  it('reflects a stopped test', () => {
    render(<TvDashboardView />);
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('run', { run_id: 'r1', difficulty: 'off', crew_size: 15 });
      es.emit('sol', SOL);
      es.emit('end', { sols_survived: 412, ended_reason: 'stopped' });
    });
    expect(screen.getByText('STOPPED')).toBeInTheDocument();
    expect(screen.getByText(/412 sols/)).toBeInTheDocument();
  });
});
