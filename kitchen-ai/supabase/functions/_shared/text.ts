// Small text helpers shared by matching, allergen and safety checks.

const DESCRIPTORS = new Set([
  'fresh', 'frozen', 'raw', 'organic', 'large', 'small', 'medium', 'chopped', 'diced', 'sliced', 'minced', 'shredded',
  'grated', 'boneless', 'skinless', 'bone-in', 'skin-on', 'lean', 'extra', 'whole', 'halved', 'cubed', 'trimmed', 'peeled',
  'plain', 'unsweetened', 'low-fat', 'leftover', 'of', 'a', 'an', 'the', 'some', 'pack', 'package', 'bag', 'container',
  'can', 'jar', 'bottle', 'block', 'carton', 'tub', 'bunch', 'head', 'piece', 'pieces', 'about', 'approx', 'and', 'or',
  'g', 'kg', 'oz', 'lb', 'lbs', 'ml', 'l', 'cup', 'cups', 'tbsp', 'tsp', 'pinch', 'handful', 'thinly', 'finely', 'roughly',
]);

/** lowercase, strip brackets/punctuation/numbers, collapse spaces */
export function clean(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(\d{2})\s*\/\s*\d{1,2}\b/g, '$1%') // "80/20 beef" -> "80% beef"
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => (/^\s*\d{1,3}\s*%\s*$/.test(inner) ? ` ${inner.trim()} ` : ' '))
    .replace(/[^a-z0-9%\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}

/** meaningful words, singular, without descriptors or quantities */
export function tokens(s: string): string[] {
  return clean(s)
    .split(' ')
    .filter((w) => w && !DESCRIPTORS.has(w) && !(/^\d/.test(w) && !w.endsWith('%'))) // keep "2%", drop "200"/"2" 
    .map(singular);
}

/** order-independent key: "2% greek yogurt" == "greek yogurt 2%" */
export function key(s: string): string {
  return [...new Set(tokens(s))].sort().join(' ');
}

/** word-boundary test for a phrase inside already-cleaned text */
export function hasPhrase(text: string, phrase: string): boolean {
  const p = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  return new RegExp(`(^|[^a-z])${p}(?=$|[^a-z])`).test(text);
}
