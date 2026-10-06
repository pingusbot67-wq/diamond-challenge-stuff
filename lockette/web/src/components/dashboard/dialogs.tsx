"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { HubConfig, Lockette, Settings } from "./use-lockette";

function Dialog({
  open,
  onClose,
  title,
  children,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="lk-dialog" onClose={onClose} aria-labelledby={`${title}-title`}>
      <form
        method="dialog"
        className="flex flex-col gap-6 p-6 md:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
          onClose();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${title}-title`} className="display text-[2.75rem] leading-none">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="pc-press grid size-12 place-items-center border border-line-strong hover:border-ink">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
        <div className="flex justify-end gap-3 border-t border-line pt-6">
          <button type="button" onClick={onClose} className="pc-press min-h-12 border border-line-strong px-5 text-lg hover:border-ink">
            Cancel
          </button>
          <button type="submit" className="pc-press min-h-12 bg-ink px-6 text-lg font-semibold text-bg">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function Field({ label, help, children, id }: { label: string; help?: string; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold">
        {label}
      </label>
      {help && <p className="text-base text-dim">{help}</p>}
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-line pt-5">
      <legend className="caption float-left mb-1 w-full">{title}</legend>
      {children}
    </fieldset>
  );
}

function Rows<T>({
  rows,
  setRows,
  empty,
  render,
  addLabel,
}: {
  rows: T[];
  setRows: (r: T[]) => void;
  empty: T;
  render: (row: T, set: (r: T) => void, i: number) => React.ReactNode;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr]">{render(row, (r) => setRows(rows.map((x, j) => (j === i ? r : x))), i)}</div>
          <button
            type="button"
            aria-label="Remove"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
            className="pc-press grid size-[3.25rem] place-items-center border border-line-strong hover:border-danger hover:text-danger"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, empty])} className="self-start text-lg underline underline-offset-4 hover:text-accent">
        + {addLabel}
      </button>
    </div>
  );
}

export function SettingsDialog({ open, onClose, lk }: { open: boolean; onClose: () => void; lk: Lockette }) {
  const [s, setS] = useState<Settings | null>(lk.settings);
  useEffect(() => {
    if (open) setS(lk.settings);
  }, [open, lk.settings]);
  if (!s) return null;
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const options = (names: string[]) => [
    <option key="" value="">
      Automatic (recommended)
    </option>,
    ...names.map((n) => (
      <option key={n} value={n}>
        {n}
      </option>
    )),
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Settings" onSubmit={() => lk.send("save_settings", s)}>
      <Group title="About them">
        <Field id="s-name" label="Their first name">
          <input id="s-name" className="lk-input" value={s.user_name} maxLength={40} onChange={(e) => set({ user_name: e.target.value })} />
        </Field>
        <Field id="s-city" label="Their town" help="So Lockette can look up the weather and local news.">
          <input id="s-city" className="lk-input" value={s.city} maxLength={60} placeholder="Irvine, California" onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field id="s-units" label="Temperature">
          <select id="s-units" className="lk-input" value={s.units} onChange={(e) => set({ units: e.target.value as "F" | "C" })}>
            <option value="F">Fahrenheit (°F)</option>
            <option value="C">Celsius (°C)</option>
          </select>
        </Field>
      </Group>

      <Group title="Family">
        <Rows
          rows={s.family}
          setRows={(family) => set({ family })}
          empty={{ relation: "", name: "" }}
          addLabel="Add family member"
          render={(f, setF, i) => (
            <>
              <input aria-label={`Relation ${i + 1}`} className="lk-input" placeholder="son" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} />
              <input aria-label={`Name ${i + 1}`} className="lk-input" placeholder="David" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </>
          )}
        />
      </Group>

      <Group title="Medication reminders">
        <p className="text-base text-dim">Lockette says these out loud at the time. It never gives medical advice.</p>
        <Rows
          rows={s.meds}
          setRows={(meds) => set({ meds })}
          empty={{ time: "08:00", what: "" }}
          addLabel="Add reminder"
          render={(m, setM, i) => (
            <>
              <input aria-label={`Time ${i + 1}`} type="time" className="lk-input" value={m.time} onChange={(e) => setM({ ...m, time: e.target.value })} />
              <input aria-label={`Which medicine ${i + 1}`} className="lk-input" placeholder="the blue cholesterol pill" value={m.what} onChange={(e) => setM({ ...m, what: e.target.value })} />
            </>
          )}
        />
      </Group>

      <Group title="Voice and sound">
        <Field id="s-lang" label="Language" help="Lockette listens and answers in this language.">
          <select id="s-lang" className="lk-input" value={s.language} onChange={(e) => set({ language: e.target.value })}>
            {Object.entries(lk.languages).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {s.language === "en" && (
          <Field id="s-accent" label="English accent">
            <select id="s-accent" className="lk-input" value={s.accent} onChange={(e) => set({ accent: e.target.value })}>
              <option value="com">American</option>
              <option value="co.uk">British</option>
              <option value="com.au">Australian</option>
            </select>
          </Field>
        )}
        <Field id="s-vol" label={`Volume · ${s.volume}%`}>
          <input id="s-vol" type="range" min={0} max={100} step={5} className="lk-range" value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
        </Field>
        <Field id="s-mic" label="Microphone">
          <select id="s-mic" className="lk-input" value={lk.devices.inputs.includes(s.mic) ? s.mic : ""} onChange={(e) => set({ mic: e.target.value })}>
            {options(lk.devices.inputs)}
          </select>
        </Field>
        <Field id="s-spk" label="Speaker">
          <select id="s-spk" className="lk-input" value={lk.devices.outputs.includes(s.speaker) ? s.speaker : ""} onChange={(e) => set({ speaker: e.target.value })}>
            {options(lk.devices.outputs)}
          </select>
        </Field>
        <button
          type="button"
          onClick={() => {
            lk.send("save_settings", s);
            lk.send("test_speaker");
          }}
          className="pc-press min-h-12 self-start border border-ink px-5 text-lg font-semibold hover:bg-ink hover:text-bg"
        >
          Play a test sentence
        </button>
      </Group>

      <label className="flex items-start gap-3 border-t border-line pt-5 text-lg">
        <input type="checkbox" className="lk-check mt-1" checked={s.auto_start} onChange={(e) => set({ auto_start: e.target.checked })} />
        <span>Start Lockette automatically when the Pi turns on</span>
      </label>
    </Dialog>
  );
}

export function PowerDialog({
  open,
  onClose,
  hub,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  hub: HubConfig;
  onSave: (d: { pi: string; plug_host: string; plug_user: string; plug_pass: string }) => void;
}) {
  const [pi, setPi] = useState(hub.pi);
  const [host, setHost] = useState(hub.plug_host);
  const [user, setUser] = useState(hub.plug_user);
  const [pass, setPass] = useState("");
  useEffect(() => {
    if (!open) return;
    setPi(hub.pi);
    setHost(hub.plug_host);
    setUser(hub.plug_user);
    setPass("");
  }, [open, hub]);
  return (
    <Dialog open={open} onClose={onClose} title="Power setup" onSubmit={() => onSave({ pi, plug_host: host, plug_user: user, plug_pass: pass })}>
      <p className="text-base text-dim">These settings stay on this computer.</p>
      <Field id="p-pi" label="Pi address" help="The number you use to reach the Pi, like 192.168.1.230.">
        <input id="p-pi" className="lk-input" value={pi} onChange={(e) => setPi(e.target.value)} />
      </Field>
      <Group title="Smart plug (needed for Power on)">
        <p className="text-base text-dim">
          A TP-Link Kasa or Tapo Wi-Fi plug with the Pi&apos;s charger plugged into it. Its address is in the Kasa or Tapo
          app, under the plug&apos;s device info.
        </p>
        <Field id="p-host" label="Plug address">
          <input id="p-host" className="lk-input" placeholder="192.168.1.50 (leave blank if you don't have one)" value={host} onChange={(e) => setHost(e.target.value)} />
        </Field>
        <Field id="p-user" label="TP-Link account email" help="Only needed for newer plugs.">
          <input id="p-user" className="lk-input" autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} />
        </Field>
        <Field id="p-pass" label="TP-Link account password">
          <input
            id="p-pass"
            type="password"
            autoComplete="new-password"
            className="lk-input"
            placeholder={hub.has_password ? "Saved (leave blank to keep it)" : ""}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </Field>
      </Group>
    </Dialog>
  );
}

