# 02 — Product Spec: SEEN v1

## The problem

Older adults have a lot of important conversations — doctor visits, pharmacy calls, insurance
calls, bank calls — and a lot of trouble holding onto the details afterward.

Starting stats to cite (re-verify each and cite the source in your narrative):

- Patients forget **40–80%** of medical information almost immediately, and nearly half of what
  they do remember is wrong (Kessels, *Journal of the Royal Society of Medicine*, 2003).
- About **1 in 3** adults aged 65–74 has hearing loss, and nearly **half** of those over 75
  (NIH / NIDCD).
- ~**7 million** Americans 65+ live with Alzheimer's (Alzheimer's Association, 2024 Facts &
  Figures); far more have mild memory decline.
- Adults 60+ reported **billions** of dollars in fraud losses to the FBI in 2024 (FBI IC3 Elder
  Fraud Report) — much of it through phone calls.
- ~**53 million** Americans are unpaid family caregivers (AARP, 2025) — often an adult child
  who lives far away and wants to know "what did the doctor say?"

**Problem statement (use this sentence everywhere):**
> Seniors forget most of what they're told in important conversations, and the family members
> who help them have no reliable way to know what was said.

## Who it's for

**Primary user — "Margaret," 78.** Lives alone, sharp but forgetful, sees 3–4 doctors, takes 6
medications. Owns a smartphone but only uses it for calls and photos. Hates apps, small buttons,
and passwords. Wants to stay independent.

**Buyer — "David," 49, her son.** Lives 2 hours away. Calls her after every appointment and gets
"oh, it went fine." Worried about missed medication changes and phone scams. Will happily pay
for peace of mind.

> Key insight: **the user and the buyer are different people.** Design the device for Margaret
> and the dashboard/subscription for David.

## The solution

SEEN v1 is a small, rounded clip or pendant (about the size of a matchbox) with **one big
button**.

1. **Press the button** → gentle buzz + light turns on → SEEN is recording.
2. **Press again** → double buzz → recording saved.
3. When SEEN is back home on its charger (home Wi-Fi), it uploads the recording.
4. The SEEN service transcribes and summarizes it:
   - a **plain-English summary** in large print,
   - **"Things to remember"**: appointments, medication changes, tasks, phone numbers,
   - **who** was in the conversation,
   - a **scam warning** if the call looked like a known fraud pattern (gift cards, "your
     grandson is in jail," urgent wire transfers, requests for passwords).
5. Margaret (and, if she chooses, David) sees it on a simple web page / printout / text message.
6. Anyone with permission can **"Ask SEEN"**: *"What did Dr. Patel say about my blood
   pressure pills?"*

### How it's different from Pocket

| | Pocket (and Plaud, etc.) | SEEN v1 |
|---|---|---|
| Built for | Professionals, meetings | Seniors + their families |
| Controls | Phone app, multiple modes | **One big button**, buzz + light feedback |
| Needs a smartphone app | Yes | **No** — Wi-Fi + web dashboard; phone optional |
| Output | Meeting notes, mind maps | **Large-print summary, reminders, medication & appointment extraction** |
| Family sharing | Not the focus | **Caregiver dashboard** with permission controls |
| Safety | — | **Scam-call warning**, "I need help" long-press alert to family |
| Price | ~$129 device | Target **$79 device + $9.99/mo** family plan (see `05-business-model.md`) |

## Features

### MVP (must work by the January submission)
- [ ] One-button start/stop recording, vibration + LED feedback
- [ ] Stores recordings on microSD (works with no internet)
- [ ] Uploads over Wi-Fi to the SEEN server
- [ ] Transcript + AI summary + "things to remember"
- [ ] Simple web dashboard (large fonts) listing each conversation
- [ ] "Ask SEEN" question box

### v1.1 (by the pitching round)
- [ ] Scam-pattern warning on summaries
- [ ] Long-press (3 sec) → "check on me" alert to family (text/email)
- [ ] Battery level shown on dashboard
- [ ] Custom 3D-printed case with lanyard/clip
- [ ] Printable weekly summary (for people who prefer paper)

### Later / "roadmap slide" (don't build — just pitch)
- Phone-call capture (contact mic, like Pocket) — see legal notes
- Daily voice reminders played back through a small speaker ("Remember, pick up your prescription today")
- Integration with patient portals / pharmacy refill reminders
- Spanish and other languages
- Custom PCB, smaller device, 1-week battery

## Design principles (put these on a slide)

1. **One button, zero menus.** If Grandma needs instructions, we failed.
2. **Always tell them what's happening.** Buzz + light for every state change.
3. **Works without the internet.** Record first, upload later.
4. **The senior is in control.** They decide what's recorded and who sees it.
5. **Big, calm, readable.** 20pt+ text, high contrast, no jargon.

## Device states

| State | LED | Vibration |
|---|---|---|
| Idle | off | — |
| Recording | slow pulse / solid | 1 short buzz on start |
| Saved | off | 2 short buzzes |
| Uploading (on Wi-Fi) | quick blink | — |
| Error (SD full / no card) | 3 fast blinks | 3 long buzzes |
| Help alert sent (long press) | solid 3 sec | 1 long buzz |

## Branding

- **Name:** SEEN (always all caps in the logo). Version: **SEEN v1**.
- **Meaning:** Seniors deserve to be seen and heard — and remembered. (Optional backronym:
  *Senior Everyday Echo Notes*.)
- **Colors:** warm navy `#1F3A5F`, soft cream `#FFF8EC`, accent sunrise orange `#F28C28`.
- **Voice:** warm, respectful, never "elderly" or "for old people." Say "older adults" or
  "seniors," and focus on **independence**, not decline.
