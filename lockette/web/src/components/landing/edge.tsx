"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type Lenis from "lenis";
import { GooText } from "@/components/ui/goo-text";
import { CSS_EASE, clamp01 } from "@/components/ui/motion";
import { cn } from "@/components/ui/reveal";

export type Listener = (y: number, progress: number, limit: number) => void;
export type Listen = (fn: Listener) => () => void;

/**
 * The name as a faint ghost along the bottom edge. At the very end of the
 * page "lock" and "ette" slide together, turn solid, and a line of small
 * print condenses in beside them.
 */
export function StickyName({ joined }: { joined: boolean }) {
  const aRef = useRef<HTMLSpanElement | null>(null);
  const bRef = useRef<HTMLSpanElement | null>(null);
  const [natural, setNatural] = useState(0);

  useEffect(() => {
    const measure = () => setNatural((aRef.current?.offsetWidth ?? 0) + (bRef.current?.offsetWidth ?? 0));
    measure();
    const ro = new ResizeObserver(measure);
    if (aRef.current) ro.observe(aRef.current);
    if (bRef.current) ro.observe(bRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[15] flex items-end gap-6 px-2 select-none">
      <div
        className="flex shrink-0 items-end justify-between overflow-hidden"
        style={{
          width: joined && natural ? `${natural}px` : "calc(100% - 1rem)",
          opacity: joined ? 1 : 0.1,
          transition: `width 0.8s ${CSS_EASE.inOut}, opacity 0.4s ${CSS_EASE.inOut} 0.4s`,
        }}
        aria-hidden
      >
        <span ref={aRef} className="display translate-y-[14%] text-[18vw] leading-none md:text-[9vw]">
          lock
        </span>
        <span ref={bRef} className="display translate-y-[14%] text-[18vw] leading-none md:text-[9vw]">
          ette
        </span>
      </div>
      <div className={cn("hidden pb-4 md:block", joined && "pointer-events-auto")}>
        <GooText
          play={joined}
          lines={[
            <span key="a">a little box for big days</span>,
            <Link key="b" href="/login/" className="underline underline-offset-4 hover:text-accent">
              log in ↗
            </Link>,
          ]}
          className="font-mono text-sm leading-snug"
        />
      </div>
    </div>
  );
}

/** A 3px scrollbar on the right that shows while scrolling or hovered, and can be dragged. */
export function ScrollBar({ listen, lenis }: { listen: Listen; lenis: React.RefObject<Lenis | null> }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const [awake, setAwake] = useState(false);
  const idle = useRef(0);
  const drag = useRef<{ offset: number } | null>(null);

  const place = useCallback((p: number) => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;
    const doc = document.documentElement;
    const ratio = window.innerHeight / Math.max(1, doc.scrollHeight);
    const th = Math.max(40, track.clientHeight * ratio);
    thumb.style.height = `${th}px`;
    thumb.style.transform = `translate3d(0, ${p * (track.clientHeight - th)}px, 0)`;
  }, []);

  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      if (!drag.current) setAwake(false);
    }, 1000);
  }, []);

  const lastY = useRef(-1);
  useEffect(
    () =>
      listen((y, p) => {
        place(p);
        // show only when the page actually moves, not on the first measure
        if (lastY.current >= 0 && Math.abs(y - lastY.current) > 0.5) wake();
        lastY.current = y;
      }),
    [listen, place, wake],
  );

  const scrollTo = (clientY: number, offset: number) => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    const l = lenis.current;
    if (!track || !thumb || !l) return;
    const box = track.getBoundingClientRect();
    const p = clamp01((clientY - box.top - offset) / Math.max(1, box.height - thumb.offsetHeight));
    l.scrollTo(p * l.limit, { immediate: true });
  };

  return (
    <div
      ref={trackRef}
      aria-hidden
      className="fixed top-2 right-1 bottom-2 z-50 hidden w-[9px] transition-opacity duration-300 md:block"
      style={{ opacity: awake ? 1 : 0 }}
      onPointerEnter={() => setAwake(true)}
      onPointerLeave={wake}
      onPointerDown={(e) => {
        const thumb = thumbRef.current;
        if (!thumb) return;
        const offset = e.target === thumb ? e.clientY - thumb.getBoundingClientRect().top : thumb.offsetHeight / 2;
        drag.current = { offset };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        scrollTo(e.clientY, offset);
      }}
      onPointerMove={(e) => drag.current && scrollTo(e.clientY, drag.current.offset)}
      onPointerUp={() => {
        drag.current = null;
        wake();
      }}
    >
      <div ref={thumbRef} className="ml-auto w-[3px] bg-ink" />
    </div>
  );
}
