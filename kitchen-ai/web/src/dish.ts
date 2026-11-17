// Draws a small, flat, top-down "bowl" illustration of a dish from its real ingredients.
// No AI call: shapes and colours come from the ingredient names, placement from a seed
// (the recipe title), so the same dish always looks the same.
import type { Recipe } from './runtime.ts';

type Kind =
  | 'slices' | 'crumbs' | 'fillet' | 'eggs' | 'cubes' | 'coins' | 'halves' | 'sticks' | 'wedges'
  | 'dots' | 'beans' | 'florets' | 'leaves' | 'rings' | 'shrimp' | 'scramble';
type Base = 'grains' | 'greens' | 'strands' | 'swirl';
type Look = { kind?: Kind; base?: Base; color: string; accent?: string; garnish?: boolean };

// first match wins, so specific names come before general ones
const LOOKS: [RegExp, Look][] = [
  [/\b(oil|salt|spray|vinegar|broth|stock|water|garlic powder|onion powder|paprika|cumin|chili powder|cinnamon|oregano|seasoning|black pepper|^pepper$|flakes|sugar|cornstarch|flour|baking)\b/, { color: 'skip' }],
  [/\b(soy sauce|tamari|teriyaki|sriracha|hot sauce|bbq|ketchup|mustard|honey|maple|balsamic|salsa|marinara|tomato sauce|pesto)\b/, { kind: 'dots', color: '#9B3B1F', garnish: true }],
  [/\bground (turkey|chicken)\b/, { kind: 'crumbs', color: '#D9A877', accent: '#B07A45' }],
  [/\b(ground (beef|pork|lamb)|mince|minced|meatball|sausage|chorizo)\b/, { kind: 'crumbs', color: '#8A4F35', accent: '#5E2F1E' }],
  [/\b(chicken|turkey|duck)\b/, { kind: 'slices', color: '#E9B97E', accent: '#B9773A' }],
  [/\b(steak|beef|sirloin|flank|ribeye|chuck|lamb|pork|ham|bacon|prosciutto|jerky|roast beef)\b/, { kind: 'slices', color: '#93533A', accent: '#5C2E1E' }],
  [/\b(salmon|lox|trout)\b/, { kind: 'fillet', color: '#F2906F', accent: '#FFD5C4' }],
  [/\b(shrimp|prawns?|scallops?)\b/, { kind: 'shrimp', color: '#F5A27E', accent: '#FFE1D2' }],
  [/\b(tuna|cod|tilapia|halibut|haddock|pollock|white ?fish|fish|sardines?)\b/, { kind: 'fillet', color: '#EDE3D6', accent: '#FFFFFF' }],
  [/\begg whites?\b/, { kind: 'scramble', color: '#FBF7EC', accent: '#F3E7C9' }],
  [/\b(scrambled|omelet|omelette|frittata)\b/, { kind: 'scramble', color: '#F7D774', accent: '#EFC24A' }],
  [/\beggs?\b/, { kind: 'eggs', color: '#FFFDF8', accent: '#F5B13A' }],
  [/\b(tofu|tempeh|paneer|halloumi|seitan)\b/, { kind: 'cubes', color: '#F1E6CF', accent: '#DCC9A3' }],
  [/\b(feta|cottage cheese|ricotta|goat cheese)\b/, { kind: 'crumbs', color: '#FBF8EF', accent: '#E8DFCB' }],
  [/\b(cheddar|mozzarella|parmesan|cheese|swiss)\b/, { kind: 'crumbs', color: '#F6CD55', accent: '#E3AE2B', garnish: true }],
  [/\b(greek yogurt|yogurt|yoghurt|skyr|kefir|quark|sour cream|cream cheese)\b/, { base: 'swirl', color: '#FBFAF6', accent: '#ECE7DC' }],
  [/\b(oats|oatmeal|porridge)\b/, { base: 'grains', color: '#E9DCC0', accent: '#D4C29C' }],
  [/\b(rice|quinoa|couscous|bulgur|farro|barley|cauliflower rice)\b/, { base: 'grains', color: '#FFFDF5', accent: '#EDE6D3' }],
  [/\b(pasta|spaghetti|penne|noodles?|macaroni|rotini|udon|ramen)\b/, { base: 'strands', color: '#F1D488', accent: '#DDB75A' }],
  [/\b(spinach|kale|lettuce|romaine|arugula|greens|spring mix|cabbage|chard)\b/, { base: 'greens', kind: 'leaves', color: '#5E9E4C', accent: '#7DBA62' }],
  [/\b(basil|cilantro|parsley|mint|dill|herbs?|scallions?|green onions?|chives)\b/, { kind: 'dots', color: '#4F9A45', garnish: true }],
  [/\b(broccoli|brussels)\b/, { kind: 'florets', color: '#4F8C3B', accent: '#7DB35E' }],
  [/\bsweet potato|butternut|squash|pumpkin\b/, { kind: 'cubes', color: '#F2A04A', accent: '#D98227' }],
  [/\bpotato(es)?\b/, { kind: 'cubes', color: '#EBCB7E', accent: '#C9A453' }],
  [/\bcarrots?\b/, { kind: 'coins', color: '#F28A2E', accent: '#F9B36B' }],
  [/\b(cucumbers?|zucchini|courgette)\b/, { kind: 'coins', color: '#A9D17A', accent: '#E7F2D3' }],
  [/\b(tomato(es)?|cherry tomatoes)\b/, { kind: 'halves', color: '#E54B3C', accent: '#F7A08F' }],
  [/\b(bell peppers?|red pepper|peppers|jalapenos?)\b/, { kind: 'sticks', color: '#E4543A', accent: '#F28B6F' }],
  [/\b(avocados?)\b/, { kind: 'wedges', color: '#B9D774', accent: '#5E8A2E' }],
  [/\b(mushrooms?)\b/, { kind: 'halves', color: '#C7A88A', accent: '#E8D8C6' }],
  [/\b(onions?|shallots?)\b/, { kind: 'rings', color: '#D9C2E3' }],
  [/\b(corn)\b/, { kind: 'dots', color: '#F6CB3F' }],
  [/\b(peas|edamame)\b/, { kind: 'dots', color: '#79B848' }],
  [/\b(black beans?)\b/, { kind: 'beans', color: '#3A2F34' }],
  [/\b(kidney beans?)\b/, { kind: 'beans', color: '#8E2F2C' }],
  [/\b(chickpeas?|garbanzo|white beans?|cannellini|navy beans?|pinto beans?)\b/, { kind: 'beans', color: '#E3C38E' }],
  [/\b(lentils?)\b/, { kind: 'dots', color: '#B5653A' }],
  [/\b(blueberr(y|ies)|berries)\b/, { kind: 'dots', color: '#4D5AA6' }],
  [/\b(strawberr(y|ies)|raspberr(y|ies)|cherr(y|ies))\b/, { kind: 'halves', color: '#E2434B', accent: '#F59AA0' }],
  [/\b(bananas?)\b/, { kind: 'coins', color: '#F7E6A6', accent: '#FFF6D6' }],
  [/\b(apples?|pears?|peach(es)?|mango(es)?)\b/, { kind: 'wedges', color: '#F3C96B', accent: '#E58F3A' }],
  [/\b(lemons?|limes?)\b/, { kind: 'wedges', color: '#F5DB5C', accent: '#FFF4B8', garnish: true }],
  [/\b(peanuts?|almonds?|walnuts?|cashews?|pistachios?|pecans?|nuts?|granola)\b/, { kind: 'dots', color: '#C49461', garnish: true }],
  [/\b(sesame|chia|hemp|flax|pumpkin seeds|seeds?)\b/, { kind: 'dots', color: '#F1E6CC', garnish: true }],
  [/\b(hummus|tahini|peanut butter|almond butter)\b/, { kind: 'dots', color: '#D8B06F', garnish: true }],
];

