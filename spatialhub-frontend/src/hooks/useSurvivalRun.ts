// useSurvivalRun — subscribe to the live survival relay (/api/survival/live) and
// expose a normalized run state. Used by the habitat dashboard so it mirrors EXACTLY
// what the survival mission-control screen shows for the same test — including
// paused/stopped/ended transitions — because both read the same relay (one server-
// side source of truth). Read-only: this hook never controls the run.

import { useEffect, useRef, useState } from 'react';
import {
  survivalLiveUrl,
  type SurvivalSolEvent,
  type SurvivalEndEvent,
  type SurvivalStatusEvent,
  type SurvivalStore,
  type SurvivalPlanEvent,
} from '../api/survival';

export type RunPhase = 'idle' | 'live' | 'paused' | 'stopped' | 'ended';
type Difficulty = 'off' | 'malfunctions';

export interface SurvivalRunState {
  phase: RunPhase;
  connected: boolean;
  sol: number;
  alive: boolean;
  paused: boolean;
  difficulty: Difficulty | null;
  crewSize: number;
  stores: SurvivalStore[];               // latest per-store pct (display order from the run)
  balances: Record<string, number>;      // resource -> net flow (negative = draining)
  deltas: Record<string, number>;        // per-store pct change since the previous sol
  result: { sols_survived: number; ended_reason: string } | null;
  plan: SurvivalPlanEvent | null;
}

const INITIAL: SurvivalRunState = {
  phase: 'idle', connected: false, sol: 0, alive: true, paused: false,
  difficulty: null, crewSize: 15, stores: [], balances: {}, deltas: {},
  result: null, plan: null,
};

// Fallback: derive per-store pct from raw BioSim modules when the compact `stores`
// array isn't on the event (mirrors the survival view's own fallback).
function storesFromModules(modules: Record<string, unknown>): SurvivalStore[] {
  const out: SurvivalStore[] = [];
  for (const [name, mod] of Object.entries(modules || {})) {
    if (!name.endsWith('_Store')) continue;
    const props = (mod as { properties?: Record<string, number> })?.properties;
    if (!props) continue;
    const { currentLevel: level, currentCapacity: cap } = props;
    if (typeof level === 'number' && typeof cap === 'number' && cap > 0) {
      out.push({ name, pct: (level / cap) * 100 });
    }
  }
  return out;
}

function phaseOf(s: Pick<SurvivalRunState, 'result' | 'paused'> & { started: boolean }): RunPhase {
  if (s.result) return s.result.ended_reason === 'stopped' ? 'stopped' : 'ended';
  if (!s.started) return 'idle';
  return s.paused ? 'paused' : 'live';
}

export function useSurvivalRun(): SurvivalRunState {
  const [state, setState] = useState<SurvivalRunState>(INITIAL);
  const startedRef = useRef(false);          // a run/sol has been seen this session
  const lastPctRef = useRef<Map<string, number>>(new Map());
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const parse = <T,>(ev: MessageEvent): T | null => {
      try { return JSON.parse(ev.data) as T; } catch { return null; }
    };

    const connect = () => {
      if (!mountedRef.current) return;
      const es = new EventSource(survivalLiveUrl());
      esRef.current = es;

      es.addEventListener('run', (ev) => {
        const d = parse<{ difficulty: Difficulty; crew_size: number }>(ev as MessageEvent);
        if (!d) return;
        startedRef.current = true;
        lastPctRef.current = new Map();
        setState((p) => ({
          ...p, connected: true,           // `started` is tracked via startedRef, not state
          difficulty: d.difficulty ?? p.difficulty, crewSize: d.crew_size || p.crewSize,
          sol: 0, alive: true, paused: false, stores: [], balances: {}, deltas: {},
          result: null, plan: null, phase: 'live',
        }));
      });

      es.addEventListener('sol', (ev) => {
        const d = parse<SurvivalSolEvent>(ev as MessageEvent);
        if (!d) return;
        startedRef.current = true;
        const stores = (d.stores && d.stores.length) ? d.stores : storesFromModules(d.modules || {});
        const deltas: Record<string, number> = {};
        const nextPct = new Map<string, number>();
        for (const s of stores) {
          const prev = lastPctRef.current.get(s.name);
          if (prev !== undefined) deltas[s.name] = s.pct - prev;
          nextPct.set(s.name, s.pct);
        }
        lastPctRef.current = nextPct;
        const balances: Record<string, number> = {};
        for (const b of d.balances || []) balances[b.resource] = b.net;
        setState((p) => {
          const next = { ...p, connected: true, sol: d.sol, alive: d.alive, stores, balances, deltas };
          next.phase = phaseOf({ result: next.result, paused: next.paused, started: true });
          return next;
        });
      });

      es.addEventListener('status', (ev) => {
        const d = parse<SurvivalStatusEvent>(ev as MessageEvent);
        if (!d) return;
        setState((p) => {
          const paused = !!d.paused;
          return { ...p, connected: true, paused,
            phase: phaseOf({ result: p.result, paused, started: startedRef.current }) };
        });
      });

      es.addEventListener('plan', (ev) => {
        const d = parse<SurvivalPlanEvent>(ev as MessageEvent);
        if (d) setState((p) => ({ ...p, connected: true, plan: d }));
      });

      es.addEventListener('end', (ev) => {
        const d = parse<SurvivalEndEvent>(ev as MessageEvent);
        if (!d) return;
        setState((p) => {
          const result = { sols_survived: d.sols_survived, ended_reason: d.ended_reason };
          return { ...p, connected: true, alive: false, paused: false, result,
            phase: phaseOf({ result, paused: false, started: startedRef.current }) };
        });
      });

      es.onerror = () => {
        setState((p) => ({ ...p, connected: false }));
        // EventSource retries transient drops itself; if it hard-closed, recreate.
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          if (retryRef.current) clearTimeout(retryRef.current);
          retryRef.current = setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      mountedRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      esRef.current?.close();
    };
  }, []);

  return state;
}
