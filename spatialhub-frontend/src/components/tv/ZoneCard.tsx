// ZoneCard — TV dashboard zone card component.
// Renders a single zone's sensor data with TV-safe typography, sparklines,
// status badge, and critical pulse animation.
//
// PERF: Uses selectZone(zoneId) per-zone selector — NOT s.zones — to prevent
// cascade re-renders when an unrelated zone updates.
//
// Phase 19: Direct children use motion.div/motion.span with layout prop to
// prevent scale distortion during parent FLIP size transitions (hero<->secondary).

import { useEffect } from 'react';
import { motion } from 'motion/react';
import { useHabitatStore, selectZone } from '../../store/habitatStore';
import { Sparkline } from '../habitat/Sparkline';
import { AreaChart } from './AreaChart';
import { DigitRoll } from './DigitRoll';
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
}

export const ZoneCard = ({ zoneId, isHero }: ZoneCardProps) => {
  useEffect(() => {
    ensureTvAnimationsInjected();
  }, []);

  const zone = useHabitatStore(selectZone(zoneId));
  const sensorConfigs = ZONE_MAP[zoneId]?.sensors ?? [];
  const zoneName = ZONE_MAP[zoneId]?.name?.toUpperCase() ?? zoneId.toUpperCase();

  if (!zone) return null;

  // Primary sensor: worst-status sensor (red > yellow > green) for the hero area chart
  const primarySensor = isHero
    ? (() => {
        const statusPriority: Record<string, number> = { red: 2, yellow: 1, green: 0 };
        let best = sensorConfigs[0];
        let bestScore = -1;
        for (const cfg of sensorConfigs) {
          const reading = zone.sensors[cfg.sensorId];
          if (reading) {
            const score = statusPriority[reading.status] ?? 0;
            if (score > bestScore) { bestScore = score; best = cfg; }
          }
        }
        return best;
      })()
    : null;
  const primaryReading = primarySensor ? zone.sensors[primarySensor.sensorId] : null;

  const containerStyle: React.CSSProperties = {
    background: '#0c0e16',
    borderRadius: isHero ? 12 : 10,
    padding: isHero ? 24 : 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflow: 'hidden',
    ...cardBorderStyle(zone.status),
  };

  const valueFontSize = isHero ? 48 : 28;

  return (
    <div style={containerStyle} data-testid={`zone-card-${zoneId}`}>
      {/* Header row: zone name (left) + status badge (right) */}
      <motion.div layout style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <motion.span
          layout
          data-testid="zone-name"
          style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: isHero ? 16 : 16,
            fontWeight: 700,
            color: '#e2e5ed',
            letterSpacing: '0.08em',
          }}
        >
          {zoneName}
        </motion.span>
        <motion.div layout style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
        </motion.div>
      </motion.div>

      {/* Hero area chart — primary sensor history, between header and sensor rows */}
      {isHero && primaryReading && (
        <div data-testid="hero-area-chart" style={{ width: '100%', flexGrow: 1, minHeight: 120 }}>
          <AreaChart
            data={primaryReading.history}
            color={STATUS_COLORS[primaryReading.status]}
            height={160}
          />
        </div>
      )}

      {/* Sensor rows */}
      {sensorConfigs.map((cfg) => {
        const reading = zone.sensors[cfg.sensorId];
        if (!reading) return null;
        const sensorColor = STATUS_COLORS[reading.status];

        return (
          <motion.div
            layout
            key={cfg.sensorId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            {/* Left group: label stacked above value — read as one unit */}
            <motion.div layout style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: 'Space Mono, monospace',
                  fontSize: 12,
                  color: '#9ca3af',
                  letterSpacing: '0.04em',
                  display: 'block',
                  marginBottom: 2,
                }}
              >
                {cfg.name}
              </span>
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
                {isHero ? (
                  <DigitRoll
                    value={reading.value.toFixed(1)}
                    fontSize={valueFontSize}
                    color={sensorColor}
                  />
                ) : (
                  Number(reading.value.toFixed(1))
                )}
                <span style={{ fontSize: Math.round(valueFontSize * 0.5), fontWeight: 400, color: '#9ca3af' }}>
                  {' '}{cfg.unit}
                </span>
              </span>
            </motion.div>

            {/* Right group: sparkline + status dot */}
            <motion.div layout style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Sparkline
                data={reading.history}
                color={sensorColor}
                width={isHero ? 200 : 120}
                height={isHero ? 40 : 30}
              />
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
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
};
