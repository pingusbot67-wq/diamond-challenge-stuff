# SEEN v1 — Diamond Challenge 2026–27

**SEEN** is a tiny, one-button memory companion for older adults. Clip it on, press the big
button, and SEEN records the conversation — a doctor's visit, a call with the pharmacy, a chat
with the grandkids. It then turns the recording into a short, large-print summary and a list of
"things to remember" (appointments, medication changes, who said what), and can share it with a
trusted family member.

> Inspired by AI note-taker devices like **Pocket** (a MagSafe disc that records and summarizes
> conversations), but designed from scratch for seniors: no app to learn, no screen, one button,
> big feedback, and a family/caregiver view.

Tagline ideas: *"Every conversation, remembered."* · *"Be heard. Be SEEN."*

## What's in this repo

| Folder / file | What it is |
|---|---|
| [`docs/01-competition-plan.md`](docs/01-competition-plan.md) | Diamond Challenge rules summary, deadlines, team roles, week-by-week timeline |
| [`docs/02-product-spec.md`](docs/02-product-spec.md) | Problem, target user, features (MVP vs. later), user flows, branding |
| [`docs/03-hardware.md`](docs/03-hardware.md) | Parts list with prices, wiring diagram, enclosure, power budget, build steps |
| [`docs/04-software.md`](docs/04-software.md) | System architecture, firmware, server, AI pipeline, caregiver dashboard |
| [`docs/05-business-model.md`](docs/05-business-model.md) | Market size, competitors, pricing, unit economics, go-to-market |
| [`docs/06-customer-discovery.md`](docs/06-customer-discovery.md) | Interview scripts, survey, pilot plan — your "traction" evidence |
| [`docs/07-pitch.md`](docs/07-pitch.md) | 60-second video script, concept narrative outline, 10-slide deck, 5-min pitch, judge Q&A |
| [`docs/08-privacy-legal-ethics.md`](docs/08-privacy-legal-ethics.md) | Recording-consent laws, data handling, safety disclaimers |
| [`docs/09-budget.md`](docs/09-budget.md) | Prototype budget and where the money goes |
| [`firmware/seen_v1/`](firmware/seen_v1/) | Arduino sketch for the device (Seeed XIAO ESP32-S3 Sense) |
| [`server/`](server/) | Python companion server: upload → transcribe → summarize with Claude → caregiver dashboard |

## The 30-second version of the plan

1. **Now → Oct 31:** Register the team, pick the track, do 20+ interviews with seniors and adult
   children, order parts.
2. **Nov:** Build the working prototype (button → record → upload → summary on a dashboard).
3. **Dec → Jan 14, 2027:** Pilot with 5–10 seniors, write the 3–5 page concept narrative, film
   the 60-second video, **submit before 5:00 pm ET on Jan 14.**
4. **Feb → Apr:** Polish the prototype (v1.1 case, battery life), build the 10-slide deck,
   rehearse the 5-minute pitch, compete at the pitching round and (hopefully) the Summit
   **April 29–30, 2027**.

Always double-check dates and requirements against the official rules at
[diamondchallenge.org](https://diamondchallenge.org) — they can change.
