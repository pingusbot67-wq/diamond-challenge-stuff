"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GooText } from "@/components/ui/goo-text";
import { CSS_EASE, EASE, prefersReducedMotion, tween } from "@/components/ui/motion";

/**
 * Pingus's count + growing rule, with eugeniagrab's letter grid: random
 * serif capitals appear like a word search, LOCKETTE is hidden in the third
 * row, everything else fades back so the name is left standing, then the grid
 * melts away and the page arrives. Under 3 seconds, once per visit, and
 * skipped for reduced motion. It never covers or blocks the Log in button.
 */

const ROWS = 5;
const COLS = 18;
const NAME = "LOCKETTE";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function shouldSkipIntro() {
  if (prefersReducedMotion()) return true;
  try {
    return sessionStorage.getItem("lk-intro") === "1";
  } catch {
    return false;
  }
}

export function Preloader({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"count" | "name" | "out" | "gone">("count");
  const [rule, setRule] = useState(false);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // the grid is random, but must be identical on the server and the first client render
  const [seed, setSeed] = useState(0);
  useEffect(() => setSeed(Math.floor(Math.random() * 1e9)), []);
  const grid = useMemo(() => {
    let s = seed || 7;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const start = Math.floor(rnd() * (COLS - NAME.length + 1));
    return Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        const inName = r === 2 && c >= start && c < start + NAME.length;
        return {
          ch: inName ? NAME[c - start] : LETTERS[Math.floor(rnd() * 26)],
          inName,
          delay: Math.round(rnd() * 1100),
        };
      }),
    );
  }, [seed]);

  useEffect(() => {
    const timers: number[] = [];
    const grow = window.setTimeout(() => setRule(true), 30);
    const stop = tween(
      2000,
      EASE.inOut,
      (k) => {
        if (countRef.current) countRef.current.textContent = `${Math.round(k * 100)}%`;
      },
      () => {
        setPhase("name");
        timers.push(window.setTimeout(() => setPhase("out"), 420));
        timers.push(
          window.setTimeout(() => {
            try {
              sessionStorage.setItem("lk-intro", "1");
            } catch {
              /* fine */
            }
            doneRef.current();
          }, 820),
        );
        timers.push(window.setTimeout(() => setPhase("gone"), 1600));
      },
    );
    return () => {
      stop();
      window.clearTimeout(grow);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40">
      {/* the rule is the progress bar */}
      <span
        className="absolute top-0 left-[calc(100%/12)] block w-px bg-ink"
        style={{
          height: rule ? "100%" : "0%",
          opacity: phase === "out" ? 0 : 1,
          transition: `height 2.4s ${CSS_EASE.inOut}, opacity 0.6s ease`,
        }}
      />
      {/* the word search */}
      <div className="absolute inset-0 grid place-items-center px-4">
        <GooText
          play={phase === "count" || phase === "name"}
          lines={grid.map((row, r) => (
            <span key={`${seed}-${r}`} className="flex justify-center">
              {row.map((cell, c) => (
                <span
                  key={c}
                  className="inline-block w-[1em] text-center"
                  style={{
                    opacity: seed === 0 ? 0 : phase === "count" ? 1 : cell.inName ? 1 : 0.15,
                    color: cell.inName && phase !== "count" ? "var(--accent)" : undefined,
                    transition:
                      phase === "count"
                        ? `opacity 0.5s ease ${cell.delay}ms`
                        : "opacity 0.4s ease, color 0.4s ease",
                  }}
                >
                  {cell.ch}
                </span>
              ))}
            </span>
          ))}
          className="font-serif text-[min(5.2vw,3.2rem)] leading-[1.15] tracking-normal"
        />
      </div>
      {/* the count, bottom left */}
      <div className="absolute bottom-0 left-0 p-4 sm:p-6">
        <GooText
          play={phase === "count"}
          lines={[
            <span key="c" ref={countRef}>
              0%
            </span>,
          ]}
          className="display tnum text-[22vw] leading-[0.8] sm:text-[11vw]"
        />
      </div>
    </div>
  );
}
