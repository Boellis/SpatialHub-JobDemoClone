// PlanPanel — the Claude-generated habitat plan: a crop/grow-bay FARM LAYOUT sized to
// feed the crew, plus the crew's daily FOOD PLAN. The live plan arrives over the SSE
// `plan` event (MCP generate_farm_layout / generate_food_plan). An "All plans" browser
// pulls the durable, timestamped archive (/api/survival/plans) so every generated plan
// stays viewable across restarts — not just the live one. Read-only spectator view.

import { useCallback, useEffect, useState } from 'react';
import {
  fetchSurvivalPlans,
  type FarmLayout,
  type FoodPlan,
  type SurvivalPlanEvent,
  type SurvivalPlanRecord,
} from '../../api/survival';

const GREEN = '#00ff9c';
const AMBER = '#ffb000';
const RED = '#ff3b30';
const GOLDLIKE = '#ffd166';

const label: React.CSSProperties = {
  fontFamily: '"Space Mono", monospace', fontSize: 10.5, letterSpacing: '0.22em',
  textTransform: 'uppercase', color: 'rgba(150,162,178,0.85)',
};
const cardStyle: React.CSSProperties = {
  flex: 1, minWidth: 280, background: 'rgba(10,13,18,0.7)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 14px',
  fontFamily: '"Space Mono", monospace',
};

const k = (n: number) => `${Math.round(n / 1000)}k`;

function Badge({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  const c = ok ? GREEN : AMBER;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: c,
      border: `1px solid ${c}55`, background: `${c}12`, borderRadius: 7, padding: '3px 8px',
    }}>
      {ok ? `✓ ${okText}` : `! ${badText}`}
    </span>
  );
}

// Credits the crew member responsible for this plan half (config.py crew[0]/[1]).
function Author({ icon, name }: { icon: string; name: string }) {
  return (
    <div style={{ fontSize: 10, color: 'rgba(160,170,185,0.85)', letterSpacing: '0.04em', marginBottom: 10 }}>
      {icon} authored by <span style={{ color: '#dbe2ea', fontWeight: 700 }}>{name}</span>
    </div>
  );
}

function Stat({ l, v, bad = false }: { l: string; v: string; bad?: boolean }) {
  return (
    <span>
      <span style={{ color: 'rgba(150,162,178,0.7)', letterSpacing: '0.1em' }}>{l}: </span>
      <span style={{ color: bad ? RED : '#eef3f8', fontWeight: 700 }}>{v}</span>
    </span>
  );
}

