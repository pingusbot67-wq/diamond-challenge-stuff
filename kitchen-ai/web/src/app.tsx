import { Fragment, h, render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ALLERGY_OPTIONS, DIET_OPTIONS, GLP1_NOTE, clock, grams, minutesLabel } from '../../src/lib/format.ts';
import { ftInToCm, kgToLb, lbToKg, suggestTargets } from '../../src/lib/targets.ts';
import { FOOD_NAMES, MODEL_LABEL, aiMessage, canSendImages, getSample, makeRecipes, scanFridge, shrinkPhoto, type ScanItem, type ScanResult } from './ai.ts';
import { Banner, Btn, Chip, Dish, Empty, Field, Loading, MacroCard, TodayBars, saveCard } from './ui.tsx';
import { Landing } from './landing.tsx';
import { Feed, ImportScreen, PublishPanel } from './social.tsx';
import { conflictsFor, wipeCommunity } from './community.ts';
import { mountScene } from './scene3d.ts';
import { dayKey, openStore, type Goal, type Meal, type Recipe, type Store, type WebProfile } from './runtime.ts';

void Fragment;

// ───────────────────────── onboarding / edit profile ─────────────────────────
const GOALS: { id: Goal; title: string; body: string }[] = [
  { id: 'cut', title: 'Lose fat', body: 'Calorie deficit, high protein to keep muscle.' },
  { id: 'maintain', title: 'Maintain', body: 'Stay where you are, eat well.' },
  { id: 'bulk', title: 'Build muscle', body: 'Small surplus, lots of protein.' },
  { id: 'glp1', title: 'GLP-1 mode', body: 'Smaller, protein-dense meals that are easy to eat.' },
];
const STEPS = ['Goal', 'About you', 'Targets', 'Diet', 'Cooking'];
const n = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};

