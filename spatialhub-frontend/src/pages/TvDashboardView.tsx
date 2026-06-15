// TvDashboardView — the /habitat dashboard. It MIRRORS the live survival test:
// it subscribes to the same relay as the survival mission-control screen
// (useSurvivalRun) and renders the same life-support telemetry the crew is seeing,
// reflecting paused / stopped / ended transitions. When no test is running it shows
// an explicit standby state rather than a self-running simulation.

import { useSurvivalRun, type RunPhase } from '../hooks/useSurvivalRun';
import { RESOURCES } from '../components/survival/resources';
import { ResourceCard, healthOf } from '../components/survival/ResourceCard';

const PHASE_STYLE: Record<RunPhase, { label: string; color: string; glyph: string }> = {
  idle:    { label: 'STANDBY',  color: '#6b7280', glyph: '○' },
  live:    { label: 'LIVE',     color: '#00ff9c', glyph: '●' },
  paused:  { label: 'PAUSED',   color: '#ffb000', glyph: '❚❚' },
  stopped: { label: 'STOPPED',  color: '#ff3b30', glyph: '■' },
  ended:   { label: 'CREW LOST', color: '#ff3b30', glyph: '✖' },
};

const screen: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#06070b', overflow: 'hidden',
  display: 'flex', flexDirection: 'column', fontFamily: '"Space Mono", monospace',
};

const TvDashboardView = () => {
  const run = useSurvivalRun();
  const ph = PHASE_STYLE[run.phase];
  const idle = run.phase === 'idle';
  const dim = run.phase === 'paused';

  // Build the SAME cards the survival screen shows, from this run's telemetry.
  const cards = RESOURCES.map((r) => {
    const s = run.stores.find((x) => x.name === r.name);
    if (!s) return null;
    return {
      ...r,
      pct: s.pct,
      runway: s.runway_sols,
      health: healthOf(s.pct, r.highIsBad, r.ventSafe),
      net: run.balances[r.resource],
      delta: run.deltas[r.name] ?? 0,
    };
  }).filter(Boolean) as Array<(typeof RESOURCES)[number] & {
    pct: number; runway?: number; health: ReturnType<typeof healthOf>; net?: number; delta: number;
  }>;
  const primary = cards.filter((c) => c.primary);
  const secondary = cards.filter((c) => !c.primary);

  return (
    <div style={screen}>
      {/* ── Status strip ───────────────────────────────────────── */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 14,
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '6px 14px', borderRadius: 8,
          border: `1px solid ${ph.color}66`, background: `${ph.color}14`, color: ph.color,
          fontSize: 14, fontWeight: 700, letterSpacing: '0.12em',
        }}>
          <span style={{ textShadow: `0 0 8px ${ph.color}` }}>{ph.glyph}</span>
          <span>{ph.label}</span>
        </div>

        <span style={{ color: '#e2e5ed', fontSize: 18, letterSpacing: '0.1em' }}>
          SOL {String(run.sol).padStart(3, '0')}
        </span>
        {run.difficulty && (
          <span style={{ color: 'rgba(150,162,178,0.85)', fontSize: 12, letterSpacing: '0.1em' }}>
            {run.difficulty === 'malfunctions' ? 'MALFUNCTIONS' : 'NO MALF'}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          {run.result && (
            <span style={{ color: ph.color, fontSize: 13, letterSpacing: '0.06em' }}>
              {run.result.sols_survived} sols · {run.result.ended_reason.replace('_', ' ')}
            </span>
          )}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 7,
            color: run.connected ? 'rgba(0,255,156,0.9)' : 'rgba(255,176,0,0.9)', fontSize: 11,
            letterSpacing: '0.08em',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: run.connected ? '#00ff9c' : '#ffb000',
              boxShadow: `0 0 5px ${run.connected ? '#00ff9c' : '#ffb000'}`,
            }} />
            {run.connected ? 'RELAY LIVE' : 'CONNECTING…'}
          </span>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      {idle ? (
        <Standby connected={run.connected} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'auto', padding: 28 }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(150,162,178,0.7)', marginBottom: 14,
          }}>
            Crew life-support telemetry · crew {run.crewSize} {dim && '· standing by'}
          </div>

          <div style={{ opacity: dim ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {primary.map((c) => (
                <ResourceCard key={c.name} label={c.label} pct={c.pct} health={c.health}
                  delta={c.delta} net={c.net} runway={c.runway} primary />
              ))}
            </div>
            {secondary.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {secondary.map((c) => (
                  <ResourceCard key={c.name} label={c.label} pct={c.pct} health={c.health}
                    delta={c.delta} net={c.net} primary={false} />
                ))}
              </div>
            )}
            {cards.length === 0 && (
              <div style={{ color: 'rgba(150,162,178,0.7)', fontSize: 14 }}>
                Awaiting telemetry from the live test…
              </div>
            )}
          </div>

          {/* Paused watermark */}
          {dim && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                color: '#ffb000', fontSize: 64, fontWeight: 700, letterSpacing: '0.1em',
                opacity: 0.18, textShadow: '0 0 30px #ffb000',
              }}>❚❚ PAUSED</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function Standby({ connected }: { connected: boolean }) {
  return (
    <div style={{
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 24,
    }}>
      <div style={{ fontSize: 30, color: '#6b7280', letterSpacing: '0.08em' }}>○ NO ACTIVE TEST</div>
      <div style={{ fontSize: 14, color: 'rgba(150,162,178,0.8)', maxWidth: 480, lineHeight: 1.6 }}>
        The habitat dashboard is on standby. When a survival test starts, this screen
        mirrors the crew's live life-support telemetry — and reflects it when the test
        is paused or stopped.
      </div>
      <div style={{ fontSize: 11, color: 'rgba(150,162,178,0.5)', letterSpacing: '0.08em' }}>
        {connected ? 'Relay connected · waiting for a run' : 'Connecting to the relay…'}
      </div>
    </div>
  );
}

export default TvDashboardView;
