// POST { ingredients: string[], day_start?: ISO string, refresh?: boolean }
//  -> { recipes: [...3 best], target, remaining }
// Same ingredients + same settings => the saved recipes come back from the cache (no AI cost).
import { handle, json, requireUser, adminClient, anthropicKey } from '../_shared/http.ts';
import { callStructured, FriendlyError, getClient, TEXT_MODEL } from '../_shared/claude.ts';
import { RecipesSchema } from '../_shared/schemas.ts';
import { GLP1_EXTRA, RECIPES_SYSTEM } from '../_shared/prompts.ts';
import { logCacheHit, reserve, usageWriter } from '../_shared/usage.ts';
import { loadFoodIndex } from '../_shared/foods-db.ts';
import { matchFood } from '../_shared/nutrition.ts';
import { clean } from '../_shared/text.ts';
import { avoidList } from '../_shared/allergens.ts';
import { mealTarget, rankRecipes } from '../_shared/ranking.ts';
import { buildRecipe } from '../_shared/recipe-builder.ts';
import type { Profile } from '../_shared/types.ts';

const RECIPE_COLUMNS = 'id,title,summary,servings,minutes,difficulty,ingredients,steps,macros,macros_estimated,safety,tags,glp1_friendly,source,created_at';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const raw: unknown[] = Array.isArray(body.ingredients) ? body.ingredients : [];
    const list = [...new Set(raw.filter((x): x is string => typeof x === 'string').map((s) => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 40);
    if (list.length < 1) throw new FriendlyError('no_ingredients', 'Add at least one ingredient first.');

    const admin = adminClient();
    const { data: p, error: pErr } = await admin
      .from('profiles')
      .select('goal,protein_target_g,calorie_target,diet,allergies,skill,max_minutes')
      .eq('id', user.id)
      .single();
    if (pErr || !p) throw new FriendlyError('profile', 'Please finish setting up your profile first.', 400);
    const profile = p as Profile;

    // what's left to eat today (day_start comes from the phone so "today" means the user's local day)
    const now = Date.now();
    let dayStart = Date.parse(body.day_start);
    if (!Number.isFinite(dayStart) || dayStart > now || now - dayStart > 30 * 3600_000) dayStart = now - 24 * 3600_000;
    const { data: logs } = await admin.from('meal_logs').select('kcal,protein_g').eq('user_id', user.id).gte('eaten_at', new Date(dayStart).toISOString());
    const eaten = (logs ?? []).reduce((a, l) => ({ kcal: a.kcal + l.kcal, protein_g: a.protein_g + l.protein_g }), { kcal: 0, protein_g: 0 });
    const remaining = {
      kcal: (profile.calorie_target ?? 2000) - eaten.kcal,
      protein_g: (profile.protein_target_g ?? 120) - eaten.protein_g,
    };
    const target = mealTarget(profile, remaining);

    const index = await loadFoodIndex(admin);
    const have = [...new Set(list.map((n) => matchFood(n, index)?.name ?? clean(n)))].sort();
    const glp1 = profile.goal === 'glp1';
    const settingsKey = {
      v: 1,
      have,
      goal: profile.goal,
      avoid: [...profile.allergies, ...profile.diet].sort(),
      skill: profile.skill,
      max: profile.max_minutes,
      kcal: Math.round(target.kcal / 50) * 50,
      protein: Math.round(target.protein_g / 5) * 5,
    };
    const cacheKey = await sha256(JSON.stringify(settingsKey));

    // ── cache: reuse recipes we already generated for exactly this situation ──
    if (!body.refresh) {
      const { data: hit } = await admin.from('generation_cache').select('recipe_ids').eq('cache_key', cacheKey).maybeSingle();
      if (hit?.recipe_ids?.length) {
        const { data: recipes } = await admin.from('recipes').select(RECIPE_COLUMNS).in('id', hit.recipe_ids);
        if (recipes && recipes.length === hit.recipe_ids.length) {
          await logCacheHit(admin, user.id, 'generate');
          return json({ recipes: rankRecipes(recipes, profile, remaining).slice(0, 3), target, remaining, cached: true });
        }
      }
    }

    // ── one cheap text call ──
    const logId = await reserve(admin, user.id, 'generate', TEXT_MODEL);
    const request = {
      have,
      meal_target_per_serving: { kcal: target.kcal, protein_g_min: target.protein_g },
      goal: profile.goal ?? 'maintain',
      avoid: avoidList(profile.allergies, profile.diet),
      skill: profile.skill ?? 'beginner',
      max_minutes: profile.max_minutes ?? 30,
    };
    const result = await callStructured({
      client: getClient(anthropicKey()),
      model: TEXT_MODEL,
      system: RECIPES_SYSTEM + (glp1 ? GLP1_EXTRA : ''),
      content: `Make 4 recipes.\n${JSON.stringify(request)}`,
      schema: RecipesSchema,
      maxTokens: 8000,
      onUsage: usageWriter(admin, logId),
    });

    // ── server checks: macros from nutrition table, allergies/diet, safety temps ──
    const built = result.data.recipes.map((r) => buildRecipe(r, index, profile));
    const safe = built.flatMap((b) => (b.recipe ? [b.recipe] : []));
    const rejected = built.length - safe.length;
    if (!safe.length) {
      throw new FriendlyError('no_safe_recipes', 'We couldn’t make recipes that fit your allergies and diet with these ingredients. Try adding a few more items.', 422);
    }
    const top = rankRecipes(safe, profile, remaining).slice(0, 3);

    const { data: saved, error } = await admin
      .from('recipes')
      .insert(top.map(({ fit: _f, fit_reason: _r, ...r }) => ({ ...r, owner_id: user.id, source: 'fridge' })))
      .select(RECIPE_COLUMNS);
    if (error || !saved) throw new FriendlyError('server', 'Couldn’t save your recipes. Please try again.', 500);
    await admin.from('generation_cache').upsert({ cache_key: cacheKey, recipe_ids: saved.map((r) => r.id), created_at: new Date().toISOString() });

    return json({ recipes: rankRecipes(saved, profile, remaining), target, remaining, rejected });
  }),
);
