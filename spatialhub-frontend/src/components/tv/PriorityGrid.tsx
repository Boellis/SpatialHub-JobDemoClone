// PriorityGrid — CSS Grid layout wrapper for the TV dashboard.
// Positions 4 ZoneCards: hero slot (top, full-width) + 3 secondary slots (bottom row).
// Hero = rankedIds[0] (most critical zone), secondary = rankedIds[1..3].
//
// Key: uses zoneId as React key (not index) — Phase 19 FLIP animation needs stable keys.
// Does NOT subscribe to zones — only consumes rankedIds from usePriorityRanking.

import { usePriorityRanking } from '../../hooks/usePriorityRanking';
import { ZoneCard } from './ZoneCard';

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gridTemplateRows: '55fr 45fr',
  gap: 24,
  padding: 32,
  height: '100%',
  boxSizing: 'border-box' as const,
};

export const PriorityGrid = () => {
  const rankedIds = usePriorityRanking();

  if (rankedIds.length === 0) return null;

  return (
    <div style={gridStyle} data-testid="priority-grid">
      <ZoneCard
        key={rankedIds[0]}
        zoneId={rankedIds[0]}
        isHero={true}
        style={{ gridColumn: '1 / -1', gridRow: '1' }}
      />
      {rankedIds.slice(1, 4).map((id) => (
        <ZoneCard
          key={id}
          zoneId={id}
          isHero={false}
          style={{ gridRow: '2' }}
        />
      ))}
    </div>
  );
};
