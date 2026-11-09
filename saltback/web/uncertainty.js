/* How confident are we? Run with:  node web/uncertainty.js   (about a minute)
   Writes web/uncertainty-data.js, which the site's "How it works" page reads.

   Method. In each run the "true" world differs from what Saltback assumes: the least certain inputs are drawn at
   random from a realistic range. The crew salts the 12 example storms as usual, the drain probe measures the true
   runoff, and Saltback makes its recommendations from that data using its own (default) assumptions plus whatever
   it learns from the probe. Then the recommendations are judged in the TRUE world: how much salt they save and
   whether the road actually ends up icier. This is a fair test: Saltback never sees the true values.

   Note: the "ice film left after plowing" input belongs to the Step 1 snapshot model and is not used by the storm
   timeline. Its role there (how much brine keeps snow from bonding) is played by brine_film_mm, varied here. */
const fs = require('fs'), path = require('path');
const S = require('./model.js'), E = require('./engine.js');

const RANGES = {   // [low, high]; Saltback's own assumption is the model default
  brine_film_mm: { label: 'Brine needed to stop snow bonding', unit: 'mm', lo: 0.02, hi: 0.06 },
  bond_per_h: { label: 'How fast traffic packs snow into ice', unit: 'per hour', lo: 0.25, hi: 1.0 },
  unsalted_share: { label: 'Dilution from unsalted ground', unit: 'share', lo: 0.15, hi: 0.5 },
  drain_per_h: { label: 'How fast brine runs off the road', unit: 'per hour', lo: 0.15, hi: 0.5 },
  scatter_loss: { label: 'Salt bouncing off the road', unit: 'share', lo: 0.15, hi: 0.38 },
};
const BASE_TRUTH = { scatter_loss: 0.28 };   // the example season's hidden truth

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const ROBUST = process.argv[2] !== 'best-estimate';
function evaluate(truth) {
  const records = E.exampleSeason(truth);
  const a = E.analyze(records, { skipRateCard: true, robust: ROBUST });
  let icyNow = 0, icyPlan = 0, icyStep = 0, worstMin = -Infinity, worstStep = -Infinity, storms = [];
  for (const x of a.storms) {
    const t = E.settingsFor(x.record, truth);
    const now = S.stormTimeline(t, x.perPass, false).summary.icy_hours;
    const fixed = x.status === 'cant_fix' || x.status === 'too_cold';
    const planned = fixed ? now : S.stormTimeline({ ...t, first_pass_h: x.onTime ? E.ON_TIME_H : t.first_pass_h }, x.planRate, false).summary.icy_hours;
    const stepped = fixed ? now : S.stormTimeline({ ...t, first_pass_h: x.onTime ? E.ON_TIME_H : t.first_pass_h }, x.stepRate, false).summary.icy_hours;
    icyNow += now; icyPlan += planned; icyStep += stepped;
    if (!fixed) { worstMin = Math.max(worstMin, (planned - now) * 60); worstStep = Math.max(worstStep, (stepped - now) * 60); }
    storms.push({ date: x.record.date, status: x.status, nowMin: now * 60, planMin: planned * 60, claimedMin: x.icyPlan * 60 });
  }
  return { savingsPct: a.season.reductionPct, rateOnlyPct: a.season.rateOnlyPct, icyNow, icyPlan, claimedIcyPlan: a.season.icyPlan,
    worstStormMin: worstMin, stepPct: a.season.stepPct, icyStep, worstStepMin: worstStep, learnedScatter: a.calibration.scatter, calN: a.calibration.n, storms };
}
const pct = (xs, p) => { const a = [...xs].sort((x, y) => x - y); const i = (a.length - 1) * p, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
const r1 = v => Math.round(v * 10) / 10;

const t0 = Date.now();
// 1) Headline run (the example season as shown on the site)
const headline = evaluate(BASE_TRUTH);
// 2) Monte Carlo: 200 seasons with the uncertain inputs drawn at random
const N = 200, rand = rng(2027), runs = [];
for (let k = 0; k < N; k++) {
  const truth = {};
  for (const [key, r] of Object.entries(RANGES)) truth[key] = r.lo + (r.hi - r.lo) * rand();
  const e = evaluate(truth);
  runs.push({ truth: Object.fromEntries(Object.entries(truth).map(([k2, v]) => [k2, +v.toFixed(3)])), savingsPct: r1(e.savingsPct),
    icyNow: r1(e.icyNow), icyPlan: r1(e.icyPlan), worstStormMin: Math.round(e.worstStormMin),
    stepPct: r1(e.stepPct), icyStep: r1(e.icyStep), worstStepMin: Math.round(e.worstStepMin) });
  if (k % 25 === 0) process.stdout.write(`run ${k}/${N}\n`);
}
const sav = runs.map(r => r.savingsPct), dIcy = runs.map(r => r.icyPlan - r.icyNow);
const summary = {
  n: N, savingsP5: r1(pct(sav, 0.05)), savingsP50: r1(pct(sav, 0.5)), savingsP95: r1(pct(sav, 0.95)),
  icyChangeP5: r1(pct(dIcy, 0.05)), icyChangeP50: r1(pct(dIcy, 0.5)), icyChangeP95: r1(pct(dIcy, 0.95)),
  shareSeasonNotIcier: Math.round(100 * runs.filter(r => r.icyPlan <= r.icyNow + 0.1).length / N),
  shareNoStormOver6: Math.round(100 * runs.filter(r => r.worstStormMin <= 6).length / N),
  worstStormMinP95: Math.round(pct(runs.map(r => r.worstStormMin), 0.95)),
  stepP5: r1(pct(runs.map(r => r.stepPct), 0.05)), stepP50: r1(pct(runs.map(r => r.stepPct), 0.5)), stepP95: r1(pct(runs.map(r => r.stepPct), 0.95)),
  stepIcyChangeP50: r1(pct(runs.map(r => r.icyStep - r.icyNow), 0.5)), stepIcyChangeP95: r1(pct(runs.map(r => r.icyStep - r.icyNow), 0.95)),
  stepShareSeasonNotIcier: Math.round(100 * runs.filter(r => r.icyStep <= r.icyNow + 0.1).length / N),
  stepShareNoStormOver6: Math.round(100 * runs.filter(r => r.worstStepMin <= 6).length / N),
  stepWorstStormMinP95: Math.round(pct(runs.map(r => r.worstStepMin), 0.95)),
};
// 3) Tornado: move one input at a time to its low and high value
const tornado = Object.entries(RANGES).map(([key, r]) => {
  const lo = evaluate({ ...BASE_TRUTH, [key]: r.lo }), hi = evaluate({ ...BASE_TRUTH, [key]: r.hi });
  return { key, label: r.label, unit: r.unit, lo: r.lo, hi: r.hi, base: (key in BASE_TRUTH ? BASE_TRUTH : S.SETTINGS)[key],
    savingsLo: r1(lo.savingsPct), savingsHi: r1(hi.savingsPct), icyChangeLo: r1(lo.icyPlan - lo.icyNow), icyChangeHi: r1(hi.icyPlan - hi.icyNow),
    worstLo: Math.round(lo.worstStormMin), worstHi: Math.round(hi.worstStormMin) };
}).sort((a, b) => Math.abs(b.savingsHi - b.savingsLo) - Math.abs(a.savingsHi - a.savingsLo));
// 4) Out-of-sample test: three hidden differences Saltback was not told about
const testTruth = { scatter_loss: 0.28, unsalted_share: 0.45, bond_per_h: 0.8 };
const test = evaluate(testTruth);
const outOfSample = { truth: testTruth, assumed: { scatter_loss: S.SETTINGS.scatter_loss, unsalted_share: S.SETTINGS.unsalted_share, bond_per_h: S.SETTINGS.bond_per_h },
  learnedScatter: +test.learnedScatter.toFixed(3), calN: test.calN, savingsPct: r1(test.savingsPct), icyNow: r1(test.icyNow),
  icyPlanClaimed: r1(test.claimedIcyPlan), icyPlanTrue: r1(test.icyPlan), worstStormMin: Math.round(test.worstStormMin),
  stepPct: r1(test.stepPct), icyStepTrue: r1(test.icyStep), worstStepMin: Math.round(test.worstStepMin),
  stormsIcierOver6: test.storms.filter(s => s.status !== 'cant_fix' && s.status !== 'too_cold' && s.planMin - s.nowMin > 6).map(s => ({ date: s.date, nowMin: Math.round(s.nowMin), planMin: Math.round(s.planMin) })) };

const out = { generated: new Date().toISOString().slice(0, 10), seconds: Math.round((Date.now() - t0) / 1000), ranges: RANGES, baseTruth: BASE_TRUTH,
  headline: { savingsPct: r1(headline.savingsPct), icyNow: r1(headline.icyNow), icyPlan: r1(headline.icyPlan), worstStormMin: Math.round(headline.worstStormMin),
    stepPct: r1(headline.stepPct), icyStep: r1(headline.icyStep), worstStepMin: Math.round(headline.worstStepMin) },
  summary, tornado, outOfSample, runs };
out.robust = ROBUST;
if (!ROBUST) { console.log(JSON.stringify({ headline: out.headline, summary })); process.exit(0); }   // comparison run only
fs.writeFileSync(path.join(__dirname, 'uncertainty-data.js'),
  '/* Generated by `node web/uncertainty.js`. Do not edit by hand. */\nwindow.SaltbackUncertainty = ' + JSON.stringify(out) + ';\n');
console.log(JSON.stringify({ headline: out.headline, summary, tornado: tornado.map(t => [t.key, t.savingsLo, t.savingsHi, t.icyChangeLo, t.icyChangeHi]), outOfSample }, null, 1));
console.log(`done in ${out.seconds}s`);
