/*
  Saltback drain node, Rev B firmware (ESP32-C3 SuperMini).

  Every few minutes: switch on the sensor power, read the RS485 conductivity sensor (Modbus RTU), the two DS18B20s
  (air and grate surface) and the battery, write one line to /log.csv in flash, switch everything off, deep sleep.
  Reads every 2 minutes for 6 hours after the conductivity jumps (a storm's runoff), every 15 minutes otherwise.

  To get the data without lifting the grate: turn on your phone's hotspot named "saltback-collect" (or rename it to
  that) and stand by the drain. At its next wake (within 15 minutes, 2 during a storm) the node sees that network and
  starts its own, "Saltback-XXXX", for 10 minutes. Turn the hotspot off, join "Saltback-XXXX" and open
  http://192.168.4.1 to download the log, read the sensors live, set the clock and see the raw registers.
  It also opens that network every day at DAILY_AP_HOUR_UTC for 10 minutes, and after RESET or power-up.

  NOT YET TESTED ON HARDWARE. Before deploying: check the register map against YOUR sensor's manual (REG_* below), run
  it on the bench next to the EC pen, and leave it running overnight on the bench to check the battery drain.

  Arduino IDE: board "ESP32C3 Dev Module" (esp32 core 3.x), USB CDC On Boot: Enabled, Partition: default (with SPIFFS).
  Libraries (Library Manager): ModbusMaster (Doc Walker), OneWire, DallasTemperature, RTClib (Adafruit).
*/
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <RTClib.h>
#include <ModbusMaster.h>
#include "esp_sleep.h"

// ---------------- pins (see the wiring table in the build guide) ----------------
const int PIN_SDA = 6, PIN_SCL = 7;          // DS3231
const int PIN_ONEWIRE = 4;                   // both DS18B20s, 4.7k pull-up to the switched 3.3 V rail
const int PIN_RS485_RX = 20, PIN_RS485_TX = 21;   // RS485 module TXD -> 20, RXD <- 21
const int PIN_RAIL_3V3 = 1;                  // LOW = switched 3.3 V rail on (AO3401 #2, 10k pull-up keeps it off)
const int PIN_RAIL_12V = 10;                 // HIGH = probe 12 V on (2N7002 -> AO3401 #1, 100k pull-down keeps it off)
const int PIN_VBAT = 0;                      // battery through a 220k/220k divider
const int PIN_LED = 8;                       // on-board blue LED, LOW = on

// ---------------- sensor (CHECK AGAINST YOUR SENSOR'S MANUAL) ----------------
const uint8_t EC_ADDR = 1;                   // Modbus address of the conductivity sensor (most ship as 1)
const uint32_t EC_BAUD = 9600;               // most ship at 9600 8N1
const uint16_t REG_START = 0x0000;           // first holding register to read (function 03)
const uint8_t REG_COUNT = 4;                 // how many registers to read
const uint8_t IDX_TEMP = 0;                  // which of those is water temperature
const float SCALE_TEMP = 0.1f;               //   raw x 0.1 = degrees C (common)
const uint8_t IDX_EC = 1;                    // which is conductivity
const float SCALE_EC = 1.0f;                 //   raw x 1 = microsiemens per cm (some sensors: x10, or a 32-bit pair)
const uint32_t WARMUP_MS = 3000;             // sensor start-up time after power-on (some need up to 10 s)
const bool LEVEL_ENABLED = false;            // optional RS485 level sensor on the same bus
const uint8_t LEVEL_ADDR = 2;                // give it address 2 BEFORE connecting both sensors
const uint16_t LEVEL_REG = 0x0004;           // check its manual
const float LEVEL_SCALE = 0.1f;              // raw -> cm (check its manual)

