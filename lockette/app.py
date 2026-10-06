"""
Lockette - desk prototype of the senior AI voice companion, with a web control page.

Hardware: Raspberry Pi 3B+ with a Pimoroni Pirate Audio speaker board and a USB mic
(later: an Adafruit ICS-43434 I2S mic). Button A on the Pirate Audio board = Talk.

Open http://lockette.local in a browser, press "Start Lockette", then press Talk
(on the page or on the Pi) and ask a question. Everything shows up in the chat log.

Ears: Google free speech recognition. Voice: Google free text-to-speech (gTTS).
Brain: Claude Haiku. Only needs an ANTHROPIC_API_KEY.
"""

import asyncio
import datetime
import io
import json
import os
import queue
import re
import subprocess
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import anthropic
import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Set LOCKETTE_FAKE_AUDIO=1 to run the web app on a laptop with no mic or speaker
FAKE_AUDIO = os.environ.get("LOCKETTE_FAKE_AUDIO") == "1"
if not FAKE_AUDIO:
    import sounddevice as sd
    import speech_recognition as sr
    from gtts import gTTS

HERE = Path(__file__).parent
DATA_DIR = Path(os.environ.get("LOCKETTE_DATA", Path.home() / ".lockette"))
SETTINGS_FILE = DATA_DIR / "settings.json"
HISTORY_FILE = DATA_DIR / "history.json"

MODEL = "claude-haiku-4-5"
# Claude's built-in web search (weather, news, store hours...). About 1 cent per search.
WEB_SEARCH = {"type": "web_search_20250305", "name": "web_search", "max_uses": 2}
TALK_BUTTON_PIN = 5     # Pirate Audio button A
SWITCH_PIN = 26         # optional yellow latching switch: GPIO 26 (pin 37) + GND (pin 39)
MAX_HISTORY = 200       # messages kept in the chat log
CONTEXT_MESSAGES = 10   # messages Claude sees each time

DEFAULT_SETTINGS = {
    "user_name": "Margaret",
    "city": "",           # their town, for weather and local questions
    "family": [
        {"relation": "son", "name": "David"},
        {"relation": "daughter", "name": "Lisa"},
    ],
    "meds": [
        {"time": "08:00", "what": "the small white blood pressure pill"},
        {"time": "20:00", "what": "the blue cholesterol pill"},
    ],
    "accent": "com",      # "com" American, "co.uk" British, "com.au" Australian
    "volume": 80,         # 0-100
    "mic": "",            # device name, "" = pick automatically
    "speaker": "",
    "auto_start": False,  # start listening for the button as soon as the Pi powers on
}

MIC_WORDS = ["voicehat", "i2s", "usb", "mic"]
SPEAKER_WORDS = ["hifiberry", "dac", "voicehat", "usb", "headphones"]


def system_prompt(s):
    now = datetime.datetime.now().strftime("%A, %B %d, %I:%M %p")
    meds = "; ".join(f"{m['time']}: {m['what']}" for m in s["meds"]) or "none set"
    family = ", ".join(f"{f['relation']}: {f['name']}" for f in s["family"]) or "none set"
    town = f"They live in {s['city']}." if s.get("city") else "You don't know their town yet; ask if you need it."
    return f"""You are Lockette, a warm, patient voice companion for {s['user_name']}, an older adult. It is {now}.
{town}
Reply in 1-3 short, simple sentences. Everything you say is read aloud, so no lists, emojis, symbols, or web addresses.
You can search the web for things that change, like the weather, news, sports scores, or store hours.
Give the answer plainly (for weather: the temperature and whether to bring a coat or umbrella), and don't mention sources.
Medication schedule set by family: {meds}. You can say what is scheduled and when.
Never give dosage, drug, or medical advice; tell them to ask their pharmacist or doctor.
Family: {family}.
If they ask you to call someone, start your reply with [CALL: name]. You cannot place calls yet,
so kindly say you can't make calls yet and suggest they call from their phone.
If they sound hurt, have fallen, or mention an emergency, start with [EMERGENCY] and tell them to call 911
from their phone or press their alert button. Do not say you are contacting anyone, because you can't yet.
If someone is asking them for gift cards, bank info, passwords, or money for a grandchild in trouble,
warn them gently that it may be a scam and suggest they check with family first."""


