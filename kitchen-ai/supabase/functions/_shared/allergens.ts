// Server-side allergy + diet check. We never rely on the AI alone:
// every ingredient (and every step) is scanned for allergen words AND checked
// against the nutrition table's tags. If anything conflicts, the recipe is rejected.
import type { Food } from './types.ts';
import { clean, hasPhrase } from './text.ts';

export const ALLERGENS = ['peanut', 'tree_nut', 'milk', 'egg', 'fish', 'shellfish', 'soy', 'wheat', 'gluten', 'sesame'] as const;
export const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'dairy_free', 'gluten_free', 'halal', 'kosher', 'no_pork', 'no_red_meat'] as const;

// Phrases that LOOK like an allergen word but aren't (removed before scanning).
const SAFE_PHRASES = [
  'peanut butter', 'almond butter', 'cashew butter', 'nut butter', 'sunflower butter', 'seed butter', 'cocoa butter', 'apple butter',
  'coconut milk', 'coconut cream', 'coconut yogurt', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'cashew milk', 'hemp milk',
  'cream of tartar', 'butternut', 'eggplant', 'aubergine', 'egg-free', 'egg free', 'dairy-free', 'dairy free', 'vegan butter',
  'vegan cheese', 'vegan mayo', 'butter lettuce', 'cream soda', 'nutmeg', 'rice noodle', 'rice noodles', 'corn tortilla', 'corn tortillas',
  'almond flour', 'coconut flour', 'rice flour', 'oat flour', 'chickpea flour', 'corn flour', 'buckwheat', 'gluten-free', 'gluten free',
];
// NB: the safe phrases only hide the misleading word; e.g. "peanut butter" still triggers peanut via its own rule below.

const RULES: Record<string, string[]> = {
  peanut: ['peanut', 'peanuts', 'peanut butter', 'groundnut', 'satay'],
  tree_nut: ['almond', 'almonds', 'almond butter', 'almond milk', 'almond flour', 'walnut', 'walnuts', 'cashew', 'cashews', 'cashew butter',
    'cashew milk', 'pecan', 'pecans', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'macadamia', 'brazil nut', 'brazil nuts',
    'pine nut', 'pine nuts', 'praline', 'marzipan', 'nutella', 'pesto', 'nut butter', 'mixed nuts', 'nuts'],
  milk: ['milk', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'parmigiano', 'feta', 'ricotta', 'yogurt', 'yoghurt', 'butter', 'cream',
    'whey', 'casein', 'kefir', 'ghee', 'skyr', 'half and half', 'buttermilk', 'paneer', 'quark', 'cottage', 'brie', 'gouda', 'halloumi',
    'mascarpone', 'queso', 'fairlife', 'protein powder', 'ice cream', 'tzatziki', 'ranch', 'alfredo', 'custard', 'creme fraiche'],
  egg: ['egg', 'eggs', 'egg white', 'egg whites', 'egg yolk', 'mayonnaise', 'mayo', 'meringue', 'aioli', 'egg noodles', 'frittata', 'omelet', 'omelette', 'quiche'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'sardine', 'sardines', 'anchovy', 'anchovies', 'mackerel', 'bass',
    'haddock', 'pollock', 'mahi', 'swordfish', 'catfish', 'snapper', 'herring', 'fish sauce', 'worcestershire', 'lox', 'kimchi', 'caesar'],
  shellfish: ['shrimp', 'shrimps', 'prawn', 'prawns', 'crab', 'lobster', 'scallop', 'scallops', 'clam', 'clams', 'mussel', 'mussels', 'oyster',
    'oysters', 'oyster sauce', 'crawfish', 'crayfish', 'squid', 'calamari', 'octopus'],
  soy: ['soy', 'soya', 'soy sauce', 'tofu', 'tempeh', 'edamame', 'miso', 'tamari', 'shoyu', 'natto', 'teriyaki', 'soybean', 'soybeans', 'hoisin'],
  wheat: ['wheat', 'flour', 'bread', 'breadcrumbs', 'bread crumbs', 'pasta', 'spaghetti', 'penne', 'macaroni', 'noodle', 'noodles', 'couscous',
    'bulgur', 'farro', 'seitan', 'tortilla', 'tortillas', 'wrap', 'wraps', 'bagel', 'pita', 'naan', 'panko', 'cracker', 'crackers', 'semolina',
    'orzo', 'udon', 'ramen', 'soy sauce', 'teriyaki', 'hoisin', 'english muffin', 'croutons', 'spelt', 'durum', 'gnocchi', 'dumpling', 'bun', 'buns', 'sourdough'],
  gluten: ['barley', 'rye', 'malt', 'brewer', 'beer'],
  sesame: ['sesame', 'tahini', 'hummus', 'zaatar', "za'atar", 'furikake'],
};
// gluten also covers everything wheat covers
RULES.gluten = [...RULES.gluten, ...RULES.wheat];

