import { describe, expect, it } from 'vitest';
import { FOODS } from '../supabase/functions/_shared/foods.generated.ts';
import { buildFoodIndex, matchFood, normalizeScanItems } from '../supabase/functions/_shared/nutrition.ts';
import { detectTags, findConflicts, ingredientTags } from '../supabase/functions/_shared/allergens.ts';
import { applySafety, ingredientSafety } from '../supabase/functions/_shared/safety.ts';
import { isGlp1Friendly, mealTarget, rankRecipes } from '../supabase/functions/_shared/ranking.ts';
import { buildRecipe } from '../supabase/functions/_shared/recipe-builder.ts';
import { estimateCostUsd } from '../supabase/functions/_shared/claude.ts';
import type { Profile, SafetyClass } from '../supabase/functions/_shared/types.ts';

const index = buildFoodIndex(FOODS);
const m = (n: string) => matchFood(n, index)?.name ?? null;

describe('ingredient matching', () => {
  it.each([
    ['Chicken Breasts', 'chicken breast'],
    ['2 boneless skinless chicken breasts', 'chicken breast'],
    ['baby spinach', 'spinach'],
    ['chunky peanut butter', 'peanut butter'],
    ['unsweetened almond milk', 'almond milk'],
    ['Greek yogurt (0%)', 'greek yogurt nonfat'],
    ['shredded mozzarella', 'mozzarella part-skim'],
    ['eggs', 'egg'],
    ['egg whites', 'egg whites'],
    ['eggplant', 'eggplant'],
    ['red onion', 'onion'],
    ['ground turkey 93/7', 'ground turkey'],
    ['cherry tomatoes', 'tomato'],
    ['chicken thighs', 'chicken thigh'],
    ['fresh salmon fillet', 'salmon'],
    ['2% greek yogurt', 'greek yogurt 2%'],
    ['80/20 ground beef', 'ground beef 80% lean'],
    ['ground beef', 'ground beef 90% lean'],
    ['93/7 ground turkey', 'ground turkey'],
  ])('%s -> %s', (input, expected) => expect(m(input)).toBe(expected));

  it('returns null for unknown foods (shows "estimated")', () => {
    expect(m('dragonfruit')).toBeNull();
    expect(m('gochujang')).toBeNull();
  });

  it('merges duplicates from a scan', () => {
    const out = normalizeScanItems([{ name: 'eggs' }, { name: 'Egg' }, { name: 'large eggs' }, { name: 'spinach' }], index);
    expect(out.map((o) => o.display)).toEqual(['egg', 'spinach']);
  });
});

describe('allergens & diet (server double-check)', () => {
  const has = (s: string, t: string) => detectTags(s).has(t);
  it('finds allergens in plain names', () => {
    expect(has('peanut butter', 'peanut')).toBe(true);
    expect(has('peanut butter', 'milk')).toBe(false);
    expect(has('almond milk', 'tree_nut')).toBe(true);
    expect(has('almond milk', 'milk')).toBe(false);
    expect(has('coconut milk', 'milk')).toBe(false);
    expect(has('soy sauce', 'wheat')).toBe(true);
    expect(has('soy sauce', 'soy')).toBe(true);
    expect(has('eggplant', 'egg')).toBe(false);
    expect(has('mayo', 'egg')).toBe(true);
    expect(has('parmesan', 'milk')).toBe(true);
    expect(has('whey protein', 'milk')).toBe(true);
    expect(has('shrimp', 'shellfish')).toBe(true);
    expect(has('tahini', 'sesame')).toBe(true);
    expect(has('corn tortillas', 'wheat')).toBe(false);
    expect(has('flour tortillas', 'wheat')).toBe(true);
    expect(has('worcestershire sauce', 'fish')).toBe(true);
  });
  it('knows meat vs plant-based', () => {
    expect(has('vegan sausage', 'meat')).toBe(false);
    expect(has('chicken and mushroom', 'meat')).toBe(true);
    expect(has('vegetable broth', 'meat')).toBe(false);
    expect(has('chicken broth', 'meat')).toBe(true);
    expect(has('bacon bits', 'pork')).toBe(true);
  });
  it('uses nutrition-table tags too', () => {
    const kimchi = FOODS.find((f) => f.name === 'kimchi')!;
    expect(ingredientTags('kimchi', kimchi).has('fish')).toBe(true);
  });
  it('rejects conflicts', () => {
    const ing = (n: string) => ({ name: n, tags: ingredientTags(n, matchFood(n, index)) });
    expect(findConflicts([ing('chicken breast'), ing('rice')], [], [], ['vegetarian'])).not.toEqual([]);
    expect(findConflicts([ing('tofu'), ing('rice')], [], [], ['vegan'])).toEqual([]);
    expect(findConflicts([ing('greek yogurt'), ing('honey')], [], [], ['vegan']).length).toBe(2);
    expect(findConflicts([ing('salmon')], [], ['fish'], [])).not.toEqual([]);
    expect(findConflicts([ing('salmon')], [], [], ['pescatarian'])).toEqual([]);
    expect(findConflicts([ing('bread')], [], [], ['gluten_free'])).not.toEqual([]);
    expect(findConflicts([ing('chicken breast'), ing('cheddar')], [], [], ['kosher'])).not.toEqual([]);
    // sneaky step
    expect(findConflicts([ing('chicken breast')], ['Top with sesame seeds.'], ['sesame'], [])).not.toEqual([]);
  });
});

