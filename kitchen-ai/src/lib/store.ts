// Tiny in-memory store to pass data between screens (scan results, generated recipes).
import { useSyncExternalStore } from 'react';
import type { Recipe, ScanItem } from './types';

type State = { photoUri: string | null; photoBase64: string | null; items: ScanItem[]; recipes: Recipe[]; target: { kcal: number; protein_g: number } | null };
let state: State = { photoUri: null, photoBase64: null, items: [], recipes: [], target: null };
const listeners = new Set<() => void>();

export const flow = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  reset() {
    flow.set({ photoUri: null, photoBase64: null, items: [], recipes: [], target: null });
  },
};

export function useFlow(): State {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => state);
}
