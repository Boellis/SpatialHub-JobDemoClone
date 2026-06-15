// ResourceCard — one life-support store as a mission-control telemetry card.
// Health is colour-coded by band, with a fill bar, trend arrow (delta since last
// sol), net flow, and a runway readout when the store is draining.

export type Health = 'ok' | 'warn' | 'crit';

const HEALTH_COLOR: Record<Health, string> = {
  ok: '#00ff9c',
  warn: '#ffb000',
  crit: '#ff3b30',
};

// Direction of danger differs per resource: most stores are bad when LOW (running
// out); waste stores are bad when HIGH (filling up). A `ventSafe` buffer (e.g. the
// CO₂ store) overflows/vents harmlessly when full, so it has NO danger direction —
// saturation is nominal and must never read as a critical alarm.
export function healthOf(pct: number, highIsBad: boolean, ventSafe = false): Health {
  if (ventSafe) return 'ok';
  if (highIsBad) {
    if (pct >= 85) return 'crit';
    if (pct >= 60) return 'warn';
    return 'ok';
  }
  if (pct <= 12) return 'crit';
  if (pct <= 35) return 'warn';
  return 'ok';
}

export function ResourceCard({
  label,
  pct,
  health,
  delta,
  net,
  runway,
  primary,
}: {
  label: string;
  pct: number;
  health: Health;
  delta: number;
  net?: number;
  runway?: number;
  primary: boolean;
}) {
  const color = HEALTH_COLOR[health];
  const trend = delta > 0.05 ? '▲' : delta < -0.05 ? '▼' : '—';
  const trendColor = delta > 0.05 ? '#00ff9c' : delta < -0.05 ? '#ff8a5d' : 'rgba(255,255,255,0.4)';

  return (
    <div
      style={{
        flex: primary ? '1 1 150px' : '1 1 110px',
        minWidth: primary ? 150 : 110,
        padding: primary ? '14px 16px' : '10px 12px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${health === 'crit' ? color + '88' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: health === 'crit' ? `0 0 22px ${color}33, inset 0 0 0 1px ${color}22` : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontFamily: '"Space Mono", monospace',
          fontSize: 10,
          letterSpacing: '0.16em',
          color: 'rgba(180,190,205,0.85)',
          textTransform: 'uppercase',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{label}</span>
        <span style={{ color: trendColor, fontSize: 11 }}>{trend}</span>
      </div>

      <div
        style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontWeight: 700,
          fontSize: primary ? 34 : 24,
          lineHeight: 1.05,
          color,
          marginTop: 2,
          textShadow: health === 'crit' ? `0 0 16px ${color}66` : 'none',
        }}
      >
        {pct.toFixed(pct < 10 ? 1 : 0)}
        <span style={{ fontSize: primary ? 15 : 12, opacity: 0.6 }}> %</span>
      </div>

      {/* fill bar */}
      <div
        style={{
          marginTop: 8,
          height: 5,
          borderRadius: 3,
          background: 'rgba(255,255,255,0.07)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: '100%',
            borderRadius: 3,
            background: `linear-gradient(90deg, ${color}aa, ${color})`,
            transition: 'width 0.6s ease, background 0.4s ease',
          }}
        />
      </div>

      {primary && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: '"Space Mono", monospace',
            fontSize: 10,
            color: 'rgba(170,180,195,0.7)',
          }}
        >
          <span>
            {net !== undefined ? `${net > 0 ? '+' : ''}${net.toFixed(1)}/t` : ' '}
          </span>
          {runway !== undefined && runway < 999 && (
            <span style={{ color: runway < 30 ? '#ffb000' : 'rgba(170,180,195,0.7)' }}>
              ~{runway < 1 ? '<1' : Math.round(runway)} sol
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ResourceCard;
