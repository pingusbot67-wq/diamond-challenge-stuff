"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mic, Settings as SettingsIcon } from "lucide-react";
import { DeviceStage, useStage } from "@/components/device/stage";
import type { LedState } from "@/components/device/device";
import type { Pose } from "@/components/device/pose";
import { CornerControls, CornerName, DevGrid, useGridToggle } from "@/components/ui/chrome";
import { RollText, cn } from "@/components/ui/reveal";
import { PowerDialog, SettingsDialog } from "./dialogs";
import { useLockette, type LState, type Lockette, type Message } from "./use-lockette";

const D = Math.PI / 180;
const DESK_POSE: Pose = {
  x: 0,
  y: 0.04,
  scale: 1,
  yaw: -24 * D,
  pitch: 14 * D,
  roll: 3 * D,
  explode: 0,
  led: "idle",
  cord: 0,
  float: 1,
  spin: 0,
};

const STATES: Record<LState, { title: string; detail: string; led: LedState }> = {
  off: { title: "Lockette is off", detail: "Press Start to wake it up.", led: "off" },
  starting: { title: "Getting ready", detail: "Please stay quiet for a moment.", led: "thinking" },
  ready: { title: "Ready to talk", detail: "Press Talk, then ask your question.", led: "idle" },
  listening: { title: "Listening", detail: "Go ahead and talk. Press again when you're done.", led: "listening" },
  thinking: { title: "Thinking", detail: "One moment.", led: "thinking" },
  speaking: { title: "Speaking", detail: "Press Talk to interrupt.", led: "speaking" },
};

export function Dashboard() {
  const lk = useLockette();
  const [grid, setGrid] = useGridToggle();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);

  // Space bar = Talk, unless typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== "Space" || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(t.tagName)) return;
      if (document.querySelector("dialog[open]")) return;
      if (["ready", "listening", "speaking"].includes(lk.state)) {
        e.preventDefault();
        lk.send("talk");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lk]);

  const piOff = !lk.piOn;
  const info = STATES[lk.state];
  let detail = info.detail;
  if (lk.state === "off") {
    if (lk.shuttingDown) detail = "The Pi is shutting down. Unplug it once the green light stops.";
    else if (piOff && lk.hub) detail = "The Raspberry Pi is powered off.";
    else if (!lk.connected) detail = "Can't reach Lockette. Is the Pi plugged in, and are you on the home Wi-Fi?";
  }

  return (
    <>
      <CornerControls
        action={
          <Link href="/" className="group pc-press inline-flex min-h-11 items-center border border-ink px-4 text-base font-semibold hover:bg-ink hover:text-bg">
            <RollText text="Home" />
          </Link>
        }
      />
      <CornerName grid={grid} onGrid={() => setGrid((g) => !g)} sub={lk.hub ? "hub · this computer" : "dashboard"} />
      <DevGrid on={grid} />

      <main className="grid min-h-[100svh] grid-cols-12 gap-x-6 gap-y-10 px-4 pt-24 pb-16 md:px-6 md:pt-28">
        {/* ------------------------------------------------ controls */}
        <section aria-label="Lockette controls" className="col-span-12 flex flex-col gap-6 lg:col-span-5 xl:col-span-4">
          <PowerCard lk={lk} onSetup={() => setPowerOpen(true)} />

          <figure className="relative">
            <div className="pc-frame relative aspect-[5/4] w-full overflow-hidden border border-line-strong">
              <DeviceStage variant="box" pose={DESK_POSE} still="/stills/hero.webp">
                <LedMirror led={piOff ? "off" : info.led} level={lk.level} />
              </DeviceStage>
            </div>
            <figcaption className="caption mt-2 flex justify-between">
              <span>fig. — your Lockette, live</span>
              <span>light: {piOff ? "off" : lk.state}</span>
            </figcaption>
          </figure>

          <div aria-live="polite">
            <h1 className="display text-[3rem] leading-none md:text-[3.5rem]">{piOff && lk.hub ? "The Pi is off" : info.title}</h1>
            <p className="mt-2 min-h-[1.6em] text-lg text-dim">{detail}</p>
          </div>

          <Controls lk={lk} />
          <AskBox lk={lk} />
        </section>

        {/* ------------------------------------------------ conversation */}
        <section aria-label="Conversation" className="col-span-12 flex min-h-[32rem] flex-col lg:col-span-7 xl:col-span-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
            <h2 className="display text-[3rem] leading-none md:text-[3.5rem]">Conversation</h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!lk.connected || !lk.settings) return lk.showNotice("Turn the Raspberry Pi on to change Lockette's settings.");
                  setSettingsOpen(true);
                }}
                className="pc-press inline-flex min-h-12 items-center gap-2 border border-line-strong px-4 text-lg hover:border-ink"
              >
                <SettingsIcon className="size-5" aria-hidden /> Settings
              </button>
              <button
                onClick={() => confirm("Clear the whole conversation?") && lk.send("clear_history")}
                className="pc-press min-h-12 border border-line-strong px-4 text-lg hover:border-danger hover:text-danger"
              >
                Clear
              </button>
            </div>
          </div>
          {lk.notice && (
            <p
              key={lk.notice.id}
              role="status"
              className={cn("lk-pop mt-4 border-l-4 px-4 py-3 text-lg font-semibold", lk.notice.error ? "border-danger text-danger" : "border-accent text-accent")}
            >
              {lk.notice.text}
            </p>
          )}
          {lk.testMode && <p className="caption mt-3">test mode · no microphone or speaker connected</p>}
          <Chat history={lk.history} name={lk.settings?.user_name} />
        </section>
      </main>

      {lk.settings && <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} lk={lk} />}
      {lk.hub && (
        <PowerDialog
          open={powerOpen}
          onClose={() => setPowerOpen(false)}
          hub={lk.hub}
          onSave={async (d) => {
            await lk.savePowerSetup(d);
            lk.showNotice("Power settings saved.");
          }}
        />
      )}
    </>
  );
}

