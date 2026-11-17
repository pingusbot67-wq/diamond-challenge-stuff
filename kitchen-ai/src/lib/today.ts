import { supabase } from './supabase';

export function localDayStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type Totals = { kcal: number; protein_g: number };

export async function todaysTotals(userId: string): Promise<Totals> {
  const { data, error } = await supabase
    .from('meal_logs')
    .select('kcal,protein_g')
    .eq('user_id', userId)
    .gte('eaten_at', localDayStart().toISOString());
  if (error) throw error;
  return (data ?? []).reduce((a, r) => ({ kcal: a.kcal + r.kcal, protein_g: a.protein_g + r.protein_g }), { kcal: 0, protein_g: 0 });
}
