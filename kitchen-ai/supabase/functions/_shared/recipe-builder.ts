// Turns the AI's draft into a recipe we trust:
// macros from the nutrition table, server-checked allergies/diet, server-fixed safety temps.
import type { RecipesOutput } from './schemas.ts';
import type { BuiltRecipe, Profile, RecipeIngredient, SafetyClass } from './types.ts';
import { matchFood, macrosFor, roundMacros, sumMacros, type FoodIndex } from './nutrition.ts';
import { findConflicts, ingredientTags, type Conflict } from './allergens.ts';
import { applySafety, ingredientSafety } from './safety.ts';
import { isGlp1Friendly } from './ranking.ts';

type AiRecipe = RecipesOutput['recipes'][number];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));

export function buildRecipe(ai: AiRecipe, index: FoodIndex, profile: Pick<Profile, 'allergies' | 'diet'>):
  { recipe: BuiltRecipe; conflicts: [] } | { recipe: null; conflicts: Conflict[] } {
  const required: SafetyClass[] = [];
  const allTags = new Set<string>();
  const tagged: { name: string; tags: Set<string> }[] = [];
  let estimated = false;

  const ingredients: RecipeIngredient[] = ai.ingredients
    .filter((i) => i.name.trim())
    .map((i) => {
      const grams = Math.round(clamp(i.grams, 0, 3000));
      const food = matchFood(i.name, index);
      const m = food
        ? macrosFor(food, grams)
        : macrosFor(
            {
              kcal: clamp(i.per100g.kcal, 0, 900),
              protein_g: clamp(i.per100g.protein, 0, 100),
              carbs_g: clamp(i.per100g.carbs, 0, 100),
              fat_g: clamp(i.per100g.fat, 0, 100),
            },
            grams,
          );
      if (!food && m.kcal > 15) estimated = true; // a pinch of an unknown spice doesn't make the whole recipe "estimated"
      const tags = ingredientTags(i.name, food);
      tags.forEach((t) => allTags.add(t));
      tagged.push({ name: i.name, tags });
      const s = ingredientSafety(i.name, food);
      if (s) required.push(s);
      return {
        name: i.name.trim().slice(0, 80),
        grams,
        food_id: food?.id ?? null,
        matched: !!food,
        from_fridge: i.from_fridge,
        ...roundMacros(m),
      };
    });

  const conflicts = findConflicts(tagged, ai.steps.map((s) => s.text), profile.allergies, profile.diet);
  if (conflicts.length) return { recipe: null, conflicts };

  const safety = applySafety(ai.steps.map((s) => ({ text: s.text, doneness_check: s.doneness_check })), required);
  const servings = Math.round(clamp(ai.servings, 1, 6));
  const total = sumMacros(ingredients);
  const perServing = roundMacros({
    kcal: total.kcal / servings,
    protein_g: total.protein_g / servings,
    carbs_g: total.carbs_g / servings,
    fat_g: total.fat_g / servings,
  });
  const minutes = Math.round(clamp(ai.minutes, 1, 240));

  const tags = [...allTags].filter((t) => !['animal'].includes(t));
  if (perServing.protein_g >= 30) tags.push('high_protein');
  if (minutes <= 15) tags.push('quick');

  return {
    recipe: {
      title: ai.title.trim().slice(0, 80),
      summary: ai.summary.trim().slice(0, 200),
      servings,
      minutes,
      difficulty: ai.difficulty,
      ingredients,
      steps: safety.steps.map((text, i) => {
        const t = ai.steps[i]?.timer_minutes;
        return { text, timer_seconds: t && t > 0 ? Math.round(clamp(t, 0, 240) * 60) : null };
      }),
      macros: perServing,
      macros_estimated: estimated,
      safety: safety.notes,
      tags,
      glp1_friendly: isGlp1Friendly(perServing),
    },
    conflicts: [],
  };
}
