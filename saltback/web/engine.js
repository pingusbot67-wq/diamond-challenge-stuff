/* Saltback System engine: turns storm records (truck logs + drain-probe readings) into salt-reduction feedback.

   Input: a list of storm records. Each record is one storm on one route:
     date, route, lane_miles, pavement_temp_F, snowfall_in, storm_hours, salt_per_pass_lb,
     first_pass_h, plow_every_h, temp_after_F, probe_max_mS_cm,
     measured_drain_salt_lb (salt the drain probe accounted for, whole route), probe_maxed_h
   Output (analyze): per-storm verdicts, season totals, what was learned about the route,
     a prioritized list of recommendations, and a crew rate card.

   The physics comes from model.js (the same model as model.py). This file only adds the decision logic. */
(function (root) {
  'use strict';
  const S = root.Saltback || require('./model.js');

  const BANDS = [
    { label: '28–32°F', lo: 28, hi: 33, mid: 30 },
    { label: '23–27°F', lo: 23, hi: 28, mid: 25 },
    { label: '18–22°F', lo: 18, hi: 23, mid: 20 },
    { label: '13–17°F', lo: 13, hi: 18, mid: 15 },
    { label: 'Below 13°F', lo: -60, hi: 13, mid: 9 },
  ];
  const SNOW = [{ label: 'Light', inches: 2 }, { label: 'Moderate', inches: 4 }, { label: 'Heavy', inches: 8 }];
  const FIELDS = ['pavement_temp_F', 'snowfall_in', 'storm_hours', 'salt_per_pass_lb', 'first_pass_h', 'plow_every_h',
    'temp_after_F', 'probe_max_mS_cm'];
  const ON_TIME_H = 0.5;          // a first pass within 30 minutes counts as on time
  const MAX_LB = 600;             // search ceiling for salt per pass

  const bandOf = t => (t >= 33 ? null : BANDS.find(b => t >= b.lo && t < b.hi));
  const recommend = needed => (needed > 0 ? Math.ceil(needed * 1.1 / 10) * 10 : 0);   // need + 10% safety margin
  const median = xs => { const a = [...xs].sort((p, q) => p - q), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const num = v => (v === '' || v == null || Number.isNaN(+v) ? null : +v);

  function settingsFor(rec, extra) {
    const s = { ...S.SETTINGS };
    for (const k of FIELDS) if (num(rec[k]) != null) s[k] = +rec[k];
    s.route_lane_miles = num(rec.lane_miles) ?? s.route_lane_miles;
    return { ...s, ...extra };
  }
  const passesFor = s => S.stormTimeline(s, 1, false).summary.salt_applied_lb_per_lane_mile;   // 1 lb per pass -> count

  /* ---- 1) Learn from the drain probe: does the salt reaching the drain match what the truck log says? ---- */
  function calibrate(records) {
    const ratios = [];
    for (const r of records) {
      const measured = num(r.measured_drain_salt_lb), maxed = num(r.probe_maxed_h) ?? 0;
      if (measured == null || maxed > 0.5 || !(num(r.salt_per_pass_lb) > 0)) continue;   // a maxed probe undercounts
      const s = settingsFor(r), sm = S.stormTimeline(s).summary;
      const expected = sm.salt_applied_lb_per_lane_mile * s.route_lane_miles * sm.salt_to_drain_pct / 100 * sm.salt_seen_vs_true_pct / 100;
      if (expected > 1) ratios.push(measured / expected);
    }
    const base = S.SETTINGS.scatter_loss;
    if (ratios.length < 3) return { n: ratios.length, factor: null, scatter: base, spreader: 1, note: 'not enough unclipped probe data yet' };
    const k = median(ratios);
    if (k < 0.95) return { n: ratios.length, factor: k, scatter: Math.min(0.6, 1 - (1 - base) * k), spreader: 1, note: 'less salt reaches the drain than the logs predict' };
    if (k > 1.05) return { n: ratios.length, factor: k, scatter: base, spreader: k, note: 'more salt reaches the drain than the logs say was spread' };
    return { n: ratios.length, factor: k, scatter: base, spreader: 1, note: 'drain readings match the truck logs' };
  }

  /* ---- 2) Judge each storm ---- */
  function analyzeStorm(r, cal) {
    const s = settingsFor(r, { scatter_loss: cal.scatter });
    const perPass = s.salt_per_pass_lb, lm = s.route_lane_miles;
    const { summary: sm } = S.stormTimeline(s);
    const { needed, sweep } = S.findNeeded(s, MAX_LB);
    const passes = passesFor(s), rec = recommend(needed);
    const atNeed = sweep.find(x => x.salt_per_pass_lb === needed);
    const applied = perPass * passes * lm, recTotal = rec * passes * lm;
    const excess = perPass > 0 ? Math.max(0, 100 * (perPass - needed) / perPass) : 0;
    const out = {
      record: r, settings: s, passes, needed, rec, applied, recTotal, excess,
      change: perPass > 0 ? 100 * (rec - perPass) / perPass : null,
      icy: sm.icy_hours, icyAtNeed: atNeed.icy_hours, icyNoSalt: sweep[0].icy_hours,
      avgCl: sm.avg_cl_mg_L, peakCl: sm.peak_cl_mg_L,
      level: sm.avg_cl_mg_L < S.CL_LIMITS[0] ? 'LOW' : sm.avg_cl_mg_L < S.CL_LIMITS[1] ? 'MODERATE' : 'HIGH',
      band: bandOf(s.pavement_temp_F), cappedNeed: needed >= MAX_LB,
      maxedH: num(r.probe_maxed_h) ?? sm.hours_probe_maxed,
      lateExtra: 0, feedback: [], verdict: '',
    };
    out.under = perPass < needed && sm.icy_hours > atNeed.icy_hours + 0.5;
    out.plan = recTotal;                       // Saltback's plan for this storm: on-time start + the right rate
    const atRec = sweep.find(x => x.salt_per_pass_lb === rec);
    out.icyPlan = atRec ? atRec.icy_hours : S.stormTimeline(s, rec, false).summary.icy_hours;
    if (s.first_pass_h > ON_TIME_H + 0.25 && s.storm_hours > ON_TIME_H + 1) {
      const s2 = { ...s, first_pass_h: ON_TIME_H }, n2 = S.findNeeded(s2, MAX_LB).needed;
      out.onTimeRec = recommend(n2);
      out.plan = out.onTimeRec * passesFor(s2) * lm;
      out.lateExtra = Math.max(0, recTotal - out.plan);
      out.icyPlan = S.stormTimeline(s2, out.onTimeRec, false).summary.icy_hours;
    }
    out.saving = Math.max(0, applied - out.plan);
    out.adding = Math.max(0, out.plan - applied);
    // plain-English verdict and storm-level feedback
    if (s.pavement_temp_F >= 33) out.verdict = 'Road above freezing: no salt was needed.';
    else if (out.under) out.verdict = `Under-salted: the road was icy ${fmtH(out.icy)}. ${rec} lb per pass would cut that to ${fmtH(out.icyAtNeed)}.`;
    else if (out.excess >= 10) out.verdict = `${Math.round(out.excess)}% more salt than the storm needed. ${rec} lb per pass would have been as safe.`;
    else out.verdict = 'Salt matched what the storm needed.';
    if (out.lateExtra > 0) out.feedback.push(`The first truck came after ${fmtH(s.first_pass_h)}. Arriving within 30 minutes would have allowed ${out.onTimeRec} lb per pass and saved about ${Math.round(out.lateExtra).toLocaleString('en-US')} lb.`);
    if (out.maxedH > 1) out.feedback.push(`The drain probe was maxed out for ${fmtH(out.maxedH)}, so this storm's runoff was undercounted.`);
    if (out.cappedNeed) out.feedback.push('Salt alone barely keeps up at this temperature. Consider sand or a stronger chemical.');
    if (out.level === 'HIGH') out.feedback.push(`Storm-average chloride in the drain was ${Math.round(out.avgCl).toLocaleString('en-US')} mg/L, above the EPA short-term limit for streams (860 mg/L).`);
    return out;
  }
  const fmtH = h => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

  /* ---- 3) Crew rate card: recommended lb per lane-mile per pass, by road temperature and snowfall ---- */
  function rateCard(cal, storms) {
    const rows = BANDS.map(b => {
      const cells = SNOW.map(sn => {
        const s = { ...S.SETTINGS, scatter_loss: cal.scatter, pavement_temp_F: b.mid, snowfall_in: sn.inches,
          storm_hours: 8, first_pass_h: ON_TIME_H, plow_every_h: 2 };
        const n = S.findNeeded(s, MAX_LB).needed;
        return { lb: recommend(n), capped: n >= MAX_LB };
      });
      const inBand = storms.filter(x => x.band === b);
      return { band: b, cells, habit: inBand.length ? inBand.reduce((a, x) => a + x.settings.salt_per_pass_lb, 0) / inBand.length : null, n: inBand.length };
    });
    return { snow: SNOW, rows };
  }

  /* ---- 4) Prioritized recommendations ---- */
  function recommendations(storms, cal, card, price) {
    const recs = [], usd = lb => lb / 2000 * price;
    for (const row of card.rows) {
      const inBand = storms.filter(x => x.band === row.band && !x.under && x.lateExtra === 0);
      const save = inBand.reduce((a, x) => a + (x.lateExtra > 0 ? 0 : x.saving), 0);
      if (inBand.length && save > 0) {
        const avgUsed = inBand.reduce((a, x) => a + x.settings.salt_per_pass_lb, 0) / inBand.length;
        const avgRec = inBand.reduce((a, x) => a + x.rec, 0) / inBand.length;
        if (avgUsed > avgRec * 1.1) recs.push({ type: 'Rate', title: `Lower the rate when the road is ${row.band.label}`,
          detail: `Crews averaged ${Math.round(avgUsed)} lb per lane-mile per pass in ${inBand.length} storm${inBand.length > 1 ? 's' : ''}. About ${Math.round(avgRec)} lb kept the road just as safe in the model.`,
          lb: save, usd: usd(save) });
      }
    }
    const under = storms.filter(x => x.under && x.adding > 0);
    if (under.length) recs.push({ type: 'Safety', title: 'Raise the rate on the coldest storms',
      detail: `${under.length} storm${under.length > 1 ? 's were' : ' was'} under-salted (${under.map(x => x.record.date).join(', ')}). Even with an on-time start, these need the rate card's higher cold-weather rates. This adds salt but removes icy hours.`,
      lb: -under.reduce((a, x) => a + x.adding, 0), usd: null, safety: true });
    const late = storms.filter(x => x.lateExtra > 0);
    if (late.length) { const lb = late.reduce((a, x) => a + x.lateExtra, 0);
      recs.push({ type: 'Timing', title: 'Get the first truck out within 30 minutes of snowfall',
        detail: `${late.length} storm${late.length > 1 ? 's' : ''} started late (${late.map(x => x.record.date).join(', ')}). Once traffic packs snow into ice, salt has to melt it instead of preventing it. Starting on time, those storms would have needed ${Math.round(lb).toLocaleString('en-US')} lb less salt to stay safe.`,
        lb, usd: usd(lb) }); }
    if (cal.factor != null && cal.factor < 0.95) recs.push({ type: 'Spreader', title: 'Pre-wet the salt to stop it bouncing off the road',
      detail: `The drain sees only ${Math.round(cal.factor * 100)}% of the salt the logs predict, so about ${Math.round(cal.scatter * 100)}% is landing on the shoulder instead of ${Math.round(S.SETTINGS.scatter_loss * 100)}%. Wetting salt with brine at the spinner keeps more of it on the road.`,
      lb: null, usd: null });
    if (cal.factor != null && cal.factor > 1.05) recs.push({ type: 'Spreader', title: 'Recalibrate the spreader',
      detail: `The drain sees about ${Math.round(cal.factor * 100)}% of the salt the truck log reports. The spreader is probably putting out more than its setting.`,
      lb: null, usd: null });
    const maxed = storms.filter(x => x.maxedH > 1);
    if (maxed.length) recs.push({ type: 'Sensor', title: 'Use a high-range (K=10) drain probe',
      detail: `The probe hit its 20 mS/cm limit in ${maxed.length} of ${storms.length} storms, so Saltback could not measure the saltiest runoff. A K=10 probe reads up to 200 mS/cm.`, lb: null, usd: null });
    const total = storms.reduce((a, x) => a + x.applied, 0), save = total - storms.reduce((a, x) => a + x.plan, 0);
    recs.push({ type: 'Permit', title: 'Report chloride for the stormwater (MS4) permit',
      detail: `This season released about ${Math.round(total * S.CL_SHARE).toLocaleString('en-US')} lb of chloride on this route. Following Saltback's plan would ${save >= 0 ? 'cut' : 'raise'} that by ${Math.round(Math.abs(save) * S.CL_SHARE).toLocaleString('en-US')} lb.`,
      lb: null, usd: null });
    const order = { Safety: 0, Rate: 1, Timing: 1, Spreader: 2, Sensor: 3, Permit: 4 };
    return recs.sort((a, b) => order[a.type] - order[b.type] || (b.lb ?? 0) - (a.lb ?? 0));
  }

  function analyze(records, opts = {}) {
    const price = opts.price ?? S.SETTINGS.salt_price_per_ton;
    const cal = calibrate(records);
    const storms = records.map(r => analyzeStorm(r, cal));
    const card = rateCard(cal, storms);
    const applied = storms.reduce((a, x) => a + x.applied, 0), plan = storms.reduce((a, x) => a + x.plan, 0);
    const cut = storms.reduce((a, x) => a + x.saving, 0), add = storms.reduce((a, x) => a + x.adding, 0), net = applied - plan;
    const season = {
      storms: storms.length, applied, plan, cut, add, net, reductionPct: applied ? 100 * net / applied : 0,
      usd: net / 2000 * price, chlorideAvoided: net * S.CL_SHARE, chloride: applied * S.CL_SHARE,
      icyNow: storms.reduce((a, x) => a + x.icy, 0), icyPlan: storms.reduce((a, x) => a + x.icyPlan, 0),
      over: storms.filter(x => x.excess >= 10).length, under: storms.filter(x => x.under).length,
    };
    return { storms, season, calibration: cal, rateCard: card, recommendations: recommendations(storms, cal, card, price) };
  }

  /* ---- Example season: 12 storms on one route, generated with the model (clearly simulated data) ----
     The hidden truth: 28% of the salt bounces off the road (the model assumes 20%), and the crew raises
     the rate a little on cold days, but not in proportion to the physics. The engine has to discover both from the data. */
  const EXAMPLE = [
    ['2026-12-03', 29, 2.0, 5, 200, 0.5, 36, 20], ['2026-12-11', 24, 4.5, 9, 230, 0.5, 34, 20],
    ['2026-12-19', 18, 6.0, 12, 300, 1.5, 33, 20], ['2026-12-28', 31, 1.0, 4, 200, 0.25, 40, 20],
    ['2027-01-06', 21, 3.5, 7, 260, 0.5, 35, 20], ['2027-01-15', 14, 8.0, 14, 360, 0.75, 34, 200],
    ['2027-01-22', 26, 3.0, 6, 230, 0.5, 38, 200], ['2027-02-02', 10, 5.0, 10, 400, 0.5, 34, 200],
    ['2027-02-09', 23, 2.5, 6, 240, 1.0, 35, 200], ['2027-02-17', 28, 4.0, 8, 210, 0.5, 37, 200],
    ['2027-02-26', 19, 7.0, 13, 300, 0.5, 36, 200], ['2027-03-08', 30, 1.5, 4, 200, 0.5, 42, 200],
  ];
  function exampleSeason() {
    return EXAMPLE.map(([date, t, sn, h, lb, first, after, probe], i) => {
      const rec = { id: `ex${i + 1}`, source: 'example', date, route: 'Route 4', lane_miles: 10, pavement_temp_F: t, snowfall_in: sn,
        storm_hours: h, salt_per_pass_lb: lb, first_pass_h: first, plow_every_h: 2, temp_after_F: after, probe_max_mS_cm: probe };
      const truth = settingsFor(rec, { scatter_loss: 0.28, seed: 11 + i });
      const sm = S.stormTimeline(truth).summary;
      rec.measured_drain_salt_lb = Math.round(sm.salt_applied_lb_per_lane_mile * 10 * sm.salt_to_drain_pct / 100 * sm.salt_seen_vs_true_pct / 100);
      rec.probe_maxed_h = +sm.hours_probe_maxed.toFixed(2);
      return rec;
    });
  }

  /* A finished simulator run becomes a storm record, exactly as a real drain node + truck log would provide. */
  function recordFromRun(s, summary, n) {
    return { id: `sim${Date.now()}`, source: 'simulator', date: `Sim run ${n}`, route: 'Simulator', lane_miles: s.route_lane_miles,
      pavement_temp_F: s.pavement_temp_F, snowfall_in: s.snowfall_in, storm_hours: s.storm_hours, salt_per_pass_lb: s.salt_per_pass_lb,
      first_pass_h: s.first_pass_h, plow_every_h: s.plow_every_h, temp_after_F: s.temp_after_F, probe_max_mS_cm: s.probe_max_mS_cm,
      measured_drain_salt_lb: Math.round(summary.salt_applied_lb_per_lane_mile * s.route_lane_miles * summary.salt_to_drain_pct / 100 * summary.salt_seen_vs_true_pct / 100),
      probe_maxed_h: +summary.hours_probe_maxed.toFixed(2) };
  }

  const CSV_COLUMNS = ['date', 'route', 'lane_miles', 'pavement_temp_F', 'snowfall_in', 'storm_hours', 'salt_per_pass_lb', 'first_pass_h',
    'plow_every_h', 'temp_after_F', 'probe_max_mS_cm', 'measured_drain_salt_lb', 'probe_maxed_h'];
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    const head = lines[0].split(',').map(h => h.trim());
    const need = ['date', 'pavement_temp_F', 'snowfall_in', 'storm_hours', 'salt_per_pass_lb'];
    const missing = need.filter(c => !head.includes(c));
    if (missing.length) throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    return lines.slice(1).map((l, i) => {
      const v = l.split(','), rec = { id: `csv${Date.now()}_${i}`, source: 'csv' };
      head.forEach((h, j) => { rec[h] = ['date', 'route'].includes(h) ? (v[j] || '').trim() : num(v[j]); });
      rec.route = rec.route || 'Route 1'; rec.lane_miles = rec.lane_miles ?? 10;
      return rec;
    });
  }

  const api = { analyze, exampleSeason, recordFromRun, parseCSV, CSV_COLUMNS, BANDS, SNOW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaltbackEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
