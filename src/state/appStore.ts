/**
 * The app's state: settings, the lesson library (built-in plus the
 * performer's own), every saved session, and the progress derived from
 * them. One zustand store; screens read it with useApp(selector).
 *
 * Writes go to storage first and to the store once they've landed, except
 * settings, which change at once and save behind (a lost settings write
 * costs a preference, not a session).
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { BUILTIN_LESSONS } from '../lessons/builtin';
import { type LessonDef, parseLesson } from '../lessons/schema';
import { localDay } from '../progression/days';
import { deriveProgress, type Progress } from '../progression/derive';
import type { CatalogEntry, SessionRecord } from '../progression/types';
import type { Storage, StoredLesson } from '../storage/types';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './settings';

export const SETTINGS_KEY = 'settings';

export interface AppState {
  ready: boolean;
  /** Why loading failed, if it did. */
  loadError: string | null;
  storage: Storage | null;
  settings: Settings;
  /** Recorded and imported lessons, newest first. */
  userLessons: LessonDef[];
  /** Every lesson: the built-in library, then userLessons. Kept, not computed, so selectors return the same array. */
  lessons: LessonDef[];
  sessions: SessionRecord[];
  progress: Progress;
  now: () => number;

  init(storage: Storage, now?: () => number): Promise<void>;
  updateSettings(patch: Partial<Settings>): void;
  addSession(record: SessionRecord): Promise<void>;
  saveLesson(lesson: LessonDef): Promise<void>;
  removeLesson(id: string): Promise<void>;
}

export const catalogOf = (lessons: readonly LessonDef[]): CatalogEntry[] =>
  lessons.map(({ id, name, tier, origin }) => ({ id, name, tier, origin }));

/** Every lesson: the built-in library, then the performer's own. */
export const allLessons = (state: Pick<AppState, 'userLessons'>): LessonDef[] => [
  ...BUILTIN_LESSONS,
  ...state.userLessons,
];

export const lessonById = (state: Pick<AppState, 'userLessons'>, id: string): LessonDef | undefined =>
  allLessons(state).find(lesson => lesson.id === id);

const derive = (sessions: readonly SessionRecord[], userLessons: readonly LessonDef[], now: () => number) =>
  deriveProgress(sessions, catalogOf([...BUILTIN_LESSONS, ...userLessons]), localDay(now()));

/** A saved lesson's definition, if it still reads as one. */
function readStored(stored: StoredLesson): LessonDef | null {
  const parsed = parseLesson(stored.def);
  return parsed.ok ? parsed.lesson : null;
}

export function createAppStore() {
  return createStore<AppState>()((set, get) => ({
    ready: false,
    loadError: null,
    storage: null,
    settings: DEFAULT_SETTINGS,
    userLessons: [],
    lessons: BUILTIN_LESSONS,
    sessions: [],
    progress: derive([], [], Date.now),
    now: Date.now,

    async init(storage, now = Date.now) {
      try {
        const [saved, stored, sessions] = await Promise.all([
          storage.settings.get<unknown>(SETTINGS_KEY),
          storage.lessons.list(),
          storage.sessions.list(),
        ]);
        const userLessons = stored.map(readStored).filter((l): l is LessonDef => l !== null);
        set({
          ready: true,
          loadError: null,
          storage,
          now,
          settings: parseSettings(saved),
          userLessons,
          lessons: allLessons({ userLessons }),
          sessions,
          progress: derive(sessions, userLessons, now),
        });
      } catch (error) {
        set({ ready: true, loadError: String(error), storage, now });
      }
    },

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      get()
        .storage?.settings.set(SETTINGS_KEY, settings)
        .catch(error => console.warn("Settings weren't saved:", error));
    },

    async addSession(record) {
      const { storage, userLessons, now } = get();
      await storage?.sessions.add(record);
      const sessions = [...get().sessions, record];
      set({ sessions, progress: derive(sessions, userLessons, now) });
    },

    async saveLesson(lesson) {
      const { storage, now } = get();
      const time = now();
      const stored: StoredLesson = {
        id: lesson.id,
        version: lesson.version,
        name: lesson.name,
        tier: lesson.tier,
        origin: lesson.origin === 'imported' ? 'imported' : 'recorded',
        def: lesson,
        createdAt: time,
        updatedAt: time,
      };
      await storage?.lessons.save(stored);
      const userLessons = [lesson, ...get().userLessons.filter(l => l.id !== lesson.id)];
      set({ userLessons, lessons: allLessons({ userLessons }), progress: derive(get().sessions, userLessons, now) });
    },

    async removeLesson(id) {
      const { storage, now } = get();
      await storage?.lessons.remove(id);
      const userLessons = get().userLessons.filter(l => l.id !== id);
      set({ userLessons, lessons: allLessons({ userLessons }), progress: derive(get().sessions, userLessons, now) });
    },
  }));
}

export type AppStore = ReturnType<typeof createAppStore>;

/** The app's one store. */
export const appStore = createAppStore();

export function useApp<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
