// Lockette control page: talks to the Pi over a WebSocket and keeps everything live.

const $ = (id) => document.getElementById(id);

const STATES = {
  off:       { title: "Lockette is off",  detail: "Press Start Lockette to wake it up." },
  starting:  { title: "Getting ready…",   detail: "Please stay quiet for a moment." },
  ready:     { title: "Ready to talk",    detail: "Press Talk, then ask your question." },
  listening: { title: "Listening…",       detail: "Go ahead and talk. Press again when you're done." },
  thinking:  { title: "Thinking…",        detail: "One moment." },
  speaking:  { title: "Speaking…",        detail: "Press Talk to interrupt." },
};

let ws;
let state = "off";
let settings = null;
let devices = { inputs: [], outputs: [] };
let languages = { en: "English" };
let noticeTimer;

// ---------- connection ----------

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => setConn("Connected", "ok");
  ws.onclose = () => {
    setConn("Reconnecting…", "bad");
    setState("off", "Can't reach Lockette. Is the Pi plugged in?");
    setTimeout(connect, 2000);
  };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
}

function send(action, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action, data }));
}

function setConn(text, cls) {
  const el = $("conn");
  el.textContent = text;
  el.className = `conn ${cls}`;
}

function handle(msg) {
  switch (msg.type) {
    case "snapshot":
      settings = msg.settings;
      devices = msg.devices;
      languages = msg.languages || languages;
      renderHistory(msg.history);
      setState(msg.state);
      if (msg.fake_audio) showNotice("Test mode: no mic or speaker connected.");
      break;
    case "state":
      setState(msg.state, msg.detail);
      break;
    case "message":
      addMessage(msg.message);
      break;
    case "level":
      $("orbWrap").style.setProperty("--level", msg.level.toFixed(2));
      break;
    case "notice":
      showNotice(msg.text);
      break;
    case "error":
      showNotice(msg.text, true);
      break;
    case "settings":
      settings = msg.settings;
      break;
    case "devices":
      devices = msg.devices;
      break;
    case "history_cleared":
      renderHistory([]);
      break;
  }
}

// ---------- state ----------

function setState(next, detail) {
  state = next;
  const info = STATES[next] || STATES.off;
  $("orbWrap").dataset.state = next;
  $("orbWrap").style.setProperty("--level", 0);
  $("statusTitle").textContent = info.title;
  $("statusDetail").textContent = info.detail;

  const on = next !== "off";
  const power = $("powerBtn");
  power.textContent = on ? "Turn off" : "Start Lockette";
  power.classList.toggle("is-off", !on);
  power.disabled = next === "starting";

  const talk = $("talkBtn");
  talk.disabled = !["ready", "listening", "speaking"].includes(next);
  talk.classList.toggle("is-listening", next === "listening");
  talk.classList.toggle("is-speaking", next === "speaking");
  $("talkLabel").textContent =
    next === "listening" ? "I'm done talking" : next === "speaking" ? "Stop talking" : "Talk";

  $("askInput").disabled = next !== "ready";
  $("askBtn").disabled = next !== "ready";
}

// ---------- chat log ----------

const EVENT_ICONS = { reminder: "💊", call: "📞", emergency: "⚠️" };

function formatTime(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return today ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function addMessage(m, scroll = true) {
  $("empty").hidden = true;
  const li = document.createElement("li");
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  const meta = document.createElement("div");
  meta.className = "msg-meta";

  if (m.kind in EVENT_ICONS) {
    li.className = `msg event ${m.kind}`;
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = EVENT_ICONS[m.kind];
    bubble.append(icon, document.createTextNode(m.text));
    meta.textContent = formatTime(m.time);
  } else {
    li.className = `msg ${m.role}${m.kind === "notice" ? " notice-msg" : ""}`;
    bubble.textContent = m.text;
    meta.textContent = `${m.role === "user" ? (settings?.user_name || "You") : "Lockette"} · ${formatTime(m.time)}`;
  }
  li.append(bubble, meta);
  if (m.sources?.length) li.append(renderSources(m.sources));
  $("log").append(li);
  if (scroll) scrollToNewest(li, "smooth");
}

function renderSources(sources) {
  const box = document.createElement("div");
  box.className = "msg-sources";
  box.append(document.createTextNode("Sources: "));
  sources.forEach((s, i) => {
    if (!/^https?:\/\//.test(s.url)) return;
    const a = document.createElement("a");
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = s.title || new URL(s.url).hostname;
    if (i) box.append(document.createTextNode(" · "));
    box.append(a);
  });
  return box;
}

// On a laptop the chat box scrolls by itself; on a phone the whole page scrolls.
function scrollToNewest(li, behavior) {
  const log = $("log");
  if (getComputedStyle(log).overflowY === "auto") {
    log.scrollTo({ top: log.scrollHeight, behavior });
  } else if (li && behavior === "smooth") {
    li.scrollIntoView({ behavior, block: "nearest" });
  }
}

function renderHistory(history) {
  $("log").replaceChildren();
  $("empty").hidden = history.length > 0;
  history.forEach((m) => addMessage(m, false));
  scrollToNewest(null, "instant");
}

function showNotice(text, isError = false) {
  const el = $("notice");
  el.textContent = text;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (el.hidden = true), 7000);
}

// ---------- controls ----------

$("powerBtn").addEventListener("click", () => send(state === "off" ? "start" : "stop"));
$("talkBtn").addEventListener("click", () => send("talk"));

$("askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("askInput").value.trim();
  if (!text) return;
  send("ask", text);
  $("askInput").value = "";
});

