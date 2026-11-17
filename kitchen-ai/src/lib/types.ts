export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type Recipe = {
  id: string;
  title: string;
  summary: string | null;
  servings: number;
  minutes: number;
  difficulty: string | null;
  ingredients: { name: string; grams: number; matched: boolean; from_fridge?: boolean; kcal: number; protein_g: number }[];
  steps: { text: string; timer_seconds: number | null }[];
  macros: Macros;
  macros_estimated: boolean;
  safety: { class: string; label: string; temp_f: number; temp_c: number; rest_minutes: number; text: string }[];
  tags: string[];
  glp1_friendly: boolean;
  source: string;
  fit?: number;
  fit_reason?: string;
};

export type Profile = {
  id: string;
  goal: 'cut' | 'maintain' | 'bulk' | 'glp1' | null;
  sex: 'male' | 'female' | 'other' | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity: 'low' | 'moderate' | 'high' | null;
  protein_target_g: number | null;
  calorie_target: number | null;
  diet: string[];
  allergies: string[];
  skill: 'beginner' | 'intermediate' | 'advanced' | null;
  max_minutes: number | null;
  units: 'us' | 'metric';
  onboarded: boolean;
};

export type ScanItem = { name: string; amount?: string | null; confidence?: 'high' | 'medium' | 'low'; matched?: boolean };