function lookFor(name: string): Look | null {
  const n = name.toLowerCase();
  for (const [re, look] of LOOKS) if (re.test(n)) return look.color === 'skip' ? null : look;
  return null;
}

// tiny deterministic random generator
function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (x: number) => Math.round(x * 10) / 10;

function piece(kind: Kind, c: string, a: string, rnd: () => number): string {
  const r = () => rnd();
  switch (kind) {
    case 'slices':
      return `<rect x="-14" y="-6.5" width="28" height="13" rx="6" fill="${c}"/><path d="M-7 -5 L-4 5 M1 -5 L4 5" stroke="${a}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>`;
    case 'crumbs': {
      let s = '';
      for (let i = 0; i < 3; i++) s += `<circle cx="${f((r() - 0.5) * 9)}" cy="${f((r() - 0.5) * 9)}" r="${f(2.6 + r() * 2.2)}" fill="${i ? c : a}"/>`;
      return s;
    }
    case 'fillet':
      return `<rect x="-24" y="-13" width="48" height="26" rx="13" fill="${c}"/><path d="M-12 -11 Q-8 0 -12 11 M-2 -12 Q2 0 -2 12 M8 -11 Q12 0 8 11" stroke="${a}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`;
    case 'shrimp':
      return `<path d="M-8 4 A8 8 0 1 1 6 -2" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M-6 0 A5 5 0 0 1 2 -4" stroke="${a}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>`;
    case 'eggs':
      return `<ellipse rx="13" ry="11" fill="${c}" stroke="#00000010"/><circle cx="1" cy="1" r="6" fill="${a}"/>`;
    case 'scramble':
      return `<path d="M-9 -2 Q-6 -9 1 -7 Q8 -9 9 -1 Q11 6 3 7 Q-4 10 -8 5 Q-12 2 -9 -2Z" fill="${c}"/><circle cx="-2" cy="-1" r="2.2" fill="${a}"/>`;
    case 'cubes':
      return `<rect x="-6" y="-6" width="12" height="12" rx="3" fill="${c}"/><path d="M-6 3 H6" stroke="${a}" stroke-width="2" opacity=".5"/>`;
    case 'coins':
      return `<circle r="6.5" fill="${c}"/><circle r="3.4" fill="${a}" opacity=".75"/>`;
    case 'halves':
      return `<circle r="7" fill="${c}"/><path d="M-4 -2 A4.5 4.5 0 0 1 3 -4" stroke="${a}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    case 'sticks':
      return `<rect x="-10" y="-2.6" width="20" height="5.2" rx="2.6" fill="${c}"/><rect x="-8" y="-1" width="9" height="1.6" rx=".8" fill="${a}" opacity=".7"/>`;
    case 'wedges':
      return `<path d="M-11 2 A11 11 0 0 1 11 2 Z" fill="${c}"/><path d="M-11 2 A11 11 0 0 1 11 2" stroke="${a}" stroke-width="2.4" fill="none"/>`;
    case 'dots':
      return `<circle r="${f(2.4 + r() * 1.4)}" fill="${c}"/>`;
    case 'beans':
      return `<ellipse rx="4.6" ry="3" fill="${c}"/><ellipse cx="-1.2" cy="-.9" rx="1.6" ry=".7" fill="#FFFFFF" opacity=".3"/>`;
    case 'florets':
      return `<rect x="-1.6" y="2" width="3.2" height="7" rx="1.6" fill="${a}"/><circle cx="-4" cy="0" r="4.6" fill="${c}"/><circle cx="4" cy="0" r="4.6" fill="${c}"/><circle cx="0" cy="-4.5" r="5" fill="${c}"/>`;
    case 'leaves':
      return `<path d="M-11 0 Q0 -8 11 0 Q0 8 -11 0Z" fill="${c}"/><path d="M-9 0 H9" stroke="${a}" stroke-width="1" opacity=".8"/>`;
    case 'rings':
      return `<circle r="5.5" fill="none" stroke="${c}" stroke-width="2.2"/>`;
  }
}

const COUNT: Record<Kind, [number, number]> = {
  slices: [5, 7], crumbs: [9, 12], fillet: [1, 1], shrimp: [5, 6], eggs: [2, 3], scramble: [6, 8], cubes: [7, 9],
  coins: [7, 9], halves: [6, 8], sticks: [6, 8], wedges: [3, 4], dots: [10, 14], beans: [12, 16], florets: [4, 5],
  leaves: [5, 7], rings: [5, 7],
};

type Theme = { bowl: string; rim: string; inner: string; shadow: string; steam: string };
const VAR_THEME: Theme = { bowl: 'var(--dish-bowl)', rim: 'var(--dish-rim)', inner: 'var(--dish-inner)', shadow: 'var(--dish-shadow)', steam: 'var(--dish-steam)' };
export const LIGHT_THEME: Theme = { bowl: '#FFFFFF', rim: '#E9E5DD', inner: '#F4EEE3', shadow: 'rgba(40,30,20,.08)', steam: 'rgba(120,110,100,.35)' };

const HOT = /\b(cook|sear|bake|roast|grill|fry|fried|saute|sauté|simmer|boil|steam|heat|scramble|toast|broil|air[- ]?fry)/i;

/**
 * Returns an SVG string (viewBox 0 0 320 220).
 * animated: steam, a slow turn and pieces popping in (CSS classes styled by the page).
 */
export function dishSvg(r: Pick<Recipe, 'title' | 'ingredients' | 'steps'>, opts: { animated?: boolean; theme?: Theme } = {}): string {
  const theme = opts.theme ?? VAR_THEME;
  const rnd = seeded(r.title + r.ingredients.map((i) => i.name).join('|'));
  const cx = 160, cy = 116, R = 84, IR = 71;

  const items = r.ingredients
    .map((i) => ({ i, look: lookFor(i.name) }))
    .filter((x): x is { i: Recipe['ingredients'][number]; look: Look } => !!x.look)
    .sort((a, b) => b.i.grams - a.i.grams);

  const baseItem = items.find((x) => x.look.base);
  const toppings = items.filter((x) => x !== baseItem && x.look.kind && !x.look.garnish).slice(0, 4);
  const garnish = items.filter((x) => x.look.garnish).slice(0, 2);
  // nothing recognisable: a simple bowl of something warm
  if (!toppings.length && !baseItem) toppings.push({ i: r.ingredients[0], look: { kind: 'cubes', color: '#E9C99A', accent: '#C9A26A' } });

  let base = `<circle cx="${cx}" cy="${cy}" r="${IR}" fill="${baseItem?.look.color ?? theme.inner}"/>`;
  if (baseItem?.look.base === 'grains') {
    for (let k = 0; k < 110; k++) {
      const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (IR - 5);
      base += `<ellipse cx="${f(cx + Math.cos(ang) * rr)}" cy="${f(cy + Math.sin(ang) * rr)}" rx="2.4" ry="1.2" transform="rotate(${Math.round(rnd() * 180)} ${f(cx + Math.cos(ang) * rr)} ${f(cy + Math.sin(ang) * rr)})" fill="${baseItem.look.accent}"/>`;
    }
  } else if (baseItem?.look.base === 'greens') {
    for (let k = 0; k < 26; k++) {
      const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (IR - 10);
      base += `<g transform="translate(${f(cx + Math.cos(ang) * rr)} ${f(cy + Math.sin(ang) * rr)}) rotate(${Math.round(rnd() * 360)})">${piece('leaves', k % 3 ? baseItem.look.accent! : '#4C8A3C', '#3F7531', rnd)}</g>`;
    }
  } else if (baseItem?.look.base === 'strands') {
    for (let k = 0; k < 16; k++) {
      const a0 = rnd() * Math.PI * 2, r0 = rnd() * 40, x0 = cx + Math.cos(a0) * r0, y0 = cy + Math.sin(a0) * r0;
      base += `<path d="M${f(x0 - 30)} ${f(y0)} q15 ${f(-18 + rnd() * 36)} 30 0 t30 0" stroke="${k % 2 ? baseItem.look.color : baseItem.look.accent}" stroke-width="3.2" fill="none" stroke-linecap="round" transform="rotate(${Math.round(rnd() * 180)} ${f(x0)} ${f(y0)})"/>`;
    }
    base = `<clipPath id="bowlclip"><circle cx="${cx}" cy="${cy}" r="${IR}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${IR}" fill="${baseItem.look.color}"/><g clip-path="url(#bowlclip)">${base}</g>`;
  } else if (baseItem?.look.base === 'swirl') {
    base += `<path d="M${cx} ${cy} m-6 0 a6 6 0 1 1 12 0 a14 14 0 1 1 -26 0 a22 22 0 1 1 42 0 a30 30 0 1 1 -58 0" fill="none" stroke="${baseItem.look.accent}" stroke-width="3" stroke-linecap="round"/>`;
  }

  // toppings: each ingredient gets its own wedge of the bowl, like a grain bowl
  const pieces: { x: number; y: number; svg: string }[] = [];
  const n = toppings.length;
  const start = -Math.PI / 2 + rnd() * 0.6;
  toppings.forEach((t, idx) => {
    const kind = t.look.kind!;
    const span = (Math.PI * 2) / Math.max(1, n);
    const mid = start + idx * span;
    const [lo, hi] = COUNT[kind];
    const count = n === 1 && kind !== 'fillet' ? hi + 3 : lo + Math.floor(rnd() * (hi - lo + 1));
    for (let k = 0; k < count; k++) {
      let ang: number, rr: number;
      if (kind === 'fillet') {
        ang = mid;
        rr = n === 1 ? 0 : 30;
      } else if (n === 1) {
        ang = rnd() * Math.PI * 2;
        rr = 10 + Math.sqrt(rnd()) * 42;
      } else {
        ang = mid + (rnd() - 0.5) * span * 0.72;
        rr = 16 + rnd() * 38;
      }
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
      const rot = kind === 'fillet' ? Math.round((ang * 180) / Math.PI) + 90 : Math.round(rnd() * 360);
      pieces.push({ x, y, svg: `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})">${piece(kind, t.look.color, t.look.accent ?? t.look.color, rnd)}</g>` });
    }
  });
  pieces.sort((a, b) => a.y - b.y);
  for (const g of garnish) {
    for (let k = 0; k < 9; k++) {
      const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (IR - 12);
      pieces.push({ x: 0, y: 999, svg: `<g transform="translate(${f(cx + Math.cos(ang) * rr)} ${f(cy + Math.sin(ang) * rr)})">${piece(g.look.kind ?? 'dots', g.look.color, g.look.accent ?? g.look.color, rnd)}</g>` });
    }
  }

  const anim = !!opts.animated;
  const body = pieces
    .map((p, k) => (anim ? `<g class="dish-piece" style="animation-delay:${Math.min(900, k * 28)}ms">${p.svg}</g>` : p.svg))
    .join('');

  const hot = r.steps.some((s) => HOT.test(s.text));
  const steam = hot
    ? [128, 160, 192]
        .map((x, k) => `<path class="${anim ? 'dish-steam' : ''}" style="animation-delay:${k * 0.9}s" d="M${x} 62 q-8 -10 0 -20 q8 -10 0 -20" stroke="${theme.steam}" stroke-width="3" fill="none" stroke-linecap="round"${anim ? '' : ' opacity=".9"'}/>`)
        .join('')
    : '';

  return `<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" focusable="false">
<circle cx="${cx}" cy="${cy + 7}" r="${R + 2}" fill="${theme.shadow}"/>
<g class="${anim ? 'dish-bob' : ''}">
<circle cx="${cx}" cy="${cy}" r="${R}" fill="${theme.bowl}" stroke="${theme.rim}" stroke-width="1.5"/>
<g class="${anim ? 'dish-turn' : ''}" style="transform-origin:${cx}px ${cy}px">${base}${body}</g>
</g>
${steam}
</svg>`;
}

/** The same picture as an image, for the share card. */
export async function dishImage(r: Pick<Recipe, 'title' | 'ingredients' | 'steps'>): Promise<HTMLImageElement> {
  const svg = dishSvg(r, { theme: LIGHT_THEME });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
