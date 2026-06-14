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
};
export type SurvivalEndEvent = { sols_survived: number; ended_reason: string };

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

export async function stopSurvival(runId: string): Promise<void> {
  await fetch(`${SURVIVAL_API}/stop`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  });
}
