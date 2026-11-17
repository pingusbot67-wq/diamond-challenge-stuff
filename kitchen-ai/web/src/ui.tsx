// Shared building blocks: buttons, chips, banners, the dish picture, the macro card.
import { Fragment, h } from 'preact';
import { useMemo } from 'preact/hooks';
import { minutesLabel } from '../../src/lib/format.ts';
import { cardImage } from './share.ts';
import { dishSvg } from './dish.ts';
import { downloads, type Recipe, type WebProfile } from './runtime.ts';

void Fragment;

// ───────────────────────── small building blocks ─────────────────────────
export type BtnProps = { children: preact.ComponentChildren; onClick?: () => void; kind?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'; size?: 'lg' | 'md'; busy?: boolean; disabled?: boolean; full?: boolean; label?: string };
export function Btn({ children, onClick, kind = 'primary', size = 'lg', busy, disabled, full, label }: BtnProps) {
  return (
    <button type="button" class={`btn btn-${kind} btn-${size}${full ? ' full' : ''}`} onClick={onClick} disabled={disabled || busy} aria-busy={busy} aria-label={label}>
      {busy ? <span class="spinner" aria-hidden="true" /> : children}
    </button>
  );
}
export const Chip = ({ label, on, onClick, plus }: { label: string; on?: boolean; onClick?: () => void; plus?: boolean }) => (
  <button type="button" class={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
    {label}
    {plus ? <span class="chip-plus">+</span> : null}
  </button>
);
export const Banner = ({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: preact.ComponentChildren }) => (
  <div class={`banner banner-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>
);
export const Loading = ({ title, sub }: { title: string; sub?: string }) => (
  <div class="state">
    <span class="spinner big" aria-hidden="true" />
    <p class="h-heading">{title}</p>
    {sub ? <p class="soft">{sub}</p> : null}
  </div>
);
export const Empty = ({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: { label: string; onClick: () => void } }) => (
  <div class="state">
    <p class="state-icon" aria-hidden="true">{icon}</p>
    <p class="h-heading">{title}</p>
    {body ? <p class="soft">{body}</p> : null}
    {action ? <Btn size="md" onClick={action.onClick}>{action.label}</Btn> : null}
  </div>
);
export function Field({ id, label, value, onInput, suffix, placeholder, inputMode, type = 'text' }: { id: string; label?: string; value: string; onInput: (v: string) => void; suffix?: string; placeholder?: string; inputMode?: 'numeric' | 'decimal' | 'email' | 'text'; type?: string }) {
  return (
    <label class="field" for={id}>
      {label ? <span class="field-label">{label}</span> : null}
      <span class="field-box">
        <input id={id} type={type} value={value} placeholder={placeholder} inputMode={inputMode} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
        {suffix ? <span class="field-suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

// ───────────────────────── the result card ─────────────────────────
export function Dish({ r, animated = true, cls = '' }: { r: Pick<Recipe, 'title' | 'ingredients' | 'steps'>; animated?: boolean; cls?: string }) {
  const svg = useMemo(() => dishSvg(r, { animated }), [r.title, animated]);
  return <div class={`dish ${cls}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function MacroCard({ r, rank, showFit = true }: { r: Recipe; rank?: number; showFit?: boolean }) {
  const a = r.macros_estimated ? '≈' : '';
  return (
    <article class="macro-card">
      <div class="dish-panel">
        <Dish r={r} />
        <div class="badges">
          {rank === 0 && showFit ? <span class="badge badge-accent">Best fit</span> : null}
          {r.glp1_friendly ? <span class="badge">GLP-1 friendly</span> : null}
          {r.macros_estimated ? <span class="badge badge-warn">Estimated</span> : null}
        </div>
      </div>
      <div class="mc-body">
        <h3 class="h-title">{r.title}</h3>
        <p class="hero-num" aria-label={`${r.macros.protein_g} grams of protein`}>
          {a}
          {r.macros.protein_g}
          <span class="hero-unit">g protein</span>
        </p>
        <dl class="mc-stats">
          <div><dt>Calories</dt><dd>{a}{r.macros.kcal}</dd></div>
          <div><dt>Time</dt><dd>{minutesLabel(r.minutes)}</dd></div>
          <div><dt>Carbs</dt><dd>{a}{r.macros.carbs_g}g</dd></div>
          <div><dt>Fat</dt><dd>{a}{r.macros.fat_g}g</dd></div>
        </dl>
        {showFit && r.fit_reason ? (
          <p class="caption soft">
            {typeof r.fit === 'number' ? <span class="fit">{r.fit}% fit</span> : null}
            {r.fit_reason}
            {r.servings > 1 ? ` · per serving, makes ${r.servings}` : ''}
          </p>
        ) : r.servings > 1 ? (
          <p class="caption soft">Per serving · makes {r.servings}</p>
        ) : null}
      </div>
    </article>
  );
}

export function TodayBars({ eaten, p }: { eaten: { kcal: number; protein_g: number }; p: WebProfile }) {
  const col = (label: string, v: number, t: number, unit: string, cls: string) => {
    const left = Math.max(0, Math.round(t - v));
    return (
      <div class="today-col">
        <p class="overline faint">{label} left</p>
        <p class="today-num num">
          {left.toLocaleString()}
          <span class="today-unit">{unit}</span>
        </p>
        <div class="bar thin" role="progressbar" aria-label={`${label} eaten`} aria-valuemin={0} aria-valuemax={t} aria-valuenow={Math.round(v)}>
          <div class={`bar-fill ${cls}`} style={{ width: `${Math.min(100, (v / Math.max(1, t)) * 100)}%` }} />
        </div>
        <p class="caption faint num">of {t.toLocaleString()}{unit}</p>
      </div>
    );
  };
  return (
    <div class="today">
      {col('Protein', eaten.protein_g, p.protein_target_g, 'g', 'fill-accent')}
      {col('Calories', eaten.kcal, p.calorie_target, '', 'fill-ink')}
    </div>
  );
}

export async function saveCard(r: Recipe, setMsg: (m: { tone: 'ok' | 'danger'; text: string } | null) => void) {
  try {
    const dl = await downloads();
    if (!dl) return setMsg({ tone: 'danger', text: 'Saving images isn’t available here. Take a screenshot of the card instead.' });
    const blob = await cardImage(r);
    await dl.save({ filename: `${r.title.replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'recipe'}.png`, data: blob });
    setMsg({ tone: 'ok', text: 'Card saved.' });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'cancelled' || code === 'declined') return;
    setMsg({ tone: 'danger', text: 'The card wasn’t saved. Try again, or take a screenshot.' });
  }
}

