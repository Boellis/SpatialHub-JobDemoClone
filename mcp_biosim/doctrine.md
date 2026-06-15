# Survival Pilot Doctrine (auto-generated mirror)

_Version 2 · updated 2026-06-15T05:38:41.798526+00:00_

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
- O2_Store boots low (~10%, below floor) every run — expected boot condition. Hold OGS at max O2 from sol 0; O2 rebuilds past 65% by ~sol 5. Treat the boot dip as planned, not an emergency.
- If greywater/dirty-water recycling is lost (e.g. Grey_Water_Store malfunction), zero OGS water draw (OGS electrolyzes potable water) to protect the Potable_Water_Store reserve. Prefer defending potable over O2 production once O2 is above its band.

## Lessons (newest first)

- **#4** (run 189671645a81eedd, sol 154): Excess-margin note (not yet acted on): Food (min 94.4) and General_Power (min 99.6, nuclear-pinned) never came within 60pts of their floors across 154 sols. If future runs confirm this on multiple difficulty runs, their floors could be loosened. Holding conservative for now since a malfunction could change the picture and loosening frees nothing the pilot is currently constrained by.
- **#3** (run 189671645a81eedd, sol 154): First run under reserve-band doctrine on difficulty=malfunctions: all four banded stores held above floor for 154/154 sols (sols_below_floor=0 each). Potable min 76.72/floor 30, O2 min 26.65/floor 20, Food min 94.4/floor 15, Power min 99.6/floor 20. Bands held with large margin; no band changes made. Stopped by scope (sol target), crew alive — not death.
- **#2** (run 189671645a81eedd, sol 10): Difficulty malfunction near-permanently destroyed Grey_Water_Store recycling (~10,000 units lost, Grey/Dirty water floored to ~0 for the rest of the run). Survived non-lethal by zeroing OGS O2 production (OGS electrolyzes potable water) to protect the potable reserve. Potable never dropped below 76.72% vs its 30% floor. Tactic: if greywater/dirty-water recycling is lost, zero OGS water draw to defend potable.
- **#1** (run 189671645a81eedd, sol 0): O2_Store boots at ~10% every run (predictable boot condition, BELOW the 20% floor). This is expected, not an emergency: hold OGS at max O2 production from sol 0 and O2 rebuilds past 65% by ~sol 5, clearing the violation. Do not panic-divert other resources for the boot dip.
