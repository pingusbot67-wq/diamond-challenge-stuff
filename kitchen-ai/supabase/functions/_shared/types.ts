export type SafetyClass = 'poultry' | 'ground_meat' | 'whole_meat' | 'fish' | 'egg';

export type Food = {
  id: number;
  name: string;
  aliases: string[];
  category: string;
  kcal: number; // per 100 g
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  tags: string[];
  safety_class: SafetyClass | null;
  source: string;
};

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type Goal = 'cut' | 'maintain' | 'bulk' | 'glp1';

export type Profile = {
  goal: Goal | null;
  protein_target_g: number | null;
  calorie_target: number | null;
  diet: string[];
  allergies: string[];
  skill: 'beginner' | 'intermediate' | 'advanced' | null;
  max_minutes: number | null;
};

export type RecipeIngredient = {
  name: string;
  grams: number;
  food_id: number | null;
  matched: boolean; // false => macros for this line are an estimate
  from_fridge: boolean;
} & Macros;

export type RecipeStep = { text: string; timer_seconds: number | null };

export type SafetyNote = {
  class: SafetyClass;
  label: string;
  temp_f: number;
  temp_c: number;
  rest_minutes: number;
  text: string;
};

export type BuiltRecipe = {
  title: string;
  summary: string;
  servings: number;
  minutes: number;
  difficulty: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  macros: Macros; // per serving
  macros_estimated: boolean;
  safety: SafetyNote[];
  tags: string[];
  glp1_friendly: boolean;
};
