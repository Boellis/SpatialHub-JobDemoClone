/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockUseSimSource = vi.fn();
vi.mock('../hooks/useSimSource', () => ({
  useSimSource: () => mockUseSimSource(),
}));

const mockUseLiveSensors = vi.fn();
vi.mock('../hooks/useLiveSensors', () => ({
  useLiveSensors: () => mockUseLiveSensors(),
}));

vi.mock('../components/tv/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}));

vi.mock('../components/tv/PriorityGrid', () => ({
  PriorityGrid: () => <div data-testid="priority-grid" />,
}));

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
