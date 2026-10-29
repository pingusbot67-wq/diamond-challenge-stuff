# HuskStack — Conrad Challenge 2026–27 concept dossier

> **One coconut, three ways to make water.**
> Sun at home. Fire at the hub. Rain from the sky.

HuskStack is a coconut-built water system for low-lying islands and coasts where seawater is
creeping into the only freshwater people have. It has two parts:

1. **HuskStack (home unit)** — a 1 m² flat-pack *multistage* solar still. Wicks made of coir
   (coconut fiber) and a charred-husk sun absorber turn seawater or salty well water into
   drinking water, reusing the same sunlight 3 times. No power, no chemicals. Brine is never
   dumped on the ground, and the cover catches rain in the wet season.
2. **HuskHub (village unit)** — the local coconut processor who makes the replaceable coir
   cassettes. Charring husk normally throws its heat and smoke into the air. HuskHub burns
   that smoke and uses the heat to run a 3-stage still: **about 1 liter of drinking water for
   every coconut husk charred**, on cloudy days, after cyclones, whenever the sun can't.

Track: Energy & Environment (confirm category names in the official student guide).

---

## 1. The problem (all numbers sourced)

- **Atolls run out of water in droughts.** In 2022 Kiribati declared a state of disaster
  (94,000 people in need of aid). Rain tanks — the main drinking source — ran dry, and the
  freshwater lens under Tarawa turned salty "to alarming levels" ([UNICEF][unicef-kiribati],
  [RNZ][rnz-kiribati]).
- **The backup machines break.** Tuvalu declared a public emergency in November 2022 after
  rain supplies ran out, groundwater became unsafe, and existing desalination plants broke
  down ([RNZ][rnz-tuvalu], [PINA][pina-tuvalu]).
- **A salted lens doesn't recover.** On Majuro's Laura Island, the salinized lens could not be
  restored even after heavy rain ([JIRCAS][jircas]). Over-pumping and anything that adds salt
  to the ground make it worse.
- **Coastal Bangladesh** has about 40 million coastal residents who rely on ponds, rivers and
  tube-wells. In the dry season, saltwater pushes inland ([Dialogue Earth][dialogue]).
  Pregnant women in Dacope were drinking more salt than recommended limits from water alone
  ([LSHTM][lshtm]).

**The gap:** normal filters can't remove salt. Reverse osmosis needs power and spare parts.
Rain tanks fail in exactly the droughts when they're needed most. Traditional solar stills
make only 2–3 L/m²/day, and nobody nearby makes replacement parts.

---

## 2. How HuskStack works

### Home unit (1 m² absorber + 1 m² salt tray)

```
          sunlight                               rain (wet season)
             │                                         │
   ┌─────────▼──────────── glass cover ────────────────▼──┐ → gutter → rain jerrycan
   │  charred-husk absorber (black, hot)                  │
   │  coir wick 1  ~~~ evaporates ~~~                     │
   │  [ air gap 2–3 mm ] → vapor condenses on plate 1 ──────→ fresh water channel
   │  aluminium plate 1 (condensing heat warms wick 2)    │
   │  coir wick 2  ~~~ evaporates again ~~~               │
   │  [ air gap ] → condenses on plate 2 ───────────────────→ fresh water channel
   │  aluminium plate 2                                   │
   │  coir wick 3  ~~~ evaporates a third time ~~~        │
   │  [ air gap ] → condenses on plate 3 (cooled by air) ───→ fresh water channel
   └──────────────────────────────────────────────────────┘
   sides: coir-pith insulation board        frame: coconut wood

   seawater in → top edge of each tilted coir wick → brine drains out bottom edge
                                                   → covered salt tray → dry salt
   fresh water → TDS "salt check" light → crushed-seashell mineral cartridge → jerrycan
```

**Why stacking matters:** when vapor condenses it releases the same heat it took to evaporate
(~2.4 MJ per liter). A normal still dumps that heat into the air. HuskStack passes it
through a thin aluminium plate into the next wet coir layer, so the same sunlight evaporates
water three times. MIT proved the principle in 2020 with paper-towel wicks
([Xu et al.][mit-tmss]).

**The consumable:** the **coir cassette** (charred-husk absorber + 3 coir wick sheets) slides
out like a printer cartridge. Wicks slowly clog with salt and minerals. A fresh cassette from
the local HuskHub restores full output. Spent cassettes become biochar for poor atoll soils.

### Village unit (HuskHub)

