# Mars to Table: An Integrated, Near-Closed-Loop Surface Food System

**Deliverable 1 of 6** · NASA Deep Space Food Challenge: *Mars to Table*

> **Format spec (for the submitted PDF).** Letter (8.5 × 11 in) · margins ≥ 0.5 in · single-spaced · **Arial 11** · body **≤ 5 pages** + **1 references page** · title **≤ 10 words** (the title above is 9). This markdown is the editable source; render to PDF in that format before submission. Figures are called out inline and are produced by the other deliverables (Design Layout SVG, the live dashboard, the calorie-source chart).
> **All quantitative values are representative design estimates pending human verification (Human-in-the-Loop mandate).**

---

## Abstract  *(≤ 250 words; current draft ≈ 215)*

Mars to Table is a bioregenerative, near-closed-loop food system that meets 100% of a 15-person crew's nutritional needs over a 500-sol Mars surface mission while drawing fewer than 50% of its calories from Earth. The system integrates six production pathways — vertical hydroponic staples (grain, tuber, legume), LED salad and fruiting racks, an aquaponic tilapia loop, a fungi bioreactor, a spirulina photobioreactor, and a fermentation suite — to deliver a varied, DRI-compliant 14-sol menu at 3,035 kcal per crewmember per day. In-situ production supplies roughly 66% of calories; shelf-stable Earth provisions remain enhancements (~34%), preserving a 16-percentage-point margin under the mandated 50% cap. Water and nutrients circulate through coupled recovery loops (>90% water recycle via WaterRS plus an ISRU raw-water reserve); crop residue, fish effluent, and inedible biomass return as substrate, fertigation, and compost, approaching zero edible waste. The system's distinguishing feature is an autonomous monitoring-and-control layer: a real-time dashboard and closed-loop controller that hold every resource buffer in a safe band, validated in a BioSim simulation that reached a self-sustaining equilibrium and survived a clean 500-sol run under off-nominal power and water faults. Two specialists maintain the system within a 9-hour-per-sol budget through batch processing and automation. The architecture is modular and Earth-relevant, offering a template for resilient controlled-environment food production in remote, polar, and disaster-relief settings.

---

## 1. Team & Affiliations  *(≈ 1 page in the PDF)*

> **Nick — fill this page before submission.** Required content: team name, each member's name + role + affiliation, and the two mandated roles called out explicitly: **one Food Systems Engineer** and **one Nutrition / Meal-Prep Specialist**. Note the Team Leader's eligibility (U.S. citizen/PR), and any Foreign Participant Acknowledgements if applicable. Keep to one page.

| Role | Member | Affiliation |
|---|---|---|
| Team Lead | *(TBD)* | *(TBD)* |
| **Food Systems Engineer** (mandated) | *(TBD)* | *(TBD)* |
| **Nutrition / Meal-Prep Specialist** (mandated) | *(TBD)* | *(TBD)* |
| Software / Controls | *(TBD)* | *(TBD)* |

---

## 2. The Solution — what it is

Mars to Table is a single integrated food system designed as a node *inside* the habitat's life-support architecture rather than a standalone greenhouse. It pairs **six complementary production lines** with a **circular resource layer** (water, nutrients, waste) and an **autonomous monitoring-and-control layer**, so that the same system that grows the food also recovers its water, valorizes its waste, and self-stabilizes in real time.

- **Production (variety by design).** Vertical hydroponic racks carry the calorie staples (dwarf wheat, white/sweet potato, soybean, rice, dry beans, peanut); LED racks supply fresh greens, fruiting vegetables, strawberries, and microgreens; an aquaponic loop produces tilapia and fertigates the greens; a fungi bioreactor grows mushrooms on crop residue; a spirulina photobioreactor adds dense protein and B-vitamins; and a fermentation suite produces tempeh, miso, soy sauce, kimchi, and yeast/single-cell protein. Six source classes (plant, fungi, animal, algae, microbe, plus Earth provisions) satisfy the variety mandate and remove single-point nutritional failure.
- **Nutrition.** The system delivers a DRI-compliant **3,035 kcal/crewmember/sol** (+200 kcal per EVA-hour) across a 14-sol menu with no main-dish repeats, plus two communal "feast" sols per cycle for crew morale. See Deliverable 2.
- **Circular resources.** Coupled loops recover **>90% of water** (WaterRS + an ISRU raw-water reserve), recycle nutrients through fish effluent + compost + digestate, and route inedible biomass to compost/biogas — approaching zero edible waste. See Deliverables 3 & 4.
- **Monitoring & control (our differentiator).** A real-time telemetry dashboard and a closed-loop controller hold each resource buffer (O₂, CO₂, water, food, power) in a safe band, with a durable decision log for auditability and predictive maintenance. This layer is **built and demonstrated**, not just designed — see §6 and Deliverable 6.

**[Figure 1 — System block diagram: production lines, circular loops, and the control layer as a node inside ECLSS.]**

## 3. How it is novel, sustainable, and innovative

- **Novelty:** the integration of a working **autonomous control loop + live dashboard** with the food-system design. Most concepts stop at a static architecture; ours closes the loop in software and proves stability in simulation.
- **Sustainability:** near-closed water and nutrient loops, waste valorization (crop residue → mushroom substrate; effluent → fertigation; inedible biomass → compost/biogas), and Earth provisions held to enhancements (~34% of calories) rather than necessities.
- **Innovation:** multi-pathway protein (fish, soy, fungi, algae, fermentation) gives fast-turnaround redundancy, so a single crop or bay failure never threatens nutrition or the <50%-Earth constraint.

