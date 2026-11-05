"""Saltback physics model.
  STEP 1  storm()          one storm, all at once: how much ice a salt dose CAN melt (equilibrium).
  STEP 2  storm_timeline() the same storm minute by minute: snowfall, plowing, salt dissolving,
                           brine melting or refreezing, runoff reaching the drain, the sensor's live trace.

Follows the salt along its whole path:
    truck -> road (melts ice) -> runoff -> storm drain -> sensor reading -> Saltback's estimate

Everything is "per square meter of road", so results do not depend on road size.
SETTINGS holds typical published values (ASSUMPTIONS, not measured data); change them freely.
"""
import math
import numpy as np

# ---------------- Settings you can change (typical values, with realistic ranges) ----------------
SETTINGS = dict(
    pavement_temp_F=22,       # road surface temperature during the storm               (range -5 to 32)
    ice_film_mm=0.2,          # ice film left after plowing, bonded to pavement, mm water (range 0.05 to 0.5)
    scatter_loss=0.20,        # share of salt that bounces/blows off the road            (0.05 wet - 0.30 dry)
    later_water_mm=5.0,       # extra snowmelt/rain that later rinses the road, mm        (range 0 to 20)
    unsalted_share=0.30,      # share of drain water from unsalted surfaces (lawns, roofs) (range 0 to 0.7)
    baseline_cl_mg_L=50,      # chloride already in drain water before the storm          (range 10 to 500)
    water_temp_C=1.0,         # temperature of the runoff where the probe sits            (range 0 to 5)
    probe_max_mS_cm=20.0,     # highest conductivity the DFRobot DFR0300 (K=1) can read
    probe_noise=0.03,         # random probe error, as a fraction of the reading (3%)
    temp_probe_error_C=0.5,   # DS18B20 temperature probe accuracy
    use_temp_probe=True,      # False = Saltback skips the cold-water correction (to show why it matters)
    salt_price_per_ton=90,    # US$ per short ton of road salt, delivered                 (range 60 to 130)
    seed=1,                   # fixes the random sensor noise so runs are repeatable
    # --- Step 2: the storm over time ---
    storm_hours=8,            # how long it snows                                          (2 to 24)
    snowfall_in=4,            # total snowfall, inches                                     (0 to 18)
    snow_ratio=12,            # inches of snow per inch of water (wet snow 8, fluffy 18)
    first_pass_h=0.5,         # hours of snow before the first truck arrives              (0 to 3)
    plow_every_h=2,           # then a truck plows AND salts every N hours while it snows (1 to 4)
    salt_per_pass_lb=150,     # salt spread each pass, lb per lane-mile                   (0 to 500)
    temp_after_F=38,          # road temperature once the storm is over (sun/thaw)        (10 to 50)
    drain_per_h=0.3,          # share of liquid brine that runs off the road each hour    (0.1 to 0.8)
    traffic_loss_per_h=0.05,  # share of brine/salt that tires throw onto the shoulder /h (0.02 to 0.15)
    bond_per_h=0.5,           # how fast traffic packs unprotected snow into bonded ice /h (0.2 to 1)
    catchment_m2=400,         # road area draining to the monitored storm drain           (100 to 2000)
    route_lane_miles=10,      # size of the route, for the storm card                     (1 to 50)
)

# ---------------- Fixed science (reference-table values, not assumptions) ----------------
CL_SHARE = 35.45 / 58.44                       # chloride is 60.7% of salt (NaCl) by mass
LANE_MILE_M2 = 1609.34 * 3.658                 # one 12-ft lane, one mile long = 5,887 m^2
LB_PER_LANE_MILE = LANE_MILE_M2 / 453.59       # 1 g/m^2 = 13.0 lb per lane-mile

# Freezing point of salt water vs. salt strength (CRC Handbook, NaCl). Below -21.1 C salt cannot melt ice.
BRINE_PCT = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 23.3]
FREEZE_C = [0, -0.59, -1.19, -1.79, -2.41, -3.05, -3.70, -4.38, -5.08, -5.81,
            -6.56, -8.18, -9.94, -11.89, -14.04, -16.46, -19.18, -21.1]

