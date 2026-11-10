"""Pack model.py, simulate.py and explain.py into Saltback.ipynb (a self-contained Google Colab notebook).

Re-run this after changing any of those files:   python build_notebook.py
"""
import json
from pathlib import Path

HERE = Path(__file__).parent


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)}


def code(text, hidden=False):
    meta = {"cellView": "form"} if hidden else {}
    return {"cell_type": "code", "metadata": meta, "execution_count": None, "outputs": [],
            "source": text.strip("\n").splitlines(keepends=True)}


def embed(name):
    src = (HERE / name).read_text()
    assert "'''" not in src, f"{name} must not contain triple single quotes"
    return f"open({name!r}, 'w').write(r'''{src}''')\n"


cells = [
    md("""
# Saltback simulator - Steps 1 and 2
**How to use:** click **Runtime -> Run all**. Then move the sliders in step 2 and re-run steps 2-4.

- **Step 1** works out how much ice a salt dose *can* melt at a given road temperature.
- **Step 2** plays the storm in 5-minute steps: snow, plow-and-salt passes, salt dissolving, brine melting
  or refreezing into black ice, runoff into the storm drain, and the probe's live reading.

The simulation (`simulate.py`) only produces raw numbers. A separate translator (`explain.py`)
turns them into plain English and a chart. All inputs are typical published values, not real town data.
"""),
    code("# @title 1. Load the Saltback model (click to run; no need to read the code)\n"
         + "".join(embed(n) for n in ("model.py", "simulate.py", "explain.py"))
         + "print('Model files ready: model.py, simulate.py, explain.py')", hidden=True),
    code("""
# @title 2. Storm settings - drag the sliders, then run this cell and the ones below
import json
pavement_temp_F = 22     # @param {type:"slider", min:-5, max:32, step:1}
ice_film_mm = 0.2        # @param {type:"slider", min:0.05, max:0.5, step:0.05}
scatter_loss = 0.2       # @param {type:"slider", min:0.0, max:0.4, step:0.05}
later_water_mm = 5.0     # @param {type:"slider", min:0, max:20, step:1}
unsalted_share = 0.3     # @param {type:"slider", min:0.0, max:0.7, step:0.05}
water_temp_C = 1.0       # @param {type:"slider", min:0, max:5, step:0.5}
salt_price_per_ton = 90  # @param {type:"slider", min:60, max:130, step:5}
# --- Step 2: the storm over time ---
snowfall_in = 4          # @param {type:"slider", min:0, max:18, step:0.5}
storm_hours = 8          # @param {type:"slider", min:4, max:24, step:1}
salt_per_pass_lb = 220   # @param {type:"slider", min:0, max:500, step:10}
first_pass_h = 0.5       # @param {type:"slider", min:0, max:3, step:0.25}
plow_every_h = 2         # @param {type:"slider", min:1, max:4, step:0.5}
temp_after_F = 38        # @param {type:"slider", min:10, max:50, step:1}
probe = "DFR0300 (max 20 mS/cm)"  # @param ["DFR0300 (max 20 mS/cm)", "High-range K=10 (max 200 mS/cm)"]
settings = dict(pavement_temp_F=pavement_temp_F, ice_film_mm=ice_film_mm, scatter_loss=scatter_loss,
                later_water_mm=later_water_mm, unsalted_share=unsalted_share,
                water_temp_C=water_temp_C, salt_price_per_ton=salt_price_per_ton,
                snowfall_in=snowfall_in, storm_hours=storm_hours, salt_per_pass_lb=salt_per_pass_lb,
                first_pass_h=first_pass_h, plow_every_h=plow_every_h, temp_after_F=temp_after_F,
                probe_max_mS_cm=20.0 if probe.startswith("DFR") else 200.0)
json.dump(settings, open('settings.json', 'w'))
print('Settings saved:', settings)
""", hidden=True),
    code("""
# @title 3. Run the simulation (raw data)
!python simulate.py settings.json
import pandas as pd
pd.read_csv('results/dose_sweep.csv').head(10)
""", hidden=True),
    code("""
# @title 4. Translate into plain English + chart
!python explain.py
from IPython.display import Image, display
display(Image('results/chart.png'))
display(Image('results/chart_step2.png'))
""", hidden=True),
    code("""
# @title 5. (Optional) Download all results as a zip
!zip -qr saltback_results.zip results
from google.colab import files
files.download('saltback_results.zip')
""", hidden=True),
]

nb = {"cells": cells, "metadata": {"colab": {"provenance": []},
                                   "kernelspec": {"name": "python3", "display_name": "Python 3"},
                                   "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 0}
(HERE / "Saltback.ipynb").write_text(json.dumps(nb, indent=1))
print("Wrote Saltback.ipynb")
