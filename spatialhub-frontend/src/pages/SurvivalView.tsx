// SurvivalView — mission-control SPECTATOR dashboard for the autonomous survival run.
//
// The bot is driven EXTERNALLY (a Claude subscription session via the biosim MCP);
// this page only WATCHES a read-only SSE stream and renders what the pilot pushes.
// Self-contained: it does NOT touch the 3D habitat store/HUD — a single SOL counter,
// a live life-support telemetry grid, an 8-bit crew deck, Claude's decision log, and
// a computed alerts strip. Auto-connects, auto-reconnects, no Run/Stop controls.
//
//   mount -> EventSource(survivalLiveUrl())
//   run   -> reset for new run + capture crew size / difficulty
//   sol   -> update telemetry (stores/balances), counter, reasoning, alerts
//   end   -> crew slumps + "Survived N sols" climax card
//
// Lazy-loaded via React.lazy in App.tsx — needs a default export.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  survivalLiveUrl,
  fetchSurvivalRuns,
  fetchSurvivalRunLog,
  type SurvivalSolEvent,
  type SurvivalEndEvent,
  type SurvivalStore,
  type PilotStat,
  type SurvivalRunSummary,
  type SurvivalDecision,
} from '../api/survival';
import { CrewYard } from '../components/survival/CrewYard';
import { ControlPanel } from '../components/survival/ControlPanel';
import { ResourceCard, healthOf, type Health } from '../components/survival/ResourceCard';

type Difficulty = 'off' | 'malfunctions';
interface RunEvent { run_id: string; difficulty: Difficulty; crew_size: number; pilot?: PilotStat }
interface ReasoningEntry { sol: number; reasoning: string }
interface SurvivalResult { sols_survived: number; ended_reason: string }
type SolAction = { module: string; kind: string; type: string; desired_rates: number[] };
type StoreView = { name: string; pct: number; delta: number; runway?: number; net?: number };

// Life-support stores in display order. `highIsBad` flips the health bands for
// scrubber/waste stores (full = danger), and `resource` links to the net-flow balance.
const RESOURCES: {
  name: string; label: string; primary: boolean; highIsBad: boolean; resource: string;
}[] = [
  { name: 'O2_Store', label: 'Oxygen', primary: true, highIsBad: false, resource: 'O2' },
  { name: 'CO2_Store', label: 'CO₂ Scrubber', primary: true, highIsBad: true, resource: 'CO2' },
  { name: 'General_Power_Store', label: 'Power', primary: true, highIsBad: false, resource: 'Power' },
  { name: 'Potable_Water_Store', label: 'Potable Water', primary: true, highIsBad: false, resource: 'PotableWater' },
  { name: 'Food_Store', label: 'Food', primary: true, highIsBad: false, resource: 'Food' },
  { name: 'Biomass_Store', label: 'Biomass', primary: false, highIsBad: false, resource: 'Biomass' },
  { name: 'Grey_Water_Store', label: 'Grey Water', primary: false, highIsBad: false, resource: 'GreyWater' },
  { name: 'Dirty_Water_Store', label: 'Dirty Water', primary: false, highIsBad: true, resource: 'DirtyWater' },
  { name: 'H2_Store', label: 'Hydrogen', primary: false, highIsBad: false, resource: 'H2' },
  { name: 'Dry_Waste_Store', label: 'Dry Waste', primary: false, highIsBad: true, resource: 'DryWaste' },
];
const META = new Map(RESOURCES.map((r) => [r.name, r]));

const RECONNECT_DELAY_MS = 3000;
const GREEN = '#00ff9c';
const AMBER = '#ffb000';
const GOLD = '#ffd166';

// Persistent high-sol log — kept in localStorage so the record survives page
// reloads AND backend redeploys (ideal for a demo machine; no DB needed).
type RunRecord = { sols: number; reason: string; ts: number };
const RECORD_KEY = 'survival.record.v1';
function loadRecord(): { best: number; log: RunRecord[] } {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { best: Number(p.best) || 0, log: Array.isArray(p.log) ? p.log : [] };
    }
  } catch { /* ignore */ }
  return { best: 0, log: [] };
}
function saveRecord(best: number, log: RunRecord[]) {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify({ best, log: log.slice(0, 10) }));
  } catch { /* ignore */ }
}

