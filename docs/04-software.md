# 04 — Software Plan

## Architecture

```
┌──────────── SEEN device ────────────┐        ┌──────────────── SEEN server ────────────────┐
│ button ─▶ record 16 kHz WAV ─▶ SD   │  Wi-Fi │ /api/upload ─▶ faster-whisper (transcript)  │
│ every 3 min idle: upload /rec/*.wav │ ─────▶ │            ─▶ Claude (summary JSON)         │
│ long press ─▶ /api/alert            │        │            ─▶ SQLite                        │
└─────────────────────────────────────┘        │ /  dashboard  · /ask  "Ask SEEN"            │
                                               │ ntfy.sh push ─▶ family's phone (optional)   │
                                               └─────────────────────────────────────────────┘
```

Everything in the prototype is in this repo:

| Piece | Tech | Location |
|---|---|---|
| Firmware | Arduino C++ on ESP32-S3 | `firmware/seen_v1/seen_v1.ino` |
| Server | Python 3.11, FastAPI, SQLite | `server/app.py` |
| Speech-to-text | faster-whisper (runs locally, free, private) | `server/pipeline.py` |
| Summaries + Q&A | Claude API (`claude-opus-5-5`) with structured JSON output | `server/pipeline.py` |
| Dashboard | Server-rendered HTML, large print | `server/templates/` |
| Alerts | ntfy.sh (free push notifications) | `server/app.py` |

**Why record first, upload later?** Seniors will use SEEN in doctors' offices with no Wi-Fi.
The SD card means nothing is lost; the upload happens when they're home.

**Why a web dashboard, not a phone app?** Seniors in our target group often don't install
apps. A web page works on the family's phones, a tablet on the kitchen counter, or can be
printed. (A phone app is a roadmap item.)

## Firmware (device)

Set up:
1. Install Arduino IDE 2.x → Boards Manager → "esp32 by Espressif Systems" (3.x).
2. Board: **XIAO_ESP32S3**; PSRAM: **OPI PSRAM**.
3. Copy `config.example.h` → `config.h`; fill in Wi-Fi, server IP, device key.
4. Upload. Open Serial Monitor at 115200 baud to watch it work.

Behavior (see comments in the sketch):
- Short press toggles recording; buzz/LED feedback for every state.
- Long press (3 s) when idle sends a "check on me" alert.
- Files go to `/rec`, move to `/sent` after a successful upload; retries automatically.
- Auto-stops after 2 hours; refuses to record if the card has < 50 MB free.
- Wi-Fi is **off** except while uploading (saves battery).

Firmware to-do list (good tasks to split among the team):
- [ ] Deep/light sleep between uploads for longer battery life
- [ ] Only upload when charging (detect battery voltage > 4.1 V)
- [ ] Low-battery warning buzz
- [ ] Wi-Fi setup without re-flashing (WiFiManager captive portal)
- [ ] Compress audio (e.g., ADPCM) to upload 4× faster

## Server

See `server/README.md` for install and run steps. Key design choices:

- **Device authentication:** every upload carries a shared device key.
- **Dashboard password:** the dashboard contains medical info — never run it without one.
- **Duplicate-safe uploads:** if the device retries, the server doesn't double-count.
- **Background processing:** the device gets an instant "OK"; transcription happens after.
- **Demo mode:** `SEEN_DEMO_MODE=1` returns a sample summary — for pitch practice and
  no-internet venues.

## The AI part

### Step 1: Speech → text
faster-whisper `base.en` on a laptop CPU transcribes a 10-minute recording in roughly 1–3
minutes. Use `WHISPER_MODEL=small.en` for better accuracy if the laptop is fast enough.
Test with: quiet room, noisy waiting room, soft-spoken person, accents.

### Step 2: Text → senior-friendly summary
Claude gets the transcript and a system prompt (in `pipeline.py`) that says: write for the
older adult, 6th-grade reading level, copy doses/dates exactly, never invent medical details.
The output is **structured JSON** (enforced by a schema):

```json
{
  "title": "Visit with Dr. Patel",
  "summary": "You saw Dr. Patel for a checkup...",
  "people": ["Dr. Patel"],
  "things_to_remember": [
    {"kind": "medication", "text": "Start lisinopril 10 mg, once every morning", "when": "Starting tomorrow"},
    {"kind": "appointment", "text": "Next visit with Dr. Patel", "when": "November 12 at 10:30 AM"}
  ],
  "scam_warning": {"suspicious": false, "reason": ""}
}
```

### Step 3: "Ask SEEN"
The 20 most recent summaries + transcripts are sent with the question. Claude answers in 1–4
plain sentences and names which conversation the answer came from — or says it doesn't know.

### Measuring AI quality (great for the pitch!)
Build a small test set: 10 recordings (role-play doctor visits, pharmacy calls, a fake scam
call). For each, write down the "correct" things to remember. Then measure:

| Metric | Target |
|---|---|
| Medication/appointment items captured correctly | ≥ 90% |
| Items invented that weren't said | 0 |
| Scam calls flagged | 5/5 |
| Normal calls wrongly flagged as scams | ≤ 1/10 |
| Pilot users rating summary "accurate" | ≥ 4 / 5 |

Put the result on a slide: *"SEEN captured 47 of 50 medical details correctly in testing."*

## Demo day setup (checklist)

- [ ] Laptop running the server, charged, with charger
- [ ] Phone hotspot as the Wi-Fi (set SSID/password in `config.h` beforehand); don't rely on venue Wi-Fi
- [ ] SEEN device charged, SD card with free space, 1 backup unit
- [ ] Dashboard open in a browser tab, zoomed to 125% so judges can read it
- [ ] Pre-recorded 20-second backup video of the full flow
- [ ] `SEEN_DEMO_MODE=1` ready as a last resort (say so if you use it)

**Live demo script (45 seconds):** press button → role-play 15 seconds of "doctor" giving a
new medication and appointment → press stop (double buzz) → device uploads over hotspot →
refresh dashboard → summary + "things to remember" appear → type "When is my next
appointment?" into Ask SEEN.

Tip: to make uploads instant during a demo, temporarily set `UPLOAD_INTERVAL_MS` to 10 seconds.

## Production roadmap (for the pitch)

| Now (prototype) | Product |
|---|---|
| Laptop server at home | Cloud service (AWS/GCP) with encrypted storage |
| Shared device key | Per-device keys provisioned at the factory |
| Wi-Fi only | Wi-Fi + Bluetooth sync through a family member's phone |
| Web dashboard | Web + iOS/Android caregiver app, text-message summaries, printed weekly digest |
| English | Spanish, Chinese, more |
