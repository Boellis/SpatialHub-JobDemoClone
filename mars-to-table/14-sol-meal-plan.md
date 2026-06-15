# Mars to Table — 14-Sol Meal Plan

**Deliverable 2 of 6** · NASA Deep Space Food Challenge: *Mars to Table*
Crew: 15 (incl. 1 food-systems engineer + 1 nutrition/meal-prep specialist) · Mission: 500 sols surface ops

---

## 1. Design targets & hard constraints

| Constraint (per rules) | Target | How this plan meets it |
|---|---|---|
| Caloric intake | **3,035 kcal/crew/day** avg (STD-3001) | Each sol totals 3,030–3,045 kcal/person |
| EVA load | **+200 kcal / EVA-hour** above nominal | EVA-day supplements scale (see §6) |
| Earth-provisioned share | **≤ 50% of total calories** | This plan: **~37% Earth / ~63% in-situ** (§7) |
| Food sources | Multiple required (plants, fungi, animals, other) | 6 source classes (§3) |
| Supplemental items | ≤ 2 per sol | Exactly 2/sol (1 snack + 1 beverage/treat) |
| Crew time | ≤ 9 h/sol, no overtime, 2 specialists | Batch-cook + automation model (§8) |
| Plan span | Full 14 sols, 15-member crew | 14 distinct daily menus, no main-dish repeat |

**Daily macronutrient target** (≈3,035 kcal): **Protein ~120 g (16%)** · **Fat ~98 g (29%)** · **Carbohydrate ~420 g (55%)**. Aligned to DRI ranges in STD-3001 for a mixed-age/sex crew; per-crew adjustment via portion scaling and the supplement slot (§6).

---

## 2. Meal cadence & psychology

- **Standard cadence:** Breakfast / Lunch / Dinner + 2 supplements (snack + beverage/treat).
- **Communal anchors:** **Sol 7** and **Sol 14** are *Crew Social* dinners — longer, multi-course, fresh-forward menus that close each weekly cycle. Deliberate countermeasure to the "Risk of Performance Decrement … Due to an Inadequate Food System" (NASA HRR).
- **Variety rule:** no main dish repeats inside the 14-sol cycle; cuisine theme rotates daily to preserve novelty and mental wellness over the 500-sol mission (35.7 cycles).
- **Fresh allocation:** salad/microgreen/strawberry harvests are front-loaded to social and EVA-recovery sols where morale value is highest.

---

## 3. Food source palette

### 3a. In-situ (Mars-produced) — provides ~63% of calories
| Source | Class | Production system | Primary outputs |
|---|---|---|---|
| Dwarf wheat | Plant (grain) | Soil-less vertical racks | Flour → bread, pasta, flatbread, porridge |
| White potato | Plant (tuber) | Hydroponic / deep-water | Roast, mash, gnocchi, soup |
| Sweet potato | Plant (tuber) | Hydroponic | Mash, hash, roast (vit-A) |
| Rice | Plant (grain) | Flooded aeroponic paddy module | Steamed, congee, fried rice |
| Soybean | Plant (legume) | Hydroponic | **Tofu, tempeh, soy milk, miso, soy sauce, edamame, oil** |
| Peanut | Plant (legume) | Hydroponic | Butter, sauce, roasted, oil |
| Dry bean (pinto/black) | Plant (legume) | Hydroponic | Stews, refried, protein |
| Leafy greens (lettuce, kale, chard, spinach) | Plant | LED salad racks | Salads, sautés |
| Fruiting veg (tomato, pepper, cucumber) | Plant | Trellised hydroponic | Sauces, fresh, roasted |
| Root veg (carrot, radish, onion, garlic) | Plant | Hydroponic | Aromatics, sides |
| Cabbage | Plant | Hydroponic | Slaw, **kimchi (fermented)** |
| Strawberry + microgreens | Plant | LED racks | Fresh morale garnish |
| Oyster/button mushroom | **Fungi** | Substrate bioreactor (on crop residue) | "Meaty" texture, umami |
| Tilapia | **Animal** | Aquaponic loop (couples to greens) | Grilled, baked, fishcake, stew |
| Spirulina | **Algae** | Photobioreactor | Protein boost, seasoning, smoothie |
| Yeast / single-cell protein | **Microbe** | Fermenter (on sugar/CO₂) | Leavening, B-vitamins, savory paste |

