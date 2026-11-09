/* Saltback report layer: example storms, one function that runs a storm through the model AND the decision engine,
   and the tables (with native chart specs) that the site shows and exports to Excel / Google Sheets / CSV. */
(function (root) {
  'use strict';
  const S = root.Saltback || require('./model.js');
  const E = root.SaltbackEngine || require('./engine.js');

  /* ---- Example storms, each a set of changes from the default settings ---- */
  const SCENARIOS = [
    { id: 'overnight', name: 'Overnight snow', desc: '4 in over 8 h at 22°F. The default storm.', s: {} },
    { id: 'dusting', name: 'Light dusting', desc: '1 in over 4 h near freezing. Often salted like a full storm.', s: { pavement_temp_F: 30, snowfall_in: 1, storm_hours: 4, temp_after_F: 40 } },
    { id: 'wet', name: 'Heavy wet snow', desc: '8 in of dense snow over 10 h at 29°F.', s: { pavement_temp_F: 29, snowfall_in: 8, snow_ratio: 8, storm_hours: 10, temp_after_F: 38 } },
    { id: 'noreaster', name: "Nor'easter", desc: '14 in over 18 h at 26°F, plowed every 90 minutes.', s: { pavement_temp_F: 26, snowfall_in: 14, storm_hours: 18, plow_every_h: 1.5, temp_after_F: 36 } },
    { id: 'cold', name: 'Arctic cold snap', desc: '3 in at 10°F; the road stays frozen afterwards.', s: { pavement_temp_F: 10, snowfall_in: 3, storm_hours: 8, temp_after_F: 18, salt_per_pass_lb: 300 } },
    { id: 'late', name: 'Late first truck', desc: 'The overnight snow, but the first truck arrives after 2 hours.', s: { first_pass_h: 2 } },
    { id: 'heavyhand', name: 'Heavy-handed crew', desc: 'A moderate 3 in storm at 24°F, salted at 400 lb per lane-mile.', s: { pavement_temp_F: 24, snowfall_in: 3, storm_hours: 6, salt_per_pass_lb: 400 } },
    { id: 'flash', name: 'Rain to flash freeze', desc: 'Rain on a 34°F road, then the pavement drops to 20°F.', s: { pavement_temp_F: 34, snowfall_in: 3, storm_hours: 6, temp_after_F: 20 } },
    { id: 'k10', name: 'High-range probe', desc: 'The overnight snow measured with a high-range drain probe.', s: { probe_max_mS_cm: 200 } },
  ];
  const scenarioSettings = sc => ({ ...S.SETTINGS, ...sc.s });
  const STATUS = { over: 'Over-salted', ok: 'About right', under: 'Under-salted', late: 'Late first truck', cant_fix: "Salt alone couldn't fix it", too_cold: 'Too cold for rock salt' };

  /* ---- Run one storm: the 5-minute model plus Saltback's verdict (same engine logic as the season) ---- */
  function computeRun(s) {
    const { rows, summary } = S.stormTimeline(s);
    rows.forEach(r => { r.ec_true = Number.isNaN(r.cl_true_mg_L) ? NaN : S.chlorideToConductivity(r.cl_true_mg_L, s.water_temp_C); });
    const record = { date: 'run', source: 'run', lane_miles: s.route_lane_miles };
    const verdict = E.analyzeStorm(record, { n: 0, factor: null, scatter: s.scatter_loss, spreader: 1 }, { ...s }, 0);
    const late = s.first_pass_h + 1 < s.storm_hours ? S.findNeeded({ ...s, first_pass_h: s.first_pass_h + 1 }).needed : null;
    const hiProbe = s.probe_max_mS_cm < 200 && summary.hours_probe_maxed > 0.5 ? S.stormTimeline({ ...s, probe_max_mS_cm: 200 }).summary.salt_seen_vs_true_pct : null;
    return { s: { ...s }, rows, summary, x: verdict, sweep: verdict.sweep, late, hiProbe };
  }
  const computeLibrary = () => SCENARIOS.map(sc => ({ sc, res: computeRun(scenarioSettings(sc)) }));

  /* ---- Tables. Each: {key, name, title, rows:[header, ...], charts:[...]} ---- */
  const r1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
  const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const r3 = v => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  const r0 = v => (Number.isFinite(v) ? Math.round(v) : null);
  const min = h => (Number.isFinite(h) ? Math.round(h * 60) : null);
  const INK = '#2B3038', GREY = '#9AA1AA', BRAND = '#5B45C2', SAVE = '#1D7A4F', RISK = '#C0352B', WATER = '#2B6CB0', ICE = '#7AA6CF';

  function runTables(run, label) {
    const { s, rows, sweep, summary: sm, x } = run;
    const summary = { key: 'runSummary', name: 'Run summary', title: `Storm report: ${label}`, rows: [['Item', 'Value', 'Unit'],
      ['Storm', label, ''], ['Road surface temperature', s.pavement_temp_F, '°F'], ['Snowfall', s.snowfall_in, 'in'], ['Storm length', s.storm_hours, 'h'],
      ['First truck after', min(s.first_pass_h), 'min'], ['Route size', s.route_lane_miles, 'lane-miles'], ['Verdict', STATUS[x.status], ''],
      ['Salt spread', r0(x.applied), 'lb'], ['Salt per pass', s.salt_per_pass_lb, 'lb per lane-mile'], ['Passes', x.passes, ''],
      ["Saltback's rate", x.target, 'lb per lane-mile'], ['Excess', r0(x.excessPct), '%'], ['Next storm: try', x.next, 'lb per lane-mile'],
      ['Icy time as salted', min(x.icy), 'min'], ["Icy time at Saltback's rate", min(x.icyPlan), 'min'], ['Icy time with no salt', min(x.icyNoSalt), 'min'],
      ['Chloride released', r0(x.chloride), 'lb'], ['Chloride reaching the drain', r0(x.chlorideDrain), 'lb'], ['Peak drain chloride', r1(x.peakX), '× EPA short-term stream limit (860 mg/L)'],
      ['Salt to storm drain', r1(sm.salt_to_drain_pct), '%'], ['Salt to shoulder and soil', r1(sm.salt_to_roadside_pct), '%'],
      ['Hours probe at its limit', r2(sm.hours_probe_maxed), 'h'], ['Salt the probe accounted for', r1(sm.salt_seen_vs_true_pct), '%']] };
    const tl = [['Hour', 'Pavement temp (°F)', 'Truck pass', 'Loose snow (mm)', 'Bonded ice (mm)', 'Brine (mm)', 'Brine salt (%)', 'Salt crystals (g/m²)',
      'Drain flow (L/h)', 'Chloride true (mg/L)', 'Probe reading (mS/cm)', 'Probe at limit', 'Chloride measured (mg/L)', 'Road icy']];
    rows.forEach(r => tl.push([r3(r.hour), r1(r.temp_F), r.truck_pass ? 1 : 0, r3(r.loose_snow_mm), r3(r.bonded_ice_mm), r3(r.brine_mm), r2(r.brine_salt_pct),
      r2(r.salt_crystals_g_m2), r2(r.drain_flow_L_h), r0(r.cl_true_mg_L), r2(r.reading_mS_cm), r.probe_maxed ? 1 : 0, r0(r.cl_measured_mg_L), r.icy ? 1 : 0]));
    const timeline = { key: 'timeline', name: 'Run timeline', title: 'Storm timeline, 5-minute steps (raw model output)', rows: tl, charts: [
      { type: 'scatter', title: 'Chloride in the storm drain', x: { col: 0, title: 'Hours since snow started' }, y: { title: 'Chloride (mg/L, log scale)', log: true, min: 10 },
        series: [{ col: 9, name: 'True', color: GREY, dash: true }, { col: 12, name: 'Probe estimate', color: INK }], at: [15, 1, 10, 20] },
      { type: 'scatter', title: 'Road surface', x: { col: 0, title: 'Hours since snow started' }, y: { title: 'Thickness (mm of water)' },
        series: [{ col: 3, name: 'Loose snow', color: GREY }, { col: 4, name: 'Bonded ice', color: ICE }, { col: 5, name: 'Brine', color: WATER }], at: [15, 22, 10, 20] }] };
    const dose = { key: 'dose', name: 'Salt vs safety', title: 'Same storm at every salt rate: hours of icy road', rows: [['Salt per pass (lb per lane-mile)', 'Salt per storm (lb per lane-mile)', 'Hours icy', 'Chloride released (lb per lane-mile)']]
      .concat(sweep.map(r => [r.salt_per_pass_lb, r0(r.total_lb_per_lane_mile), r2(r.icy_hours), r0(r.chloride_released_lb_per_lane_mile)])), charts: [
      { type: 'scatter', title: 'More salt stops buying safety past Saltback\'s rate', x: { col: 0, title: 'Salt per pass (lb per lane-mile)' }, y: { title: 'Hours icy', min: 0 }, series: [{ col: 2, name: 'Hours icy', color: INK }], at: [5, 1, 10, 20] }] };
    const left = Math.max(0, 100 - sm.salt_to_drain_pct - sm.salt_to_roadside_pct);
    const split = { key: 'split', name: 'Where the salt went', title: 'Where the salt went', rows: [['Destination', 'Share (%)', 'Salt (lb)'],
      ['Storm drain', r1(sm.salt_to_drain_pct), r0(sm.salt_to_drain_pct / 100 * x.applied)], ['Shoulder and soil', r1(sm.salt_to_roadside_pct), r0(sm.salt_to_roadside_pct / 100 * x.applied)],
      ['Still on road', r1(left), r0(left / 100 * x.applied)]],
      charts: [{ type: 'bar', dir: 'bar', title: 'Where the salt went (lb)', cat: { col: 0 }, y: { title: 'lb of salt', min: 0 }, series: [{ col: 2, name: 'Salt (lb)', color: INK }], at: [4, 1, 8, 14] }] };
    return [summary, timeline, dose, split];
  }

  const PUBLISHED = { 30: 46.3, 25: 14.4, 20: 8.6, 15: 6.3, 10: 4.9, 5: 4.1, 0: 3.7 };
  function meltTable() {
    const rows = [['Pavement temp (°F)', 'Model: lb of ice per lb of salt', 'Published chart']];
    for (let t = 0; t <= 30; t++) rows.push([t, r2(S.iceMeltedPerSalt(S.fToC(t))), PUBLISHED[t] ?? null]);
    return { key: 'melt', name: 'Melt capacity', title: 'Ice one pound of salt can melt: model against the published chart', rows, charts: [
      { type: 'scatter', title: 'Colder road, much less ice melted per pound', x: { col: 0, title: 'Pavement temperature (°F)' }, y: { title: 'lb of ice per lb of salt', min: 0, max: 60 },
        series: [{ col: 1, name: 'Saltback model', color: INK }, { col: 2, name: 'Published chart', color: BRAND, markers: true }], at: [4, 1, 10, 20] }] };
  }

  function libraryTable(lib) {
    const rows = [['Storm', 'Description', 'Road (°F)', 'Snow (in)', 'Storm (h)', 'First truck (min)', 'Salt per pass', "Saltback's rate", 'Next storm: try', 'Verdict',
      'Excess (%)', 'Icy as salted (min)', "Icy at Saltback's rate (min)", 'Salt spread (lb)', 'Chloride released (lb)', 'Peak drain chloride (× stream limit)', 'Probe at limit (h)']];
    lib.forEach(({ sc, res }) => { const { s, x, summary: sm } = res;
      rows.push([sc.name, sc.desc, s.pavement_temp_F, s.snowfall_in, s.storm_hours, min(s.first_pass_h), s.salt_per_pass_lb, x.planRate ?? null, x.next ?? null, STATUS[x.status],
        r0(x.excessPct), min(x.icy), min(x.icyPlan), r0(x.applied), r0(x.chloride), r1(x.peakX), r2(sm.hours_probe_maxed)]); });
    return { key: 'library', name: 'Example storms', title: 'Example storms compared', rows, charts: [
      { type: 'bar', dir: 'bar', title: 'Salt per pass: crew against Saltback', cat: { col: 0 }, y: { title: 'lb per lane-mile per pass', min: 0 },
        series: [{ col: 6, name: 'Crew', color: INK }, { col: 7, name: 'Saltback', color: BRAND }], at: [0, rows.length + 2, 10, 22] }] };
  }

  function seasonTables(a, unc) {
    if (!a) return [];
    const se = a.season, cal = a.calibration, t = v => r1(v / 2000), usd = v => r0(v / 2000 * a.price);
    const summary = { key: 'seasonSummary', name: 'Season summary', title: 'Season summary', rows: [['Item', 'Value', 'Unit'],
      ['Storms', se.storms, ''], ['Salt the crew spread', t(se.applied), 'tons'], ["Saltback's plan", t(se.plan), 'tons'], ['Salt saved', t(se.net), 'tons'],
      ['Salt saved', r1(se.reductionPct), '%'], ['Dollars saved', r0(se.usd), 'US$'], ['Icy road time, as salted', r1(se.icyNow), 'h'], ["Icy road time, Saltback's plan", r1(se.icyPlan), 'h'],
      ['Chloride kept out of streams and soil', t(se.chlorideAvoided), 'tons'], ['First step next season (cuts capped at 25%)', r1(se.stepPct), '% less salt'],
      ['Crew following the state chart: salt', t(se.chartTotal), 'tons'], ['Crew following the state chart: icy time', r1(se.chartIcy), 'h'],
      ["Saltback's plan vs. state-chart crew", r1(se.vsChartPct), '% less salt (negative = more)'],
      ...(unc ? [['Likely range of salt saved (5th–95th percentile)', `${unc.summary.savingsP5}–${unc.summary.savingsP95}`, '%'], ['Uncertainty runs', unc.summary.n, '']] : []),
      ['Storms with usable probe data', cal.n, ''], ['Drain salt against truck logs', cal.factor == null ? 'not enough data' : r1(cal.factor * 100), '%'],
      ['Salt landing off the road (learned)', r1(cal.scatter * 100), '%']] };
    const levers = { key: 'levers', name: 'Savings by lever', title: 'Where the savings come from', rows: [['Step', 'Salt (tons)', 'Dollars'],
      ['Salt the crew spread', t(se.applied), usd(se.applied)], ['Lower rates where the crew over-salted', t(-se.rateCut), usd(-se.rateCut)],
      ['First truck out within 30 minutes', t(-(se.timingCut - se.timingAdd)), usd(-(se.timingCut - se.timingAdd))],
      ['More salt where the road was under-salted', t(se.rateAdd), usd(se.rateAdd)], ["Saltback's plan", t(se.plan), usd(se.plan)]],
      charts: [{ type: 'bar', dir: 'col', title: 'Where the savings come from (tons of salt)', cat: { col: 0 }, y: { title: 'tons of salt' }, series: [{ col: 1, name: 'Salt (tons)', color: BRAND }], at: [4, 1, 12, 20] }] };
    const storms = [['Storm', 'Source', 'Road (°F)', 'Snow (in)', 'First truck (min)', 'Salt per pass', 'Passes', "Saltback's rate", 'Next storm: try', 'Verdict', 'Excess (%)',
      'Salt spread (lb)', 'Plan (lb)', 'Change (lb)', 'Icy as salted (min)', 'Icy with plan (min)', 'State-chart rate', 'Icy at state-chart rate (min)',
      'Chloride released (lb)', 'Chloride vs. season', 'Measured drain salt (lb)', 'Probe at limit (h)', 'What happened']];
    a.storms.forEach(x => { const r = x.record, s = x.settings;
      storms.push([r.date, r.source, s.pavement_temp_F, s.snowfall_in, min(s.first_pass_h), x.perPass, x.passes, x.planRate ?? null, x.next ?? null, STATUS[x.status], r0(x.excessPct),
        r0(x.applied), r0(x.plan), r0(x.plan - x.applied), min(x.icy), min(x.icyPlan), x.chartRate, min(x.chartIcy), r0(x.chloride), x.chlorideVsTypical,
        r.measured_drain_salt_lb ?? null, r2(x.maxedH), x.verdict]); });
    const stormT = { key: 'season', name: 'Season storms', title: 'Every storm this season', rows: storms, charts: [
      { type: 'bar', dir: 'col', title: "Salt spread against Saltback's plan (lb)", cat: { col: 0 }, y: { title: 'lb of salt on the route', min: 0 },
        series: [{ col: 11, name: 'Crew', color: INK }, { col: 12, name: "Saltback's plan", color: BRAND }], at: [0, storms.length + 2, 14, 22] },
      { type: 'bar', dir: 'col', title: 'Icy road time per storm (min)', cat: { col: 0 }, y: { title: 'minutes icy', min: 0 },
        series: [{ col: 14, name: 'As salted', color: INK }, { col: 15, name: "Saltback's plan", color: BRAND }], at: [15, storms.length + 2, 14, 22] }] };
    let cumA = 0, cumP = 0;
    const running = { key: 'running', name: 'Running total', title: 'Salt used over the season', rows: [['Storm', 'Crew, running total (tons)', "Saltback's plan, running total (tons)"]]
      .concat(a.storms.map(x => { cumA += x.applied; cumP += x.plan; return [x.record.date, t(cumA), t(cumP)]; })), charts: [
      { type: 'bar', dir: 'col', title: 'Salt used over the season (tons, running total)', cat: { col: 0 }, y: { title: 'tons', min: 0 },
        series: [{ col: 1, name: 'Crew', color: INK }, { col: 2, name: "Saltback's plan", color: BRAND }], at: [4, 1, 12, 20] }] };
    const recs = { key: 'recs', name: 'Recommendations', title: 'Recommendations, ranked', rows: [['Rank', 'Type', 'What to do', 'Why', 'Salt (lb, negative = more salt)', 'Dollars', 'Icy minutes (negative = less icy)', 'How sure', 'Why that level']]
      .concat(a.recommendations.map((r, i) => [i + 1, r.type, r.title, r.why, r.impact.lb == null ? null : r0(r.impact.lb), r.impact.usd == null ? null : r0(r.impact.usd),
        r.impact.icyMin == null ? null : r0(r.impact.icyMin), r.confidence, r.confidenceWhy])) };
    const rc = a.rateCard;
    const card = { key: 'rateCard', name: 'Rate card', title: 'Crew rate card (lb per lane-mile per pass)', rows: [['Road temperature', ...rc.snow.map(x => `${x.label} snow (${x.inches} in)`), 'Published range (approx.)', 'Crew average']]
      .concat(rc.rows.map(r => [r.band.label, ...r.cells.map(c => (c.lb == null ? 'Sand or stronger chemical' : c.lb)), r.band.pub ? `${r.band.pub[0]}–${r.band.pub[1]}` : 'No dry salt', r.habit == null ? null : r0(r.habit)])), charts: [] };
    return [summary, levers, running, stormT, recs, card];
  }

  function uncertaintyTables(u) {
    if (!u) return [];
    const runs = { key: 'uncertainty', name: 'Uncertainty runs', title: `${u.summary.n} seasons with uncertain inputs`, rows: [['Run', 'Salt saved (%)', 'Icy hours as salted', "Icy hours with Saltback's plan", 'Worst single-storm change (min)',
      ...Object.values(u.ranges).map(r => r.label)]].concat(u.runs.map((r, i) => [i + 1, r.savingsPct, r.icyNow, r.icyPlan, r.worstStormMin, ...Object.keys(u.ranges).map(k => r.truth[k])])) };
    const tornado = { key: 'tornado', name: 'Sensitivity', title: 'Which uncertain input moves the result most', rows: [['Input', 'Low value', 'High value', 'Salt saved at low (%)', 'Salt saved at high (%)', 'Icy-hour change at low', 'Icy-hour change at high']]
      .concat(u.tornado.map(t => [t.label, t.lo, t.hi, t.savingsLo, t.savingsHi, t.icyChangeLo, t.icyChangeHi])) };
    return [runs, tornado];
  }

  function aboutTable(meta) {
    return { key: 'about', name: 'About', title: 'About this export', rows: [['Field', 'Value'],
      ['Product', 'Saltback: storm-drain sensors and feedback for road salt'], ['Exported', meta.when], ['Data', 'Simulated with typical published values, not real town records'],
      ['Storm shown', meta.run], ['Season data', meta.season], ['Charts', 'Native charts: edit them in Excel or Google Sheets like any other chart'],
      ...meta.sheets.map(s => [`Sheet: ${s.name}`, s.title])] };
  }

  function allTables(state) {
    const tables = [...seasonTables(state.season, state.uncertainty), ...runTables(state.run, state.runLabel), libraryTable(state.library), meltTable(), ...uncertaintyTables(state.uncertainty)];
    return [aboutTable({ when: state.when || new Date().toISOString().slice(0, 16).replace('T', ' '), run: state.runLabel, season: state.seasonLabel || '—', sheets: tables }), ...tables];
  }

  const api = { SCENARIOS, STATUS, scenarioSettings, computeRun, computeLibrary, runTables, meltTable, libraryTable, seasonTables, uncertaintyTables, allTables, PUBLISHED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaltbackReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
