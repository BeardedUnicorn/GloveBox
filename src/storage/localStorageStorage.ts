/**
 * Storage for a plain browser (`pnpm dev` without Tauri): everything in
 * localStorage under `glovebox:` keys. localStorage can be missing, can
 * throw (private windows, a full quota) or can hold something unreadable;
 * then this keeps working from memory for the rest of the visit.
 */

import type { SessionRecord } from '../progression/types';
import { byNewest, byOldest, type Storage, type StoredLesson } from './types';

/** The part of the Web Storage API this uses. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = 'glovebox:';
const LESSONS = `${PREFIX}lessons`;
const SESSIONS = `${PREFIX}sessions`;
const setting = (key: string) => `${PREFIX}kv:${key}`;

interface LessonEntry {
  lesson: StoredLesson;
  deletedAt: number | null;
}

/** The page's localStorage, or null where there's none or reading it throws. */
export function pageLocalStorage(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createLocalStorage(store: KeyValueStore | null = pageLocalStorage(), now = Date.now): Storage {
  // What was written this visit wins over the store, which may have refused it
  const memory = new Map<string, string>();

  function read<T>(key: string, fallback: T): T {
    let text: string | null | undefined = memory.get(key);
    if (text === undefined) {
      try {
        text = store?.getItem(key) ?? null;
      } catch {
        text = null;
      }
    }
    if (text === null) return fallback;
    try {
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  }

  function write(key: string, value: unknown): void {
    const text = JSON.stringify(value);
    memory.set(key, text);
    try {
      store?.setItem(key, text);
    } catch {
      // Kept in memory for this visit
    }
  }

  const lessonEntries = () => read<LessonEntry[]>(LESSONS, []);
  const sessionList = () => read<SessionRecord[]>(SESSIONS, []);

  return {
    settings: {
      get: async <T>(key: string) => read<T | null>(setting(key), null),
      set: async (key, value) => write(setting(key), value),
    },
    lessons: {
      list: async () =>
        lessonEntries()
          .filter(entry => entry.deletedAt === null)
          .map(entry => entry.lesson)
          .sort(byNewest),
      get: async id =>
        lessonEntries().find(entry => entry.lesson.id === id && entry.deletedAt === null)?.lesson ?? null,
      save: async lesson => {
        const entries = lessonEntries();
        const existing = entries.find(entry => entry.lesson.id === lesson.id);
        const saved = { ...lesson, createdAt: existing?.lesson.createdAt ?? lesson.createdAt };
        write(LESSONS, [...entries.filter(entry => entry !== existing), { lesson: saved, deletedAt: null }]);
      },
      remove: async id =>
        write(
          LESSONS,
          lessonEntries().map(entry => (entry.lesson.id === id ? { ...entry, deletedAt: now() } : entry))
        ),
    },
    sessions: {
      add: async record => write(SESSIONS, [...sessionList(), record]),
      list: async () => sessionList().sort(byOldest),
      forLesson: async lessonId =>
        sessionList()
          .filter(record => record.lessonId === lessonId)
          .sort(byOldest),
      get: async id => sessionList().find(record => record.id === id) ?? null,
    },
  };
}
