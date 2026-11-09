/* Saltback physics model - JavaScript twin of ../model.py (same equations, same settings).
   check_parity.py runs both and confirms they agree. Works in the browser (window.Saltback) and in Node. */
(function (root) {
  'use strict';

  const SETTINGS = {
    pavement_temp_F: 22, ice_film_mm: 0.2, scatter_loss: 0.20, later_water_mm: 5.0, unsalted_share: 0.30,
    baseline_cl_mg_L: 50, water_temp_C: 1.0, probe_max_mS_cm: 20.0, probe_noise: 0.03, temp_probe_error_C: 0.5,
    use_temp_probe: true, salt_price_per_ton: 90, seed: 1,
    storm_hours: 8, snowfall_in: 4, snow_ratio: 12, first_pass_h: 0.5, plow_every_h: 2, salt_per_pass_lb: 220,
    temp_after_F: 38, drain_per_h: 0.3, traffic_loss_per_h: 0.05, bond_per_h: 0.5, brine_film_mm: 0.04, catchment_m2: 400,
    route_lane_miles: 10,
  };

  // Fixed science (reference tables)
  const CL_SHARE = 35.45 / 58.44;
  const LANE_MILE_M2 = 1609.34 * 3.658;
  const LB_PER_LANE_MILE = LANE_MILE_M2 / 453.59;
  const BRINE_PCT = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 23.3];
  const FREEZE_C = [0, -0.59, -1.19, -1.79, -2.41, -3.05, -3.70, -4.38, -5.08, -5.81,
    -6.56, -8.18, -9.94, -11.89, -14.04, -16.46, -19.18, -21.1];
  const NEG_FREEZE = FREEZE_C.map(v => -v);
  const NACL_G_L = [0, 0.584, 2.92, 5.84, 29.2, 58.4, 117, 234, 317];
  const EC25 = [0, 1.185, 5.55, 10.67, 47.0, 85.8, 145, 214, 251];
  const ALPHA_TRUE = 0.021, ALPHA_ASSUMED = 0.02;

  // Step 2 constants
  const DT_H = 5 / 60, EUTECTIC_C = FREEZE_C[FREEZE_C.length - 1], PLOW_CLEAR = 0.95;
  const ICY_G = 50, NATURAL_MELT = 300, CL_LIMITS = [230, 860];
  const NEEDED_TOLERANCE_H = 0.25, SAFETY_SLACK_H = 0.1, CANT_FIX_H = 2.0, MAX_STEP_DOWN = 0.25, MAX_LB = 600, TOO_COLD_F = 15;
  const PESSIMISTIC = { brine_film_mm: 0.06, drain_per_h: 0.5, bond_per_h: 1.0 };   // top of the realistic ranges
  const pessimistic = s => { const o = { ...s }; for (const k in PESSIMISTIC) o[k] = Math.max(s[k], PESSIMISTIC[k]); return o; };

  function interp(x, xs, ys) {            // same as numpy.interp (clamps at both ends)
    if (x <= xs[0]) return ys[0];
    const n = xs.length;
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 1;
    while (xs[i] < x) i++;
    return ys[i - 1] + (x - xs[i - 1]) / (xs[i] - xs[i - 1]) * (ys[i] - ys[i - 1]);
  }
  const fToC = f => (f - 32) * 5 / 9;

  function brineStrengthNeeded(tc) {
    if (tc >= 0) return 0;
    if (tc < EUTECTIC_C) return NaN;
    return interp(-tc, NEG_FREEZE, BRINE_PCT) / 100;
  }
  function iceMeltedPerSalt(tc) {
    const w = brineStrengthNeeded(tc);
    return Number.isNaN(w) ? 0 : (1 - w) / w;
  }
  const chlorideToConductivity = (cl, wc, a = ALPHA_TRUE) => interp(cl / CL_SHARE / 1000, NACL_G_L, EC25) * (1 + a * (wc - 25));
  const conductivityToChloride = (ec, wc, a = ALPHA_ASSUMED) => interp(ec / (1 + a * (wc - 25)), EC25, NACL_G_L) * CL_SHARE * 1000;

  function rngFrom(seed) {                // small seeded generator + bell-curve noise
    let a = seed >>> 0;
    const uni = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { normal: () => Math.sqrt(-2 * Math.log(1 - uni())) * Math.cos(2 * Math.PI * uni()) };
  }

  function sensor(clTrue, s, rng) {
    const ec = chlorideToConductivity(clTrue, s.water_temp_C);
    let reading = ec * (1 + s.probe_noise * rng.normal());
    const maxed = reading >= s.probe_max_mS_cm;
    reading = Math.min(reading, s.probe_max_mS_cm);
    const tempRead = s.water_temp_C + s.temp_probe_error_C * rng.normal();
    const noFix = conductivityToChloride(reading, 25);
    const est = s.use_temp_probe ? conductivityToChloride(reading, tempRead) : noFix;
    return { reading, maxed, est, noFix };
  }

  // ---------- STEP 1: one storm, all at once (equilibrium) ----------
  function equilibrium(s, doseLb) {
    const dose = doseLb / LB_PER_LANE_MILE, tc = fToC(s.pavement_temp_F), ice = s.ice_film_mm * 1000;
    const w = brineStrengthNeeded(tc), onRoad = dose * (1 - s.scatter_loss);
    const melted = tc >= 0 ? ice : Math.min(ice, onRoad * iceMeltedPerSalt(tc));
    let needed, excess;
    if (Number.isNaN(w)) { needed = Infinity; excess = dose; }
    else { needed = w > 0 ? ice * w / (1 - w) / (1 - s.scatter_loss) : 0; excess = Math.max(dose - needed, 0); }
    return {
      salt_applied_lb_per_lane_mile: doseLb, salt_needed_lb_per_lane_mile: needed * LB_PER_LANE_MILE,
      ice_cleared_pct: 100 * melted / ice, excess_pct: dose > 0 ? 100 * excess / dose : 0,
    };
  }

  // ---------- STEP 2: the storm over time ----------
  function tempAt(t, s) {
    if (t < s.storm_hours) return s.pavement_temp_F;
    return s.pavement_temp_F + (s.temp_after_F - s.pavement_temp_F) * Math.min(1, (t - s.storm_hours) / 6);
  }
  const dissolveMinutes = tc => tc >= 0 ? 5.0 : 15 * Math.exp(-0.12 * tc);
  const pyRound = x => { const r = Math.round(x); return (Math.abs(x % 1) === 0.5 && r % 2) ? r - 1 : r; };

  function stormTimeline(s, perPassLb, withSensor = true) {
    const perPass = (perPassLb == null ? s.salt_per_pass_lb : perPassLb) / LB_PER_LANE_MILE;
    const hours = s.storm_hours + 24;
    const snowPerH = s.snowfall_in * 25.4 / s.snow_ratio * 1000 / s.storm_hours;
    const every = Math.max(1, pyRound(s.plow_every_h / DT_H)), first = pyRound(s.first_pass_h / DT_H);
    const outF = 1 - Math.exp(-s.drain_per_h * DT_H), sprayF = 1 - Math.exp(-s.traffic_loss_per_h * DT_H);
    const mix = 1 - s.unsalted_share;
    let loose = 0, ice = 0, crystals = 0, water = 0, salt = 0;
    let applied = 0, roadside = 0, drained = 0, icyH = 0;
    const rows = [], n = pyRound(hours / DT_H);
    for (let i = 0; i < n; i++) {
      const t = i * DT_H, tc = fToC(tempAt(t, s)), storming = t < s.storm_hours;
      if (storming) { if (tc < 0) loose += snowPerH * DT_H; else water += snowPerH * DT_H; }
      const truck = storming && i >= first && (i - first) % every === 0;
      if (truck) {
        loose *= 1 - PLOW_CLEAR;
        applied += perPass; roadside += perPass * s.scatter_loss; crystals += perPass * (1 - s.scatter_loss);
      }
      if (crystals > 0 && loose + ice + water > 0 && tc > EUTECTIC_C) {
        const d = crystals * (1 - Math.exp(-DT_H * 60 / dissolveMinutes(tc)));
        crystals -= d; salt += d;
      }
      let m;
      if (tc >= 0) m = Math.min(loose + ice, NATURAL_MELT * tc * DT_H);
      else {
        const w = brineStrengthNeeded(tc);
        const target = Number.isNaN(w) ? 0 : salt * (1 - w) / w;
        m = water < target ? Math.min(loose + ice, target - water) : -(water - target);
      }
      if (m >= 0) { const fromIce = Math.min(ice, m); ice -= fromIce; loose -= m - fromIce; water += m; }
      else { water += m; ice -= m; }
      if (tc < 0 && water < s.brine_film_mm * 1000) { const k = loose * (1 - Math.exp(-s.bond_per_h * DT_H)); loose -= k; ice += k; }
      const qw = water * outF, qs = salt * outF, sw = water * sprayF, ss = salt * sprayF, sc = crystals * sprayF;
      water -= qw + sw; salt -= qs + ss; crystals -= sc; roadside += ss + sc; drained += qs;
      const flow = qw / 1000 / mix * s.catchment_m2 / DT_H;
      let cl = NaN;
      if (qw > 1e-3) { const f = qs / (qs + qw); cl = f * (1 + 0.72 * f) * 1e6 * CL_SHARE * mix + s.baseline_cl_mg_L; }
      const icy = tc < 0 && ice >= ICY_G;
      if (icy) icyH += DT_H;
      rows.push({
        hour: t, temp_F: tempAt(t, s), truck_pass: truck, storming, loose_snow_mm: loose / 1000, bonded_ice_mm: ice / 1000,
        brine_mm: water / 1000, brine_salt_pct: water > 0 ? 100 * salt / (salt + water) : 0,
        salt_crystals_g_m2: crystals, drain_flow_L_h: flow, cl_true_mg_L: cl, icy,
      });
    }
    const lb = LB_PER_LANE_MILE, A = Math.max(applied, 1e-9);
    const summary = {
      salt_per_pass_lb: perPass * lb, salt_applied_lb_per_lane_mile: applied * lb, icy_hours: icyH,
      salt_to_drain_pct: 100 * drained / A, salt_to_roadside_pct: 100 * roadside / A,
      salt_left_on_road_pct: 100 * (crystals + salt) / A,
    };
    if (withSensor) addSensorTrace(rows, summary, s);
    return { rows, summary };
  }

  function addSensorTrace(rows, summary, s) {
    const rng = rngFrom(s.seed);
    let trueLoad = 0, seenLoad = 0, vol = 0, clVol = 0, peak = 0, maxedH = 0, wetH = 0;
    for (const r of rows) {
      const wet = !Number.isNaN(r.cl_true_mg_L);
      const o = sensor(wet ? r.cl_true_mg_L : s.baseline_cl_mg_L, s, rng);
      r.reading_mS_cm = wet ? o.reading : NaN;
      r.probe_maxed = o.maxed && wet;
      r.cl_measured_mg_L = wet ? o.est : NaN;
      if (!wet) continue;
      wetH += DT_H; if (o.maxed) maxedH += DT_H;
      peak = Math.max(peak, r.cl_true_mg_L);
      trueLoad += (r.cl_true_mg_L - s.baseline_cl_mg_L) * r.drain_flow_L_h * DT_H;
      seenLoad += Math.max(o.est - s.baseline_cl_mg_L, 0) * r.drain_flow_L_h * DT_H;
      vol += r.drain_flow_L_h * DT_H; clVol += r.cl_true_mg_L * r.drain_flow_L_h * DT_H;
    }
    Object.assign(summary, {
      peak_cl_mg_L: peak, avg_cl_mg_L: vol ? clVol / vol : 0, hours_probe_maxed: maxedH, hours_drain_flowing: wetH,
      salt_seen_vs_true_pct: trueLoad ? 100 * seenLoad / trueLoad : 100,
    });
  }

  function findNeeded(s, maxLb = MAX_LB, step = 10) {
    const sweep = [];
    for (let lb = 0; lb <= maxLb; lb += step) {
      const sm = stormTimeline(s, lb, false).summary;
      sweep.push({ salt_per_pass_lb: lb, total_lb_per_lane_mile: sm.salt_applied_lb_per_lane_mile, icy_hours: sm.icy_hours,
        chloride_released_lb_per_lane_mile: sm.salt_applied_lb_per_lane_mile * CL_SHARE });
    }
    const best = sweep[sweep.length - 1].icy_hours + NEEDED_TOLERANCE_H;
    return { needed: sweep.find(r => r.icy_hours <= best).salt_per_pass_lb, sweep };
  }
  function icyAt(s, sweep, lb) {
    const hit = sweep.find(r => r.salt_per_pass_lb === lb);
    return hit ? hit.icy_hours : stormTimeline(s, lb, false).summary.icy_hours;
  }
  /* Saltback's advice for one storm with the safety check built in (see recommend_rate in model.py). */
  function recommendRate(s, sweep, needed, icyActual, applied, robust = true) {
    const best = sweep[sweep.length - 1].icy_hours;
    if (best > CANT_FIX_H) return { cant_fix: true, target: null, next: null, icy_target: null, icy_next: null, best_icy: best };
    const limit = icyActual + SAFETY_SLACK_H;
    let target = Math.min(MAX_LB, Math.ceil(needed * 1.1 / 10) * 10);
    while (target < MAX_LB && icyAt(s, sweep, target) > limit) target += 10;
    if (icyAt(s, sweep, target) > limit && applied > 0) target = applied;
    if (robust && target < applied) {   // must also be no icier than the crew in the pessimistic world
      const ps = pessimistic(s), limitP = stormTimeline(ps, applied, false).summary.icy_hours + SAFETY_SLACK_H;
      while (target < applied && stormTimeline(ps, target, false).summary.icy_hours > limitP) target += 10;
      target = Math.min(target, applied);
    }
    const next = target < applied ? Math.max(target, Math.ceil(applied * (1 - MAX_STEP_DOWN) / 10) * 10) : target;
    return { cant_fix: false, target, next, icy_target: icyAt(s, sweep, target), icy_next: icyAt(s, sweep, next), best_icy: best };
  }
  function stormCard(s, summary, neededLb, sweep) {
    const applied = summary.salt_per_pass_lb, rec = recommendRate(s, sweep, neededLb, summary.icy_hours, applied);
    const route = summary.salt_applied_lb_per_lane_mile * s.route_lane_miles;
    let excess = null, status = 'cant_fix';
    const tooCold = s.pavement_temp_F < TOO_COLD_F && (rec.cant_fix || rec.target > applied);
    if (tooCold) { Object.assign(rec, { target: null, next: null, icy_target: null, icy_next: null }); status = 'too_cold'; }
    else if (!rec.cant_fix) {
      excess = applied ? Math.max(0, 100 * (applied - rec.target) / applied) : 0;
      status = rec.target > applied ? 'under' : excess >= 10 ? 'over' : 'ok';
    }
    const change = r => (applied && r != null ? pyRound(100 * (r - applied) / applied / 5) * 5 : null);
    return { status, route_salt_lb: route, needed_per_pass_lb: neededLb, target_per_pass_lb: rec.target, next_per_pass_lb: rec.next,
      excess_pct: excess, target_change_pct: change(rec.target), next_change_pct: change(rec.next),
      icy_actual_h: summary.icy_hours, icy_target_h: rec.icy_target, icy_next_h: rec.icy_next, best_icy_h: rec.best_icy,
      chloride_released_lb: route * CL_SHARE, chloride_to_drain_lb: route * summary.salt_to_drain_pct / 100 * CL_SHARE,
      peak_x_stream_limit: (summary.peak_cl_mg_L || 0) / CL_LIMITS[1] };
  }

  const api = { SETTINGS, CL_SHARE, LB_PER_LANE_MILE, DT_H, ICY_G, CL_LIMITS, MAX_LB, CANT_FIX_H, SAFETY_SLACK_H, MAX_STEP_DOWN, TOO_COLD_F, PESSIMISTIC, pessimistic, fToC, brineStrengthNeeded, iceMeltedPerSalt,
    chlorideToConductivity, recommendRate, icyAt,
    equilibrium, stormTimeline, findNeeded, stormCard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Saltback = api;
})(typeof window !== 'undefined' ? window : globalThis);
