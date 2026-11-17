export function grams(g: number, units: 'us' | 'metric' = 'us'): string {
  if (units === 'metric' || g < 20) return `${Math.round(g)} g`;
  const oz = g / 28.35;
  return `${Math.round(g)} g · ${oz >= 10 ? Math.round(oz) : Math.round(oz * 10) / 10} oz`;
}

export function minutesLabel(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export const ALLERGY_OPTIONS = [
  ['peanut', 'Peanuts'], ['tree_nut', 'Tree nuts'], ['milk', 'Dairy / milk'], ['egg', 'Eggs'], ['fish', 'Fish'],
  ['shellfish', 'Shellfish'], ['soy', 'Soy'], ['wheat', 'Wheat'], ['sesame', 'Sesame'],
] as const;

export const DIET_OPTIONS = [
  ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian'], ['dairy_free', 'Dairy-free'],
  ['gluten_free', 'Gluten-free'], ['halal', 'Halal'], ['kosher', 'Kosher'], ['no_pork', 'No pork'], ['no_red_meat', 'No red meat'],
] as const;

export const GLP1_NOTE = 'GLP-1 mode suggests smaller, protein-dense meals. It is not medical advice. Follow your doctor’s guidance.';
