#!/usr/bin/env bash
# Lockette one-time setup for the Raspberry Pi.
# Run on the Pi:  bash ~/diamond-challenge-stuff/lockette/setup.sh
# Safe to run again (for example after an update).
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$HOME/.lockette"

echo
echo "=== Lockette setup (takes about 10-15 minutes on a Pi 3) ==="

echo
echo "--- Step 1 of 5: installing system packages ---"
sudo apt-get update
sudo apt-get install -y git python3-venv python3-pip libportaudio2 \
  python3-gpiozero python3-lgpio flac mpg123

echo
echo "--- Step 2 of 5: turning on the Pirate Audio speaker ---"
CONFIG=/boot/firmware/config.txt
[ -f "$CONFIG" ] || CONFIG=/boot/config.txt
if grep -q "^dtoverlay=hifiberry-dac" "$CONFIG"; then
  echo "Already set up."
else
  sudo cp "$CONFIG" "$CONFIG.before-lockette"
  sudo sed -i 's/^dtparam=audio=on/#dtparam=audio=on/' "$CONFIG"
  printf '\n[all]\n# Lockette: Pirate Audio speaker\ndtoverlay=hifiberry-dac\ngpio=25=op,dh\n' | sudo tee -a "$CONFIG" >/dev/null
  echo "Done (old settings saved as $CONFIG.before-lockette)."
fi

echo
echo "--- Step 3 of 5: installing Python packages ---"
python3 -m venv --system-site-packages "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/.venv/bin/pip" install --quiet -r "$APP_DIR/requirements.txt"
echo "Done."

echo
echo "--- Step 4 of 5: saving your Claude key ---"
mkdir -p "$DATA_DIR"
if [ -z "$ANTHROPIC_API_KEY" ] && [ -f "$DATA_DIR/env" ]; then
  echo "Using the key saved earlier."
else
  if [ -z "$ANTHROPIC_API_KEY" ]; then
    read -rsp "Paste your Claude API key (it won't show), then press Enter: " ANTHROPIC_API_KEY
    echo
  fi
  (umask 077; printf 'ANTHROPIC_API_KEY=%s\n' "$ANTHROPIC_API_KEY" > "$DATA_DIR/env")
  echo "Saved."
fi

echo
echo "--- Step 5 of 5: making Lockette start when the Pi turns on ---"
sudo tee /etc/systemd/system/lockette.service >/dev/null <<EOF
[Unit]
Description=Lockette voice companion
After=network-online.target sound.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$DATA_DIR/env
Environment=LOCKETTE_PORT=80
Environment=PYTHONUNBUFFERED=1
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStart=$APP_DIR/.venv/bin/python $APP_DIR/app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo usermod -aG audio,gpio "$USER"
# Let Lockette's "Shut down" button power the Pi off safely (only the shutdown command, nothing else)
echo "$USER ALL=(root) NOPASSWD: /usr/sbin/shutdown" | sudo tee /etc/sudoers.d/lockette >/dev/null
sudo chmod 440 /etc/sudoers.d/lockette
sudo visudo -cf /etc/sudoers.d/lockette >/dev/null || sudo rm -f /etc/sudoers.d/lockette
sudo systemctl daemon-reload
sudo systemctl enable lockette >/dev/null 2>&1
echo "Done."

echo
echo "=== All set! The Pi will restart now. ==="
echo "Wait about 1 minute, then open this in your browser:  http://lockette.local"
echo "(If that doesn't load, use the Pi's address instead, like http://192.168.1.230)"
echo
sleep 5
sudo reboot
