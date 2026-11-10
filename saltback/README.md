# Saltback

Saltback helps towns use less road salt without making roads less safe. A low-cost conductivity and temperature
sensor in a storm drain measures the salt washing off the road after each storm. Saltback combines that with the
truck logs and the weather, runs a physics model of how salt melts ice, works out how much salt each storm needed,
and sends the town a simple report: salt spread, how much was excess, how salty the runoff was, and how much to
use next time. Over a season it learns the route and produces a crew rate card and ranked recommendations.

**Everything here is simulated with typical published values. None of it is real town data.**

## The result (example season: 12 storms, Route 4, 10 lane-miles)

| | Value |
|---|---|
| Salt saved | **12.6%** (9 of 71 tons), likely range **9–14%** across 200 test seasons with uncertain inputs |
| Dollars saved | about **$810** at $90 per ton |
| Icy-road time | **15.6 h → 5.6 h** for the season; no storm more than 6 minutes icier than the crew's result |
| Chloride kept out of streams and soil | about **5.5 tons** |
| Split by lever | lower rates where the crew over-salted: −8.7 tons · first truck within 30 min: −0.3 tons · more salt where under-salted: 0 |
| Against a crew following a published state rate chart | Saltback uses **4% more** salt, but cuts icy time from **18.2 h to 5.6 h** |
| Next season's first step (cuts capped at 25% per storm) | **6% less** salt (4–8% across the test seasons) |
| Test seasons that got icier | **0%**; every storm stayed within 6 minutes in **91%** of them (97% for the first step) |

These replace the earlier "18% less salt, 15.6 → 4.3 h" claim. What changed and why:

1. **"Just as safe" is now enforced.** Needed salt is the smallest rate within 15 minutes of the best possible
   icy time (was 30), and Saltback's rate is raised until the road is no more than 6 minutes icier than the crew's
   result. Before, some recommendations were 20–25 minutes icier than what the crew achieved.
2. **The safety check also has to pass in a pessimistic world** (brine runs off faster, more brine is needed to
   stop snow sticking, traffic packs snow faster). Without this, the uncertainty test showed single storms getting
   much icier in 74% of plausible worlds, even though the best-estimate plan claimed 25% savings.
3. **Below 15°F Saltback recommends sand or a stronger chemical instead of more rock salt** (as state guides do),
   and it no longer counts that extra salt or claims safety gains it can't model.
4. **Storms salt can't fix** (still icy over 2 hours at the maximum rate: rain to flash freeze, arctic cold) are
   labeled as such, with no "excess" or cut.
5. **Late first trucks** are counted as their own lever, not as under-salting.

## Two ways to run it

**The website** (`web/index.html`, also published as a private claude.ai artifact): open the file in a browser; no build step.
It is a plain data-collection tool: black and white, a text sidebar, tables first. It opens on the storm log.

| Page | What it shows |
|---|---|
| Simulate winters | Pick a city, a type of winter or random, a crew habit and how many winters (e.g. 30), press Run. Shows the headline result, numbered plain-English recommendations with impact and how sure, and charts: salt per winter, savings spread, salt rate by road temperature, where the change comes from, icy road per winter |
| Device | Interactive 3D model of the drain node at real size: take apart, see inside, click any part; parts list with costs (about $313); download the printable box, lid and probe holder (.stl) or the whole model (.glb) |
| Storm log (start page) | Every storm on record with weather, trucks, salt, chloride, sensor time at limit, icy time, status and next-storm rate; "Add storm" form; season totals in one line |
| Storm reports | A small dot replay of the storm (snow, truck passes, salt landing on the road or bouncing onto the shoulder, runoff into the drain sensor) with play/pause and a time slider; then the report a town receives: status, salt spread, excess, runoff, next storm, icy time, actions, truck log, drain sensor log and salt-vs-icy-time chart; downloadable as HTML |
| Recommendations | Ranked actions with impact, confidence and the storms behind them; savings by lever; change per storm |
| Rate card | Salt per pass by road temperature and snowfall, flagged against published state ranges |
| Sensors | The drain node, calibration learned from drain data, readings per storm |
| Data | Every table as CSV or copy-paste, the raw 5-minute timeline of the selected storm, CSV import |
| Settings | Salt price, sensor range, load the simulated season or clear all storms, decision rules, model assumptions |

Storms are kept in the browser (localStorage). The page starts with a simulated 12-storm season, marked as simulated.
**Export** builds an Excel workbook with native charts that also opens in Google Sheets (File → Import → Upload);
inside claude.ai there is also "Send to Google Sheets" through the Google Drive connector.

**Google Colab** (the Python version, raw data files and a written report):

