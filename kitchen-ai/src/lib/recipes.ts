import { supabase } from './supabase';
import type { Recipe } from './types';

const COLS = 'id,title,summary,servings,minutes,difficulty,ingredients,steps,macros,macros_estimated,safety,tags,glp1_friendly,source';

export async function getRecipe(id: string): Promise<Recipe> {
  const { data, error } = await supabase.from('recipes').select(COLS).eq('id', id).single();
  if (error || !data) throw new Error('We couldn’t find that recipe.');
  return data as Recipe;
}

export async function isSaved(userId: string, recipeId: string): Promise<boolean> {
  const { count } = await supabase.from('saved_recipes').select('recipe_id', { count: 'exact', head: true }).eq('user_id', userId).eq('recipe_id', recipeId);
  return (count ?? 0) > 0;
}

export async function setSaved(userId: string, recipeId: string, saved: boolean) {
  const q = saved
    ? supabase.from('saved_recipes').upsert({ user_id: userId, recipe_id: recipeId })
    : supabase.from('saved_recipes').delete().eq('user_id', userId).eq('recipe_id', recipeId);
  const { error } = await q;
  if (error) throw new Error('Couldn’t update your saved recipes. Please try again.');
}

export async function listSaved(userId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .select(`created_at, recipe:recipes(${COLS})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Couldn’t load your recipes.');
  return (data ?? []).map((r) => (r as unknown as { recipe: Recipe }).recipe).filter(Boolean);
}

export async function logMeal(userId: string, r: Recipe) {
  const { error } = await supabase.from('meal_logs').insert({
    user_id: userId,
    recipe_id: r.id,
    title: r.title,
    kcal: r.macros.kcal,
    protein_g: r.macros.protein_g,
    carbs_g: r.macros.carbs_g,
    fat_g: r.macros.fat_g,
  });
  if (error) throw new Error('Couldn’t log that meal. Please try again.');
}
