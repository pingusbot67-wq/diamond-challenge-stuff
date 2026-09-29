// SEEN v1 settings.
// Copy this file to "config.h" (same folder) and fill in your values.
// config.h is in .gitignore so your Wi-Fi password never gets committed.

#pragma once

// Home Wi-Fi the device uploads over
#define WIFI_SSID      "your-wifi-name"
#define WIFI_PASSWORD  "your-wifi-password"

// Address of the computer running server/app.py (same Wi-Fi network).
// Find the laptop's IP with `ipconfig` (Windows) or `ipconfig getifaddr en0` (Mac).
#define SERVER_URL     "http://192.168.1.50:8000"

// Must match SEEN_DEVICE_KEY on the server
#define DEVICE_ID      "seen-001"
#define DEVICE_KEY     "change-me-to-a-long-random-string"

// Timezone for timestamps (POSIX TZ string). US Eastern shown here.
#define TIMEZONE       "EST5EDT,M3.2.0,M11.1.0"
