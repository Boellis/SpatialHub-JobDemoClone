# Mars to Table — Design Layout (Visual Blueprint)

**Deliverable 4 of 6** · NASA Deep Space Food Challenge: *Mars to Table*
Crew: 15 (incl. 1 Food Systems Engineer + 1 Nutrition/Meal-Prep Specialist) · Mission: 500 sols surface ops

> This document is the **blueprint specification** for the food system's physical layout — the labeled component inventory (organized into the rules' five Table-2 component groups), the zone-by-zone arrangement (A–E) with placement rationale, the resource-flow routing between zones, the habitat-volume justification, and crew-circulation/ergonomics notes. It is the buildable counterpart to the ConOps (Deliverable 3) and the 14-Sol Meal Plan (Deliverable 2). The accompanying top-down schematic is **`design-layout.svg`**.
> **All quantitative values are representative design estimates pending human verification (Human-in-the-Loop mandate).**

---

## 0. Design envelope (assumptions carried from the ConOps)

| Parameter | Value | Source / note |
|---|---|---|
| Crew | 15 | incl. FSE + Meal-Prep Specialist |
| Mission | 500 sols surface | — |
| Gravity | 3.71 m/s² (Mars) | sizing for rack stacking, fluid heads, ergonomics |
| Atmosphere | 8.2 psi (56.5 kPa), 34% O₂ | habitat assumed operable; food system is a node inside it |
| Temperature band | 18–27 °C | per-crop photoperiod/spectrum; humidity managed by condensate capture |
| Grow area | ~300 m² multi-tier (~120 m² floor footprint) | Zones A + B, 3-tier racks |
| Bioreactors / processing | ~65 m² | Zone C + Zone D processing line |
| Water throughput | ~1,500–2,000 L/sol circulating | **>90% recycled**; WaterRS + ISRU raw-water reserve |
| Power draw | ~700–900 kWh/sol | **LED lighting dominant**; nuclear primary, battery backup |
| In-situ edible biomass | ~18–22 kg/sol | ~66% of calories |
| Earth-provisioned food | ~3–4 kg/sol | ~34% of calories, shelf-stable |
| Inedible biomass → compost/biogas | ~5–8 kg/sol | near-zero edible waste |

**Air-revitalization framing (carried verbatim from ConOps/Appendix A2):** primary air revitalization is **mechanical OGS/VCCR**. Crop and photobioreactor CO₂/O₂ exchange is a **secondary effect that scales with canopy area** and is negligible at the modeled scale. The blueprint routes a crop-air return duct for completeness but does **not** credit it as a life-support pathway.

---

## 1. Component inventory — mapped to the rules' five Table-2 component groups

Every food-system component below is assigned to exactly one of the five mandated groups. "Zone" column ties each component to its physical home (§2). Footprints are floor footprint unless noted; multi-tier racks list floor footprint with tier count.

### Group 1 — Resource Management
*(water source + filtration/recycling; power supply/storage; nutrient tanks/media; seed & starter-culture storage; air filtration/env control)*

| # | Component | Zone | Footprint | Power / water | Inputs → Outputs |
|---|---|---|---|---|---|
| 1.1 | Water recycling skid (WaterRS: greywater treatment + condensate recovery) | E | ~6 m² | ~40–60 kWh/sol | transpiration/condensate + greywater → potable / irrigation make-up; **>90% recycle** |
| 1.2 | ISRU raw-water reserve + make-up tankage | E | ~5 m² | trickle | cached/ISRU water → charges loop, covers net make-up |
| 1.3 | Nutrient mixing & dosing station (salts + digestate + fish effluent) | E | ~4 m² | ~10 kWh/sol | salts/compost-digestate/fish effluent → balanced fertigation solution |
| 1.4 | Power distribution + battery backup (life-critical bus) | E | ~5 m² | bus for ~700–900 kWh/sol total | nuclear primary feed → prioritized loads; battery holds aeration/cold-chain/fermenters |
| 1.5 | Seed & starter-culture cold storage (seed bank + inoculum: fungi spawn, spirulina, yeast/SCP, miso/tempeh cultures) | E | ~3 m² | ~5 kWh/sol (chilled) | Earth-cached + in-situ seed-saving → propagation feed |
| 1.6 | Growing-media store (reusable substrate, fungi blocks) + dry food store | E | ~10 m² | ambient | media reuse; grain/tuber/legume dry-store (mo.) |
| 1.7 | Env-control / air-filtration interface (ties to habitat OGS/VCCR; crop-air return duct) | E↔A/B | ducting | shared w/ habitat ECLSS | CO₂ enrichment from crew+processing; **mechanical OGS/VCCR primary**, crop air secondary |

