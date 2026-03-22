// ZoneCard — TV dashboard zone card component.
// Renders a single zone's sensor data with TV-safe typography, sparklines,
// status badge, and critical pulse animation.
//
// PERF: Uses selectZone(zoneId) per-zone selector — NOT s.zones — to prevent
// cascade re-renders when an unrelated zone updates.

import { useEffect } from 'react';
import { useHabitatStore, selectZone } from '../../store/habitatStore';
import { Sparkline } from '../habitat/Sparkline';
import { ZONE_MAP } from '../../simulation/constants';
import { STATUS_COLORS, STATUS_LABELS } from './constants';
import type { ZoneStatus } from '../../types/habitat';

// ---------------------------------------------------------------------------
// CSS keyframe injection (ConnectionBadge pattern)
// ---------------------------------------------------------------------------

const TV_ANIMATIONS_ID = 'tv-zone-animations';

function ensureTvAnimationsInjected() {
  if (document.getElementById(TV_ANIMATIONS_ID)) return;
  const style = document.createElement('style');
  style.id = TV_ANIMATIONS_ID;
  style.textContent = `
    @keyframes zoneCriticalPulse {
      0%   { border-color: rgba(255,34,0,0.3); box-shadow: none; }
      50%  { border-color: #ff2200; box-shadow: 0 0 20px rgba(255,34,0,0.4); }
      100% { border-color: rgba(255,34,0,0.3); box-shadow: none; }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Border style per zone status
// ---------------------------------------------------------------------------

function cardBorderStyle(status: ZoneStatus): React.CSSProperties {
  switch (status) {
    case 'red':
      return {
        border: '1px solid rgba(255,34,0, 0.3)',
        animation: 'zoneCriticalPulse 2s ease-in-out infinite',
      };
    case 'yellow':
      return {
        border: '1px solid rgba(255,170,0, 0.4)',
      };
    case 'green':
    default:
      return {
        border: '1px solid rgba(255,255,255, 0.06)',
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ZoneCardProps {
  zoneId: string;
  isHero: boolean;
  style?: React.CSSProperties;
}

export const ZoneCard = ({ zoneId, isHero, style }: ZoneCardProps) => {
  useEffect(() => {
    ensureTvAnimationsInjected();
  }, []);

  const zone = useHabitatStore(selectZone(zoneId));
  const sensorConfigs = ZONE_MAP[zoneId]?.sensors ?? [];
  const zoneName = ZONE_MAP[zoneId]?.name?.toUpperCase() ?? zoneId.toUpperCase();

  if (!zone) return null;

  const containerStyle: React.CSSProperties = {
    background: '#0c0e16',
    borderRadius: isHero ? 12 : 10,
    padding: isHero ? 24 : 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflow: 'hidden',
    ...cardBorderStyle(zone.status),
    ...style,
  };

  const valueFontSize = isHero ? 48 : 28;

  return (
    <div style={containerStyle} data-testid={`zone-card-${zoneId}`}>
      {/* Header row: zone name (left) + status badge (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          data-testid="zone-name"
          style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: 12,
            fontWeight: 400,
            color: '#9ca3af',
            letterSpacing: '0.08em',
          }}
        >
          {zoneName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Status dot */}
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: STATUS_COLORS[zone.status],
              boxShadow: `0 0 4px ${STATUS_COLORS[zone.status]}`,
              flexShrink: 0,
            }}
          />
          {/* Status label */}
          <span
            data-testid="zone-status-badge"
            style={{
              fontFamily: 'Space Mono, monospace',
              fontSize: 12,
              fontWeight: 700,
              color: STATUS_COLORS[zone.status],
              letterSpacing: '0.08em',
            }}
          >
            {STATUS_LABELS[zone.status]}
          </span>
        </div>
      </div>

      {/* Sensor rows */}
      {sensorConfigs.map((cfg) => {
        const reading = zone.sensors[cfg.sensorId];
        if (!reading) return null;
        const sensorColor = STATUS_COLORS[reading.status];

        return (
          <div
            key={cfg.sensorId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* Sensor name */}
            <span
              style={{
                fontFamily: 'Space Mono, monospace',
                fontSize: 12,
                color: '#9ca3af',
                flex: 1,
                minWidth: 0,
              }}
            >
              {cfg.name}
            </span>

            {/* Sensor value + unit */}
            <span
              data-testid={`sensor-value-${cfg.sensorId}`}
              style={{
                fontFamily: 'Space Mono, monospace',
                fontSize: valueFontSize,
                fontWeight: 700,
                color: sensorColor,
                lineHeight: 1.1,
              }}
            >
              {reading.value}
              <span style={{ fontSize: valueFontSize, fontWeight: 400 }}>
                {' '}{cfg.unit}
              </span>
            </span>

            {/* Sparkline */}
            <Sparkline
              data={reading.history}
              color={sensorColor}
              width={isHero ? 200 : 120}
              height={isHero ? 40 : 30}
            />

            {/* Status dot */}
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: sensorColor,
                boxShadow: `0 0 4px ${sensorColor}`,
                flexShrink: 0,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
