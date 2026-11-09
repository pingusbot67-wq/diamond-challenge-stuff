# Prompt: improve the Saltback simulator

Copy everything below the line into Claude Code (or another coding AI) that has access to this repository.

---

You are improving **Saltback**, an early-stage simulator for a student startup pitch (Diamond Challenge). The code is in the `saltback/` folder on the branch `claude/blissful-wright-uey5ta` of `pingusbot67-wq/diamond-challenge-stuff`. Read `saltback/README.md`, `saltback/web/model.js`, `saltback/web/engine.js`, `saltback/web/report.js` and `saltback/web/index.html` before changing anything.

## What Saltback is (the pitch the simulator has to support)

Saltback helps towns use less road salt without making roads less safe. Cities log how much salt their trucks spread, but they can't tell whether that much was needed. Saltback puts low-cost conductivity and temperature sensors in storm drains to measure the salt washing off the road after each storm. It combines those readings with the truck logs and the weather, uses a physics model of how salt melts ice at different temperatures, and works out how much salt each storm needed. After every storm the town gets a simple report: salt spread, how much was excess, how salty the runoff was, and how much to use next time. Over a season it learns each route's patterns and produces a crew rate card and ranked recommendations (cut salt on mild days, get the first truck out earlier, add salt on the coldest storms). Our current claim: about 18% less salt across a 12-storm example season, with fewer icy-road hours.

**Who will look at this:** competition judges, and town public-works directors with no science background. They should understand the main result in 10 seconds and trust it after 2 minutes. Scientists and engineers are the second audience; they should still be able to find every assumption and raw number.

The physics and decision engine are a solid start. The problems are that (1) a few results contradict the "just as safe" promise or are misleading, (2) the site looks like a developer console instead of a product, and (3) the charts show raw data rather than the recommendations. Fix all three, in this order.

---

## Part 1: fix the logic so the numbers hold up

Change `model.py` and `model.js` together; they must stay identical. Run `python web/check_parity.py` after every model change, re-run `simulate.py`, and rebuild the notebook with `build_notebook.py`.

1. **"Just as safe" is not true yet. Make it true.** `findNeeded` picks the smallest rate within 0.5 icy-hours of the best possible. In practice the recommended rate is often icier than what the crew actually did (Overnight snow: 0.2 h icy as salted vs 0.6 h at the "needed" rate; the Findings text even says "120 lb per pass would have kept it icy 35 min"). Change the rule:
   - "Needed" = the smallest rate whose icy time is within **15 minutes** of the best achievable.
   - Saltback must **never recommend a cut that leaves the road icier than it actually was by more than 6 minutes**. If the cut would, recommend a smaller cut.
   - Show the safety check on every storm: "Icy time: 12 min as salted → 15 min with Saltback's rate."
   - Recompute the season totals and report the new headline honestly, even if it is no longer 18%.

2. **Add a "salt can't fix this" outcome.** On Arctic cold snap (21 h icy) and Rain to flash freeze (22.8 h icy), more salt barely helps, yet the flash freeze is labeled "41% excess, use 30% less next time". If the road stays icy for more than 2 hours even at the maximum rate, don't compute excess or a rate cut. Label the storm "Salt alone couldn't keep this road clear" and recommend what would help: pre-treating with brine before the temperature drops, timing a pass right before the freeze, or sand or a stronger chemical at very low temperatures.

3. **Replace the chloride "HIGH" badge.** Every storm shows red HIGH because drain water is compared with EPA *stream* limits (230/860 mg/L). Undiluted road runoff is always far above those, so the badge carries no information and looks alarmist. Instead:
   - Report **chloride load per storm in pounds** (what actually builds up in streams and groundwater), and compare it with this route's season median: "lower than usual / typical / higher than usual".
   - Keep the EPA comparison as context in one place: "Drain water peaked at 45× the stream limit before dilution."
   - Treat chloride as a *result* of the salt decision, not as a separate alarm.

4. **Make the 18% claim defensible.**
   - **Split it by lever.** Show how much comes from lower rates on mild storms, how much from earlier first trucks, and how much is *added* on cold storms. Saltback can't change truck timing by itself, so judges need to see it separately.
   - **Compare against a fair baseline.** The example crew's habits were chosen by us, so the savings partly reflect how wasteful we made them. Add a second baseline: a crew that follows a published state rate chart (use typical published values, cite the source in the UI, and label the values as approximate). Report savings against both: "18% vs. this crew's habits, X% vs. a crew following the state chart."
   - **Add an uncertainty range** (this is roadmap Step 4). Re-run the season about 200 times with the least-certain inputs varied (ice film ±50%, brine film needed to stop bonding, bond rate, drain dilution, bounce loss), and report a range: "Saltback cuts salt by 12–24% (typical 18%) without adding icy hours."
   - **Test the engine on data it didn't generate.** Right now the example data comes from the same model the engine uses, with only the bounce loss changed, so the engine finding 28% is close to guaranteed. Generate one test season with two or three hidden differences (for example, more dilution and faster bonding as well as bounce loss) and show what the calibration gets right and wrong. Put this in a "How confident are we?" section; it's a strength to show it.

