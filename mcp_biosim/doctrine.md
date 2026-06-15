# Survival Pilot Doctrine (auto-generated mirror)

_Version 1 · updated None_

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

## Lessons (newest first)

_None yet._
