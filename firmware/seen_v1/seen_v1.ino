// SEEN v1 firmware — one-button conversation recorder for older adults.
//
// Board: Seeed Studio XIAO ESP32-S3 Sense (Arduino-ESP32 core 3.x)
//   Tools > Board > "XIAO_ESP32S3", Tools > PSRAM > "OPI PSRAM"
//
// What it does:
//   short press        -> start recording (1 buzz), press again -> stop + save (2 buzzes)
//   long press (3 sec) -> "check on me" alert sent to the family dashboard
//   while idle         -> every few minutes, upload finished recordings over Wi-Fi
//
// Recordings are 16 kHz, 16-bit mono WAV files in /rec on the microSD card.
// After a successful upload they move to /sent, so nothing is lost if Wi-Fi is down.

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <time.h>
#include "ESP_I2S.h"
#include "FS.h"
#include "SD.h"
#include "config.h"

// ---------- Pins (see docs/03-hardware.md) ----------
const int PIN_BATTERY = D0;   // middle of 100k/100k divider
const int PIN_BUTTON  = D1;   // big button to GND
const int PIN_BUZZ    = D2;   // vibration module signal
const int PIN_LED     = D3;   // status LED
const int PIN_SD_CS   = 21;   // microSD chip select on the Sense board
const int PIN_MIC_CLK = 42;   // built-in PDM mic
const int PIN_MIC_DAT = 41;

// ---------- Audio ----------
const uint32_t SAMPLE_RATE = 16000;
const int      VOLUME_GAIN = 4;          // PDM mic is quiet; multiply samples (with clipping)
const uint32_t MAX_RECORDING_MS = 2UL * 60 * 60 * 1000;  // auto-stop after 2 hours

// ---------- Behavior ----------
const uint32_t LONG_PRESS_MS      = 3000;
const uint32_t DEBOUNCE_MS        = 40;
const uint32_t UPLOAD_INTERVAL_MS = 3UL * 60 * 1000;     // try uploading every 3 minutes when idle
const uint32_t WIFI_TIMEOUT_MS    = 12000;
const uint64_t MIN_FREE_BYTES     = 50ULL * 1024 * 1024; // refuse to record with < 50 MB free

I2SClass mic;
Preferences prefs;

File     recFile;
String   recPath;
bool     recording = false;
uint32_t recStartMs = 0;
uint32_t recDataBytes = 0;
int16_t  audioBuf[512];

bool     lastButton = HIGH;
uint32_t lastButtonChange = 0;
uint32_t pressStart = 0;
bool     longPressFired = false;

uint32_t lastUploadAttempt = 0;
bool     sdOk = false;

// ---------- Feedback ----------

void buzz(int times, int onMs = 120, int offMs = 120) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_BUZZ, HIGH);
    delay(onMs);
    digitalWrite(PIN_BUZZ, LOW);
    if (i < times - 1) delay(offMs);
  }
}

void blink(int times, int ms = 120) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(ms);
    digitalWrite(PIN_LED, LOW);
    delay(ms);
  }
}

void signalError() {
  blink(3, 80);
  buzz(3, 400, 200);
}

int batteryMillivolts() {
  return analogReadMilliVolts(PIN_BATTERY) * 2;  // divider halves the voltage
}

// ---------- WAV files ----------

void writeLE32(uint8_t *p, uint32_t v) { p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24; }
void writeLE16(uint8_t *p, uint16_t v) { p[0] = v; p[1] = v >> 8; }

void writeWavHeader(File &f, uint32_t dataBytes) {
  uint8_t h[44];
  memcpy(h, "RIFF", 4);
  writeLE32(h + 4, 36 + dataBytes);
  memcpy(h + 8, "WAVEfmt ", 8);
  writeLE32(h + 16, 16);                 // fmt chunk size
  writeLE16(h + 20, 1);                  // PCM
  writeLE16(h + 22, 1);                  // mono
  writeLE32(h + 24, SAMPLE_RATE);
  writeLE32(h + 28, SAMPLE_RATE * 2);    // byte rate
  writeLE16(h + 32, 2);                  // block align
  writeLE16(h + 34, 16);                 // bits per sample
  memcpy(h + 36, "data", 4);
  writeLE32(h + 40, dataBytes);
  f.seek(0);
  f.write(h, sizeof(h));
}

String nextRecordingPath() {
  uint32_t n = prefs.getUInt("recnum", 0) + 1;
  prefs.putUInt("recnum", n);
  char name[40];
  snprintf(name, sizeof(name), "/rec/%s_%05lu.wav", DEVICE_ID, (unsigned long)n);
  return String(name);
}

// ---------- Recording ----------

void startRecording() {
  if (!sdOk || SD.totalBytes() - SD.usedBytes() < MIN_FREE_BYTES) {
    signalError();
    return;
  }
  recPath = nextRecordingPath();
  recFile = SD.open(recPath, FILE_WRITE);
  if (!recFile) {
    signalError();
    return;
  }
  writeWavHeader(recFile, 0);  // placeholder; real sizes written on stop
  recDataBytes = 0;

  // Save when the recording started, if the clock has been set from the internet
  time_t now = time(nullptr);
  if (now > 1700000000) {
    prefs.putULong(("t_" + String(prefs.getUInt("recnum", 0))).c_str(), (unsigned long)now);
  }

  buzz(1);
  recording = true;
  recStartMs = millis();
  Serial.printf("Recording -> %s\n", recPath.c_str());
}