# Conductivity of salt water at 25 C (mS/cm) vs. salt concentration (g NaCl per liter). Standard values.
NACL_G_L = [0, 0.584, 2.92, 5.84, 29.2, 58.4, 117, 234, 317]
EC25 = [0, 1.185, 5.55, 10.67, 47.0, 85.8, 145, 214, 251]
ALPHA_TRUE = 0.021    # real NaCl conductivity change per C (about 2.1% per degree)
ALPHA_ASSUMED = 0.02  # the standard 2%/C correction Saltback applies


def f_to_c(f):
    return (np.asarray(f, float) - 32) * 5 / 9


def brine_strength_needed(temp_c):
    """Salt fraction a brine must have to stay liquid at temp_c (0.0 above freezing, nan below -21.1 C)."""
    t = np.asarray(temp_c, float)
    w = np.interp(-t, -np.array(FREEZE_C), BRINE_PCT) / 100
    return np.where(t >= 0, 0.0, np.where(t < FREEZE_C[-1], np.nan, w))


def ice_melted_per_salt(temp_c):
    """Pounds of ice one pound of salt can melt at temp_c (once fully dissolved)."""
    w = brine_strength_needed(temp_c)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(np.isnan(w), 0.0, (1 - w) / w)


def chloride_to_conductivity(cl_mg_L, water_c, alpha=ALPHA_TRUE):
    nacl_g_L = np.asarray(cl_mg_L, float) / CL_SHARE / 1000
    return np.interp(nacl_g_L, NACL_G_L, EC25) * (1 + alpha * (water_c - 25))


def conductivity_to_chloride(ec, water_c, alpha=ALPHA_ASSUMED):
    ec25 = np.asarray(ec, float) / (1 + alpha * (water_c - 25))
    return np.interp(ec25, EC25, NACL_G_L) * CL_SHARE * 1000


def sensor(cl_true, s, rng):
    """What the DFR0300 + DS18B20 report, and the chloride Saltback works out from that reading."""
    ec = chloride_to_conductivity(cl_true, s["water_temp_C"])
    reading = ec * (1 + s["probe_noise"] * rng.standard_normal(np.shape(ec)))
    clipped = reading >= s["probe_max_mS_cm"]
    reading = np.minimum(reading, s["probe_max_mS_cm"])
    temp_read = s["water_temp_C"] + s["temp_probe_error_C"] * rng.standard_normal(np.shape(ec))
    cl_est = conductivity_to_chloride(reading, temp_read)
    cl_no_tempfix = conductivity_to_chloride(reading, 25.0)   # what you'd get with no temperature probe
    if not s.get("use_temp_probe", True):
        cl_est = cl_no_tempfix
    return reading, clipped, cl_est, cl_no_tempfix


