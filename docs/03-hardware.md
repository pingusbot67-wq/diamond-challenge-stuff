# 03 — Hardware Plan

## Core board choice: Seeed Studio XIAO ESP32-S3 Sense

Why this board is perfect for a high-school prototype:

- **Built-in digital microphone** (PDM) — no mic wiring needed
- **Built-in microSD card slot** (on the Sense expansion board) — store hours of audio
- **Wi-Fi + Bluetooth** — upload recordings to the server
- **Built-in LiPo battery charger** — solder a battery to the pads on the back, charge over USB-C
- Thumb-sized (21 × 17.5 mm), ~$14–16, programmable in the Arduino IDE

(It also has a camera connector — ignore it for SEEN v1. Don't attach the camera; "SEEN" is
about being seen as a person, not a camera device, and a camera would scare users and judges on
privacy.)

## Bill of materials (per prototype unit)

Prices are approximate (Sept 2026) — check Seeed Studio, Adafruit, DigiKey, Amazon.

| # | Part | Qty | ~Price | Notes |
|---|---|---|---|---|
| 1 | Seeed XIAO ESP32-S3 **Sense** (must say *Sense*) | 1 | $15 | Mic + microSD slot included |
| 2 | microSD card, 16–32 GB (FAT32) | 1 | $6 | 16 kHz mono WAV ≈ 115 MB/hour → 32 GB ≈ 270 hours |
| 3 | 3.7 V LiPo battery, 500–1000 mAh, JST or bare leads | 1 | $8 | Flat "pouch" shape fits a case. **Must have protection circuit.** |
| 4 | Large momentary push button, 12–16 mm (soft-touch) | 1 | $2 | The one button seniors press — make it big and clicky |
| 5 | Mini vibration motor **module** (with driver transistor) | 1 | $3 | e.g., DFRobot/Adafruit vibration mini-disc module |
| 6 | 5 mm LED (warm white or orange) + 220 Ω resistor | 1 | $0.50 | Status light |
| 7 | Slide switch (SPDT, mini) | 1 | $1 | Main power cut-off between battery and board |
| 8 | 2 × 100 kΩ resistors | 2 | $0.20 | Battery-voltage divider → analog pin |
| 9 | Magnetic USB-C adapter + cable | 1 | $8 | The "dock": seniors just snap the cable on to charge + upload |
| 10 | 3D-printed case (PLA/PETG), lanyard, clip | 1 | $3 | Use the school/library 3D printer |
| 11 | Wire (28–30 AWG silicone), heat-shrink | — | $2 | |
| | **Per-unit total** | | **≈ $49** | |

**Build 3 units** (one for development, one for the pilot/demo, one spare) → ~$150.

### Tools you need (borrow if possible)
Soldering iron + solder, flush cutters, wire strippers, multimeter, hot glue gun, breadboard +
jumper wires (for testing before soldering), a 3D printer (school, library makerspace).

## Wiring