function ProfileForm({ initial, onSave, onCancel }: { initial: WebProfile | null; onSave: (p: WebProfile) => Promise<void>; onCancel?: () => void }) {
  const [step, setStep] = useState(0);
  const [units, setUnits] = useState<'us' | 'metric'>(initial?.units ?? 'us');
  const [goal, setGoal] = useState<Goal | null>(initial?.goal ?? null);
  const [sex, setSex] = useState<WebProfile['sex'] | null>(initial?.sex ?? null);
  const [age, setAge] = useState(initial ? String(initial.age) : '');
  const hIn = initial ? Math.round(initial.height_cm / 2.54) : NaN;
  const [cm, setCm] = useState(initial ? String(Math.round(initial.height_cm)) : '');
  const [ft, setFt] = useState(initial ? String(Math.floor(hIn / 12)) : '');
  const [inch, setInch] = useState(initial ? String(hIn % 12) : '');
  const [weight, setWeight] = useState(initial ? String(Math.round(initial.units === 'metric' ? initial.weight_kg : kgToLb(initial.weight_kg))) : '');
  const [activity, setActivity] = useState<WebProfile['activity']>(initial?.activity ?? 'moderate');
  const [protein, setProtein] = useState(initial ? String(initial.protein_target_g) : '');
  const [calories, setCalories] = useState(initial ? String(initial.calorie_target) : '');
  const [suggested, setSuggested] = useState<{ protein: number; calories: number } | null>(null);
  const [diet, setDiet] = useState<string[]>(initial?.diet ?? []);
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [skill, setSkill] = useState<WebProfile['skill']>(initial?.skill ?? 'beginner');
  const [minutes, setMinutes] = useState(initial?.max_minutes ?? 30);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const body = useMemo(
    () => ({
      heightCm: units === 'us' ? ftInToCm(n(ft), n(inch) || 0) : n(cm),
      weightKg: units === 'us' ? lbToKg(n(weight)) : n(weight),
      age: n(age),
    }),
    [units, ft, inch, cm, weight, age],
  );

  function switchUnits(u: 'us' | 'metric') {
    if (u === units) return;
    if (Number.isFinite(body.weightKg)) setWeight(String(Math.round(u === 'us' ? kgToLb(body.weightKg) : body.weightKg)));
    if (Number.isFinite(body.heightCm)) {
      setCm(String(Math.round(body.heightCm)));
      const t = Math.round(body.heightCm / 2.54);
      setFt(String(Math.floor(t / 12)));
      setInch(String(t % 12));
    }
    setUnits(u);
  }

  function next() {
    setError(null);
    if (step === 0 && !goal) return setError('Pick a goal to continue.');
    if (step === 1) {
      if (!sex) return setError('Please choose an option for sex. It’s only used in the calorie formula.');
      if (!(body.age >= 13 && body.age <= 100)) return setError('Please enter an age between 13 and 100.');
      if (!(body.heightCm >= 100 && body.heightCm <= 250)) return setError('Please check your height.');
      if (!(body.weightKg >= 30 && body.weightKg <= 350)) return setError('Please check your weight.');
      const t = suggestTargets({ sex, age: body.age, heightCm: body.heightCm, weightKg: body.weightKg, activity, goal: goal! });
      if (!initial || !protein) setProtein(String(t.protein));
      if (!initial || !calories) setCalories(String(t.calories));
      setSuggested(t);
    }
    if (step === 2) {
      if (!(n(protein) >= 20 && n(protein) <= 400)) return setError('Protein should be between 20 and 400 g.');
      if (!(n(calories) >= 800 && n(calories) <= 6000)) return setError('Calories should be between 800 and 6,000.');
    }
    setStep((s) => s + 1);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        goal: goal!,
        sex: sex!,
        age: Math.round(body.age),
        height_cm: Math.round(body.heightCm * 10) / 10,
        weight_kg: Math.round(body.weightKg * 10) / 10,
        activity,
        protein_target_g: Math.round(n(protein)),
        calorie_target: Math.round(n(calories)),
        diet,
        allergies,
        skill,
        max_minutes: minutes,
        units,
        scan_model: initial?.scan_model ?? 'claude-haiku-5-5',
      });
    } catch {
      setError('Couldn’t save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const last = step === STEPS.length - 1;

  return (
    <div class="screen">
      <div class="content stack-xl">
        <div class="steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => <span key={s} class={i <= step ? 'on' : ''} />)}
        </div>
        <div class="stack-xl fade" key={step}>
          {step === 0 && (
            <>
              <h1 class="h-title">What’s your goal?</h1>
              <div class="stack-md">
                {GOALS.map((g) => (
                  <button type="button" key={g.id} class={`goal${goal === g.id ? ' on' : ''}`} aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>
                    <span class="h-heading">{g.title}</span>
                    <span class="soft">{g.body}</span>
                  </button>
                ))}
              </div>
              {goal === 'glp1' ? <Banner>{GLP1_NOTE}</Banner> : null}
            </>
          )}
          {step === 1 && (
            <>
              <h1 class="h-title">About you</h1>
              <p class="soft">Used only to suggest starting targets. You can change them next.</p>
              <div class="chips">
                <Chip label="US units" on={units === 'us'} onClick={() => switchUnits('us')} />
                <Chip label="Metric" on={units === 'metric'} onClick={() => switchUnits('metric')} />
              </div>
              <div class="stack-sm">
                <span class="field-label">Sex</span>
                <div class="chips">
                  <Chip label="Male" on={sex === 'male'} onClick={() => setSex('male')} />
                  <Chip label="Female" on={sex === 'female'} onClick={() => setSex('female')} />
                  <Chip label="Prefer not to say" on={sex === 'other'} onClick={() => setSex('other')} />
                </div>
              </div>
              <Field id="age" label="Age" value={age} onInput={setAge} suffix="years" placeholder="30" inputMode="numeric" />
              {units === 'us' ? (
                <div class="row-2">
                  <Field id="ft" label="Height" value={ft} onInput={setFt} suffix="ft" placeholder="5" inputMode="numeric" />
                  <Field id="in" label="&nbsp;" value={inch} onInput={setInch} suffix="in" placeholder="10" inputMode="numeric" />
                </div>
              ) : (
                <Field id="cm" label="Height" value={cm} onInput={setCm} suffix="cm" placeholder="178" inputMode="numeric" />
              )}
              <Field id="weight" label="Weight" value={weight} onInput={setWeight} suffix={units === 'us' ? 'lb' : 'kg'} placeholder={units === 'us' ? '180' : '82'} inputMode="decimal" />
              <div class="stack-sm">
                <span class="field-label">How active are you?</span>
                <div class="chips">
                  <Chip label="Lightly" on={activity === 'low'} onClick={() => setActivity('low')} />
                  <Chip label="3–4 workouts a week" on={activity === 'moderate'} onClick={() => setActivity('moderate')} />
                  <Chip label="Very" on={activity === 'high'} onClick={() => setActivity('high')} />
                </div>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h1 class="h-title">Your daily targets</h1>
              <p class="soft">{suggested ? `We suggest ${suggested.protein} g protein and ${suggested.calories} kcal. ` : ''}Edit them to match your plan.</p>
              <div class="card card-accent stack-lg">
                <Field id="protein" label="Protein" value={protein} onInput={setProtein} suffix="g / day" inputMode="numeric" />
                <Field id="calories" label="Calories" value={calories} onInput={setCalories} suffix="kcal / day" inputMode="numeric" />
              </div>
              {goal === 'glp1' ? <Banner>{GLP1_NOTE}</Banner> : null}
              <p class="caption faint">Estimates only, not medical or dietary advice.</p>
            </>
          )}
          {step === 3 && (
            <>
              <h1 class="h-title">Diet & allergies</h1>
              <div class="stack-sm">
                <span class="field-label">Diet</span>
                <div class="chips">{DIET_OPTIONS.map(([id, l]) => <Chip key={id} label={l} on={diet.includes(id)} onClick={() => toggle(diet, setDiet, id)} />)}</div>
              </div>
              <div class="stack-sm">
                <span class="field-label">Allergies</span>
                <div class="chips">{ALLERGY_OPTIONS.map(([id, l]) => <Chip key={id} label={l} on={allergies.includes(id)} onClick={() => toggle(allergies, setAllergies, id)} />)}</div>
              </div>
              <Banner tone="warn">We double-check every recipe against these, but always read labels yourself if you have a serious allergy.</Banner>
            </>
          )}
          {step === 4 && (
            <>
              <h1 class="h-title">How do you cook?</h1>
              <div class="stack-sm">
                <span class="field-label">Skill</span>
                <div class="chips">
                  <Chip label="Beginner" on={skill === 'beginner'} onClick={() => setSkill('beginner')} />
                  <Chip label="Comfortable" on={skill === 'intermediate'} onClick={() => setSkill('intermediate')} />
                  <Chip label="Confident" on={skill === 'advanced'} onClick={() => setSkill('advanced')} />
                </div>
              </div>
              <div class="stack-sm">
                <span class="field-label">Time per meal</span>
                <div class="chips">{[10, 20, 30, 45, 60].map((m) => <Chip key={m} label={m === 60 ? '60+ min' : `${m} min`} on={minutes === m} onClick={() => setMinutes(m)} />)}</div>
              </div>
            </>
          )}
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </div>
      </div>
      <div class="footer-bar">
        {step > 0 ? <Btn kind="secondary" onClick={() => setStep(step - 1)}>Back</Btn> : onCancel ? <Btn kind="secondary" onClick={onCancel}>Cancel</Btn> : null}
        <Btn full onClick={last ? save : next} busy={saving}>{last ? (initial ? 'Save' : 'Start cooking') : 'Continue'}</Btn>
      </div>
    </div>
  );
}

// ───────────────────────── home ─────────────────────────
function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

/** A small live 3D scene: produce orbiting a tomato. Drag to spin. Falls back to nothing if 3D is unavailable. */
function Orbit3D({ cls = '' }: { cls?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const scene = mountScene(ref.current, { mode: 'orbit' });
    return () => scene.destroy();
  }, []);
  return <div class={`orbit3d ${cls}`} ref={ref} aria-hidden="true" />;
}