## 4. Progress toward Earth-independence

The design's explicit objective is to make Earth food an **enhancement, not a dependency**. At ~66% in-situ calories the system already crosses the majority-local threshold with a 16-point margin under the cap, and the architecture is **evolvable**: as in-situ lines mature (precision-fermentation dairy, cellular agriculture), they drop into existing zones and the control loop re-tunes by configuration, not redesign — pushing the Earth share progressively lower on later missions. The water loop in particular is engineered to a near-closed state, the resource most expensive to resupply.

## 5. How it improves food security on Earth

Every subsystem is a **modular controlled-environment-agriculture (CEA)** unit with standardized water/power/data interfaces. The same monitoring-and-control stack that stabilizes a Mars habitat transfers directly to **remote, polar, arid, and disaster-relief** settings on Earth, where resilient local food production under intermittent power and water is exactly the problem being solved. The closed-loop water and waste design also speaks to terrestrial resource scarcity.

## 6. Proposed-technology description

| Subsystem | Technology | Maturity (TRL) | Role |
|---|---|---|---|
| Staple production | Vertical hydroponic racks | High (ISS Veggie/APH heritage) | Highest kcal/m²; soil-less |
| Fresh production | LED salad/fruiting racks | High | Morale + micronutrients |
| Animal protein | Aquaponics (tilapia) | Moderate | Protein + fertigation coupling |
| Alt-protein | Fungi bioreactor, spirulina PBR, fermentation | Moderate–High | Fast-turnaround redundancy |
| Water/nutrient loop | WaterRS recovery + ISRU raw-water reserve | Moderate | >90% recycle; near-closed |
| **Monitoring & control** | **SSE dashboard + autonomous control loop, BioSim-validated** | **Demonstrated (this team)** | **Self-stabilizing safe-band control** |

Representative envelope (crew 15): ~300 m² multi-tier grow area + ~65 m² bioreactors/processing within ~840 m³ of food-system pressurized volume (Deliverable 4); ~1,500–2,000 L/sol circulating water (>90% recycled); ~700–900 kWh/sol (LED-dominant, nuclear primary + battery backup for life-critical lines); ~18–22 kg/sol in-situ edible biomass. Power-loss fail-safe via prioritized load-shed holding aeration, cold chain, and fermenters. Full feasibility values and technology gaps are in the ConOps Appendix (Deliverable 3).

**[Figure 2 — Calorie-source split (~66% in-situ / ~34% Earth) against the 50% cap.]**
**[Figure 3 — Design Layout blueprint (Deliverable 4).]**
**[Figure 4 — Live monitoring dashboard reaching closed-loop equilibrium (Deliverable 6).]**

---

## 7. Intellectual Property Ownership Statement

All intellectual property in this submission — the food-system architecture, the 14-sol meal plan, the concept of operations, the design layout, the simulation model, and the monitoring-and-control software — is the sole property of the submitting team and its members. No third-party proprietary content is incorporated without license. The team grants NASA no ownership of this IP; consistent with the challenge rules, the team is willing to negotiate a **nonexclusive license** to NASA should it be requested. No federal grant or cooperative-agreement funds were used to develop this submission.

## 8. AI-Use Disclosure Statement

Generative AI — Anthropic Claude (Opus) via the Claude Code CLI, including a custom BioSim Model Context Protocol (MCP) integration — was used as a force multiplier across all six deliverables: drafting and structuring the written documents, generating and analyzing the BioSim simulation code, and producing data analysis and visualizations. The food-system concept, architecture, and strategic decisions originate with the team; per the Human-in-the-Loop mandate, all AI-generated outputs (nutritional figures, sourcing logic, engineering values) are reviewed and verified by the team against authoritative sources before submission, and the team bears sole responsibility for the final content.

<!-- Nick: confirm this disclosure is truthful and own it — it must match the identical statement in the meal plan §9. Judges may probe AI-originality; keep design-provenance notes showing the concept originated with the team. -->

---

## References  *(≈ 1 page in the PDF — separate from the 5-page body)*

1. NASA STD-3001, Space Flight Human-System Standard, Vol. 1 (Crew Health) & Vol. 2 (Human Factors, Habitability, and Environmental Health) — §7 food system.
2. NASA Life Support Baseline Values and Assumptions Document (BVAD).
3. NASA Human Integration Design Handbook (HIDH).
4. NASA Moon-to-Mars Architecture Definition Document.
5. National Institutes of Health, Dietary Reference Intakes (DRI).
6. Jones, H. "Going Beyond Reliability to Robustness and Resilience in Space Life Support Systems," 2021.
7. Bullard et al., Deep Space Food Challenge lessons, IAC 2025.
8. Scott Bell, *BioSim* life-support simulator — github.com/scottbell/biosim.

---

*Maps to scoring criteria: Overall — Form/Fit/Function & STD-3001 §7 adherence (200 pts); Communications & Presentation — Submission Formatting (150 pts); and frames the Operational-Protocols and Design/Feasibility buckets carried by Deliverables 2–6.*
