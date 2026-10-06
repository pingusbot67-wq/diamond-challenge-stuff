"use client";

import { useEffect, useRef, useState } from "react";
import { CSS_EASE, prefersReducedMotion } from "./motion";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Letters that roll up on hover (or keyboard focus), a second copy rolling in from below. */
export function RollText({ text }: { text: string }) {
  const chars = Array.from(text);
  const row = () =>
    chars.map((c, i) => (
      <span key={i} className="pc-roll-ch" style={{ transitionDelay: `${i * 10}ms` }}>
        {c}
      </span>
    ));
  return (
    <span className="relative inline-block overflow-hidden whitespace-pre align-bottom">
      <span className="pc-roll-a block" aria-hidden>
        {row()}
      </span>
      <span className="pc-roll-b absolute inset-0 block" aria-hidden>
        {row()}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

function useSeen<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(el);
    // Never leave content hidden if the observer is slow to report.
    const failsafe = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) setSeen(true);
    }, 2500);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);
  return [ref, seen] as const;
}

/** Fades in from a 20px blur the first time it scrolls into view. */
export function BlurReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn("transition-[opacity,filter] duration-[1200ms]", className)}
      style={{
        opacity: seen ? 1 : 0,
        filter: seen ? "blur(0px)" : "blur(20px)",
        transitionTimingFunction: CSS_EASE.out,
        transitionDelay: "100ms",
      }}
    >
      {children}
    </div>
  );
}

/** Wipes open from the top, like a plate being uncovered. */
export function ClipReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        clipPath: seen ? "inset(0% 0% 0% 0%)" : "inset(0% 0% 100% 0%)",
        transition: `clip-path 1.2s ${CSS_EASE.out} 0.1s`,
      }}
    >
      {children}
    </div>
  );
}