5. **Make the "next time" advice realistic.** Rate card cells like 40 lb/lane-mile at 28–32°F, and per-storm cuts of 80–90%, will lose a public-works director immediately. Keep the physics answer, but phrase next-storm advice as a step: "Try 25% less next time; Saltback will check the result." Cap each step-down at 25–30% per storm, with no cap on safety increases. Check every rate card band against published state rate charts. If a band falls outside the published range, flag it in the UI instead of hiding it.

6. **Small bugs:**
   - The end-time label shows `31:60` instead of `32:00`. In `index.html`, `hhmm()` floors the minutes after a floating-point sum; round the total minutes first.
   - The live simulation's probe log chart has an unlabeled 0/24/48 axis and dotted lines with no explanation.
   - Check every page for console errors.

---

## Part 2: make it look like a product, not a developer console

Keep the no-build setup: it should still work by opening `index.html`, with plain JS and no framework. Keep the Excel/Sheets export.

**Restructure the navigation around what a town actually gets:**

1. **Overview** (landing page): the season result. One sentence of headline ("Saltback would have used 18% less salt this season and cut icy-road time from 15.6 to 4.3 hours"), four large numbers (salt saved in tons, dollars saved, icy hours before → after, chloride kept out of streams), the waterfall chart (below), and the top 3 recommendations.
2. **Storm reports**: pick a storm and get the one-page report a town receives after each storm. It must match the pitch exactly: salt spread, how much was excess, how salty the runoff was, how much to use next time, plus one chart. Make it print-friendly (`@media print`), since towns will forward it.
3. **Recommendations**: the ranked list, each with its own small chart and its impact in tons, dollars and icy minutes.
4. **Crew rate card**: a visual, printable card a crew could keep in a truck cab.
5. **Try a storm**: the live simulation (no longer the landing page).
6. **How it works**: the method, every assumption with its source and range, the uncertainty results, the "simulated data" disclaimer, and the parity check. Developer details (model.js, engine.js, node IDs, probe model numbers) go here only.
7. **Data**: raw tables, CSV import, exports. Move the 384-row timeline table here; it does not belong in a report.

**Visual cleanup (the "vibe-coded" look):**

- **Type:** one sans-serif family for everything (keep IBM Plex Sans or use Inter), with `font-variant-numeric: tabular-nums` for numbers. Use monospace only in raw data tables. Right now mono is used for labels, legends, readouts and badges, which is the main reason the site looks like a terminal.
- **No ALL-CAPS mini labels.** Use sentence case: "Salt spread", not "SALT SPREAD".
- **Remove developer chrome:** the header strip (`Node SB-01 · Probe DFR0300 · max 20 mS/cm · Interval 5 min`) and the sidebar footer (`Physics: model.js / Decisions: engine.js`). Keep one small, clear "Simulated data, not real town records" tag.
- **Color has a meaning, and only one meaning:** neutral grays for structure, one brand accent, green for salt saved, blue for ice and water, amber for over-salted, and **red only for real safety problems** (icy road, under-salted). Today red marks every chloride badge and orange marks both "excess" and "under", which reads as alarm everywhere. Never rely on color alone: pair it with a word or icon.
- **Plain units first:** tons and pounds, dollars, hours and minutes of icy road, "X× the stream limit". Move mS/cm, g/m², mm of brine and mg/L into tooltips, the Data tab or "How it works". Round sensibly: 142,600 lb → "71 tons"; whole-number percentages; icy time in minutes when under an hour.
- **One export menu** in the page header, instead of an "Export ▾" button on every card.
- **Definitions on hover** for: lane-mile, needed salt, excess, chloride, bounce loss, rate card. Write them in one plain sentence each.
- **Fewer controls in "Try a storm":** show only 5 sliders (road temperature, snowfall, storm length, salt per pass, first truck arrives after). Put the other 11 under a collapsed "Advanced assumptions" section. Cut the 15-row readout panel to 5: road condition, icy right now?, salt used so far, runoff saltiness (plain words), probe status. Add a "Run again with Saltback's rate" button that shows the two runs side by side: same storm, less salt, same safety. That before/after is the most persuasive moment in the demo.
- **Layout:** generous whitespace, a max content width of about 1200px, cards with one job each, consistent 8px spacing scale, works on a phone (no horizontal scroll; tables scroll inside their card), light and dark mode both checked.
- **Accessibility:** WCAG AA contrast, visible keyboard focus, charts with a text summary for screen readers.

---

## Part 3: charts that show the recommendations, not just the data

Rules for every chart:

- The **title states the takeaway**, not the variable: "Mild storms got 4× the salt they needed", not "Salt per pass: used against needed".
- One subtitle line saying what is plotted and in what units.
- **Label lines and bars directly** instead of using a legend wherever possible.
- At most 2–3 colors, using the color meanings above.
- Annotate the one point that matters: "you are here", "recommended", "wasted".
- One consistent chart style across the site. Either keep the hand-rolled SVG with one shared helper, or use a single lightweight library from cdnjs pinned to an exact version. Don't mix the two.

**Build these charts:**

1. **Season waterfall (Overview, most important).** Salt the crew used → minus "lower rates on mild days" → minus "first truck out earlier" → plus "more salt on the coldest storms" → Saltback's plan. Each bar is labeled in tons and dollars. This one chart explains the whole recommendation list.
2. **Rate card chart (Rate card and Recommendations).** X axis: road temperature (°F, cold on the left). Y axis: lb per lane-mile per pass. Show a line for Saltback's recommended rate (one line per snowfall level, or just moderate snow with the others as thin lines), dots for what the crew actually used in each storm, and a shaded band for the published state-chart range. Readers should see "crew is too high on the right, too low on the left" without reading any text. Dots above the line are amber ("over"), below are red ("under, icy").
3. **Per-storm change chart.** One horizontal bar per storm, sorted by road temperature, showing the recommended % change: green bars going left for cuts, red or blue bars going right for safety increases, and a gray "salt couldn't fix it" marker for storms like the flash freeze. Replaces the current black/orange paired bars.
4. **Icy time before and after (dumbbell chart).** For each storm, a dot for icy minutes as salted and a dot for icy minutes with Saltback's plan, joined by a line. This is the visual proof of "not less safe".
5. **Salt vs. safety curve (Storm report).** Keep the existing "salt per pass vs. hours icy" curve, but shade the region past the needed rate and label it "Wasted: no extra safety", mark "Used" and "Recommended" points, and write the wasted amount in pounds and dollars on the chart.
6. **Cost of a late first truck (Recommendations, Timing).** X: first truck arrives after (0, 30, 60, 90, 120 min). Y: salt needed per pass. Annotate "Each 30 minutes late costs about X lb per lane-mile."
7. **Season running total.** Cumulative salt over the season's storm dates: one line for actual, one for Saltback's plan, with the gap labeled in tons and dollars at the end. Easy for judges to read.
8. **Chloride load per storm.** Bars of pounds of chloride reaching the drain per storm, with a line for the season median. Add one sentence of plain context, for example "This season's chloride would push about N million gallons of water past the EPA long-term limit". Check the arithmetic and show the formula in a tooltip.
9. **Where the salt went** (keep, but make it a single stacked bar: drain / shoulder and soil / still on road, as percentages and pounds).
10. **Uncertainty strip (How it works).** A histogram or range bar of salt savings across the ~200 uncertainty runs, with the headline number marked. Optionally a tornado chart showing which input moves the result most (we expect "ice film left after plowing").

Remove or move to the Data tab: the raw "Road surface over time" sawtooth chart (keep it only in "Try a storm", with a plain-English caption), the probe log as a main chart, and the 384-row timeline table.

---

## Part 4: wording

- Write every sentence for a town official: short, concrete, no jargon. "Your crew used 220 lb per lane-mile. 140 would have kept the road just as clear. Next time, try 170."
- Each recommendation follows the same pattern: **what to do → why → impact (tons, $, icy minutes) → how sure we are (high / medium / low)**.
- Don't list raw dates inside recommendation text. Link to the storms instead.
- Keep the "Simulated data, based on typical published values, not real town records" note visible on every page, small and calm.

---

## Done means

- [ ] `check_parity.py` passes, and the notebook is rebuilt and runs top to bottom in Colab.
- [ ] No storm's recommendation leaves the road icier than it actually was by more than 6 minutes.
- [ ] The flash-freeze and arctic storms show "salt alone couldn't fix this", not a percent excess.
- [ ] The headline savings appear with a range, split by lever, and against both baselines.
- [ ] The landing page is the Overview, with the waterfall chart and the top 3 recommendations.
- [ ] A one-page, printable storm report exists and matches the four items in the pitch.
- [ ] Every chart title states a takeaway; no chart relies on color alone.
- [ ] No monospace outside raw data tables, no ALL-CAPS labels, no developer file names outside "How it works".
- [ ] Red appears only for real safety problems.
- [ ] Works at phone width with no horizontal page scroll, in light and dark mode.
- [ ] The README is updated with the new numbers, and the old 18% / 15.6 → 4.3 h figures are replaced wherever they changed.
- [ ] Before/after screenshots of each page are taken and described, and anything that couldn't be done is listed.

Commit in small steps with clear messages, and summarize at the end what changed in the numbers and why.
