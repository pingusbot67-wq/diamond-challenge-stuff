// AI calls, made through the viewer's own Claude account (no API key, no separate bill).
// Same prompts as the app's server. Everything the AI returns is then checked by our own code:
// macros from the nutrition table, allergies/diet, and USDA safe temperatures.
import { GLP1_EXTRA, RECIPES_SYSTEM, SCAN_SYSTEM } from '../../supabase/functions/_shared/prompts.ts';
import { FOODS } from '../../supabase/functions/_shared/foods.generated.ts';
import { buildFoodIndex, matchFood, normalizeScanItems } from '../../supabase/functions/_shared/nutrition.ts';
import { clean } from '../../supabase/functions/_shared/text.ts';
import { avoidList } from '../../supabase/functions/_shared/allergens.ts';
import { mealTarget, rankRecipes, type Remaining } from '../../supabase/functions/_shared/ranking.ts';
import { buildRecipe } from '../../supabase/functions/_shared/recipe-builder.ts';
import type { RecipesOutput } from '../../supabase/functions/_shared/schemas.ts';
import type { Profile, SafetyClass } from '../../supabase/functions/_shared/types.ts';
import { use, type Recipe, type WebProfile } from './runtime.ts';

export const foodIndex = buildFoodIndex(FOODS);
export const FOOD_NAMES = [...new Set(FOODS.flatMap((f) => [f.name, ...f.aliases]))].sort();

type SampleOpts = { images?: Blob[]; model?: string; modelTier?: 'quick' | 'default' | 'complex'; effort?: 'low'; cache?: boolean };
type Sample = ((input: string, opts?: SampleOpts) => Promise<{ text: string; truncated: boolean; modelApplied?: string }>) & {
  limits(): Promise<{ images?: { maxCount: number } }>;
};
export type AiError = { code: string; message?: string };

let samplePromise: Promise<Sample | null> | null = null;
export const getSample = () => (samplePromise ??= use<Sample>('sample'));

export async function canSendImages(): Promise<boolean> {
  const s = await getSample();
  if (!s) return false;
  try {
    return !!(await s.limits()).images;
  } catch {
    return false;
  }
}

export const MODEL_LABEL: Record<string, string> = { 'claude-haiku-5-5': 'Haiku 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5' };

export function aiMessage(e: unknown): string {
  const code = (e as AiError)?.code;
  switch (code) {
    case 'no_runtime':
      return 'Open this page on claude.ai (signed in) to use the AI features.';
    case 'not_granted':
      return 'This page isn’t allowed to use Claude yet. Reload the page and choose Allow when asked.';
    case 'sampling_disabled':
      return 'Claude isn’t available on this account right now.';
    case 'rate_limited':
      return 'You’ve reached a usage limit for now. Try again in a few minutes.';
    case 'session_expired':
      return 'Please sign in to Claude again, then try again.';
    case 'image_rejected':
      return 'That photo couldn’t be read. Try another one (a JPEG or PNG works best).';
    case 'images_unavailable':
      return 'Photo scanning isn’t available here. Type your ingredients instead.';
    case 'refused':
      return 'Claude couldn’t help with that one. Try a different photo or different ingredients.';
    case 'invalid_json':
    case 'empty_completion':
    case 'bad_output':
      return 'The answer came back in the wrong shape. Please try again.';
    case 'no_safe_recipes':
      return 'We couldn’t make recipes that fit your allergies and diet with these ingredients. Try adding a few more items.';
    default:
      return 'Couldn’t reach Claude. Check your connection and try again.';
  }
}

/** Reads the first JSON object in a reply, tolerating a sentence or code fence around it. */
function parseLoose(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b < a) throw { code: 'bad_output' };
  try {
    return JSON.parse(body.slice(a, b + 1));
  } catch {
    throw { code: 'bad_output' };
  }
}

const num = (x: unknown, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
const str = (x: unknown, d = '') => (typeof x === 'string' ? x : d);

// ── photos: shrink before sending (same rule as the app: 1024px, JPEG 70%) ──
export async function shrinkPhoto(file: Blob): Promise<{ blob: Blob; url: string }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.7));
    if (blob) return { blob, url: URL.createObjectURL(blob) };
  } catch {
    /* an odd format: let Claude's runtime downsize it instead */
  }
  return { blob: file, url: URL.createObjectURL(file) };
}

export type ScanItem = { name: string; amount: string | null; confidence: 'high' | 'medium' | 'low'; matched?: boolean };
export type ScanResult = { items: ScanItem[]; notFood: boolean; model: string; answeredBy: string; seconds: number };

const SCAN_FORMAT = `Reply with only JSON like {"is_food_photo": true, "items": [{"name": "chicken breast", "amount": "about 500 g", "confidence": "high"}]}. "amount" may be null. "confidence" is "high", "medium" or "low".`;

