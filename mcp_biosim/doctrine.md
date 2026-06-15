# Survival Pilot Doctrine (auto-generated mirror)

_Version 5 · updated 2026-06-15T14:25:50.930478+00:00_

> Canonical source is `doctrine.json`. Edit there (or via the reviewer); this file is regenerated on every update. Audit/veto surface for the self-improving loop.

## Reserve bands (life-critical stores)

| Store | Floor % | Target % |
|---|---:|---:|
| Potable_Water_Store | 30 | 40 |
| O2_Store | 20 | 40 |
| Food_Store | 15 | 30 |
| General_Power_Store | 20 | 40 |

## Rules

- Survival is necessary but not sufficient — hold every life-critical store inside its reserve band.
- If all store deltas == 0 AND all recoverable balances == 0 across >2 sols, the engine has stalled — report it, do not treat it as equilibrium.
- O2_Store boots low (~10%, below floor) every run — expected boot condition. Hold OGS at max O2 ONLY through the boot dip (~sol 0–10); O2 rebuilds past 65% by ~sol 5. Once O2 is banked, throttle OGS down — never leave it pinned at max all mission.
- Potable is defended by the Water_RS purification loop fed from the raw-water (Dirty_Water_Store) reserve, which ISRU keeps stocked. Water_RS produces ~1.383/tick potable vs the ~0.556/tick crew draw, so potable RECOVERS to ~100% and pins there — independent of any Grey_Water_Store malfunction. Water_RS runs on its config default; driving Water_RS producers/PotableWater up is the lever if potable ever trends down.
- OGS electrolyzes potable to make O2, but ONLY while actually producing O2 — it idles (≈0 potable draw) once O2_Store is full. Surplus-O2 electrolysis is therefore a minor, self-limiting potable sink; the real potable system is ISRU + Water_RS.
- BiomassPS draws up to 100/tick of potable. Once Biomass_Store is full (>=90%), throttle BiomassPS consumers/PotableWater toward minimum — it is feeding biomass that is already maxed.
- Defend potable by NET FLOW, not just level — check the Potable_Water_Store net balance every sol. With ISRU+Water_RS the steady net is positive; if it goes negative, raise Water_RS potable production, then cut BiomassPS potable draw.

## Lessons (newest first)

- **#7** (run isru-fix, sol 0): RESOLVED the potable wall (sims 37/38/40 breached at sol 366–450). Two root causes, both fixed: (1) the habitat config had NO water recovery system — added a WaterRS module (consumes dirty+grey+power, produces potable). (2) WaterRS alone still starved because the grey-water malfunction destroys its feedstock and the crew's recoverable wastewater is less than its draw (irreducible ~-0.556/tick). Fix: model Mars water ISRU as a large raw-water reserve in Dirty_Water_Store (cap/level 50000, ~15k sols of feedstock) that WaterRS purifies continuously. Verified live over 120 sols with malfunctions every 10 sols: WaterRS holds a steady 1.383/tick, potable dips then RECOVERS to 100% and pins. Clean 500-sol mission with all four bands held is now achievable, independent of the grey-water malfunction. Frontend relabels Dirty_Water as 'Raw Water' (feedstock; low-is-bad) so a full reserve reads healthy. Note: the live MCP server must be RESTARTED for the pilot to manually drive Water_RS — but the win does not require it (Water_RS is on by config default).
- **#6** (run config-fix, sol 0): ROOT CAUSE of the sim 37/38 potable breaches: the habitat config shipped with NO Water Recovery System. Crew + BiomassPS produced grey/dirty water every tick but nothing reclaimed it, so potable was a ONE-WAY DRAIN (irreducible ~-0.556/tick crew draw, zero production) and crossed the 30% floor at ~sol 366 no matter how the pilot flew. The earlier 'OGS electrolyzes potable -> starve OGS to defend potable' theory was a red herring: OGS only draws potable while producing O2 and idles once O2 is full. FIX: added a WaterRS module to survival.biosim (consumes dirty+grey+power, produces potable ≤100/tick) and exposed Water_RS producers/PotableWater in the control surface. Verified live against BioSim — the module is accepted and produces potable (was 0). Dirty-water reclaim is independent of the Grey_Water_Store malfunction, so potable is now defensible for a full 500-sol mission. Potable floor stays at 30%.
- **#5** (run sim37, sol 405): Sim 37 survived 500 sols / 15 crew on difficulty=malfunctions but BREACHED the Potable_Water_Store floor (below 30% from ~sol 405, finished 11.94%). O2/Food/Power held above floor all run. Root cause was PILOTING, not physics: OGS was held at 986–1000 to pin O2 at 100% the whole mission (OGS electrolyzes potable), and BiomassPS drew up to 100/tick of potable until sol 305 even though Biomass_Store was pinned at 100%. There is NO controllable potable producer, so potable can only be defended by cutting its sinks early — surplus-O2 electrolysis and BiomassPS draw. Crew draw (3/tick) is trivial and irreducible. Fix encoded in rules: throttle OGS once O2 is banked, cut BiomassPS potable draw by ~sol 30, and watch potable NET FLOW (not just level) every sol.
- **#4** (run 189671645a81eedd, sol 154): Excess-margin note (not yet acted on): Food (min 94.4) and General_Power (min 99.6, nuclear-pinned) never came within 60pts of their floors across 154 sols. If future runs confirm this on multiple difficulty runs, their floors could be loosened. Holding conservative for now since a malfunction could change the picture and loosening frees nothing the pilot is currently constrained by.
- **#3** (run 189671645a81eedd, sol 154): First run under reserve-band doctrine on difficulty=malfunctions: all four banded stores held above floor for 154/154 sols (sols_below_floor=0 each). Potable min 76.72/floor 30, O2 min 26.65/floor 20, Food min 94.4/floor 15, Power min 99.6/floor 20. Bands held with large margin; no band changes made. Stopped by scope (sol target), crew alive — not death.
- **#2** (run 189671645a81eedd, sol 10): Difficulty malfunction near-permanently destroyed Grey_Water_Store recycling (~10,000 units lost, Grey/Dirty water floored to ~0 for the rest of the run). Survived non-lethal by zeroing OGS O2 production (OGS electrolyzes potable water) to protect the potable reserve. Potable never dropped below 76.72% vs its 30% floor. Tactic: if greywater/dirty-water recycling is lost, zero OGS water draw to defend potable.
- **#1** (run 189671645a81eedd, sol 0): O2_Store boots at ~10% every run (predictable boot condition, BELOW the 20% floor). This is expected, not an emergency: hold OGS at max O2 production from sol 0 and O2 rebuilds past 65% by ~sol 5, clearing the violation. Do not panic-divert other resources for the boot dip.
