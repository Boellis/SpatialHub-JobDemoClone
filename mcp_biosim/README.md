# biosim MCP server — pilot the Mars habitat from Claude Code

Drive the NASA BioSim life-support simulation **as the survival bot, on your Claude
subscription** instead of the metered API. You (well, a Claude Code session) call
the tools — start a run, read telemetry, set flow rates, advance time — and keep
the 15-person crew alive as many sols as possible.

It reuses the **exact** physics and safety constraints of the deployed survival
bot (`sensor_data.survival.{biosim_control, state, config}`), so whatever strategy
wins here transfers verbatim into the API bot the judges see. Tune it free here,
ship it there.

## Why this exists

The deployed survival tab calls Claude through the paid Anthropic API. This MCP
server flips the arrows: BioSim becomes a set of **tools**, and a Claude Code
session (subscription-powered) becomes the **operator**. Zero API tokens, full
visibility into the bot's reasoning, and the best possible harness for hand-tuning
the life-support doctrine before locking it into the deployed bot.

> Note: this is an **interactive, local** tool — "fly the habitat from Claude
> Code" — not the public website demo. The deployed autonomous tab still uses the
> API (it can't borrow your subscription from a Cloud Run container).

## Setup

Requires Python 3.10+ (the MCP SDK needs it; the repo's Django venv is 3.9, so this
gets its own).

```bash
./mcp_biosim/setup.sh
mcp_biosim/.venv/bin/python -m pytest mcp_biosim/tests -q   # 9 passing
```

## Register with Claude Code

Project-scoped (auto-discovered when you open this repo):

```bash
cp .mcp.json.example .mcp.json      # .mcp.json is gitignored
# restart Claude Code, approve the "biosim" server when prompted
```

Or add it explicitly (absolute paths):

```bash
claude mcp add biosim -- \
  "$(pwd)/mcp_biosim/.venv/bin/python" "$(pwd)/mcp_biosim/server.py"
```

Override the target sim with the `BIOSIM_URL` env var (defaults to the competition
VM `http://34.66.244.62:8009`; point it at a local BioSim for offline play).

## Tools

| Tool | What it does |
|------|--------------|
| `start_run(crew_size=15, difficulty="off")` | Start a fresh `runTillCrewDeath` sim; returns initial telemetry. `difficulty`: `off` or `malfunctions`. |
| `get_status()` | Your dashboard: sols survived, alive flag, every store (pct/level/capacity/`runway_sols`/`trend`), per-resource flow `balances` (produced/consumed/net), warnings, and controllable surfaces with current rates + max ceilings. |
| `set_flows(actions)` | Apply flow changes. Each action `{module, kind, type, rates}` is clamped to `[0, max]`; unknown surfaces are rejected. Does not advance time. |
| `advance(sols=1)` | Step forward N Mars days (24 ticks each), one sol at a time, stopping at crew death. Returns telemetry + `sols_advanced_this_call`. |
| `inject_malfunction(module, intensity, length)` | Manually stress-test a module. |

Prompt: **`survival_doctrine`** — load it first; it's the life-support operating
doctrine (power-first → O2 → CO2 → water → food, steer on runway/trends).

## Example session (from Claude Code)

```
> /mcp biosim survival_doctrine          # load the doctrine
> start a survival run
  (calls start_run; reads balances — O2 net -100/tick, draining)
> raise OGS O2 production to cover the deficit, then advance 5 sols
  (set_flows OGS/producers/O2; advance 5; get_status)
> ... keep looping until ended_reason: crew_death ...
```

Score = `sols_survived` when the crew finally dies. Beat your last run.

## Controllable surfaces (server-clamped ceilings)

`Nuclear_Source` producers/Power ≤3000 · `OGS` consumers/Power ≤1000, producers/O2
≤1000 · `VCCR` consumers/Power ≤1000, producers/CO2 ≤1000 · `BiomassPS`
consumers/Power ≤400, consumers/PotableWater ≤100, producers/Biomass ≤100 ·
`Crew_Quarters_Group` consumers/Food ≤5, consumers/PotableWater ≤3.