def storm(dose_g_m2, s, rng):
    """Simulate one storm for each salt dose (g of salt per m^2 of road). Returns a dict of result columns."""
    dose = np.asarray(dose_g_m2, float)
    temp_c = f_to_c(s["pavement_temp_F"])
    ice = s["ice_film_mm"] * 1000                     # g of ice per m^2 (1 mm of water = 1 kg/m^2)
    w = brine_strength_needed(temp_c)

    # --- Road: how much ice the salt can melt ---
    salt_on_road = dose * (1 - s["scatter_loss"])
    if temp_c >= 0:      # above freezing the ice melts by itself
        melted = np.full_like(dose, ice)
    else:
        melted = np.minimum(ice, salt_on_road * ice_melted_per_salt(temp_c))
    if np.isnan(w):      # too cold for salt to work at all: every grain is wasted
        needed, excess = np.inf, dose
    else:
        needed = ice * w / (1 - w) / (1 - s["scatter_loss"]) if w > 0 else 0.0
        excess = np.maximum(dose - needed, 0)

    # --- Brine leaving the road: once the ice is gone, extra salt only makes the brine saltier ---
    brine_w = np.where(salt_on_road <= 0, 0.0,
                       np.where(melted < ice, w, salt_on_road / (salt_on_road + ice)))
    brine_w = np.nan_to_num(np.minimum(brine_w, 0.264))      # 26.4% = fully saturated salt water
    brine_cl = brine_w * (1 + 0.72 * brine_w) * 1e6 * CL_SHARE   # mg chloride per liter of brine

    # --- Storm drain: first rush of brine (peak) and the whole-storm average ---
    mix = 1 - s["unsalted_share"]
    peak_cl = brine_cl * mix + s["baseline_cl_mg_L"]
    water_L = (ice + s["later_water_mm"] * 1000) / 1000 / mix       # liters reaching the drain per m^2 of road
    avg_cl = salt_on_road * CL_SHARE * 1000 / water_L + s["baseline_cl_mg_L"]

    # --- Sensor + Saltback's estimate ---
    pk_read, pk_clip, pk_est, _ = sensor(peak_cl, s, rng)
    av_read, av_clip, av_est, av_no_fix = sensor(avg_cl, s, rng)
    salt_seen = np.maximum(av_est - s["baseline_cl_mg_L"], 0) * water_L / CL_SHARE / 1000   # g/m^2

    lb = LB_PER_LANE_MILE
    cost_per_lb = s["salt_price_per_ton"] / 2000
    return dict(
        salt_applied_lb_per_lane_mile=dose * lb,
        salt_needed_lb_per_lane_mile=np.full_like(dose, needed * lb),
        excess_pct=np.where(dose > 0, 100 * excess / np.maximum(dose, 1e-9), 0),
        ice_cleared_pct=100 * melted / ice,
        wasted_dollars_per_lane_mile=excess * lb * cost_per_lb,
        chloride_released_lb_per_lane_mile=dose * CL_SHARE * lb,
        peak_cl_true_mg_L=peak_cl, peak_reading_mS_cm=pk_read, peak_probe_maxed_out=pk_clip,
        peak_cl_measured_mg_L=pk_est,
        avg_cl_true_mg_L=avg_cl, avg_reading_mS_cm=av_read, avg_probe_maxed_out=av_clip,
        avg_cl_measured_mg_L=av_est, avg_cl_if_no_temp_probe_mg_L=av_no_fix,
        salt_seen_by_sensor_lb_per_lane_mile=salt_seen * lb,
        salt_reaching_road_lb_per_lane_mile=salt_on_road * lb,
    )


# ======================= STEP 2: the storm over time =======================
DT_H = 5 / 60            # time step: 5 minutes
EUTECTIC_C = FREEZE_C[-1]
PLOW_CLEAR = 0.95        # a plow pass scrapes off 95% of LOOSE snow (it cannot lift ice bonded to pavement)
BRINE_FILM_G = 20        # a brine layer of at least 0.02 mm stops snow from bonding to the pavement
ICY_G = 50               # bonded ice thicker than 0.05 mm counts as an icy, slippery road
NATURAL_MELT = 300       # g/m^2 per hour per degree C above freezing (pavement thaw rate)
CL_LIMITS = (230, 860)   # US EPA chloride criteria for aquatic life: long-term and short-term (mg/L)


def temp_at(t, s):
    """Pavement temperature (F): steady during the storm, then shifts to temp_after_F over 6 hours."""
    if t < s["storm_hours"]:
        return s["pavement_temp_F"]
    return s["pavement_temp_F"] + (s["temp_after_F"] - s["pavement_temp_F"]) * min(1, (t - s["storm_hours"]) / 6)


def dissolve_minutes(temp_c):
    """Typical time for rock salt to dissolve into wet snow/ice: ~15 min near freezing, hours when very cold."""
    return 5.0 if temp_c >= 0 else 15 * math.exp(-0.12 * temp_c)


