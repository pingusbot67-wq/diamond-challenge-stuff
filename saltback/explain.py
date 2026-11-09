"""Turn the raw numbers in results/ into plain English (report.txt) and charts (chart.png, chart_step2.png).

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
          "   that actually reached the road.  -> The DFR0300 works IF it measures well-mixed storm water",
          "   (for example, a collection bucket). Step 2 shows what happens when it logs live in the drain.",
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
    return L


def step2_report(tl, sw, summ, card, s):
    n_pass = round(summ["salt_applied_lb_per_lane_mile"] / max(summ["salt_per_pass_lb"], 1e-9))
    flowing = tl.dropna(subset=["cl_true_mg_L"])
    L = ["", "", "STEP 2: THE SAME KIND OF STORM, HOUR BY HOUR", "=" * 60, ""]
    L += [f"THE STORM: {s['snowfall_in']} in of snow over {s['storm_hours']} h with the road at {s['pavement_temp_F']}F.",
          f"The first truck arrives after {s['first_pass_h']} h, then returns every {s['plow_every_h']} h:",
          f"{n_pass} passes x {summ['salt_per_pass_lb']:.0f} lb = {summ['salt_applied_lb_per_lane_mile']:.0f} lb per lane-mile.",
          f"Afterwards the road warms to {s['temp_after_F']}F and the leftover salt washes away.", ""]
    if card["status"] == "too_cold":
        verdict = (f"Too cold for rock salt to work well ({s['pavement_temp_F']}F). State guides recommend sand or a stronger"
                   " chemical such as calcium chloride below about 15F, not more rock salt.")
        card_line = f"   Salt spread: {card['route_salt_lb']:,.0f} lb | Too cold for rock salt"
    elif card["status"] == "cant_fix":
        verdict = ("Salt alone couldn't keep this road clear (still icy "
                   f"{card['best_icy_h']:.1f} h at the maximum rate). Pre-treat with brine, time a pass just before the freeze,"
                   " or use sand or a stronger chemical when it is very cold.")
        card_line = f"   Salt spread: {card['route_salt_lb']:,.0f} lb | Salt alone couldn't fix this storm"
    else:
        verdict = (f"Icy time: {card['icy_actual_h'] * 60:.0f} min as salted -> {card['icy_target_h'] * 60:.0f} min at "
                   f"Saltback's rate ({card['target_per_pass_lb']} lb per pass).")
        card_line = (f"   Salt spread: {card['route_salt_lb']:,.0f} lb | "
                     + ("About the right amount | " if card["status"] == "ok" else f"Excess: {card['excess_pct']:.0f}% | " if card["status"] == "over" else "Under-salted | ") +
                     f"Chloride released: {card['chloride_released_lb']:,.0f} lb | "
                     f"Next storm: try {card['next_per_pass_lb']} lb per pass ({card['next_change_pct']:+.0f}%)")
    L += ["SALTBACK STORM CARD", card_line, ""]
    L += ["6) WAS THE ROAD SAFE?",
          f"   Icy (bonded ice on a freezing road) for {summ['icy_hours']:.1f} h. With no salt: "
          f"{sw.icy_hours.iloc[0]:.1f} h.",
          f"   {verdict}",
          "   Saltback never recommends a rate that would leave the road more than 6 minutes icier than it was,",
          "   either with its best-estimate physics or in a pessimistic case (brine runs off faster, more brine is",
          "   needed, snow bonds faster). It cuts at most 25% per storm, checking the result each time.", ""]
    L += ["7) WHERE THE SALT WENT",
          f"   {summ['salt_to_drain_pct']:.0f}% washed into the storm drain, {summ['salt_to_roadside_pct']:.0f}% was "
          "thrown onto the shoulder and soil",
          "   (bounce, tires, wind). None of it disappears: it all ends up in streams or groundwater.", ""]
    L += ["8) WHAT LEFT THROUGH THE DRAIN",
          f"   The drain ran for {summ['hours_drain_flowing']:.0f} h. Peak chloride {summ['peak_cl_mg_L']:,.0f} mg/L, storm average "
          f"{summ['avg_cl_mg_L']:,.0f} mg/L.",
          f"   Drain water peaked at {card['peak_x_stream_limit']:.0f}x the EPA short-term stream limit (860 mg/L) before dilution.",
          "   A stream dilutes drain water, but chloride never breaks down, so what matters is the total load:",
          f"   {card['chloride_released_lb']:,.0f} lb of chloride from this storm.", ""]
    L += ["9) DID THE SENSOR KEEP UP?",
          f"   The probe was maxed out for {summ['hours_probe_maxed']:.1f} h, so Saltback only saw "
          f"{summ['salt_seen_vs_true_pct']:.0f}% of the salt."]
    if summ["hours_probe_maxed"] > 0.5:
        L += ["   The brine coming off a freezing road is far too salty for the DFR0300 (20 mS/cm max).",
              "   A high-range K=10 probe fixes this: set probe_max_mS_cm to 200 and run again."]
    else:
        L += ["   The probe stayed in range: the drain measurement is trustworthy for this storm."]
    L += ["", "NOT IN THE MODEL YET (coming in later steps):",
          "   - real lab data from Experiments 1 and 2 (the season analysis and uncertainty tests are on the website)",
          "", "All inputs are typical published values, not real town data. See results/settings_used.json."]
    return L


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


def draw_step2_chart(tl, sw, card, s):
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.4), facecolor=BG)
    storm_end = s["storm_hours"]

    ax = axes[0]
    style(ax, "D. Ice bonded to the road", "Hours since snow started", "Bonded ice (mm)")
    ax.axvspan(0, storm_end, color=BLUE, alpha=0.06, linewidth=0)
    ax.plot(tl.hour, tl.bonded_ice_mm, color=BLUE, linewidth=2)
    ax.axhline(0.05, color=ORANGE, linewidth=1, linestyle="--")
    ax.text(tl.hour.max(), 0.05, "  icy above this", color=INK2, fontsize=8, va="bottom", ha="right")
    ax.text(storm_end / 2, ax.get_ylim()[1] * 0.97, "snowing", color=INK2, fontsize=8, ha="center", va="top")

    ax = axes[1]
    style(ax, "E. Chloride in the drain (log scale)", "Hours since snow started", "Chloride (mg/L)")
    ax.set_yscale("log")
    ax.plot(tl.hour, tl.cl_true_mg_L, color=INK2, linewidth=2, linestyle="--", label="True")
    ax.plot(tl.hour, tl.cl_measured_mg_L, color=BLUE, linewidth=2, label="Sensor + Saltback")
    ax.axhline(860, color=ORANGE, linewidth=1)
    ax.text(0.5, 860 * 0.93, "EPA short-term limit", color=INK2, fontsize=8, va="top")
    ax.legend(frameon=False, fontsize=8, loc="upper right", labelcolor=INK)

    ax = axes[2]
    style(ax, "F. Salt per pass vs. icy hours", "Salt per pass (lb per lane-mile)", "Hours the road was icy")
    ax.plot(sw.salt_per_pass_lb, sw.icy_hours, color=BLUE, linewidth=2)
    marks = [(s["salt_per_pass_lb"], "used", (10, -18))]
    if card["target_per_pass_lb"] is not None:
        marks.insert(0, (card["target_per_pass_lb"], "Saltback", (10, 22)))
    for lb, label, off in marks:
        r = closest(sw, "salt_per_pass_lb", lb)
        ax.plot([r.salt_per_pass_lb], [r.icy_hours], "o", color=BLUE if label == "Saltback" else ORANGE,
                markersize=8, markeredgecolor=BG, markeredgewidth=2)
        ax.annotate(f"{label}: {r.salt_per_pass_lb:.0f} lb", (r.salt_per_pass_lb, r.icy_hours),
                    xytext=off, textcoords="offset points", color=INK, fontsize=9)

    fig.tight_layout()
    fig.savefig(OUT / "chart_step2.png", dpi=150, facecolor=BG)
    plt.close(fig)


def run():
    sweep = pd.read_csv(OUT / "dose_sweep.csv")
    temps = pd.read_csv(OUT / "temperature_chart.csv")
    check = pd.read_csv(OUT / "model_check.csv")
    tl = pd.read_csv(OUT / "timeline.csv")
    sw = pd.read_csv(OUT / "timeline_dose_sweep.csv")
    st = json.loads((OUT / "storm_summary.json").read_text())
    s = json.loads((OUT / "settings_used.json").read_text())
    text = "\n".join(write_report(sweep, temps, check, s) + step2_report(tl, sw, st["summary"], st["card"], s))
    (OUT / "report.txt").write_text(text)
    print(text)
    draw_chart(sweep, temps, s)
    draw_step2_chart(tl, sw, st["card"], s)
    print(f"\nCharts saved to {OUT}/chart.png and {OUT}/chart_step2.png")


if __name__ == "__main__":
    run()