// ---------------- timing ----------------
const uint32_t SLOW_S = 15 * 60, FAST_S = 2 * 60, FAST_FOR_S = 6 * 3600;
const float JUMP_FRACTION = 0.10f, JUMP_MIN_US = 100.0f;   // a rise of 10% (and at least 100 uS/cm) starts fast mode
const uint32_t AP_MINUTES = 10;
const char *TRIGGER_SSID = "saltback-collect";   // a hotspot with this name makes the node open its download network
const int DAILY_AP_HOUR_UTC = 21;            // also open it daily at this UTC hour (21 = 4 pm US Eastern); -1 = never
const char *AP_PASSWORD = "saltback-node";   // change this; at least 8 characters
const float CAL_GAIN = 1.0f, CAL_OFFSET = 0.0f;   // from the bench calibration: true = gain x reading + offset

RTC_DATA_ATTR uint32_t fastUntil = 0;
RTC_DATA_ATTR float lastEc = -1;
RTC_DATA_ATTR uint32_t bootCount = 0;

RTC_DS3231 rtc;
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature temps(&oneWire);
ModbusMaster bus;
HardwareSerial RS485(1);
WebServer web(80);
bool rtcOk = false;

struct Reading { uint32_t t; float ec, water, air, surface, level, vbat; String flags; };

void railsOn() {
  pinMode(PIN_RAIL_3V3, OUTPUT); digitalWrite(PIN_RAIL_3V3, LOW);
  pinMode(PIN_RAIL_12V, OUTPUT); digitalWrite(PIN_RAIL_12V, HIGH);
}
void railsOff() {
  digitalWrite(PIN_RAIL_12V, LOW);
  digitalWrite(PIN_RAIL_3V3, HIGH);
}

float batteryVolts() {
  uint32_t mv = 0;
  for (int i = 0; i < 8; i++) mv += analogReadMilliVolts(PIN_VBAT);
  return mv / 8.0f * 2.0f / 1000.0f;         // divider halves the voltage
}

bool readRegisters(uint8_t addr, uint16_t start, uint8_t count, uint16_t *out) {
  bus.begin(addr, RS485);
  for (int attempt = 0; attempt < 3; attempt++) {
    if (bus.readHoldingRegisters(start, count) == bus.ku8MBSuccess) {
      for (uint8_t i = 0; i < count; i++) out[i] = bus.getResponseBuffer(i);
      return true;
    }
    delay(200);
  }
  return false;
}

Reading measure() {
  Reading r = {0, NAN, NAN, NAN, NAN, NAN, NAN, ""};
  railsOn();
  delay(50);
  Wire.begin(PIN_SDA, PIN_SCL);
  rtcOk = rtc.begin();
  if (rtcOk) { r.t = rtc.now().unixtime(); if (rtc.lostPower()) r.flags += "T"; } else r.flags += "R";
  temps.begin();
  temps.setWaitForConversion(false);
  temps.requestTemperatures();               // converts while the probe warms up
  RS485.begin(EC_BAUD, SERIAL_8N1, PIN_RS485_RX, PIN_RS485_TX);
  delay(WARMUP_MS);
  uint16_t regs[16] = {0};
  if (readRegisters(EC_ADDR, REG_START, REG_COUNT, regs)) {
    r.water = (int16_t)regs[IDX_TEMP] * SCALE_TEMP;
    r.ec = CAL_GAIN * (regs[IDX_EC] * SCALE_EC) + CAL_OFFSET;
  } else r.flags += "E";
  if (LEVEL_ENABLED) {
    uint16_t lv = 0;
    if (readRegisters(LEVEL_ADDR, LEVEL_REG, 1, &lv)) r.level = lv * LEVEL_SCALE; else r.flags += "L";
  }
  // DS18B20s: index 0 and 1 in address order. The build guide shows how to tell which is the air probe.
  r.air = temps.getTempCByIndex(0);
  r.surface = temps.getTempCByIndex(1);
  if (r.air == DEVICE_DISCONNECTED_C) { r.air = NAN; r.flags += "A"; }
  if (r.surface == DEVICE_DISCONNECTED_C) { r.surface = NAN; r.flags += "S"; }
  r.vbat = batteryVolts();
  RS485.end();
  Wire.end();
  railsOff();
  return r;
}

