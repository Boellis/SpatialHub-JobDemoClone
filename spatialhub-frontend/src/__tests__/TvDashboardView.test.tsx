/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock @react-three/fiber Canvas — render a div forwarding events prop as data-events attribute
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, events, ...props }: React.PropsWithChildren<{ events?: unknown; [key: string]: unknown }>) => (
    <div data-testid="r3f-canvas" data-events={String(events)} {...(props as Record<string, unknown>)}>
      {children}
    </div>
  ),
}));

const mockUseSimSource = vi.fn();
vi.mock('../hooks/useSimSource', () => ({
  useSimSource: () => mockUseSimSource(),
}));

const mockUseLiveSensors = vi.fn();
vi.mock('../hooks/useLiveSensors', () => ({
  useLiveSensors: () => mockUseLiveSensors(),
}));

// TvDashboardView no longer calls usePriorityRanking directly — PriorityGrid does internally.
// Mock StatusBar and PriorityGrid as simple divs.
vi.mock('../components/tv/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}));

vi.mock('../components/tv/PriorityGrid', () => ({
  PriorityGrid: () => <div data-testid="priority-grid" />,
}));

// Keep a minimal habitatStore mock in case other hooks touch it indirectly
vi.mock('../store/habitatStore', () => ({
  useHabitatStore: () => undefined,
  selectSimSource: (s: unknown) => s,
}));

import TvDashboardView from '../pages/TvDashboardView';

describe('TvDashboardView', () => {
  beforeEach(() => {
    mockUseSimSource.mockClear();
    mockUseLiveSensors.mockClear();
  });

  it('renders without crashing', () => {
    const { container } = render(<TvDashboardView />);
    expect(container.firstChild).toBeTruthy();
  });

  it('Canvas receives events={null}', () => {
    render(<TvDashboardView />);
    const canvas = screen.getByTestId('r3f-canvas');
    expect(canvas).toHaveAttribute('data-events', 'null');
  });

  it('renders StatusBar', () => {
    render(<TvDashboardView />);
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('renders PriorityGrid', () => {
    render(<TvDashboardView />);
    expect(screen.getByTestId('priority-grid')).toBeInTheDocument();
  });

  it('does not contain any event handler attributes', () => {
    const { container } = render(<TvDashboardView />);
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmousedown');
    expect(html).not.toContain('onpointerdown');
    expect(html).not.toContain('ontouchstart');
    expect(html).not.toContain('onkeydown');
  });

  it('useSimSource and useLiveSensors are called', () => {
    render(<TvDashboardView />);
    expect(mockUseSimSource).toHaveBeenCalledOnce();
    expect(mockUseLiveSensors).toHaveBeenCalledOnce();
  });
});
