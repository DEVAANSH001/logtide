import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = (projectId: string) => `logtide:columns:${projectId}`;

export interface ColumnConfigStore extends Writable<string[]> {
  add: (key: string) => void;
  remove: (key: string) => void;
}

export function createColumnConfigStore(projectId: string): ColumnConfigStore {
  const initial: string[] = browser
    ? (() => {
        try {
          const raw = localStorage.getItem(KEY(projectId));
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
        } catch {
          return [];
        }
      })()
    : [];

  const store = writable<string[]>(initial);
  const { subscribe, set, update } = store;

  const persist = (keys: string[]) => {
    if (browser) {
      try {
        localStorage.setItem(KEY(projectId), JSON.stringify(keys));
      } catch {
        // quota exceeded, ignore
      }
    }
  };

  return {
    subscribe,
    set: (keys: string[]) => {
      persist(keys);
      set(keys);
    },
    update: (updater) =>
      update((cur) => {
        const next = updater(cur);
        persist(next);
        return next;
      }),
    add: (key: string) =>
      update((cur) => {
        const trimmed = key.trim();
        if (!trimmed || cur.includes(trimmed)) return cur;
        const next = [...cur, trimmed];
        persist(next);
        return next;
      }),
    remove: (key: string) =>
      update((cur) => {
        const next = cur.filter((k) => k !== key);
        persist(next);
        return next;
      }),
  };
}