$("clearBtn").addEventListener("click", () => {
  if (confirm("Clear the whole conversation?")) send("clear_history");
});

// Space bar = Talk (unless typing in a box)
document.addEventListener("keydown", (e) => {
  const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);
  if (e.code === "Space" && !typing && !$("settings").open && !$("talkBtn").disabled) {
    e.preventDefault();
    send("talk");
  }
});

// ---------- settings ----------

function rowInput(type, value, label, placeholder) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value || "";
  input.setAttribute("aria-label", label);
  if (placeholder) input.placeholder = placeholder;
  return input;
}

function addRow(container, a, b) {
  const row = document.createElement("div");
  row.className = "row";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "row-remove";
  remove.setAttribute("aria-label", "Remove");
  remove.textContent = "✕";
  remove.addEventListener("click", () => row.remove());
  row.append(a, b, remove);
  container.append(row);
}

function addFamilyRow(f = {}) {
  addRow($("familyRows"),
    rowInput("text", f.relation, "Relation", "son"),
    rowInput("text", f.name, "Name", "David"));
}

function addMedRow(m = {}) {
  addRow($("medRows"),
    rowInput("time", m.time, "Time"),
    rowInput("text", m.what, "Which medicine", "the blue cholesterol pill"));
}

function fillSelect(select, names, chosen) {
  select.replaceChildren(new Option("Automatic (recommended)", ""));
  names.forEach((n) => select.append(new Option(n, n)));
  select.value = names.includes(chosen) ? chosen : "";
}

function openSettings() {
  if (!settings) return;
  $("userName").value = settings.user_name;
  $("city").value = settings.city || "";
  $("units").value = settings.units || "F";
  $("familyRows").replaceChildren();
  settings.family.forEach(addFamilyRow);
  $("medRows").replaceChildren();
  settings.meds.forEach(addMedRow);
  $("volume").value = settings.volume;
  $("volumeValue").textContent = `${settings.volume}%`;
  $("language").replaceChildren(...Object.entries(languages).map(([code, label]) => new Option(label, code)));
  $("language").value = settings.language || "en";
  $("accentField").hidden = $("language").value !== "en";
  $("accent").value = settings.accent;
  fillSelect($("mic"), devices.inputs, settings.mic);
  fillSelect($("speaker"), devices.outputs, settings.speaker);
  $("autoStart").checked = settings.auto_start;
  $("settings").showModal();
}

function readRows(container, keys) {
  return [...container.querySelectorAll(".row")].map((row) => {
    const inputs = row.querySelectorAll("input");
    return { [keys[0]]: inputs[0].value.trim(), [keys[1]]: inputs[1].value.trim() };
  });
}

function collectSettings() {
  return {
    user_name: $("userName").value.trim(),
    city: $("city").value.trim(),
    units: $("units").value,
    family: readRows($("familyRows"), ["relation", "name"]),
    meds: readRows($("medRows"), ["time", "what"]),
    volume: Number($("volume").value),
    language: $("language").value,
    accent: $("accent").value,
    mic: $("mic").value,
    speaker: $("speaker").value,
    auto_start: $("autoStart").checked,
  };
}

$("settingsBtn").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", () => $("settings").close());
$("cancelSettings").addEventListener("click", () => $("settings").close());
$("addFamily").addEventListener("click", () => addFamilyRow());
$("addMed").addEventListener("click", () => addMedRow());
$("language").addEventListener("change", (e) => ($("accentField").hidden = e.target.value !== "en"));
$("volume").addEventListener("input", (e) => ($("volumeValue").textContent = `${e.target.value}%`));
$("testSpeaker").addEventListener("click", () => {
  send("save_settings", collectSettings());
  send("test_speaker");
});
$("settingsForm").addEventListener("submit", () => {
  send("save_settings", collectSettings());
  showNotice("Settings saved.");
});

connect();
