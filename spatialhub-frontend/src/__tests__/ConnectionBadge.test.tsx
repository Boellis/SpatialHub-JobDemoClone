/** @vitest-environment jsdom */
/**
 * ConnectionBadge component tests.
 *
 * Tests verify:
 *  - Correct label text for all 5 simSource states (biosim/biosim-real/connecting/disconnected/fallback)
 *  - Correct dot color matching for each state
 *  - Component renders a dot element and a label in all states
 *
 * Uses Zustand's setState to inject simSource values directly — avoids hook machinery.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useHabitatStore } from '../store/habitatStore';
import { ConnectionBadge } from '../components/habitat/ConnectionBadge';

// Reset store before each test
beforeEach(() => {
  useHabitatStore.setState({ simSource: 'connecting' });
});

describe('ConnectionBadge', () => {
  it('renders "BioSim Live" when simSource is "biosim"', () => {
    useHabitatStore.setState({ simSource: 'biosim' });
    render(<ConnectionBadge />);
    expect(screen.getByText('BioSim Live')).toBeInTheDocument();
  });

  it('renders "Connecting..." when simSource is "connecting"', () => {
    useHabitatStore.setState({ simSource: 'connecting' });
    render(<ConnectionBadge />);
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('renders "Disconnected" when simSource is "disconnected"', () => {
    useHabitatStore.setState({ simSource: 'disconnected' });
    render(<ConnectionBadge />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('renders "Fallback Mode" when simSource is "fallback"', () => {
    useHabitatStore.setState({ simSource: 'fallback' });
    render(<ConnectionBadge />);
    expect(screen.getByText('Fallback Mode')).toBeInTheDocument();
  });

  it('renders a dot element with the correct green color when biosim', () => {
    useHabitatStore.setState({ simSource: 'biosim' });
    const { container } = render(<ConnectionBadge />);
    // Find the dot by data-testid
    const dot = container.querySelector('[data-testid="connection-badge-dot"]');
    expect(dot).toBeTruthy();
    expect((dot as HTMLElement).style.background).toBe('rgb(0, 255, 136)');
  });

  it('renders a dot element with the correct grey color when connecting', () => {
    useHabitatStore.setState({ simSource: 'connecting' });
    const { container } = render(<ConnectionBadge />);
    const dot = container.querySelector('[data-testid="connection-badge-dot"]');
    expect(dot).toBeTruthy();
    // #9ca3af is the connecting grey
    expect((dot as HTMLElement).style.background).toBe('rgb(156, 163, 175)');
  });

  it('renders a dot element with the correct red color when disconnected', () => {
    useHabitatStore.setState({ simSource: 'disconnected' });
    const { container } = render(<ConnectionBadge />);
    const dot = container.querySelector('[data-testid="connection-badge-dot"]');
    expect(dot).toBeTruthy();
    expect((dot as HTMLElement).style.background).toBe('rgb(255, 34, 0)');
  });

  it('renders a dot element with the correct amber color when fallback', () => {
    useHabitatStore.setState({ simSource: 'fallback' });
    const { container } = render(<ConnectionBadge />);
    const dot = container.querySelector('[data-testid="connection-badge-dot"]');
    expect(dot).toBeTruthy();
    // #f59e0b amber
    expect((dot as HTMLElement).style.background).toBe('rgb(245, 158, 11)');
  });

  it('renders "BioSim + Real Sensor" when simSource is "biosim-real"', () => {
    useHabitatStore.setState({ simSource: 'biosim-real' });
    render(<ConnectionBadge />);
    expect(screen.getByText('BioSim + Real Sensor')).toBeInTheDocument();
  });

  it('renders a dot element with the correct teal color when biosim-real', () => {
    useHabitatStore.setState({ simSource: 'biosim-real' });
    const { container } = render(<ConnectionBadge />);
    const dot = container.querySelector('[data-testid="connection-badge-dot"]');
    expect(dot).toBeTruthy();
    // #00ffcc teal
    expect((dot as HTMLElement).style.background).toBe('rgb(0, 255, 204)');
  });
});