export async function scanFridge(photo: Blob, model: string): Promise<ScanResult> {
  const sample = await getSample();
  if (!sample) throw { code: 'no_runtime' };
  const t0 = performance.now();
  const res = await sample(`${SCAN_SYSTEM}\nThe image is a photo of the user's fridge or pantry.\n${SCAN_FORMAT}`, {
    images: [photo],
    model,
    modelTier: model.includes('sonnet') ? 'default' : 'quick',
    effort: 'low',
  });
  const raw = parseLoose(res.text) as { is_food_photo?: unknown; items?: unknown };
  const list = Array.isArray(raw.items) ? raw.items : [];
  const items = list
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !!str((i as Record<string, unknown>).name).trim())
    .map((i) => ({
      name: str(i.name),
      amount: str(i.amount) || null,
      confidence: (['high', 'medium', 'low'].includes(str(i.confidence)) ? i.confidence : 'medium') as ScanItem['confidence'],
    }));
  const order = { high: 0, medium: 1, low: 2 } as const;
  const tidy = normalizeScanItems(items.slice(0, 60), foodIndex)
    .sort((a, b) => order[a.confidence] - order[b.confidence])
    .map((i) => ({ name: i.display, amount: i.amount, confidence: i.confidence, matched: i.matched }));
  return {
    items: tidy,
    notFood: raw.is_food_photo === false,
    model,
    answeredBy: res.modelApplied ?? 'a fallback model',
    seconds: (performance.now() - t0) / 1000,
  };
}

// ── recipes ──
const SAFETY: SafetyClass[] = ['poultry', 'ground_meat', 'whole_meat', 'fish', 'egg'];
const RECIPES_FORMAT = `Reply with only JSON like {"recipes": [{"title": "...", "summary": "...", "minutes": 20, "servings": 1, "difficulty": "easy", "ingredients": [{"name": "chicken breast", "grams": 200, "from_fridge": true, "per100g": {"kcal": 120, "protein": 22.5, "carbs": 0, "fat": 2.6}}], "steps": [{"text": "...", "timer_minutes": null, "doneness_check": null}]}]}.
"difficulty" is easy, medium or hard. "doneness_check" is one of poultry, ground_meat, whole_meat, fish, egg, or null.`;

function normalizeRecipes(raw: unknown): RecipesOutput['recipes'] {
  const r = raw as { recipes?: unknown };
  const arr = Array.isArray(r?.recipes) ? r.recipes : [];
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      title: str(x.title, 'High-protein meal'),
      summary: str(x.summary),
      minutes: num(x.minutes, 20),
      servings: num(x.servings, 1),
      difficulty: (['easy', 'medium', 'hard'].includes(str(x.difficulty)) ? x.difficulty : 'easy') as 'easy' | 'medium' | 'hard',
      ingredients: (Array.isArray(x.ingredients) ? x.ingredients : [])
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !!str((i as Record<string, unknown>).name).trim())
        .map((i) => {
          const p = (i.per100g ?? {}) as Record<string, unknown>;
          return {
            name: str(i.name),
            grams: num(i.grams),
            from_fridge: !!i.from_fridge,
            per100g: { kcal: num(p.kcal), protein: num(p.protein), carbs: num(p.carbs), fat: num(p.fat) },
          };
        }),
      steps: (Array.isArray(x.steps) ? x.steps : [])
        .map((s) => {
          if (typeof s === 'string') return { text: s, timer_minutes: null, doneness_check: null };
          const o = (s ?? {}) as Record<string, unknown>;
          const t = num(o.timer_minutes, 0);
          return {
            text: str(o.text),
            timer_minutes: t > 0 ? t : null,
            doneness_check: SAFETY.includes(o.doneness_check as SafetyClass) ? (o.doneness_check as SafetyClass) : null,
          };
        })
        .filter((s) => s.text.trim()),
    }))
    .filter((x) => x.ingredients.length && x.steps.length);
}

export function asProfile(p: WebProfile): Profile {
  return {
    goal: p.goal,
    protein_target_g: p.protein_target_g,
    calorie_target: p.calorie_target,
    diet: p.diet,
    allergies: p.allergies,
    skill: p.skill,
    max_minutes: p.max_minutes,
  };
}

export async function makeRecipes(ingredients: string[], web: WebProfile, remaining: Remaining, fresh: boolean) {
  const sample = await getSample();
  if (!sample) throw { code: 'no_runtime' };
  const profile = asProfile(web);
  const target = mealTarget(profile, remaining);
  const have = [...new Set(ingredients.map((n) => matchFood(n, foodIndex)?.name ?? clean(n)))].sort();
  const request = {
    have,
    meal_target_per_serving: { kcal: target.kcal, protein_g_min: target.protein_g },
    goal: profile.goal,
    avoid: avoidList(profile.allergies, profile.diet),
    skill: profile.skill,
    max_minutes: profile.max_minutes,
  };
  const prompt = `${RECIPES_SYSTEM}${profile.goal === 'glp1' ? GLP1_EXTRA : ''}\n\nMake 4 recipes.\n${JSON.stringify(request)}\n\n${RECIPES_FORMAT}`;
  // the same ingredients + settings within 5 minutes replay the saved answer at no cost; "different ones" always asks again
  const res = await sample(prompt, { model: 'claude-haiku-5-5', modelTier: 'quick', effort: 'low', cache: fresh ? false : true });
  const drafts = normalizeRecipes(parseLoose(res.text));
  const built = drafts.map((d) => buildRecipe(d, foodIndex, profile));
  const safe = built.flatMap((b) => (b.recipe ? [b.recipe] : []));
  if (!safe.length) throw { code: drafts.length ? 'no_safe_recipes' : 'bad_output' };
  const stamp = Date.now();
  const top = rankRecipes(safe, profile, remaining)
    .slice(0, 3)
    .map((r, i): Recipe => ({ ...r, id: `r${stamp.toString(36)}${i}`, created_at: stamp }));
  return { recipes: top, target, rejected: built.length - safe.length };
}