/** Keeps the 3D device's light ring in step with what Lockette is really doing. */
function LedMirror({ led, level }: { led: LedState; level: number }) {
  const { scene } = useStage();
  useEffect(() => {
    scene?.setLed(led, level);
  }, [scene, led, level]);
  return null;
}

function PowerCard({ lk, onSetup }: { lk: Lockette; onSetup: () => void }) {
  const hs = lk.hubStatus;
  let power: "on" | "off" | "busy" = "on";
  let title = "Raspberry Pi is on";
  let msg = "";
  let label = "Shut down";
  let go = false;
  let disabled = false;

  if (lk.hub && hs) {
    msg = hs.message;
    if (hs.phase === "powering_on") [power, title, label, disabled] = ["busy", "Starting up…", "Please wait", true];
    else if (hs.phase === "powering_off") [power, title, label, disabled] = ["busy", "Shutting down…", "Please wait", true];
    else if (!hs.pi_online) {
      [power, title, label, go] = ["off", "Raspberry Pi is off", "Power on", true];
      if (!hs.has_plug) {
        disabled = true;
        msg = msg || "To power on from here, add a smart plug in Power setup. Or just plug the Pi in.";
      }
    } else label = "Power off";
  } else if (lk.shuttingDown) {
    [power, title, label, disabled] = ["busy", "Shutting down…", "Shut down", true];
    msg = "Safe to unplug once the green light stops (about 20 seconds).";
  } else if (!lk.connected) {
    [power, title, disabled] = ["off", "Can't reach the Pi", true];
  }

  const click = () => {
    if (lk.piOn) {
      if (confirm("Shut the Raspberry Pi down? Lockette will stop until it's powered on again.")) lk.powerOff();
    } else lk.powerOn();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4 border border-line-strong bg-bg-alt p-4" role="status">
        <span
          aria-hidden
          className={cn(
            "size-3 shrink-0 rounded-full",
            power === "on" && "bg-ok",
            power === "off" && "bg-faint",
            power === "busy" && "lk-breathe bg-accent",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-tight">{title}</p>
          {msg && <p className="mt-0.5 text-base leading-snug text-dim">{msg}</p>}
        </div>
        <button
          onClick={click}
          disabled={disabled}
          className={cn(
            "pc-press min-h-12 shrink-0 border px-4 text-lg font-semibold disabled:opacity-50",
            go ? "border-ok bg-ok text-bg" : "border-ink hover:bg-ink hover:text-bg",
          )}
        >
          {label}
        </button>
      </div>
      {lk.hub && (
        <button onClick={onSetup} className="self-start text-base underline underline-offset-4 hover:text-accent">
          Power setup
        </button>
      )}
    </div>
  );
}

function Controls({ lk }: { lk: Lockette }) {
  const s = lk.state;
  const on = s !== "off";
  const talkable = s === "ready" || s === "listening" || s === "speaking";
  const talkLabel = s === "listening" ? "I'm done talking" : s === "speaking" ? "Stop talking" : "Talk";
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => lk.send(on ? "stop" : "start")}
        disabled={s === "starting" || !lk.connected}
        className={cn(
          "pc-press min-h-14 border text-xl font-semibold disabled:opacity-50",
          on ? "border-line-strong hover:border-ink" : "border-ink bg-ink text-bg",
        )}
      >
        {on ? "Turn off" : "Start Lockette"}
      </button>
      <button
        onClick={() => lk.send("talk")}
        disabled={!talkable}
        className={cn(
          "group pc-press flex min-h-28 items-center justify-center gap-4 text-[2rem] font-semibold transition-colors disabled:opacity-40",
          s === "listening" ? "bg-ok text-bg" : s === "speaking" ? "border-2 border-accent bg-bg text-accent" : "bg-ink text-bg",
        )}
      >
        <Mic className={cn("size-9", s === "listening" && "lk-breathe")} aria-hidden />
        {talkLabel}
      </button>
      <p className="text-base text-dim">
        Or press <strong className="text-ink">button A</strong> on Lockette, or the{" "}
        <kbd className="border border-line-strong px-1.5 font-mono text-sm">Space</kbd> bar.
      </p>
    </div>
  );
}

