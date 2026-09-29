"""SEEN v1 companion server.

- The SEEN device uploads WAV recordings to POST /api/upload and help alerts to POST /api/alert.
- Each recording is transcribed and summarized in the background.
- The family dashboard (password protected) shows summaries, "things to remember",
  scam warnings, alerts, and an "Ask SEEN" box.

Run:  uvicorn app:app --host 0.0.0.0 --port 8000
"""

import json
import os
import re
import secrets
import sqlite3
import urllib.request
from datetime import datetime
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, Form, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.templating import Jinja2Templates

import pipeline

BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get("SEEN_DATA_DIR", BASE_DIR / "data"))
AUDIO_DIR = DATA_DIR / "audio"
DB_PATH = DATA_DIR / "seen.db"

DEVICE_KEY = os.environ.get("SEEN_DEVICE_KEY", "change-me-to-a-long-random-string")
DASHBOARD_PASSWORD = os.environ.get("SEEN_DASHBOARD_PASSWORD", "seen")
NTFY_TOPIC = os.environ.get("SEEN_NTFY_TOPIC")  # optional: push alerts to phones via ntfy.sh
MAX_UPLOAD_BYTES = 300 * 1024 * 1024  # ~2.5 hours of 16 kHz mono audio

app = FastAPI(title="SEEN v1")
templates = Jinja2Templates(directory=BASE_DIR / "templates")
security = HTTPBasic()


# ---------- Database ----------

def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS recordings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                audio_path TEXT NOT NULL,
                recorded_at TEXT NOT NULL,
                received_at TEXT NOT NULL,
                battery_mv INTEGER,
                status TEXT NOT NULL DEFAULT 'processing',  -- processing | done | error
                transcript TEXT,
                summary_json TEXT,
                error TEXT,
                UNIQUE (device_id, filename)
            );
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                battery_mv INTEGER,
                acknowledged INTEGER NOT NULL DEFAULT 0
            );
            """
        )


init_db()


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def check_device(device_id: str | None, device_key: str | None) -> str:
    if not device_id or not device_key or not secrets.compare_digest(device_key, DEVICE_KEY):
        raise HTTPException(status_code=401, detail="Unknown device")
    return device_id


def check_family(credentials: HTTPBasicCredentials = Depends(security)) -> None:
    if not secrets.compare_digest(credentials.password, DASHBOARD_PASSWORD):
        raise HTTPException(status_code=401, headers={"WWW-Authenticate": "Basic"})


# ---------- Device API ----------

def process_recording(recording_id: int) -> None:
    with db() as conn:
        row = conn.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,)).fetchone()
    try:
        transcript = pipeline.transcribe(row["audio_path"])
        summary = pipeline.summarize(transcript, row["recorded_at"])
        with db() as conn:
            conn.execute(
                "UPDATE recordings SET status='done', transcript=?, summary_json=?, error=NULL WHERE id=?",
                (transcript, json.dumps(summary), recording_id),
            )
        if summary["scam_warning"]["suspicious"]:
            notify("SEEN: possible scam call", summary["scam_warning"]["reason"])
    except Exception as e:  # keep the server running; show the error on the dashboard
        with db() as conn:
            conn.execute(
                "UPDATE recordings SET status='error', error=? WHERE id=?", (str(e), recording_id)
            )


@app.post("/api/upload")
async def upload(
    request: Request,
    background: BackgroundTasks,
    x_device_id: str | None = Header(None),
    x_device_key: str | None = Header(None),
    x_filename: str | None = Header(None),
    x_battery_mv: int | None = Header(None),
    x_recorded_at: int | None = Header(None),
):
    device_id = check_device(x_device_id, x_device_key)
    filename = re.sub(r"[^A-Za-z0-9_.-]", "_", x_filename or f"upload_{secrets.token_hex(4)}.wav")

    audio = bytearray()
    async for chunk in request.stream():
        audio.extend(chunk)
        if len(audio) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Recording too large")

    with db() as conn:
        existing = conn.execute(
            "SELECT id FROM recordings WHERE device_id=? AND filename=?", (device_id, filename)
        ).fetchone()
    if existing:  # the device retried an upload we already have
        return {"id": existing["id"], "duplicate": True}

    safe_device = re.sub(r"[^A-Za-z0-9_-]", "_", device_id)
    audio_path = AUDIO_DIR / f"{safe_device}__{filename}"
    audio_path.write_bytes(audio)

    recorded_at = (
        datetime.fromtimestamp(x_recorded_at).strftime("%Y-%m-%d %H:%M")
        if x_recorded_at
        else now_str()
    )
    with db() as conn:
        cur = conn.execute(
            """INSERT INTO recordings (device_id, filename, audio_path, recorded_at, received_at, battery_mv)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (device_id, filename, str(audio_path), recorded_at, now_str(), x_battery_mv),
        )
        recording_id = cur.lastrowid
    background.add_task(process_recording, recording_id)
    return {"id": recording_id}


