# Before and after

Screenshots taken in headless Chromium at 1366 px (desktop) and 390 px (phone), light mode unless noted.
Every page was also checked for console errors (none) and horizontal page scroll (none) in light, dark and phone.

## Before (`before/`)

A developer console: monospaced labels and readouts, ALL-CAPS mini labels, a header strip of node and probe IDs,
an "Export" button on every card, red "HIGH" chloride badges on every storm, and black/amber paired bars.

| File | Page |
|---|---|
| `v-sim.png` | Live simulation (was the landing page): 15-row readout table, all 16 sliders open |
| `v-report.png` | Run report with the 384-row timeline table inside the report |
| `v-library.png` | Storm library table |
| `v-season.png` | Season analysis: "18% less salt", HIGH badges, recommendations with raw dates in the text |
| `v-data.png` | Data and export |
| `v-sim-dark.png`, `v-phone-sim.png` | Dark mode and phone |

## After (`after/`)

| File | Page | What to look at |
|---|---|---|
| `desk-overview.png` | Overview (landing page) | One-sentence headline with range and baseline, four large numbers, the savings waterfall, top 3 recommendations, running total |
| `desk-storms.png` | Storm report | The four pitch items (salt spread, excess, runoff saltiness, next time), the safety check line, the salt-vs-safety curve with the wasted region labeled |
| `desk-storm-flash.png` | Storm report, rain to flash freeze | "Salt alone couldn't keep this road clear" instead of a percent excess, with what would help |
| `desk-recommendations.png` | Recommendations | Per-storm change chart (green cuts, gray "salt can't fix it"), icy-time dumbbell, each recommendation with impact, confidence and its own chart |
| `desk-ratecard.png` | Crew rate card | Printable card with cells flagged against the state range; chart with crew dots and shaded state ranges |
| `desk-try-compare.png` | Try a storm | Same storm at Saltback's rate: 40% less salt, same 10 minutes of icy road |
| `desk-how.png` | How it works | Safety rules, uncertainty results, histogram, sensitivity chart, out-of-sample test, assumptions with sources |
| `desk-data.png` | Data | Tables with copy/CSV, raw timeline (the only place monospace is used) |
| `dark-overview.png`, `dark-recommendations.png` | Dark mode | |
| `phone-overview.png`, `phone-storms.png`, `phone-try.png` | Phone | No horizontal scroll; tables scroll inside their cards |