def storm_timeline(s, per_pass_lb=None, with_sensor=True):
    """Simulate the storm in 5-minute steps. Returns (rows, summary). All amounts are grams per m^2 of road."""
    per_pass = (s["salt_per_pass_lb"] if per_pass_lb is None else per_pass_lb) / LB_PER_LANE_MILE
    hours = s["storm_hours"] + 24
    snow_per_h = s["snowfall_in"] * 25.4 / s["snow_ratio"] * 1000 / s["storm_hours"]
    every = max(1, round(s["plow_every_h"] / DT_H))
    out_f, spray_f = 1 - math.exp(-s["drain_per_h"] * DT_H), 1 - math.exp(-s["traffic_loss_per_h"] * DT_H)
    mix = 1 - s["unsalted_share"]

    first = round(s["first_pass_h"] / DT_H)
    loose = ice = crystals = water = salt = 0.0          # road state; the storm starts on bare pavement
    applied = roadside = drained = icy_h = 0.0
    rows = []
    for i in range(round(hours / DT_H)):
        t = i * DT_H
        tc = (temp_at(t, s) - 32) * 5 / 9
        storming = t < s["storm_hours"]
        # 1) snow falls (melts on contact if the road is above freezing)
        if storming:
            if tc < 0: loose += snow_per_h * DT_H
            else: water += snow_per_h * DT_H
        # 2) plow + salt pass
        truck = storming and i >= first and (i - first) % every == 0
        if truck:
            loose *= 1 - PLOW_CLEAR
            applied += per_pass
            roadside += per_pass * s["scatter_loss"]
            crystals += per_pass * (1 - s["scatter_loss"])
        # 3) salt crystals dissolve, but only into moisture, and slower when cold
        if crystals > 0 and loose + ice + water > 0 and tc > EUTECTIC_C:
            d = crystals * (1 - math.exp(-DT_H * 60 / dissolve_minutes(tc)))
            crystals -= d; salt += d
        # 4) melt or refreeze until the brine is exactly as salty as this temperature requires
        if tc >= 0:
            m = min(loose + ice, NATURAL_MELT * tc * DT_H)
        else:
            w = float(brine_strength_needed(tc))
            target = 0.0 if math.isnan(w) else salt * (1 - w) / w     # liquid water the salt can hold
            m = min(loose + ice, target - water) if water < target else -(water - target)
        if m >= 0:                       # melting: bonded ice (touching the brine) goes first
            from_ice = min(ice, m); ice -= from_ice; loose -= m - from_ice; water += m
        else:                            # refreezing: brine too weak -> black ice
            water += m; ice -= m
        # 5) traffic packs unprotected snow into bonded ice
        if tc < 0 and water < BRINE_FILM_G:
            k = loose * (1 - math.exp(-s["bond_per_h"] * DT_H)); loose -= k; ice += k
        # 6) brine runs off to the drain, or tires spray it (and loose crystals) onto the shoulder
        qw, qs = water * out_f, salt * out_f
        sw, ss, sc = water * spray_f, salt * spray_f, crystals * spray_f
        water -= qw + sw; salt -= qs + ss; crystals -= sc
        roadside += ss + sc; drained += qs
        # 7) the storm drain: runoff flow and its chloride level
        flow = qw / 1000 / mix * s["catchment_m2"] / DT_H                          # liters per hour
        if qw > 1e-3:
            f = qs / (qs + qw)
            cl = f * (1 + 0.72 * f) * 1e6 * CL_SHARE * mix + s["baseline_cl_mg_L"]
        else:
            cl = float("nan")                                                       # drain is dry
        icy = tc < 0 and ice >= ICY_G
        icy_h += DT_H if icy else 0
        rows.append(dict(hour=round(t, 3), temp_F=round(temp_at(t, s), 1), truck_pass=truck, loose_snow_mm=loose / 1000,
                         bonded_ice_mm=ice / 1000, brine_mm=water / 1000,
                         brine_salt_pct=100 * salt / (salt + water) if water > 0 else 0.0,
                         salt_crystals_g_m2=crystals, drain_flow_L_h=flow, cl_true_mg_L=cl, icy=icy))

    lb = LB_PER_LANE_MILE
    summary = dict(salt_per_pass_lb=per_pass * lb, salt_applied_lb_per_lane_mile=applied * lb,
                   icy_hours=icy_h, salt_to_drain_pct=100 * drained / max(applied, 1e-9),
                   salt_to_roadside_pct=100 * roadside / max(applied, 1e-9),
                   salt_left_on_road_pct=100 * (crystals + salt) / max(applied, 1e-9))
    if with_sensor:
        add_sensor_trace(rows, summary, s)
    return rows, summary


