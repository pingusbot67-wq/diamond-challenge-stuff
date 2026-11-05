# Saltback simulator

A small physics model of road salt: **truck → road → storm drain → sensor → Saltback's report**.
It is built in steps. **Step 1 (done): one storm, one stretch of road, one drain.**

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

`results/` holds example output from the default settings (22°F road).

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

## What Step 1 already shows

- Past the needed amount, more salt clears no more ice; at double the dose, half the salt is wasted.
- The needed amount depends heavily on pavement temperature (about 60 lb/lane-mile at 30°F vs. about 500 at 15°F for the same storm).
- The DFR0300 handles **storm-average** runoff well (about 5% error), but the **temperature probe is essential**: without it, readings come out about 50% low.
- **Hardware warning:** the first rush of brine is far above the DFR0300's 20 mS/cm limit, so it can't measure the first flush.

## Roadmap

- [x] **Step 1** One storm: melt physics, drain mixing, sensor realism, plain-English report
- [ ] **Step 2** Time: hour-by-hour storm with melting speed, refreezing, new snow, and the conductivity curve the probe would log
- [ ] **Step 3** A whole winter: 20–30 random storms; a town that over-salts vs. one following Saltback's recommendations
- [ ] **Step 4** Uncertainty (Monte Carlo): 1,000 runs with wrong guesses, sensor fouling, and the $5 screw-electrode probe
- [ ] **Step 5** Plug in real lab data (Experiments 1 and 2) and compare the model's predictions with what you measured
