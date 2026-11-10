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
- Start page = Storm log. Pages: Storm log, Simulate winters, Storm reports, Recommendations, Rate card, Sensors, Device, Data, Settings.
- Simulate winters (`web/winters.js`): owner wanted a Run button for N winters in a city / preset / random, charts, and
  recommendations that are easy to read (big numbered list, one impact line each). Auto-runs Boston on first visit.
- Device (`web/device.js`, three.js 0.160.0 from jsDelivr via an import map): 3D drain node with take-apart, see-inside,
  click-a-part, parts list (~$313), STL/GLB downloads. Printable parts come from `device/build_parts.py` into
  `web/device/*.stl` and `web/device/stl-data.js` (base64, because artifacts cannot serve .stl). Publish stl-data.js with the artifact, not the .stl files.
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
- `cleanup_h` (model.py / model.js) must stay 0 by default; only the many-winters simulator sets it (12 h).
- Testing the Device page offline: route `cdn.jsdelivr.net/npm/three@0.160.0/**` to a local `npm install three@0.160.0`.
- Testing: headless Chromium via Playwright (`require('playwright')`), serve `saltback/web` with
  `python3 -m http.server`. Check light, dark, 390 px phone, console errors, no horizontal page scroll.

## Possible next steps
- A road-condition input (crew reports or road weather station); check the city weather values against real records.
- Step 5: plug in real lab data (Experiments 1 and 2) and compare with the model.
