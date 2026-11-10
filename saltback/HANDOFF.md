# Handoff notes (for a new Claude session)

Read this first, then `README.md`.

## What Saltback is
A Diamond Challenge student startup. Cheap conductivity + temperature sensors in storm drains measure road-salt
runoff. Saltback combines that with truck logs and weather, runs a physics model of salt melting ice, works out how
much salt each storm needed, and gives the town a report per storm (salt spread, excess, runoff, next-time rate),
plus season recommendations and a crew rate card. **All data is simulated; nothing is real town data.**

The owner is a student with no coding experience and a weak laptop: explain simply, run heavy things in the cloud
or Google Colab.

## Where things are
- Repo `pingusbot67-wq/diamond-challenge-stuff`, branch `claude/blissful-wright-uey5ta`, folder `saltback/`.
- Live site (private claude.ai artifact): https://claude.ai/artifact/AH6wXhn5TmQdTVGgkWpHCx, published from
  `saltback/web/index.html` with `model.js`, `engine.js`, `report.js`, `xlsx.js` as extra files. Republish to the
  same URL to keep the link. Page capabilities: `downloads`, and `mcp` Google Drive `create_file`
  ("Send to Google Sheets" button, never verified with a real call).

## Current state of the website (what the owner liked)
- Plain, minimal data-collection tool, NOT a pitch deck: black and white, system font, text sidebar, thin rules,
  tables first, no cards, no accent colour. Colour only for small status squares and red icy times.
- Start page = Storm log. Pages: Storm log, Storm reports, Recommendations, Rate card, Sensors, Data, Settings.
- Storm reports open with a simple one-colour dot replay of the storm (owner asked to keep this).
- Owner explicitly asked to remove examples, overview/pitch content and "vibe coded" styling. Don't bring them back.
- Storms are stored in browser localStorage (`saltback.records.v4`); starts with a 12-storm simulated season.

## Rules to keep
- `model.py` and `web/model.js` must stay identical in behaviour: run `python web/check_parity.py` after changes.
- Safety rules (see README "How it decides"): needed = smallest rate within 15 min of best icy time; recommended
  rate no more than 6 min icier than the crew's result, also in a pessimistic case; cuts capped at 25% per storm;
  "salt can't fix" over 2 h icy at 600 lb; below 15°F advise sand/chemical.
- `node web/uncertainty.js` regenerates `web/uncertainty-data.js` (numbers quoted in README).
- `python build_notebook.py` rebuilds `Saltback.ipynb` after Python changes.
- Testing: headless Chromium via Playwright (`require('playwright')`), serve `saltback/web` with
  `python3 -m http.server`. Check light, dark, 390 px phone, console errors, no horizontal page scroll.

## Possible next steps
- Step 3: many random winters; a road-condition input (crew reports or road weather station).
- Step 5: plug in real lab data (Experiments 1 and 2) and compare with the model.
