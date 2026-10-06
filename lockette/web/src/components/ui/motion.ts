/**
 * Just enough animation machinery for the title screen, so it does not need
 * a timeline library: cubic-bezier easing, and a tween that cannot get stuck.
 */

/** A cubic-bezier easing curve, solved for x by Newton's method. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) break;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Newton can wander on the flat ends of a steep curve; bisect if it did.
    if (t < 0 || t > 1 || Math.abs(sampleX(t) - x) > 1e-3) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 24; i++) {
        if (sampleX(t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sampleY(t);
  };
}

/** The curves the reference site is built on. */
export const EASE = {
  out: bezier(0.25, 1, 0.5, 1),
  inOut: bezier(0.76, 0, 0.24, 1),
  in: bezier(0.5, 0, 0.75, 0),
  linear: (x: number) => x,
};

export const CSS_EASE = {
  out: "cubic-bezier(0.25, 1, 0.5, 1)",
  inOut: "cubic-bezier(0.76, 0, 0.24, 1)",
};

/**
 * Runs `step(eased, raw)` from 0 to 1 over `ms`. Frames come from rAF, which
 * a background tab or a headless browser can stop delivering; a timer set
 * just past the end lands the tween on its final state regardless. Anything
 * built on this therefore always finishes -- text never stays blurred and a
 * button never stays off screen.
 */
export function tween(
  ms: number,
  ease: (x: number) => number,
  step: (eased: number, raw: number) => void,
  done?: () => void,
): () => void {
  const start = performance.now();
  let raf = 0;
  let over = false;
  const finish = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
    step(1, 1);
    done?.();
  };
  const frame = (now: number) => {
    if (over) return;
    const k = Math.min(1, (now - start) / ms);
    step(ease(k), k);
    if (k >= 1) finish();
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const timer = window.setTimeout(finish, ms + 500);
  return () => {
    over = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
