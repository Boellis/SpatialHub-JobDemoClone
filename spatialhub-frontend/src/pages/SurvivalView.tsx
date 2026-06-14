// SurvivalView — "Can the autonomous Claude bot keep the habitat alive?" page.
//
// Drives the SHARED useHabitatStore from a server-sent-events survival stream and
// renders the REUSED ZonePanel / HabitatHUD / AlertBanner habitat components, plus a
// big SOL counter, a live bot-reasoning overlay, Run/Stop controls, a difficulty toggle,
// and an end-of-run result card.
//
// Data flow (per spec):
//   Run  -> new EventSource(survivalStreamUrl(difficulty))
//   run  -> capture run_id (for Stop)
//   sol  -> useHabitatStore.getState().tick(solEventToReadings(modules, history))
//           + bump local sol counter, append reasoning, track warnings
//   end  -> show "Survived N sols" result card
//   Stop -> stopSurvival(run_id) + es.close()
//
// Lazy-loaded via React.lazy in App.tsx — needs a default export.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHabitatStore } from '../store/habitatStore';
import { ZonePanel } from '../components/habitat/ZonePanel';
import { HabitatHUD } from '../components/habitat/HabitatHUD';
import { AlertBanner } from '../components/habitat/AlertBanner';
import { solEventToReadings } from '../simulation/survivalZone';
import {
  survivalStreamUrl,
  stopSurvival,
  type SurvivalSolEvent,
  type SurvivalEndEvent,
} from '../api/survival';

type Difficulty = 'off' | 'malfunctions';

interface ReasoningEntry {
  sol: number;
  reasoning: string;
}

interface SurvivalResult {
  sols_survived: number;
  ended_reason: string;
}

// Per-sensor history ring buffer threaded into the mapper across sols so sparklines populate.
type SensorHistory = Record<string, Record<string, number[]>>;

const SURVIVAL_GREEN = '#00ff88';
const SURVIVAL_RED = '#ff2200';

