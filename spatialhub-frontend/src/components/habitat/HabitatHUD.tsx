// HabitatHUD — persistent glassmorphism system overview card
// Always visible in the top-left corner of the habitat overlay.
// Shows sol count (ticks in real time), overall habitat status, active sensor count,
// and a compact 4-zone status row. Also provides the back-to-dashboard button.

import { Link } from 'react-router-dom';
import { useHabitatStore } from '../../store/habitatStore';
import { ZONE_CONFIGS } from '../../simulation/constants';
import type { ZoneStatus } from '../../types/habitat';
import { ConnectionBadge } from './ConnectionBadge';

// Zone abbreviations for the compact status row
const ZONE_ABBREVIATIONS: Record<string, string> = {
  'grow-bays': 'GB',
  'atmosphere-control': 'AC',
  'water-recycling': 'WR',
  'power-thermal': 'PT',
};

// Status color mapping — matches the semantic palette used elsewhere in the UI
const STATUS_COLORS: Record<ZoneStatus, string> = {
  green: '#00ff88',
  yellow: '#ffaa00',
  red: '#ff2200',
};

const STATUS_LABELS: Record<ZoneStatus, string> = {
  green: 'NOMINAL',
  yellow: 'CAUTION',
  red: 'CRITICAL',
};

export const HabitatHUD = () => {
  const solElapsed = useHabitatStore((s) => s.solElapsed);
  const zones = useHabitatStore((s) => s.zones);

  // Derive sol count from elapsed seconds (600s = 1 sol)
  const solCount = Math.floor(solElapsed / 600);
  const solDisplay = String(solCount).padStart(3, '0');

  // Derive overall habitat status — worst of all zones
  let overallStatus: ZoneStatus = 'green';
  for (const zone of Object.values(zones)) {
    if (zone.status === 'red') {
      overallStatus = 'red';
      break;
    }
    if (zone.status === 'yellow') {
      overallStatus = 'yellow';
    }
  }

  // Active sensor count — sum all sensors across all zones
  const activeSensorCount = Object.values(zones).reduce(
    (acc, zone) => acc + Object.keys(zone.sensors).length,
    0
  );

  const statusColor = STATUS_COLORS[overallStatus];
  const statusLabel = STATUS_LABELS[overallStatus];

  return (
    <div
      style={{
        position: 'absolute',
        top: '1.5rem',
        left: '1.5rem',
        background: 'rgba(10, 12, 18, 0.7)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '16px 20px',
        pointerEvents: 'auto',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)',
        minWidth: '160px',
        fontFamily: 'monospace',
        color: 'white',
      }}
    >
      {/* Row 1: Back button */}
      <div style={{ marginBottom: '10px' }}>
        <Link
          to="/"
          style={{
            color: 'rgba(156,163,175,1)',
            fontSize: '11px',
            textDecoration: 'none',
            letterSpacing: '0.05em',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(209,213,219,1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(156,163,175,1)';
          }}
        >
          &lt; Dashboard
        </Link>
      </div>

      {/* Row 2: Sol count */}
      <div
        style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          marginBottom: '8px',
          color: 'white',
        }}
      >
        SOL {solDisplay}
      </div>

      {/* Row 3: Status dot + label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '6px',
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: '12px',
            letterSpacing: '0.12em',
            color: statusColor,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Row 4: Sensor count */}
      <div
        style={{
          fontSize: '11px',
          color: 'rgba(156,163,175,1)',
          letterSpacing: '0.08em',
          marginBottom: '12px',
        }}
      >
        {activeSensorCount} SENSORS ACTIVE
      </div>

      {/* Row 5: Compact zone status row */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
        }}
      >
        {ZONE_CONFIGS.map((zone) => {
          const zoneState = zones[zone.zoneId];
          const zoneStatus: ZoneStatus = zoneState?.status ?? 'green';
          const dotColor = STATUS_COLORS[zoneStatus];
          const abbrev = ZONE_ABBREVIATIONS[zone.zoneId] ?? '??';

          return (
            <div
              key={zone.zoneId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: dotColor,
                  boxShadow: `0 0 4px ${dotColor}`,
                }}
              />
              <span
                style={{
                  fontSize: '9px',
                  color: 'rgba(156,163,175,0.8)',
                  letterSpacing: '0.05em',
                }}
              >
                {abbrev}
              </span>
            </div>
          );
        })}
      </div>

      {/* Row 6: Connection badge — data source indicator (BioSim/Fallback/etc.) */}
      <ConnectionBadge />
    </div>
  );
};