function Home({ p, eaten, aiOk, imagesOk, onPhoto, onType, onImport }: { p: WebProfile; eaten: { kcal: number; protein_g: number }; aiOk: boolean | null; imagesOk: boolean; onPhoto: (f: File) => void; onType: () => void; onImport: () => void }) {
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const hero = useRef<HTMLElement>(null);
  const pick = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) onPhoto(f);
  };
  // a soft light inside the card follows your finger
  const light = (e: PointerEvent) => {
    const el = hero.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--lx', `${e.clientX - r.left}px`);
    el.style.setProperty('--ly', `${e.clientY - r.top}px`);
  };
  return (
    <div class="content stack-xl">
      <header class="home-head">
        <span class="brand"><span class="brand-dot" aria-hidden="true" />Kitchen <em>AI</em></span>
        <span class="caption faint">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </header>
      <h1 class="h-display">{greeting()}, <em>chef.</em></h1>
      <section aria-label="Today">
        <TodayBars eaten={eaten} p={p} />
      </section>
      <section class="hero" ref={hero} onPointerMove={light}>
        <Orbit3D cls="hero-3d" />
        <div class="hero-copy">
          <h2 class="h-title hero-title">What can I <em>cook?</em></h2>
          <p class="hero-soft">Snap your fridge. Get 3 high-protein meals that fit what’s left today.</p>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <input ref={lib} type="file" accept="image/*" hidden onChange={pick} />
        <div class="stack-sm hero-actions">
          <Btn kind="accent" full disabled={!imagesOk} onClick={() => cam.current?.click()}>Take a photo</Btn>
          <div class="row-2">
            <Btn kind="secondary" size="md" disabled={!imagesOk} onClick={() => lib.current?.click()}>Upload</Btn>
            <Btn kind="secondary" size="md" onClick={onType}>Type it in</Btn>
          </div>
        </div>
      </section>
      <button type="button" class="import-card" onClick={onImport}>
        <span class="import-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
        </span>
        <span class="import-text">
          <span class="body-strong">Saw a recipe online?</span>
          <span class="caption soft">Paste it in and get a full walkthrough with macros.</span>
        </span>
        <span class="chev faint" aria-hidden="true">›</span>
      </button>
      {aiOk === false ? <Banner tone="warn">AI features work when this page is open on claude.ai while you’re signed in. You can still browse the feed and cook saved recipes.</Banner> : null}
      {aiOk && !imagesOk ? <Banner tone="warn">Photo scanning isn’t available in this view. Type your ingredients instead.</Banner> : null}
      {p.goal === 'glp1' ? <Banner>{GLP1_NOTE}</Banner> : null}
    </div>
  );
}

// ───────────────────────── confirm ingredients ─────────────────────────
type Flow = {
  photoUrl: string | null;
  photo: Blob | null;
  phase: 'idle' | 'scanning' | 'ready' | 'error' | 'not_food';
  error: string | null;
  scan: ScanResult | null;
  compare: { phase: 'running' | 'done' | 'error'; result?: ScanResult; error?: string } | null;
  items: ScanItem[];
  recipes: Recipe[];
  rejected: number;
  target: { kcal: number; protein_g: number } | null;
  generating: boolean;
  genError: string | null;
};
export const EMPTY_FLOW: Flow = { photoUrl: null, photo: null, phase: 'idle', error: null, scan: null, compare: null, items: [], recipes: [], rejected: 0, target: null, generating: false, genError: null };
const QUICK_ADD = ['egg', 'chicken breast', 'greek yogurt nonfat', 'cottage cheese 2%', 'canned tuna', 'ground turkey', 'white rice', 'spinach', 'tofu firm', 'black beans'];

