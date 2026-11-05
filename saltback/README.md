# Saltback simulator

A small physics model of road salt: **truck → road → storm drain → sensor → Saltback's report**.
It is built in steps. **Step 1 (done):** one storm, all at once. **Step 2 (done):** the same storm in 5-minute steps.

## Two ways to run it

- **The website** (`web/`), with three tabs:
  - **Simulator**: the storm as a field of particles (snow, bonded ice, brine, salt, runoff) and the probe's live log.
  - **Results**: the storm report for your latest run.
  - **System**: the Saltback product. It reads storm records (truck logs + drain-probe readings), learns
    how much salt really stays on this route, and produces ranked recommendations, a crew rate card and
    per-storm verdicts. Every simulator run is logged here; you can also load the example season or import a CSV.
  Open it here: <https://claude.ai/artifact/AH6wXhn5TmQdTVGgkWpHCx> (private until you share it from the page's Share menu).
- **Google Colab** (below): the Python version, which saves raw data files and a written report.

Both give identical numbers: `python web/check_parity.py` compares them on 6 storms (about 11,700 values).

## Run it (no install, works on any laptop)

1. Open the notebook in Google Colab:
   [Saltback.ipynb in Colab](https://colab.research.google.com/github/pingusbot67-wq/diamond-challenge-stuff/blob/claude/blissful-wright-uey5ta/saltback/Saltback.ipynb)
   *(If that link doesn't open, download `Saltback.ipynb` from GitHub, go to colab.research.google.com,
   and use **File → Upload notebook**.)*
2. Click **Runtime → Run all**.
3. Drag the sliders in step 2, then re-run steps 2–4.

## The three pieces

| File | Job |
|---|---|
| `model.py` | The physics. All settings (with realistic ranges) sit at the top. |
| `simulate.py` | Runs the model and saves **raw data** to `results/` (CSV files). |
| `explain.py` | Reads that data and writes **plain English** (`report.txt`) and a chart (`chart.png`). |
| `build_notebook.py` | Packs the three files above into `Saltback.ipynb`. Re-run it after changing them. |
| `web/index.html`, `web/model.js` | The website. `model.js` is the JavaScript twin of `model.py`. |
| `web/check_parity.py` | Proves the website and the Python model give the same answers. |
| `web/engine.js` | The Saltback System's decision logic: calibration from probe data, per-storm verdicts, recommendations, rate card. |

`results/` holds example output from the default settings (22°F road): `report.txt`, `chart.png` (Step 1),
`chart_step2.png` and `timeline.csv` (Step 2).

## How Step 2 works (every 5 minutes of the storm)

1. Snow falls (as rain if the road is above freezing).
2. A truck plows loose snow and spreads salt, first after `first_pass_h`, then every `plow_every_h`.
   Some salt bounces onto the shoulder.
3. Salt crystals dissolve into the snow: about 15 min near freezing, much slower when colder.
4. The brine melts ice until it is exactly as salty as the temperature requires. If it is too weak
   (new snow, a cold snap), it **refreezes into black ice**.
5. Traffic packs unprotected snow into ice bonded to the pavement. A brine film prevents this,
   which is why salting early takes less salt.
6. Brine runs into the drain or is thrown onto the shoulder by tires. After the storm the road thaws
   and the rest washes away.
7. The probe logs the drain water. Saltback finds the **smallest salt per pass that keeps the road
   as safe as possible** and writes the storm card.

## How the model works (Step 1)

1. **Road.** Salt melts ice until the brine gets weak enough to freeze at that temperature.
   That uses the NaCl freezing-point table from the CRC Handbook. Checked against the widely
   published "lb of ice melted per lb of salt" chart, the model matches within 5% from 0°F to 25°F.
   Once all the ice is melted, extra salt melts nothing; it only makes the brine saltier.
   That extra is the **excess**.
2. **Drain.** Brine plus later melt/rain, mixed with water from unsalted surfaces, gives the
   chloride level (mg/L). Chloride is 60.7% of salt by mass.
3. **Sensor.** Chloride is converted to conductivity, adjusted for cold water (about 2% per °C),
   with 3% random probe error and ±0.5°C temperature-probe error, and capped at the DFR0300's
   20 mS/cm limit.
4. **Saltback's estimate.** Working backward from the noisy reading, how much chloride and salt
   does it see?

## Assumptions (typical published values, NOT real town data)

| Setting | Default | Realistic range | Why it matters |
|---|---|---|---|
| Pavement temperature | 22°F | -5 to 32°F | Biggest driver of how much salt is needed |
| Ice film left after plowing | 0.2 mm | 0.05–0.5 mm | Sets the "needed" amount; **least certain input** |
| Salt that bounces off the road | 20% | 5% (wet) – 30% (dry) | Salt that lands on soil instead of in the drain |
| Later melt/rain rinsing the road | 5 mm | 0–20 mm | Dilutes the runoff the sensor sees |
| Unsalted water in the drain | 30% | 0–70% | Dilutes the runoff too |
| Runoff water temperature | 1°C | 0–5°C | Cold water reads about 50% low without correction |
| Salt price | $90/ton | $60–130/ton | Converts waste into dollars |

## What Steps 1 and 2 show (default storm: 4 in of snow, 8 h, 22°F)

- **Storm card:** 8,800 lb on a 10 lane-mile route | 45% excess | chloride runoff HIGH | next comparable storm −35%.
- 120 lb per pass would have kept the road nearly as safe as the 220 lb used.
- **Timing matters:** if the first truck arrives one hour later, the same storm needs about 3× more salt per pass, because traffic packs the snow into ice first.
- **Sensor:** live in the drain, the DFR0300 is maxed out for about 10 hours and sees only about half the salt. A high-range K=10 probe sees about 94%. This is a real hardware decision for the field pilot.

Earlier Step 1 findings:

- Past the needed amount, more salt clears no more ice; at double the dose, half the salt is wasted.
- The needed amount depends heavily on pavement temperature (about 60 lb/lane-mile at 30°F vs. about 500 at 15°F for the same storm).
- The DFR0300 handles **storm-average** runoff well (about 5% error), but the **temperature probe is essential**: without it, readings come out about 50% low.
- **Hardware warning:** the first rush of brine is far above the DFR0300's 20 mS/cm limit, so it can't measure the first flush.

## The Saltback System (example season, simulated data)

12 storms on a 10 lane-mile route. The crew raises its rate a little on cold days, but not as much as the physics
requires. Hidden in the data: 28% of the salt bounces off the road, not the 20% the model assumes.

- The engine **finds the hidden bounce loss from the drain-probe data** (it estimates 28%) and recommends pre-wetting the salt.
- **Saltback's plan:** 18.5% less salt over the season, about $1,200 saved, and icy-road hours down from 15.6 to 4.3.
  It cuts salt on mild storms and **adds** salt on the two coldest, so the roads end up safer, not just cheaper.
- Ranked actions: lower rates at 23–32°F, get the first truck out within 30 minutes, pre-wet salt,
  upgrade the drain probe, and report chloride for the stormwater (MS4) permit.
- **Model tuning note:** the brine film needed to stop snow bonding (0.04 mm) was set so the rate card falls inside
  published state rate-chart ranges (about 100–170 lb/lane-mile at 23–27°F, 160–350 at 18–22°F).

## Roadmap

- [x] **Step 1** One storm: melt physics, drain mixing, sensor realism, plain-English report
- [x] **Step 2** Time: 5-minute storm timeline with melting speed, refreezing, new snow, and the probe's live log, plus the website
- [x] **System** Decision engine: calibration from probe data, per-storm verdicts, ranked recommendations, crew rate card
- [ ] **Step 3** A whole winter: 20–30 random storms; a town that over-salts vs. one following Saltback's recommendations
- [ ] **Step 4** Uncertainty (Monte Carlo): 1,000 runs with wrong guesses, sensor fouling, and the $5 screw-electrode probe
- [ ] **Step 5** Plug in real lab data (Experiments 1 and 2) and compare the model's predictions with what you measured