```
dry coconut husk → retort kiln (smoke is burned, not released) → charred husk → cassettes
                         │                                                    + extra charcoal
                         └── hot flue gas → heat exchanger → 3-stage still → ~1 L water per husk
```

---

## 3. What's ours (differentiation)

Every component has a published ancestor. What's new is the combination. We searched, and no
single paper or product does what HuskStack does.

| Piece | Closest prior work | What we change |
|---|---|---|
| Multistage still | MIT TMSS 2020 (paper-towel wicks, lab/rooftop) | **Coir wicks**: ~32–42% lignin ([BioResources review][bioresources]), the reason coir rope survives seawater. Paper towels rot. No coir multistage still found. |
| Charred-husk absorber | IIT Jammu 2021 (open-air evaporator, no still) | Used as the *top stage* of a multistage still, made locally as a cassette |
| Coir wicks | Single-stage stepped still, 2021 ([ESPR][coir-wick]) | Moved into multistage, cassette format, durability tested (our experiment) |
| Pyrolysis heat → distillation | NMSU lab model, brackish groundwater ([AIChE 2014][nmsu-1], [2015][nmsu-2]) | **Coconut-husk kiln at the village processor**, tied to the cassette supply chain, seawater |
| Brine handling | Industrial zero-discharge (e.g., [SOL-BRINE][solbrine]) | Household-scale salt tray, pitched for **freshwater-lens protection** on atolls |
| Rain + still in one unit | Separate rain tanks and stills | Cover and salt-tray lid double as rain catchment, covering the seasons when the still is weak |

**The one-line spin:** *"MIT proved the physics with paper towels. We rebuilt it from coconut
waste so it survives the sea, and made the factory that makes its parts into a second water
source."*

### Twists we tested and rejected (shows judges we checked)

- **Night-time air-water harvesting with bittern-soaked coir pith.** Rejected: on an atoll,
  seawater is unlimited and *solar energy* is the bottleneck. Pulling water out of the air
  then needs the same ~2.4 MJ/L of sunlight to release it, so total output doesn't rise.
- **Coconut-oil "slippery" condenser plates.** Rejected: in a multistage still the slow step is
  vapor diffusing across the air gap, not the condensate film, so the gain is small. And oil
  ends up in drinking water.
- **Rain-powered electroporation (CocoRain).** Rejected for this project: a first-flush
  diverter plus chlorine tablets already makes roof water safe for pennies.

---

## 4. The math (every headline number, traced)

Constants: latent heat of evaporation ≈ 2.4 MJ/kg (at still temperatures). Tropical
insolation ≈ 5.5 kWh/m²/day = 19.8 MJ/m²/day on a clear day.

### 4.1 Home unit output

| Case | Calculation | Result |
|---|---|---|
| Physical ceiling, single pass | 19.8 MJ ÷ 2.4 MJ/L | 8.25 L/m²/day at 100% |
| Traditional basin still | ~30–45% efficiency | 2–3 L/m²/day |
| **HuskStack target (3 stages)** | 10 L × 2.4 MJ ÷ 19.8 MJ | **10 L/m²/day = 121% efficiency** |
| MIT TMSS (10 stages, reference) | 385% at 1 sun → 5.78 L/m²/h ([source][mit-tmss]) | ~30 L/m²/day equivalent |
| Cloudy day (3 kWh/m²) | 10.8 MJ × 1.21 ÷ 2.4 | ~5.4 L |

121% for 3 stages is conservative next to MIT's 385% with 10 stages. That leaves room for
coir's penalty and field losses.

**Coir heat penalty (the main technical risk):** a wet 2 mm coir felt conducts about
0.3–0.5 W/m·K. Heat flux per stage is about 300 W/m², so the temperature drop is
ΔT = q × t / k = 300 × 0.002 / 0.4 ≈ **1.5 °C per stage**. That's acceptable. A thick, loose
coir mat (5+ mm, dry pockets) would not be, so we use thin, needle-punched coir sheet. *Our
experiment measures this directly.*

**Water need:** 10 L/day covers drinking water for 2–3 people in a hot climate (3–4.5 L each).
Modules click together.

### 4.2 Brine (why the salt tray exists)

- Run at **65% recovery** (concentration factor ≈ 2.9). That stays below the point (~3.5–4×)
  where gypsum starts scaling the wicks.
- Daily: 10 L product ÷ 0.65 = **15.4 L feed** → **5.4 L brine** at ~100 g/L.
- Salt left per day: 15.4 L × 35 g/L ≈ **540 g** (≈ 16 kg/month).
- A covered tray evaporates ~5–6 L/m²/day in the tropics, so **~1 m² of tray** dries the daily
  brine. Nothing soaks into the ground.

