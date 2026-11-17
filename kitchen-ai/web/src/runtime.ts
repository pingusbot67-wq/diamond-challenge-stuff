// Talks to the Claude page runtime (AI, private storage, file saving) and falls back gracefully.
import type { BuiltRecipe } from '../../supabase/functions/_shared/types.ts';

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

export async function use<T>(name: string): Promise<T | null> {
  try {
    if (!window.claude?.use) return null;
    return ((await window.claude.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}

export type Goal = 'cut' | 'maintain' | 'bulk' | 'glp1';
export type WebProfile = {
  goal: Goal;
  sex: 'male' | 'female' | 'other';
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: 'low' | 'moderate' | 'high';
  protein_target_g: number;
  calorie_target: number;
  diet: string[];
  allergies: string[];
  skill: 'beginner' | 'intermediate' | 'advanced';
  max_minutes: number;
  units: 'us' | 'metric';
  scan_model: 'claude-haiku-5-5' | 'claude-sonnet-5-5';
};

export type Recipe = BuiltRecipe & { id: string; fit?: number; fit_reason?: string; created_at: number };
export type Meal = { recipe_id: string; title: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; at: number };

export type Store = {
  kind: 'cloud' | 'browser';
  getProfile(): Promise<WebProfile | null>;
  saveProfile(p: WebProfile): Promise<void>;
  listSaved(): Promise<Recipe[]>;
  setSaved(r: Recipe, saved: boolean): Promise<void>;
  getMeals(day: string): Promise<Meal[]>;
  addMeal(day: string, meal: Meal): Promise<void>;
  wipe(): Promise<void>;
};

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── private cloud storage (each person's data is visible only to them) ──
type Doc = { exists: boolean; id: string; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<Doc>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
type Coll = { doc(id: string): DocRef; where(f: string, op: string, v: unknown): { get(): Promise<{ docs: Doc[] }> }; get(): Promise<{ docs: Doc[] }> };
type DB = { collection(path: string): Coll };
type User = { id(): Promise<string | null> };

function cloudStore(db: DB, uid: string): Store {
  const col = db.collection(`data/users/${uid}`);
  return {
    kind: 'cloud',
    async getProfile() {
      const d = await col.doc('profile').get();
      return d.exists ? ((d.data() as { profile: WebProfile }).profile ?? null) : null;
    },
    async saveProfile(p) {
      await col.doc('profile').set({ kind: 'profile', profile: p });
    },
    async listSaved() {
      const snap = await col.where('kind', '==', 'saved').get();
      return snap.docs
        .map((d) => d.data() as { recipe: Recipe; saved_at: number })
        .sort((a, b) => b.saved_at - a.saved_at)
        .map((d) => d.recipe);
    },
    async setSaved(r, saved) {
      const ref = col.doc(`saved_${r.id}`);
      if (saved) await ref.set({ kind: 'saved', saved_at: Date.now(), recipe: JSON.parse(JSON.stringify(r)) });
      else await ref.delete();
    },
    async getMeals(day) {
      const d = await col.doc(`meals_${day}`).get();
      return d.exists ? ((d.data() as { items: Meal[] }).items ?? []) : [];
    },
    async addMeal(day, meal) {
      const items = await this.getMeals(day);
      await col.doc(`meals_${day}`).set({ kind: 'meals', day, items: [...items, meal] });
    },
    async wipe() {
      const snap = await col.get();
      for (const d of snap.docs) await col.doc(d.id).delete();
    },
  };
}

// ── fallback: this browser only ──
function browserStore(): Store {
  const read = <T>(k: string, d: T): T => {
    try {
      const v = localStorage.getItem(`kai:${k}`);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  };
  const write = (k: string, v: unknown) => {
    try {
      localStorage.setItem(`kai:${k}`, JSON.stringify(v));
    } catch {
      /* storage blocked: keep going in memory */
    }
  };
  return {
    kind: 'browser',
    async getProfile() {
      return read<WebProfile | null>('profile', null);
    },
    async saveProfile(p) {
      write('profile', p);
    },
    async listSaved() {
      return read<Recipe[]>('saved', []);
    },
    async setSaved(r, saved) {
      const list = read<Recipe[]>('saved', []).filter((x) => x.id !== r.id);
      write('saved', saved ? [r, ...list] : list);
    },
    async getMeals(day) {
      return read<Meal[]>(`meals_${day}`, []);
    },
    async addMeal(day, meal) {
      write(`meals_${day}`, [...read<Meal[]>(`meals_${day}`, []), meal]);
    },
    async wipe() {
      try {
        Object.keys(localStorage).filter((k) => k.startsWith('kai:')).forEach((k) => localStorage.removeItem(k));
      } catch {
        /* nothing to wipe */
      }
    },
  };
}

export async function openStore(): Promise<Store> {
  const [db, user] = await Promise.all([use<DB>('db'), use<User>('user')]);
  if (db && user) {
    try {
      const uid = await user.id();
      if (uid) return cloudStore(db, uid);
    } catch {
      /* fall through */
    }
  }
  return browserStore();
}

// ── saving a file (the share card) ──
type Downloads = { save(o: { filename: string; data: Blob }): Promise<void> };
export const downloads = () => use<Downloads>('downloads');