### Group 2 — Control & Operations
*(command interfaces, data monitoring center, computing)*

| # | Component | Zone | Footprint | Power / water | Inputs → Outputs |
|---|---|---|---|---|---|
| 2.1 | Monitoring & Control station (live SSE dashboard + autonomous control loop — team differentiator) | D | ~3 m² console | ~5 kWh/sol | per-store sensor telemetry → setpoint commands; durable decision log |
| 2.2 | Sensor network (O₂/CO₂, water levels, biomass, power, pH, EC, temp/RH per zone) | A–E | distributed | low | environment → telemetry stream |
| 2.3 | Edge compute + data uplink | D/E | rack unit | ~3 kWh/sol | telemetry → predictive-maintenance burn-down, auditability |

### Group 3 — Production
*(growing units, lighting, climate control, automation)*

| # | Component | Zone | Footprint (floor) | Power / water | Inputs → Outputs |
|---|---|---|---|---|---|
| 3.1 | Vertical hydroponic staple racks — dwarf wheat, white/sweet potato, rice (paddy module), soybean, peanut, dry bean (3-tier) | A | ~90 m² floor → ~270 m² grow | **LED-dominant**, bulk of 700–900 kWh/sol; bulk of irrigation flow | light/water/nutrient → grain/tuber/legume staples; residue → fungi/compost |
| 3.2 | LED salad & fruiting racks — greens, fruiting veg, root veg, cabbage, strawberry, microgreens (3-tier) | B | ~30 m² floor → ~90 m² grow incl. Zone A overlap; counts toward ~300 m² total grow | LED + fertigation | light/water/nutrient → fresh produce, morale garnish |
| 3.3 | Aquaponic tilapia loop (tanks + biofilter, couples to greens) | C | ~12 m² | aeration on battery-backed bus; recirculating | feed + fish → protein + effluent→fertigation |
| 3.4 | Fungi bioreactor (substrate blocks on crop residue) | C | ~8 m² | climate-controlled, low light | crop residue/bran/husk → mushrooms; spent block → compost |
| 3.5 | Spirulina photobioreactor | C | ~6 m² | LED + CO₂ feed | CO₂ + light + medium → spirulina paste; spent medium recycled |
| 3.6 | Fermenters — soy (tofu/tempeh/miso/soy sauce), yeast/SCP | C | ~9 m² | ~15 kWh/sol (temp-held) | soy/sugar/CO₂ + cultures → fermented protein, leavening, B-vitamins |
| 3.7 | Climate & lighting control units (photoperiod/spectrum, HVAC, humidity/condensate capture) | A/B/C | inline | part of LED-dominant draw | maintains 18–27 °C, per-crop spectrum |
| 3.8 | Harvest/seed automation (seeding & harvest robotics) | A/B | rail-mounted | low | reduces crew time; feeds processing |

### Group 4 — Food Processing
*(post-harvest prep, cleaning, packaging, storage)*

| # | Component | Zone | Footprint | Power / water | Inputs → Outputs |
|---|---|---|---|---|---|
| 4.1 | Grain mill | D | ~3 m² | ~8 kWh/sol batch | grain → flour |
| 4.2 | Press (tofu / oil) | D | ~3 m² | ~6 kWh/sol batch | soy/peanut → tofu, pressed oil; okara → mushroom feed |
| 4.3 | Wash / sanitation station (HACCP harvest sanitation) | D | ~3 m² | water draw | raw harvest → cleaned produce; trim → aquaponic/compost |
| 4.4 | Cook-chill + cold chain (batch staples, temp logging) | D | ~5 m² | battery-backed cold line | batch meals → chilled hold; CCP temperature logging |
| 4.5 | Packaging / preservation (dry, ferment hold, canning) | D | ~3 m² | low | surplus → shelf-stable; packaging → habitat recycle stream |

### Group 5 — Human Interface
*(user controls, cooking areas, meal assembly, dining)*

| # | Component | Zone | Footprint | Power / water | Inputs → Outputs |
|---|---|---|---|---|---|
| 5.1 | Galley cook line (assembly + finishing per 14-sol plan) | D | ~8 m² | cook loads | batch components → finished meals |
| 5.2 | Meal-assembly / serving counter (build-your-own grain-bowl bar for social sols) | D | ~5 m² | low | components → plated meals |
| 5.3 | Dining / communal table (Sol-7 & Sol-14 Crew Social anchors) | D | ~18 m² | ambient | seats 15; morale countermeasure |
| 5.4 | Crew control panel (guided dashboard workflows, low-skill procedures) | D | console at 2.1 | shared | crew commands → control loop |