function Confirm({ flow, setItems, onRescan, onCompare, onGenerate }: { flow: Flow; setItems: (i: ScanItem[]) => void; onRescan: () => void; onCompare: () => void; onGenerate: () => void }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const items = flow.items;

  const suggestions = useMemo(() => {
    const t = q.trim().toLowerCase();
    const have = new Set(items.map((i) => i.name.toLowerCase()));
    if (!t) return QUICK_ADD.filter((x) => !have.has(x)).slice(0, 6);
    const starts = FOOD_NAMES.filter((x) => x.toLowerCase().startsWith(t));
    const contains = FOOD_NAMES.filter((x) => !x.toLowerCase().startsWith(t) && x.toLowerCase().includes(t));
    return [...starts, ...contains].filter((x) => !have.has(x.toLowerCase())).slice(0, 6);
  }, [q, items]);

  const add = (name: string) => {
    const v = name.trim().slice(0, 60);
    if (v && !items.some((i) => i.name.toLowerCase() === v.toLowerCase())) setItems([{ name: v, amount: null, confidence: 'high' }, ...items]);
    setQ('');
  };
  const saveEdit = () => {
    if (editing === null) return;
    const v = editText.trim();
    setItems(v ? items.map((it, i) => (i === editing ? { ...it, name: v, confidence: 'high' } : it)) : items.filter((_, i) => i !== editing));
    setEditing(null);
  };

  if (flow.phase === 'scanning') {
    return (
      <div class="content stack-lg">
        {flow.photoUrl ? (
          <div class="scan-photo">
            <img class="photo" src={flow.photoUrl} alt="Your fridge photo" />
            <span class="scan-line" aria-hidden="true" />
          </div>
        ) : null}
        <Loading title="Looking in your fridge…" sub="Usually takes a few seconds." />
      </div>
    );
  }
  if (flow.generating)
    return (
      <div class="content">
        <Orbit3D cls="loader-3d" />
        <Loading title="Building your recipes…" sub="Picking meals that fit your macros, then checking nutrition, allergies and food safety." />
      </div>
    );

  const scanned = !!flow.scan && flow.phase === 'ready';
  const cmp = flow.compare;
  const mine = new Set(items.map((i) => i.name));
  return (
    <>
      <div class="content stack-xl">
        {flow.phase === 'error' ? (
          <div class="stack-md">
            <Banner tone="danger">{flow.error}</Banner>
            <div class="row-2">
              <Btn kind="secondary" size="md" onClick={onRescan}>Try the scan again</Btn>
            </div>
          </div>
        ) : null}
        {flow.phase === 'not_food' ? <Banner tone="warn">That doesn’t look like a fridge or food. Try another photo, or add ingredients below.</Banner> : null}

        <div class="stack-sm">
          <h1 class="h-title">{scanned ? 'Here’s what we see' : 'What do you have?'}</h1>
          <p class="soft">{scanned ? 'Tap an item to fix it, or × to remove it. Crowded fridges hide things, so add anything we missed.' : 'Add the ingredients you want to cook with.'}</p>
        </div>

        <form class="stack-sm" onSubmit={(e) => (e.preventDefault(), add(q))}>
          <label class="field-box add-box" for="add">
            <span class="add-plus" aria-hidden="true">+</span>
            <input id="add" value={q} placeholder="Add an ingredient…" autoComplete="off" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          </label>
          <div class="chips">{suggestions.map((s) => <Chip key={s} label={s} plus onClick={() => add(s)} />)}</div>
        </form>

        {items.length === 0 ? (
          <Empty icon="🥚" title="No ingredients yet" body="Type above or tap a suggestion to add one." />
        ) : (
          <ul class="items">
            {items.map((it, i) => (
              <li key={`${it.name}-${i}`} class="item">
                {editing === i ? (
                  <input class="item-edit" value={editText} autoFocus onInput={(e) => setEditText((e.target as HTMLInputElement).value)} onBlur={saveEdit} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} aria-label="Edit ingredient" />
                ) : (
                  <button type="button" class="item-name" onClick={() => (setEditing(i), setEditText(it.name))}>
                    <span class="body-strong">{it.name}</span>
                    {it.amount || it.confidence === 'low' ? (
                      <span class={`caption ${it.confidence === 'low' ? 'warn-text' : 'faint'}`}>{[it.amount, it.confidence === 'low' ? 'not sure, tap to fix' : null].filter(Boolean).join(' · ')}</span>
                    ) : null}
                  </button>
                )}
                <button type="button" class="item-x" aria-label={`Remove ${it.name}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
              </li>
            ))}
          </ul>
        )}

        {flow.scan ? (
          <section class="card stack-md" aria-label="Model comparison">
            <p class="caption soft">
              Scanned with {MODEL_LABEL[flow.scan.model]} in {flow.scan.seconds.toFixed(1)} s · {flow.scan.items.length} items
              {flow.scan.answeredBy !== flow.scan.model ? ` (answered by ${flow.scan.answeredBy})` : ''}
            </p>
            {!cmp ? (
              <Btn kind="secondary" size="md" onClick={onCompare}>Compare with {flow.scan.model.includes('haiku') ? 'Sonnet' : 'Haiku'}</Btn>
            ) : cmp.phase === 'running' ? (
              <p class="caption soft"><span class="spinner" aria-hidden="true" /> Asking the other model…</p>
            ) : cmp.phase === 'error' ? (
              <Banner tone="danger">{cmp.error}</Banner>
            ) : cmp.result ? (
              <div class="compare">
                {[flow.scan, cmp.result].map((r) => {
                  const other = new Set((r === flow.scan ? cmp.result! : flow.scan!).items.map((x) => x.name));
                  return (
                    <div key={r.model} class="stack-xs">
                      <p class="label">{MODEL_LABEL[r.model]}</p>
                      <p class="caption faint">{r.items.length} items · {r.seconds.toFixed(1)} s</p>
                      <ul class="mini">
                        {r.items.map((x) => (
                          <li key={x.name} class={other.has(x.name) ? '' : 'only'}>{x.name}{mine.has(x.name) ? '' : ' ·'}</li>
                        ))}
                      </ul>
                      {r !== flow.scan ? <Btn kind="ghost" size="md" onClick={() => setItems(r.items)}>Use this list</Btn> : null}
                    </div>
                  );
                })}
                <p class="caption faint compare-key">Highlighted items were found by only one model. Check them against your photo.</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
      <div class="footer-bar column">
        {flow.genError ? <Banner tone="danger">{flow.genError}</Banner> : null}
        <Btn full disabled={!items.length} onClick={onGenerate}>{items.length ? `Make 3 recipes from ${items.length} item${items.length === 1 ? '' : 's'}` : 'Add at least one ingredient'}</Btn>
      </div>
    </>
  );
}

// ───────────────────────── results ─────────────────────────
function Results({ flow, busy, error, onCook, onOpen, onAgain }: { flow: Flow; busy: boolean; error: string | null; onCook: (r: Recipe) => void; onOpen: (r: Recipe) => void; onAgain: () => void }) {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  if (busy) return <div class="content"><Loading title="Finding different ideas…" /></div>;
  return (
    <div class="content stack-xl">
      {flow.target ? (
        <div class="stack-xs">
          <p class="overline faint">Ranked for this meal</p>
          <p class="soft">About <strong class="body-strong">{flow.target.kcal} kcal</strong> and <strong class="body-strong">{flow.target.protein_g} g+ protein</strong></p>
        </div>
      ) : null}
      {flow.recipes.map((r, i) => (
        <div key={r.id} class="stack-md rise" style={{ animationDelay: `${i * 80}ms` }}>
          <MacroCard r={r} rank={i} />
          <div class="row-3">
            <Btn size="md" onClick={() => onCook(r)}>Cook this</Btn>
            <Btn size="md" kind="secondary" onClick={() => onOpen(r)}>Details</Btn>
            <Btn size="md" kind="secondary" onClick={() => saveCard(r, setMsg)}>Save image</Btn>
          </div>
        </div>
      ))}
      {flow.rejected > 0 ? <p class="caption soft center">We removed {flow.rejected} idea{flow.rejected === 1 ? '' : 's'} that didn’t fit your allergies or diet.</p> : null}
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Btn kind="ghost" onClick={onAgain}>Show me different ones</Btn>
      <p class="caption faint center">Macros are calculated from USDA nutrition data, not guessed by AI. “Estimated” means an ingredient wasn’t in our table.</p>
    </div>
  );
}

// ───────────────────────── recipe details ─────────────────────────
function RecipeView({ r, p, saved, onToggleSave, onCook, onAte }: { r: Recipe; p: WebProfile; saved: boolean; onToggleSave: () => Promise<void>; onCook: () => void; onAte: () => Promise<void> }) {
  const [busy, setBusy] = useState<'save' | 'log' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const run = async (k: 'save' | 'log', f: () => Promise<void>, ok?: string) => {
    setBusy(k);
    setMsg(null);
    try {
      await f();
      if (ok) setMsg({ tone: 'ok', text: ok });
    } catch {
      setMsg({ tone: 'danger', text: 'That didn’t save. Check your connection and try again.' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div class="content stack-xl">
      <MacroCard r={r} showFit={false} />
      <div class="row-2-1">
        <Btn onClick={onCook}>Start cooking</Btn>
        <Btn kind="secondary" busy={busy === 'save'} onClick={() => run('save', onToggleSave)}>{saved ? '✓ Saved' : 'Save'}</Btn>
      </div>
      <div class="row-2">
        <Btn kind="secondary" size="md" busy={busy === 'log'} onClick={() => run('log', onAte, `Logged. ${r.macros.protein_g} g protein added to today.`)}>I ate this</Btn>
        <Btn kind="secondary" size="md" onClick={() => saveCard(r, setMsg)}>Save image</Btn>
      </div>
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {r.warnings?.length ? <Banner tone="danger">Heads up: this recipe conflicts with your profile ({r.warnings.join(', ')}). Check the ingredients before you cook it.</Banner> : null}
      {r.credit?.name || r.credit?.url ? (
        <p class="caption soft credit">
          Recipe by {r.credit.name ?? 'the original creator'}, rewritten in our own words.{' '}
          {r.credit.url ? <a href={r.credit.url} target="_blank" rel="noopener noreferrer">See the original</a> : null}
        </p>
      ) : null}
      {r.summary ? <p class="soft">{r.summary}</p> : null}
      <section class="stack-md">
        <h2 class="h-heading">Ingredients{r.servings > 1 ? ` · makes ${r.servings}` : ''}</h2>
        <ul class="ing">
          {r.ingredients.map((ing, i) => (
            <li key={i}>
              <span>
                {ing.name}
                {!ing.matched && ing.kcal > 15 ? <span class="caption warn-text"> estimated</span> : null}
              </span>
              <span class="soft num">{grams(ing.grams, p.units)}</span>
            </li>
          ))}
        </ul>
      </section>
      {r.safety.length ? (
        <section class="card card-accent stack-sm" aria-label="Food safety">
          <p class="label accent-ink icon-row"><Thermo /> Food safety</p>
          {r.safety.map((s) => <p key={s.class} class="caption">{s.text}</p>)}
        </section>
      ) : null}
      <section class="stack-md">
        <h2 class="h-heading">Steps</h2>
        <ol class="steps-list">{r.steps.map((s, i) => <li key={i}>{s.text}</li>)}</ol>
      </section>
      <PublishPanel r={r} />
      {r.glp1_friendly || p.goal === 'glp1' ? <Banner>{GLP1_NOTE}</Banner> : null}
    </div>
  );
}

// ───────────────────────── cook mode ─────────────────────────
type Timer = { endsAt: number | null; left: number; done: boolean };
function Cook({ r, onClose, onLog }: { r: Recipe; onClose: () => void; onLog: () => Promise<void> }) {
  const [page, setPage] = useState(0);
  const [timers, setTimers] = useState<Record<number, Timer>>({});
  const [logged, setLogged] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const touch = useRef<number | null>(null);
  const pages = r.steps.length + 1;

  // keep the screen on while cooking (if the browser allows it)
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    const get = () => nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    get();
    const onVis = () => document.visibilityState === 'visible' && get();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [k, v] of Object.entries(prev)) {
          if (!v.endsAt || v.done) continue;
          const left = Math.max(0, (v.endsAt - Date.now()) / 1000);
          next[+k] = left === 0 ? { endsAt: null, left: 0, done: true } : { ...v, left };
          if (left === 0) {
            try {
              navigator.vibrate?.([300, 150, 300, 150, 300]);
            } catch {
              /* not supported */
            }
          }
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages - 1, p + 1));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages]);

  const go = (i: number) => setPage(Math.max(0, Math.min(pages - 1, i)));
  const toggleTimer = (i: number, secs: number) =>
    setTimers((prev) => {
      const t = prev[i] ?? { endsAt: null, left: secs, done: false };
      if (t.done) return { ...prev, [i]: { endsAt: Date.now() + secs * 1000, left: secs, done: false } };
      if (t.endsAt) return { ...prev, [i]: { ...t, endsAt: null } };
      return { ...prev, [i]: { ...t, endsAt: Date.now() + t.left * 1000 } };
    });

  return (
    <div class="cook">
      <div class="cook-top">
        <button type="button" class="icon-btn" aria-label="Close cook mode" onClick={onClose}>×</button>
        <div class="bar thin"><div class="bar-fill fill-accent" style={{ width: `${((page + 1) / pages) * 100}%` }} /></div>
        <span class="label soft num">{Math.min(page + 1, r.steps.length)}/{r.steps.length}</span>
      </div>
      <div
        class="cook-viewport"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(page + (dx < 0 ? 1 : -1));
        }}
      >
        <div class="cook-track" style={{ transform: `translateX(-${page * 100}%)` }}>
          {r.steps.map((s, i) => {
            const t = timers[i];
            return (
              <section key={i} class="cook-page" aria-hidden={i !== page}>
                <p class="overline accent">Step {i + 1}</p>
                <p class="cook-text">{s.text}</p>
                {/\d{3}°F/.test(s.text) ? <p class="label accent-ink icon-row"><Thermo /> Use a meat thermometer to check</p> : null}
                {s.timer_seconds ? (
                  <button type="button" class={`timer${t?.done ? ' done' : t?.endsAt ? ' running' : ''}`} onClick={() => toggleTimer(i, s.timer_seconds!)} tabIndex={i === page ? 0 : -1}>
                    <span class="timer-num num">{clock(t ? t.left : s.timer_seconds)}</span>
                    <span class="label">{t?.done ? 'Time’s up! Tap to restart' : t?.endsAt ? 'Tap to pause' : t ? 'Tap to resume' : 'Tap to start timer'}</span>
                  </button>
                ) : null}
              </section>
            );
          })}
          <section class="cook-page" aria-hidden={page !== pages - 1}>
            <Dish r={r} cls="done-dish" />
            <p class="h-display">Done. Enjoy!</p>
            <p class="soft">{r.title} · {r.macros.protein_g} g protein · {r.macros.kcal} kcal per serving</p>
            {logged === 'done' ? (
              <Banner tone="ok">Logged to today.</Banner>
            ) : (
              <Btn kind="accent" full busy={logged === 'busy'} onClick={async () => {
                setLogged('busy');
                try {
                  await onLog();
                  setLogged('done');
                } catch {
                  setLogged('error');
                }
              }}>Log this meal</Btn>
            )}
            {logged === 'error' ? <Banner tone="danger">That didn’t save. Try again.</Banner> : null}
            <Btn kind="secondary" full onClick={onClose}>Finish</Btn>
          </section>
        </div>
      </div>
      <div class="footer-bar">
        <Btn kind="secondary" disabled={page === 0} onClick={() => go(page - 1)}>Back</Btn>
        {page < pages - 1 ? <Btn full onClick={() => go(page + 1)}>Next step</Btn> : null}
      </div>
    </div>
  );
}

// ───────────────────────── saved + profile tabs ─────────────────────────
function Saved({ list, onOpen, onScan }: { list: Recipe[]; onOpen: (r: Recipe) => void; onScan: () => void }) {
  return (
    <div class="content stack-lg">
      <div class="page-head"><h1 class="h-display">Saved <em>recipes.</em></h1></div>
      {list.length === 0 ? (
        <Empty icon="📌" title="No saved recipes yet" body="Tap Save on any recipe and it will live here." action={{ label: 'Scan my fridge', onClick: onScan }} />
      ) : (
        <ul class="saved">
          {list.map((r) => (
            <li key={r.id}>
              <button type="button" class="saved-row" onClick={() => onOpen(r)}>
                <Dish r={r} animated={false} cls="dish-thumb" />
                <span class="saved-text">
                  <span class="body-strong">{r.title}</span>
                  <span class="caption soft num">
                    <span class="accent">{r.macros.protein_g}g protein</span> · {r.macros.kcal} kcal · {minutesLabel(r.minutes)}
                  </span>
                </span>
                <span class="faint chev" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const GOAL_LABEL: Record<Goal, string> = { cut: 'Lose fat', maintain: 'Maintain', bulk: 'Build muscle', glp1: 'GLP-1 mode' };
const label = (opts: readonly (readonly [string, string])[], ids: string[]) => ids.map((id) => opts.find(([k]) => k === id)?.[1] ?? id).join(', ') || 'None';

function ProfileTab({ p, storeKind, onEdit, onModel, onWipe, onAbout }: { p: WebProfile; storeKind: Store['kind']; onEdit: () => void; onModel: (m: WebProfile['scan_model']) => void; onWipe: () => Promise<void>; onAbout: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const row = (k: string, v: string) => (
    <div class="kv">
      <span class="soft">{k}</span>
      <span class="body-strong">{v}</span>
    </div>
  );
  return (
    <div class="content stack-xl">
      <div class="page-head"><h1 class="h-display">Your <em>profile.</em></h1></div>
      <section class="card stack-lg">
        {row('Goal', GOAL_LABEL[p.goal])}
        {row('Daily protein', `${p.protein_target_g} g`)}
        {row('Daily calories', `${p.calorie_target} kcal`)}
        {row('Diet', label(DIET_OPTIONS, p.diet))}
        {row('Allergies', label(ALLERGY_OPTIONS, p.allergies))}
        {row('Time per meal', `${p.max_minutes} min`)}
        <Btn size="md" onClick={onEdit}>Edit profile & targets</Btn>
      </section>
      <section class="stack-sm">
        <span class="field-label">Fridge scan model</span>
        <div class="chips">
          <Chip label="Haiku 5.5 (cheaper)" on={p.scan_model === 'claude-haiku-5-5'} onClick={() => onModel('claude-haiku-5-5')} />
          <Chip label="Sonnet 5.5" on={p.scan_model === 'claude-sonnet-5-5'} onClick={() => onModel('claude-sonnet-5-5')} />
        </div>
        <p class="caption faint">Recipes always use Haiku 5.5. AI calls run on your own Claude account.</p>
      </section>
      {p.goal === 'glp1' ? <Banner>{GLP1_NOTE}</Banner> : null}
      <section class="stack-md">
        <p class="caption faint">
          {storeKind === 'cloud' ? 'Your profile, saved recipes and meal log are stored privately for your Claude account. Only you can see them.' : 'Your data is stored in this browser only.'}
        </p>
        {!confirm ? (
          <Btn kind="danger" onClick={() => setConfirm(true)}>Delete my data</Btn>
        ) : (
          <div class="card card-danger stack-md" role="alertdialog" aria-label="Confirm delete">
            <p class="body-strong">Delete your profile, saved recipes and meal history? This can’t be undone.</p>
            <div class="row-2">
              <Btn kind="secondary" size="md" onClick={() => setConfirm(false)}>Cancel</Btn>
              <Btn kind="danger" size="md" busy={busy} onClick={async () => { setBusy(true); await onWipe(); }}>Delete forever</Btn>
            </div>
          </div>
        )}
      </section>
      <Btn kind="ghost" size="md" onClick={onAbout}>See the Kitchen AI intro again</Btn>
      <p class="caption faint center">Kitchen AI gives food ideas and nutrition estimates. It is not medical advice.</p>
    </div>
  );
}

const ICONS = {
  cook: <path d="M12 2c1 3.5-3 5.5-3 9a3 3 0 0 0 6 0c0-1.5-.6-2.6-1.2-3.6C16.5 8.6 18 11 18 14a6 6 0 0 1-12 0c0-5 4-7 6-12z" />,
  saved: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />,
  feed: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3 19c.8-3 3.2-4.6 6-4.6s5.200 1.600 6 4.600" />
      <circle cx="17.5" cy="8" r="2.400" />
      <path d="M17 13.200c2.200.200 3.600 1.600 4.200 3.800" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
};
const Thermo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z" />
  </svg>
);

// ───────────────────────── the app ─────────────────────────
type Screen = { name: 'confirm' } | { name: 'results' } | { name: 'recipe'; r: Recipe } | { name: 'cook'; r: Recipe } | { name: 'edit' } | { name: 'import' } | { name: 'about' };
const TITLES: Record<string, string> = { confirm: 'Confirm ingredients', results: 'Your recipes', recipe: '', edit: '', import: 'Import' };

function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [profile, setProfile] = useState<WebProfile | null | undefined>(undefined);
  const [tab, setTab] = useState<'cook' | 'feed' | 'saved' | 'profile'>('cook');
  const [started, setStarted] = useState(false);
  const [stack, setStack] = useState<Screen[]>([]);
  const [eaten, setEaten] = useState({ kcal: 0, protein_g: 0 });
  const [saved, setSaved] = useState<Recipe[]>([]);
  const [flow, setFlow] = useState<Flow>(EMPTY_FLOW);
  const [aiOk, setAiOk] = useState<boolean | null>(null);
  const [imagesOk, setImagesOk] = useState(false);
  const [againBusy, setAgainBusy] = useState(false);
  const [againErr, setAgainErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  const push = (s: Screen) => {
    setStack((st) => [...st, s]);
    window.scrollTo(0, 0);
  };
  const pop = () => setStack((st) => st.slice(0, -1));
  const top = stack[stack.length - 1];

  const refreshToday = async (s: Store) => {
    const meals = await s.getMeals(dayKey());
    setEaten(meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein_g: a.protein_g + m.protein_g }), { kcal: 0, protein_g: 0 }));
  };

  useEffect(() => {
    getSample().then((s) => setAiOk(!!s));
    canSendImages().then(setImagesOk);
    openStore()
      .then(async (s) => {
        setStore(s);
        const [p, list] = await Promise.all([s.getProfile(), s.listSaved()]);
        setProfile(p);
        setSaved(list);
        await refreshToday(s);
      })
      .catch(() => {
        setLoadErr(true);
        setProfile(null);
      });
  }, []);

  if (profile === undefined || !store) return <Loading title="Kitchen AI" sub="Getting things ready…" />;
  if (!profile && !started) return <Landing onStart={() => (setStarted(true), window.scrollTo(0, 0))} />;
  if (profile && top?.name === 'about') return <Landing returning onStart={() => (pop(), window.scrollTo(0, 0))} />;
  if (!profile || top?.name === 'edit')
    return (
      <ProfileForm
        initial={profile}
        onCancel={profile ? pop : () => setStarted(false)}
        onSave={async (p) => {
          await store.saveProfile(p);
          setProfile(p);
          if (top?.name === 'edit') pop();
        }}
      />
    );

  const remaining = () => ({ kcal: profile.calorie_target - eaten.kcal, protein_g: profile.protein_target_g - eaten.protein_g });

  async function runScan(photo: Blob, url: string | null) {
    setFlow({ ...EMPTY_FLOW, photo, photoUrl: url, phase: 'scanning' });
    try {
      const res = await scanFridge(photo, profile!.scan_model);
      setFlow((f) => ({ ...f, scan: res, items: res.items, phase: res.notFood ? 'not_food' : 'ready' }));
    } catch (e) {
      setFlow((f) => ({ ...f, phase: 'error', error: aiMessage(e) }));
    }
  }

  async function onPhoto(file: File) {
    push({ name: 'confirm' });
    setFlow({ ...EMPTY_FLOW, phase: 'scanning' });
    const { blob, url } = await shrinkPhoto(file);
    runScan(blob, url);
  }

  async function compare() {
    if (!flow.photo || !flow.scan) return;
    const other = flow.scan.model.includes('haiku') ? 'claude-sonnet-5-5' : 'claude-haiku-5-5';
    setFlow((f) => ({ ...f, compare: { phase: 'running' } }));
    try {
      const result = await scanFridge(flow.photo, other);
      setFlow((f) => ({ ...f, compare: { phase: 'done', result } }));
    } catch (e) {
      setFlow((f) => ({ ...f, compare: { phase: 'error', error: aiMessage(e) } }));
    }
  }

  async function generate(fresh: boolean) {
    const ingredients = flow.items.map((i) => i.name);
    if (fresh) {
      setAgainBusy(true);
      setAgainErr(null);
    } else setFlow((f) => ({ ...f, generating: true, genError: null }));
    try {
      const out = await makeRecipes(ingredients, profile!, remaining(), fresh);
      setFlow((f) => ({ ...f, recipes: out.recipes, rejected: out.rejected, target: out.target, generating: false }));
      if (!fresh) push({ name: 'results' });
    } catch (e) {
      if (fresh) setAgainErr(aiMessage(e));
      else setFlow((f) => ({ ...f, generating: false, genError: aiMessage(e) }));
    } finally {
      setAgainBusy(false);
    }
  }

  const isSaved = (r: Recipe) => saved.some((x) => x.id === r.id);
  const toggleSave = async (r: Recipe) => {
    const on = !isSaved(r);
    await store.setSaved(r, on);
    setSaved((list) => (on ? [r, ...list] : list.filter((x) => x.id !== r.id)));
  };
  const logMeal = async (r: Recipe) => {
    const m: Meal = { recipe_id: r.id, title: r.title, kcal: r.macros.kcal, protein_g: r.macros.protein_g, carbs_g: r.macros.carbs_g, fat_g: r.macros.fat_g, at: Date.now() };
    await store.addMeal(dayKey(), m);
    await refreshToday(store);
  };

  // recipes from other people get checked against YOUR allergies and diet before you open them
  const withWarnings = (r: Recipe): Recipe => {
    const w = conflictsFor(r, profile.allergies, profile.diet);
    return w.length ? { ...r, warnings: w } : r;
  };

  if (top?.name === 'cook') return <Cook r={top.r} onClose={pop} onLog={() => logMeal(top.r)} />;

  let body: preact.ComponentChildren;
  if (top?.name === 'confirm')
    body = <Confirm flow={flow} setItems={(items) => setFlow((f) => ({ ...f, items }))} onRescan={() => flow.photo && runScan(flow.photo, flow.photoUrl)} onCompare={compare} onGenerate={() => generate(false)} />;
  else if (top?.name === 'results')
    body = <Results flow={flow} busy={againBusy} error={againErr} onCook={(r) => push({ name: 'cook', r })} onOpen={(r) => push({ name: 'recipe', r })} onAgain={() => generate(true)} />;
  else if (top?.name === 'recipe')
    body = <RecipeView r={top.r} p={profile} saved={isSaved(top.r)} onToggleSave={() => toggleSave(top.r)} onCook={() => push({ name: 'cook', r: top.r })} onAte={() => logMeal(top.r)} />;
  else if (top?.name === 'import')
    body = <ImportScreen p={profile} aiOk={aiOk} onDone={(r) => setStack((st) => [...st.slice(0, -1), { name: 'recipe', r }])} />;
  else if (tab === 'feed')
    body = (
      <Feed
        savedIds={new Set(saved.map((x) => x.id))}
        onOpen={(r) => push({ name: 'recipe', r: withWarnings(r) })}
        onCook={(r) => push({ name: 'cook', r })}
        onToggleSave={toggleSave}
      />
    );
  else if (tab === 'saved') body = <Saved list={saved} onOpen={(r) => push({ name: 'recipe', r })} onScan={() => setTab('cook')} />;
  else if (tab === 'profile')
    body = (
      <ProfileTab
        p={profile}
        storeKind={store.kind}
        onEdit={() => push({ name: 'edit' })}
        onAbout={() => push({ name: 'about' })}
        onModel={async (m) => {
          const p = { ...profile, scan_model: m };
          setProfile(p);
          await store.saveProfile(p).catch(() => {});
        }}
        onWipe={async () => {
          await Promise.all([store.wipe().catch(() => {}), wipeCommunity().catch(() => {})]);
          setStarted(false);
          setSaved([]);
          setEaten({ kcal: 0, protein_g: 0 });
          setFlow(EMPTY_FLOW);
          setStack([]);
          setTab('cook');
          setProfile(null);
        }}
      />
    );
  else
    body = (
      <Home
        p={profile}
        eaten={eaten}
        aiOk={aiOk}
        imagesOk={imagesOk}
        onPhoto={onPhoto}
        onType={() => {
          setFlow(EMPTY_FLOW);
          push({ name: 'confirm' });
        }}
        onImport={() => push({ name: 'import' })}
      />
    );

  return (
    <div class="screen">
      {top ? (
        <header class="topbar">
          <button type="button" class="back" onClick={pop} aria-label="Back">‹ Back</button>
          <span class="label">{TITLES[top.name] ?? ''}</span>
          <span />
        </header>
      ) : null}
      {loadErr ? <div class="content"><Banner tone="warn">Your saved data couldn’t be loaded, so changes are kept in this browser for now.</Banner></div> : null}
      {body}
      {!top ? (
        <nav class="tabbar" aria-label="Main">
          {(['cook', 'feed', 'saved', 'profile'] as const).map((t) => (
            <button type="button" key={t} class={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
              <svg class="tab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">{ICONS[t]}</svg>
              {t === 'cook' ? 'Cook' : t === 'feed' ? 'Community' : t === 'saved' ? 'Saved' : 'Profile'}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