### 4.3 Rain mode

Tarawa receives roughly 2,000 mm/yr (verify with Kiribati Met Service). Cover (1 m²) + salt-tray
lid (1 m²) = 2 m² → **~4,000 L/yr ≈ 11 L/day on average**, concentrated in the wet season,
when cloudy skies weaken the still. In coastal Bangladesh, salinity peaks in the sunny dry
season ([Dialogue Earth][dialogue]), so the two modes cover each other.

### 4.4 HuskHub: water per husk

| Step | Value | Basis |
|---|---|---|
| Dry husk heating value | ~18 MJ/kg | Typical biomass. Some sources report up to 22. We use the lower number. |
| Char yield × char heating value | 0.28 × 28 MJ/kg ≈ 7.8 MJ | Husk char ~27.8 MJ/kg ([MDPI][husk-char]); yield 22–31% |
| Heat released by burning the smoke | 18 − 7.8 ≈ 10 MJ/kg | Energy balance |
| Minus drying + pyrolysis heat | ≈ 8.5 MJ/kg net | ~1.5 MJ/kg for 15% moisture + process heat |
| Captured by heat exchanger | × 50% (assumption to verify) ≈ 4.3 MJ | Our kiln test measures this |
| 3-stage still, gained output ratio 2.5 | 4.3 × 2.5 ÷ 2.4 | **≈ 4.4 L per kg dry husk** |
| Dry husk per coconut | ~0.3 kg (weigh it, it's part of the test) | Husk ≈ 35% of nut weight ([BioResources][bioresources]) |
| **Water per husk** | 4.4 × 0.3 | **≈ 1.3 L → pitch "about 1 liter per husk"** |

A hub charring 200 kg of dry husk a day (~650 coconuts, small for a copra village) makes
**~880 L/day**: emergency drinking water for ~250 people, plus ~55 kg of char.

### 4.5 Cost

| Item (at scale, est.) | $ |
|---|---|
| Glass or UV-stable polycarbonate cover | 8 |
| 3 aluminium plates (0.5 mm, ~1.35 kg each) | 12 |
| Coconut-wood frame + coir-pith insulation | 8 |
| Salt tray + lid | 5 |
| Channels, tubing, jerrycan | 8 |
| First coir cassette | 3 |
| TDS light + seashell mineral cartridge | 4 |
| Assembly, packing, freight share | 10 |
| **Unit cost** | **~$58** |

- **Price:** $79 retail, $59 in bulk government/NGO contracts.
- **Cost per liter:** $79 ÷ (5 yr × 365 × ~7 L/day average) ≈ **$0.006/L** before cassettes.
- **Cassette:** $1.50 every ~3 months (the lifetime is what our test measures) → ~$6/yr per
  household.

---

## 5. Business model

**Customers**
1. **Island governments, UNICEF/Red Cross, and disaster agencies** (bulk, pre-positioned before
   droughts). These are the payers. The 2022 responses bought tanks and portable desal units
   that broke.
2. **Households** (retail, often subsidized).

**HuskHub revenue** (fixes the "pods cost cents" problem in the original pitch)
- Coir cassettes
- Hub water sold during droughts and cloudy spells, at a fraction of the bottled-water price
- Extra charcoal and biochar
- Install and repair service

**Why it lasts:** the parts that wear out are made a short walk away, by people who earn from
keeping the system running. That fixes the #1 reason water tech fails.

### Lean Canvas (draft)

| Block | Content |
|---|---|
| Problem | Seawater salting wells and lenses; rain tanks fail in drought; RO breaks with no parts; basin stills make too little |
| Customer segments | Pacific atoll governments (Kiribati, Tuvalu, Marshall Is.), coastal Bangladesh/Philippines NGOs, households |
| Unique value proposition | 3–4× a traditional still, built from coconut waste, no power, no brine dumped, parts made in the village |
| Solution | Coir multistage home still + village kiln-still hub + cassette supply chain |
| Channels | Government/NGO procurement, coconut processors as dealers, disaster pre-positioning |
| Revenue | Units ($59–79), cassettes, hub water, charcoal/biochar, service |
| Cost structure | Aluminium, glass, freight, hub kiln/still (~$3–5k est., to verify), training |
| Key metrics | L/m²/day in the field, cassette lifetime, $/L, hubs active, % of units still working at 12 months |
| Unfair advantage | Local cassette supply chain + coir durability data (ours) + hub doubles as emergency water source |

---

## 6. Competition (answer before judges ask)

| Alternative | Why HuskStack wins where it matters |
|---|---|
| Rain tanks | Run dry in drought (Kiribati 2022). HuskStack *includes* rain catchment and adds a sea-powered mode. |
| RO plants / portable RO | Need power, membranes and parts. They broke in Tuvalu 2022. HuskStack has no moving parts. |
| Basin solar stills | 2–3 L/m²/day. HuskStack targets 10. |
| MIT-type multistage still | Lab device with paper wicks and no supply chain. We add coir durability, local manufacture, brine handling and the hub. |
| Bottled water | Expensive on atolls and ships in plastic. HuskStack ≈ $0.006/L. |

---

## 7. Honest risks

1. **Coir conducts heat poorly.** Mitigation: thin needle-punched sheet; measured in our test.
2. **Salt/gypsum scaling.** Mitigation: 65% recovery cap, tilted flow-through wicks, nightly
   flush, replaceable cassette.
3. **Distillation doesn't remove volatile chemicals** (fuel, some solvents). Scope: seawater and
   salty well water, not fuel-spill water. Don't claim "removes everything."
4. **TDS light ≠ germ test.** It's a "salt check" placed *before* the mineral cartridge.
5. **Hub heat-capture efficiency (50%) is an assumption.** It's measured in our kiln test.
6. **Glass breakage / cyclone damage.** Flat-pack units can be taken down before storms.
7. **Mineral cartridge uses crushed seashell, never coral.** Coral protects atolls and is
   restricted in many Pacific countries.

---

## 8. Prototype and test plan (≈10 weeks to the January deadline)

Deadline reported as **January 7, 2027** for the Innovation Stage. **Verify in the official
student guide.**

| Weeks | Work | Output |
|---|---|---|
| 1–2 | Build three 0.25 m² test stills: **A** paper-towel wicks (MIT-style control), **B** coir-felt wicks (ours), **C** single-stage basin still (traditional control). Same absorber, plates, glass. | 3 rigs |
| 3–6 | **30-day outdoor run** on 35 g/L salt water (aquarium sea salt). Daily: liters collected, TDS, sun hours (free weather data), wick photos, salt-crust mass. | **Original data no paper has: coir vs. paper durability in a multistage still** |
| 4–7 | **Mini kiln test** (adult supervision, outdoors): small TLUD/retort can + copper-coil heat exchanger + 1–2 stage condenser. Char 2–5 kg of dry coconut husk chips; measure water out per kg and heat-capture %. Weigh 10 real husks for kg-per-coconut. | Validates "≈1 L per husk" |
| 6–8 | **Customer discovery:** 15+ interviews: Pacific Islander and Bangladeshi diaspora, WASH staff at UNICEF Pacific / Red Cross, a coconut processor. Send one water sample to a certified lab. | Quotes + evidence for the "progress" question |
| 8–10 | Innovation Brief, Lean Canvas, 60-sec video (time-lapse of the three rigs), website | Submission |

**Materials (~$150–250):** coir hanging-basket liner sheets (needle-punched coir), coco husk
chips (sold as orchid media), 0.5 mm aluminium sheet, glass/polycarbonate panes, foam or coir
board insulation, silicone, tubing, aquarium sea salt, TDS meter (~$15), kitchen scale, small
steel can kiln, copper coil.

**Success criteria:** B produces ≥ 2.5× C, and B's output on day 30 is ≥ 80% of day 1 while
A's drops more. If coir *loses*, that's still a real finding to report. Pivot the cassette
design and say so.

---

## 9. Score under our rubric

Rubric: Innovation 30%, Science 20%, Impact 20%, Business 20%, Story 10%. Caps: prior art
(≤4 if one paper already does it), physics (≤4 if a number isn't traced), cheaper alternative
(≤5 if unanswered).

| Version | Innov. | Science | Impact | Biz | Story | **Total** |
|---|---|---|---|---|---|---|
| Original HuskStill | 3 | 5 | 8 | 5 | 8 | **5.3** |
| HuskStack on paper (this doc) | 7 | 7 | 8.5 | 7 | 9 | **7.5** |
| HuskStack + 30-day data + kiln test + interviews | 7.5 | 8.5 | 8.5 | 7.5 | 9 | **≈8.1** |

The last 0.6 points come from **building and testing**, not from adding features.

---

## 10. Judge Q&A prep

- **"Isn't this just MIT's still?"** MIT proved the physics with paper towels in a lab. We
  tested whether a waste material survives seawater (data), built the supply chain that
  replaces worn parts locally, solved brine disposal for freshwater lenses, and added a fire
  mode at the village hub.
- **"Why coconut?"** Coir is ~32–42% lignin, which is why coir rope lasts in seawater. The
  husk is ~35% of every coconut, and most of it is never used. It's already in every target
  village.
- **"Cloudy days?"** Rain mode at home, fire mode at the hub.
- **"What about the brine?"** It never touches the ground. A covered tray turns it to salt.
- **"Who pays?"** Governments and relief agencies, who already spent millions on tanks and
  portable desal units in 2022.
- **"Doesn't burning husk cause smoke?"** Traditional pits do. A retort kiln burns the smoke
  as fuel, and that heat is what makes our water.
- **"How do you know it's safe?"** Certified lab test of our output, plus a TDS salt check on
  every unit.

---

## Sources

[unicef-kiribati]: https://www.unicef.org/pacificislands/stories/responding-drought-kiribati
[rnz-kiribati]: https://www.rnz.co.nz/international/pacific-news/474150/kiribati-drought-at-critical-stage-says-un-body
[rnz-tuvalu]: https://www.rnz.co.nz/international/pacific-news/478370/tuvalu-declares-state-of-public-emergency-for-ongoing-drought
[pina-tuvalu]: https://pina.com.fj/2022/11/10/as-world-gathers-for-cop27-tuvalu-declares-state-of-emergency-for-extreme-droughts/
[jircas]: https://www.jircas.go.jp/en/publication/research_results/2010_32
[dialogue]: https://dialogue.earth/en/water/saltwater-risks-womens-health-bangladesh/
[lshtm]: https://researchonline.lshtm.ac.uk/89
[mit-tmss]: https://pubs.rsc.org/en/content/articlelanding/2020/ee/c9ee04122b
[iit-jammu]: https://pubs.rsc.org/en/Content/ArticleLanding/2021/MA/D1MA00361E
[coir-wick]: https://springerlink.bibliotecabuap.elogim.com/doi/10.1007/s11356-020-12030-1
[bioresources]: https://bioresources.cnr.ncsu.edu/wp-content/uploads/2022/11/BioRes_18_1_2187_Stelte_RBS_Review_Coir_Coconut_Waste_Raw_Applications_20546.pdf
[nmsu-1]: https://aiche.org/conferences/aiche-annual-meeting/2014/proceeding/paper/30g-partial-combustion-pyrolysis-model-energy-biochar-reactor-design-1
[nmsu-2]: https://www.aiche.org/conferences/aiche-spring-meeting-and-global-congress-on-process-safety/2015/proceeding/paper/81c-design-biomass-pyrolyzer-multiple-effect-distillation-system-components-laboratory-testing-2
[solbrine]: https://webgate.ec.europa.eu/life/publicWebsite/project/LIFE09-ENV-GR-000299/development-of-an-advanced-innovative-energy-autonomous-system-for-the-treatment-of-brine-from-seawater-desalination-plants
[husk-char]: https://www.mdpi.com/2673-8783/5/4/78
[outdoor-ms]: https://link.springer.com/article/10.1007/s40820-023-01191-6
[coir-insulation]: https://eprints.whiterose.ac.uk/id/eprint/43213/2/WRRO_43213.pdf
[kiln-smoke]: https://coconutboard.gov.in/docs/news/shell24/1-PCB-Modernised-Elevated-Charcoal-Pit-Technology-for-Charcoal-production.pdf

- Drought & lens: [UNICEF Kiribati][unicef-kiribati] · [RNZ Kiribati][rnz-kiribati] ·
  [RNZ Tuvalu][rnz-tuvalu] · [PINA Tuvalu][pina-tuvalu] · [JIRCAS Majuro lens][jircas]
- Bangladesh: [Dialogue Earth][dialogue] · [LSHTM Dacope study][lshtm]
- Still physics: [MIT TMSS (EES 2020)][mit-tmss] · [IIT Jammu husk evaporator][iit-jammu] ·
  [Outdoor multistage 32 L/m²/day][outdoor-ms] · [Coir wick single-stage still][coir-wick]
- Coconut materials: [Coir/husk review][bioresources] · [Husk char heating value][husk-char] ·
  [Coir/husk insulation boards][coir-insulation]
- Pyrolysis + distillation: [NMSU 2014][nmsu-1] · [NMSU 2015][nmsu-2] ·
  [Coconut Board kiln design][kiln-smoke] · [SOL-BRINE][solbrine]
