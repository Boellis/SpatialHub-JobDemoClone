import { mapBioSimToHabitatReadings } from "./biosimMapper";
import type { SensorReading } from "../types/habitat";

export function solEventToReadings(
  modules: Record<string, unknown>,
  history?: Record<string, Record<string, number[]>>,
): Record<string, Record<string, SensorReading>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mapBioSimToHabitatReadings(modules as any, Date.now(), history);
}
