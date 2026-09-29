# 08 — Privacy, Legal & Ethics

> This is a student planning document, not legal advice. Ask your advisor (and, if possible,
> a local lawyer or law-school clinic) to review before any real launch.

A device that records conversations with older adults will get tough questions. Answering
them well is a **strength** of your pitch.

## Recording consent

- U.S. federal law and most states are **one-party consent**: a person may record a
  conversation they're part of.
- About a dozen states (including California, Florida, Illinois, Maryland, Massachusetts,
  Montana, New Hampshire, Pennsylvania, and Washington) generally require **all parties** to
  consent. Rules for phone vs. in-person conversations differ by state.
- **SEEN's design answer:**
  - **Press-to-record only.** SEEN never records all the time.
  - **Visible and felt:** light on + buzz whenever it's recording.
  - **Consent card** in the box (wallet-size): *"I use SEEN to help me remember our
    conversation. Is it OK if I record?"* — seniors can just hand it over.
  - Phone-call recording (a roadmap feature) would add a spoken announcement.
- Many doctors are fine with patients recording visits, and some encourage it — ask the
  experts you interview how they feel and quote them.

## Health privacy (HIPAA and friends)

- **HIPAA** applies to "covered entities" (doctors, hospitals, insurers) and their "business
  associates." A patient recording their own visit is not covered by HIPAA.
- If SEEN is later sold **through** healthcare organizations or insurers, SEEN becomes a
  business associate and must comply (signed BAAs, security rules, breach notifications).
- Consumer health products are covered by the **FTC Health Breach Notification Rule** and
  state privacy laws — which means strong security and honest privacy policies are required.

## How SEEN handles data

| Principle | In the prototype | In the product |
|---|---|---|
| Senior owns their data | Stored only on the team's laptop server | Encrypted cloud storage; export + delete anytime |
| Sharing is opt-in | Password-protected dashboard | Senior invites specific family members; can revoke |
| Minimal data | Audio + transcript only; no camera, no location | Option to auto-delete audio after the summary is made |
| AI processing | Speech-to-text runs locally; transcripts sent to the Claude API (Anthropic doesn't train on API data by default) | Same, with a signed data-processing agreement |
| Security | Device key, dashboard password, secrets kept out of git | Per-device keys, HTTPS everywhere, 2-factor login for families |

## Safety disclaimers (say these out loud and put them in writing)

- **SEEN is not a medical device.** Summaries can contain mistakes. Always confirm
  medication instructions with your doctor or pharmacist.
- **SEEN is not an emergency service.** The "check on me" long-press notifies family; it
  does not call 911.
- Scam warnings are helpful hints, not guarantees.

## Ethics: autonomy and dignity

- The **senior** decides what's recorded and who sees it — not the family. SEEN must never
  become a way to monitor someone without their knowledge.
- Design for dignity: respectful language, no "elderly," no baby-ish visuals.
- For people with dementia, involve their legal decision-maker and use extra care.

## Running the pilot as students

- Get your **advisor's** approval of the pilot plan and consent form. If your school requires
  a review for research with people, follow it.
- Use a **written consent form** that covers: what's recorded, where it's stored, who sees
  it, that participation is voluntary, that they can delete anything or quit anytime, and
  that data is deleted after the competition (pick a date, e.g., June 30, 2027).
- Encourage pilot users to record everyday conversations and practice appointments. For
  real medical visits, they should ask the clinician first.
- Never put real pilot recordings, transcripts, or names in this GitHub repo or in your
  pitch without written permission. `server/data/` is git-ignored for this reason.

### Sample consent form text

> I agree to try SEEN v1, a student prototype from [team name] at [school], from [date] to
> [date]. I understand that SEEN records audio only when I press its button, and that
> recordings and AI summaries are stored on a password-protected computer managed by the
> team and their advisor, [name]. I choose who can see my summaries: ______________.
> I can delete any recording or stop participating at any time by contacting [email/phone].
> All my recordings will be deleted by [date]. SEEN is not a medical device or an emergency
> service. I may / may not (circle one) be quoted by first name in the team's competition
> materials.
>
> Signature / date — Participant; Signature / date — Team advisor