### 3b. Earth-provisioned (enhancements, not necessities) — ~37% of calories
Bulk: cooking oil reserve, milk powder, hard cheese, sugar, honey, oats, almonds/walnuts, dried fruit. Prepackaged: coffee, tea, cocoa/chocolate, freeze-dried specialty meat (beef/chicken — *morale only*, ~2 sols), condiments not yet produced in-situ, vitamin/mineral supplement packs (notably **B12 & vitamin D** — critical given limited animal products), EVA electrolyte/protein powder.

> **Note on sim model:** The BioSim Python model (Deliverable 6) currently models the 5-crop calorie-staple subset (wheat, white/sweet potato, soybean, greens). The aquaponic/fungal/algal lines above are the full-system design; staged crop introduction is documented in the ConOps (Deliverable 3).

---

## 4. The 14-Sol Meal Plan

Format per sol: **Occasion — items — `kcal` — [source: I=in-situ, B=bulk-Earth, P=prepackaged-Earth]**. Quantities are per-crewmember; multiply ×15 for batch (see §8). Daily macro + in-situ % on each footer.

### Sol 1 — Mediterranean
- **Breakfast** — Wheat sourdough toast, tomato-pepper shakshuka w/ tofu scramble, soy milk — `700` [I, +B oil/salt]
- **Lunch** — Chickpea-style dry-bean & farro (wheat-berry) bowl, kale-lemon salad, tahini-peanut drizzle — `900` [I, +B oil]
- **Dinner** — Herb-baked tilapia, roasted potatoes, sautéed chard — `940` [I, +B oil]
- **Snack** — Roasted edamame + strawberries — `245` [I]
- **Beverage/Treat** — Coffee + 1 sq dark chocolate — `250` [P]
- *Daily: 3,035 kcal · P 122 g · F 97 g · C 421 g · in-situ ~66%*

### Sol 2 — East Asian
- **Breakfast** — Rice congee w/ soft tilapia flake, scallion, soy sauce — `690` [I]
- **Lunch** — Tofu & mushroom stir-fry, steamed rice, pickled radish — `905` [I, +B oil]
- **Dinner** — Soy-glazed tempeh, garlic bok-choy/kale, sweet-potato mash — `935` [I, +B honey]
- **Snack** — Spirulina-soy smoothie — `250` [I, +B milk powder]
- **Beverage/Treat** — Green tea + peanut brittle — `230` [I peanut, +B sugar]
- *Daily: 3,010 kcal · P 125 g · F 92 g · C 418 g · in-situ ~70%*

### Sol 3 — Latin / Tex-Mex
- **Breakfast** — Sweet-potato & bean hash, wheat tortilla, tomato salsa — `705` [I, +B oil]
- **Lunch** — Black-bean & rice burrito bowl, mushroom "carnitas," pepper-lime slaw — `915` [I]
- **Dinner** — Tilapia veracruz (tomato/pepper/onion), roasted potato wedges — `925` [I, +B oil]
- **Snack** — Roasted peanuts + carrot sticks — `240` [I]
- **Beverage/Treat** — Cocoa (milk powder) — `250` [P/B]
- *Daily: 3,035 kcal · P 118 g · F 95 g · C 428 g · in-situ ~68%*

### Sol 4 — American Comfort
- **Breakfast** — Wheat pancakes, strawberry compote, soy-milk yogurt — `715` [I, +B honey]
- **Lunch** — Mushroom-lentil(bean) "cheeseburger" on wheat bun, oven potato fries — `905` [I, +B cheese]
- **Dinner** — Tofu pot pie (wheat crust, carrot/pea/onion), kale salad — `930` [I, +B oil]
- **Snack** — Trail mix (peanut, dried fruit) — `255` [I, +B dried fruit]
- **Beverage/Treat** — Coffee + oat cookie — `230` [B]
- *Daily: 3,035 kcal · P 116 g · F 100 g · C 422 g · in-situ ~62%*