void recordChunk() {
  size_t got = mic.readBytes((char *)audioBuf, sizeof(audioBuf));
  size_t samples = got / 2;
  for (size_t i = 0; i < samples; i++) {
    int32_t s = (int32_t)audioBuf[i] * VOLUME_GAIN;
    audioBuf[i] = (int16_t)constrain(s, -32768, 32767);
  }
  recFile.write((uint8_t *)audioBuf, samples * 2);
  recDataBytes += samples * 2;

  // Slow LED pulse while recording so the user knows it's on
  digitalWrite(PIN_LED, (millis() / 700) % 2 == 0 ? HIGH : LOW);
}

void stopRecording() {
  writeWavHeader(recFile, recDataBytes);
  recFile.close();
  recording = false;
  digitalWrite(PIN_LED, LOW);
  buzz(2);
  Serial.printf("Saved %s (%.1f sec)\n", recPath.c_str(), recDataBytes / (SAMPLE_RATE * 2.0));
}

// ---------- Networking ----------

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    delay(250);
  }
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    return false;
  }
  configTzTime(TIMEZONE, "pool.ntp.org", "time.nist.gov");  // set the clock for timestamps
  return true;
}

void wifiOff() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool uploadFile(const String &path) {
  File f = SD.open(path, FILE_READ);
  if (!f) return false;

  String name = path.substring(path.lastIndexOf('/') + 1);
  String num = name.substring(name.lastIndexOf('_') + 1, name.lastIndexOf('.'));
  String timeKey = "t_" + String(num.toInt());
  unsigned long startedAt = prefs.getULong(timeKey.c_str(), 0);

  HTTPClient http;
  http.setTimeout(60000);
  http.begin(String(SERVER_URL) + "/api/upload");
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.addHeader("X-Filename", name);
  http.addHeader("X-Battery-mV", String(batteryMillivolts()));
  if (startedAt) http.addHeader("X-Recorded-At", String(startedAt));

  int code = http.sendRequest("POST", &f, f.size());
  http.end();
  f.close();
  Serial.printf("Upload %s -> HTTP %d\n", name.c_str(), code);
  if (code != 200) return false;
  prefs.remove(timeKey.c_str());  // free the saved start time
  return true;
}

void uploadPending() {
  // Collect names first; renaming files while scanning the folder can confuse the scan
  const int MAX_BATCH = 10;
  String pending[MAX_BATCH];
  int count = 0;
  File dir = SD.open("/rec");
  if (!dir) return;
  for (File entry = dir.openNextFile(); entry && count < MAX_BATCH; entry = dir.openNextFile()) {
    String path = String("/rec/") + entry.name();
    if (!entry.isDirectory() && path.endsWith(".wav")) pending[count++] = path;
    entry.close();
  }
  dir.close();
  if (count == 0 || !connectWifi()) return;

  for (int i = 0; i < count; i++) {
    digitalWrite(PIN_LED, HIGH);
    if (uploadFile(pending[i])) {
      SD.rename(pending[i], "/sent" + pending[i].substring(4));  // /rec/x.wav -> /sent/x.wav
    }
    digitalWrite(PIN_LED, LOW);
    if (digitalRead(PIN_BUTTON) == LOW) break;  // user wants to record; stop uploading
  }
  wifiOff();
}

void sendHelpAlert() {
  digitalWrite(PIN_LED, HIGH);
  buzz(1, 800);
  bool sent = false;
  if (connectWifi()) {
    HTTPClient http;
    http.begin(String(SERVER_URL) + "/api/alert");
    http.addHeader("X-Device-Id", DEVICE_ID);
    http.addHeader("X-Device-Key", DEVICE_KEY);
    http.addHeader("X-Battery-mV", String(batteryMillivolts()));
    sent = http.POST("") == 200;
    http.end();
    wifiOff();
  }
  digitalWrite(PIN_LED, LOW);
  if (!sent) signalError();
}

// ---------- Button ----------

void handleButton() {
  bool reading = digitalRead(PIN_BUTTON);
  uint32_t now = millis();
  if (reading == lastButton || now - lastButtonChange < DEBOUNCE_MS) {
    // Long press while idle -> help alert (fires while still holding)
    if (reading == LOW && !recording && !longPressFired && now - pressStart >= LONG_PRESS_MS) {
      longPressFired = true;
      sendHelpAlert();
    }
    return;
  }
  lastButtonChange = now;
  lastButton = reading;

  if (reading == LOW) {          // pressed
    pressStart = now;
    longPressFired = false;
  } else if (!longPressFired) {  // released after a short press
    if (recording) stopRecording();
    else startRecording();
  }
}

// ---------- Main ----------

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_BUZZ, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  prefs.begin("seen", false);

  sdOk = SD.begin(PIN_SD_CS);
  if (sdOk) {
    SD.mkdir("/rec");
    SD.mkdir("/sent");
  } else {
    Serial.println("No microSD card found");
    signalError();
  }

  mic.setPinsPdmRx(PIN_MIC_CLK, PIN_MIC_DAT);
  if (!mic.begin(I2S_MODE_PDM_RX, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    Serial.println("Microphone failed to start");
    signalError();
  }

  WiFi.mode(WIFI_OFF);
  blink(1, 300);  // "I'm on"
  Serial.println("SEEN v1 ready");
}

void loop() {
  handleButton();

  if (recording) {
    recordChunk();
    if (millis() - recStartMs > MAX_RECORDING_MS) stopRecording();
    return;
  }

  // Drain mic buffer so the next recording starts fresh
  mic.readBytes((char *)audioBuf, sizeof(audioBuf));

  if (sdOk && millis() - lastUploadAttempt > UPLOAD_INTERVAL_MS) {
    lastUploadAttempt = millis();
    uploadPending();
  }
}
