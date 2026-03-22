// StatusBar — full-width status strip at the top of the TV dashboard.
// Shows worst-zone alert message, sol counter, and connection badge.
// No animation, no interaction. TV ambient display only.

import type { ZoneStatus } from '../../types/habitat';
import { useHabitatStore, selectSimSource } from '../../store/habitatStore';
import { STATUS_COLORS, STATUS_LABELS, BADGE_CONFIG } from './constants';
import { ZONE_MAP, SOL_CYCLE_PERIOD } from '../../simulation/constants';

export const StatusBar = () => {
  const zones = useHabitatStore((s) => s.zones);
  const solElapsed = useHabitatStore((s) => s.solElapsed);
  const simSource = useHabitatStore(selectSimSource);

  // Derive worst zone — iterate all zones, track worst status and the zone responsible
  let worstStatus: ZoneStatus = 'green';
  let worstZoneId: string | null = null;
  for (const [id, zone] of Object.entries(zones)) {
    if (zone.status === 'red' && worstStatus !== 'red') {
      worstStatus = 'red';
      worstZoneId = id;
    } else if (zone.status === 'yellow' && worstStatus === 'green') {
      worstStatus = 'yellow';
      worstZoneId = id;
    }
  }

  const isNominal = worstStatus === 'green';
  const statusColor = STATUS_COLORS[worstStatus];

  // Alert message
  let alertMessage: string;
  if (isNominal) {
    alertMessage = 'ALL SYSTEMS NOMINAL';
  } else {
    const zoneName = worstZoneId ? ZONE_MAP[worstZoneId]?.name.toUpperCase() ?? worstZoneId.toUpperCase() : '';
    alertMessage = `${zoneName}: ${STATUS_LABELS[worstStatus]}`;
  }

  // Sol counter: floor(solElapsed / SOL_CYCLE_PERIOD), zero-padded to 3 digits
  const solNumber = Math.floor(solElapsed / SOL_CYCLE_PERIOD);
  const solDisplay = `SOL ${String(solNumber).padStart(3, '0')}`;

  // Connection badge
  const badge = BADGE_CONFIG[simSource];

  return (
    <div
      style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        fontFamily: "'Space Mono', monospace",
        fontSize: 16,
      }}
    >
      {/* Left: status dot + alert message */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          data-testid="status-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            flexShrink: 0,
          }}
        />
        <span
          data-testid="status-message"
          style={{
            color: isNominal ? '#9ca3af' : statusColor,
            letterSpacing: '0.08em',
          }}
        >
          {alertMessage}
        </span>
      </div>

      {/* Center: sol counter */}
      <span
        data-testid="sol-counter"
        style={{
          color: '#e2e5ed',
          letterSpacing: '0.1em',
        }}
      >
        {solDisplay}
      </span>

      {/* Right: connection badge */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: badge.dot,
            boxShadow: `0 0 4px ${badge.dot}`,
            flexShrink: 0,
          }}
        />
        <span
          data-testid="connection-label"
          style={{
            color: badge.textColor,
            letterSpacing: '0.08em',
          }}
        >
          {badge.label}
        </span>
      </div>
    </div>
  );
};
