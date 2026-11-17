// The exact JSON shapes the AI must return (structured outputs — can't come back malformed).
// Kept small on purpose: fewer fields = fewer output tokens = cheaper.
import { z } from 'zod';

export const ScanSchema = z.object({
  is_food_photo: z.boolean().describe('false if the photo does not show a fridge, pantry or food'),
  items: z.array(
    z.object({
      name: z.string().describe('generic grocery name, singular, e.g. "chicken breast", "greek yogurt", "spinach"'),
      amount: z.string().nullable().describe('rough visible amount, e.g. "about 500 g", "6 eggs", "half a tub", or null'),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
});
export type ScanOutput = z.infer<typeof ScanSchema>;

export const SAFETY_ENUM = ['poultry', 'ground_meat', 'whole_meat', 'fish', 'egg'] as const;

export const RecipesSchema = z.object({
  recipes: z.array(
    z.object({
      title: z.string(),
      summary: z.string().describe('one short appetizing sentence'),
      minutes: z.number().describe('total time'),
      servings: z.number(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      ingredients: z.array(
        z.object({
          name: z.string().describe('generic ingredient name'),
          grams: z.number().describe('total grams for the whole recipe'),
          from_fridge: z.boolean().describe('true if it came from the user ingredient list'),
          per100g: z
            .object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() })
            .describe('your best estimate per 100 g (only used if our nutrition table lacks it)'),
        }),
      ),
      steps: z.array(
        z.object({
          text: z.string().describe('one clear instruction, no internal temperatures'),
          timer_minutes: z.number().nullable().describe('minutes to wait in this step, or null'),
          doneness_check: z.enum(SAFETY_ENUM).nullable().describe('set when raw meat/fish/egg must be checked for doneness in this step'),
        }),
      ),
    }),
  ),
});
export type RecipesOutput = z.infer<typeof RecipesSchema>;
