"""Turn the raw numbers in results/ into a plain-English report (report.txt) and a chart (chart.png).

Run simulate.py first. This file only READS the data; it never re-runs the physics.
"""
import json
from pathlib import Path
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = Path("results")
INK, INK2, GRID, BG = "#0b0b0b", "#52514e", "#e5e4df", "#fcfcfb"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"


def closest(df, col, value):
    return df.iloc[(df[col] - value).abs().argmin()]


def write_report(sweep, temps, check, s):
    need = sweep.salt_needed_lb_per_lane_mile.iloc[0]
    t_c = (s["pavement_temp_F"] - 32) * 5 / 9
    twice = closest(sweep, "salt_applied_lb_per_lane_mile", 2 * need)
    salted = sweep[sweep.salt_applied_lb_per_lane_mile > 0]
    avg_err = (100 * (salted.avg_cl_measured_mg_L - salted.avg_cl_true_mg_L) / salted.avg_cl_true_mg_L).abs().mean()
    no_probe = (100 * (1 - salted.avg_cl_if_no_temp_probe_mg_L / salted.avg_cl_true_mg_L)).mean()
    maxed = int(salted.peak_probe_maxed_out.sum())
    avg_maxed = int(salted.avg_probe_maxed_out.sum())
    seen = (100 * salted.salt_seen_by_sensor_lb_per_lane_mile / salted.salt_reaching_road_lb_per_lane_mile).mean()
    worst_check = check.difference_pct.abs()[check.temp_F <= 25].max()

    L = []
    L += ["SALTBACK SIMULATION - STEP 1: ONE STORM, IN PLAIN ENGLISH", "=" * 60, ""]
    L += [f"THE STORM: road surface at {s['pavement_temp_F']}F ({t_c:.0f}C), with a {s['ice_film_mm']} mm ice film",
          f"stuck to the road after plowing. {s['scatter_loss']:.0%} of the salt bounces off the road.", ""]
    L += ["1) HOW MUCH SALT THIS STORM NEEDED",
          f"   About {need:.0f} lb per lane-mile. Any less leaves some ice; any more melts nothing extra.", ""]
    L += ["   Salt spread      Ice cleared   Salt wasted   Money wasted (per lane-mile)"]
    top = sweep.salt_applied_lb_per_lane_mile.max()
    step = 100 * -(-top // 800)          # about 6-8 table rows, in round 100s
    for dose in range(int(step), int(top) + 1, int(step)):
        r = closest(sweep, "salt_applied_lb_per_lane_mile", dose)
        L.append(f"   {r.salt_applied_lb_per_lane_mile:5.0f} lb/lane-mi   {r.ice_cleared_pct:5.0f}%       "
                 f"{r.excess_pct:5.0f}%        ${r.wasted_dollars_per_lane_mile:5.2f}")
    if need == 0:
        L += ["", "   The road is at or above freezing: the ice melts on its own, so every grain is wasted.", ""]
    else:
        L += ["", f"   At double the needed amount (~{twice.salt_applied_lb_per_lane_mile:.0f} lb), "
              f"{twice.excess_pct:.0f}% of the salt does nothing but pollute.", ""]
    if s["pavement_temp_F"] < 15:
        L += ["   Note: below about 15F salt works very slowly, so real crews often add sand or switch",
              "   to stronger chemicals. This model only knows about plain salt (for now).", ""]
    L += ["2) TEMPERATURE CHANGES EVERYTHING"]
    for t in (30, 25, 20, 15, 10):
        r = closest(temps, "pavement_temp_F", t)
        L.append(f"   At {t:2d}F: 1 lb of salt melts {r.lb_ice_melted_per_lb_salt:4.1f} lb of ice -> "
                 f"this storm needs {r.salt_needed_lb_per_lane_mile:4.0f} lb/lane-mile")
    L += ["   Same storm, very different salt needs. A fixed 'one rate for everything' habit wastes salt",
          "   on mild days and under-treats cold ones. That is why Saltback starts from pavement temperature.", ""]
    L += ["3) CAN THE CHEAP SENSOR SEE IT?",
          f"   Storm-average runoff: the probe stayed in range {len(salted) - avg_maxed} of {len(salted)} times, and",
          f"   Saltback's chloride estimate was off by {avg_err:.0f}% on average. It found {seen:.0f}% of the salt",
          "   that actually reached the road.  -> The DFR0300 works for this job.",
          f"   Without the temperature probe, readings would be {no_probe:.0f}% too low (cold water conducts",
          "   less electricity). -> The $5 DS18B20 is essential, not optional.", ""]
    L += ["4) WARNING FOR THE HARDWARE PLAN",
          f"   The first rush of brine off the road maxed out the probe in {maxed} of {len(salted)} runs (it is",
          "   far saltier than the 20 mS/cm limit). So the DFR0300 cannot measure the first flush. Options:",
          "   measure the storm-average water (works, see #3), or add a higher-range (K=10) probe later.", ""]
    L += ["5) IS THE MODEL TRUSTWORTHY?",
          f"   It was checked against the widely published 'ice melted per pound of salt' chart: within",
          f"   {worst_check:.0f}% from 0F to 25F. (Near 30F it reads higher, because tiny temperature changes",
          "   near freezing matter a lot.) The model never reads that chart; it uses freezing-point physics.", ""]
    L += ["NOT IN THE MODEL YET (coming in later steps):",
          "   - time: how fast salt works, refreezing, new snow diluting the brine",
          "   - traffic, plowing, and salt carried off by tires",
          "   - a whole winter of storms, and Saltback learning from each one",
          "   - uncertainty: what if our guesses (ice film, runoff water) are wrong?",
          "", "All inputs are typical published values, not real town data. See results/settings_used.json."]
    text = "\n".join(L)
    (OUT / "report.txt").write_text(text)
    return text


def style(ax, title, xlabel, ylabel):
    ax.set_facecolor(BG)
    ax.set_title(title, loc="left", fontsize=11, color=INK, fontweight="bold")
    ax.set_xlabel(xlabel, color=INK2, fontsize=9)
    ax.set_ylabel(ylabel, color=INK2, fontsize=9)
    ax.grid(color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=8)


def draw_chart(sweep, temps, s):
    need = sweep.salt_needed_lb_per_lane_mile.iloc[0]
    x = sweep.salt_applied_lb_per_lane_mile
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.4), facecolor=BG)

    ax = axes[0]
    style(ax, "A. More salt stops helping", "Salt spread (lb per lane-mile)", "Ice cleared (%)")
    ax.axvspan(need, x.max(), color=ORANGE, alpha=0.10, linewidth=0)
    ax.plot(x, sweep.ice_cleared_pct, color=BLUE, linewidth=2)
    ax.axvline(need, color=INK2, linewidth=1, linestyle="--")
    ax.text(need + 10, 45, f"Needed:\n{need:.0f} lb", color=INK, fontsize=9)
    ax.text(x.max() - 10, 8, "Wasted salt zone", color=INK2, fontsize=9, ha="right")
    ax.set_ylim(0, 105)

    ax = axes[1]
    style(ax, "B. Colder road, more salt needed", "Pavement temperature (F)", "Salt needed (lb per lane-mile)")
    ax.plot(temps.pavement_temp_F, temps.salt_needed_lb_per_lane_mile, color=BLUE, linewidth=2)
    ax.plot([s["pavement_temp_F"]], [need], "o", color=BLUE, markersize=8, markeredgecolor=BG, markeredgewidth=2)
    ax.annotate(f"This storm ({s['pavement_temp_F']}F)", (s["pavement_temp_F"], need),
                xytext=(8, 10), textcoords="offset points", color=INK, fontsize=9)

    ax = axes[2]
    style(ax, "C. What the drain sensor reports", "Salt spread (lb per lane-mile)", "Storm-average chloride (mg/L)")
    for col, color, label in [("avg_cl_true_mg_L", INK2, "True"),
                              ("avg_cl_measured_mg_L", BLUE, "Saltback estimate"),
                              ("avg_cl_if_no_temp_probe_mg_L", ORANGE, "No temperature probe")]:
        ls = "--" if label == "True" else "-"
        ax.plot(x, sweep[col], color=color, linewidth=2, linestyle=ls, label=label)
        ax.text(x.iloc[-1] + 8, sweep[col].iloc[-1], label, color=INK, fontsize=8, va="center")
    ax.legend(frameon=False, fontsize=8, loc="upper left", labelcolor=INK)
    ax.set_xlim(0, x.max() * 1.33)

    fig.tight_layout()
    fig.savefig(OUT / "chart.png", dpi=150, facecolor=BG)
    plt.close(fig)


def run():
    sweep = pd.read_csv(OUT / "dose_sweep.csv")
    temps = pd.read_csv(OUT / "temperature_chart.csv")
    check = pd.read_csv(OUT / "model_check.csv")
    s = json.loads((OUT / "settings_used.json").read_text())
    print(write_report(sweep, temps, check, s))
    draw_chart(sweep, temps, s)
    print(f"\nChart saved to {OUT}/chart.png")


if __name__ == "__main__":
    run()
