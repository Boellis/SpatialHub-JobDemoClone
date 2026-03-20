// ConnectionBadge — small pill badge showing the current simulation data source.
// Sits below the zone status row (Row 6) in HabitatHUD.
//
// States:
//   biosim       → green  — "BioSim Live"
//   biosim-real  → teal   — "BioSim + Real Sensor"
//   connecting   → grey   — "Connecting..."
//   disconnected → red    — "Disconnected"
//   fallback     → amber  — "Fallback Mode"
//
// Pulse animation fires on state change (scale 1.0 -> 1.1 -> 1.0, 3 times, 300ms each).
// CSS keyframes injected once via a <style> tag (same pattern as AlertBanner).
// PERF-02: subscribes only to simSource via granular selectSimSource selector.

import { useEffect, useRef, useState } from 'react';
import { useHabitatStore, selectSimSource } from '../../store/habitatStore';
import type { SimSource } from '../../types/habitat';

// ---------------------------------------------------------------------------
// CSS keyframe injection (AlertBanner pattern)
// ---------------------------------------------------------------------------

const BADGE_ANIMATION_ID = 'connection-badge-animations';

function ensureBadgeAnimationsInjected() {
  if (document.getElementById(BADGE_ANIMATION_ID)) return;
  const style = document.createElement('style');
  style.id = BADGE_ANIMATION_ID;
  style.textContent = `
    @keyframes badgePulse {
      0%   { transform: scale(1.0); }
      50%  { transform: scale(1.1); }
      100% { transform: scale(1.0); }
    }
    @keyframes badgeFadeIn {
      from { opacity: 0.5; }
      to   { opacity: 1;   }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Badge configuration
// ---------------------------------------------------------------------------

const BADGE_CONFIG: Record<SimSource, { dot: string; label: string; textColor: string }> = {
  connecting:    { dot: '#9ca3af', label: 'Connecting...',        textColor: '#9ca3af' },
  biosim:        { dot: '#00ff88', label: 'BioSim Live',          textColor: '#00ff88' },
  'biosim-real': { dot: '#00ffcc', label: 'BioSim + Real Sensor', textColor: '#00ffcc' },
  disconnected:  { dot: '#ff2200', label: 'Disconnected',         textColor: '#ff2200' },
  fallback:      { dot: '#f59e0b', label: 'Fallback Mode',        textColor: '#f59e0b' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ConnectionBadge = () => {
  const simSource = useHabitatStore(selectSimSource);
  const prevSimSourceRef = useRef<SimSource | null>(null);
  const [pulsing, setPulsing] = useState(false);

  // Inject CSS keyframes once on mount
  useEffect(() => {
    ensureBadgeAnimationsInjected();
  }, []);

  // Detect state changes and trigger pulse animation (~900ms = 3 pulses x 300ms)
  useEffect(() => {
    if (prevSimSourceRef.current !== null && prevSimSourceRef.current !== simSource) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 900);
      return () => clearTimeout(t);
    }
    prevSimSourceRef.current = simSource;
  }, [simSource]);

  const badge = BADGE_CONFIG[simSource];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '10px',
        fontFamily: 'monospace',
        animation: pulsing ? 'badgePulse 300ms ease-in-out 3' : undefined,
      }}
    >
      {/* Colored dot */}
      <div
        data-testid="connection-badge-dot"
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: badge.dot,
          boxShadow: `0 0 4px ${badge.dot}`,
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <span
        style={{
          fontSize: '10px',
          letterSpacing: '0.08em',
          color: badge.textColor,
        }}
      >
        {badge.label}
      </span>
    </div>
  );
};
