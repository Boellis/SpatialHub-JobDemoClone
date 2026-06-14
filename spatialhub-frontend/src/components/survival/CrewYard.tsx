// CrewYard — the habitat deck. Each crew member is an 8-bit astronaut that works a
// shift: walk to a life-support STATION, perform a task there, then move on. When a
// system goes faulty (its store enters alert), the station turns red and crew swarm
// it to REPAIR — wrench out, repair progress bar climbing. When the fault clears
// (the bot recovers the system), the station flashes RESTORED and crew resume normal
// monitoring. Pure CSS/SVG — no sprite assets.

import { useEffect, useMemo, useRef, useState } from 'react';

const ACCENTS = [
  '#00ffc6', '#ffd166', '#ff5d8f', '#7cf2ff', '#b5ff5d',
  '#ff8a3d', '#c792ea', '#5dd0ff', '#ff5252', '#9affc0',
  '#ffe14d', '#6da8ff', '#ff7ad9', '#48e0a0', '#ffa14d',
];

type Station = { key: string; label: string; task: string; store: string; x: number; y: number };
const STATIONS: Station[] = [
  { key: 'o2', label: 'O₂ BAY', task: 'MONITORING', store: 'O2_Store', x: 17, y: 32 },
  { key: 'grow', label: 'GROW BAYS', task: 'TENDING', store: 'Biomass_Store', x: 50, y: 24 },
  { key: 'co2', label: 'CO₂ SCRUBBER', task: 'SCRUBBING', store: 'CO2_Store', x: 83, y: 32 },
  { key: 'reactor', label: 'REACTOR', task: 'MONITORING', store: 'General_Power_Store', x: 17, y: 74 },
  { key: 'galley', label: 'GALLEY', task: 'PREPPING', store: 'Food_Store', x: 50, y: 84 },
  { key: 'water', label: 'WATER RECLAIM', task: 'RECYCLING', store: 'Potable_Water_Store', x: 83, y: 74 },
];

type Phase = 'walk' | 'work';
type CrewMember = {
  id: number; accent: string; station: number;
  x: number; y: number; facing: 1 | -1;
  phase: Phase; since: number; dur: number;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const spotAt = (s: Station) => ({ x: s.x + rand(-7, 7), y: s.y + rand(2, 11) });

function pickStation(hot: Set<number>): number {
  // Faulty systems pull crew in hard — that's where the work is.
  if (hot.size && Math.random() < 0.7) {
    const arr = [...hot];
    return arr[Math.floor(Math.random() * arr.length)];
  }
  return Math.floor(Math.random() * STATIONS.length);
}

function spawn(count: number, now: number): CrewMember[] {
  return Array.from({ length: count }, (_, i) => {
    const station = Math.floor(Math.random() * STATIONS.length);
    const p = spotAt(STATIONS[station]);
    return {
      id: i, accent: ACCENTS[i % ACCENTS.length], station,
      x: p.x, y: p.y, facing: Math.random() > 0.5 ? 1 : -1,
      phase: 'work' as Phase, since: now - rand(0, 2000), dur: rand(2500, 5500),
    };
  });
}

function PixelAstronaut({ accent, dead, working }: { accent: string; dead: boolean; working: boolean }) {
  const suit = dead ? '#5b6470' : '#eef3f8';
  const shade = dead ? '#3c424c' : '#c2ccd8';
  const visor = dead ? '#2b2f37' : accent;
  return (
    <svg width="26" height="34" viewBox="0 0 12 16" shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated', display: 'block' }}>
      <rect x="4" y="0" width="4" height="1" fill={suit} />
      <rect x="3" y="1" width="6" height="5" fill={suit} />
      <rect x="4" y="2" width="4" height="2" fill={visor} />
      <rect x="4" y="2" width="1" height="2" fill="#ffffff" opacity="0.7" />
      <rect x="3" y="6" width="6" height="5" fill={suit} />
      <rect x="5" y="7" width="2" height="2" fill={visor} />
      {working && !dead ? (
        <>
          <rect x="2" y="5" width="1" height="2" fill={suit} />
          <rect x="9" y="5" width="1" height="2" fill={suit} />
          <rect x="2" y="6" width="1" height="2" fill={suit} />
          <rect x="9" y="6" width="1" height="2" fill={suit} />
        </>
      ) : (
        <>
          <rect x="2" y="6" width="1" height="4" fill={suit} />
          <rect x="9" y="6" width="1" height="4" fill={suit} />
        </>
      )}
      <rect x="4" y="11" width="1" height="4" fill={suit} />
      <rect x="7" y="11" width="1" height="4" fill={suit} />
      <rect x="4" y="15" width="1" height="1" fill={shade} />
      <rect x="7" y="15" width="1" height="1" fill={shade} />
    </svg>
  );
}

// A tiny pixel wrench held up while repairing.
function Wrench() {
  return (
    <svg width="12" height="12" viewBox="0 0 6 6" shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated', position: 'absolute', top: -2, right: -7, zIndex: 5,
        transformOrigin: 'bottom left', animation: 'wrenchSwing 0.4s steps(2,end) infinite' }}>
      <rect x="0" y="0" width="2" height="2" fill="#ffd166" />
      <rect x="1" y="1" width="3" height="1" fill="#cfd6df" />
      <rect x="2" y="2" width="2" height="2" fill="#cfd6df" />
      <rect x="3" y="3" width="2" height="2" fill="#9aa4b0" />
    </svg>
  );
}

