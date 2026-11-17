// The community feed. Shared data lives in the page's database:
//   posts/<your id>    your handle + the recipes you've posted (only you can change it; the owner can moderate)
//   likes/<your id>    the posts you liked
//   reports/<your id>  the posts you reported
//   data/users/<your id>/social   who you follow / blocked (private to you)
import { findConflicts, ingredientTags } from '../../supabase/functions/_shared/allergens.ts';
import { matchFood } from '../../supabase/functions/_shared/nutrition.ts';
import { foodIndex } from './ai.ts';
import { HOUSE, HOUSE_HANDLE, HOUSE_UID } from './house.ts';
import { use, type Recipe } from './runtime.ts';

export type Post = {
  key: string; // "<author id>:<recipe id>"
  uid: string;
  handle: string;
  house: boolean;
  mine: boolean;
  recipe: Recipe;
  caption: string;
  at: number;
  likes: number;
  liked: boolean;
  reports: number;
  reported: boolean;
};
export type Social = { following: string[]; blocked: string[] };
export type FeedState = { posts: Post[]; myHandle: string | null; social: Social; canPost: boolean; online: boolean };

type Doc = { exists: boolean; id: string; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<Doc>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
type Coll = { doc(id: string): DocRef; get(): Promise<{ docs: Doc[] }> };
type DB = { collection(path: string): Coll };
type User = { id(): Promise<string | null>; can(c: string): Promise<boolean | null> };

export const REPORTS_TO_HIDE = 3;
export const MAX_POSTS = 20;

// A small first-pass word filter. Real moderation (reports + owner review) backs it up.
const BLOCKLIST = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|asshole\w*|nigg\w*|fag\w*|retard\w*|rape\w*|kill yourself|kys|whore\w*|slut\w*|dick\w*|porn\w*|nazi\w*)\b/i;
export const isClean = (text: string) => !BLOCKLIST.test(text);
export const cleanHandle = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);

/** Allergy/diet conflicts for a recipe the user didn't generate (feed or import). */
export function conflictsFor(r: Recipe, allergies: string[], diet: string[]): string[] {
  const tagged = r.ingredients.map((i) => ({ name: i.name, tags: ingredientTags(i.name, matchFood(i.name, foodIndex)) }));
  return [...new Set(findConflicts(tagged, r.steps.map((s) => s.text), allergies, diet).map((c) => c.reason.replace(/^(allergy|diet): /, '')))];
}

let ctx: Promise<{ db: DB; uid: string; canWrite: boolean } | null> | null = null;
function open() {
  return (ctx ??= (async () => {
    const [db, user] = await Promise.all([use<DB>('db'), use<User>('user')]);
    if (!db || !user) return null;
    const uid = await user.id().catch(() => null);
    if (!uid) return null;
    const can = await user.can('data.write').catch(() => null);
    return { db, uid, canWrite: can !== false };
  })());
}

const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
const housePosts = (likes: Map<string, number>, mine: Set<string>): Post[] =>
  HOUSE.map((r) => {
    const key = `${HOUSE_UID}:${r.id}`;
    return { key, uid: HOUSE_UID, handle: HOUSE_HANDLE, house: true, mine: false, recipe: r, caption: r.blurb, at: r.created_at, likes: likes.get(key) ?? 0, liked: mine.has(key), reports: 0, reported: false };
  });

