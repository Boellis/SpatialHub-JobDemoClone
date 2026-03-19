// ZonePanel — right sidebar showing live sensor readings for a selected zone.
// Renders as an HTML overlay on top of the R3F canvas.
// Receives pointer events (overrides parent's pointer-events: none).

import { useRef, useEffect, useState } from 'react';
import { useHabitatStore, selectZone } from '../../store/habitatStore';
import { ZONE_MAP } from '../../simulation/constants';
import { ZONE_ACCENT_COLORS } from './HabitatStructure';
import { Sparkline } from './Sparkline';
import type { SensorStatus } from '../../types/habitat';

interface ZonePanelProps {
  zoneId: string;
  onClose: () => void;
}

// Status color map — matches dome ring colors for consistency
const STATUS_COLORS: Record<SensorStatus, string> = {
  green: '#00ff44',
  yellow: '#ffaa00',
  red: '#ff2200',
};

// Format sensor values with appropriate decimal precision per sensor type
function formatSensorValue(value: number, type: string): string {
  switch (type) {
    case 'co2':
    case 'power':
    case 'tds':
      return String(Math.round(value));
    case 'temperature':
    case 'ph':
    case 'humidity':
    case 'oxygen':
    case 'filtration':
    case 'flow':
    case 'pressure':
    case 'battery':
    default:
      return value.toFixed(1);
  }
}

// useAnimatedValue — smoothly lerps from the previous value to the new target
// over `duration` ms using requestAnimationFrame. Makes readouts feel instrument-like.
function useAnimatedValue(target: number, duration = 200): number {
  const [displayed, setDisplayed] = useState(target);
  const previousRef = useRef(target);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const from = previousRef.current;
    const to = target;

    if (from === to) return;

    // Cancel any in-progress animation
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const current = from + (to - from) * progress;
      setDisplayed(current);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        previousRef.current = to;
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [target, duration]);

  return displayed;
}

// SensorRow renders a single sensor's status dot, name, animated value, and sparkline
interface SensorRowProps {
  sensorId: string;
  sensorName: string;
  sensorType: string;
  sensorUnit: string;
  value: number;
  status: SensorStatus;
  history: number[];
  accentColor: string;
  isLive?: boolean;
}

const SensorRow = ({
  sensorName,
  sensorType,
  sensorUnit,
  value,
  status,
  history,
  accentColor,
  isLive,
}: SensorRowProps) => {
  const animatedValue = useAnimatedValue(value, 200);
  const statusColor = STATUS_COLORS[status];

  const liveDotColor = '#00ffcc';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: isLive ? '12px 0' : '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      ...(isLive ? {
        background: 'rgba(0, 255, 204, 0.03)',
        margin: '0 -20px 0 -24px',
        padding: '12px 20px 12px 24px',
        borderLeft: '2px solid rgba(0, 255, 204, 0.25)',
      } : {}),
    }}>
      {/* Status dot — teal signal dot for live sensors, threshold color for sim */}
      <div style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: isLive ? liveDotColor : statusColor,
        boxShadow: isLive
          ? `0 0 6px ${liveDotColor}, 0 0 12px ${liveDotColor}44`
          : `0 0 6px ${statusColor}`,
        flexShrink: 0,
        ...(isLive ? { animation: 'livePulse 2s ease-in-out infinite' } : {}),
      }} />

      {/* Sensor name + live badge */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>
        <span style={{
          fontFamily: 'monospace',
          fontSize: '12px',
          color: isLive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.65)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          {sensorName}
          {isLive && (
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#00ffcc',
              background: 'rgba(0, 255, 204, 0.12)',
              border: '1px solid rgba(0, 255, 204, 0.3)',
              borderRadius: '3px',
              padding: '1px 5px',
              flexShrink: 0,
            }}>
              LIVE
            </span>
          )}
        </span>
        {isLive && (
          <span style={{
            fontFamily: 'monospace',
            fontSize: '9px',
            color: 'rgba(0, 255, 204, 0.5)',
            letterSpacing: '0.02em',
          }}>
            Hardware Sensor — Raspberry Pi
          </span>
        )}
      </div>

      {/* Current value + unit — use threshold color on the value for live sensors */}
      <span style={{
        fontFamily: 'monospace',
        fontSize: '13px',
        fontWeight: 600,
        color: isLive ? statusColor : '#fff',
        fontVariantNumeric: 'tabular-nums',
        transition: 'color 200ms ease-out',
        flexShrink: 0,
        minWidth: '72px',
        textAlign: 'right',
      }}>
        {formatSensorValue(animatedValue, sensorType)}
        <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400, marginLeft: 3 }}>
          {sensorUnit}
        </span>
      </span>

      {/* Sparkline */}
      <div style={{ flexShrink: 0 }}>
        <Sparkline data={history} color={isLive ? liveDotColor : accentColor} width={72} height={22} />
      </div>
    </div>
  );
};

export const ZonePanel = ({ zoneId, onClose }: ZonePanelProps) => {
  const zone = useHabitatStore(selectZone(zoneId));
  const config = ZONE_MAP[zoneId];
  const accentColor = ZONE_ACCENT_COLORS[zoneId] ?? '#ffffff';

  if (!zone || !config) return null;

  return (
    <>
      {/* Keyframe injection — only needs to exist once in the DOM */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '350px',
          background: 'rgba(10, 12, 18, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          pointerEvents: 'auto',
          animation: 'slideInRight 300ms ease-out forwards',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Accent bar on left edge */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '3px',
          background: accentColor,
          boxShadow: `0 0 12px ${accentColor}`,
        }} />

        {/* Header */}
        <div style={{
          padding: '20px 20px 16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '16px',
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '0.02em',
                marginBottom: 4,
              }}>
                {config.name}
              </div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.4)',
                lineHeight: 1.5,
              }}>
                {config.description}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '4px',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: 'monospace',
                fontSize: '14px',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                pointerEvents: 'auto',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.4)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)';
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Sensor rows — keyed on zoneId so React remounts when zone changes */}
        <div
          key={zoneId}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 20px 20px 24px',
          }}
        >
          {/* Section label */}
          <div style={{
            fontFamily: 'monospace',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '14px 0 6px',
          }}>
            Live Readings
          </div>

          {config.sensors.map((sensorConfig) => {
            const reading = zone.sensors[sensorConfig.sensorId];
            if (!reading) return null;

            return (
              <SensorRow
                key={sensorConfig.sensorId}
                sensorId={sensorConfig.sensorId}
                sensorName={sensorConfig.name}
                sensorType={sensorConfig.type}
                sensorUnit={sensorConfig.unit}
                value={reading.value}
                status={reading.status}
                history={reading.history}
                accentColor={accentColor}
                isLive={reading.source === 'live'}
              />
            );
          })}
        </div>

        {/* Footer — zone ID and tick count */}
        <div style={{
          padding: '12px 20px 12px 24px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontFamily: 'monospace',
          fontSize: '10px',
          color: 'rgba(255,255,255,0.2)',
          flexShrink: 0,
        }}>
          zone/{zoneId}
        </div>
      </div>
    </>
  );
};
