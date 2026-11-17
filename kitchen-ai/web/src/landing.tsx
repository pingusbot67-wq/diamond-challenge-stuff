// The welcome page: 3D kitchen, scroll-to-cook, and the three things Kitchen AI does.
import { Fragment, h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { FOODS } from '../../supabase/functions/_shared/foods.generated.ts';
import { GLP1_NOTE, minutesLabel } from '../../src/lib/format.ts';
import { HOUSE } from './house.ts';
import { mountScene, type SceneHandle } from './scene3d.ts';
import { Dish, MacroCard } from './ui.tsx';

void Fragment;

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Eyebrow = ({ n, children }: { n: string; children: preact.ComponentChildren }) => (
  <p class="lp-eyebrow">
    <span class="lp-eyebrow-n">{n}</span>
    {children}
  </p>
);
const MARQUEE = ['Snap it', 'Scan it', 'Cook it', 'Post it', 'High protein', 'GLP-1 friendly', 'Use what you have'];

export function Landing({ onStart, returning }: { onStart: () => void; returning?: boolean }) {
  const bg = useRef<HTMLDivElement>(null);
  const heroA = useRef<HTMLDivElement>(null);
  const bowlA = useRef<HTMLDivElement>(null);
  const floorA = useRef<HTMLElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [has3d, setHas3d] = useState(false);
  const cta = returning ? 'Open the app' : 'Get started';

  useEffect(() => {
    if (!bg.current) return;
    scene.current = mountScene(bg.current, {
      mode: 'landing',
      anchors: { hero: () => heroA.current, bowl: () => bowlA.current, floor: () => floorA.current },
      onReady: () => setHas3d(true),
    });
    return () => scene.current?.destroy();
  }, []);

  // light that follows the pointer + gentle reveal of sections
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      el.style.setProperty('--mx', `${e.clientX}px`);
      el.style.setProperty('--my', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', move, { passive: true });
    const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && x.target.classList.add('in')), { threshold: 0.12 });
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
    return () => {
      window.removeEventListener('pointermove', move);
      io.disconnect();
    };
  }, []);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const dish = HOUSE[slide] ?? HOUSE[0];

  return (
    <div class={`lp${has3d ? ' has-3d' : ''}`} ref={root}>
      <div class="lp-canvas" ref={bg} aria-hidden="true" />
      <div class="lp-spot" aria-hidden="true" />

      <header class="lp-nav">
        <span class="brand"><span class="brand-dot" aria-hidden="true" />Kitchen <em>AI</em></span>
        <nav class="lp-links" aria-label="Sections">
          <button type="button" onClick={() => go('how')}>How it works</button>
          <button type="button" onClick={() => go('import')}>Import</button>
          <button type="button" onClick={() => go('community')}>Community</button>
        </nav>
        <button type="button" class="btn btn-accent btn-md shine" onClick={onStart}>{cta}</button>
      </header>

      {/* hero */}
      <section class="lp-hero">
        <div class="lp-hero-art" ref={heroA}>
          <div class="lp-halo" />
          <div class="lp-fallback-art"><Dish r={HOUSE[0]} /></div>
        </div>
        <div class="lp-hero-copy">
          <p class="lp-kicker"><span class="pulse" aria-hidden="true" />High-protein meals from the fridge you already have</p>
          <h1 class="lp-h1">
            Open your fridge. <em>Dinner’s already in there.</em>
          </h1>
          <p class="lp-lede">Snap a photo. Kitchen AI spots what you have and builds three high-protein meals that fit your day, then walks you through every step.</p>
          <div class="lp-cta">
            <button type="button" class="btn btn-accent btn-lg shine" onClick={onStart}>{cta} <Arrow /></button>
            <button type="button" class="btn btn-outline btn-lg" onClick={() => go('how')}>See how it works</button>
          </div>
          <ul class="lp-pills">
            <li>3 recipes per scan</li>
            <li>Macros from USDA data</li>
            <li>GLP-1 mode</li>
          </ul>
        </div>
        <p class="lp-scroll"><span>Scroll to cook</span><i /></p>
      </section>

      <div class="lp-marquee" aria-hidden="true">
        <div class="lp-marquee-track">
          {[0, 1].map((k) => (
            <span key={k}>
              {MARQUEE.map((m, i) => (
                <Fragment key={m}>
                  <b class={i % 2 ? 'serif' : ''}>{m}</b>
                  <i>✺</i>
                </Fragment>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* 01 how it works: ingredients fall into the bowl */}
      <section class="lp-sec lp-how" id="how">
        <div class="lp-bowl" ref={bowlA}>
          <div class="lp-halo small" />
        </div>
        <div class="lp-how-copy" data-reveal>
          <Eyebrow n="01">How it works</Eyebrow>
          <h2 class="lp-h2">From fridge chaos to <em>dinner, sorted.</em></h2>
          <ol class="lp-steps">
            <li><b>Snap</b><span>Take one photo of your fridge. We shrink it on your phone before it’s sent.</span></li>
            <li><b>Confirm</b><span>Check the list we found. Remove, rename, or add anything in a tap.</span></li>
            <li><b>Cook</b><span>Pick one of three ranked recipes and follow it step by step, timers included.</span></li>
          </ol>
          <div class="lp-stats">
            <div><b>3</b><span>ranked recipes per scan</span></div>
            <div><b>{FOODS.length}</b><span>ingredients in our nutrition table</span></div>
            <div><b>0</b><span>macros guessed by AI</span></div>
            <div><b>165°F</b><span>safe temps checked for you</span></div>
          </div>
        </div>
      </section>

      {/* 02 what's cooking */}
      <section class="lp-sec lp-dishes" id="dishes">
        <div class="lp-dishes-copy" data-reveal>
          <Eyebrow n="02">What’s cooking</Eyebrow>
          <p class="lp-count num">{String(slide + 1).padStart(2, '0')} / {String(HOUSE.length).padStart(2, '0')}</p>
          <h2 class="lp-h2">{dish.title.split(' ').slice(0, -2).join(' ')} <em>{dish.title.split(' ').slice(-2).join(' ')}</em></h2>
          <p class="lp-lede">{dish.blurb} {dish.summary}</p>
          <p class="lp-dish-meta num">
            <b>{dish.macros.protein_g}g</b> protein · {dish.macros.kcal} kcal · {minutesLabel(dish.minutes)}
          </p>
          <div class="lp-dots" role="tablist" aria-label="Sample recipes">
            {HOUSE.map((r, i) => (
              <button type="button" key={r.id} role="tab" aria-selected={i === slide} aria-label={r.title} class={i === slide ? 'on' : ''} onClick={() => setSlide(i)} />
            ))}
          </div>
        </div>
        <div class="lp-card-wrap" key={dish.id}>
          <MacroCard r={dish} showFit={false} />
        </div>
      </section>

      {/* 03 import */}
      <section class="lp-sec lp-split" id="import">
        <div data-reveal>
          <Eyebrow n="03">Import</Eyebrow>
          <h2 class="lp-h2">Saw it on your feed? <em>Cook it tonight.</em></h2>
          <p class="lp-lede">Paste a recipe from anywhere: a video caption, a transcript, a blog post. You get a clean walkthrough with real macros, timers and safe temperatures. The original creator always gets the credit.</p>
          <button type="button" class="btn btn-primary btn-lg" onClick={onStart}>Import a recipe <Arrow /></button>
        </div>
        <div class="lp-mock" data-reveal aria-hidden="true">
          <div class="lp-mock-link"><span class="lp-play" />tiktok.com/@creator/video/…</div>
          <div class="lp-mock-arrow">↓</div>
          <div class="lp-mock-steps">
            <p class="overline accent">Step 2 of 4</p>
            <p class="lp-mock-text">Sear the chicken until golden on both sides.</p>
            <div class="lp-mock-timer"><b class="num">8:00</b><span>Tap to start</span></div>
            <p class="caption faint">Recipe by @creator · rewritten in our own words</p>
          </div>
        </div>
      </section>

      {/* 04 community */}
      <section class="lp-sec lp-community" id="community">
        <div class="lp-community-head" data-reveal>
          <Eyebrow n="04">Community</Eyebrow>
          <h2 class="lp-h2">Cook it. Post it. <em>Get followed.</em></h2>
          <p class="lp-lede">Share what you made, save what other people cooked, and follow the cooks whose food you’d actually eat.</p>
        </div>
        <div class="lp-feed" data-reveal>
          {HOUSE.slice(1, 4).map((r, i) => (
            <article class="lp-post" key={r.id} style={{ '--tilt': `${(i - 1) * 2.2}deg` } as never}>
              <div class="lp-post-art"><Dish r={r} animated={false} /></div>
              <p class="lp-post-by"><span class="avatar" aria-hidden="true">K</span>@testkitchen</p>
              <p class="lp-post-title">{r.title}</p>
              <p class="lp-post-meta num"><b>{r.macros.protein_g}g</b> protein · {r.macros.kcal} kcal</p>
            </article>
          ))}
        </div>
      </section>

      {/* 05 cook mode, in the dark */}
      <section class="lp-night">
        <div class="lp-night-inner">
          <div data-reveal>
            <Eyebrow n="05">Cook mode</Eyebrow>
            <h2 class="lp-h2">Hands messy? <em>We’ve got the screen.</em></h2>
            <p class="lp-lede">One step at a time in big text. Swipe to move on, tap to start a timer, and the screen stays awake while you cook.</p>
          </div>
          <div class="lp-phone" data-reveal aria-hidden="true">
            <p class="overline accent">Step 3</p>
            <p class="lp-phone-text">Cook the salmon skin-side down, then flip. Cook fish to 145°F (63°C).</p>
            <div class="lp-phone-timer"><b class="num">7:42</b><span>Tap to pause</span></div>
          </div>
        </div>
      </section>

      {/* 06 trust */}
      <section class="lp-sec lp-trust">
        <div data-reveal>
          <Eyebrow n="06">The careful part</Eyebrow>
          <h2 class="lp-h2">Nerdy about <em>the numbers.</em></h2>
        </div>
        <div class="lp-trust-grid" data-reveal>
          <div><b>Real macros</b><p>The AI only picks ingredients and grams. Protein and calories are calculated from USDA nutrition data.</p></div>
          <div><b>Allergies double-checked</b><p>Every recipe is checked against your allergies and diet by our own code, not just the AI.</p></div>
          <div><b>Safe temperatures</b><p>Chicken, beef, fish and eggs always come with the right internal temperature.</p></div>
        </div>
        <p class="caption faint lp-note">{GLP1_NOTE} Kitchen AI gives food ideas and nutrition estimates, not medical advice.</p>
      </section>

      {/* finale: shake the fridge */}
      <section class="lp-finale" ref={floorA}>
        <p class="lp-kicker center"><span class="pulse" aria-hidden="true" />Free to try on your Claude account</p>
        <h2 class="lp-h1 center">Come <em>cook with us.</em></h2>
        <div class="lp-cta center">
          <button type="button" class="btn btn-accent btn-lg shine" onClick={onStart}>{cta} <Arrow /></button>
          <button type="button" class="btn btn-outline btn-lg" onClick={() => scene.current?.shake()}>Shake the fridge</button>
        </div>
        <p class="lp-wordmark" aria-hidden="true">Kitchen AI</p>
      </section>
    </div>
  );
}
