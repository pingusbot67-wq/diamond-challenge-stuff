/* Saltback System engine: turns storm records (truck logs + drain-probe readings) into salt-reduction feedback.

   Input: a list of storm records, one storm on one route each:
     date, route, lane_miles, pavement_temp_F, snowfall_in, storm_hours, salt_per_pass_lb,
     first_pass_h, plow_every_h, temp_after_F, probe_max_mS_cm,
     measured_drain_salt_lb (salt the drain probe accounted for, whole route), probe_maxed_h
   Output (analyze): per-storm verdicts with a safety check, season totals split by lever, a comparison with a
     crew following a published state rate chart, what was learned about the route, ranked recommendations,
     and a crew rate card.

   Physics comes from model.js (identical to model.py). This file only adds the decision logic. */
(function (root) {
  'use strict';
  const S = root.Saltback || require('./model.js');

  /* Approximate published dry-salt rates, lb per lane-mile per application, moderate snow.
     Compiled from: NHDOT Snow and Ice Control Operational Guidelines (2020); MnDOT Snow and Ice Control Handbook
     for Snowplow Operators (2022); Wisconsin/Iowa guidance summarized in UW-Madison report CR19-01 (2021).
     State guides advise against dry salt below about 15°F. Values are approximate ranges, not one official chart. */
  const PUBLISHED_SOURCE = 'Approximate ranges compiled from NHDOT Snow and Ice Control Operational Guidelines (2020), the MnDOT Snow and Ice Control Handbook (2022) and UW-Madison report CR19-01 (2021).';
  const BANDS = [
    { label: '28–32°F', lo: 28, hi: 33, mid: 30, pub: [100, 200] },
    { label: '23–27°F', lo: 23, hi: 28, mid: 25, pub: [100, 200] },
    { label: '18–22°F', lo: 18, hi: 23, mid: 20, pub: [200, 300] },
    { label: '13–17°F', lo: 13, hi: 18, mid: 15, pub: [300, 400], note: 'Dry salt is not recommended below about 15°F.' },
    { label: 'Below 13°F', lo: -60, hi: 13, mid: 9, pub: null, note: 'State guides recommend sand or a stronger chemical.' },
  ];
  const SNOW = [{ label: 'Light', inches: 2 }, { label: 'Moderate', inches: 4 }, { label: 'Heavy', inches: 8 }];
  const FIELDS = ['pavement_temp_F', 'snowfall_in', 'storm_hours', 'salt_per_pass_lb', 'first_pass_h', 'plow_every_h',
    'temp_after_F', 'probe_max_mS_cm'];
  const ON_TIME_H = 0.5;          // a first pass within 30 minutes counts as on time
  /* Robust safety check. Saltback's rate must be no icier than the crew's both under its best-estimate physics and
     in a pessimistic world: brine runs off faster, more brine is needed to stop bonding, traffic packs snow faster.
     These are the top of the realistic ranges tested in uncertainty.js. */
  const PESSIMISTIC = S.PESSIMISTIC, pessimistic = S.pessimistic;
  const icyOf = (s, rate) => S.stormTimeline(s, rate, false).summary.icy_hours;
  function robustRate(s, rate, crewS, crewRate) {   // raise `rate` until it is no icier than the crew in the pessimistic world
    const ps = pessimistic(s), limit = icyOf(pessimistic(crewS), crewRate) + S.SAFETY_SLACK_H;
    while (rate < Math.max(crewRate, MAX_LB) && icyOf(ps, rate) > limit) rate += 10;
    return rate;
  }
  const MAX_LB = S.MAX_LB;

  const bandOf = t => (t >= 33 ? null : BANDS.find(b => t >= b.lo && t < b.hi));
  const chartRate = b => (!b ? 0 : b.pub ? (b.pub[0] + b.pub[1]) / 2 : 400);   // a crew following the state chart
  const median = xs => { if (!xs.length) return 0; const a = [...xs].sort((p, q) => p - q), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const num = v => (v === '' || v == null || Number.isNaN(+v) ? null : +v);
  const fmtH = h => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);
  const lb = v => Math.round(v).toLocaleString('en-US');

  function settingsFor(rec, extra) {
    const s = { ...S.SETTINGS };
    for (const k of FIELDS) if (num(rec[k]) != null) s[k] = +rec[k];
    s.route_lane_miles = num(rec.lane_miles) ?? s.route_lane_miles;
    return { ...s, ...extra };
  }
  const passesFor = s => S.stormTimeline(s, 1, false).summary.salt_applied_lb_per_lane_mile;   // 1 lb per pass -> count

  /* ---- 1) Learn from the drain probe: does the salt reaching the drain match what the truck log says? ---- */
  function calibrate(records, model = {}) {
    const ratios = [];
    for (const r of records) {
      const measured = num(r.measured_drain_salt_lb), maxed = num(r.probe_maxed_h) ?? 0;
      if (measured == null || maxed > 0.5 || !(num(r.salt_per_pass_lb) > 0)) continue;   // a maxed probe undercounts
      const s = settingsFor(r, model), sm = S.stormTimeline(s).summary;
      const expected = sm.salt_applied_lb_per_lane_mile * s.route_lane_miles * sm.salt_to_drain_pct / 100 * sm.salt_seen_vs_true_pct / 100;
      if (expected > 1) ratios.push(measured / expected);
    }
    const base = model.scatter_loss ?? S.SETTINGS.scatter_loss;
    if (ratios.length < 3) return { n: ratios.length, factor: null, scatter: base, spreader: 1, note: 'not enough unclipped probe data yet' };
    const k = median(ratios);
    if (k < 0.95) return { n: ratios.length, factor: k, scatter: Math.min(0.6, 1 - (1 - base) * k), spreader: 1, note: 'less salt reaches the drain than the truck logs predict' };
    if (k > 1.05) return { n: ratios.length, factor: k, scatter: base, spreader: k, note: 'more salt reaches the drain than the truck logs say was spread' };
    return { n: ratios.length, factor: k, scatter: base, spreader: 1, note: 'drain readings match the truck logs' };
  }

  /* ---- 2) Judge each storm. Saltback's plan never leaves the road more than 6 minutes icier than it was. ---- */
  const TOO_COLD_F = S.TOO_COLD_F;   // state guides advise against more dry salt below about 15°F
  function analyzeStorm(r, cal, model = {}, i = 0, robust = true) {
    const s = settingsFor(r, { ...model, scatter_loss: cal.scatter });
    const perPass = s.salt_per_pass_lb, lm = s.route_lane_miles;
    const sm = S.stormTimeline(s).summary;
    const { needed, sweep } = S.findNeeded(s, MAX_LB);
    const passes = passesFor(s), applied = perPass * passes * lm;
    const rec = S.recommendRate(s, sweep, needed, sm.icy_hours, perPass, robust);
    const x = {
      i, record: r, settings: s, sweep, needed, passes, applied, perPass, summary: sm, band: bandOf(s.pavement_temp_F),
      icy: sm.icy_hours, icyNoSalt: sweep[0].icy_hours, bestIcy: rec.best_icy, maxedH: num(r.probe_maxed_h) ?? sm.hours_probe_maxed,
      chloride: applied * S.CL_SHARE, chlorideDrain: applied * sm.salt_to_drain_pct / 100 * S.CL_SHARE, peakX: sm.peak_cl_mg_L / S.CL_LIMITS[1],
      advice: [],
    };
    // Stage 1: the right rate at the crew's actual timing.
    x.target = rec.cant_fix ? null : rec.target;
    x.rateTotal = rec.cant_fix ? applied : rec.target * passes * lm;
    x.icyRate = rec.cant_fix ? sm.icy_hours : rec.icy_target;
    x.next = rec.next;
    // Stage 2: what an on-time first truck would change.
    x.plan = x.rateTotal; x.icyPlan = x.icyRate; x.planRate = x.target; x.late = false;
    if (s.first_pass_h > ON_TIME_H + 0.25 && s.storm_hours > ON_TIME_H + 1) {
      x.late = true;
      const s2 = { ...s, first_pass_h: ON_TIME_H }, f2 = S.findNeeded(s2, MAX_LB);
      const r2 = S.recommendRate(s2, f2.sweep, f2.needed, sm.icy_hours, perPass, robust);
      if (!r2.cant_fix) {
        if (robust) { r2.target = robustRate(s2, r2.target, s, perPass); r2.icy_target = icyOf(s2, r2.target); }
        const tot2 = r2.target * passesFor(s2) * lm;
        if (rec.cant_fix || tot2 < x.rateTotal || r2.icy_target < x.icyRate - 0.1) {
          x.onTime = { rate: r2.target, total: tot2, icy: r2.icy_target };
          x.plan = tot2; x.icyPlan = r2.icy_target; x.planRate = r2.target;
        }
      }
    }
    // Status, in plain words.
    const tooCold = s.pavement_temp_F < TOO_COLD_F && !x.onTime && (rec.cant_fix || x.target > perPass);
    if (tooCold) {   // more rock salt is the wrong tool: keep the crew's amount, advise sand or a stronger chemical
      x.status = 'too_cold'; x.target = null; x.next = null; x.rateTotal = applied; x.icyRate = sm.icy_hours;
      x.plan = applied; x.icyPlan = sm.icy_hours; x.planRate = perPass;
    } else if (rec.cant_fix && !x.onTime) x.status = 'cant_fix';
    else if (x.onTime) x.status = 'late';
    else if (x.target > perPass) x.status = 'under';
    else if (perPass > 0 && (perPass - x.target) / perPass >= 0.1) x.status = 'over';
    else x.status = 'ok';
    x.excessPct = x.status === 'over' || x.status === 'ok' ? Math.max(0, 100 * (perPass - x.target) / perPass) : null;
    x.nextChangePct = x.next != null && perPass ? 100 * (x.next - perPass) / perPass : null;
    // Levers (lb of salt on the route): rate changes at the crew's timing, then the effect of an on-time first truck.
    // For a storm an on-time first truck fixes, the whole change counts as the timing lever.
    const rateEnd = x.onTime ? applied : x.rateTotal;
    x.rateCut = Math.max(0, applied - rateEnd); x.rateAdd = Math.max(0, rateEnd - applied);
    x.timingCut = Math.max(0, rateEnd - x.plan); x.timingAdd = Math.max(0, x.plan - rateEnd);
    // The first step Saltback actually tells the crew: cuts capped at 25% (checked again after the next storm),
    // safety increases in full, an on-time first truck where that is what fixes the storm.
    if (x.status === 'cant_fix' || x.status === 'too_cold') { x.stepRate = perPass; x.stepTotal = applied; x.icyStep = x.icy; }
    else if (x.onTime) {
      const s2 = { ...s, first_pass_h: ON_TIME_H }, p2 = passesFor(s2);
      x.stepRate = Math.max(x.onTime.rate, Math.ceil(perPass * (1 - S.MAX_STEP_DOWN) / 10) * 10);
      x.stepTotal = x.stepRate * p2 * lm; x.icyStep = S.stormTimeline(s2, x.stepRate, false).summary.icy_hours;
    } else { x.stepRate = x.next; x.stepTotal = x.next * passes * lm; x.icyStep = S.icyAt(s, sweep, x.next); }
    // A crew that follows the published state chart, with the same truck timing.
    x.chartRate = chartRate(x.band); x.chartTotal = x.chartRate * passes * lm;
    x.chartIcy = S.stormTimeline(s, x.chartRate, false).summary.icy_hours;

    const cold = s.pavement_temp_F < 15, freezeAfter = s.temp_after_F < 32, rainFirst = s.pavement_temp_F >= 32;
    if (x.status === 'too_cold') {
      x.verdict = `Too cold for rock salt to work well (${s.pavement_temp_F}°F). The road was icy for ${fmtH(x.icy)}; more salt is not the answer.`;
      x.advice.push('Below about 15°F, state guides recommend sand for traction or a stronger chemical such as calcium chloride, not more rock salt.');
      x.advice.push('Pre-treat with brine before the storm while the pavement is still warmer.');
    } else if (x.status === 'cant_fix') {
      x.verdict = `Salt alone couldn't keep this road clear: still icy ${fmtH(rec.best_icy)} even at ${MAX_LB} lb per lane-mile.`;
      if (rainFirst && freezeAfter) x.advice.push('Time a salt or brine pass just before the temperature drops; salt spread during the rain washes away.');
      if (freezeAfter && !rainFirst) x.advice.push('The road stayed below freezing after the storm. Plan a clean-up pass and pre-treat with brine before the next drop.');
      if (cold) x.advice.push('Below about 15°F, use sand for traction or a stronger chemical (calcium or magnesium chloride).');
      x.advice.push('Pre-treat with brine before the storm so snow cannot bond to the pavement.');
    } else if (x.status === 'late') {
      x.verdict = `The first truck came after ${fmtH(s.first_pass_h)}${rec.cant_fix ? ", and salt couldn't catch up" : ''}. Starting within 30 minutes, ${x.onTime.rate} lb per lane-mile would have kept icy time to ${fmtH(x.onTime.icy)} instead of ${fmtH(x.icy)}.`;
      x.advice.push('Get the first truck out within 30 minutes of the first snow.');
    } else if (x.status === 'under') {
      x.verdict = `Under-salted: icy for ${fmtH(x.icy)}. ${x.target} lb per lane-mile would cut that to ${fmtH(x.icyRate)}.`;
      x.advice.push(`Next time, use ${x.next} lb per lane-mile.`);
    } else if (x.status === 'over') {
      x.verdict = `Used ${perPass} lb per lane-mile. ${x.target} would have kept the road just as clear, even if the road behaves worse than expected. Next time, try ${x.next}.`;
      x.advice.push(`Try ${x.next} lb per lane-mile next time (${Math.round(-x.nextChangePct)}% less); Saltback will check the result.`);
    } else {
      x.verdict = `Used about the right amount (${perPass} lb per lane-mile).`;
    }
    if (x.late && x.status !== 'late') x.advice.push(`The first truck came after ${fmtH(s.first_pass_h)}. Arriving within 30 minutes would help.`);
    if (x.maxedH > 1) x.advice.push(`The drain probe hit its limit for ${fmtH(x.maxedH)}, so this storm's runoff was undercounted.`);
    return x;
  }

  /* ---- 3) Crew rate card: Saltback's rate by road temperature and snowfall, checked against the state charts ---- */
  function rateCard(cal, storms, model = {}) {
    const rows = BANDS.map(b => {
      const cells = SNOW.map(sn => {
        const s = { ...S.SETTINGS, ...model, scatter_loss: cal.scatter, pavement_temp_F: b.mid, snowfall_in: sn.inches, storm_hours: 8, first_pass_h: ON_TIME_H, plow_every_h: 2 };
        const { needed, sweep } = S.findNeeded(s, MAX_LB);
        const cantFix = sweep[sweep.length - 1].icy_hours > S.CANT_FIX_H || b.mid < TOO_COLD_F;
        // Need + 10%; where that is below the state chart, raise it until it is no icier than the chart's rate
        // even in the pessimistic world (the same safety idea as for each storm, anchored to published practice).
        let v = cantFix ? null : Math.min(MAX_LB, Math.ceil(needed * 1.1 / 10) * 10);
        const mid = chartRate(b);
        if (v != null && v < mid) { const ps = pessimistic(s), lim = icyOf(ps, mid) + S.SAFETY_SLACK_H; while (v < mid && icyOf(ps, v) > lim) v += 10; }
        const flag = v == null || !b.pub ? null : v < b.pub[0] ? 'below' : v > b.pub[1] ? 'above' : 'within';
        return { lb: v, cantFix, flag };
      });
      const inBand = storms.filter(x => x.band === b);
      return { band: b, cells, habit: inBand.length ? inBand.reduce((a, x) => a + x.perPass, 0) / inBand.length : null, n: inBand.length };
    });
    return { snow: SNOW, rows, source: PUBLISHED_SOURCE, tooColdF: TOO_COLD_F };
  }

  /* ---- 4) Ranked recommendations: what to do, why, impact (lb, $, icy minutes), how sure we are ---- */
  const LEVEL = ['low', 'medium', 'high'];
  function recommendations(storms, cal, card, price) {
    const recs = [], usd = v => v / 2000 * price;
    const under = storms.filter(x => x.status === 'under');
    if (under.length) {
      const add = under.reduce((a, x) => a + x.rateAdd, 0), mins = under.reduce((a, x) => a + (x.icy - x.icyRate) * 60, 0);
      const veryCold = under.some(x => x.settings.pavement_temp_F < 15);
      recs.push({ id: 'safety', type: 'Safety', title: 'Use more salt on the coldest storms',
        why: `In ${under.length === 1 ? 'one storm' : `${under.length} storms`} the road stayed icy longer than it had to. Saltback's rate for those temperatures removes most of that icy time.${veryCold ? ' Below about 15°F, state guides suggest switching to sand or a stronger chemical instead of more rock salt.' : ''}`,
        impact: { lb: -add, usd: -usd(add), icyMin: -mins }, confidence: 'medium', confidenceWhy: 'depends on how fast traffic packs snow into ice, the least certain input', storms: under.map(x => x.i) });
    }
    for (const row of card.rows) {
      const inBand = storms.filter(x => x.band === row.band && x.status === 'over' && !x.late);
      if (!inBand.length) continue;
      const cut = inBand.reduce((a, x) => a + x.rateCut, 0); if (cut <= 0) continue;
      const used = inBand.reduce((a, x) => a + x.perPass, 0) / inBand.length, tgt = inBand.reduce((a, x) => a + x.target, 0) / inBand.length;
      const mins = inBand.reduce((a, x) => a + (x.icyRate - x.icy) * 60, 0);
      let lvl = inBand.length >= 3 ? 2 : inBand.length === 2 ? 1 : 0;
      const belowChart = row.band.pub && tgt < row.band.pub[0];
      if (belowChart) lvl = Math.max(0, lvl - 1);
      recs.push({ id: `rate-${row.band.mid}`, type: 'Rate', title: `Use about ${Math.round(tgt / 10) * 10} lb per lane-mile when the road is ${row.band.label}`,
        why: `Crews used about ${Math.round(used)} in ${inBand.length === 1 ? 'one storm' : `${inBand.length} storms`}. The road stayed just as clear at Saltback's rate.${belowChart ? ' This is below the published state range, so cut in steps of 25% and let Saltback check each storm.' : ''}`,
        impact: { lb: cut, usd: usd(cut), icyMin: mins }, confidence: LEVEL[lvl],
        confidenceWhy: `${inBand.length} storm${inBand.length > 1 ? 's' : ''} of evidence${belowChart ? '; below the state chart' : ''}`, storms: inBand.map(x => x.i), band: row.band });
    }
    const late = storms.filter(x => x.onTime);
    if (late.length) {
      const save = late.reduce((a, x) => a + x.timingCut - x.timingAdd, 0), mins = late.reduce((a, x) => a + (x.icyPlan - x.icy) * 60, 0);
      recs.push({ id: 'timing', type: 'Timing', title: 'Get the first truck out within 30 minutes of the first snow',
        why: `In ${late.length === 1 ? 'one storm' : `${late.length} storms`} the first truck came 1–2 hours in. Traffic packed the snow into ice before the salt arrived, and salt then can't catch up.`,
        impact: { lb: save, usd: usd(save), icyMin: mins }, confidence: 'medium', confidenceWhy: 'depends on how fast traffic packs snow into ice', storms: late.map(x => x.i) });
    }
    const stuck = storms.filter(x => x.status === 'cant_fix' || x.status === 'too_cold');
    if (stuck.length) recs.push({ id: 'cantfix', type: 'Plan ahead', title: 'Plan differently for storms salt can\'t handle',
      why: 'Some storms stayed icy whatever the rock-salt rate: rain followed by a hard freeze, or pavement below about 15°F. Pre-treating with brine, timing a pass just before the freeze, and sand or a stronger chemical such as calcium chloride work better there.',
      impact: { lb: null, usd: null, icyMin: stuck.reduce((a, x) => a + x.icy * 60, 0), icyLabel: 'icy minutes salt could not prevent' },
      confidence: 'medium', confidenceWhy: 'the model covers plain rock salt only', storms: stuck.map(x => x.i) });
    if (cal.factor != null && cal.factor < 0.95) {
      const extra = storms.reduce((a, x) => a + x.applied, 0) * (cal.scatter - S.SETTINGS.scatter_loss);
      recs.push({ id: 'prewet', type: 'Equipment', title: 'Pre-wet the salt so less bounces off the road',
        why: `The drain sees about ${Math.round(cal.factor * 100)}% of the salt the truck logs predict, so about ${Math.round(cal.scatter * 100)}% lands on the shoulder instead of ${Math.round(S.SETTINGS.scatter_loss * 100)}%. Wetting salt with brine at the spinner keeps more of it on the road.`,
        impact: { lb: extra, usd: usd(extra), icyMin: null, lbLabel: 'salt landing on the shoulder' }, confidence: cal.n >= 5 ? 'high' : 'medium', confidenceWhy: `${cal.n} storms of drain data`, storms: [] });
    }
    if (cal.factor != null && cal.factor > 1.05) recs.push({ id: 'spreader', type: 'Equipment', title: 'Recalibrate the spreader',
      why: `The drain sees about ${Math.round(cal.factor * 100)}% of the salt the truck log reports, so the spreader is probably putting out more than its setting.`,
      impact: { lb: null, usd: null, icyMin: null }, confidence: cal.n >= 5 ? 'high' : 'medium', confidenceWhy: `${cal.n} storms of drain data`, storms: [] });
    const maxed = storms.filter(x => x.maxedH > 1);
    if (maxed.length) recs.push({ id: 'sensor', type: 'Equipment', title: 'Use a high-range drain probe',
      why: `The probe hit its limit in ${maxed.length} of ${storms.length} storms, so the saltiest runoff went uncounted. A high-range probe reads ten times higher.`,
      impact: { lb: null, usd: null, icyMin: null }, confidence: 'high', confidenceWhy: 'measured directly', storms: maxed.map(x => x.i) });
    const total = storms.reduce((a, x) => a + x.chloride, 0), plan = storms.reduce((a, x) => a + x.plan * S.CL_SHARE, 0);
    recs.push({ id: 'permit', type: 'Reporting', title: 'Use these numbers in the stormwater (MS4) report',
      why: `This season put about ${lb(total / 2000)} tons of chloride onto the route. Saltback's plan would have put ${lb(plan / 2000)} tons.`,
      impact: { lb: null, usd: null, icyMin: null, chlorideLb: total - plan }, confidence: 'medium', confidenceWhy: 'simulated loads; real probe data would replace them', storms: [] });
    const order = { Safety: 0, Rate: 1, Timing: 1, 'Plan ahead': 2, Equipment: 3, Reporting: 4 };
    return recs.sort((a, b) => order[a.type] - order[b.type] || (b.impact.lb ?? 0) - (a.impact.lb ?? 0));
  }

  function analyze(records, opts = {}) {
    const price = opts.price ?? S.SETTINGS.salt_price_per_ton, model = opts.model || {};
    const cal = calibrate(records, model);
    const robust = opts.robust !== false;
    const storms = records.map((r, i) => analyzeStorm(r, cal, model, i, robust));
    const med = median(storms.map(x => x.chloride));
    storms.forEach(x => { const q = med ? x.chloride / med : 1; x.chlorideVsTypical = q < 0.75 ? 'lower than usual' : q > 1.33 ? 'higher than usual' : 'typical'; });
    const card = opts.skipRateCard ? null : rateCard(cal, storms, model);
    const sum = f => storms.reduce((a, x) => a + f(x), 0);
    const applied = sum(x => x.applied), plan = sum(x => x.plan), chartTotal = sum(x => x.chartTotal);
    const season = {
      storms: storms.length, applied, plan, net: applied - plan, reductionPct: applied ? 100 * (applied - plan) / applied : 0,
      rateCut: sum(x => x.rateCut), rateAdd: sum(x => x.rateAdd), timingCut: sum(x => x.timingCut), timingAdd: sum(x => x.timingAdd),
      rateOnlyPct: applied ? 100 * (sum(x => x.rateCut) - sum(x => x.rateAdd)) / applied : 0,
      step: sum(x => x.stepTotal), stepPct: applied ? 100 * (applied - sum(x => x.stepTotal)) / applied : 0, icyStep: sum(x => x.icyStep),
      usd: (applied - plan) / 2000 * price, chloride: applied * S.CL_SHARE, chloridePlan: plan * S.CL_SHARE, chlorideAvoided: (applied - plan) * S.CL_SHARE,
      chlorideMedian: med, icyNow: sum(x => x.icy), icyPlan: sum(x => x.icyPlan),
      chartTotal, chartIcy: sum(x => x.chartIcy), vsChartPct: chartTotal ? 100 * (chartTotal - plan) / chartTotal : 0,
      over: storms.filter(x => x.status === 'over').length, under: storms.filter(x => x.status === 'under').length,
      late: storms.filter(x => x.status === 'late' || x.late).length, cantFix: storms.filter(x => x.status === 'cant_fix' || x.status === 'too_cold').length,
      worstSafetyMin: Math.max(0, ...storms.map(x => (x.icyPlan - x.icy) * 60)), robust,
    };
    return { storms, season, calibration: cal, rateCard: card, recommendations: card ? recommendations(storms, cal, card, price) : [], price };
  }

  /* How much salt one storm needs depending on when the first truck arrives (for the timing recommendation). */
  function lateTruckCurve(base, mins = [0, 30, 60, 90, 120]) {
    return mins.map(m => { const s = { ...base, first_pass_h: m / 60 }, { needed, sweep } = S.findNeeded(s, MAX_LB);
      return { minutes: m, needed, cantFix: sweep[sweep.length - 1].icy_hours > S.CANT_FIX_H }; });
  }

  /* ---- Example season: 12 storms on one route, generated with the model (clearly simulated data) ----
     Hidden truth by default: 28% of the salt bounces off the road (the engine assumes 20%), and the crew raises
     the rate a little on cold days, but not in proportion to the physics. `truth` can change more hidden inputs. */
  const EXAMPLE = [
    ['2026-12-03', 29, 2.0, 5, 200, 0.5, 36, 20], ['2026-12-11', 24, 4.5, 9, 230, 0.5, 34, 20],
    ['2026-12-19', 18, 6.0, 12, 300, 1.5, 33, 20], ['2026-12-28', 31, 1.0, 4, 200, 0.25, 40, 20],
    ['2027-01-06', 21, 3.5, 7, 260, 0.5, 35, 20], ['2027-01-15', 14, 8.0, 14, 360, 0.75, 34, 200],
    ['2027-01-22', 26, 3.0, 6, 230, 0.5, 38, 200], ['2027-02-02', 10, 5.0, 10, 400, 0.5, 34, 200],
    ['2027-02-09', 23, 2.5, 6, 240, 1.0, 35, 200], ['2027-02-17', 28, 4.0, 8, 210, 0.5, 37, 200],
    ['2027-02-26', 19, 7.0, 13, 300, 0.5, 36, 200], ['2027-03-08', 30, 1.5, 4, 200, 0.5, 42, 200],
  ];
  function exampleSeason(truth = { scatter_loss: 0.28 }) {
    return EXAMPLE.map(([date, t, sn, h, perPass, first, after, probe], i) => {
      const rec = { id: `ex${i + 1}`, source: 'example', date, route: 'Route 4', lane_miles: 10, pavement_temp_F: t, snowfall_in: sn,
        storm_hours: h, salt_per_pass_lb: perPass, first_pass_h: first, plow_every_h: 2, temp_after_F: after, probe_max_mS_cm: probe };
      const sm = S.stormTimeline(settingsFor(rec, { ...truth, seed: 11 + i })).summary;
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

  const api = { analyze, analyzeStorm, calibrate, exampleSeason, recordFromRun, parseCSV, lateTruckCurve, settingsFor, robustRate, pessimistic,
    CSV_COLUMNS, BANDS, SNOW, PUBLISHED_SOURCE, ON_TIME_H, PESSIMISTIC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaltbackEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
