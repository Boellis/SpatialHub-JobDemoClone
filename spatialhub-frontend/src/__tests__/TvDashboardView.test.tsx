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

vi.mock('../hooks/usePriorityRanking', () => ({
  usePriorityRanking: () => ['water-recycling', 'atmosphere-control', 'grow-bays', 'power-thermal'],
}));

vi.mock('../store/habitatStore', () => ({
  useHabitatStore: (selector: (s: { zones: Record<string, { sensors: Record<string, { status: string }> }> }) => unknown) => {
    const mockZones = {
      'water-recycling': { sensors: { 'wr-ph': { status: 'green' } } },
      'atmosphere-control': { sensors: { 'ac-co2': { status: 'green' } } },
      'grow-bays': { sensors: { 'gb-temp': { status: 'green' } } },
      'power-thermal': { sensors: { 'pt-temp': { status: 'green' } } },
    };
    return selector({ zones: mockZones });
  },
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

  it('displays ranked zone IDs', () => {
    render(<TvDashboardView />);
    expect(screen.getByText(/water-recycling/)).toBeTruthy();
    expect(screen.getByText(/atmosphere-control/)).toBeTruthy();
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
