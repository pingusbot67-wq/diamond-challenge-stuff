// Matches ingredient names to the nutrition table and does the macro math.
// The AI never decides the macros — it only picks ingredients and grams.
import type { Food, Macros } from './types.ts';
import { clean, key, tokens } from './text.ts';

export type FoodIndex = { foods: Food[]; byKey: Map<string, { food: Food; exact: boolean }>; entries: { toks: string[]; food: Food }[] };

export function buildFoodIndex(foods: Food[]): FoodIndex {
  const byKey = new Map<string, { food: Food; exact: boolean }>();
  const entries: { toks: string[]; food: Food }[] = [];
  for (const f of foods) {
    for (const n of [f.name, ...f.aliases]) {
      const k = key(n);
      if (!k) continue;
      // an entry whose words are all meaningful ("greek yogurt") beats one that lost words ("greek yogurt, plain")
      const exact = tokens(n).length === clean(n).split(' ').length;
      const prev = byKey.get(k);
      if (!prev || (exact && !prev.exact)) byKey.set(k, { food: f, exact });
      entries.push({ toks: k.split(' '), food: f });
    }
  }
  return { foods, byKey, entries };
}

/**
 * Finds the best nutrition-table entry for a free-text ingredient name.
 * 1) exact match on name/alias (ignoring plurals, "fresh", "chopped", amounts…)
 * 2) otherwise the most specific entry whose words are ALL in the ingredient
 *    (e.g. "baby spinach leaves" -> "spinach", "chunky peanut butter" -> "peanut butter", not "butter")
 * Returns null when nothing fits — the app then shows an "estimated" label.
 */
export function matchFood(name: string, index: FoodIndex): Food | null {
  const k = key(name);
  if (!k) return null;
  const exact = index.byKey.get(k);
  if (exact) return exact.food;
  const words = new Set(k.split(' '));
  let best: { food: Food; score: number } | null = null;
  for (const e of index.entries) {
    if (e.toks.every((t) => words.has(t))) {
      const score = e.toks.length * 10 - (words.size - e.toks.length);
      if (!best || score > best.score) best = { food: e.food, score };
    }
  }
  return best?.food ?? null;
}

export function macrosFor(food: Pick<Food, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>, grams: number): Macros {
  const f = grams / 100;
  return { kcal: food.kcal * f, protein_g: food.protein_g * f, carbs_g: food.carbs_g * f, fat_g: food.fat_g * f };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein_g: a.protein_g + m.protein_g, carbs_g: a.carbs_g + m.carbs_g, fat_g: a.fat_g + m.fat_g }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export function roundMacros(m: Macros): Macros {
  return { kcal: Math.round(m.kcal), protein_g: Math.round(m.protein_g), carbs_g: Math.round(m.carbs_g), fat_g: Math.round(m.fat_g) };
}

/** Tidy the AI's scan list: canonical names when we know the food, drop duplicates. */
export function normalizeScanItems<T extends { name: string }>(items: T[], index: FoodIndex) {
  const seen = new Set<string>();
  const out: (T & { display: string; food_id: number | null; matched: boolean })[] = [];
  for (const it of items) {
    const food = matchFood(it.name, index);
    const display = (food ? food.name : tokens(it.name).join(' ') || it.name.trim()).slice(0, 60);
    const dedupe = food ? `f${food.id}` : display;
    if (!display || seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ ...it, display, food_id: food?.id ?? null, matched: !!food });
  }
  return out;
}