String num(float v, int d) { return isnan(v) ? String("") : String(v, d); }

String isoTime(uint32_t t) {
  if (!t) return "";
  DateTime d(t);
  char b[24];
  snprintf(b, sizeof b, "%04d-%02d-%02dT%02d:%02d:%02d", d.year(), d.month(), d.day(), d.hour(), d.minute(), d.second());
  return b;
}

String csvLine(const Reading &r) {
  return isoTime(r.t) + "," + String(r.t) + "," + num(r.ec, 0) + "," + num(r.water, 2) + "," + num(r.air, 2) + "," +
         num(r.surface, 2) + "," + num(r.level, 1) + "," + num(r.vbat, 3) + "," + r.flags + "\n";
}

void logReading(const Reading &r) {
  bool fresh = !LittleFS.exists("/log.csv");
  File f = LittleFS.open("/log.csv", FILE_APPEND);
  if (!f) return;
  if (fresh) f.print("time_utc,unix,ec_uS_cm,water_C,air_C,surface_C,level_cm,battery_V,flags\n");
  f.print(csvLine(r));
  f.close();
}

uint32_t nextSleep(const Reading &r) {
  if (!isnan(r.ec) && lastEc >= 0 && r.ec - lastEc > max(JUMP_MIN_US, lastEc * JUMP_FRACTION)) fastUntil = r.t + FAST_FOR_S;
  if (!isnan(r.ec)) lastEc = r.ec;
  if (r.vbat > 0 && r.vbat < 3.3f) return 60 * 60;          // low battery: once an hour
  return (r.t && r.t < fastUntil) ? FAST_S : SLOW_S;
}

bool triggerNearby() {                        // about 1.5 s of radio per wake, roughly 0.03 mAh
  WiFi.mode(WIFI_STA);
  int n = WiFi.scanNetworks(false, false, false, 100);
  bool found = false;
  for (int i = 0; i < n && !found; i++) found = WiFi.SSID(i) == TRIGGER_SSID;
  WiFi.scanDelete(); WiFi.mode(WIFI_OFF);
  return found;
}

bool dailyWindow(uint32_t t, uint32_t sleepS) {     // true on the first wake inside the daily hour
  if (DAILY_AP_HOUR_UTC < 0 || !t) return false;
  DateTime d(t);
  return d.hour() == DAILY_AP_HOUR_UTC && d.minute() * 60 + d.second() < (int)sleepS;
}

void sleepFor(uint32_t s) {
  digitalWrite(PIN_LED, HIGH);
  esp_sleep_enable_timer_wakeup((uint64_t)s * 1000000ULL);
  esp_deep_sleep_start();
}

// ---------------- Wi-Fi download page (after RESET) ----------------
const char PAGE[] PROGMEM = R"HTML(<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<title>Saltback node</title><style>body{font:16px system-ui;margin:20px;max-width:560px}button,a.b{display:block;width:100%;margin:8px 0;padding:12px;
font-size:16px;border:1px solid #111;background:#fff;border-radius:6px;text-align:center;color:#111;text-decoration:none}pre{background:#f3f3f3;padding:10px;overflow:auto}</style>
<h2>Saltback node</h2><pre id=s>loading…</pre>
<a class=b href=/log.csv>Download log (CSV)</a>
<button onclick="go('/now')">Read sensors now</button>
<button onclick="fetch('/settime?t='+Math.floor(Date.now()/1000)).then(r=>r.text()).then(t=>s.textContent=t)">Set clock from this phone</button>
<button onclick="go('/raw')">Show raw sensor registers</button>
<button onclick="if(confirm('Delete the whole log?'))go('/clear')">Clear log</button>
<script>const s=document.getElementById('s');function go(u){s.textContent='working…';fetch(u).then(r=>r.text()).then(t=>s.textContent=t)}go('/status')</script>)HTML";