const SurvivalView = () => {
  const selectedZoneId = useHabitatStore((s) => s.selectedZoneId);
  const setSelectedZoneId = useHabitatStore((s) => s.setSelectedZoneId);

  const [running, setRunning] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('malfunctions');
  const [sol, setSol] = useState(0);
  const [reasoningLog, setReasoningLog] = useState<ReasoningEntry[]>([]);
  const [warnings, setWarnings] = useState<{ sensor: string; status: string }[]>([]);
  const [result, setResult] = useState<SurvivalResult | null>(null);

  // Non-reactive refs — the EventSource, the active run id, and the rolling sensor history.
  const esRef = useRef<EventSource | null>(null);
  const runIdRef = useRef<string | null>(null);
  const historyRef = useRef<SensorHistory>({});

  // Tear down the stream on unmount.
  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const handleSol = useCallback((d: SurvivalSolEvent) => {
    // Feed the shared habitat store — the reused zone components subscribe to it directly.
    useHabitatStore.getState().tick(solEventToReadings(d.modules, historyRef.current));
    setSol(d.sol);
    setWarnings(d.warnings ?? []);
    if (d.reasoning) {
      setReasoningLog((log) => [{ sol: d.sol, reasoning: d.reasoning }, ...log].slice(0, 12));
    }
  }, []);

  const stop = useCallback(() => {
    const runId = runIdRef.current;
    esRef.current?.close();
    esRef.current = null;
    runIdRef.current = null;
    setRunning(false);
    if (runId) {
      void stopSurvival(runId);
    }
  }, []);

  const run = useCallback(() => {
    if (esRef.current) return; // already streaming

    // Fresh run — reset local state.
    setResult(null);
    setSol(0);
    setReasoningLog([]);
    setWarnings([]);
    historyRef.current = {};
    runIdRef.current = null;

    const es = new EventSource(survivalStreamUrl(difficulty));
    esRef.current = es;
    setRunning(true);

    es.addEventListener('run', (ev) => {
      const d = JSON.parse((ev as MessageEvent).data) as { run_id: string };
      runIdRef.current = d.run_id;
    });

    es.addEventListener('sol', (ev) => {
      handleSol(JSON.parse((ev as MessageEvent).data) as SurvivalSolEvent);
    });

    es.addEventListener('end', (ev) => {
      const d = JSON.parse((ev as MessageEvent).data) as SurvivalEndEvent;
      setResult({ sols_survived: d.sols_survived, ended_reason: d.ended_reason });
      es.close();
      esRef.current = null;
      runIdRef.current = null;
      setRunning(false);
    });

    es.addEventListener('error', () => {
      // Network/stream error — release the connection but keep whatever we rendered.
      es.close();
      esRef.current = null;
      setRunning(false);
    });
  }, [difficulty, handleSol]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at 50% 30%, #1a0f0a 0%, #0a0a0a 70%)',
        color: 'white',
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}
    >
      {/* Reused habitat overlay components — all store-driven. */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        <HabitatHUD />
        <AlertBanner />
        {selectedZoneId && (
          <ZonePanel zoneId={selectedZoneId} onClose={() => setSelectedZoneId(null)} />
        )}
      </div>

      {/* Big SOL counter — center top */}
      <div
        style={{
          position: 'fixed',
          top: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          zIndex: 15,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            letterSpacing: '0.3em',
            color: 'rgba(156,163,175,1)',
            marginBottom: '0.25rem',
          }}
        >
          SURVIVAL · SOL
        </div>
        <div
          data-testid="survival-sol"
          style={{
            fontSize: '5rem',
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '0.05em',
            color: warnings.length > 0 ? '#ffaa00' : SURVIVAL_GREEN,
            textShadow: '0 0 24px rgba(0,255,136,0.35)',
          }}
        >
          {String(sol).padStart(3, '0')}
        </div>
      </div>

      {/* Bot-reasoning overlay — bottom-left log */}
      <div
        style={{
          position: 'fixed',
          left: '1.5rem',
          bottom: '1.5rem',
          width: 'min(420px, 40vw)',
          maxHeight: '40vh',
          overflowY: 'auto',
          background: 'rgba(10, 12, 18, 0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '14px 16px',
          zIndex: 15,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            fontSize: '0.7rem',
            letterSpacing: '0.2em',
            color: 'rgba(156,163,175,1)',
            marginBottom: '8px',
          }}
        >
          CLAUDE · BOT REASONING
        </div>
        {reasoningLog.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'rgba(156,163,175,0.7)' }}>
            {running ? 'Awaiting first decision…' : 'Press Run to start the autonomous run.'}
          </div>
        ) : (
          reasoningLog.map((entry, i) => (
            <div
              key={`${entry.sol}-${i}`}
              style={{
                fontSize: '0.82rem',
                lineHeight: 1.4,
                marginBottom: '8px',
                opacity: i === 0 ? 1 : 0.6,
              }}
            >
              <span style={{ color: SURVIVAL_GREEN, fontWeight: 700 }}>
                SOL {String(entry.sol).padStart(3, '0')}
              </span>{' '}
              <span style={{ color: 'rgba(229,231,235,1)' }}>{entry.reasoning}</span>
            </div>
          ))
        )}
      </div>

      {/* Controls — bottom-center */}
      <div
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          zIndex: 20,
        }}
      >
        {!running ? (
          <button
            type="button"
            onClick={run}
            style={controlButtonStyle(SURVIVAL_GREEN)}
          >
            ▶ Run
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            style={controlButtonStyle(SURVIVAL_RED)}
          >
            ■ Stop
          </button>
        )}

        {/* Difficulty toggle — disabled mid-run */}
        <div
          style={{
            display: 'flex',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            overflow: 'hidden',
            opacity: running ? 0.5 : 1,
          }}
        >
          {(['off', 'malfunctions'] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              disabled={running}
              onClick={() => setDifficulty(d)}
              style={{
                padding: '0.5rem 0.9rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
                border: 'none',
                cursor: running ? 'not-allowed' : 'pointer',
                background: difficulty === d ? 'rgba(0,255,136,0.18)' : 'transparent',
                color: difficulty === d ? SURVIVAL_GREEN : 'rgba(156,163,175,1)',
              }}
            >
              {d === 'off' ? 'No Malfunctions' : 'Malfunctions'}
            </button>
          ))}
        </div>
      </div>

      {/* Result card — shown when the run ends */}
      {result && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 30,
          }}
        >
          <div
            style={{
              background: 'rgba(14, 16, 22, 0.92)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: '2rem 2.5rem',
              textAlign: 'center',
              boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
              minWidth: '320px',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                letterSpacing: '0.3em',
                color: 'rgba(156,163,175,1)',
                marginBottom: '0.75rem',
              }}
            >
              RUN COMPLETE
            </div>
            <div
              style={{
                fontSize: '2.25rem',
                fontWeight: 800,
                color: SURVIVAL_GREEN,
                marginBottom: '0.5rem',
              }}
            >
              Survived {result.sols_survived} sols
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                color: 'rgba(229,231,235,0.8)',
                marginBottom: '1.5rem',
              }}
            >
              Ended: {result.ended_reason.replace(/_/g, ' ')}
            </div>
            <button
              type="button"
              onClick={run}
              style={controlButtonStyle(SURVIVAL_GREEN)}
            >
              ▶ Run Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function controlButtonStyle(accent: string): React.CSSProperties {
  return {
    padding: '0.6rem 1.4rem',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    border: `1px solid ${accent}`,
    borderRadius: '8px',
    background: 'rgba(10,12,18,0.8)',
    color: accent,
    cursor: 'pointer',
    boxShadow: `0 0 16px ${accent}33`,
  };
}

export { SurvivalView };
export default SurvivalView;
