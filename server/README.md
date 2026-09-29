# SEEN v1 server

Runs on a laptop (or a Raspberry Pi 4/5) on the same Wi-Fi as the SEEN device.

```
SEEN device ──WAV over Wi-Fi──▶ /api/upload ──▶ Whisper (local) ──▶ Claude summary ──▶ family dashboard
```

## Setup

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export ANTHROPIC_API_KEY=sk-ant-...          # from console.anthropic.com (ask your advisor)
export SEEN_DEVICE_KEY=some-long-random-text # same as DEVICE_KEY in firmware config.h
export SEEN_DASHBOARD_PASSWORD=pick-a-password
# optional: push "check on me" + scam alerts to phones with the free ntfy app
export SEEN_NTFY_TOPIC=seen-yourteamname-8392

uvicorn app:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000` (any username + your dashboard password).

## Demo mode (no internet, no API key)

```bash
SEEN_DEMO_MODE=1 uvicorn app:app --host 0.0.0.0 --port 8000
```

Every upload gets a realistic sample doctor-visit summary, and "Ask SEEN" gives a sample answer.
Use this to practice the pitch or as a backup when venue Wi-Fi is bad — but be honest with the
judges about which parts are live.

## Test an upload without the device

```bash
curl -X POST http://localhost:8000/api/upload \
  -H "X-Device-Id: seen-001" -H "X-Device-Key: $SEEN_DEVICE_KEY" \
  -H "X-Filename: test_00001.wav" -H "Content-Type: audio/wav" \
  --data-binary @some-recording.wav
```

## Files

| File | What it does |
|---|---|
| `app.py` | Web server: device API, dashboard pages, SQLite database |
| `pipeline.py` | Transcription (faster-whisper) and Claude prompts for summaries + "Ask SEEN" |
| `templates/` | Large-print dashboard pages |
| `data/` | Created at runtime: `seen.db` + audio files (git-ignored — it's private!) |

## Costs

- Transcription runs locally: free.
- Claude: a 30-minute conversation is ~4,500 words ≈ 6K input tokens, plus a few thousand
  output tokens. At Claude Opus 5.5 prices ($4 / $20 per million input/output tokens) a summary
  costs roughly **5–10 cents**. A heavy user (2 long recordings/day) ≈ **$3–6/month** — under
  the $9.99 plan price. Measure real numbers during your pilot (the API console shows usage).
