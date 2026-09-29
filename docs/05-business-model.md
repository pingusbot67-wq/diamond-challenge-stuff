# 05 — Business Model

## Market size (fill in with cited numbers)

| Level | Definition | Rough number to verify + cite |
|---|---|---|
| **TAM** | All Americans 65+ | ~61 million (U.S. Census Bureau, 2024) |
| **SAM** | 65+ managing multiple health conditions who have a family member helping them | Tens of millions — most older adults have 2+ chronic conditions (CDC / NCOA); ~53M family caregivers (AARP 2025) |
| **SOM** | Who we can realistically reach in 3 years | e.g., 10,000 households (start in your state through senior centers) |

Revenue at SOM: 10,000 × ($79 device + $9.99 × 12 months) ≈ **$2M/year**. Show the math on
the slide.

## Competitors

| Competitor | What it is | Price (verify) | Why SEEN wins for seniors |
|---|---|---|---|
| **Pocket** | MagSafe disc AI note-taker for professionals | ~$129, no required subscription | Needs a smartphone/app; built for meetings, not medical details or family sharing |
| **Plaud NotePin / Note** | Wearable AI recorders | ~$159+, optional subscription | Same — pro-focused, app-dependent |
| **Bee** (acquired by Amazon, 2025) | Always-listening AI wristband | varies | Always-on recording raises consent + privacy concerns; SEEN is press-to-record |
| **Medical alert pendants** (Life Alert, Medical Guardian, Lively) | Emergency button | ~$25–45/month | Emergencies only — nothing about remembering conversations |
| **Phone voice memo apps** | Free | $0 | Seniors don't use them; no summary, no family view |
| **Notebook / family member attends** | Free | $0 (but costs time) | Notes are incomplete; family can't attend every visit |

**Our positioning:** *the only AI memory device designed for older adults and the families who
support them.*

**Unfair advantages to build:** senior-first design validated by real users, trust
partnerships (senior centers, doctors), caregiver dashboard, scam detection.

## Revenue model

| Stream | Price | Notes |
|---|---|---|
| SEEN device | **$79** one-time | Below Pocket's price; easy gift for an adult child to buy a parent |
| SEEN Family plan | **$9.99/month** (or $99/year) | Unlimited summaries, Ask SEEN, family dashboard, alerts, scam warnings |
| Free tier | $0 | Summaries for the senior only, 5/month — keeps the device useful without a subscription |
| B2B (later) | $6/user/month, bulk devices | Senior living communities, home-care agencies, Medicare Advantage supplemental benefits |

Test these prices in customer interviews ("Would you pay $79? $129? $49?") and put the
results on a slide.

## Unit economics

**Device (at 10K-unit scale):**

| | $ |
|---|---|
| Price | 79.00 |
| Parts + assembly (see `03-hardware.md`) | −18.00 |
| Shipping + payment fees + returns | −9.00 |
| **Gross profit per device** | **≈ 52 (66%)** |

**Subscription (per user per month):**

| | $ |
|---|---|
| Price | 9.99 |
| AI (transcription + Claude summaries, ~2 recordings/day) | −3.00 to −5.00 |
| Cloud hosting + storage + notifications | −0.50 |
| Payment fees | −0.60 |
| **Gross profit** | **≈ $4–6 (40–60%)** |

Ways to improve AI margins: summaries aren't urgent, so run them through the Anthropic
**Batch API (50% cheaper)**; run speech-to-text on our own servers; skip silence.

**Customer acquisition cost (CAC) target:** < $60 (through senior-center partnerships and
word of mouth, not just ads). **Lifetime value:** $52 device profit + ~$5/month × 24 months ≈
**$170** → LTV/CAC ≈ 3 (the rule of thumb investors look for).

## Go-to-market

1. **Phase 1 — Local pilot (now → spring 2027):** 2–3 senior centers / assisted living
   facilities near you. Free devices in exchange for feedback + testimonials.
2. **Phase 2 — Direct to families:** landing page + waitlist → pre-orders. Target adult
   children 40–65 through Facebook groups for caregivers, AARP community forums, and
   "gift for parents" moments (Mother's/Father's Day, holidays).
3. **Phase 3 — Partnerships:** home-care agencies, Area Agencies on Aging, geriatric
   practices ("give SEEN to your patients so they remember your instructions").
4. **Phase 4 — Insurance:** Medicare Advantage plans pay for supplemental benefits that
   improve medication adherence and reduce readmissions — SEEN's long-term big customer.

## Use of prize money / funding (for the pitch)

If you win ~$12,000:
- 40% — 50 more devices for a larger pilot (and a custom PCB run)
- 25% — Industrial design + injection-mold quote / first production-ready case
- 15% — Cloud + AI costs for a year of pilot users
- 10% — FCC pre-compliance testing consultation
- 10% — Marketing (landing page, printed materials for senior centers)

## Milestones to show

| Date | Milestone |
|---|---|
| Nov 2026 | Working prototype |
| Dec 2026 | 5–10 pilot users |
| Jan 2027 | Diamond Challenge submission; X interviews, Y survey responses |
| Apr 2027 | 25+ pilot users, 100+ waitlist signups, 1 partner facility |
| Summer 2027 | v2 hardware (custom PCB), cloud version |
