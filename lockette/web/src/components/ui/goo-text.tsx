"use client";

import { useEffect, useId, useRef } from "react";
import { EASE, prefersReducedMotion, tween } from "./motion";

/**
 * Text that condenses out of liquid, line by line -- the reveal the whole
 * reference site is built on.
 *
 * Each line gets its own SVG filter: a heavy Gaussian blur followed by an
 * alpha threshold. Blurred that hard, the letters' ink is spread too thin to
 * pass the threshold, so the line is invisible; as the blur comes down,
 * blobs pop through the threshold, merge like metaballs and sharpen into
 * type. Near the end the threshold relaxes back to normal so the final
 * letters are anti-aliased rather than hard-edged, and the filter comes off.
 *
 * `play` controls it: true reveals, false hides, and leaving it undefined
 * reveals the first time the text scrolls into view.
 */

const BLUR = 50;
const AMP = 20;
const OFF = -8;
const REVEAL_MS = 1200;
const HIDE_MS = 400;
const STAGGER_MS = 100;

const matrix = (amp: number, off: number) => `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${amp} ${off}`;

export function GooText({
  lines,
  as: Tag = "div",
  className,
  lineClassName,
  play,
  armed = true,
  delay = 0,
  style,
}: {
  lines: React.ReactNode[];
  as?: "div" | "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  lineClassName?: string;
  play?: boolean;
  /**
   * Uncontrolled only: whether scrolling into view may trigger it yet. The
   * title screen holds everything back until its preloader has finished.
   */
  armed?: boolean;
  /** seconds before the first line starts */
  delay?: number;
  style?: React.CSSProperties;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rootRef = useRef<HTMLElement | null>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const blurRefs = useRef<(SVGFEGaussianBlurElement | null)[]>([]);
  const matRefs = useRef<(SVGFEColorMatrixElement | null)[]>([]);
  const cancels = useRef<(() => void)[]>([]);
  const shown = useRef(false);

  const stopAll = () => {
    cancels.current.forEach((c) => c());
    cancels.current = [];
  };

  const setLine = (i: number, blur: number, amp: number, off: number) => {
    blurRefs.current[i]?.setAttribute("stdDeviation", blur.toFixed(2));
    matRefs.current[i]?.setAttribute("values", matrix(amp, off));
  };

  const reveal = () => {
    if (shown.current) return;
    shown.current = true;
    stopAll();
    const reduced = prefersReducedMotion();
    lineRefs.current.forEach((el, i) => {
      if (!el) return;
      if (reduced) {
        el.style.filter = "";
        el.style.visibility = "visible";
        return;
      }
      el.style.visibility = "visible";
      el.style.filter = `url(#${uid}-${i})`;
      setLine(i, BLUR, AMP, OFF);
      const wait = window.setTimeout(() => {
        cancels.current.push(
          tween(
            REVEAL_MS,
            EASE.out,
            (k, raw) => {
              // The threshold holds until the last third, then lets go, so
              // the goo reads through most of the move and the landing is soft.
              const m = Math.max(0, (raw - 0.65) / 0.35);
              setLine(i, BLUR * (1 - k), AMP + (1 - AMP) * m, OFF * (1 - m));
            },
            () => {
              el.style.filter = "";
            },
          ),
        );
      }, (delay * 1000) + i * STAGGER_MS);
      cancels.current.push(() => window.clearTimeout(wait));
    });
  };

  const hide = () => {
    if (!shown.current) return;
    shown.current = false;
    stopAll();
    const reduced = prefersReducedMotion();
    lineRefs.current.forEach((el, i) => {
      if (!el) return;
      if (reduced) {
        el.style.visibility = "hidden";
        return;
      }
      el.style.filter = `url(#${uid}-${i})`;
      const wait = window.setTimeout(() => {
        cancels.current.push(
          tween(
            HIDE_MS,
            EASE.in,
            (k, raw) => {
              const m = Math.min(1, raw / 0.3);
              setLine(i, BLUR * k, 1 + (AMP - 1) * m, OFF * m);
            },
            () => {
              el.style.visibility = "hidden";
            },
          ),
        );
      }, i * (STAGGER_MS / 2));
      cancels.current.push(() => window.clearTimeout(wait));
    });
  };

  // Controlled: follow `play`.
  useEffect(() => {
    if (play === undefined) return;
    if (play) reveal();
    else hide();
    // reveal/hide read refs only; re-running them on identity change would
    // restart a reveal halfway through
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  // Uncontrolled: the first time it comes into view.
  const uncontrolled = play === undefined;
  useEffect(() => {
    if (!uncontrolled || !armed) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          reveal();
          io.disconnect();
        }
      },
      { threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uncontrolled, armed]);

  // On unmount -- including the throwaway mount React's strict mode does in
  // development -- forget that anything was shown. Otherwise the second mount
  // sees "already revealed", skips the reveal, and the text stays blurred out.
  useEffect(
    () => () => {
      stopAll();
      shown.current = false;
    },
    [],
  );

  const Root = Tag as React.ElementType;
  return (
    <Root ref={rootRef} className={className} style={style}>
      <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <defs>
          {lines.map((_, i) => (
            <filter
              key={i}
              id={`${uid}-${i}`}
              x="-25%"
              y="-25%"
              width="150%"
              height="150%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                ref={(n) => {
                  blurRefs.current[i] = n;
                }}
                in="SourceGraphic"
                stdDeviation={BLUR}
                result="blur"
              />
              <feColorMatrix
                ref={(n) => {
                  matRefs.current[i] = n;
                }}
                in="blur"
                mode="matrix"
                values={matrix(AMP, OFF)}
              />
            </filter>
          ))}
        </defs>
      </svg>
      {lines.map((line, i) => (
        <span
          key={i}
          ref={(n) => {
            lineRefs.current[i] = n;
          }}
          className={lineClassName ?? "block"}
          style={{ filter: `url(#${uid}-${i})`, visibility: "hidden" }}
        >
          {line}
        </span>
      ))}
    </Root>
  );
}
