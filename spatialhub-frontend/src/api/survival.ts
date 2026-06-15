const SURVIVAL_API = import.meta.env.VITE_SURVIVAL_API ?? "/api/survival";

export type SurvivalStore = { name: string; pct: number; runway_sols?: number };
export type SurvivalBalance = { resource: string; net: number };

export type SurvivalSolEvent = {
  sol: number; alive: boolean;
  modules: Record<string, unknown>;           // raw BioSim modules (fallback source for stores)
  reasoning: string;
  actions: { module: string; kind: string; type: string; desired_rates: number[] }[];
  warnings: { sensor: string; status: string }[];
  stores?: SurvivalStore[];                    // compact per-store telemetry (preferred)
  balances?: SurvivalBalance[];                // per-resource net flow (negative = draining)
  pilot?: PilotStat;                           // pilot-context gauge (est. telemetry load)
};
export type PilotStat = { tool_calls: number; est_tokens: number; budget: number };
export type SurvivalEndEvent = { sols_survived: number; ended_reason: string };
// Broadcast on pause/resume (and replayed on connect) so every screen reflects a
// paused test immediately — independent of the discrete sol telemetry.
export type SurvivalStatusEvent = { paused: boolean };

// Claude-generated habitat plan (farm layout + crew food plan), pushed via the MCP
// generate_farm_layout / generate_food_plan tools and merged into one relay slot.
export type FarmCrop = {
  crop: string; area_m2: number; yield_kcal_per_day: number; zone: string; purpose: string;
};
export type FarmLayout = {
  crew_size: number; crops: FarmCrop[]; total_area_m2: number; total_kcal_per_day: number;
  kcal_per_person_per_day: number; crew_kcal_need_per_day: number; feeds_crew: boolean;
};
export type FoodMeal = { meal: string; items: string[]; kcal: number; protein_g: number };
export type FoodPlan = {
  crew_size: number; meals: FoodMeal[]; total_kcal_per_day: number; total_protein_g: number;
  target_kcal_per_person: number; meets_target: boolean;
};
export type SurvivalPlanEvent = {
  farm_layout: FarmLayout | null; food_plan: FoodPlan | null; note: string; sol: number;
};

export function survivalStreamUrl(difficulty: "off" | "malfunctions"): string {
  return `${SURVIVAL_API}/stream?difficulty=${difficulty}`;
}
export function survivalLiveUrl(): string {
  return `${SURVIVAL_API}/live`;
}
// Authenticated control of a server-side run from the web panel. The token is the
// SURVIVAL_RELAY_TOKEN; the page is public but controls are inert without it.
export async function survivalControl(
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${SURVIVAL_API}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, data };
}

// ── Durable decision-log archive (persisted in Postgres, survives restarts) ──
export type SurvivalRunSummary = {
  run_id: string;
  difficulty: string;
  crew_size: number;
  sols_survived: number;
  ended_reason: string;
  started_at: string | null;
  ended_at: string | null;
  decision_count: number;
  in_progress: boolean;
};
export type SurvivalDecision = {
  sol: number;
  reasoning: string;
  actions: { module: string; kind: string; type: string; desired_rates: number[] }[];
  created_at: string | null;
};

// One archived habitat plan (durable, browsable independently of runs).
export type SurvivalPlanRecord = {
  id: number;
  run_id: string;
  sol: number;
  farm_layout: FarmLayout | null;
  food_plan: FoodPlan | null;
  note: string;
  created_at: string | null;
};

export async function fetchSurvivalPlans(limit = 50): Promise<SurvivalPlanRecord[]> {
  const res = await fetch(`${SURVIVAL_API}/plans?limit=${limit}`);
  if (!res.ok) throw new Error(`plans ${res.status}`);
  const body = (await res.json()) as { plans: SurvivalPlanRecord[] };
  return body.plans ?? [];
}

export async function fetchSurvivalRuns(limit = 50): Promise<SurvivalRunSummary[]> {
  const res = await fetch(`${SURVIVAL_API}/history?limit=${limit}`);
  if (!res.ok) throw new Error(`history ${res.status}`);
  const body = (await res.json()) as { runs: SurvivalRunSummary[] };
  return body.runs ?? [];
}

export async function fetchSurvivalRunLog(
  runId: string,
): Promise<{ run: SurvivalRunSummary; decisions: SurvivalDecision[] }> {
  const res = await fetch(`${SURVIVAL_API}/history/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(`run ${res.status}`);
  return (await res.json()) as { run: SurvivalRunSummary; decisions: SurvivalDecision[] };
}

export async function stopSurvival(runId: string): Promise<void> {
  await fetch(`${SURVIVAL_API}/stop`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  });
}