export function CrewYard({
  crewSize, alive, sol, hot = [],
}: {
  crewSize: number; alive: boolean; sol: number; hot?: string[];
}) {
  const now0 = useRef(Date.now()).current;
  const [crew, setCrew] = useState<CrewMember[]>(() => spawn(crewSize, now0));
  const sizeRef = useRef(crewSize);
  const hotRef = useRef<Set<number>>(new Set());
  const prevHotRef = useRef<Set<number>>(new Set());
  const [restored, setRestored] = useState<Record<number, number>>({}); // stationIdx -> expiry ms

  hotRef.current = useMemo(() => {
    const set = new Set<number>();
    STATIONS.forEach((s, i) => { if (hot.includes(s.store)) set.add(i); });
    return set;
  }, [hot]);

  // Detect fault->recovery transitions to flash a RESTORED badge.
  useEffect(() => {
    const cur = hotRef.current;
    const prev = prevHotRef.current;
    const now = Date.now();
    const flash: Record<number, number> = {};
    prev.forEach((i) => { if (!cur.has(i)) flash[i] = now + 3800; });
    if (Object.keys(flash).length) setRestored((r) => ({ ...r, ...flash }));
    prevHotRef.current = new Set(cur);
  }, [hot]);

  useEffect(() => {
    if (sizeRef.current !== crewSize) {
      sizeRef.current = crewSize;
      setCrew(spawn(crewSize, Date.now()));
    }
  }, [crewSize]);

  useEffect(() => {
    if (!alive) return;
    const iv = window.setInterval(() => {
      const now = Date.now();
      setCrew((prev) =>
        prev.map((c) => {
          if (now - c.since < c.dur) return c;
          if (c.phase === 'walk') {
            // Arrived — work longer when repairing a fault.
            const repairing = hotRef.current.has(c.station);
            return { ...c, phase: 'work', since: now, dur: repairing ? rand(4000, 7000) : rand(2600, 5200) };
          }
          const station = pickStation(hotRef.current);
          const p = spotAt(STATIONS[station]);
          const dist = Math.hypot(p.x - c.x, p.y - c.y);
          return {
            ...c, station, x: p.x, y: p.y, facing: p.x >= c.x ? 1 : -1,
            phase: 'walk', since: now, dur: Math.max(1500, dist * 70),
          };
        }),
      );
    }, 450);
    return () => window.clearInterval(iv);
  }, [alive]);

  const styleTag = useMemo(() => `
    @keyframes crewHop { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    @keyframes crewWork { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
    @keyframes deckScan { from { background-position-y: 0; } to { background-position-y: 26px; } }
    @keyframes spark { 0% { transform: translateY(0); opacity: 0.9; } 100% { transform: translateY(-12px); opacity: 0; } }
    @keyframes stationPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
    @keyframes faultPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
    @keyframes wrenchSwing { 0% { transform: rotate(-18deg); } 100% { transform: rotate(20deg); } }
    @keyframes repairFill { 0% { width: 10%; } 100% { width: 92%; } }
  `, []);

  const now = Date.now();

  return (
    <div style={{
      position: 'relative', height: '100%', minHeight: 300, borderRadius: 14, overflow: 'hidden',
      border: '1px solid rgba(0,255,180,0.16)',
      background: 'linear-gradient(180deg, rgba(10,20,26,0.6) 0%, rgba(6,10,14,0.95) 100%)',
      boxShadow: 'inset 0 0 60px rgba(0,0,0,0.6)',
    }}>
      <style>{styleTag}</style>

      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage:
          'repeating-linear-gradient(0deg, rgba(0,255,180,0.05) 0 1px, transparent 1px 26px),' +
          'repeating-linear-gradient(90deg, rgba(0,255,180,0.05) 0 1px, transparent 1px 26px)',
        animation: 'deckScan 6s linear infinite',
        maskImage: 'linear-gradient(180deg, transparent 0%, #000 30%, #000 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 30%, #000 100%)',
      }} />

      <div style={{
        position: 'absolute', top: 12, left: 14, fontFamily: '"Space Mono", monospace', fontSize: 11,
        letterSpacing: '0.22em', color: 'rgba(120,230,200,0.75)', textTransform: 'uppercase', zIndex: 2,
      }}>
        Habitat Deck · {alive ? `${crewSize} Crew On Shift` : 'Crew Lost'}
      </div>

      {/* STATIONS */}
      {STATIONS.map((s, i) => {
        const isHot = hotRef.current.has(i);
        const isRestored = !isHot && (restored[i] ?? 0) > now;
        const accent = isHot ? '#ff5d5d' : isRestored ? '#39ffb0' : '#39d9b0';
        return (
          <div key={s.key} style={{
            position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
            transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 1, pointerEvents: 'none',
          }}>
            <div style={{
              width: 26, height: 18, margin: '0 auto', borderRadius: 3,
              background: 'rgba(8,16,18,0.9)', border: `1px solid ${accent}${isHot ? 'aa' : '66'}`,
              boxShadow: isHot ? `0 0 16px ${accent}77` : isRestored ? `0 0 14px ${accent}66` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 14, height: 9, borderRadius: 1, background: `${accent}22`,
                border: `1px solid ${accent}55`, position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: 1, left: 1, width: 2, height: 2, borderRadius: '50%',
                  background: accent,
                  animation: `${isHot ? 'faultPulse 0.6s' : 'stationPulse 1.4s'} ease-in-out infinite`,
                }} />
              </div>
            </div>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 8.5, letterSpacing: '0.12em',
              color: isHot ? '#ff9a9a' : isRestored ? '#8affd0' : 'rgba(120,200,180,0.7)',
              marginTop: 3, whiteSpace: 'nowrap',
            }}>
              {s.label}
            </div>
            {(isHot || isRestored) && (
              <div style={{
                fontFamily: '"Space Mono", monospace', fontSize: 8, letterSpacing: '0.14em',
                color: isHot ? '#ff5d5d' : '#39ffb0', marginTop: 1, fontWeight: 700,
              }}>
                {isHot ? '⚠ FAULT' : '✓ RESTORED'}
              </div>
            )}
          </div>
        );
      })}

      {/* CREW */}
      {crew.map((c) => {
        const working = alive && c.phase === 'work';
        const repairing = working && hotRef.current.has(c.station);
        const station = STATIONS[c.station];
        return (
          <div key={c.id} style={{
            position: 'absolute', left: `${c.x}%`, top: `${c.y}%`,
            transform: `translate(-50%, -50%) scaleX(${c.facing})`,
            transition: alive
              ? `left ${c.dur}ms linear, top ${c.dur}ms linear, filter 0.8s ease, opacity 0.8s ease`
              : 'filter 0.8s ease, opacity 0.8s ease',
            filter: alive ? 'none' : 'grayscale(1) brightness(0.6)',
            opacity: alive ? 1 : 0.55, zIndex: Math.round(c.y) + 3, willChange: 'left, top',
          }}>
            {working && (
              <div style={{
                position: 'absolute', bottom: '100%', left: '50%',
                transform: `translateX(-50%) scaleX(${c.facing})`, marginBottom: 3, whiteSpace: 'nowrap',
                fontFamily: '"Space Mono", monospace', fontSize: 7.5, letterSpacing: '0.1em',
                color: repairing ? '#ff8a8a' : c.accent, textShadow: '0 1px 3px #000',
                pointerEvents: 'none', fontWeight: repairing ? 700 : 400,
              }}>
                {repairing ? 'REPAIRING' : station.task}
              </div>
            )}
            {/* repair progress bar */}
            {repairing && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 12px)', left: '50%',
                transform: `translateX(-50%) scaleX(${c.facing})`, width: 22, height: 3,
                background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', background: 'linear-gradient(90deg,#ffb000,#39ffb0)',
                  animation: 'repairFill 2.2s ease-in-out infinite',
                }} />
              </div>
            )}
            {repairing && <Wrench />}
            {working && (
              <>
                <div style={sparkStyle(repairing ? '#ffd166' : c.accent, 0)} />
                <div style={sparkStyle(repairing ? '#ff8a3d' : c.accent, 0.45)} />
                {repairing && <div style={sparkStyle('#ffd166', 0.25)} />}
              </>
            )}
            <div style={{
              position: 'absolute', left: '50%', bottom: -3, transform: 'translateX(-50%)',
              width: 18, height: 5, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', filter: 'blur(1px)',
            }} />
            <div style={{
              animation: alive
                ? `${working ? 'crewWork 0.5s' : 'crewHop 0.6s steps(2,end)'} infinite`
                : 'none',
              animationDelay: `${(c.id % 6) * 0.1}s`,
            }}>
              <PixelAstronaut accent={c.accent} dead={!alive} working={working} />
            </div>
          </div>
        );
      })}

      <div style={{
        position: 'absolute', bottom: 10, right: 14, fontFamily: '"Space Mono", monospace', fontSize: 11,
        letterSpacing: '0.18em', color: 'rgba(255,255,255,0.28)', zIndex: 2,
      }}>
        SOL {String(sol).padStart(3, '0')}
      </div>
    </div>
  );
}

function sparkStyle(accent: string, delay: number): React.CSSProperties {
  return {
    position: 'absolute', top: 2, left: delay ? '38%' : '58%', width: 2, height: 2, borderRadius: '50%',
    background: accent, animation: 'spark 0.9s ease-out infinite', animationDelay: `${delay}s`,
    pointerEvents: 'none',
  };
}

export default CrewYard;