// The two plan cards — reused by both the live panel and the history browser.
function PlanCards({ farm, food }: { farm: FarmLayout | null; food: FoodPlan | null }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
      {farm && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ ...label, color: GREEN }}>Farm Layout</span>
            <Badge ok={farm.feeds_crew} okText="FEEDS CREW" badText="SHORT ON KCAL" />
          </div>
          <Author icon="🌱" name="Food Systems Engineer" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {farm.crops.map((c, i) => (
              <div key={`${c.crop}-${i}`} style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 8, fontSize: 12, color: '#dbe2ea',
                padding: '5px 0', borderBottom: i === farm.crops.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ fontWeight: 700, color: '#eef3f8' }}>{c.crop}</span>
                <span style={{ flex: 1, fontSize: 10.5, color: 'rgba(150,162,178,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.zone}{c.purpose ? ` · ${c.purpose}` : ''}
                </span>
                <span style={{ color: '#7cf2ff' }}>{c.area_m2} m²</span>
                <span style={{ color: GOLDLIKE, minWidth: 64, textAlign: 'right' }}>{k(c.yield_kcal_per_day)} kcal</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'rgba(190,200,212,0.85)' }}>
            <Stat l="Area" v={`${farm.total_area_m2} m²`} />
            <Stat l="Yield" v={`${k(farm.total_kcal_per_day)} kcal/day`} />
            <Stat l="Per crew" v={`${k(farm.kcal_per_person_per_day)} / ${k(farm.crew_kcal_need_per_day / farm.crew_size)} kcal`}
              bad={!farm.feeds_crew} />
          </div>
        </div>
      )}
      {food && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ ...label, color: GREEN }}>Crew Food Plan</span>
            <Badge ok={food.meets_target} okText="MEETS TARGET" badText="UNDER TARGET" />
          </div>
          <Author icon="🍽" name="Nutrition Specialist" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {food.meals.map((m, i) => (
              <div key={`${m.meal}-${i}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: '#eef3f8' }}>{m.meal}</span>
                  <span style={{ color: GOLDLIKE }}>{k(m.kcal)} kcal{m.protein_g ? ` · ${m.protein_g}g P` : ''}</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(190,200,212,0.78)', marginTop: 1 }}>{m.items.join(', ')}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'rgba(190,200,212,0.85)' }}>
            <Stat l="Daily" v={`${k(food.total_kcal_per_day)} / ${k(food.target_kcal_per_person)} kcal`} bad={!food.meets_target} />
            <Stat l="Protein" v={`${food.total_protein_g} g`} />
            <Stat l="Crew" v={`${food.crew_size}`} />
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTs(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// One-line summary of an archived plan for the history list.
function planSummary(p: SurvivalPlanRecord): string {
  const bits: string[] = [];
  if (p.farm_layout) bits.push(`${p.farm_layout.total_area_m2} m² · ${k(p.farm_layout.total_kcal_per_day)} kcal/day${p.farm_layout.feeds_crew ? ' ✓' : ' !'}`);
  if (p.food_plan) bits.push(`menu ${k(p.food_plan.total_kcal_per_day)} kcal${p.food_plan.meets_target ? ' ✓' : ' !'}`);
  return bits.join('  ·  ') || 'empty';
}

// Modal browser over the durable plan archive (/api/survival/plans).
function PlanHistory({ onClose }: { onClose: () => void }) {
  const [plans, setPlans] = useState<SurvivalPlanRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null); // expanded plan id

  useEffect(() => {
    let alive = true;
    fetchSurvivalPlans(100)
      .then((p) => { if (alive) { setPlans(p); setOpen(p[0]?.id ?? null); } })
      .catch(() => { if (alive) setErr('Could not load the plan archive.'); });
    return () => { alive = false; };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2,4,7,0.78)', backdropFilter: 'blur(6px)', zIndex: 55, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(12,16,22,0.97)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16, boxShadow: '0 12px 60px rgba(0,0,0,0.7)',
          width: 'min(820px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          fontFamily: '"Space Mono", monospace',
        }}
      >
        <div style={{
          ...label, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>🌱 Habitat Plans — Archive{plans ? ` · ${plans.length}` : ''}</span>
          <button type="button" onClick={onClose} style={pillStyle(false)}>✕ Close</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '14px 18px' }}>
          {err ? (
            <div style={{ ...standby, color: AMBER }}>{err}</div>
          ) : !plans ? (
            <div style={standby}>Loading plan archive…</div>
          ) : plans.length === 0 ? (
            <div style={standby}>No plans have been generated yet.</div>
          ) : (
            plans.map((p) => {
              const isOpen = open === p.id;
              return (
                <div key={p.id} style={{ marginBottom: 10, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer', background: isOpen ? 'rgba(0,255,156,0.06)' : 'rgba(255,255,255,0.02)',
                      border: 'none', padding: '10px 14px', color: '#dbe2ea', fontFamily: '"Space Mono", monospace',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ color: GREEN, fontWeight: 700, fontSize: 12 }}>
                        {isOpen ? '▾' : '▸'} Sol {String(p.sol).padStart(3, '0')}
                      </span>
                      <span style={{ fontSize: 10, color: 'rgba(150,162,178,0.8)' }}>{fmtTs(p.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(190,200,212,0.8)', marginTop: 3 }}>{planSummary(p)}</div>
                    {p.note && <div style={{ fontSize: 10.5, color: 'rgba(150,162,178,0.75)', marginTop: 2 }}>{p.note}</div>}
                  </button>
                  {isOpen && (
                    <div style={{ padding: '10px 14px 14px' }}>
                      <PlanCards farm={p.farm_layout} food={p.food_plan} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function PlanPanel({ plan }: { plan: SurvivalPlanEvent | null }) {
  const [showHistory, setShowHistory] = useState(false);
  const onClose = useCallback(() => setShowHistory(false), []);
  const live = plan && (plan.farm_layout || plan.food_plan) ? plan : null;

  return (
    <section>
      <div style={{ ...label, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>🌱 Habitat Plan</span>
        {live?.note && (
          <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11, color: 'rgba(160,170,185,0.8)' }}>
            {live.note}
          </span>
        )}
        <button type="button" onClick={() => setShowHistory(true)} style={{ ...pillStyle(false), marginLeft: 'auto' }}>
          ⛁ All plans
        </button>
      </div>

      {live ? (
        <PlanCards farm={live.farm_layout} food={live.food_plan} />
      ) : (
        <div style={standby}>
          No plan generated this session — open <strong style={{ color: GREEN }}>⛁ All plans</strong> to browse the archive.
        </div>
      )}

      {showHistory && <PlanHistory onClose={onClose} />}
    </section>
  );
}

const standby: React.CSSProperties = {
  fontFamily: '"Space Mono", monospace', fontSize: 12, color: 'rgba(150,162,178,0.65)',
  border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10, padding: '14px 16px',
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: '"Space Mono", monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
    cursor: 'pointer', padding: '4px 10px', borderRadius: 7,
    border: `1px solid ${active ? 'rgba(0,255,156,0.4)' : 'rgba(255,255,255,0.14)'}`,
    background: active ? 'rgba(0,255,156,0.1)' : 'transparent',
    color: active ? GREEN : 'rgba(180,190,205,0.85)',
  };
}

export default PlanPanel;
