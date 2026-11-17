// Food safety: the server — not the AI — decides the safe internal temperature.
// Source: USDA safe minimum internal temperatures.
import type { Food, SafetyClass, SafetyNote } from './types.ts';
import { clean, hasPhrase } from './text.ts';

export const SAFE_TEMPS: Record<SafetyClass, Omit<SafetyNote, 'class'>> = {
  poultry: { label: 'Poultry', temp_f: 165, temp_c: 74, rest_minutes: 0, text: 'Cook poultry until a thermometer in the thickest part reads 165°F (74°C).' },
  ground_meat: { label: 'Ground meat', temp_f: 160, temp_c: 71, rest_minutes: 0, text: 'Cook ground meat until a thermometer reads 160°F (71°C).' },
  whole_meat: { label: 'Beef, pork or lamb', temp_f: 145, temp_c: 63, rest_minutes: 3, text: 'Cook whole cuts of beef, pork or lamb to 145°F (63°C), then let rest 3 minutes.' },
  fish: { label: 'Fish & shellfish', temp_f: 145, temp_c: 63, rest_minutes: 0, text: 'Cook fish to 145°F (63°C), until opaque and it flakes easily; shellfish until opaque and firm.' },
  egg: { label: 'Eggs', temp_f: 160, temp_c: 71, rest_minutes: 0, text: 'Cook eggs until whites and yolks are firm; egg dishes to 160°F (71°C).' },
};

// strictest first — when unsure, use the higher temperature
const STRICTNESS: SafetyClass[] = ['poultry', 'ground_meat', 'egg', 'whole_meat', 'fish'];

const KEYWORDS: Record<SafetyClass, string[]> = {
  poultry: ['chicken', 'turkey', 'duck', 'goose', 'quail'],
  ground_meat: ['ground beef', 'ground pork', 'ground lamb', 'ground veal', 'ground bison', 'minced beef', 'beef mince', 'minced pork',
    'minced lamb', 'lamb mince', 'burger', 'burgers', 'meatball', 'meatballs', 'sausage', 'sausages', 'meatloaf', 'hamburger meat'],
  whole_meat: ['steak', 'sirloin', 'ribeye', 'flank', 'chuck', 'brisket', 'pork chop', 'pork chops', 'pork loin', 'pork tenderloin',
    'tenderloin', 'lamb chop', 'lamb chops', 'roast', 'veal', 'pork', 'beef', 'lamb'],
  fish: ['salmon', 'tuna steak', 'ahi', 'cod', 'tilapia', 'halibut', 'trout', 'haddock', 'pollock', 'mahi', 'swordfish', 'catfish', 'snapper',
    'sea bass', 'fish', 'shrimp', 'prawn', 'prawns', 'scallop', 'scallops', 'crab', 'lobster', 'mussels', 'clams'],
  egg: ['egg', 'eggs', 'egg whites', 'egg white', 'frittata', 'omelet', 'omelette'],
};
// already cooked / ready-to-eat — no cooking temperature needed
const READY_TO_EAT = /\b(cooked|precooked|pre-cooked|rotisserie|leftover|deli|canned|smoked salmon|lox|jerky|hard[- ]boiled|boiled egg|lunch meat|sliced turkey|sliced ham|tinned)\b/;

function classesInText(text: string): SafetyClass[] {
  const t = clean(text);
  const found = new Set<SafetyClass>();
  for (const c of STRICTNESS) {
    let words = KEYWORDS[c];
    if (c === 'egg') words = words.filter(() => !/eggplant/.test(t));
    if (words.some((w) => hasPhrase(t, w))) found.add(c);
  }
  // "ground chicken/turkey" is poultry (165°F), not ground meat (160°F)
  if (found.has('poultry')) found.delete('ground_meat');
  // "pork" alone is a whole cut unless it said ground/sausage
  if (found.has('ground_meat')) found.delete('whole_meat');
  return [...found];
}