### Sol 5 — South Asian
- **Breakfast** — Sweet-potato & chana(bean) masala, wheat paratha — `700` [I, +B spice/oil]
- **Lunch** — Rajma (bean) dal, steamed rice, cucumber-tomato kachumber — `900` [I]
- **Dinner** — Tandoori tilapia, spinach-tofu saag, wheat naan — `940` [I, +B oil]
- **Snack** — Spiced roasted soybeans — `245` [I]
- **Beverage/Treat** — Masala chai (milk powder) — `250` [B/P]
- *Daily: 3,035 kcal · P 124 g · F 94 g · C 425 g · in-situ ~69%*

### Sol 6 — Japanese
- **Breakfast** — Miso soup, rice, grilled tilapia, pickled greens — `690` [I]
- **Lunch** — Tempeh katsu (wheat-crumb) rice bowl, cabbage slaw — `910` [I, +B oil]
- **Dinner** — Mushroom & tofu donburi, edamame, sweet-potato tempura — `930` [I, +B oil]
- **Snack** — Strawberry + microgreen salad — `235` [I]
- **Beverage/Treat** — Green tea + mochi (rice/sugar) — `245` [I, +B sugar]
- *Daily: 3,015 kcal · P 121 g · F 90 g · C 420 g · in-situ ~72%*

### Sol 7 — **Crew Social (communal anchor)**
- **Breakfast** — Fresh strawberry-microgreen bowl, wheat brioche, soy-milk latte — `710` [I, +B sugar]
- **Lunch** — Build-your-own grain bowls (rice/wheat-berry + roasted veg bar + tofu/tilapia/mushroom proteins) — `905` [I, +B oil]
- **Dinner (multi-course)** — Course 1: tomato-basil soup + bread · Course 2: whole roast tilapia + herb potatoes + glazed carrots · Course 3: strawberry shortcake (wheat, milk powder) — `975` [I, +B sugar/milk]
- **Snack** — Mixed nut & dried-fruit board — `250` [I, +B nuts/fruit]
- **Beverage/Treat** — Coffee + chocolate fondue (fresh fruit) — `230` [P, +I fruit]
- *Daily: 3,070 kcal (social surplus, intentional) · P 119 g · F 101 g · C 430 g · in-situ ~64%*

### Sol 8 — Italian
- **Breakfast** — Wheat-flour crepes, strawberry, soy ricotta — `705` [I, +B sugar]
- **Lunch** — Fresh wheat pasta, mushroom-tomato ragù, kale pesto (peanut) — `915` [I, +B oil/cheese]
- **Dinner** — Tilapia piccata, potato-spinach gnocchi, roasted peppers — `925` [I, +B oil]
- **Snack** — Caprese-style tomato + tofu "mozzarella" — `240` [I]
- **Beverage/Treat** — Espresso + biscotti (wheat/almond) — `250` [B]
- *Daily: 3,035 kcal · P 117 g · F 98 g · C 424 g · in-situ ~65%*

### Sol 9 — Middle Eastern
- **Breakfast** — Ful (bean) medames, wheat pita, tomato-cucumber — `700` [I, +B oil]
- **Lunch** — Falafel (bean) wrap, tahini-peanut sauce, cabbage-radish slaw — `905` [I, +B oil]
- **Dinner** — Tilapia & rice maqluba (layered w/ eggplant-style mushroom, carrot) — `935` [I]
- **Snack** — Spirulina-spiced roasted chickpeas(beans) — `245` [I]
- **Beverage/Treat** — Mint tea + honey-sesame bar — `250` [I/B]
- *Daily: 3,035 kcal · P 123 g · F 93 g · C 427 g · in-situ ~70%*

### Sol 10 — Korean
- **Breakfast** — Rice, kimchi (in-situ fermented), tilapia, soybean-sprout side — `695` [I]
- **Lunch** — Bibimbap (rice, sautéed greens/carrot/mushroom, tofu, gochujang-style pepper paste) — `910` [I, +B oil]
- **Dinner** — Tempeh bulgogi, steamed rice, kimchi-jjigae (tofu/mushroom) — `930` [I, +B sugar]
- **Snack** — Edamame + roasted seaweed *(in-situ algae sheet)* — `240` [I]
- **Beverage/Treat** — Barley(wheat) tea + sweet-potato cake — `250` [I, +B sugar]
- *Daily: 3,025 kcal · P 124 g · F 91 g · C 423 g · in-situ ~73%*

