"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { DeviceStage, useStage } from "@/components/device/stage";
import { POSES, featurePose, mixPose, type Pose } from "@/components/device/pose";
import { CornerControls, CornerName, DevGrid, LoginButton, SplitButton, useGridToggle } from "@/components/ui/chrome";
import { GooText } from "@/components/ui/goo-text";
import { usePrefs } from "@/components/ui/prefs";
import { EASE, clamp01, prefersReducedMotion } from "@/components/ui/motion";
import { BlurReveal, RollText, cn } from "@/components/ui/reveal";
import { FEATURES, INSIDE, SPECS } from "./content";
import { ScrollBar, StickyName, type Listen, type Listener } from "./edge";
import { Preloader, shouldSkipIntro } from "./preloader";

export function Landing() {
  const [ready, setReady] = useState(false);
  const [intro, setIntro] = useState(false);

  useEffect(() => {
    if (shouldSkipIntro()) setReady(true);
    else setIntro(true);
  }, []);

  return (
    <DeviceStage variant="site" pose={POSES.hero} shown={ready}>
      <SiteBody ready={ready} />
      {intro && <Preloader onDone={() => setReady(true)} />}
    </DeviceStage>
  );
}

/* ========================================================================== */

type Key = { y: number; pose: Pose };

function SiteBody({ ready }: { ready: boolean }) {
  const { scene, live } = useStage();
  const { theme } = usePrefs();
  const [grid, setGrid] = useGridToggle();
  const [joined, setJoined] = useState(false);
  const [step, setStep] = useState(0);
  const [mobile, setMobile] = useState(false);

  const lenisRef = useRef<Lenis | null>(null);
  const listeners = useRef(new Set<Listener>());
  const listen: Listen = useCallback((fn) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const statementRef = useRef<HTMLElement | null>(null);
  const insideRef = useRef<HTMLElement | null>(null);
  const featuresRef = useRef<HTMLElement | null>(null);
  const specsRef = useRef<HTMLElement | null>(null);
  const showcaseRef = useRef<HTMLElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);

  // scroll-driven values the 3D overlays read every frame
  const local = useRef({ explode: 0, side: 0 });
  const keys = useRef<Key[]>([]);
  const meta = useRef<Record<string, number> | null>(null);
  const stepRef = useRef(0);

  /* ---------------------------------------------------------- breakpoints */

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  /* --------------------------------------------------------- smooth scroll */

  useEffect(() => {
    document.documentElement.classList.add("lk-site");
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: !prefersReducedMotion(),
      autoRaf: true,
    });
    lenisRef.current = lenis;
    const emit = () => {
      const y = lenis.scroll;
      const limit = lenis.limit;
      listeners.current.forEach((fn) => fn(y, limit > 0 ? clamp01(y / limit) : 0, limit));
    };
    lenis.on("scroll", emit);
    window.addEventListener("scroll", emit, { passive: true });
    const onResize = () => {
      lenis.resize();
      emit();
    };
    window.addEventListener("resize", onResize);
    emit();
    return () => {
      window.removeEventListener("scroll", emit);
      window.removeEventListener("resize", onResize);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.classList.remove("lk-site");
    };
  }, []);

  useEffect(() => {
    const l = lenisRef.current;
    if (!l) return;
    if (ready) l.start();
    else l.stop();
  }, [ready]);

  /* --------------------------------------------------------- the timeline */

  useEffect(() => {
    const top = (el: HTMLElement | null) => (el ? el.getBoundingClientRect().top + window.scrollY : 0);
    const build = () => {
      const vh = window.innerHeight;
      const limit = Math.max(1, document.documentElement.scrollHeight - vh);
      const st = top(statementRef.current);
      const it = top(insideRef.current);
      const ih = insideRef.current?.offsetHeight ?? vh;
      const ft = top(featuresRef.current);
      const fh = featuresRef.current?.offsetHeight ?? vh;
      const sp = top(specsRef.current);
      const sc = top(showcaseRef.current);
      const sh = showcaseRef.current?.offsetHeight ?? vh;
      const fo = top(footerRef.current);
      const k: [number, Pose][] = [];
      if (!mobile) {
        const ins = (p: number) => it + Math.max(1, ih - vh) * p;
        const stepLen = Math.max(1, fh - vh) / FEATURES.length;
        k.push(
          [0, POSES.hero],
          [st - vh * 0.55, POSES.hero],
          [st - vh * 0.05, POSES.side],
          [it - vh * 0.45, POSES.side],
          [ins(0), POSES.assembled3q],
          [ins(0.35), POSES.exploded],
          [ins(0.7), POSES.exploded],
          [ins(1), POSES.assembled3q],
          [ft - vh * 0.2, featurePose(0, FEATURES[0].led)],
        );
        FEATURES.forEach((f, i) => {
          k.push([ft + stepLen * (i + 0.2), featurePose(i, f.led)], [ft + stepLen * (i + 0.8), featurePose(i, f.led)]);
        });
        k.push(
          [sp - vh * 0.4, POSES.aside],
          [sc - vh * 0.6, POSES.aside],
          [sc, POSES.showcase],
          [sc + Math.max(0, sh - vh), POSES.showcase],
          [fo - vh * 0.55, { ...POSES.hanging, cord: 0, y: 0.9 }],
          [Math.max(fo, limit), POSES.hanging],
        );
      } else {
        const heroM = { ...POSES.hero, scale: 0.95, y: 0.02 };
        const asideM = { ...POSES.aside, x: 1.6, y: 0.5, scale: 0.4 };
        const explodedM = { ...POSES.exploded, x: 0, y: 0.42, scale: 0.75 };
        k.push(
          [0, heroM],
          [st - vh * 0.6, heroM],
          [st, asideM],
          [it - vh * 0.5, asideM],
          [it, explodedM],
          [it + Math.max(0, ih - vh), explodedM],
          [it + ih - vh * 0.3, asideM],
          [sc - vh * 0.5, asideM],
          [sc, { ...POSES.showcase, scale: 1.3 }],
          [sc + Math.max(0, sh - vh), { ...POSES.showcase, scale: 1.3 }],
          [fo - vh * 0.5, asideM],
          [Math.max(fo, limit), { ...POSES.hanging, x: 0.3, y: 0.3, scale: 0.75 }],
        );
      }
      // keep them in order whatever the measurements say
      let last = -Infinity;
      keys.current = k.map(([y, pose]) => {
        last = Math.max(last + 1, y);
        return { y: last, pose };
      });
      meta.current = { it, ih, ft, fh, st, vh, limit };
    };

    const poseAt = (y: number): Pose => {
      const ks = keys.current;
      if (!ks.length) return POSES.hero;
      if (y <= ks[0].y) return ks[0].pose;
      for (let i = 1; i < ks.length; i++) {
        if (y <= ks[i].y) {
          const a = ks[i - 1];
          const b = ks[i];
          return mixPose(a.pose, b.pose, EASE.inOut(clamp01((y - a.y) / (b.y - a.y))));
        }
      }
      return ks[ks.length - 1].pose;
    };

    build();
    const rebuild = () => window.requestAnimationFrame(build);
    window.addEventListener("resize", rebuild);
    document.fonts?.ready.then(rebuild).catch(() => {});
    const ro = new ResizeObserver(rebuild);
    ro.observe(document.body);

    const off = listen((y, _p, limit) => {
      scene?.setPose(poseAt(y));
      if (meta.current) {
        const { it, ih, ft, fh, st, vh } = meta.current;
        const p = clamp01((y - it) / Math.max(1, ih - vh));
        const inPin = y >= it - vh * 0.1 && y <= it + ih - vh * 0.9;
        local.current.explode = inPin ? EASE.inOut(clamp01(p / 0.35)) * (1 - EASE.inOut(clamp01((p - 0.7) / 0.3))) : 0;
        const sideIn = clamp01((y - (st - vh * 0.15)) / (vh * 0.3));
        const sideOut = 1 - clamp01((y - (it - vh * 0.7)) / (vh * 0.25));
        local.current.side = mobile ? 0 : Math.min(sideIn, sideOut);
        const stepLen = Math.max(1, fh - vh) / FEATURES.length;
        const s = Math.max(0, Math.min(FEATURES.length - 1, Math.floor((y - ft) / stepLen)));
        if (s !== stepRef.current) {
          stepRef.current = s;
          setStep(s);
        }
      }
      const atEnd = limit > 0 && y >= limit - 2;
      setJoined((was) => (was === atEnd ? was : atEnd));
    });
    return () => {
      off();
      window.removeEventListener("resize", rebuild);
      ro.disconnect();
    };
  }, [listen, scene, mobile]);

  /* ----------------------------------------------- labels that follow it */

  const calloutRef = useRef<SVGGElement | null>(null);
  const leaderRefs = useRef<(SVGLineElement | null)[]>([]);
  const labelRefs = useRef<(HTMLLIElement | null)[]>([]);
  const labelsBoxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scene) return;
    return scene.onFrame(() => {
      // fig. 1b: the 14 mm callout over the side view
      const g = calloutRef.current;
      if (g) {
        const side = local.current.side;
        g.style.opacity = String(side);
        const a = scene.project("frontTop");
        const b = scene.project("backTop");
        if (a && b && side > 0.01) {
          const x0 = Math.min(a.x, b.x);
          const x1 = Math.max(a.x, b.x);
          const yy = Math.min(a.y, b.y) - 30;
          g.querySelector("line.dim")?.setAttribute("x1", String(x0));
          g.querySelector("line.dim")?.setAttribute("x2", String(x1));
          g.querySelectorAll("line.dim, line.t0, line.t1").forEach((l) => {
            l.setAttribute("y1", String(yy));
            l.setAttribute("y2", String(yy));
          });
          const t0 = g.querySelector("line.t0");
          const t1 = g.querySelector("line.t1");
          t0?.setAttribute("x1", String(x0));
          t0?.setAttribute("x2", String(x0));
          t0?.setAttribute("y1", String(yy - 7));
          t0?.setAttribute("y2", String(yy + 7));
          t1?.setAttribute("x1", String(x1));
          t1?.setAttribute("x2", String(x1));
          t1?.setAttribute("y1", String(yy - 7));
          t1?.setAttribute("y2", String(yy + 7));
          const label = g.querySelector("text");
          label?.setAttribute("x", String((x0 + x1) / 2));
          label?.setAttribute("y", String(yy - 14));
        }
      }
      // fig. 2: leader lines from each label to its part
      const ex = local.current.explode;
      if (labelsBoxRef.current) labelsBoxRef.current.style.opacity = String(clamp01(ex * 1.4));
      INSIDE.forEach((part, i) => {
        const line = leaderRefs.current[i];
        const li = labelRefs.current[i];
        if (!line || !li) return;
        const p = scene.project(part.anchor);
        if (!p || ex < 0.02) {
          line.style.opacity = "0";
          return;
        }
        const r = li.getBoundingClientRect();
        line.setAttribute("x1", String(r.left - 12));
        line.setAttribute("y1", String(r.top + 18));
        line.setAttribute("x2", String(p.x));
        line.setAttribute("y2", String(p.y));
        line.style.opacity = String(clamp01((ex - 0.25) / 0.5));
      });
    });
  }, [scene]);

  /* ------------------------------------------------------ pressing the button */

  const [wave, setWave] = useState(0);
  useEffect(() => {
    if (!scene) return;
    return scene.onPress(() => setWave((w) => w + 1));
  }, [scene]);

  const shown = ready;
  return (
    <>
      <LoginButtonCorner />
      <CornerName shown={shown} grid={grid} onGrid={() => setGrid((g) => !g)} />
      <DevGrid on={grid} />
      <ScrollBar listen={listen} lenis={lenisRef} />
      <StickyName joined={joined} />
      {wave > 0 && <AsciiWave key={wave} />}

      {/* overlays drawn over the 3D device (desktop only) */}
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-[12] h-full w-full overflow-visible">
        <g ref={calloutRef} style={{ opacity: 0 }} className="text-ink">
          <line className="dim" stroke="currentColor" strokeWidth="1" />
          <line className="t0" stroke="currentColor" strokeWidth="1" />
          <line className="t1" stroke="currentColor" strokeWidth="1" />
          <text className="font-mono" fontSize="13" letterSpacing="2" textAnchor="middle" fill="currentColor">
            14 MM
          </text>
        </g>
        {INSIDE.map((_, i) => (
          <line
            key={i}
            ref={(n) => {
              leaderRefs.current[i] = n;
            }}
            stroke="var(--accent)"
            strokeWidth="1"
            style={{ opacity: 0 }}
          />
        ))}
      </svg>

      <main className="relative z-10">
        {/* ================================================= S1 · hero */}
        <section className="relative h-[100svh] min-h-[36rem] overflow-hidden px-4 md:px-6">
          <div className="absolute inset-x-4 top-[16vh] bottom-[22vh] flex flex-col justify-between md:inset-x-6 md:top-[14vh]">
            <GooText
              as="p"
              play={ready}
              lines={[
                <span key="0" className="block md:pl-[calc(100%/12)]">Everything you</span>,
                <span key="1" className="block text-right md:pr-[calc(100%/12*1.5)] md:text-left md:pl-[calc(100%/12*4)]">need to remember</span>,
                <span key="2" className="block md:pl-[calc(100%/12)]">is one button</span>,
                <span key="3" className="block text-right md:pr-0 md:text-left md:pl-[calc(100%/12*7)]">away.</span>,
              ]}
              className="display text-[12vw] leading-[0.95] md:text-[7vw]"
            />
          </div>
          <div
            className="absolute inset-x-4 bottom-[max(11vw,5.5rem)] flex items-end justify-between gap-6 transition-opacity duration-1000 md:inset-x-6 md:bottom-[10.5vw]"
            style={{ opacity: ready ? 1 : 0 }}
          >
            <div className="max-w-md">
              <h1 className="display text-[2.75rem] leading-none md:text-[3.5rem]">Lockette</h1>
              <p className="mt-2 text-lg text-dim">A one-button voice companion for older adults.</p>
              <p className="caption mt-3">fig. 1 — Lockette, {theme === "night" ? "graphite" : "porcelain"}</p>
            </div>
            <p className="caption hidden sm:block">scroll ↓</p>
          </div>
        </section>

        {/* ========================================== S2 · statement + body */}
        <section ref={statementRef} className="relative grid grid-cols-12 gap-x-4 px-4 pt-[18vh] pb-[24vh] md:gap-x-6 md:px-6">
          <div className="col-span-12 md:col-span-6 md:col-start-2">
            <GooText
              as="h2"
              armed={ready}
              lines={["Made for the", "people who", "raised us."]}
              className="display text-[14vw] md:text-[6.6vw]"
            />
            <BlurReveal className="mt-12 max-w-[34rem]">
              <p className="text-[1.25rem] leading-relaxed text-dim">
                Lockette is a small rounded box with one big button. Press it and talk, and it answers out loud: the
                weather, the news, what day it is, when it&apos;s time for the blue pill. There&apos;s no screen to
                read, no app to learn, and no phone needed. And the people who love them can see that all is well.
              </p>
            </BlurReveal>
            <div className="mt-10 flex flex-col gap-4">
              <SplitButton href="/login/" label="Log in" big />
              <p className="text-base text-dim">Family and owners: your Lockette dashboard is behind Log in.</p>
            </div>
          </div>
        </section>

        {/* ===================================== S3 · what's inside (pinned) */}
        <section ref={insideRef} className={cn("relative", !mobile && "h-[220vh]")}>
          <div className={cn(!mobile && "sticky top-0 h-[100svh] overflow-hidden", "px-4 md:px-6")}>
            <div className="pt-24 md:pt-28">
              <p className="caption">fig. 2 — exploded view</p>
              <GooText
                as="h2"
                armed={ready}
                lines={["What's", "inside"]}
                className="display mt-3 text-[13vw] md:text-[5.5vw]"
              />
            </div>
            {mobile || !live ? (
              <div className="mt-8 pb-16">
                {!live && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/stills/exploded.webp" alt="Lockette taken apart into five layers." className="mx-auto mb-8 w-full max-w-md" />
                )}
                <InsideList mobile />
              </div>
            ) : (
              <div ref={labelsBoxRef} className="absolute top-1/2 right-6 w-[min(30rem,34vw)] -translate-y-1/2" style={{ opacity: 0 }}>
                <ol className="flex flex-col gap-7">
                  {INSIDE.map((part, i) => (
                    <li
                      key={part.anchor}
                      ref={(n) => {
                        labelRefs.current[i] = n;
                      }}
                      className="border-l border-accent pl-4"
                    >
                      <span className="caption block">{String(i + 1).padStart(2, "0")}</span>
                      <span className="block text-[1.25rem] font-semibold leading-snug">{part.title}</span>
                      <span className="block text-base text-dim">{part.note}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>

        {/* ================================== S4 · what it does (pinned steps) */}
        <section ref={featuresRef} className={cn("relative", !mobile && "h-[480vh]")}>
          {mobile ? (
            <div className="px-4 pt-16 pb-24">
              <SectionHeader />
              <ol className="mt-10 flex flex-col gap-16">
                {FEATURES.map((f, i) => (
                  <li key={f.title}>
                    <Feature i={i} />
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="sticky top-0 grid h-[100svh] grid-cols-12 gap-x-6 overflow-hidden px-6">
              <div className="col-span-12 pt-24">
                <SectionHeader />
              </div>
              <div className="relative col-span-6 col-start-7 -mt-[18vh] self-center">
                <Feature i={step} key={step} />
              </div>
              <StepDots step={step} />
            </div>
          )}
        </section>

        {/* ======================================================= S5 · details */}
        <section ref={specsRef} className="relative bg-bg px-4 pt-24 pb-28 md:px-6">
          <div className="grid grid-cols-12 items-end gap-x-6 gap-y-4 pb-10">
            <GooText
              as="h2"
              armed={ready}
              lines={["The fine", "print"]}
              className="display col-span-12 text-[13vw] md:col-span-6 md:text-[6vw]"
            />
            <div className="col-span-12 md:col-span-4 md:col-start-9 md:text-right">
              <p className="caption">[ {String(SPECS.length).padStart(2, "0")} ] details</p>
              <p className="mt-2 text-base text-dim">A working prototype. Sizes and battery are design targets.</p>
            </div>
          </div>
          <ol className="border-t border-ink">
            {SPECS.map((s, i) => (
              <li
                key={s.label}
                className="group grid grid-cols-12 items-baseline gap-x-4 gap-y-1 border-b border-line px-1 py-6 transition-colors duration-300 hover:bg-ink hover:text-bg"
              >
                <span className="caption col-span-2 group-hover:text-bg md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
                <span className="col-span-10 text-[1.5rem] font-semibold tracking-tight md:col-span-3 md:text-[1.75rem]">
                  <RollText text={s.label} />
                </span>
                <span className="col-span-10 col-start-3 text-[1.25rem] md:col-span-4 md:col-start-auto">{s.value}</span>
                <span className="col-span-10 col-start-3 text-base text-dim group-hover:text-bg md:col-span-4 md:col-start-auto md:text-right">
                  {s.note}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ===================================================== S6 · showcase */}
        <section ref={showcaseRef} className="relative h-[200vh]">
          <div className="sticky top-0 h-[100svh] overflow-hidden">
            <DepthOfField />
            <div className="absolute inset-0 grid place-items-center px-4">
              <GooText
                as="h2"
                armed={ready}
                lines={["Peace", "of mind"]}
                className="display-caps text-center text-[16vw] leading-[0.9] md:text-[10vw]"
              />
            </div>
            <div className="absolute inset-x-4 bottom-[max(12vw,6rem)] flex justify-between md:inset-x-6 md:bottom-[11vw]">
              <span className="caption">fig. 3 — on the nightstand, all good</span>
              <span className="caption hidden sm:inline">keep going ↓</span>
            </div>
          </div>
        </section>

        {/* ======================================================= S7 · footer */}
        <section ref={footerRef} className="relative flex min-h-[100svh] flex-col justify-between border-t border-ink px-4 pt-20 pb-[max(22vw,9rem)] md:px-6 md:pb-[12vw]">
          <LiveSentence armed={ready} />
          <div className="mt-20 grid grid-cols-12 gap-x-6 gap-y-10">
            <div className="col-span-12 flex flex-col gap-3 md:col-span-5">
              <p className="text-[1.25rem] font-semibold">No ads. No selling data.</p>
              <p className="max-w-[36ch] text-base text-dim">
                Lockette only listens after the button is pressed, and what it hears is used to answer, nothing else.
              </p>
              <nav className="flex gap-6 pt-2 text-base">
                <Link href="/privacy/" className="underline underline-offset-4 hover:text-accent">
                  Privacy
                </Link>
                <Link href="/terms/" className="underline underline-offset-4 hover:text-accent">
                  Terms
                </Link>
              </nav>
            </div>
            <div className="col-span-12 flex md:col-span-5 md:col-start-8 md:justify-end">
              <SplitButton href="/login/" label="Log in" big />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

/* ========================================================================== */

/** The corner Log in: first in the tab order, never hidden or animated in. */
function LoginButtonCorner() {
  return <CornerControls action={<LoginButton />} />;
}

function SectionHeader() {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
      <span aria-hidden className="block h-px w-16 translate-y-[-0.3em] bg-ink md:w-28" />
      <h2 className="display-caps text-[2.5rem] md:text-[3rem]">What it does</h2>
      <span className="font-serif text-[1.75rem] italic text-dim">(for them, and for you)</span>
    </div>
  );
}

function Feature({ i }: { i: number }) {
  const f = FEATURES[i];
  return (
    <article className="lk-pop relative">
      <span
        aria-hidden
        className="display pointer-events-none absolute -top-[0.32em] -left-[0.04em] -z-10 text-[42vw] leading-none text-transparent select-none md:text-[26vw]"
        style={{ WebkitTextStroke: "1px color-mix(in oklab, var(--text) 16%, transparent)" }}
      >
        {String(i + 1).padStart(2, "0")}
      </span>
      <p className="caption">
        {String(i + 1).padStart(2, "0")} / {String(FEATURES.length).padStart(2, "0")} · light: {f.ledName}
      </p>
      <h3 className="display-caps mt-4 text-[2.75rem] text-accent md:text-[clamp(2.75rem,4.2vw,4.5rem)]">{f.title}</h3>
      <p className="mt-5 max-w-[30rem] text-[1.25rem] leading-relaxed">{f.body}</p>
      <figure className="mt-8 flex max-w-[30rem] gap-4">
        <span aria-hidden className="mt-[0.85em] block h-px w-10 shrink-0 bg-accent" />
        <blockquote>
          <p className="font-serif text-[1.75rem] leading-snug italic">{f.quote}</p>
          <figcaption className="mt-1 text-base text-dim">— a Lockette design rule</figcaption>
        </blockquote>
      </figure>
    </article>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="absolute right-6 bottom-[11vw] flex items-center gap-4" aria-hidden>
      <div className="flex flex-col gap-1.5">
        {FEATURES.map((_, i) => (
          <span
            key={i}
            className={cn("block size-3 rounded-full border border-ink transition-colors duration-500", i <= step && "bg-ink")}
          />
        ))}
      </div>
      <span className="caption text-ink">
        {String(step + 1).padStart(2, "0")}/{String(FEATURES.length).padStart(2, "0")}
      </span>
    </div>
  );
}

function InsideList({ mobile = false }: { mobile?: boolean }) {
  return (
    <ol className={cn("flex flex-col gap-6", mobile && "border-t border-ink pt-6")}>
      {INSIDE.map((part, i) => (
        <li key={part.anchor} className="border-l border-accent pl-4">
          <span className="caption block">{String(i + 1).padStart(2, "0")}</span>
          <span className="block text-[1.25rem] font-semibold">{part.title}</span>
          <span className="block text-base text-dim">{part.note}</span>
        </li>
      ))}
    </ol>
  );
}

/** Soft shapes in front of the device, out of focus: dried flowers, a cup, a blanket edge. */
function DepthOfField() {
  const motes = Array.from({ length: 16 }, (_, i) => ({
    left: (i * 37) % 100,
    top: (i * 53) % 100,
    size: 3 + (i % 4),
    dur: 9 + (i % 5) * 3,
    dx: ((i % 3) - 1) * 40,
    dy: -60 - (i % 4) * 30,
  }));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="dof-near" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
          <filter id="dof-far" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>
        {/* dried flowers, bottom left, very close to the lens */}
        <g filter="url(#dof-near)" opacity="0.55" fill="#c9a48f" stroke="#a9826d" strokeWidth="0.8">
          <path d="M-2 104 C 6 80, 8 70, 12 52" fill="none" />
          <path d="M4 104 C 10 84, 16 74, 22 62" fill="none" />
          <ellipse cx="12" cy="50" rx="4.5" ry="6" />
          <ellipse cx="22.5" cy="60" rx="3.5" ry="4.5" />
          <ellipse cx="6" cy="66" rx="3" ry="4" />
        </g>
        {/* a teacup, top right, further back */}
        <g filter="url(#dof-far)" opacity="0.4" fill="#e5dad4" stroke="#b9a99f" strokeWidth="0.6">
          <path d="M80 6 h22 v8 a11 11 0 0 1 -22 0 z" />
          <path d="M101 9 a4 4 0 0 1 0 8" fill="none" />
        </g>
        {/* the edge of a knitted blanket along the bottom */}
        <g filter="url(#dof-near)" opacity="0.5" fill="#d9c7b8">
          <path d="M40 100 Q 55 90 70 96 T 104 92 V 104 H 40 Z" />
        </g>
      </svg>
      {motes.map((m, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[#e9c9a0] blur-[1px]"
          style={
            {
              left: `${m.left}%`,
              top: `${m.top}%`,
              width: m.size,
              height: m.size,
              opacity: 0.55,
              animation: `lk-drift ${m.dur}s ease-in-out ${i * -1.3}s infinite alternate`,
              "--dx": `${m.dx}px`,
              "--dy": `${m.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** "It's ( 21 ) : 04 : and someone you love is one press away." with the real time in it. */
function LiveSentence({ armed }: { armed: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const hh = now ? String(now.getHours()).padStart(2, "0") : "--";
  const mm = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  return (
    <GooText
      as="h2"
      armed={armed}
      lines={[
        <span key="t">
          It&apos;s{" "}
          <span className="font-mono text-[0.62em] tracking-[-0.04em] text-accent">
            ( {hh} ) : {mm} :
          </span>{" "}
          and
        </span>,
        "someone you love",
        "is one press away.",
      ]}
      className="display max-w-[16ch] text-[12vw] md:max-w-none md:text-[6.4vw]"
    />
  );
}

/** Pressing the 3D button plays a little ASCII sound wave beside the pointer. */
function AsciiWave() {
  const [frame, setFrame] = useState(0);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setFrame((f) => f + 1), 90);
    const end = window.setTimeout(() => setGone(true), 2600);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(end);
    };
  }, []);
  if (gone) return null;
  const bars = " ▁▂▃▄▅▆▇█";
  const line = Array.from({ length: 22 }, (_, i) => {
    const v = Math.abs(Math.sin(i * 0.7 + frame * 0.5) * Math.cos(i * 0.31 - frame * 0.23));
    return bars[Math.min(8, Math.floor(v * 9))];
  }).join("");
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-1/2 left-1/2 z-30 translate-x-[12vw] -translate-y-1/2 font-mono text-xl text-accent"
    >
      <span className="sr-only">Lockette is listening.</span>
      <span aria-hidden>{line}</span>
      <span aria-hidden className="caption mt-2 block">
        listening…
      </span>
    </div>
  );
}
