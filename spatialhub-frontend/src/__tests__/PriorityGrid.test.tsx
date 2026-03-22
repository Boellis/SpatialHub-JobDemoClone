/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../hooks/usePriorityRanking', () => ({
  usePriorityRanking: () => ['water-recycling', 'atmosphere-control', 'grow-bays', 'power-thermal'],
}));

// Mock ZoneCard to expose its props as data attributes
vi.mock('../components/tv/ZoneCard', () => ({
  ZoneCard: ({ zoneId, isHero, style }: { zoneId: string; isHero: boolean; style?: React.CSSProperties }) => (
    <div
      data-testid={`zone-card-${zoneId}`}
      data-is-hero={String(isHero)}
      style={style}
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

  // Test 4: hero card style contains gridColumn: '1 / -1'
  it('hero card has style containing gridColumn: 1 / -1', () => {
    render(<PriorityGrid />);
    const heroCard = screen.getByTestId('zone-card-water-recycling');
    const style = heroCard.getAttribute('style') ?? '';
    expect(style).toContain('grid-column');
    // Also check via computed style on the element
    expect(heroCard.style.gridColumn).toBe('1 / -1');
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
    // If keys were indices, all 4 cards would still render but we verify correct zone IDs
    const rankedIds = ['water-recycling', 'atmosphere-control', 'grow-bays', 'power-thermal'];
    for (const id of rankedIds) {
      expect(screen.getByTestId(`zone-card-${id}`)).toBeInTheDocument();
    }
  });
});
