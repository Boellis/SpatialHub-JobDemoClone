// Shared life-support store spec for the survival run — the single source of truth
// for which stores are shown, their labels, health-band direction, and net-flow link.
// Imported by BOTH the survival mission-control view (SurvivalView) and the habitat
// dashboard's live-test mirror (TvDashboardView) so the two screens show the SAME
// telemetry for the SAME run. `highIsBad` flips the health bands for accumulator/
// waste stores (full = danger); `ventSafe` marks flow-through byproduct buffers
// (CO₂, grey water, H₂) that overflow/vent harmlessly and always read nominal.

export type ResourceSpec = {
  name: string;
  label: string;
  primary: boolean;
  highIsBad: boolean;
  resource: string;
  ventSafe?: boolean;
};

export const RESOURCES: ResourceSpec[] = [
  { name: 'O2_Store', label: 'Oxygen', primary: true, highIsBad: false, resource: 'O2' },
  { name: 'CO2_Store', label: 'CO₂ Store', primary: true, highIsBad: true, resource: 'CO2', ventSafe: true },
  { name: 'General_Power_Store', label: 'Power', primary: true, highIsBad: false, resource: 'Power' },
  { name: 'Potable_Water_Store', label: 'Potable Water', primary: true, highIsBad: false, resource: 'PotableWater' },
  { name: 'Food_Store', label: 'Food', primary: true, highIsBad: false, resource: 'Food' },
  { name: 'Biomass_Store', label: 'Biomass', primary: false, highIsBad: false, resource: 'Biomass' },
  { name: 'Grey_Water_Store', label: 'Grey Water', primary: false, highIsBad: false, resource: 'GreyWater', ventSafe: true },
  // Raw-water reserve (crew wastewater + ISRU-extracted water) that WaterRS purifies
  // into potable. It is FEEDSTOCK, so low — not high — is the danger direction; a
  // near-full reserve is healthy (lots to purify), unlike a true waste accumulator.
  { name: 'Dirty_Water_Store', label: 'Raw Water', primary: false, highIsBad: false, resource: 'DirtyWater' },
  { name: 'H2_Store', label: 'Hydrogen', primary: false, highIsBad: false, resource: 'H2', ventSafe: true },
  { name: 'Dry_Waste_Store', label: 'Dry Waste', primary: false, highIsBad: true, resource: 'DryWaste' },
];

export const META = new Map(RESOURCES.map((r) => [r.name, r]));
