// Recipes written by the Kitchen AI test kitchen. They run through the same checks as everything else:
// macros from the nutrition table, safe temperatures added by our code.
import { buildRecipe } from '../../supabase/functions/_shared/recipe-builder.ts';
import type { RecipesOutput } from '../../supabase/functions/_shared/schemas.ts';
import { foodIndex } from './ai.ts';
import type { Recipe } from './runtime.ts';

type Draft = RecipesOutput['recipes'][number];
const ing = (name: string, grams: number) => ({ name, grams, from_fridge: true, per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 } });
const step = (text: string, timer_minutes: number | null = null, doneness_check: Draft['steps'][number]['doneness_check'] = null) => ({ text, timer_minutes, doneness_check });

const DRAFTS: (Draft & { blurb: string })[] = [
  {
    title: 'Crispy Chicken Rice Bowl', blurb: 'The weeknight default.', summary: 'Seared chicken over rice with broccoli, carrots and a soy-sesame finish.',
    minutes: 25, servings: 1, difficulty: 'easy',
    ingredients: [ing('chicken breast', 180), ing('white rice', 150), ing('broccoli', 100), ing('carrot', 50), ing('soy sauce', 10), ing('sesame seeds', 5), ing('olive oil', 5)],
    steps: [
      step('Slice the chicken into strips and season with salt and pepper.'),
      step('Sear the chicken in the oil over medium-high heat until golden on both sides.', 8, 'poultry'),
      step('Add the broccoli and carrot with a splash of water, cover, and steam until just tender.', 4),
      step('Spoon everything over the rice, drizzle with soy sauce and finish with sesame seeds.'),
    ],
  },
  {
    title: 'Lemon Salmon & Crispy Potatoes', blurb: 'Looks fancy. Isn’t.', summary: 'Pan-seared salmon with golden potatoes, wilted spinach and lemon.',
    minutes: 30, servings: 1, difficulty: 'medium',
    ingredients: [ing('salmon', 160), ing('potato', 180), ing('spinach', 80), ing('lemon juice', 10), ing('olive oil', 7)],
    steps: [
      step('Cut the potatoes into small cubes and boil in salted water until tender.', 10),
      step('Drain the potatoes, then crisp them in half the oil in a hot pan.', 8),
      step('Push the potatoes aside and cook the salmon skin-side down, then flip.', 8, 'fish'),
      step('Wilt the spinach in the pan for a minute, then squeeze the lemon over everything.', 1),
    ],
  },
  {
    title: 'Greek Yogurt Berry Bowl', blurb: 'Zero cooking, 30 grams of protein.', summary: 'Thick yogurt with blueberries, chia, almonds and a little honey.',
    minutes: 5, servings: 1, difficulty: 'easy',
    ingredients: [ing('greek yogurt nonfat', 280), ing('blueberries', 80), ing('chia seeds', 10), ing('almonds', 12), ing('honey', 8)],
    steps: [step('Spoon the yogurt into a bowl.'), step('Top with blueberries, chia seeds and chopped almonds.'), step('Drizzle with honey and eat right away.')],
  },
  {
    title: 'Turkey Taco Skillet', blurb: 'One pan, tacos for days.', summary: 'Spiced ground turkey with black beans, corn and tomato, scooped into warm tortillas.',
    minutes: 20, servings: 1, difficulty: 'easy',
    ingredients: [ing('ground turkey', 170), ing('black beans', 80), ing('corn', 50), ing('tomato', 80), ing('avocado', 40), ing('corn tortilla', 50), ing('chili powder', 3)],
    steps: [
      step('Brown the turkey in a hot skillet, breaking it up, and season with chili powder and salt.', 8, 'poultry'),
      step('Stir in the black beans, corn and chopped tomato and simmer until warmed through.', 4),
      step('Warm the tortillas in a dry pan for a few seconds per side.'),
      step('Spoon the filling into the tortillas and top with sliced avocado.'),
    ],
  },
  {
    title: 'Egg White Veggie Scramble', blurb: 'Soft, light, done in ten.', summary: 'Fluffy egg whites with spinach, mushrooms and a little feta on toast.',
    minutes: 10, servings: 1, difficulty: 'easy',
    ingredients: [ing('egg whites', 220), ing('egg', 50), ing('spinach', 50), ing('mushrooms', 60), ing('feta', 20), ing('whole wheat bread', 35), ing('olive oil', 3)],
    steps: [
      step('Cook the sliced mushrooms in the oil until golden, then add the spinach to wilt.', 4),
      step('Whisk the egg and egg whites, pour into the pan and stir gently over medium-low heat.', 3, 'egg'),
      step('Crumble the feta over the top and serve on toast.'),
    ],
  },
  {
    title: 'Peanut Tofu Noodles', blurb: 'Plant-based, properly filling.', summary: 'Crispy tofu and rice noodles tossed in a quick peanut-soy sauce with crunchy vegetables.',
    minutes: 20, servings: 1, difficulty: 'easy',
    ingredients: [ing('tofu firm', 200), ing('rice noodles', 130), ing('red bell pepper', 60), ing('carrot', 40), ing('peanut butter', 16), ing('soy sauce', 12), ing('green onion', 10), ing('vegetable oil', 4)],
    steps: [
      step('Press the tofu dry, cube it, and fry in the oil until crisp on all sides.', 8),
      step('Soak the rice noodles in hot water until soft, then drain.', 5),
      step('Whisk the peanut butter and soy sauce with a splash of hot water until smooth.'),
      step('Toss the noodles, tofu, sliced pepper and carrot in the sauce and top with green onion.'),
    ],
  },
];

export const HOUSE_UID = 'kitchen-ai';
export const HOUSE_HANDLE = 'testkitchen';

export const HOUSE: (Recipe & { blurb: string })[] = DRAFTS.flatMap((d, i) => {
  const built = buildRecipe(d, foodIndex, { allergies: [], diet: [] });
  return built.recipe ? [{ ...built.recipe, id: `house-${i + 1}`, created_at: Date.UTC(2026, 10, 1 + i), origin: 'house' as const, blurb: d.blurb }] : [];
});
