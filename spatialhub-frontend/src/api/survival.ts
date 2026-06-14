const SURVIVAL_API = import.meta.env.VITE_SURVIVAL_API ?? "/api/survival";

export type SurvivalSolEvent = {
  sol: number; alive: boolean;
  modules: Record<string, unknown>;           // raw BioSim modules -> mapBioSimToHabitatReadings
  reasoning: string;
  actions: { module: string; kind: string; type: string; desired_rates: number[] }[];
  warnings: { sensor: string; status: string }[];
};
export type SurvivalEndEvent = { sols_survived: number; ended_reason: string };

export function survivalStreamUrl(difficulty: "off" | "malfunctions"): string {
  return `${SURVIVAL_API}/stream?difficulty=${difficulty}`;
}
export function survivalLiveUrl(): string {
  return `${SURVIVAL_API}/live`;
}
export async function stopSurvival(runId: string): Promise<void> {
  await fetch(`${SURVIVAL_API}/stop`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  });
}
