/* Saltback many-winters simulator.

   Pick a place (a city, a type of winter, or random), a crew habit and a number of winters. For each winter:
     1. storms are drawn from that place's typical weather (rough illustrative values, not official climate data);
     2. the crew salts them the way that crew usually does;
     3. the "true" road physics is drawn from the realistic ranges in uncertainty.js (Saltback is never told it);
     4. the drain sensor measures the runoff from the true world;
     5. Saltback analyses the winter from the truck log + drain data only (engine.js), exactly as on the storm log;
     6. its plan is then judged in the TRUE world: salt used, icy-road time, chloride.
   summarize() pools all winters into plain-English recommendations with numbers.

   Works in the browser (window.SaltbackWinters) and in Node (require). Uses only model.js + engine.js. */
(function (root) {
  'use strict';
  const S = root.Saltback || require('./model.js');
  const E = root.SaltbackEngine || require('./engine.js');

  /* Typical storm weather. storms: storms needing salt per winter [low, high]; temp: road temperature during storms
     (°F, mean and spread); snow: average inches per storm; freezeAfter: share of storms where the road stays below
     freezing afterwards; flash: share of rain-then-freeze events. Rough values for illustration only. */
  const PLACES = [
    { id: 'boston', group: 'City', name: 'Boston, MA', storms: [10, 16], temp: [27, 4], snow: 3.5, freezeAfter: 0.35, flash: 0.10 },
    { id: 'concord', group: 'City', name: 'Concord, NH', storms: [14, 22], temp: [22, 5], snow: 4, freezeAfter: 0.5, flash: 0.08 },
    { id: 'burlington', group: 'City', name: 'Burlington, VT', storms: [16, 24], temp: [19, 6], snow: 3.5, freezeAfter: 0.6, flash: 0.06 },
    { id: 'syracuse', group: 'City', name: 'Syracuse, NY', storms: [22, 34], temp: [22, 5], snow: 3, freezeAfter: 0.55, flash: 0.05 },
    { id: 'chicago', group: 'City', name: 'Chicago, IL', storms: [12, 20], temp: [22, 6], snow: 2.5, freezeAfter: 0.5, flash: 0.08 },
    { id: 'minneapolis', group: 'City', name: 'Minneapolis, MN', storms: [16, 24], temp: [14, 7], snow: 3, freezeAfter: 0.7, flash: 0.04 },
    { id: 'denver', group: 'City', name: 'Denver, CO', storms: [12, 18], temp: [24, 6], snow: 4, freezeAfter: 0.25, flash: 0.03 },
    { id: 'philadelphia', group: 'City', name: 'Philadelphia, PA', storms: [6, 12], temp: [29, 3], snow: 3, freezeAfter: 0.25, flash: 0.15 },
    { id: 'mild', group: 'Type of winter', name: 'Mild, wet winter', storms: [8, 14], temp: [29, 2.5], snow: 3, freezeAfter: 0.2, flash: 0.15 },
    { id: 'snowy', group: 'Type of winter', name: 'Cold, snowy winter', storms: [18, 26], temp: [18, 4], snow: 5, freezeAfter: 0.6, flash: 0.03 },
    { id: 'thaw', group: 'Type of winter', name: 'Freeze-thaw winter', storms: [14, 20], temp: [27, 4], snow: 2.5, freezeAfter: 0.7, flash: 0.25 },
    { id: 'arctic', group: 'Type of winter', name: 'Arctic winter', storms: [14, 20], temp: [10, 5], snow: 2.5, freezeAfter: 0.85, flash: 0.02 },
    { id: 'bigstorms', group: 'Type of winter', name: 'A few big storms', storms: [6, 10], temp: [25, 4], snow: 9, freezeAfter: 0.4, flash: 0.05 },
  ];
  const RANDOM = { id: 'random', group: 'Random', name: 'Random winters', random: true };

  /* How the crew salts. rate(t, r): lb per lane-mile per pass at road temperature t. late: share of storms where the
     first truck comes 1–2 hours in (otherwise 15–30 minutes). */
  const chartMid = t => { const b = E.BANDS.find(x => t >= x.lo && t < x.hi); return t >= 33 ? 150 : !b ? 400 : b.pub ? (b.pub[0] + b.pub[1]) / 2 : 400; };
  const CREWS = [
    { id: 'habit', name: 'Typical crew: about the same rate every storm', base: 230, late: 0.25,
      rate: (t, r, c) => c.base + (t < 20 ? 40 : 0) + 15 * r.normal() },
    { id: 'heavy', name: 'Heavy-handed crew: lots of salt, just in case', base: 320, late: 0.15,
      rate: (t, r, c) => c.base + (t < 20 ? 40 : 0) + 20 * r.normal() },
    { id: 'chart', name: 'Careful crew: follows the state rate chart', base: null, late: 0.10,
      rate: (t, r) => chartMid(t) + 10 * r.normal() },
  ];

  /* The least certain road physics (same ranges as uncertainty.js). Each winter draws its own true values. */
  /* Crews keep plowing and salting after the storm until the road is clear (up to 12 h) when it stays below freezing. */
  const MODEL = { cleanup_h: 12 };
  const TRUTH = {
    brine_film_mm: [0.02, 0.06], bond_per_h: [0.25, 1.0], unsalted_share: [0.15, 0.5], drain_per_h: [0.15, 0.5], scatter_loss: [0.15, 0.38],
  };

  function rng(seed) {
    let a = seed >>> 0;
    const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { u, between: (lo, hi) => lo + (hi - lo) * u(), int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * u()),
      normal: () => { let x = 0; for (let i = 0; i < 6; i++) x += u(); return (x - 3) / Math.SQRT1_2; } };   // normal(): bell curve, spread 1
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r10 = v => Math.round(v / 10) * 10;

  function randomPlace(r) {
    return { id: 'random', name: 'Random winter', storms: [r.int(6, 14), r.int(15, 30)], temp: [r.between(8, 31), r.between(2, 7)],
      snow: r.between(1.5, 8), freezeAfter: r.between(0.1, 0.8), flash: r.between(0, 0.25) };
  }

  /* One winter's storms (truck log + weather), before any sensor data. */
  function stormsFor(place, crew, opts, r) {
    const n = r.int(place.storms[0], place.storms[1]), out = [];
    for (let j = 0; j < n; j++) {
      const flash = r.u() < place.flash;
      let t = Math.round(clamp(place.temp[0] + place.temp[1] * r.normal(), -5, 31)), after;
      if (flash) { t = r.int(33, 34); after = r.int(18, 26); }
      else if (r.u() < place.freezeAfter) after = Math.round(clamp(t + r.between(-6, 4), -5, 31));
      else after = r.int(33, 42);
      const snow = clamp(Math.round(place.snow * Math.exp(0.55 * r.normal() - 0.15) * 2) / 2, 0.5, 20);
      const hours = clamp(Math.round(3 + snow * 1.1 + 1.5 * r.normal()), 3, 24);
      const late = r.u() < opts.lateShare;
      const first = late ? r.between(1, 2) : r.between(0.25, 0.5);
      const rate = clamp(r10(crew.rate(t, r, { base: opts.crewRate ?? crew.base })), 80, 600);
      out.push({ id: `w${opts.k}s${j}`, source: 'winter-sim', date: `Winter ${opts.k + 1}, storm ${j + 1}`, route: 'Sim', lane_miles: opts.laneMiles,
        pavement_temp_F: t, snowfall_in: snow, storm_hours: hours, salt_per_pass_lb: rate, first_pass_h: Math.round(first * 4) / 4,
        plow_every_h: 2, temp_after_F: after, probe_max_mS_cm: opts.probe });
    }
    return out;
  }

  /* Simulate one winter and judge Saltback's plan in the true world. */
  function simulateWinter(cfg, k) {
    const r = rng((cfg.seed * 1000003 + k * 7919) >>> 0);
    const place = cfg.place.random ? randomPlace(r) : cfg.place;
    const crew = CREWS.find(c => c.id === cfg.crew) || CREWS[0];
    const truth = { ...MODEL };
    for (const [key, [lo, hi]] of Object.entries(TRUTH)) truth[key] = cfg.uncertain ? r.between(lo, hi) : S.SETTINGS[key];
    const records = stormsFor(place, crew, { k, laneMiles: cfg.laneMiles, probe: cfg.probe, lateShare: cfg.lateShare ?? crew.late, crewRate: cfg.crewRate }, r);
    records.forEach((rec, j) => {   // the drain node measures the TRUE runoff
      const sm = S.stormTimeline(E.settingsFor(rec, { ...truth, seed: cfg.seed + k * 101 + j })).summary;
      rec.measured_drain_salt_lb = Math.round(sm.salt_applied_lb_per_lane_mile * rec.lane_miles * sm.salt_to_drain_pct / 100 * sm.salt_seen_vs_true_pct / 100);
      rec.probe_maxed_h = +sm.hours_probe_maxed.toFixed(2);
    });
    const a = E.analyze(records, { skipRateCard: true, price: cfg.price, model: MODEL });
    let icyCrew = 0, icyPlan = 0, worst = 0;
    const storms = a.storms.map(x => {
      const t = E.settingsFor(x.record, truth);
      const now = S.stormTimeline(t, x.perPass, false).summary.icy_hours;
      const fixed = x.status === 'cant_fix' || x.status === 'too_cold';
      const plan = fixed ? now : S.stormTimeline({ ...t, first_pass_h: x.onTime ? E.ON_TIME_H : t.first_pass_h }, x.planRate, false).summary.icy_hours;
      icyCrew += now; icyPlan += plan; if (!fixed) worst = Math.max(worst, (plan - now) * 60);
      const s = x.settings;
      return { w: k, t: s.pavement_temp_F, snow: s.snowfall_in, hours: s.storm_hours, after: s.temp_after_F, first: s.first_pass_h,
        crewRate: x.perPass, planRate: fixed ? null : x.planRate, status: x.status, late: !!x.late,
        crewLb: x.applied, planLb: x.plan, icyCrew: now, icyPlan: plan, maxedH: x.maxedH };
    });
    const se = a.season;
    return {
      k, place: place.name, storms: storms.length, crewLb: se.applied, planLb: se.plan,
      savedPct: se.reductionPct, usd: se.usd, icyCrew, icyPlan, worstMin: Math.round(worst),
      chlorideAvoidedLb: se.chlorideAvoided, learnedScatter: a.calibration.scatter, trueScatter: truth.scatter_loss, stormList: storms,
    };
  }

  /* Run many winters. onProgress(done, total) is called between winters; the browser version yields to keep the page
     responsive. Returns { cfg, winters }. */
  async function runMany(cfg, onProgress, shouldStop) {
    const winters = [];
    for (let k = 0; k < cfg.n; k++) {
      if (shouldStop && shouldStop()) break;
      winters.push(simulateWinter(cfg, k));
      if (onProgress) await onProgress(k + 1, cfg.n);
    }
    return { cfg: { ...cfg, place: { id: cfg.place.id, name: cfg.place.name } }, winters };
  }

  const pct = (xs, p) => { if (!xs.length) return NaN; const a = [...xs].sort((x, y) => x - y), i = (a.length - 1) * p, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const median = xs => pct(xs, 0.5);
  const tons = lb => lb / 2000;
  const fmtT = lb => { const t = tons(lb); return t >= 10 ? `${Math.round(t)}` : t.toFixed(1); };
  const fmtH = h => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);
  const money = v => `$${Math.round(v).toLocaleString('en-US')}`;

  /* Pool all winters into headline numbers and ranked recommendations in plain English. */
  function summarize(result) {
    const W = result.winters, cfg = result.cfg, n = W.length;
    const all = W.flatMap(w => w.stormList);
    const saved = W.map(w => w.savedPct);
    const head = {
      n, storms: all.length, stormsPerWinter: all.length / n,
      savedP50: median(saved), savedP10: pct(saved, 0.1), savedP90: pct(saved, 0.9),
      crewLb: mean(W.map(w => w.crewLb)), planLb: mean(W.map(w => w.planLb)), usd: mean(W.map(w => w.usd)),
      icyCrew: mean(W.map(w => w.icyCrew)), icyPlan: mean(W.map(w => w.icyPlan)),
      chlorideAvoided: mean(W.map(w => w.chlorideAvoidedLb)),
      icierShare: W.filter(w => w.icyPlan > w.icyCrew + 0.1).length / n,
      stormOver6Share: W.filter(w => w.worstMin > 6).length / n,
    };
    const perW = f => all.reduce((a, x) => a + f(x), 0) / n;
    const fixedS = x => x.status === 'cant_fix' || x.status === 'too_cold';
    const levers = [
      { id: 'over', label: 'Lower rates where over-salted', lb: perW(x => (!x.late && (x.status === 'over' || x.status === 'ok') ? x.planLb - x.crewLb : 0)),
        icy: perW(x => (!x.late && (x.status === 'over' || x.status === 'ok') ? x.icyPlan - x.icyCrew : 0)) },
      { id: 'under', label: 'More salt where under-salted', lb: perW(x => (!x.late && x.status === 'under' ? x.planLb - x.crewLb : 0)),
        icy: perW(x => (!x.late && x.status === 'under' ? x.icyPlan - x.icyCrew : 0)) },
      { id: 'late', label: 'First truck within 30 minutes', lb: perW(x => (x.late && !fixedS(x) ? x.planLb - x.crewLb : 0)),
        icy: perW(x => (x.late && !fixedS(x) ? x.icyPlan - x.icyCrew : 0)) },
      { id: 'fixed', label: "Storms rock salt can't fix", lb: 0, icy: 0, n: all.filter(fixedS).length / n },
    ];
    const recs = [];
    // 1) Salt rate by road temperature (only storms where the rate was the question: not late, not beyond salt).
    const rated = all.filter(x => x.planRate != null && !x.late);
    const bands = E.BANDS.filter(b => b.pub).map(b => {
      const xs = rated.filter(x => x.t >= b.lo && x.t < b.hi);
      if (xs.length < 3) return null;
      const crew = median(xs.map(x => x.crewRate)), plan = r10(median(xs.map(x => x.planRate)));
      const lbPerWinter = xs.reduce((a, x) => a + x.crewLb - x.planLb, 0) / n;
      return { band: b, n: xs.length, crew: r10(crew), plan, lbPerWinter, share: xs.length / all.length };
    }).filter(Boolean);
    const cuts = bands.filter(b => b.plan <= b.crew - 10), ups = bands.filter(b => b.plan >= b.crew + 10);
    if (cuts.length) {
      const lbW = cuts.reduce((a, b) => a + b.lbPerWinter, 0);
      recs.push({ id: 'rate', kind: 'Salt rate', title: cuts.length === 1
        ? `Use about ${cuts[0].plan} lb per lane-mile when the road is ${cuts[0].band.label} (crews used ${cuts[0].crew})`
        : 'Use less salt per pass on milder storms',
        lines: cuts.map(b => `${b.band.label}: ${b.plan} lb per lane-mile per pass instead of ${b.crew}${b.plan < b.band.pub[0] ? ' (below the state chart: cut 25% at a time and check)' : ''}`),
        impact: `−${fmtT(lbW)} t salt and ${money(tons(lbW) * cfg.price)} per winter`, sure: cuts.some(b => b.plan < b.band.pub[0]) ? 'Medium' : 'High',
        why: 'The road stayed just as clear at these rates, even when the road physics was set to its worst realistic case.' });
    }
    const under = rated.filter(x => x.status === 'under');
    const upBands = E.BANDS.map(b => { const xs = under.filter(x => x.t >= b.lo && x.t < b.hi);
      return xs.length ? { band: b, n: xs.length, crew: r10(median(xs.map(x => x.crewRate))), plan: r10(median(xs.map(x => x.planRate))) } : null; }).filter(Boolean);
    if (under.length >= Math.max(2, n * 0.5)) {
      const extra = under.reduce((a, x) => a + x.planLb - x.crewLb, 0) / n, fewer = under.reduce((a, x) => a + Math.max(0, x.icyCrew - x.icyPlan), 0) / n;
      recs.push({ id: 'more', kind: 'Safety', title: `Use more salt on the ${Math.round(100 * under.length / all.length)}% of storms that were under-salted`,
        lines: upBands.map(b => `${b.band.label}: ${b.plan} lb per lane-mile per pass instead of ${b.crew} (${b.n} storm${b.n > 1 ? 's' : ''})`),
        impact: `${fmtH(fewer)} less icy road, +${fmtT(Math.max(0, extra))} t salt per winter`, sure: 'Medium',
        why: 'At the crew\'s usual rate the road stayed icy longer than it had to.' });
    }
    // 2) First truck on time.
    const late = all.filter(x => x.late);
    if (late.length) {
      const icyLate = late.reduce((a, x) => a + x.icyCrew, 0), icyAll = all.reduce((a, x) => a + x.icyCrew, 0);
      const fixedH = late.reduce((a, x) => a + Math.max(0, x.icyCrew - x.icyPlan), 0) / n;
      const dSalt = late.reduce((a, x) => a + x.planLb - x.crewLb, 0) / n;
      recs.push({ id: 'timing', kind: 'Timing', title: 'Get the first truck out within 30 minutes of the first snow',
        lines: [`The first truck was 1–2 hours late in ${Math.round(100 * late.length / all.length)}% of storms.`,
          `Those storms caused ${Math.round(100 * icyLate / Math.max(icyAll, 1e-9))}% of all icy-road time.`],
        impact: `${fmtH(fixedH)} less icy road per winter (${dSalt >= 0 ? '+' : '−'}${fmtT(Math.abs(dSalt))} t salt: ${dSalt >= 0 ? 'starting sooner means more passes' : 'less salt is needed when snow never bonds'})`, sure: 'Medium',
        why: 'Traffic packs fresh snow into ice before late salt arrives; once bonded, salt can\'t catch up.' });
    }
    // 3) Too cold / salt can't fix.
    const cold = all.filter(x => x.status === 'too_cold'), stuck = all.filter(x => x.status === 'cant_fix');
    if (cold.length) recs.push({ id: 'cold', kind: 'Supplies', title: `Stock sand or calcium chloride for about ${Math.max(1, Math.round(cold.length / n))} storm${Math.round(cold.length / n) === 1 ? '' : 's'} a winter below 15°F`,
      lines: [`${Math.round(100 * cold.length / all.length)}% of storms were too cold for rock salt to work well.`, 'More rock salt there only adds pollution.'],
      impact: `${fmtH(cold.reduce((a, x) => a + x.icyCrew, 0) / n)} of icy road per winter that rock salt can't prevent`, sure: 'High',
      why: 'State guides advise against dry rock salt below about 15°F.' });
    if (stuck.length) recs.push({ id: 'stuck', kind: 'Plan ahead', title: `Pre-treat with brine before flash freezes (about ${Math.max(1, Math.round(stuck.length / n))} a winter)`,
      lines: [`${Math.round(100 * stuck.length / all.length)}% of storms stayed icy over 2 hours at any salt rate: rain followed by a hard freeze, or long cold storms.`,
        'Time a pass just before the temperature drops, or brine the road before the storm.'],
      impact: `${fmtH(stuck.reduce((a, x) => a + x.icyCrew, 0) / n)} of icy road per winter`, sure: 'Medium',
      why: 'Salt spread during rain washes off; salt can\'t melt ice that has already bonded in deep cold.' });
    // 4) Equipment.
    const learned = mean(W.map(w => w.learnedScatter));
    if (learned > S.SETTINGS.scatter_loss + 0.03) recs.push({ id: 'prewet', kind: 'Equipment', title: 'Pre-wet the salt so less bounces off the road',
      lines: [`The drain sensors showed about ${Math.round(learned * 100)}% of the salt ending up on the shoulder, not ${Math.round(S.SETTINGS.scatter_loss * 100)}% as assumed.`],
      impact: `about ${fmtT((learned - S.SETTINGS.scatter_loss) * head.crewLb)} t salt per winter lands off the road`, sure: 'High',
      why: 'Wetting salt with brine at the spinner keeps more of it on the pavement.' });
    const maxed = all.filter(x => x.maxedH > 1);
    if (cfg.probe < 200 && maxed.length / all.length > 0.15) recs.push({ id: 'probe', kind: 'Equipment', title: 'Fit the high-range conductivity probe',
      lines: [`The standard probe hit its limit in ${Math.round(100 * maxed.length / all.length)}% of storms, so the saltiest runoff went uncounted.`],
      impact: 'better drain data, faster learning', sure: 'High', why: 'A K=10 probe reads about ten times higher.' });
    recs.push({ id: 'report', kind: 'Reporting', title: head.chlorideAvoided >= 0
        ? `Report about ${fmtT(head.chlorideAvoided)} t less chloride per winter in the stormwater (MS4) report`
        : `Explain the extra ${fmtT(-head.chlorideAvoided)} t of chloride per winter in the stormwater (MS4) report`,
      lines: [`Crew habit: ${fmtT(head.crewLb * S.CL_SHARE)} t of chloride per winter. Saltback's plan: ${fmtT(head.planLb * S.CL_SHARE)} t.`],
      impact: head.chlorideAvoided >= 0 ? 'documented reduction' : 'traded for fewer icy hours', sure: 'Medium', why: 'Chloride never breaks down; it builds up in streams and wells.' });
    const ORDER = ['rate', 'more', 'timing', 'cold', 'stuck', 'prewet', 'probe', 'report'];
    recs.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    return { head, recs, bands, levers, all };
  }

  const api = { PLACES, RANDOM, CREWS, TRUTH, simulateWinter, runMany, summarize, rng, pct, median, mean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaltbackWinters = api;
})(typeof window !== 'undefined' ? window : globalThis);
