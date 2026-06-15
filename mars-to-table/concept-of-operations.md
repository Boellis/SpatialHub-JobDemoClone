# Mars to Table — Concept of Operations

**Deliverable 3 of 6** · NASA Deep Space Food Challenge: *Mars to Table*
Format: slide-deck specification + technical Appendix · Crew: 15 · Mission: 500 sols surface ops

> This document is the **content spec** for the ConOps slide deck (one `##` block ≈ one slide) followed by the required **Appendix**. It covers the eight mandated ConOps elements — Operational Protocols, Production Methodology, Input Requirements, Safety/Reliability/Resilience, Human Factors & Usability, Monitoring & Control, Resource Management, Scalability & Evolvability — across the four mission points.
> **All quantitative values are representative design estimates pending human verification (Human-in-the-Loop mandate).**

---

## Slide 1 — Title

**Mars to Table: An Integrated, Near-Closed-Loop Surface Food System**
- 15-crew · 500-sol surface mission · <50% Earth calories · 3,035 kcal/crew/day
- One line: *"A bioregenerative food system that grows, processes, and serves a complete 14-sol menu while recycling its own water, air, and waste — monitored and self-stabilizing in real time."*
- Team / logo / AI-disclosure footnote.

---

## Slide 2 — System Overview & ECLSS Coupling
**On-slide:** Block diagram — food system as a node inside the habitat, sharing mass/energy with ECLSS.
- **Inputs:** light/power (nuclear), CO₂ (crew + processing), recycled water, nutrient salts, seed/culture stock, limited Earth provisions.
- **Outputs:** edible biomass → meals; crop/process water → recovery loop (WaterRS) → potable; compost/biogas → nutrients/energy. *(Crops also exchange CO₂/O₂ with the cabin; in the BioSim model this air contribution is minor vs the mechanical OGS/VCCR and scales with canopy area — see Appendix A1/A2.)*
- **Coupling claim:** the food system *augments* ECLSS primarily through its **water** (recovery + reuse) and **nutrient/waste** loops; crop CO₂/O₂ exchange adds a secondary air contribution that grows with canopy scale, while mechanical OGS/VCCR remain the primary air revitalization in the modeled subset.
- *Ties to: Form/Fit/Function; Circular Resource Systems; STD-3001 §7.*

## Slide 3 — Operational Zones (habitat integration)
**On-slide:** Zone map (full detail in Design Layout, Deliverable 4).
- **Zone A — Vertical Crop Bays** (grain/tuber/legume staples, 3-tier racks)
- **Zone B — Fresh & Salad Racks** (greens, fruiting veg, strawberry, microgreens)
- **Zone C — Bioreactors** (aquaponic tilapia loop, fungi blocks, spirulina photobioreactor, soy/yeast fermenters)
- **Zone D — Processing & Galley** (mill, press, ferment, cook-chill, dining/communal)
- **Zone E — Resource & Waste** (water recycling, nutrient mixing, composter/digester, dry storage)
- *Ties to: Blueprint Components; Human Factors.*

---

### The Four Mission Points (Operational Protocols — 30% bucket core)

## Slide 4 — Mission Point 1: **System Startup**
**On-slide:** Timeline from crew arrival to first full-menu sol.
- **Sequence:** energize racks → charge water loop from cached/ISRU water → inoculate fermenters & aquaponics → stagger-seed crops by maturity (greens first ~3 wk, grains/tubers ~10–14 wk) → bridge with **Earth provisions at up to the 50% cap** until in-situ ramps.
- **Subsystem interactions:** lighting/HVAC commissioned before seeding; aquaponics fishless-cycled before stocking tilapia; control dashboard baselined.
- **Crew responsibilities:** FSE commissions hardware & control loop; meal specialist manages provisioned-food bridge + seeding schedule.
- **Transition out:** declared when in-situ output ≥ planned ratio for 7 consecutive sols.
- *Ties to: ConOps feasibility; Crew Responsibilities.*