def add_sensor_trace(rows, summary, s):
    """Run the probe over the drain trace and let Saltback estimate how much salt washed past it."""
    rng = np.random.default_rng(s["seed"])
    cl = np.array([r["cl_true_mg_L"] for r in rows])
    flow = np.array([r["drain_flow_L_h"] for r in rows])
    wet = ~np.isnan(cl)
    reading, maxed, est, _ = sensor(np.where(wet, cl, s["baseline_cl_mg_L"]), s, rng)
    for r, rd, mx, e, w in zip(rows, reading, maxed, est, wet):
        r.update(reading_mS_cm=rd if w else float("nan"), probe_maxed=bool(mx and w),
                 cl_measured_mg_L=e if w else float("nan"))
    true_load = np.nansum(np.where(wet, cl - s["baseline_cl_mg_L"], 0) * flow) * DT_H      # mg chloride
    seen_load = np.nansum(np.where(wet, np.maximum(est - s["baseline_cl_mg_L"], 0), 0) * flow) * DT_H
    vol = flow[wet].sum() * DT_H
    summary.update(peak_cl_mg_L=float(np.nanmax(cl)) if wet.any() else 0.0,
                   avg_cl_mg_L=float(np.nansum(np.where(wet, cl, 0) * flow) * DT_H / vol) if vol else 0.0,
                   hours_probe_maxed=float((maxed & wet).sum() * DT_H),
                   hours_drain_flowing=float(wet.sum() * DT_H),
                   salt_seen_vs_true_pct=100 * seen_load / true_load if true_load else 100.0)


def find_needed(s, max_lb=600, step=10):
    """Smallest salt-per-pass that keeps the road about as safe as a very heavy dose would.
    Returns (needed_lb_per_pass, sweep) where sweep lists icy hours and chloride for each dose tried."""
    sweep = []
    for lb in range(0, max_lb + 1, step):
        _, sm = storm_timeline(s, lb, with_sensor=False)
        sweep.append(dict(salt_per_pass_lb=lb, total_lb_per_lane_mile=sm["salt_applied_lb_per_lane_mile"],
                          icy_hours=sm["icy_hours"],
                          chloride_released_lb_per_lane_mile=sm["salt_applied_lb_per_lane_mile"] * CL_SHARE))
    best = sweep[-1]["icy_hours"] + 0.5           # within 30 minutes of the safest possible result
    needed = next(r["salt_per_pass_lb"] for r in sweep if r["icy_hours"] <= best)
    return needed, sweep


def storm_card(s, summary, needed_lb):
    """Saltback's one-line verdict for the storm, like the pitch's storm card."""
    applied = summary["salt_per_pass_lb"]
    excess = max(0.0, 100 * (applied - needed_lb) / applied) if applied else 0.0
    rec = math.ceil(needed_lb * 1.1 / 10) * 10                 # recommend the need plus a 10% safety margin
    change = 100 * (rec - applied) / applied if applied else 0.0
    avg = summary.get("avg_cl_mg_L", 0)
    level = "LOW" if avg < CL_LIMITS[0] else "MODERATE" if avg < CL_LIMITS[1] else "HIGH"
    return dict(route_salt_lb=summary["salt_applied_lb_per_lane_mile"] * s["route_lane_miles"],
                excess_pct=excess, chloride_level=level, recommended_per_pass_lb=rec,
                recommended_change_pct=round(change / 5) * 5, needed_per_pass_lb=needed_lb)
