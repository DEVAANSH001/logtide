import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

export type TimeRangeType = 'last_hour' | 'last_24h' | 'last_7d' | 'custom';

interface ObserveContextState {
  selectedProjects: string[];
  timeRangeType: TimeRangeType;
  customFrom: string;
  customTo: string;
}

const STORAGE_KEY = 'logtide_observe_context';

const VALID_TIME_RANGE_TYPES: TimeRangeType[] = ['last_hour', 'last_24h', 'last_7d', 'custom'];

const DEFAULTS: ObserveContextState = {
  selectedProjects: [],
  timeRangeType: 'last_24h',
  customFrom: '',
  customTo: '',
};

function loadInitialState(): ObserveContextState {
  if (!browser) return DEFAULTS;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;

    const parsed = JSON.parse(raw);

    const timeRangeType = VALID_TIME_RANGE_TYPES.includes(parsed.timeRangeType)
      ? parsed.timeRangeType
      : DEFAULTS.timeRangeType;

    const selectedProjects = Array.isArray(parsed.selectedProjects)
      ? parsed.selectedProjects.filter((p: unknown) => typeof p === 'string')
      : DEFAULTS.selectedProjects;

    const customFrom = typeof parsed.customFrom === 'string' ? parsed.customFrom : DEFAULTS.customFrom;
    const customTo = typeof parsed.customTo === 'string' ? parsed.customTo : DEFAULTS.customTo;

    return { selectedProjects, timeRangeType, customFrom, customTo };
  } catch {
    return DEFAULTS;
  }
}

function persist(state: ObserveContextState) {
  if (browser) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage unavailable
    }
  }
}

function createObserveContextStore() {
  const initialState = loadInitialState();
  const { subscribe, set, update } = writable<ObserveContextState>(initialState);

  return {
    subscribe,

    setProjects: (projects: string[]) => {
      update((state) => {
        const newState = { ...state, selectedProjects: projects };
        persist(newState);
        return newState;
      });
    },

    setTimeRange: (type: TimeRangeType, customFrom?: string, customTo?: string) => {
      update((state) => {
        const newState = {
          ...state,
          timeRangeType: type,
          customFrom: customFrom ?? (type === 'custom' ? state.customFrom : ''),
          customTo: customTo ?? (type === 'custom' ? state.customTo : ''),
        };
        persist(newState);
        return newState;
      });
    },

    getTimeRange: (): { from: Date; to: Date } => {
      const state = get({ subscribe });
      const now = new Date();

      switch (state.timeRangeType) {
        case 'last_hour':
          return { from: new Date(now.getTime() - 60 * 60 * 1000), to: now };
        case 'last_24h':
          return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
        case 'last_7d':
          return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
        case 'custom': {
          const from = state.customFrom ? new Date(state.customFrom) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const to = state.customTo ? new Date(state.customTo) : now;
          return { from, to };
        }
        default:
          return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
      }
    },

    clear: () => {
      set(DEFAULTS);
      if (browser) {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // sessionStorage unavailable
        }
      }
    },
  };
}

export const observeContextStore = createObserveContextStore();

export const selectedProjects = derived(
  observeContextStore,
  ($state) => $state.selectedProjects,
);

export const timeRangeType = derived(
  observeContextStore,
  ($state) => $state.timeRangeType,
);
