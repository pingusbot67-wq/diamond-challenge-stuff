/* Saltback report layer: example storm scenarios, one function that runs a storm, and the tables
   (with native chart specs) that the page shows and exports to Excel / Google Sheets / CSV.
   Every number comes from model.js (physics) and engine.js (season analysis). */
(function (root) {
  'use strict';
  const S = root.Saltback || require('./model.js');

  /* ---- Storm library: example storms, each a set of changes from the default settings ---- */
  const SCENARIOS = [
    { id: 'overnight', name: 'Overnight snow', desc: '4 in over 8 h at 22°F. The default storm.', s: {} },
    { id: 'dusting', name: 'Light dusting', desc: '1 in over 4 h near freezing. Often salted like a full storm.', s: { pavement_temp_F: 30, snowfall_in: 1, storm_hours: 4, temp_after_F: 40 } },
    { id: 'wet', name: 'Heavy wet snow', desc: '8 in of dense snow over 10 h at 29°F.', s: { pavement_temp_F: 29, snowfall_in: 8, snow_ratio: 8, storm_hours: 10, temp_after_F: 38 } },
    { id: 'noreaster', name: "Nor'easter", desc: '14 in over 18 h at 26°F, plowed every 90 minutes.', s: { pavement_temp_F: 26, snowfall_in: 14, storm_hours: 18, plow_every_h: 1.5, temp_after_F: 36 } },
    { id: 'cold', name: 'Arctic cold snap', desc: '3 in at 10°F; the road stays frozen afterwards.', s: { pavement_temp_F: 10, snowfall_in: 3, storm_hours: 8, temp_after_F: 18, salt_per_pass_lb: 300 } },
    { id: 'late', name: 'Late first truck', desc: 'The overnight snow, but the first truck arrives after 2 hours.', s: { first_pass_h: 2 } },
    { id: 'heavyhand', name: 'Heavy-handed crew', desc: 'A moderate 3 in storm at 24°F, salted at 400 lb per pass.', s: { pavement_temp_F: 24, snowfall_in: 3, storm_hours: 6, salt_per_pass_lb: 400 } },
    { id: 'flash', name: 'Rain to flash freeze', desc: 'Rain on a 34°F road, then the pavement drops to 20°F.', s: { pavement_temp_F: 34, snowfall_in: 3, storm_hours: 6, temp_after_F: 20 } },
    { id: 'k10', name: 'High-range probe', desc: 'The overnight snow measured with a K=10 probe instead of the DFR0300.', s: { probe_max_mS_cm: 200 } },
  ];
  const scenarioSettings = sc => ({ ...S.SETTINGS, ...sc.s });

  /* ---- Run one storm and everything the report needs about it ---- */
  function computeRun(s) {
    const { rows, summary } = S.stormTimeline(s);
    const { needed, sweep } = S.findNeeded(s);
    const card = S.stormCard(s, summary, needed);
    const late = s.first_pass_h + 1 < s.storm_hours ? S.findNeeded({ ...s, first_pass_h: s.first_pass_h + 1 }).needed : null;
    const hiProbe = s.probe_max_mS_cm < 200 && summary.hours_probe_maxed > 0.5 ? S.stormTimeline({ ...s, probe_max_mS_cm: 200 }).summary.salt_seen_vs_true_pct : null;
    rows.forEach(r => { r.ec_true = Number.isNaN(r.cl_true_mg_L) ? NaN : S.chlorideToConductivity(r.cl_true_mg_L, s.water_temp_C); });
    return { s: { ...s }, rows, summary, needed, sweep, card, late, hiProbe, atNeed: sweep.find(r => r.salt_per_pass_lb === needed), noSalt: sweep[0].icy_hours };
  }
  const computeLibrary = () => SCENARIOS.map(sc => ({ sc, res: computeRun(scenarioSettings(sc)) }));

  /* ---- Tables. Each: {key, name, title, rows:[header, ...], charts:[...]} ---- */
  const r1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
  const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const r3 = v => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  const r0 = v => (Number.isFinite(v) ? Math.round(v) : null);
  const INK = '#1A1A1A', GREY = '#9B9B9B', SALT = '#C27410', WATER = '#2A69A6', ICE = '#6C93B3';

  function runTables(run, label) {
    const { s, rows, sweep, summary: sm, card } = run;
    const passes = Math.round(sm.salt_applied_lb_per_lane_mile / Math.max(sm.salt_per_pass_lb, 1e-9));
    const summary = { key: 'runSummary', name: 'Run summary', title: `Run summary: ${label}`, rows: [['Metric', 'Value', 'Unit'],
      ['Scenario', label, ''], ['Road surface temperature', s.pavement_temp_F, '°F'], ['Snowfall', s.snowfall_in, 'in'], ['Storm length', s.storm_hours, 'h'],
      ['First truck after', s.first_pass_h, 'h'], ['Truck returns every', s.plow_every_h, 'h'], ['Route size', s.route_lane_miles, 'lane-mi'],
      ['Drain probe maximum', s.probe_max_mS_cm, 'mS/cm'], ['Salt per pass', r0(sm.salt_per_pass_lb), 'lb/lane-mi'], ['Passes', passes, ''],
      ['Salt applied on route', r0(card.route_salt_lb), 'lb'], ['Needed per pass', card.needed_per_pass_lb, 'lb/lane-mi'], ['Estimated excess', r1(card.excess_pct), '%'],
      ['Recommended per pass', card.recommended_per_pass_lb, 'lb/lane-mi'], ['Change for next comparable storm', card.recommended_change_pct, '%'],
      ['Hours icy', r2(sm.icy_hours), 'h'], ['Hours icy with no salt', r2(run.noSalt), 'h'], ['Salt to storm drain', r1(sm.salt_to_drain_pct), '%'],
      ['Salt to shoulder and soil', r1(sm.salt_to_roadside_pct), '%'], ['Peak chloride in drain', r0(sm.peak_cl_mg_L), 'mg/L'], ['Storm-average chloride', r0(sm.avg_cl_mg_L), 'mg/L'],
      ['Chloride runoff level', card.chloride_level, ''], ['Hours probe at its limit', r2(sm.hours_probe_maxed), 'h'], ['Salt the probe accounted for', r1(sm.salt_seen_vs_true_pct), '%']] };
    const tl = [['Hour', 'Pavement temp (°F)', 'Truck pass', 'Loose snow (mm)', 'Bonded ice (mm)', 'Brine (mm)', 'Brine salt (%)', 'Salt crystals (g/m²)',
      'Drain flow (L/h)', 'Chloride true (mg/L)', 'Probe reading (mS/cm)', 'Probe at limit', 'Chloride measured (mg/L)', 'Road icy']];
    rows.forEach(r => tl.push([r3(r.hour), r1(r.temp_F), r.truck_pass ? 1 : 0, r3(r.loose_snow_mm), r3(r.bonded_ice_mm), r3(r.brine_mm), r2(r.brine_salt_pct),
      r2(r.salt_crystals_g_m2), r2(r.drain_flow_L_h), r0(r.cl_true_mg_L), r2(r.reading_mS_cm), r.probe_maxed ? 1 : 0, r0(r.cl_measured_mg_L), r.icy ? 1 : 0]));
    const timeline = { key: 'timeline', name: 'Run timeline', title: 'Run timeline (5-minute steps)', rows: tl, charts: [
      { type: 'scatter', title: 'Chloride in the storm drain', x: { col: 0, title: 'Hours since snow started' }, y: { title: 'Chloride (mg/L, log scale)', log: true, min: 10 },
        series: [{ col: 9, name: 'True', color: GREY, dash: true }, { col: 12, name: 'Probe', color: INK }], at: [15, 1, 10, 20] },
      { type: 'scatter', title: 'Road surface', x: { col: 0, title: 'Hours since snow started' }, y: { title: 'Thickness (mm water)' },
        series: [{ col: 3, name: 'Loose snow', color: GREY }, { col: 4, name: 'Bonded ice', color: ICE }, { col: 5, name: 'Brine', color: WATER }], at: [15, 22, 10, 20] }] };
    const dose = { key: 'dose', name: 'Dose response', title: 'Salt per pass against icy hours (same storm)', rows: [['Salt per pass (lb/lane-mi)', 'Salt per storm (lb/lane-mi)', 'Hours icy', 'Chloride released (lb/lane-mi)']]
      .concat(sweep.map(r => [r.salt_per_pass_lb, r0(r.total_lb_per_lane_mile), r2(r.icy_hours), r0(r.chloride_released_lb_per_lane_mile)])), charts: [
      { type: 'scatter', title: 'Salt per pass against icy hours', x: { col: 0, title: 'Salt per pass (lb per lane-mile)' }, y: { title: 'Hours icy', min: 0 }, series: [{ col: 2, name: 'Hours icy', color: INK }], at: [5, 1, 10, 20] }] };
    const split = { key: 'split', name: 'Salt destination', title: 'Where the salt went', rows: [['Destination', 'Share (%)', 'Salt (lb)'],
      ['Storm drain', r1(sm.salt_to_drain_pct), r0(sm.salt_to_drain_pct / 100 * card.route_salt_lb)],
      ['Shoulder and soil', r1(sm.salt_to_roadside_pct), r0(sm.salt_to_roadside_pct / 100 * card.route_salt_lb)],
      ['Still on road', r1(Math.max(0, 100 - sm.salt_to_drain_pct - sm.salt_to_roadside_pct)), r0(Math.max(0, 100 - sm.salt_to_drain_pct - sm.salt_to_roadside_pct) / 100 * card.route_salt_lb)]],
      charts: [{ type: 'bar', dir: 'bar', title: 'Where the salt went (lb)', cat: { col: 0 }, y: { title: 'lb of salt', min: 0 }, series: [{ col: 2, name: 'Salt (lb)', color: SALT }], at: [4, 1, 8, 14] }] };
    return [summary, timeline, dose, split];
  }

  const PUBLISHED = { 30: 46.3, 25: 14.4, 20: 8.6, 15: 6.3, 10: 4.9, 5: 4.1, 0: 3.7 };
  function meltTable() {
    const rows = [['Pavement temp (°F)', 'Model: lb ice per lb salt', 'Published chart']];
    for (let t = 0; t <= 30; t++) rows.push([t, r2(S.iceMeltedPerSalt(S.fToC(t))), PUBLISHED[t] ?? null]);
    return { key: 'melt', name: 'Melt capacity', title: 'Ice one pound of salt can melt (model against the published chart)', rows, charts: [
      { type: 'scatter', title: 'Ice melted per pound of salt', x: { col: 0, title: 'Pavement temperature (°F)' }, y: { title: 'lb of ice per lb of salt', min: 0, max: 60 },
        series: [{ col: 1, name: 'Saltback model', color: INK }, { col: 2, name: 'Published chart', color: SALT, markers: true }], at: [4, 1, 10, 20] }] };
  }

  function libraryTable(lib) {
    const rows = [['Scenario', 'Description', 'Road (°F)', 'Snow (in)', 'Storm (h)', 'First truck (h)', 'Salt per pass (lb/lane-mi)', 'Needed per pass', 'Recommended per pass',
      'Excess (%)', 'Change next storm (%)', 'Hours icy', 'Hours icy at need', 'Route salt (lb)', 'Peak chloride (mg/L)', 'Average chloride (mg/L)', 'Chloride level', 'Probe at limit (h)', 'Probe accounted for (%)']];
    lib.forEach(({ sc, res }) => { const { s, summary: sm, card } = res;
      rows.push([sc.name, sc.desc, s.pavement_temp_F, s.snowfall_in, s.storm_hours, s.first_pass_h, s.salt_per_pass_lb, card.needed_per_pass_lb, card.recommended_per_pass_lb,
        r1(card.excess_pct), card.recommended_change_pct, r2(sm.icy_hours), r2(res.atNeed.icy_hours), r0(card.route_salt_lb), r0(sm.peak_cl_mg_L), r0(sm.avg_cl_mg_L),
        card.chloride_level, r2(sm.hours_probe_maxed), r1(sm.salt_seen_vs_true_pct)]); });
    return { key: 'library', name: 'Storm library', title: 'Storm library: example storms compared', rows, charts: [
      { type: 'bar', dir: 'bar', title: 'Salt per pass: used against needed', cat: { col: 0 }, y: { title: 'lb per lane-mile per pass', min: 0 },
        series: [{ col: 6, name: 'Used', color: INK }, { col: 7, name: 'Needed', color: SALT }], at: [0, rows.length + 2, 10, 22] }] };
  }

  function seasonTables(a) {
    if (!a) return [];
    const se = a.season, cal = a.calibration;
    const summary = { key: 'seasonSummary', name: 'Season summary', title: 'Season summary', rows: [['Metric', 'Value', 'Unit'],
      ['Storms analysed', se.storms, ''], ['Salt spread', r0(se.applied), 'lb'], ["Saltback's plan", r0(se.plan), 'lb'], ['Salt cut on over-salted storms', r0(se.cut), 'lb'],
      ['Salt added on under-salted storms', r0(se.add), 'lb'], ['Net change', r1(-se.reductionPct), '%'], ['Savings', r0(Math.max(0, se.usd)), 'US$'],
      ['Chloride released', r0(se.chloride), 'lb'], ['Chloride avoided', r0(Math.max(0, se.chlorideAvoided)), 'lb'], ['Icy road hours now', r2(se.icyNow), 'h'],
      ['Icy road hours with the plan', r2(se.icyPlan), 'h'], ['Storms with usable probe data', cal.n, ''], ['Drain salt against truck logs', cal.factor == null ? 'not enough data' : r1(cal.factor * 100), '%'],
      ['Salt landing off the road (learned)', r1(cal.scatter * 100), '%'], ['Spreader output against setting', r1(cal.spreader * 100), '%']] };
    const storms = [['Storm', 'Source', 'Road (°F)', 'Snow (in)', 'Storm (h)', 'First truck (h)', 'Salt per pass', 'Passes', 'Needed per pass', 'Plan per pass',
      'Salt spread (lb)', 'Plan (lb)', 'Change (lb)', 'Excess (%)', 'Under-salted', 'Hours icy', 'Hours icy with plan', 'Average chloride (mg/L)', 'Chloride level',
      'Measured drain salt (lb)', 'Probe at limit (h)', 'Verdict']];
    a.storms.forEach(x => { const r = x.record, s = x.settings;
      storms.push([r.date, r.source, s.pavement_temp_F, s.snowfall_in, s.storm_hours, s.first_pass_h, s.salt_per_pass_lb, x.passes, x.needed, x.onTimeRec ?? x.rec,
        r0(x.applied), r0(x.plan), r0(x.plan - x.applied), r1(x.excess), x.under ? 'yes' : 'no', r2(x.icy), r2(x.icyPlan), r0(x.avgCl), x.level,
        r.measured_drain_salt_lb ?? null, r2(x.maxedH), x.verdict]); });
    const stormT = { key: 'season', name: 'Season storms', title: 'Season storms: spread against plan', rows: storms, charts: [
      { type: 'bar', dir: 'col', title: "Salt spread against Saltback's plan (lb)", cat: { col: 0 }, y: { title: 'lb of salt on the route', min: 0 },
        series: [{ col: 10, name: 'Spread', color: INK }, { col: 11, name: "Saltback's plan", color: SALT }], at: [0, storms.length + 2, 14, 22] }] };
    const recs = { key: 'recs', name: 'Recommendations', title: 'Recommendations, ranked', rows: [['Rank', 'Type', 'Action', 'Detail', 'Salt impact (lb, negative = more salt)', 'Savings (US$)']]
      .concat(a.recommendations.map((r, i) => [i + 1, r.type, r.title, r.detail, r.lb == null ? null : r0(r.lb), r.usd == null ? null : r0(r.usd)])) };
    const rc = a.rateCard;
    const card = { key: 'rateCard', name: 'Rate card', title: 'Crew rate card (lb per lane-mile per pass)', rows: [['Road temperature', ...rc.snow.map(x => `${x.label} (${x.inches} in)`), 'Crew habit']]
      .concat(rc.rows.map(r => [r.band.label, ...r.cells.map(c => c.lb), r.habit == null ? null : r0(r.habit)])), charts: [
      { type: 'bar', dir: 'col', title: 'Recommended salt per pass by road temperature', cat: { col: 0 }, y: { title: 'lb per lane-mile per pass', min: 0 },
        series: rc.snow.map((x, i) => ({ col: i + 1, name: `${x.label} (${x.inches} in)`, color: [GREY, INK, SALT][i] })), at: [0, rc.rows.length + 3, 10, 20] }] };
    return [summary, stormT, recs, card];
  }

  function aboutTable(meta) {
    return { key: 'about', name: 'About', title: 'About this export', rows: [['Field', 'Value'],
      ['Product', 'Saltback: drain-sensor feedback for road salt'], ['Exported', meta.when], ['Data', 'Simulated with typical published values, not a real town\'s data'],
      ['Physics', 'model.py / model.js (identical results)'], ['Season analysis', 'engine.js'], ['Run shown', meta.run],
      ['Season data', meta.season], ['Charts', 'Native charts: edit them in Excel or Google Sheets like any other chart'],
      ...meta.sheets.map(s => [`Sheet: ${s.name}`, s.title])] };
  }

  /* Everything the page can export, in workbook order. */
  function allTables(state) {
    const tables = [...runTables(state.run, state.runLabel), meltTable(), libraryTable(state.library), ...seasonTables(state.season)];
    return [aboutTable({ when: state.when || new Date().toISOString().slice(0, 16).replace('T', ' '), run: state.runLabel, season: state.seasonLabel || '—', sheets: tables }), ...tables];
  }

  const api = { SCENARIOS, scenarioSettings, computeRun, computeLibrary, runTables, meltTable, libraryTable, seasonTables, allTables, PUBLISHED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaltbackReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