// Fallback: reconstruct compact stores from raw BioSim modules when the event
// doesn't carry `stores` (older pilot build). Reads each *_Store level/capacity.
function deriveStores(modules: Record<string, unknown>): SurvivalStore[] {
  const out: SurvivalStore[] = [];
  for (const [name, mod] of Object.entries(modules || {})) {
    if (!name.endsWith('_Store')) continue;
    const props = (mod as { properties?: Record<string, number> })?.properties;
    if (!props) continue;
    const level = props.currentLevel;
    const cap = props.currentCapacity;
    if (typeof level === 'number' && typeof cap === 'number' && cap > 0) {
      out.push({ name, pct: (level / cap) * 100 });
    }
  }
  return out;
}

const SurvivalView = () => {
  const [connected, setConnected] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [crewSize, setCrewSize] = useState(15);
  const [sol, setSol] = useState(0);
  const [alive, setAlive] = useState(true);
  const [stores, setStores] = useState<StoreView[]>([]);
  const [lastActions, setLastActions] = useState<SolAction[]>([]);
  const [reasoningLog, setReasoningLog] = useState<ReasoningEntry[]>([]);
  const [result, setResult] = useState<SurvivalResult | null>(null);
  const [best, setBestState] = useState(0);
  const [isRecord, setIsRecord] = useState(false);
  const [pilot, setPilot] = useState<PilotStat | null>(null);

  // Durable decision-log archive (persisted across restarts/runs).
  const [showHistory, setShowHistory] = useState(false);
  const [historyRuns, setHistoryRuns] = useState<SurvivalRunSummary[] | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [archiveLog, setArchiveLog] = useState<SurvivalDecision[]>([]);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [seeAllOpen, setSeeAllOpen] = useState(false); // full current-session decision log

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const lastPctRef = useRef<Map<string, number>>(new Map()); // for per-store delta
  const bestRef = useRef(0);          // record at-large (ref avoids stale closures)
  const recordStartRef = useRef(0);   // best when the current run began
  const logRef = useRef<RunRecord[]>([]);

  const setBest = (n: number) => { bestRef.current = n; setBestState(n); };

  // Load the persisted record once.
  useEffect(() => {
    const r = loadRecord();
    setBest(r.best);
    recordStartRef.current = r.best;
    logRef.current = r.log;
  }, []);

  const handleSol = useCallback((d: SurvivalSolEvent) => {
    const raw = d.stores && d.stores.length ? d.stores : deriveStores(d.modules);
    const balMap = new Map((d.balances ?? []).map((b) => [b.resource, b.net]));
    const view: StoreView[] = raw.map((s) => {
      const prev = lastPctRef.current.get(s.name);
      lastPctRef.current.set(s.name, s.pct);
      const meta = META.get(s.name);
      return {
        name: s.name,
        pct: s.pct,
        delta: prev === undefined ? 0 : s.pct - prev,
        runway: s.runway_sols,
        net: meta ? balMap.get(meta.resource) : undefined,
      };
    });
    setStores(view);
    setSol(d.sol);
    setAlive(d.alive);
    if (d.pilot) setPilot(d.pilot);
    // Track the all-time high sol.
    if (d.sol > bestRef.current) {
      setBest(d.sol);
      saveRecord(d.sol, logRef.current);
      if (recordStartRef.current > 0 && d.sol > recordStartRef.current) setIsRecord(true);
    }
    if (d.actions) setLastActions(d.actions);
    if (d.reasoning) {
      setReasoningLog((log) => {
        // Guard against a replay frame duplicating the newest live entry.
        if (log[0] && log[0].sol === d.sol && log[0].reasoning === d.reasoning) return log;
        // Keep the whole current run (scrollable). The durable cross-run archive
        // lives in Postgres and is browsable via the History toggle.
        return [{ sol: d.sol, reasoning: d.reasoning }, ...log].slice(0, 500);
      });
    }
  }, []);

  // ── History archive loaders ─────────────────────────────────────────────
  const openHistory = useCallback(async () => {
    setShowHistory(true);
    setSelectedRun(null);
    setHistoryErr(null);
    setHistoryBusy(true);
    try {
      setHistoryRuns(await fetchSurvivalRuns(50));
    } catch {
      setHistoryErr('Could not load run history.');
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  const openRunLog = useCallback(async (runId: string) => {
    setSelectedRun(runId);
    setHistoryErr(null);
    setHistoryBusy(true);
    try {
      const { decisions } = await fetchSurvivalRunLog(runId);
      setArchiveLog(decisions);
    } catch {
      setHistoryErr('Could not load that run’s decision log.');
      setArchiveLog([]);
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  // Auto-connect with reconnect loop.
  useEffect(() => {
    mountedRef.current = true;
    const connect = () => {
      if (!mountedRef.current) return;
      const es = new EventSource(survivalLiveUrl());
      esRef.current = es;
      es.onopen = () => setConnected(true);

      es.addEventListener('run', (ev) => {
        setConnected(true);
        const d = JSON.parse((ev as MessageEvent).data) as RunEvent;
        setResult(null);
        setSol(0);
        setAlive(true);
        setStores([]);
        setLastActions([]);
        setReasoningLog([]);
        setSeeAllOpen(false);
        lastPctRef.current = new Map();
        setDifficulty(d.difficulty);
        if (d.crew_size) setCrewSize(d.crew_size);
        recordStartRef.current = bestRef.current; // snapshot the record to beat
        setIsRecord(false);
        if (d.pilot) setPilot(d.pilot);
      });
      es.addEventListener('sol', (ev) => {
        setConnected(true);
        handleSol(JSON.parse((ev as MessageEvent).data) as SurvivalSolEvent);
      });
      es.addEventListener('end', (ev) => {
        setConnected(true);
        const d = JSON.parse((ev as MessageEvent).data) as SurvivalEndEvent;
        setAlive(false);
        setResult({ sols_survived: d.sols_survived, ended_reason: d.ended_reason });
        // Log the completed run + persist any new record.
        const rec: RunRecord = { sols: d.sols_survived, reason: d.ended_reason, ts: Date.now() };
        logRef.current = [rec, ...logRef.current].slice(0, 10);
        const nb = Math.max(bestRef.current, d.sols_survived);
        setBest(nb);
        saveRecord(nb, logRef.current);
      });
      es.addEventListener('error', () => {
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
      if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [handleSol]);

  // Derive resource rows + alerts from current stores.
  const byName = new Map(stores.map((s) => [s.name, s]));
  const cards = RESOURCES.map((r) => {
    const s = byName.get(r.name);
    if (!s) return null;
    const health = healthOf(s.pct, r.highIsBad);
    return { ...r, ...s, health };
  }).filter(Boolean) as (typeof RESOURCES[number] & StoreView & { health: Health })[];
  const primary = cards.filter((c) => c.primary);
  const secondary = cards.filter((c) => !c.primary);
  // Stores currently in alert — the crew gravitate toward these stations.
  const hotStores = cards.filter((c) => c.health !== 'ok').map((c) => c.name);

  const alerts = cards
    .filter((c) => c.health !== 'ok')
    .sort((a, b) => (a.health === 'crit' ? -1 : 1) - (b.health === 'crit' ? -1 : 1))
    .slice(0, 4)
    .map((c) => {
      const word = c.health === 'crit'
        ? (c.highIsBad ? 'SATURATED' : 'CRITICAL')
        : (c.highIsBad ? 'HIGH' : 'LOW');
      return { key: c.name, label: c.label, word, pct: c.pct, crit: c.health === 'crit' };
    });

  const hasRun = sol > 0 || stores.length > 0;

  return (
    <div
      style={{
        position: 'relative',
        minHeight: 'calc(100vh - var(--nav-height, 56px))',
        background:
          'radial-gradient(1200px 600px at 70% -10%, rgba(0,90,70,0.18), transparent 60%),' +
          'radial-gradient(900px 500px at 10% 110%, rgba(0,40,80,0.22), transparent 60%),' +
          '#05070a',
        color: '#e9eef4',
        fontFamily: '"Outfit", system-ui, sans-serif',
        padding: '16px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* ── HERO ─────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
          padding: '4px 4px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div>
          <div style={labelStyle}>Sols Survived</div>
          <div
            data-testid="survival-sol"
            style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontWeight: 700,
              fontSize: 72,
              lineHeight: 0.9,
              letterSpacing: '0.02em',
              color: alive ? GREEN : '#ff5252',
              textShadow: alive ? '0 0 28px rgba(0,255,150,0.35)' : '0 0 28px rgba(255,60,60,0.4)',
            }}
          >
            {String(sol).padStart(3, '0')}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={labelStyle}>Mission Status</div>
          <div
            style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: 26,
              fontWeight: 600,
              color: alive ? '#e9eef4' : '#ff7a7a',
              letterSpacing: '0.01em',
            }}
          >
            {alive ? `Crew ${crewSize}/${crewSize} · Alive` : 'Crew Lost'}
          </div>
          <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, color: 'rgba(160,170,185,0.8)', marginTop: 2 }}>
            Pilot: Claude (live, on subscription)
            {difficulty && ` · ${difficulty === 'off' ? 'No malfunctions' : 'Malfunctions on'}`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <LivePill connected={connected} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 10,
            border: `1px solid ${isRecord ? GOLD : 'rgba(255,209,102,0.3)'}`,
            background: isRecord ? 'rgba(255,209,102,0.12)' : 'rgba(255,209,102,0.04)',
            boxShadow: isRecord ? `0 0 18px ${GOLD}55` : 'none',
            fontFamily: '"Space Mono", monospace', fontSize: 11, letterSpacing: '0.08em', color: GOLD,
          }}>
            <span style={{ opacity: 0.8 }}>★ RECORD</span>
            <span style={{ fontFamily: '"Rajdhani", sans-serif', fontWeight: 700, fontSize: 18 }}>
              {Math.max(best, sol)}
            </span>
            <span style={{ opacity: 0.7 }}>sols</span>
            {isRecord && (
              <span style={{ color: '#fff', fontWeight: 700, animation: 'survPulse 1s ease-in-out infinite' }}>
                · NEW!
              </span>
            )}
          </div>
          <ContextGauge pilot={pilot} />
        </div>
      </header>

      {/* ── LIFE SUPPORT TELEMETRY ───────────────────────────── */}
      <section>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Life Support</div>
        {hasRun ? (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {primary.map((c) => (
                <ResourceCard key={c.name} label={c.label} pct={c.pct} health={c.health}
                  delta={c.delta} net={c.net} runway={c.runway} primary />
              ))}
            </div>
            {secondary.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {secondary.map((c) => (
                  <ResourceCard key={c.name} label={c.label} pct={c.pct} health={c.health}
                    delta={c.delta} net={c.net} primary={false} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={standbyStyle}>Awaiting telemetry — pilot has not started a run.</div>
        )}
      </section>

      {/* ── MISSION CONTROL (token-gated) ────────────────────── */}
      <ControlPanel />

      {/* ── DECK + DECISION LOG ──────────────────────────────── */}
      <section style={{ flex: 1, minHeight: 300, display: 'flex', gap: 12 }}>
        <div style={{ flex: 1.7, minWidth: 0 }}>
          <CrewYard crewSize={crewSize} alive={alive} sol={sol} hot={hotStores} />
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 280,
            maxWidth: 460,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(10,13,18,0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <div style={{
            ...labelStyle, padding: '12px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span><span style={{ color: GREEN }}>◆</span> Claude · Decision Log</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {!showHistory && reasoningLog.length > 0 && (
                <button type="button" onClick={() => setSeeAllOpen(true)} style={logTabStyle(false)}>
                  See all ({reasoningLog.length})
                </button>
              )}
              <button type="button" onClick={() => setShowHistory(false)} style={logTabStyle(!showHistory)}>
                Live
              </button>
              <button type="button" onClick={openHistory} style={logTabStyle(showHistory)}>
                History
              </button>
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: '10px 16px', flex: 1 }}>
            {!showHistory ? (
              /* ── LIVE: full current-run decision log (scrollable) ── */
              reasoningLog.length === 0 ? (
                <div style={{ ...standbyStyle, border: 'none', padding: '8px 0' }}>
                  {hasRun ? 'Standing by for the next decision…' : 'Waiting for the pilot to start a run…'}
                </div>
              ) : (
                reasoningLog.map((e, i) => (
                  <div key={`${e.sol}-${i}`} style={{ marginBottom: 12, opacity: i === 0 ? 1 : 0.7 }}>
                    <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, color: GREEN, fontWeight: 700 }}>
                      SOL {String(e.sol).padStart(3, '0')}
                    </span>
                    <div style={{ fontSize: 13, lineHeight: 1.45, color: '#dbe2ea', marginTop: 2 }}>{e.reasoning}</div>
                  </div>
                ))
              )
            ) : selectedRun ? (
              /* ── ARCHIVE: one past run's complete decision log ── */
              <>
                <button type="button" onClick={() => setSelectedRun(null)} style={backLinkStyle}>
                  ← All runs
                </button>
                {historyBusy ? (
                  <div style={{ ...standbyStyle, border: 'none', padding: '8px 0' }}>Loading decision log…</div>
                ) : historyErr ? (
                  <div style={{ ...standbyStyle, border: 'none', padding: '8px 0', color: AMBER }}>{historyErr}</div>
                ) : archiveLog.length === 0 ? (
                  <div style={{ ...standbyStyle, border: 'none', padding: '8px 0' }}>No reasoned decisions recorded.</div>
                ) : (
                  archiveLog.map((d, i) => (
                    <div key={`${d.sol}-${i}`} style={{ marginBottom: 12 }}>
                      <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, color: GREEN, fontWeight: 700 }}>
                        SOL {String(d.sol).padStart(3, '0')}
                      </span>
                      <div style={{ fontSize: 13, lineHeight: 1.45, color: '#dbe2ea', marginTop: 2 }}>{d.reasoning}</div>
                    </div>
                  ))
                )}
              </>
            ) : (
              /* ── ARCHIVE: run picker ── */
              historyBusy ? (
                <div style={{ ...standbyStyle, border: 'none', padding: '8px 0' }}>Loading runs…</div>
              ) : historyErr ? (
                <div style={{ ...standbyStyle, border: 'none', padding: '8px 0', color: AMBER }}>{historyErr}</div>
              ) : !historyRuns || historyRuns.length === 0 ? (
                <div style={{ ...standbyStyle, border: 'none', padding: '8px 0' }}>No past runs archived yet.</div>
              ) : (
                historyRuns.map((r) => (
                  <button key={r.run_id} type="button" onClick={() => openRunLog(r.run_id)} style={runRowStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: 18, fontWeight: 700, color: GREEN }}>
                        {r.sols_survived} <span style={{ fontSize: 11, opacity: 0.7 }}>sols</span>
                      </span>
                      <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 10, color: 'rgba(150,162,178,0.8)' }}>
                        {r.in_progress ? 'LIVE' : fmtRunDate(r.started_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(190,200,212,0.75)', marginTop: 3 }}>
                      {r.decision_count} decisions · {r.difficulty}
                      {r.ended_reason ? ` · ${r.ended_reason.replace(/_/g, ' ')}` : ''}
                    </div>
                  </button>
                ))
              )
            )}
          </div>
        </div>
      </section>

      {/* ── ALERTS + LAST ACTION ─────────────────────────────── */}
      <footer style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div style={{ flex: 2, minWidth: 280 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Alerts</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!hasRun ? (
              <div style={standbyStyle}>—</div>
            ) : alerts.length === 0 ? (
              <div style={{ ...alertChip(false), color: GREEN, borderColor: 'rgba(0,255,150,0.35)' }}>
                ● All systems nominal
              </div>
            ) : (
              alerts.map((a) => (
                <div key={a.key} style={alertChip(a.crit)}>
                  <span style={{ fontWeight: 700 }}>!!</span>&nbsp;{a.label} {a.word}
                  <span style={{ opacity: 0.7 }}> · {a.pct.toFixed(a.pct < 10 ? 1 : 0)}%</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Last Command</div>
          <div style={{
            fontFamily: '"Space Mono", monospace', fontSize: 12, color: '#cfe9dd',
            background: 'rgba(0,255,150,0.05)', border: '1px solid rgba(0,255,150,0.15)',
            borderRadius: 10, padding: '10px 12px', minHeight: 22,
          }}>
            {lastActions.length === 0
              ? '— no flow changes yet —'
              : lastActions.map((a, i) => (
                  <div key={i}>
                    {a.module} · {a.kind} · {a.type} → {a.desired_rates.join(', ')}
                  </div>
                ))}
          </div>
        </div>
      </footer>

      {/* ── SEE ALL: full current-session decision log ───────── */}
      {seeAllOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(2,4,7,0.78)', backdropFilter: 'blur(6px)', zIndex: 50, padding: 24,
          }}
          onClick={() => setSeeAllOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(12,16,22,0.97)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16, boxShadow: '0 12px 60px rgba(0,0,0,0.7)',
              width: 'min(720px, 96vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              ...labelStyle, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span><span style={{ color: GREEN }}>◆</span> Claude · Decision Log — {reasoningLog.length} decisions · this session</span>
              <button type="button" onClick={() => setSeeAllOpen(false)} style={logTabStyle(false)}>✕ Close</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '14px 20px' }}>
              {[...reasoningLog].reverse().map((e, i) => (
                <div key={`all-${e.sol}-${i}`} style={{
                  marginBottom: 14, paddingBottom: 14,
                  borderBottom: i === reasoningLog.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, color: GREEN, fontWeight: 700 }}>
                    SOL {String(e.sol).padStart(3, '0')}
                  </span>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#dbe2ea', marginTop: 3 }}>{e.reasoning}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── END-OF-RUN CLIMAX ────────────────────────────────── */}
      {result && (
        <div
          style={{
            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(2,4,7,0.72)', backdropFilter: 'blur(6px)', zIndex: 40,
          }}
        >
          <div style={{
            background: 'rgba(12,16,22,0.96)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 18, padding: '2.4rem 3rem', textAlign: 'center',
            boxShadow: '0 12px 60px rgba(0,0,0,0.7)', minWidth: 340,
          }}>
            <div style={labelStyle}>Run Complete</div>
            <div style={{
              fontFamily: '"Rajdhani", sans-serif', fontSize: 64, fontWeight: 700,
              color: GREEN, margin: '6px 0', textShadow: '0 0 30px rgba(0,255,150,0.4)',
            }}>
              {result.sols_survived}<span style={{ fontSize: 22, opacity: 0.7 }}> sols</span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(220,228,236,0.8)', marginBottom: 20 }}>
              Ended: {result.ended_reason.replace(/_/g, ' ')}
            </div>
            <button type="button" onClick={() => setResult(null)} style={{
              fontFamily: '"Space Mono", monospace', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em',
              padding: '0.6rem 1.5rem', borderRadius: 9, cursor: 'pointer',
              border: `1px solid ${GREEN}`, background: 'rgba(0,255,150,0.08)', color: GREEN,
            }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  fontFamily: '"Space Mono", monospace',
  fontSize: 10.5,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: 'rgba(150,162,178,0.85)',
};

const standbyStyle: React.CSSProperties = {
  fontFamily: '"Space Mono", monospace',
  fontSize: 12,
  color: 'rgba(150,162,178,0.6)',
  border: '1px dashed rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '14px 16px',
};

// Live / History toggle in the Decision Log header.
function logTabStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: '"Space Mono", monospace',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    padding: '3px 9px',
    borderRadius: 7,
    border: `1px solid ${active ? 'rgba(0,255,156,0.4)' : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(0,255,156,0.1)' : 'transparent',
    color: active ? GREEN : 'rgba(150,162,178,0.85)',
  };
}

const backLinkStyle: React.CSSProperties = {
  fontFamily: '"Space Mono", monospace',
  fontSize: 11,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  color: GREEN,
  padding: 0,
  marginBottom: 12,
};

const runRowStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
  padding: '10px 12px',
  marginBottom: 8,
};

function fmtRunDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function alertChip(crit: boolean): React.CSSProperties {
  const c = crit ? '#ff3b30' : '#ffb000';
  return {
    fontFamily: '"Space Mono", monospace',
    fontSize: 12,
    color: c,
    background: `${c}12`,
    border: `1px solid ${c}55`,
    borderRadius: 9,
    padding: '8px 12px',
    boxShadow: crit ? `0 0 16px ${c}33` : 'none',
    display: 'flex',
    alignItems: 'center',
  };
}

// Pilot-context gauge — estimated telemetry the MCP has fed the Claude pilot since
// the last resume/start. Not Claude Code's true window (the web app can't read that),
// but the dominant driver of context growth during a run — so it's a usable
// "when to /compact" signal. Resets when the pilot calls resume_run after a compact.
function ContextGauge({ pilot }: { pilot: PilotStat | null }) {
  if (!pilot) {
    return (
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 9.5, letterSpacing: '0.1em',
        color: 'rgba(150,162,178,0.55)', textAlign: 'right', maxWidth: 200,
      }}>
        PILOT CONTEXT · awaiting pilot
      </div>
    );
  }
  const pct = Math.min(100, (pilot.est_tokens / Math.max(1, pilot.budget)) * 100);
  const color = pct >= 85 ? '#ff3b30' : pct >= 60 ? '#ffb000' : '#00ff9c';
  const status = pct >= 85 ? 'COMPACT RECOMMENDED' : pct >= 60 ? 'GETTING LONG' : 'NOMINAL';
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  return (
    <div style={{ width: 200, textAlign: 'right' }} title="Estimated telemetry fed to the Claude pilot since its last resume. The web app can't read Claude Code's true context window; this is the main driver of context growth during a run. /compact + resume_run resets it.">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontFamily: '"Space Mono", monospace', fontSize: 9.5, letterSpacing: '0.12em',
        color: 'rgba(150,162,178,0.85)', marginBottom: 3,
      }}>
        <span>PILOT CONTEXT</span>
        <span style={{ color }}>{k(pilot.est_tokens)}/{k(pilot.budget)}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: `linear-gradient(90deg, ${color}aa, ${color})`,
          transition: 'width 0.5s ease, background 0.4s ease',
        }} />
      </div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 9, letterSpacing: '0.1em',
        color, marginTop: 3,
        animation: pct >= 85 ? 'survPulse 1.1s ease-in-out infinite' : 'none',
      }}>
        {status} · {pilot.tool_calls} calls
      </div>
    </div>
  );
}

function LivePill({ connected }: { connected: boolean }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
        fontFamily: '"Space Mono", monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
        borderRadius: 10,
        border: `1px solid ${connected ? 'rgba(0,255,150,0.5)' : 'rgba(255,176,0,0.5)'}`,
        color: connected ? GREEN : AMBER,
        background: connected ? 'rgba(0,255,150,0.06)' : 'rgba(255,176,0,0.06)',
        boxShadow: connected ? '0 0 18px rgba(0,255,150,0.2)' : 'none',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: connected ? GREEN : AMBER,
          boxShadow: connected ? `0 0 8px ${GREEN}` : 'none',
          animation: connected ? 'survPulse 1.4s ease-in-out infinite' : 'none',
        }}
      />
      {connected ? 'LIVE' : 'RECONNECTING'}
      <style>{`@keyframes survPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}

export { SurvivalView };
export default SurvivalView;