## Slide 5 — Mission Point 2: **Nominal Operations**
**On-slide:** Steady-state daily/weekly cadence.
- **Daily:** automated light/climate cycles; harvest-to-order greens/fish; assembly cooking per 14-sol plan; data review.
- **Weekly batch:** mill grain, press tofu/oil, ferment (tempeh/miso/kimchi), cook-chill staples → keeps daily crew time ≤9 h.
- **Subsystem interactions:** crop CO₂/O₂ exchange with cabin (secondary), crop/process water→recovery (WaterRS)→potable, crop residue→fungi substrate & compost→nutrients, fish effluent→fertigation.
- **Crew responsibilities:** specialist ~6–7 h/sol (harvest/prep/cook/clean); FSE ~2–3 h/sol (system health, preventive maintenance).
- *Ties to: ConOps; Processing & Preparation; Crew Responsibilities.*

## Slide 6 — Mission Point 3: **Contingency Maintenance**
**On-slide:** Off-nominal playbook (the BioSim stress scenarios: power dips, water restriction, crew/metabolic variance).
- **Power interruption:** non-essential lighting sheds first; battery backup holds aquaponics aeration + fermenters + cold chain; crops tolerate short dark periods; menu shifts to stored/preserved + Earth bridge.
- **Water restriction:** tighten recycling, prioritize aquaponic + drinking loops, defer non-critical irrigation, pull from stored preserved foods.
- **Crew/metabolic variance (incl. EVA):** portion scaling + EVA supplement stock (+200 kcal/EVA-h).
- **Crop/equipment loss:** modular bay isolation; redundant staples across ≥2 bays; mushroom/algae/fermenter lines as fast-turnaround protein backstops.
- **Crew responsibilities:** FSE runs fault isolation via control dashboard alerts; specialist executes contingency menu.
- *Ties to: Operational Safety; Resilience; Safety/Reliability.*

## Slide 7 — Mission Point 4: **System Shutdown**
**On-slide:** Graceful pause / handover / end-of-cycle.
- **Planned shutdown / crew rotation handover:** preserve standing stock (dry/freeze/ferment), document loop state, safe fermenters & aquaponics, hand baseline to next crew.
- **Emergency safing:** power-down order that protects living systems longest (fish/ferments), seals food stores, prevents contamination.
- **Restart hooks:** state checkpoint so startup (MP1) can resume from a warm baseline rather than cold.
- *Ties to: ConOps completeness; Operational Safety.*

---

## Slide 8 — Production Methodology (tech + rationale)
**On-slide:** Each production line with *why chosen*.
| Tech | Outputs | Rationale |
|---|---|---|
| Vertical hydroponic racks | Grain, tuber, legume staples | Highest kcal/m²; soil-less = mass/contamination savings |
| LED salad/fruiting racks | Greens, veg, berries, microgreens | Fresh morale + micronutrients; fast turnover |
| Aquaponics (tilapia) | Animal protein + fertigation | Couples protein production to nutrient recycling |
| Fungi bioreactor | Mushrooms | Grows on crop residue; "meaty" variety; fast cycle |
| Photobioreactor | Spirulina | Dense protein/B-vitamins; CO₂ uptake |
| Fermentation | Tempeh, miso, soy sauce, kimchi, yeast/SCP | Shelf-life, flavor, B12-adjacent nutrition, waste valorization |
- *Ties to: Production Methods & Feasibility; Variety.*

## Slide 9 — Input Requirements
**On-slide:** Resource envelope (representative — see Appendix for stream values).
- **Water:** recirculating hydroponic + aquaponic loops; make-up water minimized via condensate recovery (>90% recycle target).
- **Power:** LED lighting is the dominant draw; nuclear primary, battery backup for life-critical lines.
- **Volume:** ~300 m² grow area (multi-tier) + bioreactors + processing/galley + storage (Appendix A1).
- **Raw materials:** seed/culture stock (Earth-cached + in-situ seed-saving), nutrient salts, growing media (reusable).
- **Environmental control:** photoperiod/spectrum per crop; 18–27 °C; humidity managed with condensate capture; CO₂ enrichment from crew/processing.
- *Ties to: Inputs & Environmental Control.*

