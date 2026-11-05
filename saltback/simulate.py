"""Run the Saltback simulation (Steps 1 and 2) and save raw data to results/. (explain.py turns it into plain English.)

Usage:  python simulate.py              uses model.SETTINGS
        python simulate.py my.json      overrides any settings listed in my.json
"""
import json, sys
from pathlib import Path
import numpy as np
import pandas as pd
import model

OUT = Path("results")

# Widely reprinted chart: pounds of ice melted by 1 lb of salt (originally from the Salt Institute).
# Used ONLY to check the model; the model itself never reads it.
PUBLISHED_ICE_PER_LB = {30: 46.3, 25: 14.4, 20: 8.6, 15: 6.3, 10: 4.9, 5: 4.1, 0: 3.7}


def run(overrides=None):
    s = {**model.SETTINGS, **(overrides or {})}
    rng = np.random.default_rng(s["seed"])
    OUT.mkdir(exist_ok=True)

    # 1) Dose sweep: the same storm salted from 0 up to 2.5x what it needs (at least 600 lb per lane-mile)
    need = model.storm([0.0], s, rng)["salt_needed_lb_per_lane_mile"][0]
    top = int(np.clip(np.ceil(2.5 * np.nan_to_num(need, posinf=0) / 100) * 100, 600, 2500))
    doses_lb = np.arange(0, top + 1, 20)
    sweep = pd.DataFrame(model.storm(doses_lb / model.LB_PER_LANE_MILE, s, rng))
    sweep.round(2).to_csv(OUT / "dose_sweep.csv", index=False)

    # 2) Temperature chart: how much salt this storm needs at each road temperature
    temps = np.arange(-5, 33, 1)
    rows = []
    for t in temps:
        r = model.storm([0.0], {**s, "pavement_temp_F": t}, rng)
        rows.append(dict(pavement_temp_F=t,
                         salt_needed_lb_per_lane_mile=r["salt_needed_lb_per_lane_mile"][0],
                         lb_ice_melted_per_lb_salt=float(model.ice_melted_per_salt(model.f_to_c(t)))))
    pd.DataFrame(rows).round(2).to_csv(OUT / "temperature_chart.csv", index=False)

    # 3) Model check against the published chart
    check = pd.DataFrame([dict(temp_F=t, published=p,
                               model=round(float(model.ice_melted_per_salt(model.f_to_c(t))), 1))
                          for t, p in PUBLISHED_ICE_PER_LB.items()])
    check["difference_pct"] = (100 * (check.model - check.published) / check.published).round(0)
    check.to_csv(OUT / "model_check.csv", index=False)

    # 4) Step 2: the same storm over time (5-minute steps), plus the salt dose it really needed
    rows, summary = model.storm_timeline(s)
    needed, sweep2 = model.find_needed(s)
    card = model.storm_card(s, summary, needed)
    pd.DataFrame(rows).round(4).to_csv(OUT / "timeline.csv", index=False)
    pd.DataFrame(sweep2).round(3).to_csv(OUT / "timeline_dose_sweep.csv", index=False)
    (OUT / "storm_summary.json").write_text(json.dumps(dict(summary=summary, card=card), indent=2, default=float))

    (OUT / "settings_used.json").write_text(json.dumps(s, indent=2))
    print(f"Simulated {len(sweep)} salt doses at {s['pavement_temp_F']}F -> {OUT}/dose_sweep.csv, "
          "temperature_chart.csv, model_check.csv,\n  "
          f"and a {len(rows) * model.DT_H:.0f}-hour storm timeline -> timeline.csv, timeline_dose_sweep.csv, storm_summary.json")
    return sweep


if __name__ == "__main__":
    run(json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else None)