export async function loadFeed(): Promise<FeedState> {
  const c = await open();
  if (!c) return { posts: housePosts(new Map(), new Set()), myHandle: null, social: { following: [], blocked: [] }, canPost: false, online: false };
  const [postDocs, likeDocs, reportDocs, socialDoc] = await Promise.all([
    c.db.collection('posts').get(),
    c.db.collection('likes').get(),
    c.db.collection('reports').get(),
    c.db.collection(`data/users/${c.uid}`).doc('social').get(),
  ]);
  const likes = new Map<string, number>();
  let myLikes = new Set<string>();
  for (const d of likeDocs.docs) {
    const keys = arr(d.data()?.keys);
    if (d.id === c.uid) myLikes = new Set(keys);
    for (const k of new Set(keys)) likes.set(k, (likes.get(k) ?? 0) + 1);
  }
  const reports = new Map<string, number>();
  let myReports = new Set<string>();
  for (const d of reportDocs.docs) {
    const keys = arr(d.data()?.keys);
    if (d.id === c.uid) myReports = new Set(keys);
    for (const k of new Set(keys)) reports.set(k, (reports.get(k) ?? 0) + 1);
  }
  const s = socialDoc.exists ? socialDoc.data() : undefined;
  const social: Social = { following: arr(s?.following), blocked: arr(s?.blocked) };
  let myHandle: string | null = null;
  const posts: Post[] = [];
  for (const d of postDocs.docs) {
    const data = d.data() ?? {};
    const handle = cleanHandle(typeof data.handle === 'string' ? data.handle : '') || 'cook';
    if (d.id === c.uid) myHandle = handle;
    const list = Array.isArray(data.posts) ? (data.posts as { recipe?: Recipe; caption?: unknown; at?: unknown }[]) : [];
    for (const p of list) {
      const r = p?.recipe;
      // other people's data is untrusted: only accept well-formed recipes
      if (!r || typeof r.id !== 'string' || typeof r.title !== 'string' || !Array.isArray(r.ingredients) || !Array.isArray(r.steps) || !r.macros) continue;
      const key = `${d.id}:${r.id}`;
      posts.push({
        key, uid: d.id, handle, house: false, mine: d.id === c.uid, recipe: r,
        caption: typeof p.caption === 'string' ? p.caption.slice(0, 200) : '',
        at: typeof p.at === 'number' ? p.at : 0,
        likes: likes.get(key) ?? 0, liked: myLikes.has(key), reports: reports.get(key) ?? 0, reported: myReports.has(key),
      });
    }
  }
  return { posts: [...posts, ...housePosts(likes, myLikes)], myHandle, social, canPost: c.canWrite, online: true };
}

async function myList(c: { db: DB; uid: string }, coll: string): Promise<string[]> {
  const d = await c.db.collection(coll).doc(c.uid).get();
  return d.exists ? arr(d.data()?.keys) : [];
}

export async function publish(recipe: Recipe, caption: string, handle: string): Promise<void> {
  const c = await open();
  if (!c) throw new Error('offline');
  const ref = c.db.collection('posts').doc(c.uid);
  const cur = await ref.get();
  const old = cur.exists && Array.isArray(cur.data()?.posts) ? (cur.data()!.posts as { recipe: Recipe }[]) : [];
  const clean: Recipe = JSON.parse(JSON.stringify({ ...recipe, fit: undefined, fit_reason: undefined, warnings: undefined }));
  const next = [{ recipe: clean, caption: caption.slice(0, 200), at: Date.now() }, ...old.filter((p) => p.recipe?.id !== recipe.id)].slice(0, MAX_POSTS);
  await ref.set({ handle: cleanHandle(handle), posts: next });
}

export async function unpublish(recipeId: string): Promise<void> {
  const c = await open();
  if (!c) return;
  const ref = c.db.collection('posts').doc(c.uid);
  const cur = await ref.get();
  if (!cur.exists) return;
  const data = cur.data()!;
  await ref.set({ ...data, posts: (data.posts as { recipe: Recipe }[]).filter((p) => p.recipe?.id !== recipeId) });
}

async function toggleKey(coll: 'likes' | 'reports', key: string, on: boolean) {
  const c = await open();
  if (!c) throw new Error('offline');
  const keys = new Set(await myList(c, coll));
  on ? keys.add(key) : keys.delete(key);
  await c.db.collection(coll).doc(c.uid).set({ keys: [...keys].slice(-500) });
}
export const setLiked = (key: string, on: boolean) => toggleKey('likes', key, on);
export const report = (key: string) => toggleKey('reports', key, true);

export async function saveSocial(social: Social): Promise<void> {
  const c = await open();
  if (!c) throw new Error('offline');
  await c.db.collection(`data/users/${c.uid}`).doc('social').set({ kind: 'social', following: social.following.slice(-500), blocked: social.blocked.slice(-500) });
}

/** Removes everything you've shared (used by "Delete my data"). */
export async function wipeCommunity(): Promise<void> {
  const c = await open();
  if (!c) return;
  await Promise.all(['posts', 'likes', 'reports'].map((coll) => c.db.collection(coll).doc(c.uid).delete().catch(() => {})));
}