describe('food safety temperatures', () => {
  it('knows which ingredients need temps', () => {
    const s = (n: string) => ingredientSafety(n, matchFood(n, index));
    expect(s('chicken breast')).toBe('poultry');
    expect(s('ground turkey')).toBe('poultry');
    expect(s('ground beef')).toBe('ground_meat');
    expect(s('sirloin steak')).toBe('whole_meat');
    expect(s('salmon')).toBe('fish');
    expect(s('shrimp')).toBe('fish');
    expect(s('eggs')).toBe('egg');
    expect(s('rotisserie chicken')).toBeNull();
    expect(s('canned tuna')).toBeNull();
    expect(s('deli turkey')).toBeNull();
    expect(s('duck breast')).toBe('poultry'); // not in table -> keyword
  });

  it('adds a missing temperature', () => {
    const r = applySafety([{ text: 'Sear the chicken 6 minutes per side.', doneness_check: 'poultry' }], ['poultry']);
    expect(r.steps[0]).toContain('165°F (74°C)');
    expect(r.notes[0].temp_f).toBe(165);
  });

  it('fixes a WRONG temperature the AI wrote', () => {
    const r = applySafety([{ text: 'Cook the chicken until the internal temperature reaches 145°F (63°C).', doneness_check: null }], ['poultry']);
    expect(r.steps[0]).toContain('165°F (74°C)');
    expect(r.steps[0]).not.toContain('145');
    expect(r.fixes).toBeGreaterThan(0);
  });

  it('fixes a wrong class label from the AI (chicken tagged as steak)', () => {
    const r = applySafety([{ text: 'Grill the chicken thighs until done.', doneness_check: 'whole_meat' }], ['poultry']);
    expect(r.steps[0]).toContain('165°F');
  });

  it('leaves oven temperatures alone', () => {
    const r = applySafety([{ text: 'Bake at 425°F for 20 minutes until the salmon reaches 120°F.', doneness_check: 'fish' }], ['fish']);
    expect(r.steps[0]).toContain('425°F');
    expect(r.steps[0]).toContain('145°F (63°C)');
    expect(r.steps[0]).not.toContain('120°F');
  });

  it('adds the 3-minute rest for steak', () => {
    const r = applySafety([{ text: 'Sear the steak.', doneness_check: 'whole_meat' }], ['whole_meat']);
    expect(r.steps[0]).toMatch(/145°F \(63°C\).*rest 3 minutes/);
  });

  it('adds a check even if the AI forgot to mark any step', () => {
    const r = applySafety(
      [{ text: 'Chop the onion.' }, { text: 'Brown the ground beef with the onion.' }, { text: 'Serve over rice.' }],
      ['ground_meat'],
    );
    expect(r.steps[1]).toContain('160°F (71°C)');
  });

  it('handles several proteins in one recipe', () => {
    const req: SafetyClass[] = ['poultry', 'egg'];
    const r = applySafety([{ text: 'Cook the chicken.', doneness_check: 'poultry' }, { text: 'Scramble the eggs.', doneness_check: 'egg' }], req);
    expect(r.steps[0]).toContain('165°F');
    expect(r.steps[1]).toContain('160°F');
    expect(r.notes.map((n) => n.class)).toEqual(['poultry', 'egg']);
  });

  it('no meat = no temps', () => {
    expect(applySafety([{ text: 'Toss the salad.' }], []).steps[0]).toBe('Toss the salad.');
  });
});

const profile: Profile = {
  goal: 'cut', protein_target_g: 160, calorie_target: 2000, diet: [], allergies: [], skill: 'beginner', max_minutes: 30,
};

