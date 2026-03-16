// biosimMalfunctions.ts — Service layer for BioSim malfunction REST API.
//
// Provides fetch wrappers for triggering and cancelling BioSim malfunctions,
// and the scenario-to-module mapping used by habitatStore.

import { BIOSIM_BASE_URL } from '../hooks/useSimSource';

// ---------------------------------------------------------------------------
// Scenario -> BioSim module mapping
// ---------------------------------------------------------------------------

export interface BiosimMalfunctionConfig {
  moduleName: string;
  intensity: string;
  length: string;
}

export const BIOSIM_MALFUNCTION_MAP: Record<string, BiosimMalfunctionConfig> = {
  'co2-spike': { moduleName: 'VCCR', intensity: 'SEVERE_MALF', length: 'TEMPORARY_MALF' },
  'pump-failure': { moduleName: 'Grey_Water_Store', intensity: 'SEVERE_MALF', length: 'TEMPORARY_MALF' },
  'nutrient-crash': { moduleName: 'Dirty_Water_Store', intensity: 'SEVERE_MALF', length: 'TEMPORARY_MALF' },
  'power-fluctuation': { moduleName: 'Nuclear_Source', intensity: 'SEVERE_MALF', length: 'TEMPORARY_MALF' },
};

// ---------------------------------------------------------------------------
// REST API wrappers
// ---------------------------------------------------------------------------

/**
 * POST a malfunction to BioSim.
 * Returns the malfunctionID number on success, or null on failure.
 *
 * tickToOccur is only included in the request body when it's a non-zero positive number.
 */
export async function postMalfunction(
  simId: string,
  moduleName: string,
  intensity: string,
  length: string,
  tickToOccur?: number
): Promise<number | null> {
  try {
    const body: Record<string, unknown> = { intensity, length };
    if (tickToOccur !== undefined && tickToOccur > 0) {
      body.tickToOccur = tickToOccur;
    }

    const response = await fetch(
      `${BIOSIM_BASE_URL}/api/simulation/${simId}/modules/${moduleName}/malfunctions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) return null;

    const data = await response.json() as { malfunctionID: number };
    return data.malfunctionID;
  } catch {
    return null;
  }
}

/**
 * DELETE a malfunction from BioSim.
 * Returns true on success, false on failure or network error.
 */
export async function deleteMalfunction(
  simId: string,
  moduleName: string,
  malfunctionId: number
): Promise<boolean> {
  try {
    const response = await fetch(
      `${BIOSIM_BASE_URL}/api/simulation/${simId}/modules/${moduleName}/malfunctions/${malfunctionId}`,
      { method: 'DELETE' }
    );
    return response.ok;
  } catch {
    return false;
  }
}