# ---------------- storage ----------------

def load_json(path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def save_json(path, data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)


# ---------------- the assistant ----------------

class Lockette:
    def __init__(self):
        self.settings = {**DEFAULT_SETTINGS, **load_json(SETTINGS_FILE, {})}
        self.history = load_json(HISTORY_FILE, [])
        self.state = "off"   # off | starting | ready | listening | thinking | speaking
        self.jobs = queue.Queue()
        self.clients = set()
        self.loop = None
        self.threshold = 0.02
        self.cancel = threading.Event()
        self.done_talking = threading.Event()
        self.claude = anthropic.Anthropic(timeout=30.0, max_retries=2)
        if not FAKE_AUDIO:
            self.recognizer = sr.Recognizer()
            self.recognizer.operation_timeout = 15

    # ---- talking to the web page ----

    def emit(self, msg):
        if self.loop is None:
            return
        for q in list(self.clients):
            self.loop.call_soon_threadsafe(q.put_nowait, msg)

    def set_state(self, state, detail=""):
        self.state = state
        self.emit({"type": "state", "state": state, "detail": detail})

    def add_message(self, role, text, kind="chat"):
        msg = {"role": role, "text": text, "kind": kind,
               "time": datetime.datetime.now().isoformat(timespec="seconds")}
        self.history = (self.history + [msg])[-MAX_HISTORY:]
        save_json(HISTORY_FILE, self.history)
        self.emit({"type": "message", "message": msg})

    def snapshot(self):
        return {"type": "snapshot", "state": self.state, "history": self.history,
                "settings": self.settings, "devices": self.devices(), "fake_audio": FAKE_AUDIO}

    # ---- commands from the web page and the buttons ----

    def command(self, action, data=None):
        if action == "start" and self.state == "off":
            self.set_state("starting", "Getting ready. Please stay quiet for a moment.")
            self.jobs.put(("start", None))
        elif action == "stop":
            # Only signal here; the worker stops its own sound (stopping audio from
            # another thread could freeze it, which made Start stop working)
            self.cancel.set()
            while not self.jobs.empty():
                try:
                    self.jobs.get_nowait()
                except queue.Empty:
                    break
            self.set_state("off")
        elif action == "talk":
            if self.state == "ready":
                self.set_state("listening", "Listening...")
                self.jobs.put(("listen", None))
            elif self.state == "listening":  # pressing again = "I'm done talking"
                self.done_talking.set()
            elif self.state == "speaking":   # pressing while it speaks cuts it short
                self.cancel.set()
            elif self.state == "off":
                self.emit({"type": "notice", "text": "Lockette is off. Press Start Lockette first."})
        elif action == "ask" and data and self.state == "ready":
            self.set_state("thinking", "Thinking...")
            self.jobs.put(("ask", str(data)[:500]))
        elif action == "save_settings" and isinstance(data, dict):
            self.save_settings(data)
        elif action == "clear_history":
            self.history = []
            save_json(HISTORY_FILE, self.history)
            self.emit({"type": "history_cleared"})
        elif action == "test_speaker":
            self.jobs.put(("say", f"Hi {self.settings['user_name']}, this is Lockette. Can you hear me?"))

    def save_settings(self, data):
        clean = dict(self.settings)
        clean["user_name"] = str(data.get("user_name") or "friend")[:40]
        clean["city"] = str(data.get("city") or "")[:60]
        clean["family"] = [
            {"relation": str(f.get("relation", ""))[:30], "name": str(f.get("name", ""))[:40]}
            for f in data.get("family", []) if f.get("name")
        ][:10]
        clean["meds"] = [
            {"time": m["time"], "what": str(m.get("what", ""))[:80]}
            for m in data.get("meds", [])
            if re.fullmatch(r"\d\d:\d\d", str(m.get("time", ""))) and m.get("what")
        ][:10]
        clean["accent"] = data.get("accent") if data.get("accent") in ("com", "co.uk", "com.au") else "com"
        clean["volume"] = max(0, min(100, int(data.get("volume", 80))))
        clean["mic"] = str(data.get("mic", ""))
        clean["speaker"] = str(data.get("speaker", ""))
        clean["auto_start"] = bool(data.get("auto_start"))
        self.settings = clean
        save_json(SETTINGS_FILE, clean)
        self.emit({"type": "settings", "settings": clean})

    # ---- the worker: does one job at a time ----

    def worker(self):
        while True:
            job, data = self.jobs.get()
            self.cancel.clear()
            self.done_talking.clear()
            try:
                if job == "start":
                    self.start()
                elif job == "listen" and self.state == "listening":
                    self.listen_and_answer()
                elif job == "ask" and self.state == "thinking":
                    self.add_message("user", data)
                    self.answer(data)
                elif job == "say":
                    self.say(data)
                elif job == "remind" and self.state != "off":
                    self.say(data, record=False)
            except Exception as e:  # never let one bad turn kill Lockette
                print("Error:", repr(e))
                if job == "start":
                    self.set_state("off")
                    self.emit({"type": "error", "text": f"Lockette couldn't start: {e}"})
                else:
                    self.emit({"type": "error", "text": f"Something went wrong: {e}"})
            if self.state != "off":
                self.set_state("ready")

    def start(self):
        if self.state == "off":   # Turn off was pressed before we got here
            return
        if not FAKE_AUDIO:
            self.threshold = self.calibrate()
        if self.state == "off":   # Turn off was pressed while starting
            return
        self.set_state("ready")
        self.say(f"Hi {self.settings['user_name']}, I'm ready. Press my button whenever you want to talk.")

    def listen_and_answer(self):
        self.chime(rising=True)
        audio = self.record()
        if self.cancel.is_set() or self.state == "off":
            return
        if audio is None:
            self.set_state("ready")
            self.emit({"type": "notice", "text": "I didn't hear anything. Press Talk and try again."})
            return
        self.chime(rising=False)
        self.set_state("thinking", "Thinking...")
        text = self.transcribe(audio)
        if not text:
            self.say("Sorry, I didn't catch that. Could you press my button and say it again?")
            return
        self.add_message("user", text)
        self.answer(text)

    def answer(self, text):
        self.set_state("thinking", "Thinking...")
        reply = self.ask_claude()
        call = re.match(r"\s*\[CALL:\s*(.+?)\]", reply)
        if call:
            self.add_message("system", f"Asked to call {call.group(1)}. Calling isn't connected yet.", "call")
        if "[EMERGENCY]" in reply:
            self.add_message("system", "Emergency words heard. Lockette told them to call 911 from their phone.",
                             "emergency")
        spoken = re.sub(r"\[.*?\]\s*", "", reply).strip()
        self.add_message("assistant", spoken)
        self.say(spoken, record=False)

    def ask_claude(self):
        msgs = [{"role": m["role"], "content": m["text"]}
                for m in self.history if m["kind"] == "chat" and m["role"] in ("user", "assistant")]
        msgs = msgs[-CONTEXT_MESSAGES:]
        while msgs and msgs[0]["role"] != "user":
            msgs.pop(0)
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return "My Claude key isn't set up yet. Please ask your family to add it."
        search = dict(WEB_SEARCH)
        if self.settings.get("city"):
            search["user_location"] = {"type": "approximate", "city": self.settings["city"], "country": "US"}
        try:
            try:
                resp = self.call_claude(msgs, [search])
            except anthropic.BadRequestError as e:
                if "web_search" not in str(e) and "web search" not in str(e).lower():
                    raise
                # Web search is switched off for this Claude account: answer without it
                self.emit({"type": "error", "text": "Web search is turned off for your Claude account "
                                                    "(check the Claude Console settings). Answering without it."})
                resp = self.call_claude(msgs, [])
        except anthropic.AuthenticationError:
            return "My Claude key isn't working. Please ask your family to check it."
        except anthropic.RateLimitError:
            return "I'm a little busy right now. Please try again in a minute."
        except anthropic.APIConnectionError:
            return "I can't reach the internet right now. Please check the Wi-Fi."
        except anthropic.APIStatusError as e:
            return f"Something went wrong on my end, error {e.status_code}. Please try again."
        if resp.stop_reason == "refusal":
            return "Sorry, I can't help with that one."
        text = "".join(b.text for b in resp.content if b.type == "text")
        text = re.sub(r"\(\s*https?://[^)]*\)|https?://\S+", "", text)   # never read web addresses aloud
        return re.sub(r"\s+", " ", text).strip() or "Sorry, could you say that again?"

    def call_claude(self, msgs, tools):
        resp = self.claude.messages.create(model=MODEL, max_tokens=400, system=system_prompt(self.settings),
                                           messages=msgs, tools=tools)
        # A long web search can pause partway; send it back and Claude picks up where it left off
        for _ in range(3):
            if resp.stop_reason != "pause_turn":
                break
            resp = self.claude.messages.create(
                model=MODEL, max_tokens=400, system=system_prompt(self.settings), tools=tools,
                messages=msgs + [{"role": "assistant", "content": resp.content}])
        return resp

    def say(self, text, record=True):
        if record:
            self.add_message("assistant", text, "notice")
        was_off = self.state == "off"
        self.set_state("speaking", "Speaking...")
        self.speak(text)
        if was_off:   # e.g. "Test speaker" while Lockette is off
            self.set_state("off")

    # ---- reminders ----

    def reminder_loop(self):
        said = set()
        while True:
            now = datetime.datetime.now()
            for m in self.settings["meds"]:
                key = (now.date(), m["time"])
                if now.strftime("%H:%M") == m["time"] and key not in said:
                    said.add(key)
                    if self.state != "off":
                        text = f"{self.settings['user_name']}, it's time for {m['what']}."
                        self.add_message("assistant", text, "reminder")
                        self.jobs.put(("remind", text))
            time.sleep(15)

    # ---- audio devices ----

    def devices(self):
        if FAKE_AUDIO:
            return {"inputs": ["Fake mic"], "outputs": ["Fake speaker"]}
        all_devices = sd.query_devices()
        return {
            "inputs": [d["name"] for d in all_devices if d["max_input_channels"] > 0],
            "outputs": [d["name"] for d in all_devices if d["max_output_channels"] > 0],
        }

    def pick(self, kind, chosen, words):
        devices = sd.query_devices()
        ok = [(i, d) for i, d in enumerate(devices) if d[f"max_{kind}_channels"] > 0]
        for i, d in ok:
            if chosen and d["name"] == chosen:
                return i, d
        for w in words:
            for i, d in ok:
                if w in d["name"].lower():
                    return i, d
        if ok:
            return ok[0]
        raise RuntimeError(f"No {'microphone' if kind == 'input' else 'speaker'} found. Is it plugged in?")

    def open_mic(self):
        """Open the mic as mono if it allows it, otherwise as stereo (we mix it down)."""
        idx, info = self.pick("input", self.settings["mic"], MIC_WORDS)
        rate = int(info["default_samplerate"])
        block = int(rate * 0.1)  # 0.1 second chunks
        for ch in (1, min(2, info["max_input_channels"])):
            try:
                stream = sd.InputStream(samplerate=rate, channels=ch, device=idx,
                                        dtype="float32", blocksize=block)
                return stream, rate, block
            except sd.PortAudioError:
                continue
        raise RuntimeError(f"Couldn't open the microphone: {info['name']}")

    def calibrate(self):
        stream, rate, block = self.open_mic()
        with stream:
            chunks = [stream.read(block)[0].mean(axis=1) for _ in range(15)]
        noise = float(np.sqrt(np.mean(np.concatenate(chunks) ** 2)))
        return max(0.01, noise * 3)

    def record(self):
        """Wait up to 8 seconds for speech, then record until 1.2 seconds of quiet (15 seconds max)."""
        if FAKE_AUDIO:
            self.done_talking.wait(1.5)
            return None
        stream, rate, block = self.open_mic()
        self.rate = rate
        pre, voiced, silence, waited = [], [], 0, 0
        with stream:
            while not self.cancel.is_set():
                if self.done_talking.is_set():   # Talk pressed again: stop now
                    return np.concatenate(voiced) if len(voiced) > 4 else None
                chunk = stream.read(block)[0].mean(axis=1)
                level = float(np.sqrt(np.mean(chunk ** 2)))
                if waited % 2 == 0:
                    self.emit({"type": "level", "level": min(1.0, level / (self.threshold * 4))})
                waited += 1
                loud = level > self.threshold
                if not voiced:
                    pre = (pre + [chunk])[-3:]
                    if loud:
                        voiced = pre[:]
                    elif waited > 80:
                        return None
                    continue
                voiced.append(chunk)
                silence = 0 if loud else silence + 1
                if silence >= 12 or len(voiced) > 150:
                    if len(voiced) - silence < 4:   # just a bump or click
                        pre, voiced, silence = [], [], 0
                        continue
                    return np.concatenate(voiced)
        return None

    def transcribe(self, audio):
        pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes()
        try:
            return self.recognizer.recognize_google(sr.AudioData(pcm, self.rate, 2), language="en-US").strip()
        except sr.UnknownValueError:
            return ""
        except sr.RequestError:
            self.emit({"type": "error", "text": "Speech recognition couldn't reach the internet."})
            return ""

    def play(self, data, rate):
        idx, info = self.pick("output", self.settings["speaker"], SPEAKER_WORDS)
        out_rate = int(info["default_samplerate"])
        n = int(len(data) * out_rate / rate)
        data = np.interp(np.linspace(0, len(data) - 1, n), np.arange(len(data)), data).astype(np.float32)
        data *= self.settings["volume"] / 100
        if info["max_output_channels"] >= 2:
            data = np.column_stack([data, data])
        sd.play(data, out_rate, device=idx)
        # Wait for it to finish, but stop early if Talk or Turn off is pressed
        end = time.time() + len(data) / out_rate + 0.3
        while time.time() < end and not self.cancel.is_set():
            time.sleep(0.05)
        sd.stop()

    def chime(self, rising):
        if FAKE_AUDIO:
            return
        rate = 24000
        notes = (660, 880) if rising else (880, 660)
        t = np.arange(int(rate * 0.09)) / rate
        tone = np.concatenate([np.sin(2 * np.pi * f * t) * np.hanning(len(t)) for f in notes]) * 0.4
        self.play(tone.astype(np.float32), rate)

    def speak(self, text):
        print("Lockette:", text)
        if FAKE_AUDIO:
            time.sleep(min(4, 0.06 * len(text)))
            return
        mp3 = io.BytesIO()
        gTTS(text=text, lang="en", tld=self.settings["accent"], timeout=15).write_to_fp(mp3)
        pcm = subprocess.run(["mpg123", "-q", "-s", "-m", "-r", "24000", "-"],
                             input=mp3.getvalue(), capture_output=True, timeout=30).stdout
        pcm = pcm[:len(pcm) // 2 * 2]
        if self.cancel.is_set():
            return
        self.play(np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768, 24000)


lockette = Lockette()


# ---------------- physical buttons ----------------

def setup_buttons():
    try:
        from gpiozero import Button
    except Exception as e:
        print("Buttons not available (not on a Pi?):", e)
        return []
    buttons = []
    try:
        talk = Button(TALK_BUTTON_PIN, bounce_time=0.05)
        talk.when_pressed = lambda: lockette.command("talk")
        buttons.append(talk)
        # The yellow switch latches (stays down), so any change - pressed or released - means "talk"
        switch = Button(SWITCH_PIN, bounce_time=0.1)
        switch.when_pressed = lambda: lockette.command("talk")
        switch.when_released = lambda: lockette.command("talk")
        buttons.append(switch)
    except Exception as e:
        print("Couldn't set up buttons:", e)
    return buttons


# ---------------- web server ----------------

@asynccontextmanager
async def lifespan(app):
    lockette.loop = asyncio.get_running_loop()
    app.state.buttons = setup_buttons()
    threading.Thread(target=lockette.worker, daemon=True).start()
    threading.Thread(target=lockette.reminder_loop, daemon=True).start()
    if lockette.settings["auto_start"]:
        lockette.command("start")
    yield


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(HERE / "static" / "index.html")


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    q = asyncio.Queue()
    lockette.clients.add(q)
    await websocket.send_json(lockette.snapshot())

    async def sender():
        while True:
            await websocket.send_json(await q.get())

    send_task = asyncio.create_task(sender())
    try:
        while True:
            msg = await websocket.receive_json()
            if msg.get("action") == "refresh":
                await websocket.send_json(lockette.snapshot())
            else:
                await asyncio.to_thread(lockette.command, msg.get("action"), msg.get("data"))
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        send_task.cancel()
        lockette.clients.discard(q)


if __name__ == "__main__":
    port = int(os.environ.get("LOCKETTE_PORT", 8000))
    print(f"Lockette is running. Open http://lockette.local{'' if port == 80 else f':{port}'}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