1. Open [Saltback.ipynb in Colab](https://colab.research.google.com/github/pingusbot67-wq/diamond-challenge-stuff/blob/claude/blissful-wright-uey5ta/saltback/Saltback.ipynb)
   (or download `Saltback.ipynb` and use File → Upload notebook).
2. Runtime → Run all. Move the sliders in step 2 and re-run steps 2–4.

## Files

| File | Job |
|---|---|
| `model.py` / `web/model.js` | The physics and the per-storm recommendation (identical; `python web/check_parity.py` compares them on 9 storms) |
| `simulate.py` | Runs the Python model and saves raw data to `results/` |
| `explain.py` | Turns that data into plain English (`results/report.txt`) and charts |
| `build_notebook.py` | Packs the Python files into `Saltback.ipynb` |
| `web/engine.js` | Season decisions: calibration from drain data, levers, state-chart baseline, recommendations, rate card |
| `web/report.js` | Every table the site shows and exports |
| `web/xlsx.js` | Writes .xlsx workbooks with native Excel charts (uses JSZip) |
| `web/winters.js` | Many-winters simulator: storms drawn from a place's typical weather, crew habits, random true road physics, Saltback judged in the true world, pooled recommendations |
| `web/device.js` | The 3D drain-node model (three.js, loaded only on the Device page) and the parts list |
| `device/build_parts.py` | Builds the printable parts as STL files into `web/device/` (`pip install manifold3d numpy`) |
| `web/uncertainty.js` | `node web/uncertainty.js`: 200 uncertain seasons, sensitivity, out-of-sample test → `web/uncertainty-data.js` (results quoted in this README) |
| `screenshots/` | Before and after screenshots of every page, described in `screenshots/README.md` |

## How it decides

1. Every 5 minutes: snow falls, trucks plow and salt, salt dissolves (slower when colder), brine melts ice or
   refreezes into black ice, traffic packs unprotected snow into ice, brine runs to the drain, the sensor reads it.
2. **Needed salt**: the smallest rate within 15 minutes of the best icy time any rate reaches.
3. **Saltback's rate**: needed + 10%, raised until the road is no more than 6 minutes icier than the crew's result,
   in the best estimate and in the pessimistic case.
4. **Next storm**: cut at most 25% at a time; safety increases are not capped.
5. **Salt can't fix it** if the road stays icy over 2 hours at 600 lb per lane-mile; **too cold for rock salt** below 15°F.
6. **Learning**: the drain sensor shows how much salt really reaches the drain; Saltback adjusts its estimate of how
   much bounces off the road (it recovered the hidden 28% in the example season and in an out-of-sample test).
7. **Rate card**: need + 10%, and where that is below the state chart, raised until it is no icier than the chart's
   rate even in the pessimistic case. Cells outside the published range are flagged, not hidden.

Published rate ranges are approximate, compiled from NHDOT Snow and Ice Control Operational Guidelines (2020),
the MnDOT Snow and Ice Control Handbook (2022) and UW-Madison report CR19-01 (2021).

## Simulating many winters

`web/winters.js` runs on the Simulate winters page (about 1 second per 30 winters in a browser). For each winter it
draws the storms from the chosen place (8 cities, 5 types of winter, or random), salts them the way the chosen crew
would (typical, heavy-handed, or following the state chart; first truck 1–2 hours late in some storms), draws the
true road physics from the ranges below, lets the drain sensor measure the true runoff, and has Saltback analyse the
winter from the truck log and drain data only. Its plan is then judged in the true world.

City weather values are rough illustrations (storms per winter, road temperature, snow per storm, how often the road
stays frozen afterwards), not official climate data. In these runs crews keep plowing and salting after a storm until
the road is clear, for up to 12 hours (`cleanup_h` in the model; it is 0 everywhere else, so the example season and
the numbers above are unchanged). Without it, a road that stays below freezing after a storm would count as icy for
the whole day at any salt rate.

Example (Boston, typical crew, 100 lane-miles, 30 winters, seed 1): about 22% less salt (5–39% in most winters),
icy road 45 h → 24 h a winter, no winter icier overall, but one storm more than 6 minutes icier in 23% of winters.
In cold places (Minneapolis) Saltback uses more salt than a typical crew, mostly because getting the first truck out
on time means more passes, in exchange for much less icy road; the page says so instead of hiding it.

## The device

The Device page shows the drain node in 3D at real size: a 3D-printed box (150 × 100 × 70 mm) on a stainless bracket
just below the grate, with an ESP32, an LTE-M modem, a clock, a memory card and three 18650 cells inside, and three
probes (standard and high-range conductivity, temperature) in a drilled PVC guard tube in the sump. The box, lid and
probe holder are real printable STL files made by `device/build_parts.py`; measure your probes before printing the
holder. Prices are approximate; check before buying.

## How confident are we?

`node web/uncertainty.js` re-runs the season 200 times with the five least-certain inputs drawn at random
(brine needed to stop bonding 0.02–0.06 mm, bonding speed 0.25–1 per hour, drain dilution 15–50%, runoff speed
15–50% per hour, bounce loss 15–38%). Saltback recommends from the drain data alone; the plan is then judged in
the true world.

- Salt saved 9–14% (typical 13%); no test season got icier; every storm within 6 minutes in 91% of seasons.
- The input that moves savings most is how much salt bounces off the road.
- Out-of-sample season (hidden: 28% bounce, 45% dilution, 1.6× faster bonding): Saltback learned the bounce loss
  exactly and no storm got more than 6 minutes icier, but it under-predicted icy time (5.6 h claimed vs 11.1 h true),
  because a drain sensor measures salt, not ice. A road-condition source is the next thing to add.

## Roadmap

- [x] Step 1: one storm, melt physics, sensor realism
- [x] Step 2: 5-minute storm timeline and the website
- [x] System: decision engine, recommendations, rate card
- [x] Step 4: uncertainty (200 seasons), sensitivity, out-of-sample test
- [x] Step 3a: many winters by city, type of winter or random, with plain-English recommendations
- [x] Device: 3D model, parts list, printable box, lid and probe holder
- [ ] Step 3b: a road-condition input (crew reports or a road weather station); check city weather against real records
- [ ] Step 5: plug in real lab data (Experiments 1 and 2) and compare the model's predictions with what you measured
