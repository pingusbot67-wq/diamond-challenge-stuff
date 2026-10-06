"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Talks to the Lockette on the Pi over a WebSocket, and (when this page is
 * served by the PC hub) to the hub for power on / off. Same protocol as
 * app.py and hub.py.
 */

export type LState = "off" | "starting" | "ready" | "listening" | "thinking" | "speaking";

export interface Source {
  title: string;
  url: string;
}
export interface Message {
  role: "user" | "assistant" | "system";
  text: string;
  kind: "chat" | "notice" | "reminder" | "call" | "emergency";
  time: string;
  sources?: Source[];
}
export interface Settings {
  user_name: string;
  city: string;
  units: "F" | "C";
  language: string;
  accent: string;
  volume: number;
  mic: string;
  speaker: string;
  auto_start: boolean;
  family: { relation: string; name: string }[];
  meds: { time: string; what: string }[];
}
export interface HubConfig {
  hub: true;
  pi: string;
  plug_host: string;
  plug_user: string;
  has_password: boolean;
}
export interface HubStatus {
  pi_online: boolean;
  plug_on: boolean | null;
  phase: "idle" | "powering_on" | "powering_off";
  message: string;
  has_plug: boolean;
}

export function useLockette() {
  const [hub, setHub] = useState<HubConfig | null>(null);
  const [hubStatus, setHubStatus] = useState<HubStatus | null>(null);
  const [checkedHub, setCheckedHub] = useState(false);
  const [connected, setConnected] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [state, setState] = useState<LState>("off");
  const [history, setHistory] = useState<Message[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [devices, setDevices] = useState<{ inputs: string[]; outputs: string[] }>({ inputs: [], outputs: [] });
  const [languages, setLanguages] = useState<Record<string, string>>({ en: "English" });
  const [notice, setNotice] = useState<{ text: string; error: boolean; id: number } | null>(null);
  const [level, setLevel] = useState(0);
  const [testMode, setTestMode] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const hubRef = useRef<HubConfig | null>(null);
  hubRef.current = hub;

  const showNotice = useCallback((text: string, error = false) => {
    setNotice({ text, error, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /* -------------------------------------------------------------- hub */

  const pollHub = useCallback(async () => {
    try {
      setHubStatus(await (await fetch("/hub/status")).json());
    } catch {
      setHubStatus(null);
    }
  }, []);

  useEffect(() => {
    let timer = 0;
    (async () => {
      try {
        const r = await fetch("/hub/config");
        if (r.ok) {
          const cfg = (await r.json()) as HubConfig;
          if (cfg.hub) {
            setHub(cfg);
            await pollHub();
            timer = window.setInterval(pollHub, 2500);
          }
        }
      } catch {
        /* not the hub: the page came from the Pi itself */
      }
      setCheckedHub(true);
    })();
    return () => window.clearInterval(timer);
  }, [pollHub]);

  const hubPost = useCallback(async (path: string, body?: object) => {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return r.json();
  }, []);

  /* ------------------------------------------------------- websocket */

  useEffect(() => {
    if (!checkedHub) return;
    let closed = false;
    let retry = 0;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const host = hubRef.current ? hubRef.current.pi : location.host;
      const ws = new WebSocket(`${proto}://${host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        setShuttingDown(false);
      };
      ws.onclose = () => {
        setConnected(false);
        setState("off");
        if (!closed) retry = window.setTimeout(connect, hubRef.current ? 3000 : 2000);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case "snapshot":
            setSettings(msg.settings);
            setDevices(msg.devices);
            setLanguages(msg.languages ?? { en: "English" });
            setHistory(msg.history);
            setState(msg.state);
            setTestMode(!!msg.fake_audio);
            break;
          case "state":
            setState(msg.state);
            if (msg.state !== "listening") setLevel(0);
            break;
          case "message":
            setHistory((h) => [...h, msg.message].slice(-200));
            break;
          case "level":
            setLevel(msg.level);
            break;
          case "notice":
            showNotice(msg.text);
            break;
          case "error":
            showNotice(msg.text, true);
            break;
          case "settings":
            setSettings(msg.settings);
            break;
          case "devices":
            setDevices(msg.devices);
            break;
          case "pi_shutdown":
            setShuttingDown(true);
            break;
          case "history_cleared":
            setHistory([]);
            break;
        }
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [checkedHub, hub?.pi, showNotice]);

  const send = useCallback((action: string, data?: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action, data }));
  }, []);

  /* ---------------------------------------------------------- power */

  const piOn = hub ? !!hubStatus?.pi_online : connected;

  const powerOff = useCallback(async () => {
    if (hub) setHubStatus(await hubPost("/hub/power_off"));
    else send("shutdown_pi");
  }, [hub, hubPost, send]);

  const powerOn = useCallback(async () => {
    if (hub) setHubStatus(await hubPost("/hub/power_on"));
  }, [hub, hubPost]);

  const savePowerSetup = useCallback(
    async (data: { pi: string; plug_host: string; plug_user: string; plug_pass: string }) => {
      const cfg = (await hubPost("/hub/settings", data)) as HubConfig;
      setHub({ ...cfg, hub: true });
      await pollHub();
    },
    [hubPost, pollHub],
  );

  return {
    hub,
    hubStatus,
    connected,
    piOn,
    shuttingDown,
    state,
    history,
    settings,
    devices,
    languages,
    notice,
    level,
    testMode,
    send,
    showNotice,
    powerOn,
    powerOff,
    savePowerSetup,
  };
}

export type Lockette = ReturnType<typeof useLockette>;