void startWeb() {
  uint8_t mac[6]; WiFi.macAddress(mac);
  char ssid[20]; snprintf(ssid, sizeof ssid, "Saltback-%02X%02X", mac[4], mac[5]);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, AP_PASSWORD);
  web.on("/", [] { web.send_P(200, "text/html", PAGE); });
  web.on("/status", [] {
    File f = LittleFS.open("/log.csv", FILE_READ);
    size_t sz = f ? f.size() : 0; if (f) f.close();
    railsOn(); delay(20); Wire.begin(PIN_SDA, PIN_SCL); bool ok = rtc.begin(); uint32_t t = ok ? rtc.now().unixtime() : 0; Wire.end(); railsOff();
    web.send(200, "text/plain", "Clock: " + (ok ? isoTime(t) + " UTC" : String("not found")) + "\nBattery: " + String(batteryVolts(), 2) +
             " V\nLog: " + String(sz) + " bytes\nWakes since power-up: " + String(bootCount));
  });
  web.on("/log.csv", [] {
    File f = LittleFS.open("/log.csv", FILE_READ);
    if (!f) { web.send(404, "text/plain", "No log yet"); return; }
    web.streamFile(f, "text/csv"); f.close();
  });
  web.on("/now", [] { Reading r = measure(); web.send(200, "text/plain", "time_utc,unix,ec_uS_cm,water_C,air_C,surface_C,level_cm,battery_V,flags\n" + csvLine(r)); });
  web.on("/raw", [] {
    railsOn(); RS485.begin(EC_BAUD, SERIAL_8N1, PIN_RS485_RX, PIN_RS485_TX); delay(WARMUP_MS);
    uint16_t regs[10] = {0}; bool ok = readRegisters(EC_ADDR, 0, 10, regs); RS485.end(); railsOff();
    String out = ok ? "" : "No answer from the sensor at address " + String(EC_ADDR) + ". Check A/B wiring, 12 V, baud rate.\n";
    for (int i = 0; ok && i < 10; i++) out += "register " + String(i) + " = " + String(regs[i]) + "\n";
    web.send(200, "text/plain", out);
  });
  web.on("/settime", [] {
    uint32_t t = web.arg("t").toInt();
    if (t < 1700000000UL) { web.send(400, "text/plain", "Bad time"); return; }
    railsOn(); delay(20); Wire.begin(PIN_SDA, PIN_SCL); bool ok = rtc.begin(); if (ok) rtc.adjust(DateTime(t)); Wire.end(); railsOff();
    web.send(200, "text/plain", ok ? "Clock set to " + isoTime(t) + " UTC" : "Clock not found: check SDA/SCL wiring");
  });
  web.on("/clear", [] { LittleFS.remove("/log.csv"); web.send(200, "text/plain", "Log cleared"); });
  web.begin();
}

void setup() {
  pinMode(PIN_LED, OUTPUT); digitalWrite(PIN_LED, HIGH);
  pinMode(PIN_RAIL_3V3, OUTPUT); pinMode(PIN_RAIL_12V, OUTPUT); railsOff();
  analogReadResolution(12);
  bootCount++;
  LittleFS.begin(true);
  bool timerWake = esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER;
  Reading r = measure();
  logReading(r);
  uint32_t s = nextSleep(r);
  if (timerWake && !dailyWindow(r.t, s) && !triggerNearby()) sleepFor(s);
  // Someone is collecting data (hotspot seen, daily window, RESET or first power-up): offer the download page.
  startWeb();
  uint32_t until = millis() + AP_MINUTES * 60000UL;
  while ((int32_t)(until - millis()) > 0) {
    web.handleClient();
    digitalWrite(PIN_LED, (millis() / 500) % 2 ? LOW : HIGH);
    delay(2);
  }
  WiFi.softAPdisconnect(true); WiFi.mode(WIFI_OFF);
  sleepFor(s);
}

void loop() {}
