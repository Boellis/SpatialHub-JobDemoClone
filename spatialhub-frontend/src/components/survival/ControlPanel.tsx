// ControlPanel — secure run controls for the survival dashboard.
//
// The page is public, so the panel is LOCKED until the operator pastes the control
// token (the SURVIVAL_RELAY_TOKEN). The token is held only in localStorage on this
// machine and sent as a Bearer header on each control request; visitors without it
// see a read-only dashboard. Unlock state + token never leave the browser.

import { useState } from 'react';
import { survivalControl } from '../../api/survival';

const TOKEN_KEY = 'survival.control.token';
const GREEN = '#00ff9c';
const AMBER = '#ffb000';
const RED = '#ff3b30';

type Difficulty = 'off' | 'malfunctions';

// `running` reflects the live relay run (any driver). Start is disabled while a run
// is active so a server-side run can't stomp the live MCP-piloted one (single relay
// slot), and 'New Pilot Session' only makes sense when there's a run to compact.
export function ControlPanel({ running = false, paused = false }:
  { running?: boolean; paused?: boolean }) {
  const [token, setToken] = useState<string>(() => {
    try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
  });
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; }
  });
  const [tokenInput, setTokenInput] = useState('');
  const [crew, setCrew] = useState(15);
  const [difficulty, setDifficulty] = useState<Difficulty>('off');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [open, setOpen] = useState(true);

  const unlock = () => {
    const t = tokenInput.trim();
    if (!t) return;
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
    setToken(t);
    setUnlocked(true);
    setTokenInput('');
  };
  const lock = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    setToken('');
    setUnlocked(false);
    setMsg(null);
  };

  const send = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    setMsg(null);
    try {
      const { ok, status, data } = await survivalControl(token, body);
      if (ok) {
        setMsg({ text: `${label} ✓`, bad: false });
      } else if (status === 401) {
        setMsg({ text: 'Token rejected — re-unlock with the correct secret.', bad: true });
        lock();
      } else {
        const err = (data as { error?: string })?.error ?? `HTTP ${status}`;
        setMsg({ text: `${label}: ${err}`, bad: true });
      }
    } catch {
      setMsg({ text: `${label}: network error`, bad: true });
    } finally {
      setBusy(null);
    }
  };

  const shellStyle: React.CSSProperties = {
    background: 'rgba(10,13,18,0.82)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: '12px 14px',
    fontFamily: '"Space Mono", monospace',
  };
  const label: React.CSSProperties = {
    fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase',
    color: 'rgba(150,162,178,0.85)', marginBottom: 8, display: 'flex',
    alignItems: 'center', justifyContent: 'space-between',
  };

  if (!unlocked) {
    return (
      <div style={shellStyle}>
        <div style={label}><span>🔒 Mission Control · Locked</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            placeholder="paste control token"
            style={{
              flex: 1, minWidth: 180, padding: '8px 10px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)',
              color: '#e9eef4', fontFamily: '"Space Mono", monospace', fontSize: 12,
            }}
          />
          <button type="button" onClick={unlock} style={btn(GREEN)}>Unlock</button>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(150,162,178,0.6)', marginTop: 8 }}>
          Controls drive the live BioSim run. Without the token the dashboard is read-only.
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={label}>
        <span style={{ color: GREEN }}>● Mission Control · Unlocked</span>
        <button type="button" onClick={() => setOpen((o) => !o)} style={miniBtn}>
          {open ? '▾ hide' : '▸ show'}
        </button>
      </div>

      {open && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(180,190,205,0.85)' }}>Crew</span>
            <input
              type="number" min={1} max={30} value={crew}
              onChange={(e) => setCrew(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
              style={{
                width: 52, padding: '5px 7px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(0,0,0,0.35)', color: '#e9eef4', fontFamily: '"Space Mono", monospace', fontSize: 12,
              }}
            />
            <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, overflow: 'hidden' }}>
              {(['off', 'malfunctions'] as Difficulty[]).map((d) => (
                <button key={d} type="button" onClick={() => setDifficulty(d)} style={{
                  padding: '5px 9px', border: 'none', cursor: 'pointer', fontFamily: '"Space Mono", monospace', fontSize: 11,
                  background: difficulty === d ? 'rgba(0,255,150,0.18)' : 'transparent',
                  color: difficulty === d ? GREEN : 'rgba(156,163,175,1)',
                }}>
                  {d === 'off' ? 'No Malf' : 'Malf'}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!!busy || running}
              title={running ? 'A run is already live — Stop it first' : undefined}
              onClick={() => send('Start', { action: 'start', crew_size: crew, difficulty })}
              style={btnState(GREEN, !!busy || running)}
            >▶ Start</button>
            {running && (
              <span style={{ fontSize: 10, color: 'rgba(150,162,178,0.7)' }}>run live — Start locked</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(180,190,205,0.85)' }}>Advance</span>
            {[1, 5, 25].map((n) => (
              <button key={n} type="button" disabled={!!busy}
                onClick={() => send(`Advance ${n}`, { action: 'advance', sols: n, note: `Web control: advanced ${n} sols.` })}
                style={btn('#7cf2ff')}>+{n}</button>
            ))}
            <button type="button" disabled={!!busy}
              onClick={() => send('Inject fault', { action: 'inject', module: 'Grey_Water_Store', intensity: 'SEVERE_MALF' })}
              style={btn(AMBER)}>⚠ Inject Fault</button>
            {/* Pause/Resume — toggles the relay's broadcast paused flag so BOTH the
                survival and habitat screens reflect it. Only meaningful with a live run. */}
            {paused ? (
              <button type="button" disabled={!!busy}
                onClick={() => send('Resume', { action: 'resume' })}
                style={btn(GREEN)}>▶ Resume</button>
            ) : (
              <button type="button" disabled={!!busy || !running}
                title={running ? undefined : 'No live run to pause'}
                onClick={() => send('Pause', { action: 'pause' })}
                style={btnState(AMBER, !!busy || !running)}>❚❚ Pause</button>
            )}
            <button type="button" disabled={!!busy} onClick={() => send('Stop', { action: 'stop' })} style={btn(RED)}>■ Stop</button>
            <button type="button" onClick={lock} style={{ ...miniBtn, marginLeft: 'auto' }}>🔒 Lock</button>
          </div>

          {/* Reverse channel: ask the supervisor to respawn the pilot subagent with a
              fresh context (resume_run continues the same run, key intact). */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(180,190,205,0.85)' }}>Pilot</span>
            <button
              type="button"
              disabled={!!busy || !running}
              title={running
                ? 'Tell the supervisor to compact: respawn a fresh pilot subagent that resumes this run'
                : 'No live run to compact'}
              onClick={() => send('New pilot session', { action: 'new_session' })}
              style={btnState('#b388ff', !!busy || !running)}
            >⟳ New Pilot Session (compact)</button>
            <span style={{ fontSize: 10, color: 'rgba(150,162,178,0.6)' }}>
              clears the pilot's context — run &amp; key preserved
            </span>
          </div>

          {(busy || msg) && (
            <div style={{
              marginTop: 8, fontSize: 11,
              color: busy ? 'rgba(180,190,205,0.8)' : msg?.bad ? RED : GREEN,
            }}>
              {busy ? `${busy}…` : msg?.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function btn(accent: string): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${accent}`, background: `${accent}14`, color: accent,
    fontFamily: '"Space Mono", monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
  };
}
// Same as btn() but dims + blocks the pointer when disabled, so a locked Start /
// New-Session button reads as inert rather than just non-responsive.
function btnState(accent: string, disabled: boolean): React.CSSProperties {
  return {
    ...btn(accent),
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}
const miniBtn: React.CSSProperties = {
  padding: '3px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)',
  background: 'transparent', color: 'rgba(180,190,205,0.85)', fontFamily: '"Space Mono", monospace', fontSize: 10.5,
};

export default ControlPanel;
