// PlanPanel — renders the Claude-generated habitat plan: a crop/grow-bay FARM LAYOUT
// sized to feed the crew, plus the crew's daily FOOD PLAN. Both arrive over the SSE
// `plan` event (MCP generate_farm_layout / generate_food_plan). Read-only spectator
// view, styled to match the survival dashboard.

import type { SurvivalPlanEvent } from '../../api/survival';

const GREEN = '#00ff9c';
const AMBER = '#ffb000';
const RED = '#ff3b30';

const label: React.CSSProperties = {
  fontFamily: '"Space Mono", monospace', fontSize: 10.5, letterSpacing: '0.22em',
  textTransform: 'uppercase', color: 'rgba(150,162,178,0.85)',
};
const cardStyle: React.CSSProperties = {
  flex: 1, minWidth: 280, background: 'rgba(10,13,18,0.7)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 14px',
  fontFamily: '"Space Mono", monospace',
};

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

const k = (n: number) => `${Math.round(n / 1000)}k`;

export function PlanPanel({ plan }: { plan: SurvivalPlanEvent | null }) {
  if (!plan || (!plan.farm_layout && !plan.food_plan)) return null;
  const farm = plan.farm_layout;
  const food = plan.food_plan;

  return (
    <section>
      <div style={{ ...label, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>🌱 Habitat Plan</span>
        {plan.note && (
          <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11, color: 'rgba(160,170,185,0.8)' }}>
            {plan.note}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* ── FARM LAYOUT ── */}
        {farm && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ ...label, color: GREEN }}>Farm Layout</span>
              <Badge ok={farm.feeds_crew} okText="FEEDS CREW" badText="SHORT ON KCAL" />
            </div>
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
                  <span style={{ color: GOLDLIKE, minWidth: 64, textAlign: 'right' }}>
                    {k(c.yield_kcal_per_day)} kcal
                  </span>
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

        {/* ── FOOD PLAN ── */}
        {food && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ ...label, color: GREEN }}>Crew Food Plan</span>
              <Badge ok={food.meets_target} okText="MEETS TARGET" badText="UNDER TARGET" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {food.meals.map((m, i) => (
                <div key={`${m.meal}-${i}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#eef3f8' }}>{m.meal}</span>
                    <span style={{ color: GOLDLIKE }}>{k(m.kcal)} kcal{m.protein_g ? ` · ${m.protein_g}g P` : ''}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(190,200,212,0.78)', marginTop: 1 }}>
                    {m.items.join(', ')}
                  </div>
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
    </section>
  );
}

const GOLDLIKE = '#ffd166';

function Stat({ l, v, bad = false }: { l: string; v: string; bad?: boolean }) {
  return (
    <span>
      <span style={{ color: 'rgba(150,162,178,0.7)', letterSpacing: '0.1em' }}>{l}: </span>
      <span style={{ color: bad ? RED : '#eef3f8', fontWeight: 700 }}>{v}</span>
    </span>
  );
}

export default PlanPanel;
