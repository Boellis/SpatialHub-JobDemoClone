/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, layoutId, layout, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div data-layout-id={layoutId} data-layout={String(layout)} {...props}>{children}</div>
    ),
    span: ({ children, layout, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span data-layout={String(layout)} {...props}>{children}</span>
    ),
  },
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('../hooks/usePriorityRanking', () => ({
  usePriorityRanking: () => ['water-recycling', 'atmosphere-control', 'grow-bays', 'power-thermal'],
}));

// Mock ZoneCard to expose its props as data attributes
vi.mock('../components/tv/ZoneCard', () => ({
  ZoneCard: ({ zoneId, isHero }: { zoneId: string; isHero: boolean }) => (
    <div
      data-testid={`zone-card-${zoneId}`}
      data-is-hero={String(isHero)}
    />
  ),
}));

import { PriorityGrid } from '../components/tv/PriorityGrid';

describe('PriorityGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: renders 4 ZoneCard elements
  it('renders 4 ZoneCard elements', () => {
    render(<PriorityGrid />);
    expect(screen.getByTestId('zone-card-water-recycling')).toBeInTheDocument();
    expect(screen.getByTestId('zone-card-atmosphere-control')).toBeInTheDocument();
    expect(screen.getByTestId('zone-card-grow-bays')).toBeInTheDocument();
    expect(screen.getByTestId('zone-card-power-thermal')).toBeInTheDocument();
  });

  // Test 2: first ZoneCard has isHero=true
  it('first ZoneCard (rankedIds[0]) has isHero=true', () => {
    render(<PriorityGrid />);
    const heroCard = screen.getByTestId('zone-card-water-recycling');
    expect(heroCard).toHaveAttribute('data-is-hero', 'true');
  });

  // Test 3: remaining 3 ZoneCards have isHero=false
  it('remaining 3 ZoneCards have isHero=false', () => {
    render(<PriorityGrid />);
    expect(screen.getByTestId('zone-card-atmosphere-control')).toHaveAttribute('data-is-hero', 'false');
    expect(screen.getByTestId('zone-card-grow-bays')).toHaveAttribute('data-is-hero', 'false');
    expect(screen.getByTestId('zone-card-power-thermal')).toHaveAttribute('data-is-hero', 'false');
  });

  // Test 4: hero motion.div wrapper has gridColumn: '1 / -1' — style lives on wrapper, not ZoneCard
  it('hero motion.div wrapper has style containing gridColumn: 1 / -1', () => {
    render(<PriorityGrid />);
    const heroWrapper = document.querySelector('[data-layout-id="zone-water-recycling"]') as HTMLElement;
    expect(heroWrapper).not.toBeNull();
    expect(heroWrapper.style.gridColumn).toBe('1 / -1');
  });

  // Test 5: grid container has display: grid and correct gridTemplateColumns
  it('grid container has display: grid and gridTemplateColumns: 1fr 1fr 1fr', () => {
    render(<PriorityGrid />);
    const grid = screen.getByTestId('priority-grid');
    expect(grid.style.display).toBe('grid');
    expect(grid.style.gridTemplateColumns).toBe('1fr 1fr 1fr');
  });

  // Test 6: ZoneCard rendered with zoneId props matching rankedIds (not index-keyed)
  it('uses zoneId as key — all 4 ranked zones are rendered', () => {
    render(<PriorityGrid />);
    const rankedIds = ['water-recycling', 'atmosphere-control', 'grow-bays', 'power-thermal'];
    for (const id of rankedIds) {
      expect(screen.getByTestId(`zone-card-${id}`)).toBeInTheDocument();
    }
  });

  // Test 7: hero motion.div wrapper has layoutId matching zone-{zoneId}
  it('hero motion.div wrapper has layoutId matching zone-{zoneId}', () => {
    render(<PriorityGrid />);
    const heroWrapper = document.querySelector('[data-layout-id="zone-water-recycling"]');
    expect(heroWrapper).not.toBeNull();
  });

  // Test 8: secondary motion.div wrappers have layoutId matching zone-{zoneId}
  it('secondary motion.div wrappers have layoutId matching zone-{zoneId}', () => {
    render(<PriorityGrid />);
    expect(document.querySelector('[data-layout-id="zone-atmosphere-control"]')).not.toBeNull();
    expect(document.querySelector('[data-layout-id="zone-grow-bays"]')).not.toBeNull();
    expect(document.querySelector('[data-layout-id="zone-power-thermal"]')).not.toBeNull();
  });

  // Test 9: all motion.div wrappers have data-layout=true
  it('all motion.div wrappers have data-layout=true', () => {
    render(<PriorityGrid />);
    const wrappers = document.querySelectorAll('[data-layout-id]');
    expect(wrappers).toHaveLength(4);
    wrappers.forEach((el) => {
      expect(el).toHaveAttribute('data-layout', 'true');
    });
  });

  // Test 10: layoutId uses zoneId not index — verify zone-water-recycling not zone-0
  it('layoutId uses zoneId not index — zone-0 should not exist', () => {
    render(<PriorityGrid />);
    expect(document.querySelector('[data-layout-id="zone-0"]')).toBeNull();
  });
});