def notify(title: str, message: str) -> None:
    """Send a push notification to family phones via ntfy.sh (optional)."""
    if not NTFY_TOPIC:
        return
    req = urllib.request.Request(
        f"https://ntfy.sh/{NTFY_TOPIC}",
        data=message.encode(),
        headers={"Title": title, "Priority": "high"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except OSError:
        pass  # alerts still show on the dashboard


@app.post("/api/alert")
def alert(
    x_device_id: str | None = Header(None),
    x_device_key: str | None = Header(None),
    x_battery_mv: int | None = Header(None),
):
    device_id = check_device(x_device_id, x_device_key)
    with db() as conn:
        conn.execute(
            "INSERT INTO alerts (device_id, created_at, battery_mv) VALUES (?, ?, ?)",
            (device_id, now_str(), x_battery_mv),
        )
    notify("SEEN: check-on-me alert", f"{device_id} pressed and held the button at {now_str()}.")
    return {"ok": True}


# ---------- Family dashboard ----------

def load_recordings(limit: int = 50) -> list[dict]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM recordings ORDER BY recorded_at DESC, id DESC LIMIT ?", (limit,)
        ).fetchall()
    recordings = []
    for row in rows:
        r = dict(row)
        r["summary"] = json.loads(r["summary_json"]) if r["summary_json"] else None
        recordings.append(r)
    return recordings


def battery_percent(mv: int | None) -> int | None:
    if not mv:
        return None
    return max(0, min(100, round((mv - 3300) / (4200 - 3300) * 100)))


@app.get("/", response_class=HTMLResponse, dependencies=[Depends(check_family)])
def dashboard(request: Request):
    recordings = load_recordings()
    with db() as conn:
        alerts = [dict(a) for a in conn.execute(
            "SELECT * FROM alerts WHERE acknowledged = 0 ORDER BY id DESC"
        ).fetchall()]
    latest_battery = next((r["battery_mv"] for r in recordings if r["battery_mv"]), None)
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "recordings": recordings,
            "alerts": alerts,
            "battery": battery_percent(latest_battery),
            "demo_mode": pipeline.DEMO_MODE,
        },
    )


@app.get("/recording/{recording_id}", response_class=HTMLResponse, dependencies=[Depends(check_family)])
def recording_page(request: Request, recording_id: int):
    match = [r for r in load_recordings(limit=10_000) if r["id"] == recording_id]
    if not match:
        raise HTTPException(status_code=404)
    return templates.TemplateResponse(request, "recording.html", {"r": match[0]})


@app.post("/recording/{recording_id}/retry", dependencies=[Depends(check_family)])
def retry(recording_id: int, background: BackgroundTasks):
    with db() as conn:
        conn.execute("UPDATE recordings SET status='processing' WHERE id=?", (recording_id,))
    background.add_task(process_recording, recording_id)
    return RedirectResponse(f"/recording/{recording_id}", status_code=303)


@app.post("/alerts/{alert_id}/ack", dependencies=[Depends(check_family)])
def acknowledge(alert_id: int):
    with db() as conn:
        conn.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
    return RedirectResponse("/", status_code=303)


@app.post("/ask", response_class=HTMLResponse, dependencies=[Depends(check_family)])
def ask(request: Request, question: str = Form(...)):
    records = [
        {
            "title": r["summary"]["title"],
            "recorded_at": r["recorded_at"],
            "summary": r["summary"]["summary"],
            "transcript": r["transcript"],
        }
        for r in load_recordings(limit=20)
        if r["status"] == "done"
    ]
    try:
        answer = pipeline.answer_question(question, records)
    except Exception as e:
        answer = f"Sorry, SEEN couldn't answer right now ({e})."
    return templates.TemplateResponse(request, "ask.html", {"question": question, "answer": answer})
