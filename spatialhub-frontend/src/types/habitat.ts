// Placeholder type — Plan 02 will overwrite with full definition
export interface HabitatZone {
  id: number;
  zone_id: string;
  name: string;
  description: string;
  sensors: unknown[];
  thresholds: Record<string, unknown>;
  position: { x: number; y: number; z: number };
}
