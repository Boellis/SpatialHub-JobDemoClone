// SurvivalView — SPECTATOR view for "Can the autonomous Claude bot keep the habitat alive?"
//
// The bot is now driven EXTERNALLY (by a Claude subscription session via an MCP server).
// This page only WATCHES: it auto-connects to a read-only SSE stream and renders whatever
// the external pilot pushes. No Run/Stop — the spectator can't start the pilot's run.
//
// Drives the SHARED useHabitatStore and renders the REUSED ZonePanel / HabitatHUD /
// AlertBanner habitat components, plus a big SOL counter, a live bot-reasoning overlay,
// a read-only LIVE/RECONNECTING status pill, and an end-of-run result card.
//
// Data flow (per spec):
//   mount -> new EventSource(survivalLiveUrl())  (auto-connect, auto-reconnect on error)
//   run   -> reset local state for the new run + capture difficulty for display
//   sol   -> useHabitatStore.getState().tick(solEventToReadings(modules, history))
//            + bump local sol counter, append reasoning, track warnings
//   end   -> show "Survived N sols" result card
//
// Lazy-loaded via React.lazy in App.tsx — needs a default export.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHabitatStore } from '../store/habitatStore';
import { ZonePanel } from '../components/habitat/ZonePanel';
import { HabitatHUD } from '../components/habitat/HabitatHUD';
import { AlertBanner } from '../components/habitat/AlertBanner';
import { solEventToReadings } from '../simulation/survivalZone';
import {
  survivalLiveUrl,
  type SurvivalSolEvent,
  type SurvivalEndEvent,
} from '../api/survival';

type Difficulty = 'off' | 'malfunctions';

interface RunEvent {
  run_id: string;
  difficulty: Difficulty;
  crew_size: number;
}

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
const RECONNECT_DELAY_MS = 3000;

const SurvivalView = () => {
  const selectedZoneId = useHabitatStore((s) => s.selectedZoneId);
  const setSelectedZoneId = useHabitatStore((s) => s.setSelectedZoneId);

  const [connected, setConnected] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [sol, setSol] = useState(0);
  const [reasoningLog, setReasoningLog] = useState<ReasoningEntry[]>([]);
  const [warnings, setWarnings] = useState<{ sensor: string; status: string }[]>([]);
  const [result, setResult] = useState<SurvivalResult | null>(null);

  // Non-reactive refs — the EventSource, the rolling sensor history, the reconnect timer,
  // and a mounted flag so the reconnect loop stops cleanly on unmount.
  const esRef = useRef<EventSource | null>(null);
  const historyRef = useRef<SensorHistory>({});
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const handleSol = useCallback((d: SurvivalSolEvent) => {
    // Feed the shared habitat store — the reused zone components subscribe to it directly.
    useHabitatStore.getState().tick(solEventToReadings(d.modules, historyRef.current));
    setSol(d.sol);
    setWarnings(d.warnings ?? []);
    if (d.reasoning) {
      setReasoningLog((log) => [{ sol: d.sol, reasoning: d.reasoning }, ...log].slice(0, 12));
    }
  }, []);

  // Auto-connect on mount, with a simple reconnect loop on error.
  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;

      const es = new EventSource(survivalLiveUrl());
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
      };

      es.addEventListener('run', (ev) => {
        setConnected(true);
        const d = JSON.parse((ev as MessageEvent).data) as RunEvent;
        // Fresh run — reset local state for the new run.
        setResult(null);
        setSol(0);
        setReasoningLog([]);
        setWarnings([]);
        historyRef.current = {};
        setDifficulty(d.difficulty);
      });

      es.addEventListener('sol', (ev) => {
        setConnected(true);
        handleSol(JSON.parse((ev as MessageEvent).data) as SurvivalSolEvent);
      });

      es.addEventListener('end', (ev) => {
        setConnected(true);
        const d = JSON.parse((ev as MessageEvent).data) as SurvivalEndEvent;
        setResult({ sols_survived: d.sols_survived, ended_reason: d.ended_reason });
      });

      es.addEventListener('error', () => {
        // EventSource auto-reconnects, but we drive an explicit reconnect so the status
        // pill reflects reality. Close, mark disconnected, and re-create after a delay.
        setConnected(false);
        es.close();
        esRef.current = null;
        if (mountedRef.current && reconnectTimerRef.current === null) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, RECONNECT_DELAY_MS);
        }
      });
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [handleSol]);

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
            {sol > 0 ? 'Standing by…' : 'Waiting for the pilot to start a run…'}
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

      {/* Read-only status pill — bottom-center */}
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            border: `1px solid ${connected ? SURVIVAL_GREEN : 'rgba(255,170,0,0.6)'}`,
            borderRadius: '8px',
            background: 'rgba(10,12,18,0.8)',
            color: connected ? SURVIVAL_GREEN : '#ffaa00',
            boxShadow: connected ? `0 0 16px ${SURVIVAL_GREEN}33` : 'none',
          }}
        >
          {connected ? '● LIVE' : '○ RECONNECTING…'}
        </div>

        {difficulty && (
          <div
            style={{
              padding: '0.5rem 0.9rem',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              color: 'rgba(156,163,175,1)',
            }}
          >
            {difficulty === 'off' ? 'NO MALFUNCTIONS' : 'MALFUNCTIONS'}
          </div>
        )}
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
            <div
              style={{
                fontSize: '0.8rem',
                color: 'rgba(156,163,175,0.9)',
                marginBottom: '1rem',
              }}
            >
              Waiting for next run…
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              style={controlButtonStyle(SURVIVAL_GREEN)}
            >
              Dismiss
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
