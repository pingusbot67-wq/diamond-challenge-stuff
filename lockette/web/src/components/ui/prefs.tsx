"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { CSS_EASE, prefersReducedMotion } from "./motion";

export type Theme = "paper" | "night";
export const TEXT_SCALES = [1, 1.18, 1.35];

interface Prefs {
  theme: Theme;
  setTheme: (t: Theme, from?: { x: number; y: number }) => void;
  textSize: number;
  setTextSize: (i: number) => void;
}

const Ctx = createContext<Prefs | null>(null);

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: fine, it just won't be remembered */
  }
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("paper");
  const [textSize, setTextSizeState] = useState(0);

  useEffect(() => {
    const d = document.documentElement;
    if (d.dataset.theme === "night") setThemeState("night");
    const k = parseFloat(getComputedStyle(d).getPropertyValue("--text-scale")) || 1;
    setTextSizeState(Math.max(0, TEXT_SCALES.indexOf(k)));
  }, []);

  const setTextSize = useCallback((i: number) => {
    setTextSizeState(i);
    document.documentElement.style.setProperty("--text-scale", String(TEXT_SCALES[i]));
    save("lk-text", String(i));
    window.dispatchEvent(new Event("resize")); // sticky sections re-measure
  }, []);

  const setTheme = useCallback(
    (next: Theme, from?: { x: number; y: number }) => {
      if (next === theme) return;
      const apply = () => {
        flushSync(() => setThemeState(next));
        document.documentElement.dataset.theme = next;
        save("lk-theme", next);
        window.dispatchEvent(new CustomEvent("lk-theme", { detail: next }));
      };
      type VT = { ready: Promise<void> };
      const doc = document as Document & { startViewTransition?: (cb: () => void) => VT };
      if (!doc.startViewTransition || prefersReducedMotion() || !from) {
        apply();
        return;
      }
      const { x, y } = from;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      doc
        .startViewTransition(apply)
        .ready.then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
            { duration: 800, easing: CSS_EASE.inOut, pseudoElement: "::view-transition-new(root)" },
          );
        })
        .catch(() => {});
    },
    [theme],
  );

  return <Ctx.Provider value={{ theme, setTheme, textSize, setTextSize }}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const p = useContext(Ctx);
  if (!p) throw new Error("usePrefs needs <PrefsProvider>");
  return p;
}
