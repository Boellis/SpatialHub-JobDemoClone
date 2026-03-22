// PriorityGrid — CSS Grid layout wrapper for the TV dashboard.
// Positions 4 ZoneCards: hero slot (top, full-width) + 3 secondary slots (bottom row).
// Hero = rankedIds[0] (most critical zone), secondary = rankedIds[1..3].
//
// Key: uses zoneId as React key (not index) — FLIP animation needs stable identity keys.
// Does NOT subscribe to zones — only consumes rankedIds from usePriorityRanking.
// Phase 19: LayoutGroup + motion.div wrappers enable FLIP position+size transitions.

import { motion, LayoutGroup } from 'motion/react';
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

const FLIP_TRANSITION = { duration: 0.5, ease: 'easeOut' } as const;

export const PriorityGrid = () => {
  const rankedIds = usePriorityRanking();

  if (rankedIds.length === 0) return null;

  return (
    <LayoutGroup>
      <div style={gridStyle} data-testid="priority-grid">
        <motion.div
          key={rankedIds[0]}
          layoutId={`zone-${rankedIds[0]}`}
          layout
          transition={FLIP_TRANSITION}
          style={{ gridColumn: '1 / -1', gridRow: '1' }}
        >
          <ZoneCard zoneId={rankedIds[0]} isHero={true} />
        </motion.div>
        {rankedIds.slice(1, 4).map((id) => (
          <motion.div
            key={id}
            layoutId={`zone-${id}`}
            layout
            transition={FLIP_TRANSITION}
            style={{ gridRow: '2' }}
          >
            <ZoneCard zoneId={id} isHero={false} />
          </motion.div>
        ))}
      </div>
    </LayoutGroup>
  );
};