---

## 2. Zone-by-zone layout (A–E) with placement rationale

Layout is a **linear "clean-to-dirty" gradient** along the habitat's food-system corridor, with the human/social end opposite the waste/resource end. See `design-layout.svg` for the proportioned top-down view.

### Zone A — Vertical Crop Bays *(staples)*
- **Footprint:** ~90 m² floor, 3-tier → bulk of the ~270 m² staple grow area. Split across **two isolatable bays (A1 / A2)** sharing a common aisle.
- **Contents:** grain/tuber/legume staple racks (3.1), climate/lighting (3.7), harvest automation (3.8).
- **Placement rationale:** highest power and floor demand → sited nearest the Zone-E power/water spine to minimize cable/pipe runs and LED-heat coupling to HVAC return. **Redundant staples are split across ≥2 isolatable bays** (per ConOps Slide 6/12) so a contamination or equipment loss in A1 cannot take out the staple supply; each bay has independent fertigation isolation valves.

### Zone B — Fresh & Salad Racks *(morale + micronutrients)*
- **Footprint:** ~30 m² floor, 3-tier; contributes the balance of the ~300 m² total grow area.
- **Contents:** LED salad/fruiting racks (3.2), shared climate/lighting and harvest automation.
- **Placement rationale:** **adjacent to Zone D (Galley)** so harvest-to-plate greens, strawberries, and microgreens move ≤48 h / few steps to the serving counter — the front-loaded fresh allocation for social and EVA-recovery sols (Meal Plan §2). Fast-turnover crops sit where the crew sees them daily (psychological lift).

### Zone C — Bioreactors *(protein pathways)*
- **Footprint:** ~35 m² (within the ~65 m² bioreactor/processing budget).
- **Contents:** aquaponic tilapia loop (3.3), fungi bioreactor (3.4), spirulina PBR (3.5), soy/yeast fermenters (3.6).
- **Placement rationale:** sits **between Production (A/B) and Processing (D)**. The fungi line is co-located with crop residue from A (its substrate); the aquaponic loop is plumbed to both the Zone-E nutrient station (effluent → fertigation) and the greens in B. Fermenters and PBR are clustered for shared temperature control. **Multiple protein pathways** (fish / soy / fungi / algae) provide the fast-turnaround backstops called out in the contingency playbook; each line is individually isolatable for contamination control.

### Zone D — Processing & Galley *(the human end)*
- **Footprint:** ~30 m² (processing line + galley/dining within the ~65 m² processing budget; dining table counted in the volume table §3).
- **Contents:** mill/press/wash/cook-chill/packaging (4.1–4.5), galley + assembly + dining (5.1–5.3), Monitoring & Control station + crew panel (2.1, 5.4).
- **Placement rationale:** the **galley is adjacent to Zone B fresh racks** (above) and one corridor from Zone C proteins, so the "assembly not from-scratch" batch model keeps the specialist ≤9 h/sol. The **dining/communal table anchors the clean end**, farthest from Zone E waste, satisfying food-safety separation. The control console lives here because this is where the crew already spends meal/review time.

### Zone E — Resource & Waste *(the dirty/isolatable end)*
- **Footprint:** ~25 m² (water/nutrient/power skids + composter/digester + dry storage).
- **Contents:** WaterRS skid (1.1), ISRU reserve (1.2), nutrient station (1.3), power+battery (1.4), seed/culture cold store (1.5), media + dry store (1.6), env-control/air interface (1.7), composter/digester.
- **Placement rationale:** **physically isolatable** behind a sealable bulkhead — the composter/digester and greywater inflow are the contamination-sensitive "dirty" end, kept maximally distant from dining (Zone D). Co-locating water + power + nutrients here creates a single utility spine that the production zones tap, shortening high-flow runs. Battery backup lives here so the life-critical bus (aeration, cold chain, fermenters) is fed from the source.

---

## 3. Resource-flow routing between zones

All loops are drawn as arrows in `design-layout.svg`. Routing rationale:

- **Water loop (>90% recycled, ~1,500–2,000 L/sol):** Zone E WaterRS → fertigation header → A & B racks (transpiration) → condensate capture → back to E; aquaponic recirculation stays local in C with a tap to E for treatment. Net make-up drawn from the ISRU reserve (1.2). Single high-flow spine E↔A keeps the largest pipe run shortest.
- **Nutrient loop:** Zone E nutrient station (salts + digestate + fish effluent) → fertigation to A/B; crop residue from A/B → C fungi substrate → spent block → E composter → digestate back into the nutrient station. Fish effluent from C → E (or direct to B greens via the aquaponic coupling).
- **Waste → compost/biogas (~5–8 kg/sol inedible):** all zones' inedible biomass → Zone E composter/digester → nutrients (digestate) + biogas (energy). Packaging → habitat recycle stream. Near-zero edible waste by design (Meal Plan §5).
- **Air:** habitat **OGS/VCCR (mechanical) is primary**; a crop-air return duct links A/B/C canopies to the habitat ECLSS interface (1.7) for the **secondary** CO₂/O₂ exchange — drawn dashed in the SVG to signal it is not credited as life support. CO₂ enrichment to canopies sourced from crew + processing.
- **Power (~700–900 kWh/sol, LED-dominant):** nuclear primary → Zone E distribution → LED lighting in A/B (dominant draw) and all zones; battery backup holds the life-critical bus. Prioritized load-shed sheds non-essential lighting first (ConOps Slide 6).

---

## 4. Habitat volume justification

The food system occupies a **3.0 m clear interior height** (allows 3-tier racks with service headroom under Mars 3.71 m/s² stacking). Volume = floor footprint × 3.0 m, plus utility/plenum allowance.

| Zone / element | Floor footprint | Clear height | Volume |
|---|---:|---:|---:|
| Zone A — Vertical Crop Bays (A1+A2) | ~90 m² | 3.0 m | ~270 m³ |
| Zone B — Fresh & Salad Racks | ~30 m² | 3.0 m | ~90 m³ |
| Zone C — Bioreactors | ~35 m² | 3.0 m | ~105 m³ |
| Zone D — Processing & Galley + Dining | ~30 m² | 3.0 m | ~90 m³ |
| Zone E — Resource & Waste | ~25 m² | 3.0 m | ~75 m³ |
| Circulation corridor + airlocks/bulkheads (~20% of zone floor) | ~42 m² | 3.0 m | ~126 m³ |
| Mechanical plenum / ducting / overhead utility (allowance) | — | — | ~84 m³ |
| **Total pressurized food-system volume** | **~252 m² usable floor** | — | **~840 m³** |

**Justification narrative.** The ~120 m² grow floor footprint (A+B) carrying ~300 m² of multi-tier grow area is the anchor; bioreactors/processing add ~65 m² of the productive floor, and the remainder is the human/galley, the isolatable resource/waste end, and the circulation/plenum that any pressurized module needs. At 3.0 m clear height the productive + human floor (~210 m²) yields ~630 m³; circulation and mechanical overhead bring the defensible total to **~840 m³** of pressurized food-system volume. This is the *food-system allocation* within the larger habitat, not the whole habitat. The figure is consistent with the ConOps Input Requirements (Slide 9 / Appendix A1) and is a **representative design estimate pending human verification**.

---

## 5. Crew-circulation & ergonomics notes

- **Single-loop circulation:** the corridor runs E → A → B → C → D as a clean-to-dirty gradient; crew enter at the galley (D, clean) and the waste/resource end (E) is bulkhead-isolatable, so a contamination event in E or C does not cross the dining zone.
- **Reach & rack heights:** 3-tier racks sized so the top tier is reachable without ladders at Mars-g (per ConOps Slide 13 ergonomics); harvest automation handles the highest tiers. Aisles ≥0.9 m for cart and EVA-suited transit.
- **Slip / sanitation:** wash station (4.3) and cook-chill (4.4) on bunded flooring; HACCP critical-control points across production→processing→cooking→storage (ConOps Slide 12).
- **Two-operator model:** the **Meal-Prep Specialist** works the B→D arc (harvest → assembly → dining, ~6–7 h/sol); the **FSE** works the E→A→C arc (utilities, racks, bioreactors, control loop, ~2–3 h/sol). Layout keeps each role's stations adjacent to minimize transit, holding the crew-time budget ≤9 h/sol.
- **Redundancy & evolvability:** identical rack/bioreactor modules let bays be added, removed, or swapped (ConOps Slide 14); standardized water/power/data connectors at every module; A1/A2 isolation valves give staple redundancy across ≥2 bays.

---

*Maps to scoring criteria: **Blueprint Components & Layout** (component inventory across the five Table-2 groups, §1; zone arrangement + dimensions, §2; SVG schematic) · **Circular Resource Systems** (water/nutrient/waste/air/power routing, §3) · **Human Factors** (circulation, ergonomics, two-operator model, §5) · **Form / Fit / Function** (volume justification + placement rationale relative to other habitat areas, §2–§4). All quantitative values are representative design estimates pending human verification (Human-in-the-Loop mandate).*