## Slide 10 — Resource Management (Circular Systems)
**On-slide:** Closed-loop flow diagram.
- **Water:** transpiration→condensate→potable; greywater→treatment→irrigation; aquaponic loop reuse.
- **Nutrients:** fish effluent + compost + digestate → nutrient solution; crop residue → fungi substrate → spent block → compost.
- **Air:** crops & photobioreactor exchange CO₂/O₂ with the cabin — a *secondary* contribution (magnitude scales with canopy area); primary air revitalization is mechanical OGS/VCCR in the modeled subset.
- **Waste:** near-zero edible waste; inedible biomass → compost/biogas; packaging → habitat recycle stream.
- *Ties to: Circular Resource Systems (Design 20%); STD-3001 waste-stream requirement.*

## Slide 11 — Monitoring & Control Systems  *(team differentiator)*
**On-slide:** Screenshot of the live control dashboard + autonomous control loop.
- **Sensing:** per-store levels (O₂, CO₂, water, biomass, power), per-resource net-flow balances, crop/aquaponic environmental sensors.
- **Automation:** closed-loop controller adjusts production rates (e.g., O₂ generation, irrigation draw) to hold buffers in safe bands — *demonstrated in BioSim reaching a self-sustaining equilibrium.*
- **Data platform:** real-time SSE telemetry → web dashboard; durable decision log (every control action persisted) → auditability & predictive maintenance.
- **Predictive maintenance:** runway/burn-down per store flags shortfalls before they become failures.
- *Ties to: Monitoring & Control Systems; Operational Safety. **This is our strongest scoring asset — lead the video here.***

## Slide 12 — Safety, Reliability & Resilience
**On-slide:** Failsafes + food safety.
- **Redundancy:** staples spread across ≥2 isolatable bays; multiple protein pathways (fish/soy/fungi/algae); Earth bridge as ultimate backstop (≤50%).
- **Food safety (HACCP-style):** defined critical control points across production→processing→cooking→storage; cook-chill temperature logging; ferment pH control; harvest sanitation.
- **Power-loss failsafe:** prioritized load-shed; battery-held life-critical lines (aeration, cold chain, fermenters).
- **Reliability vs robustness vs resilience** (per Jones 2021 definitions): nominal reliability via automation; robustness via off-nominal tolerance; resilience via the contingency playbook (Slide 6).
- *Ties to: Operational Safety; Food Safety (30% bucket).*

## Slide 13 — Human Factors & Usability
**On-slide:** Crew experience.
- **Crew time:** ≤9 h/sol enforced by batch + automation; nominal ~6–7 h specialist, ~2–3 h FSE.
- **Training:** designed for operators *without* deep ag/food expertise — guided dashboard workflows, standardized procedures, low-skill assembly cooking.
- **Ergonomics & safety:** reachable rack heights, slip/sanitation design, clear emergency procedures.
- **Crew morale:** variety + 2 communal feast sols + fresh-food allocation (ties to Meal Plan psychology criterion).
- *Ties to: Human Factors & Usability; Crew Responsibilities.*

## Slide 14 — Scalability & Evolvability
**On-slide:** Growth path.
- **Modular bays:** add/remove identical rack & bioreactor units to scale crew size or output.
- **Standardized interfaces:** common water/power/data connectors across modules.
- **Evolvability:** new crop/tech lines (e.g., precision-fermentation dairy, cellular ag) drop into existing zones; control loop re-tunes via config, not redesign.
- *Ties to: Scalability & Modularity.*

## Slide 15 — Closeout
**On-slide:** Tie back to the 14-Sol Meal Plan.
- "Every dish on the 14-sol menu traces to a production line, a recycling loop, and a monitored buffer on this system."
- One-sentence terrestrial-potential hook (modular CEA for remote/disaster/polar food security).

---

# Appendix (technical reference — not new concepts)

> Per rules: clarifies slide content, demonstrates feasibility with representative input/output stream values (incl. water & power), supports the verbal presentation, addresses anticipated judge questions, and discusses technology maturity + gaps.