const MEAT: Record<string, string[]> = {
  poultry: ['chicken', 'turkey', 'duck', 'goose', 'quail', 'hen'],
  beef: ['beef', 'steak', 'sirloin', 'ribeye', 'flank', 'brisket', 'veal', 'hamburger', 'burger', 'meatball', 'meatballs', 'jerky', 'bison', 'venison', 'chuck'],
  pork: ['pork', 'bacon', 'ham', 'prosciutto', 'pancetta', 'chorizo', 'pepperoni', 'salami', 'sausage', 'sausages', 'lard', 'carnitas'],
  lamb: ['lamb', 'mutton', 'goat'],
  other_meat: ['gelatin', 'gelatine', 'broth', 'stock', 'bone broth'], // treated as meat unless "vegetable"
};
// "vegan sausage", "plant-based burger", "vegetable broth" are not meat — remove just those phrases before scanning.
const PLANT_QUALIFIED = /\b(vegan|vegetarian|plant[- ]based|meatless|veggie|beyond|impossible|soy|tofu)\s+[a-z]+|\b(vegetable|veggie|mushroom|miso|dashi)\s+(broth|stock)/g;
const ANIMAL_EXTRA = ['honey', 'gelatin', 'gelatine'];
const ALCOHOL = ['wine', 'beer', 'rum', 'vodka', 'brandy', 'sake', 'mirin', 'bourbon', 'whiskey', 'tequila', 'sherry', 'marsala'];

function stripSafe(text: string): string {
  let t = ` ${text} `;
  for (const p of SAFE_PHRASES) t = t.split(p).join(' ');
  return t;
}

/** All allergen / diet tags found in a piece of text (an ingredient name or a step). */
export function detectTags(raw: string): Set<string> {
  const text = clean(raw);
  const tags = new Set<string>();
  const stripped = stripSafe(text);
  for (const [tag, words] of Object.entries(RULES)) {
    // nut/peanut words are checked on the full text (so "peanut butter" -> peanut), dairy words on the stripped text
    const hay = tag === 'peanut' || tag === 'tree_nut' || tag === 'soy' ? text : stripped;
    if (words.some((w) => hasPhrase(hay, w))) tags.add(tag);
  }
  const meatText = text.replace(PLANT_QUALIFIED, ' ');
  for (const [kind, words] of Object.entries(MEAT)) {
    if (words.some((w) => hasPhrase(meatText, w))) {
      tags.add('meat');
      if (kind !== 'other_meat') tags.add(kind);
    }
  }
  if (ANIMAL_EXTRA.some((w) => hasPhrase(text, w))) tags.add('animal');
  if (ALCOHOL.some((w) => hasPhrase(text, w))) tags.add('alcohol');
  if (tags.has('milk') || tags.has('egg') || tags.has('meat') || tags.has('fish') || tags.has('shellfish')) tags.add('animal');
  return tags;
}

/** Tags for one ingredient: nutrition-table tags + words in the name (union = safest). */
export function ingredientTags(name: string, food: Food | null): Set<string> {
  const tags = detectTags(name);
  for (const t of food?.tags ?? []) tags.add(t);
  if (tags.has('wheat')) tags.add('gluten');
  return tags;
}

const DIET_FORBIDS: Record<string, string[]> = {
  vegetarian: ['meat', 'poultry', 'beef', 'pork', 'lamb', 'fish', 'shellfish'],
  vegan: ['meat', 'poultry', 'beef', 'pork', 'lamb', 'fish', 'shellfish', 'animal', 'milk', 'egg'],
  pescatarian: ['meat', 'poultry', 'beef', 'pork', 'lamb'],
  dairy_free: ['milk'],
  gluten_free: ['gluten', 'wheat'],
  halal: ['pork', 'alcohol'],
  kosher: ['pork', 'shellfish'],
  no_pork: ['pork'],
  no_red_meat: ['beef', 'pork', 'lamb'],
};

export type Conflict = { ingredient: string; reason: string };

/**
 * Returns every conflict between a recipe and the user's allergies/diet.
 * Empty array = safe to show.
 */
export function findConflicts(
  ingredients: { name: string; tags: Set<string> }[],
  steps: string[],
  allergies: string[],
  diet: string[],
): Conflict[] {
  const out: Conflict[] = [];
  const forbidden = new Map<string, string>();
  for (const a of allergies) forbidden.set(a, `allergy: ${a.replace('_', ' ')}`);
  for (const d of diet) for (const t of DIET_FORBIDS[d] ?? []) if (!forbidden.has(t)) forbidden.set(t, `diet: ${d.replace('_', ' ')}`);

  for (const ing of ingredients) {
    for (const t of ing.tags) if (forbidden.has(t)) out.push({ ingredient: ing.name, reason: forbidden.get(t)! });
  }
  // steps can sneak things in ("top with sesame seeds") — check allergens there too
  for (const s of steps) {
    const tags = detectTags(s);
    for (const t of tags) {
      if (allergies.includes(t)) out.push({ ingredient: `step: "${s.slice(0, 40)}…"`, reason: forbidden.get(t)! });
    }
  }
  // kosher: no meat + dairy together
  if (diet.includes('kosher')) {
    const all = ingredients.flatMap((i) => [...i.tags]);
    if ((all.includes('meat') || all.includes('poultry')) && all.includes('milk')) out.push({ ingredient: 'meat + dairy', reason: 'diet: kosher' });
  }
  // one line per ingredient + reason
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.ingredient}|${c.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Plain words the AI is told to avoid (keeps the prompt short). */
export function avoidList(allergies: string[], diet: string[]): string[] {
  const words: Record<string, string> = {
    peanut: 'peanuts', tree_nut: 'tree nuts', milk: 'dairy', egg: 'eggs', fish: 'fish', shellfish: 'shellfish', soy: 'soy',
    wheat: 'wheat', gluten: 'gluten', sesame: 'sesame', vegetarian: 'meat/fish', vegan: 'all animal products', pescatarian: 'meat',
    dairy_free: 'dairy', gluten_free: 'gluten', halal: 'pork, alcohol', kosher: 'pork, shellfish, mixing meat and dairy',
    no_pork: 'pork', no_red_meat: 'red meat',
  };
  return [...new Set([...allergies, ...diet].map((x) => words[x]).filter(Boolean))];
}
