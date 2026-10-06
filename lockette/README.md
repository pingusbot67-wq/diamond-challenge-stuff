# Lockette — web app version

**The website:** `/` is the product page (3D Lockette, scroll story), **Log in** goes to `/login`, and
`/app` is the dashboard (talk, conversation, settings, power). Built from `web/` into `site/`; the
built files are committed, so the Pi and the hub never need Node.

Plug in the Pi, open **http://lockette.local** on a laptop or phone (same Wi-Fi), press
**Start Lockette**, then press **Talk** (on the page, button A on the Pirate Audio board, or the
Space bar) and ask a question. Everything shows up in the chat history.

- Ears: Google free speech recognition · Voice: Google free text-to-speech · Brain: Claude Haiku
- Only needs an `ANTHROPIC_API_KEY`. No OpenAI.
- Weather comes from the free Open-Meteo weather service (exact numbers, no key needed).
- Other lookups (news, store hours) use Claude's built-in web search, about 1 cent
  per search. Set the person's town in Settings so weather is local.
- Press Talk once to start listening. It stops by itself when you go quiet, or press Talk again.
- Press Talk while Lockette is speaking to cut it off.

## Lockette Hub (control page on your PC, with Power on / off)

The Pi's own page can't turn the Pi on, because it lives on the Pi. **Lockette Hub** runs on
your PC instead, so it works even when the Pi is off. It shows the same Lockette page plus
**Power on / Power off**.

- **Power off** works right away: it shuts the Pi down safely.
- **Power on** needs a **TP-Link Kasa or Tapo Wi-Fi smart plug** with the Pi's charger plugged
  into it. Enter the plug's address in **Power setup** on the hub page. Power off then also
  cuts the plug's power after the Pi finishes shutting down.

Windows: double-click **`start-hub.bat`** (needs Python from python.org), then use
http://localhost:8080. Close the black window to stop the hub. Hub settings are saved in
`.lockette-hub.json` in your user folder (that includes the TP-Link password if you enter one).

## Languages

Pick one in **Settings → Language**: English, Mandarin (simplified), Mandarin (traditional / Taiwan),
Cantonese, or Spanish. Lockette listens, thinks, and speaks in that language. To add another
language, copy a block in `languages.py` (instructions at the top of that file).

## Install (one time, on the Pi)

```
sudo apt-get update && sudo apt-get install -y git
git clone -b claude/nifty-brown-yq5bxn https://github.com/pingusbot67-wq/diamond-challenge-stuff.git
bash diamond-challenge-stuff/lockette/setup.sh
```

`setup.sh` installs everything, turns on the Pirate Audio speaker, saves the Claude key to
`~/.lockette/env` (private), makes Lockette start on every boot, then restarts the Pi.

## Update to the newest version

```
cd ~/diamond-challenge-stuff && git pull && sudo systemctl restart lockette
```

## Useful commands (on the Pi)

| What | Command |
|---|---|
| See what Lockette is doing (live) | `journalctl -u lockette -f` |
| Restart Lockette | `sudo systemctl restart lockette` |
| Stop it from starting on boot | `sudo systemctl disable --now lockette` |
| List speakers | `aplay -l` |
| List mics | `arecord -l` |
| Shut down safely | `sudo shutdown now` |

## Buttons

| Button | Pin | What it does |
|---|---|---|
| Pirate Audio **A** | GPIO 5 | Talk |
| Yellow latching switch (optional) | GPIO 26 (pin 37) + GND (pin 39) | Talk — every flip counts as a press |

## Files

| File | What it is |
|---|---|
| `app.py` | The whole Lockette brain + web server |
| `languages.py` | Every language Lockette speaks, and the phrases it says on its own |
| `weather.py` | Real weather from Open-Meteo (free, no key) |
| `hub.py`, `start-hub.bat` | Lockette Hub for your PC (power on/off) |
| `site/` | The built website (landing page, `/login`, `/app` dashboard). Served by `app.py` and `hub.py` |
| `web/` | The website's source (Next.js + three.js). Rebuild with `cd web && npm install && npm run build` |
| `setup.sh` | One-time installer |
| `~/.lockette/settings.json` | Name, family, med reminders, volume (edited from the web page) |
| `~/.lockette/history.json` | Chat history |

Test on a laptop with no mic/speaker: `LOCKETTE_FAKE_AUDIO=1 python app.py`, then open
http://localhost:8000.
