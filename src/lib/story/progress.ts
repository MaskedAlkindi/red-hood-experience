"use client";

import { useSyncExternalStore } from "react";
import type { HistoryEntry, Step } from "./types";

/** Viewer progress, persisted in localStorage (local-only, no accounts). */
export interface Progress {
  v: 1;
  /** Where to resume. */
  current: { step: Step; time: number } | null;
  /** Choices made on the current run, in order. */
  history: HistoryEntry[];
  endings: Record<string, { unlockedAt: number; times: number; path: string[] }>;
  seenScenes: string[];
  choicesMade: string[];
  updatedAt: number;
}

export interface Settings {
  volume: number;
  muted: boolean;
  showOriginalMenus: boolean;
}

const KEY = "rhx.progress.v1";
const SKEY = "rhx.settings.v1";

const empty = (): Progress => ({
  v: 1,
  current: null,
  history: [],
  endings: {},
  seenScenes: [],
  choicesMade: [],
  updatedAt: 0,
});
const defaultSettings: Settings = { volume: 0.9, muted: false, showOriginalMenus: false };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota) – keep in memory */
  }
}

// --- tiny external store so every component sees the same progress -------------------
type Listener = () => void;
const listeners = new Set<Listener>();
let progressCache: Progress | null = null;
let settingsCache: Settings | null = null;
const SERVER_PROGRESS = empty();

function getProgress(): Progress {
  if (!progressCache) progressCache = read(KEY, empty());
  return progressCache;
}
function getSettings(): Settings {
  if (!settingsCache) settingsCache = read(SKEY, defaultSettings);
  return settingsCache;
}
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: Listener) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) progressCache = null;
    if (e.key === SKEY) settingsCache = null;
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function updateProgress(fn: (p: Progress) => Progress) {
  progressCache = { ...fn(getProgress()), updatedAt: Date.now() };
  write(KEY, progressCache);
  emit();
}

export function updateSettings(patch: Partial<Settings>) {
  settingsCache = { ...getSettings(), ...patch };
  write(SKEY, settingsCache);
  emit();
}

export function resetProgress() {
  progressCache = empty();
  write(KEY, progressCache);
  emit();
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, getProgress, () => SERVER_PROGRESS);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, () => defaultSettings);
}

/** True after hydration (avoids rendering progress-dependent UI on the server). */
export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// --- progress mutations used by the player ----------------------------------------------
const uniqPush = (arr: string[], v: string) => (arr.includes(v) ? arr : [...arr, v]);

export const progressActions = {
  setCurrent(step: Step, time: number) {
    updateProgress((p) => ({ ...p, current: { step, time } }));
  },
  sawScene(sceneId: string) {
    updateProgress((p) => ({ ...p, seenScenes: uniqPush(p.seenScenes, sceneId) }));
  },
  recordChoice(entry: HistoryEntry) {
    updateProgress((p) => ({
      ...p,
      history: [...p.history.filter((h) => h.decisionId !== entry.decisionId), entry],
      choicesMade: uniqPush(p.choicesMade, entry.choiceId),
    }));
  },
  setHistory(history: HistoryEntry[]) {
    updateProgress((p) => ({ ...p, history }));
  },
  unlockEnding(id: string, path: string[]) {
    updateProgress((p) => {
      const prev = p.endings[id];
      return {
        ...p,
        endings: {
          ...p.endings,
          [id]: { unlockedAt: prev?.unlockedAt ?? Date.now(), times: (prev?.times ?? 0) + 1, path },
        },
      };
    });
  },
  clearCurrent() {
    updateProgress((p) => ({ ...p, current: null }));
  },
};
