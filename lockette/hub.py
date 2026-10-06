"""
Lockette Hub - runs on your PC (Windows, Mac, or Linux), so the control page works even when
the Pi is off. It shows the same Lockette page, plus Power on / Power off for the Pi.

Power on needs a TP-Link Kasa or Tapo Wi-Fi smart plug that the Pi's charger is plugged into.
Power off works without one: it shuts the Pi down safely (and then cuts the plug, if you have one).

Run:  python hub.py   then open http://localhost:8080
"""

import asyncio
import json
import os
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

HERE = Path(__file__).parent
CONFIG_FILE = Path.home() / ".lockette-hub.json"
DEFAULT_CONFIG = {"pi": "192.168.1.230", "plug_host": "", "plug_user": "", "plug_pass": ""}

config = {**DEFAULT_CONFIG, **(json.loads(CONFIG_FILE.read_text()) if CONFIG_FILE.exists() else {})}
status = {"pi_online": False, "plug_on": None, "phase": "idle", "message": ""}


# ---------------- talking to the Pi ----------------

def pi_request(path, method="GET", timeout=1.5):
    req = urllib.request.Request(f"http://{config['pi']}{path}", method=method, data=b"" if method == "POST" else None)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


async def pi_is_online():
    try:
        await asyncio.to_thread(pi_request, "/api/ping", "GET", 3)
        return True
    except urllib.error.HTTPError:
        return True   # it answered, just an older Lockette without /api/ping
    except Exception:
        return False


# ---------------- the smart plug ----------------

async def plug(action):
    """action: 'on', 'off', or 'check'. Returns True/False for on/off, or None if there's no plug."""
    if not config["plug_host"]:
        return None
    from kasa import Discover
    dev = await Discover.discover_single(config["plug_host"], username=config["plug_user"] or None,
                                         password=config["plug_pass"] or None, discovery_timeout=5)
    if dev is None:
        raise RuntimeError(f"Couldn't find a smart plug at {config['plug_host']}")
    try:
        await dev.update()
        if action == "on":
            await dev.turn_on()
        elif action == "off":
            await dev.turn_off()
        await dev.update()
        return dev.is_on
    finally:
        await dev.disconnect()


# ---------------- power on / off ----------------

async def wait_for(online, seconds):
    for _ in range(seconds // 2):
        if await pi_is_online() == online:
            return True
        await asyncio.sleep(2)
    return False


async def power_on():
    status.update(phase="powering_on", message="Turning the power on…")
    try:
        if config["plug_host"]:
            status["plug_on"] = await plug("on")
        status["message"] = "Starting up. This takes about a minute…"
        if await wait_for(True, 120):
            status["message"] = ""
        else:
            status["message"] = "The Pi didn't come online. Check that it's plugged into the smart plug."
    except Exception as e:
        status["message"] = f"Couldn't turn the plug on: {e}"
    status["phase"] = "idle"


async def power_off():
    status.update(phase="powering_off", message="Shutting the Pi down safely…")
    try:
        if await pi_is_online():
            await asyncio.to_thread(pi_request, "/api/shutdown", "POST", 5)
            await wait_for(False, 60)
            status["message"] = "Letting the Pi finish saving…"
            await asyncio.sleep(20)   # the green light needs to stop before power is cut
        if config["plug_host"]:
            status["plug_on"] = await plug("off")
            status["message"] = "The Pi is off."
        else:
            status["message"] = "The Pi is shut down. It's safe to unplug it now."
    except Exception as e:
        status["message"] = f"Something went wrong while shutting down: {e}"
    status["phase"] = "idle"


async def watch_pi():
    while True:
        status["pi_online"] = await pi_is_online()
        await asyncio.sleep(3)


# ---------------- web page ----------------

tasks = set()


def run_in_background(coro):
    task = asyncio.create_task(coro)
    tasks.add(task)
    task.add_done_callback(tasks.discard)


@asynccontextmanager
async def lifespan(app):
    run_in_background(watch_pi())
    if config["plug_host"]:
        try:
            status["plug_on"] = await plug("check")
        except Exception as e:
            status["message"] = f"Couldn't reach the smart plug: {e}"
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/hub/config")
def get_config():
    return {"hub": True, "pi": config["pi"], "plug_host": config["plug_host"],
            "plug_user": config["plug_user"], "has_password": bool(config["plug_pass"])}


@app.get("/hub/status")
def get_status():
    return {**status, "has_plug": bool(config["plug_host"])}


@app.post("/hub/power_on")
async def post_power_on():
    if status["phase"] == "idle":
        status.update(phase="powering_on", message="Turning the power on…")   # show it on the page right away
        run_in_background(power_on())
    return get_status()


@app.post("/hub/power_off")
async def post_power_off():
    if status["phase"] == "idle":
        status.update(phase="powering_off", message="Shutting the Pi down safely…")   # show it on the page right away
        run_in_background(power_off())
    return get_status()


@app.post("/hub/settings")
async def post_settings(data: dict):
    config["pi"] = str(data.get("pi") or DEFAULT_CONFIG["pi"]).strip().removeprefix("http://").strip("/")
    config["plug_host"] = str(data.get("plug_host") or "").strip()
    config["plug_user"] = str(data.get("plug_user") or "").strip()
    if data.get("plug_pass"):   # blank = keep the saved password
        config["plug_pass"] = str(data["plug_pass"])
    CONFIG_FILE.write_text(json.dumps(config, indent=2))
    status["pi_online"] = await pi_is_online()
    try:
        status["plug_on"] = await plug("check")
        status["message"] = "Smart plug found." if config["plug_host"] else ""
    except Exception as e:
        status["plug_on"] = None
        status["message"] = f"Saved, but couldn't reach the smart plug: {e}"
    return get_config()


# The website (landing page, /login, /app dashboard), built from web/ into site/.
# Mounted last so the routes above win.
app.mount("/", StaticFiles(directory=HERE / "site", html=True), name="site")


if __name__ == "__main__":
    port = int(os.environ.get("LOCKETTE_HUB_PORT", 8080))
    print(f"Lockette Hub is running. Open http://localhost:{port}  (close this window to stop it)")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