### Sol 11 — Southeast Asian
- **Breakfast** — Rice noodle soup, tilapia, herbs, bean sprouts — `690` [I]
- **Lunch** — Peanut-sauce tofu & veg over rice noodles, cucumber salad — `905` [I, +B oil]
- **Dinner** — Mushroom-tofu green curry (pepper/tomato), jasmine rice — `935` [I, +B milk powder for "coconut" base]
- **Snack** — Mango-style sweet-potato sticky rice — `250` [I, +B sugar]
- **Beverage/Treat** — Iced tea + peanut cookie — `230` [I/B]
- *Daily: 3,010 kcal · P 116 g · F 96 g · C 420 g · in-situ ~68%*

### Sol 12 — Hearty Stew Day (EVA-recovery friendly)
- **Breakfast** — Savory wheat porridge, mushroom, soft tilapia, greens — `710` [I]
- **Lunch** — Three-bean & barley(wheat) stew, sourdough — `900` [I, +B oil]
- **Dinner** — Tofu & root-veg cottage pie (sweet-potato top), kale — `940` [I, +B cheese]
- **Snack** — High-protein spirulina-peanut energy bar — `255` [I, +B honey]
- **Beverage/Treat** — Cocoa + freeze-dried beef jerky *(morale)* — `230` [P]
- *Daily: 3,035 kcal · P 127 g · F 99 g · C 415 g · in-situ ~60%*

### Sol 13 — Light / Brunch
- **Breakfast** — Tofu shakshuka, wheat toast, strawberry — `700` [I, +B oil]
- **Lunch** — Garden salad bowl (greens/tomato/cucumber/radish/microgreen), tilapia, wheat roll — `890` [I, +B oil]
- **Dinner** — Mushroom risotto (rice), pea/carrot, side greens — `935` [I, +B cheese]
- **Snack** — Fresh fruit + soy-yogurt parfait (wheat granola) — `255` [I, +B honey]
- **Beverage/Treat** — Coffee + sweet potato muffin — `250` [I/B]
- *Daily: 3,030 kcal · P 114 g · F 97 g · C 426 g · in-situ ~66%*

### Sol 14 — **Crew Feast (cycle close)**
- **Breakfast** — Pancake & strawberry bar, soy-milk latte — `705` [I, +B sugar]
- **Lunch** — Grazing spread: hummus(bean), flatbreads, marinated mushroom, tomato salad, tofu skewers — `900` [I, +B oil]
- **Dinner (multi-course)** — Soup → herb-roasted tilapia + dauphinoise potato (cheese) + roasted veg medley → chocolate-strawberry torte (wheat) — `975` [I, +B cheese/chocolate]
- **Snack** — Cheese & nut board w/ fresh fruit — `250` [B, +I fruit]
- **Beverage/Treat** — Specialty coffee + freeze-dried chicken slider *(morale)* — `235` [P]
- *Daily: 3,065 kcal (feast surplus, intentional) · P 120 g · F 102 g · C 428 g · in-situ ~61%*

**14-sol average: 3,035 kcal/person/day · ~66% in-situ / ~34% Earth calories** (well under the 50% Earth cap).

---

## 5. Ingredient sourcing master (source · prep · storage/preservation · waste)