/** Which safety rules apply to this ingredient (nutrition table first, then words in the name). */
export function ingredientSafety(name: string, food: Food | null): SafetyClass | null {
  if (READY_TO_EAT.test(clean(name))) return null;
  if (food) return food.safety_class; // table knows best (e.g. "deli turkey" -> null)
  const cls = classesInText(name);
  return cls.length ? STRICTNESS.find((c) => cls.includes(c))! : null;
}

function strictest(list: SafetyClass[]): SafetyClass {
  return STRICTNESS.find((c) => list.includes(c))!;
}

const fmt = (c: SafetyClass) => `${SAFE_TEMPS[c].temp_f}°F (${SAFE_TEMPS[c].temp_c}°C)`;

// Any temperature in the "meat thermometer" range (100–199°F / 38–94°C) is treated as an internal temperature
// and replaced with the correct USDA number. Oven/pan temps (≥200°F) are left alone.
const TEMP = /(\d{2,3})\s*°?\s*(?:degrees\s*)?(F|C|fahrenheit|celsius)\b(\s*\(\s*\d{2,3}\s*°?\s*(?:degrees\s*)?(?:F|C)\s*\))?/gi;
const isInternal = (num: string, unit: string) => {
  const n = Number(num);
  return /^f/i.test(unit) ? n >= 100 && n < 200 : n >= 38 && n < 95;
};
function hasInternalTemp(text: string): boolean {
  for (const m of text.matchAll(TEMP)) if (isInternal(m[1], m[2])) return true;
  return false;
}

export type StepIn = { text: string; doneness_check?: SafetyClass | null };

/**
 * Makes the steps safe:
 *  - any internal temperature the AI wrote is replaced with the correct USDA number
 *  - every required doneness check is present in a step (added if missing)
 * Returns the fixed step texts and the safety notes to show on the recipe.
 */
export function applySafety(steps: StepIn[], required: SafetyClass[]): { steps: string[]; notes: SafetyNote[]; fixes: number } {
  const req = [...new Set(required)];
  let fixes = 0;
  if (!req.length) return { steps: steps.map((s) => s.text), notes: [], fixes };

  const resolve = (s: StepIn): SafetyClass => {
    const mentioned = classesInText(s.text).filter((c) => req.includes(c));
    if (mentioned.length) return strictest(mentioned);
    if (s.doneness_check && req.includes(s.doneness_check)) return s.doneness_check;
    return strictest(req);
  };

  const covered = new Set<SafetyClass>();
  const out = steps.map((s) => {
    let text = s.text.trim();
    const hasTemp = hasInternalTemp(text);
    if (!hasTemp && !s.doneness_check) return text;
    const cls = resolve(s);
    if (hasTemp) {
      const before = text;
      text = text.replace(TEMP, (m: string, num: string, unit: string) => (isInternal(num, unit) ? fmt(cls) : m));
      if (text !== before && !before.includes(fmt(cls))) fixes++;
    }
    if (!text.includes(fmt(cls))) {
      text = `${text.replace(/\s*$/, '')} ${SAFE_TEMPS[cls].text}`;
      fixes++;
    } else if (cls === 'whole_meat' && !/rest/i.test(text)) {
      text = `${text} Let rest 3 minutes.`;
      fixes++;
    }
    covered.add(cls);
    return text;
  });

  // anything still uncovered: add it to the last step that mentions it (or the last cooking step)
  for (const c of req) {
    if (covered.has(c)) continue;
    let idx = -1;
    for (let i = out.length - 1; i >= 0 && idx < 0; i--) if (classesInText(out[i]).includes(c)) idx = i;
    for (let i = out.length - 1; i >= 0 && idx < 0; i--) if (/\b(cook|bake|roast|grill|sear|fry|saute|sauté|simmer|air[- ]fry|broil|pan)/i.test(out[i])) idx = i;
    if (idx < 0) idx = out.length - 1;
    if (idx < 0) continue;
    out[idx] = `${out[idx].replace(/\s*$/, '')} ${SAFE_TEMPS[c].text}`;
    covered.add(c);
    fixes++;
  }

  const notes = STRICTNESS.filter((c) => req.includes(c)).map((c) => ({ class: c, ...SAFE_TEMPS[c] }));
  return { steps: out, notes, fixes };
}