## A1 — Representative input/output streams (per sol, crew 15)
| Stream | Representative value | Notes |
|---|---|---|
| Total dietary energy | 45,525 kcal/sol | 3,035 × 15 |
| In-situ edible biomass | ~18–22 kg/sol | ~66% of calories |
| Earth-provisioned food | ~3–4 kg/sol | shelf-stable, ~34% of calories |
| Crop growing area | ~300 m² (multi-tier; ~120 m² floor) | + ~65 m² bioreactors/processing |
| Food-system pressurized volume | ~840 m³ | ~252 m² usable floor × ~3.0 m clear + circulation/plenum (see Deliverable 4) |
| Food-system water throughput | ~1,500–2,000 L/sol circulating | **>90% recycled**; net make-up small |
| Food-system power draw | ~700–900 kWh/sol | **LED lighting dominant**; nuclear primary |
| O₂ produced (crops) | secondary contribution; OGS remains primary | scales with canopy area; minor at the modeled 1–25 m² scale |
| CO₂ consumed (crops + PBR) | secondary contribution; VCCR remains primary | scales with canopy area; minor at the modeled 1–25 m² scale |
| Inedible biomass → compost/biogas | ~5–8 kg/sol | near-zero edible waste |

*All values are representative engineering estimates to be verified against the official submission template and the BioSim benchmark outputs.*

## A2 — BioSim-modeled subset (Deliverable 6 linkage)
The Python model validates the calorie-staple subset (wheat, white/sweet potato, soybean, greens) against BioSim modules (BiomassPS, OGS, VCCR, stores, nuclear power). The control loop demonstrated a **self-sustaining closed-loop equilibrium** (all resource balances → ~0 net) over an extended run under the malfunctions profile — evidence for the resilience and monitoring/control claims. The model's quantitative strengths are the **closed water loop** (WaterRS + ISRU reserve) and stable 500-sol life support; **air revitalization in the model is mechanical (OGS/VCCR)**. We tested enabling crop CO₂/O₂ exchange (BiomassPS air ports) at 1–25 m² and confirmed the contribution is real but negligible in BioSim's units (~0.1 mol O₂/tick at 25 m² vs OGS ~986) — so crop-driven air revitalization is presented as a design effect that scales with canopy area, not a quantitative model result. Aquaponic/fungal/algal lines are full-system design, staged per the startup protocol (Slide 4).

## A3 — Technology maturity (TRL) & gaps
| Technology | Maturity | Gap to close |
|---|---|---|
| Hydroponic CEA staples | High (ISS Veggie/APH heritage) | Scale to staple-grain volumes in partial-g |
| Aquaponics | Moderate (terrestrial mature; space unproven) | Closed-loop fish husbandry in flight |
| Fungi bioreactor | Moderate | Substrate sterility automation |
| Spirulina PBR | Moderate (ground demos) | Long-duration contamination control |
| Fermentation lines | High (terrestrial) | Process automation for low crew time |
| Autonomous monitoring/control | **Demonstrated in BioSim (this team)** | Hardware-in-the-loop validation |

## A4 — Anticipated judge questions
- *"How do you guarantee <50% Earth calories under crop failure?"* → multi-bay redundancy + fast-turnaround protein lines (fungi/algae/fermentation) + preserved buffer; Earth bridge only to the cap. (Slides 6, 12)
- *"Is 9 h/sol realistic?"* → batch + cook-chill + automation; estimate ~6–7 h nominal with margin. (Slides 5, 13; Appendix A1)
- *"Where does power come from and what if it fails?"* → nuclear primary, prioritized load-shed, battery-held life-critical lines. (Slides 9, 12)
- *"What's actually built vs designed?"* → BioSim model + autonomous control loop are built and demonstrated; full bioreactor suite is staged design. (Slide 11; A2)

---

*Maps to scoring criteria: Operational Safety · Food Safety · Crew Responsibilities · Concept of Operations · Processing & Preparation (Operational Protocols, 30% / 300 pts) — and Production Methods · Inputs/Env Control · Monitoring & Control · Circular Resource Systems · Human Factors · Scalability (Design/Feasibility, 20% / 200 pts).*