XIAO ESP32-S3 pin map for SEEN (the Sense board uses D8/D9/D10 and GPIO21 for the SD card, so
**don't use those**):

| XIAO pin | GPIO | Connects to |
|---|---|---|
| D0 | GPIO1 | Middle of the battery voltage divider (100k from BAT+, 100k to GND) |
| D1 | GPIO2 | Big button → other leg to **GND** (uses internal pull-up) |
| D2 | GPIO3 | Vibration module **IN/SIG** (module VCC → 3V3, GND → GND) |
| D3 | GPIO4 | LED anode (+) → 220 Ω → LED cathode (−) → GND |
| 3V3 | — | Vibration module VCC |
| GND | — | Common ground for everything |
| BAT+ / BAT− pads (back) | — | LiPo battery through the slide switch on the + wire |
| Built-in | GPIO42 / GPIO41 | PDM mic clock / data (already wired on Sense board) |
| Built-in | GPIO21 + SPI | microSD (already wired on Sense board) |

```
            ┌──────────── XIAO ESP32-S3 Sense ────────────┐
 BAT+ ──[switch]── BAT+ pad                    D1 ──── [BIG BUTTON] ──── GND
 BAT− ──────────── BAT− pad                    D2 ──── Vibration module IN
                                               D3 ──[220Ω]── LED(+)  LED(−) ── GND
 BAT+ ──[100k]──┬──[100k]── GND                3V3 ─── Vibration module VCC
                └───────── D0                  GND ─── common ground
            └──────────── (mic + microSD built in) ──────────┘
```

Test every connection on a breadboard **before** soldering.

### Battery safety (read this!)
- Only use LiPo cells **with a built-in protection circuit**.
- Double-check polarity before connecting — reversing it can destroy the board or the battery.
- Never puncture, bend, or crush the battery; leave a little room in the case.
- Don't leave charging unattended during early testing.

## Power budget (rough)

| Mode | Current (approx.) | 500 mAh battery | 1000 mAh battery |
|---|---|---|---|
| Recording (Wi-Fi off, CPU + mic + SD) | ~70–100 mA | ~5–6 hours | ~10–12 hours |
| Idle, waiting for a button press (light sleep) | ~2–5 mA | days | ~1 week |
| Uploading over Wi-Fi | ~150–250 mA | short bursts | short bursts |

Measure your real numbers with a USB power meter and put **your measured battery life** in the
pitch — judges love real data. Goal for v1: "a full day of appointments on one charge."

## Enclosure design

- Rounded pebble shape, about **55 × 40 × 18 mm**, no sharp corners.
- **Button is raised and centered** on the front, with a tactile ring around it so it's easy to
  find without looking.
- LED shines through a small diffuser window next to the button.
- Small mic hole (≥ 1.5 mm) lined up with the XIAO's microphone — test audio quality with the
  case closed!
- Loop for a lanyard **and** a slot for a clothing clip.
- USB-C opening for the magnetic charging tip.
- Print in PETG or PLA; sand and paint, or print in the brand navy color.
- Design in **Tinkercad** (easiest) or **Fusion 360** (free for students). Save the files in
  `hardware/enclosure/` in this repo.

## Build steps

1. **Bench test the board:** install Arduino IDE → add the ESP32 board package (by Espressif,
   version 3.x) → select "XIAO_ESP32S3" → set **PSRAM: OPI PSRAM** → upload the "Blink" example.
2. **Mic + SD test:** format the microSD as FAT32, insert it, and run the firmware in
   `firmware/seen_v1/` — press the button, talk, press again, then check the `.wav` file on a
   computer.
3. **Add button, LED, vibration** on a breadboard. Confirm each state in the table in
   `02-product-spec.md`.
4. **Wi-Fi upload:** start the server (`server/README.md`), set Wi-Fi + server address in
   `config.h`, and confirm the recording appears on the dashboard.
5. **Battery:** solder the switch + LiPo to the BAT pads. Confirm charging over USB-C.
6. **Case:** print, test-fit, adjust, reprint. Expect 3–5 iterations.
7. **Final assembly:** solder everything with short wires, hot-glue the board and battery in
   place, close the case.

## From prototype to product (for the pitch)

Estimated cost at scale (10,000 units) with a custom board:

| Part | Est. cost |
|---|---|
| ESP32-S3 module (or similar low-power SoC) | $3.00 |
| 2 × MEMS microphones | $1.00 |
| 8–16 GB flash storage | $2.50 |
| Battery (600 mAh) + charging IC | $2.50 |
| PCB + assembly | $3.00 |
| Injection-molded case + button + clip | $2.50 |
| Vibration motor, LED, misc. | $1.00 |
| Packaging + magnetic charging cable | $2.50 |
| **Estimated unit cost** | **≈ $18** |

Plus certification (FCC for the radio, UL/battery safety) — a one-time cost you should mention
exists (~$10–30K), which is one thing the prize money or a pre-seed round would fund.
