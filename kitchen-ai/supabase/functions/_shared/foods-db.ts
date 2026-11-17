import type { SupabaseClient } from '@supabase/supabase-js';
import type { Food } from './types.ts';
import { buildFoodIndex, type FoodIndex } from './nutrition.ts';

// Kept in memory between requests while the function is warm (the table is small, ~200 rows).
let cached: { index: FoodIndex; at: number } | null = null;

export async function loadFoodIndex(admin: SupabaseClient): Promise<FoodIndex> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.index;
  const { data, error } = await admin.from('foods').select('*').limit(5000);
  if (error) throw error;
  const foods = (data as Food[]).map((f) => ({ ...f, kcal: +f.kcal, protein_g: +f.protein_g, carbs_g: +f.carbs_g, fat_g: +f.fat_g, fiber_g: +f.fiber_g }));
  cached = { index: buildFoodIndex(foods), at: Date.now() };
  return cached.index;
}