describe('ranking & GLP-1', () => {
  it('meal target follows remaining macros', () => {
    expect(mealTarget(profile, { kcal: 600, protein_g: 50 })).toEqual({ kcal: 600, protein_g: 50 });
    expect(mealTarget(profile, { kcal: -100, protein_g: -5 })).toEqual({ kcal: 200, protein_g: 15 });
    expect(mealTarget({ ...profile, goal: 'glp1' }, { kcal: 1500, protein_g: 120 })).toEqual({ kcal: 450, protein_g: 40 });
  });
  it('ranks the best fit first and penalises going over', () => {
    const r = rankRecipes(
      [
        { id: 'big', macros: { kcal: 1100, protein_g: 60, carbs_g: 90, fat_g: 40 }, minutes: 25 },
        { id: 'fit', macros: { kcal: 550, protein_g: 48, carbs_g: 40, fat_g: 15 }, minutes: 20 },
        { id: 'low', macros: { kcal: 500, protein_g: 12, carbs_g: 80, fat_g: 12 }, minutes: 10 },
      ],
      profile,
      { kcal: 600, protein_g: 50 },
    );
    expect(r[0].id).toBe('fit');
    expect(r[2].id).not.toBe('fit');
    expect(r.find((x) => x.id === 'big')!.fit_reason).toMatch(/over/);
  });
  it('GLP-1 friendly = small + protein dense', () => {
    expect(isGlp1Friendly({ kcal: 380, protein_g: 35, carbs_g: 20, fat_g: 12 })).toBe(true);
    expect(isGlp1Friendly({ kcal: 700, protein_g: 50, carbs_g: 60, fat_g: 25 })).toBe(false);
    expect(isGlp1Friendly({ kcal: 300, protein_g: 10, carbs_g: 50, fat_g: 5 })).toBe(false);
  });
});

const aiRecipe = (over: Partial<Parameters<typeof buildRecipe>[0]> = {}) => ({
  title: 'Garlic Chicken Rice Bowl',
  summary: 'Juicy chicken over rice.',
  minutes: 25,
  servings: 1,
  difficulty: 'easy' as const,
  ingredients: [
    { name: 'chicken breast', grams: 200, from_fridge: true, per100g: { kcal: 999, protein: 99, carbs: 0, fat: 0 } }, // AI guess ignored: table wins
    { name: 'white rice', grams: 150, from_fridge: true, per100g: { kcal: 130, protein: 3, carbs: 28, fat: 0 } },
    { name: 'olive oil', grams: 5, from_fridge: false, per100g: { kcal: 884, protein: 0, carbs: 0, fat: 100 } },
  ],
  steps: [
    { text: 'Season the chicken.', timer_minutes: null, doneness_check: null },
    { text: 'Cook the chicken in the oil until golden, internal temp 150°F.', timer_minutes: 12, doneness_check: 'poultry' as const },
    { text: 'Serve over rice.', timer_minutes: null, doneness_check: null },
  ],
  ...over,
});

describe('recipe builder (macros come from the table, not the AI)', () => {
  it('calculates macros from the nutrition table', () => {
    const { recipe } = buildRecipe(aiRecipe(), index, profile);
    expect(recipe).not.toBeNull();
    // 200g chicken = 240 kcal / 45g P; 150g rice = 195 kcal / 4g P; 5g oil = 44 kcal
    expect(recipe!.macros).toEqual({ kcal: 479, protein_g: 49, carbs_g: 42, fat_g: 10 });
    expect(recipe!.macros_estimated).toBe(false);
    expect(recipe!.steps[1].text).toContain('165°F (74°C)');
    expect(recipe!.steps[1].text).not.toContain('150°F');
    expect(recipe!.steps[1].timer_seconds).toBe(720);
    expect(recipe!.safety[0].class).toBe('poultry');
    expect(recipe!.tags).toContain('high_protein');
  });
  it('marks unknown ingredients as estimated', () => {
    const r = aiRecipe();
    r.ingredients.push({ name: 'gochujang', grams: 30, from_fridge: false, per100g: { kcal: 220, protein: 4, carbs: 45, fat: 1 } });
    expect(buildRecipe(r, index, profile).recipe!.macros_estimated).toBe(true);
  });
  it('rejects a recipe that conflicts with an allergy', () => {
    const r = aiRecipe();
    r.ingredients.push({ name: 'parmesan', grams: 10, from_fridge: true, per100g: { kcal: 400, protein: 35, carbs: 3, fat: 26 } });
    const out = buildRecipe(r, index, { allergies: ['milk'], diet: [] });
    expect(out.recipe).toBeNull();
    expect(out.conflicts[0].reason).toMatch(/milk/);
  });
  it('divides by servings', () => {
    expect(buildRecipe(aiRecipe({ servings: 2 }), index, profile).recipe!.macros.protein_g).toBe(25);
  });
});

describe('cost estimate', () => {
  it('uses list prices', () => {
    expect(estimateCostUsd('claude-haiku-5-5', 1_000_000, 0)).toBeCloseTo(0.1);
    expect(estimateCostUsd('claude-sonnet-5-5', 0, 1_000_000)).toBeCloseTo(10);
  });
});
