// Ranks recipes by how well they fit what the user has LEFT to eat today.
import type { Macros, Profile } from './types.ts';

export type Remaining = { kcal: number; protein_g: number };
export type MealTarget = { kcal: number; protein_g: number };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** A sensible single-meal target from what's left today. */
export function mealTarget(profile: Profile, remaining: Remaining): MealTarget {
  const dayKcal = profile.calorie_target ?? 2000;
  const dayProtein = profile.protein_target_g ?? 120;
  const glp1 = profile.goal === 'glp1';
  const kcalCap = glp1 ? 450 : Math.round(dayKcal * 0.45);
  const proteinCap = glp1 ? 40 : Math.round(dayProtein * 0.5);
  return {
    kcal: Math.round(clamp(remaining.kcal, 200, kcalCap)),
    protein_g: Math.round(clamp(remaining.protein_g, 15, proteinCap)),
  };
}

export function isGlp1Friendly(m: Macros): boolean {
  return m.kcal > 0 && m.kcal <= 500 && m.protein_g >= 20 && (m.protein_g * 4) / m.kcal >= 0.3;
}

export function fitScore(m: Macros, minutes: number, target: MealTarget, remaining: Remaining, maxMinutes: number | null) {
  const protein = 45 * Math.min(1, m.protein_g / Math.max(1, target.protein_g));
  const kcal = 30 * Math.max(0, 1 - Math.abs(m.kcal - target.kcal) / Math.max(150, target.kcal));
  const density = 15 * Math.min(1, (m.protein_g * 4) / Math.max(1, m.kcal) / 0.4);
  const max = maxMinutes ?? 45;
  const time = minutes <= max ? 10 : 10 * Math.max(0, 1 - (minutes - max) / max);
  const over = Math.max(0, m.kcal - Math.max(0, remaining.kcal));
  const overPenalty = Math.min(25, over / 20); // -1 point per 20 kcal over what's left today
  const score = Math.round(clamp(protein + kcal + density + time - overPenalty, 0, 100));

  let reason: string;
  if (over > 50) reason = `${Math.round(over)} kcal over what's left today`;
  else if (m.protein_g >= target.protein_g) reason = `Hits your ${target.protein_g}g protein target for this meal`;
  else reason = `Fits your remaining ${Math.round(Math.max(0, remaining.kcal))} kcal`;
  return { score, reason };
}

export function rankRecipes<T extends { macros: Macros; minutes: number }>(
  recipes: T[],
  profile: Profile,
  remaining: Remaining,
): (T & { fit: number; fit_reason: string })[] {
  const target = mealTarget(profile, remaining);
  return recipes
    .map((r) => {
      const { score, reason } = fitScore(r.macros, r.minutes, target, remaining, profile.max_minutes);
      return { ...r, fit: score, fit_reason: reason };
    })
    .sort((a, b) => b.fit - a.fit);
}