function AskBox({ lk }: { lk: Lockette }) {
  const [text, setText] = useState("");
  const ready = lk.state === "ready";
  return (
    <form
      className="flex flex-col gap-2 border-t border-line pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        lk.send("ask", t);
        setText("");
      }}
    >
      <label htmlFor="ask" className="text-base font-semibold">
        Or type a question
      </label>
      <div className="flex gap-2">
        <input id="ask" className="lk-input" placeholder="What's the weather like for a walk?" value={text} disabled={!ready} onChange={(e) => setText(e.target.value)} />
        <button disabled={!ready} className="pc-press min-h-[3.25rem] border border-ink px-5 text-lg font-semibold hover:bg-ink hover:text-bg disabled:opacity-40">
          Send
        </button>
      </div>
    </form>
  );
}

const EVENT: Record<string, string> = { reminder: "reminder", call: "call request", emergency: "emergency" };

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return today ? t : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${t}`;
}

function Chat({ history, name }: { history: Message[]; name?: string }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const ol = listRef.current;
    if (ol) ol.scrollTo({ top: ol.scrollHeight, behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [history.length]);

  if (!history.length)
    return (
      <div className="m-auto max-w-md py-16 text-center">
        <p className="display text-[2.75rem]">Nothing yet</p>
        <p className="mt-3 text-lg text-dim">
          Start Lockette, press Talk, and ask anything, like <em>&ldquo;What day is it?&rdquo;</em> or{" "}
          <em>&ldquo;When is my next pill?&rdquo;</em>
        </p>
      </div>
    );

  return (
    <ol ref={listRef} className="mt-6 flex max-h-[min(70vh,48rem)] flex-col gap-5 overflow-y-auto pr-2">
      {history.map((m, i) => {
        if (m.kind in EVENT)
          return (
            <li key={i} className={cn("lk-pop flex flex-wrap items-baseline gap-x-3 border-y border-line py-2", m.kind === "emergency" && "text-danger")}>
              <span className="caption text-current">{EVENT[m.kind]}</span>
              <span className="text-lg">{m.text}</span>
              <span className="caption ml-auto">{when(m.time)}</span>
            </li>
          );
        const mine = m.role === "user";
        return (
          <li key={i} className={cn("lk-pop flex max-w-[85%] flex-col", mine ? "self-end items-end" : "self-start")}>
            <p
              className={cn(
                "px-5 py-3.5 text-[1.25rem] leading-relaxed",
                mine ? "bg-ink text-bg" : "border border-line-strong",
                m.kind === "notice" && "border-dashed text-dim",
              )}
            >
              {m.text}
            </p>
            <p className="caption mt-1.5">
              {mine ? name || "you" : "lockette"} · {when(m.time)}
            </p>
            {m.sources && m.sources.length > 0 && (
              <p className="mt-1.5 text-base text-dim">
                Sources:{" "}
                {m.sources
                  .filter((s) => /^https?:\/\//.test(s.url))
                  .map((s, j) => (
                    <span key={s.url}>
                      {j > 0 && " · "}
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">
                        {s.title || new URL(s.url).hostname}
                      </a>
                    </span>
                  ))}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
