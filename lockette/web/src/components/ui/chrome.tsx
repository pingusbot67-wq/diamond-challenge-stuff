"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { CSS_EASE } from "./motion";
import { TEXT_SCALES, usePrefs, type Theme } from "./prefs";
import { RollText, cn } from "./reveal";

/** Twelve columns that grow in from nothing, toggled by the corner square (or G). */
export function DevGrid({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] grid grid-cols-6 gap-4 px-4 md:grid-cols-12 md:gap-6 md:px-6"
      style={{ visibility: on ? "visible" : "hidden", transition: `visibility 0s linear ${on ? "0s" : "0.5s"}` }}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className={cn("flex h-full justify-center", i >= 6 && "hidden md:flex")}>
          <div
            className="h-full border-x border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
            style={{ width: on ? "100%" : "0%", transition: `width 0.4s ${CSS_EASE.inOut} ${i * 0.02}s` }}
          />
        </div>
      ))}
    </div>
  );
}

export function useGridToggle() {
  const [grid, setGrid] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) setGrid((g) => !g);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [grid, setGrid] as const;
}

/** Top-left: the grid square and the name in mono. */
export function CornerName({
  shown = true,
  grid,
  onGrid,
  sub = "voice companion",
}: {
  shown?: boolean;
  grid: boolean;
  onGrid: () => void;
  sub?: string;
}) {
  return (
    <>
    <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[4.25rem] border-b border-line bg-bg/95 md:hidden" />
    <div
      className="fixed top-0 left-0 z-50 flex items-start gap-3 p-4 transition-transform sm:p-5"
      style={{
        transform: shown ? "translate3d(0,0,0)" : "translate3d(-5vw,-5vw,0)",
        transitionDuration: "800ms",
        transitionTimingFunction: CSS_EASE.out,
      }}
    >
      <button
        onClick={onGrid}
        aria-pressed={grid}
        aria-label="Show the layout grid"
        title="Show the layout grid (G)"
        className={cn(
          "pc-press mt-0.5 size-3 shrink-0 border border-ink",
          grid ? "bg-accent" : "bg-ink hover:bg-accent",
        )}
      />
      <Link href="/" className="font-mono text-[0.6875rem] leading-tight tracking-[0.18em] uppercase">
        Lockette
        <span className="hidden text-faint sm:block">{sub}</span>
      </Link>
    </div>
    </>
  );
}

const SWATCH: Record<Theme, string> = { paper: "#faf5ee", night: "#0b0d0d" };

/** Top-right: text size (A A A), paper / night, and the way in. */
export function CornerControls({ action }: { action?: React.ReactNode }) {
  const { theme, setTheme, textSize, setTextSize } = usePrefs();
  return (
    <div className="fixed top-0 right-0 z-50 flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
      {/* first in the tab order, last on screen */}
      {action && <div className="order-last">{action}</div>}
      <div role="radiogroup" aria-label="Text size" className="flex items-stretch border border-line-strong bg-bg">
        {TEXT_SCALES.map((_, i) => (
          <button
            key={i}
            role="radio"
            aria-checked={textSize === i}
            aria-label={["Normal text", "Larger text", "Largest text"][i]}
            title={["Normal text", "Larger text", "Largest text"][i]}
            onClick={() => setTextSize(i)}
            className={cn(
              "pc-press grid h-11 w-10 place-items-center font-serif leading-none",
              textSize === i ? "bg-ink text-bg" : "hover:bg-bg-alt",
            )}
            style={{ fontSize: `${16 + i * 4}px` }}
          >
            A
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Colours" className="hidden items-center gap-1.5 sm:flex">
        {(["paper", "night"] as Theme[]).map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={theme === t}
            aria-label={t === "paper" ? "Light colours" : "Dark colours"}
            title={t === "paper" ? "Light" : "Dark"}
            onClick={(e) => setTheme(t, { x: e.clientX, y: e.clientY })}
            className={cn(
              "pc-press size-6 border-ink transition-[border-width] duration-300",
              theme === t ? "border-[6px]" : "border",
            )}
            style={{ background: SWATCH[t] }}
          />
        ))}
      </div>
    </div>
  );
}

/** The small inverted "Log in" in the corner: never animated in, never hidden. */
export function LoginButton({ href = "/login/", label = "Log in" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="group pc-press inline-flex min-h-11 items-center bg-ink px-4 text-base font-semibold text-bg"
    >
      <RollText text={label} />
    </Link>
  );
}

/** Pingus's split button: label, then a square arrow cell that turns accent on hover. */
export function SplitButton({
  href,
  onClick,
  label,
  big = false,
  disabled = false,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  big?: boolean;
  disabled?: boolean;
}) {
  const inner = (
    <>
      <span className={big ? "px-6 py-4 text-xl" : "px-5 py-3 text-lg"}>
        <RollText text={label} />
      </span>
      <span
        className={cn(
          "grid place-items-center border-l border-ink bg-bg text-ink transition-colors",
          "group-hover:bg-accent group-hover:text-accent-ink",
          big ? "w-16" : "w-14",
        )}
      >
        <ArrowUpRight className="size-5 transition-transform duration-300 group-hover:rotate-45" aria-hidden />
      </span>
    </>
  );
  const cls = cn(
    "group pc-press inline-flex min-h-14 items-stretch self-start border border-ink bg-ink font-semibold text-bg",
    disabled && "pointer-events-none opacity-50",
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}
