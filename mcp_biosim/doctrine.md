# Survival Pilot Doctrine (auto-generated mirror)

_Version 3 · updated 2026-06-15T13:03:35.128726+00:00_

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
- O2_Store boots low (~10%, below floor) every run — expected boot condition. Hold OGS at max O2 ONLY through the boot dip (~sol 0–10); O2 rebuilds past 65% by ~sol 5. Once O2 is banked, THROTTLE OGS DOWN per the potable-defense rule — never leave OGS pinned at max for the rest of the mission.
- If greywater/dirty-water recycling is lost (e.g. Grey_Water_Store malfunction), zero OGS water draw (OGS electrolyzes potable water) to protect the Potable_Water_Store reserve. Prefer defending potable over O2 production once O2 is above its band.
- OGS electrolyzes POTABLE water to make O2, so over-producing O2 silently drains potable. Never pin O2 at 100%: once O2 is in-band (>~50%), cut OGS O2 production to the minimum that holds O2 near target. Surplus O2 is the most common hidden potable sink on a long mission.
- BiomassPS draws up to 100/tick of POTABLE water — the single largest controllable potable sink. As soon as Biomass_Store is full (>=90%), throttle BiomassPS consumers/PotableWater toward minimum (keep only what steady food/biomass needs). Do this EARLY (by ~sol 30), not after potable is already low.
- Defend potable by NET FLOW, not just level. Check the Potable_Water_Store net balance every sol; if negative, act at once — lever order: (1) cut OGS O2 over-production, (2) cut BiomassPS potable draw. A tiny per-tick deficit is invisible per sol but compounds over 500 sols (~-0.5/tick drains a full reserve across the back half).

## Lessons (newest first)

- **#5** (run sim37, sol 405): Sim 37 survived 500 sols / 15 crew on difficulty=malfunctions but BREACHED the Potable_Water_Store floor (below 30% from ~sol 405, finished 11.94%). O2/Food/Power held above floor all run. Root cause was PILOTING, not physics: OGS was held at 986–1000 to pin O2 at 100% the whole mission (OGS electrolyzes potable), and BiomassPS drew up to 100/tick of potable until sol 305 even though Biomass_Store was pinned at 100%. There is NO controllable potable producer, so potable can only be defended by cutting its sinks early — surplus-O2 electrolysis and BiomassPS draw. Crew draw (3/tick) is trivial and irreducible. Fix encoded in rules: throttle OGS once O2 is banked, cut BiomassPS potable draw by ~sol 30, and watch potable NET FLOW (not just level) every sol.
- **#4** (run 189671645a81eedd, sol 154): Excess-margin note (not yet acted on): Food (min 94.4) and General_Power (min 99.6, nuclear-pinned) never came within 60pts of their floors across 154 sols. If future runs confirm this on multiple difficulty runs, their floors could be loosened. Holding conservative for now since a malfunction could change the picture and loosening frees nothing the pilot is currently constrained by.
- **#3** (run 189671645a81eedd, sol 154): First run under reserve-band doctrine on difficulty=malfunctions: all four banded stores held above floor for 154/154 sols (sols_below_floor=0 each). Potable min 76.72/floor 30, O2 min 26.65/floor 20, Food min 94.4/floor 15, Power min 99.6/floor 20. Bands held with large margin; no band changes made. Stopped by scope (sol target), crew alive — not death.
- **#2** (run 189671645a81eedd, sol 10): Difficulty malfunction near-permanently destroyed Grey_Water_Store recycling (~10,000 units lost, Grey/Dirty water floored to ~0 for the rest of the run). Survived non-lethal by zeroing OGS O2 production (OGS electrolyzes potable water) to protect the potable reserve. Potable never dropped below 76.72% vs its 30% floor. Tactic: if greywater/dirty-water recycling is lost, zero OGS water draw to defend potable.
- **#1** (run 189671645a81eedd, sol 0): O2_Store boots at ~10% every run (predictable boot condition, BELOW the 20% floor). This is expected, not an emergency: hold OGS at max O2 production from sol 0 and O2 rebuilds past 65% by ~sol 5, clearing the violation. Do not panic-divert other resources for the boot dip.