| Ingredient | Source | Prep / cook | Storage / preservation | Waste handling |
|---|---|---|---|---|
| Wheat flour | In-situ vertical racks | Milled, baked/boiled | Dry-store grain (mo.); flour 4 wk | Bran → mushroom substrate; straw → compost |
| White/sweet potato | In-situ hydroponic | Roast/mash/fry | Cool dry-store 8–12 wk | Peels → compost / biogas |
| Rice | In-situ paddy module | Steamed/fried | Dry-store grain (mo.) | Husk → substrate |
| Soybean → tofu/tempeh/miso/soy sauce/oil | In-situ + fermenter | Pressed, fermented, pressed-oil | Fresh tofu 5 d; tempeh 7 d; miso/sauce mo. | Okara → mushroom feed / baking |
| Dry beans | In-situ hydroponic | Soaked, boiled | Dry-store (mo.) | Hulls → compost |
| Peanut | In-situ | Roasted, ground, pressed-oil | Dry-store (mo.) | Shells → substrate |
| Leafy greens / microgreens | In-situ LED racks | Raw / sautéed | Harvest-to-plate ≤48 h | Trim → aquaponic/compost |
| Tomato/pepper/cucumber | In-situ trellised | Raw / cooked / sauce | Fresh 1–2 wk; sauce canned mo. | Skins/seeds → compost; seed-save |
| Root veg / aromatics | In-situ | Various | Cool-store wks | Tops → stock/compost |
| Cabbage → kimchi | In-situ + ferment | Fermented | Fermented mo. | Cores → compost |
| Strawberry | In-situ LED | Fresh / compote | Fresh 5 d; jam mo. | Runners → propagation |
| Mushroom | In-situ fungi bioreactor | Sautéed/stewed | Fresh 1 wk; dried mo. | Spent block → compost |
| Tilapia | In-situ aquaponics | Grilled/baked/stewed | Fresh-harvest; brief chill | Offal → digester; water → fertigation |
| Spirulina | In-situ photobioreactor | Blended/dried | Paste 1 wk; dried mo. | Spent medium recycled |
| Yeast / SCP | In-situ fermenter | Leaven / savory paste | Refrigerated wks | Spent biomass → feed/compost |
| Oils, milk powder, cheese, sugar, honey, oats, nuts, dried fruit | **Earth bulk** | As needed | Shelf-stable mo.–yr | Packaging → recycle stream |
| Coffee, tea, cocoa/chocolate, condiments, FD meat, supplements, EVA powder | **Earth prepackaged** | Rehydrate/serve | Shelf-stable yr | Packaging → recycle stream |

---

## 6. Per-crew & EVA adjustment

- **Baseline unit is per-person/day at 3,035 kcal.** Crew variation (age/sex/mass/activity) handled by ±portion scaling of staples and the supplement slot, logged by the meal-prep specialist.
- **EVA days:** add **+200 kcal/EVA-hour** via the EVA powder + an extra energy bar (e.g., a 4-h EVA = +800 kcal → 1 extra bar + 2 powder servings). Drawn from Earth-prepackaged EVA stock to keep prep-free.
- **Micronutrient guardrails:** B12 + vitamin D supplement daily (limited animal share); iron/omega-3 supported by tilapia, spirulina, and beans; vitamin A via sweet potato/greens.

---

## 7. Calorie-source accounting (proves <50% Earth)

| | Avg kcal/person/day | Share |
|---|---:|---:|
| In-situ (Mars-produced) | ~2,003 | **~66%** |
| Earth — bulk ingredients | ~700 | ~23% |
| Earth — prepackaged | ~332 | ~11% |
| **Total Earth** | **~1,032** | **~34%** |
| **Total** | **3,035** | **100%** |

Margin to the 50%-Earth cap: **~16 percentage points** — Earth items remain enhancements, not necessities.

---

## 8. Crew-time feasibility (food-systems engineer + meal-prep specialist, ≤9 h/sol)

- **Batch + cook-chill model:** staples (grain, beans, tofu, sauces) produced in 2–3 large batches/week; daily work is assembly + finishing, not from-scratch.
- **Automation offload:** seeding/harvest robotics, automated mill/press, and the **live monitoring & control dashboard** (this repo) handle environmental control and alerting — directly the "Monitoring & Control Systems" scoring criterion.
- **Estimated specialist load:** ~6–7 h/sol nominal (harvest, prep, cook, clean), under the 9 h budget, leaving margin for contingency-maintenance sols.

---

## 9. Assumptions & AI disclosure

- Caloric/macro figures are design estimates per STD-3001 DRI ranges; **all nutrition values require human verification against the official submission template** before submission (Human-in-the-Loop mandate).
- In-situ yields assume the staged crop/aquaponic/fungal build-out detailed in the ConOps; the BioSim model (Del. 6) currently validates the calorie-staple subset.
- **AI disclosure (for Solution Summary):** "Generative AI assisted in drafting and structuring the 14-sol meal plan and sourcing tables; all nutritional figures, sourcing logic, and system-design choices were reviewed and are owned by the team."

---

*Maps to scoring criteria: 14-Sol Meal Plan · Menu Flexibility · Meal Cadence & Psychology · Nutritional Balance · Ingredient Sourcing · Variety (Meal Plan & Nutrition, 15% / 150 pts).*
