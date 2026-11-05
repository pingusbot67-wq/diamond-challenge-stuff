"""Saltback physics model - STEP 1: one storm, one stretch of road, one storm drain.

Follows the salt along its whole path:
    truck -> road (melts ice) -> runoff -> storm drain -> sensor reading -> Saltback's estimate

Everything is "per square meter of road", so results do not depend on road size.
SETTINGS holds typical published values (ASSUMPTIONS, not measured data); change them freely.
"""
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
    salt_price_per_ton=90,    # US$ per short ton of road salt, delivered                 (range 60 to 130)
    seed=1,                   # fixes the random sensor noise so runs are repeatable
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
