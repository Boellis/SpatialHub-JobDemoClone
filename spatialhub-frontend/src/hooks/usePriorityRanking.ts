import { useState, useEffect, useRef } from 'react';
import { useHabitatStore } from '../store/habitatStore';
import type { ZoneState } from '../types/habitat';

const REORDER_STABILITY_TICKS = 3;

function scoreZone(zone: ZoneState): number {
  let red = 0, yellow = 0;
  for (const sensor of Object.values(zone.sensors)) {
    if (sensor.status === 'red') red++;
    else if (sensor.status === 'yellow') yellow++;
  }
  return (red * 10) + (yellow * 3);
}

function rankZones(zones: Record<string, ZoneState>): string[] {
  return Object.values(zones)
    .sort((a, b) => {
      const diff = scoreZone(b) - scoreZone(a);
      if (diff !== 0) return diff;
      return a.zoneId.localeCompare(b.zoneId);
    })
    .map(z => z.zoneId);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function usePriorityRanking(): string[] {
  const zones = useHabitatStore(s => s.zones);
  const [committed, setCommitted] = useState(() => rankZones(zones));
  const candidateRef = useRef<{ order: string[]; ticks: number }>({
    order: rankZones(zones),
    ticks: 0,
  });

  useEffect(() => {
    const ranked = rankZones(zones);
    const c = candidateRef.current;

    if (arraysEqual(ranked, c.order)) {
      c.ticks++;
      if (c.ticks >= REORDER_STABILITY_TICKS) {
        setCommitted(prev => arraysEqual(prev, ranked) ? prev : [...ranked]);
        c.ticks = 0;
      }
    } else {
      c.order = ranked;
      c.ticks = 1;
    }
  }, [zones]);

  return committed;
}
