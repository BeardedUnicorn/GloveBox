/**
 * What GloveBox keeps between launches, behind one interface: SQLite in the
 * app (sqliteStorage.ts), localStorage in a plain browser during
 * development (localStorageStorage.ts). Each write is one statement, so
 * nothing is ever half saved.
 */

import type { SessionRecord, Tier } from '../progression/types';

/** A lesson the performer recorded or imported; built-in lessons ship in code. */
export interface StoredLesson {
  id: string;
  version: number;
  name: string;
  tier: Tier;
  origin: 'recorded' | 'imported';
  /** The LessonDef as JSON; the lessons schema validates it when it's read back. */
  def: unknown;
  /** ms since the epoch */
  createdAt: number;
  updatedAt: number;
}

/** Settings and calibration profiles: any JSON value under a key. */
export interface SettingsRepo {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface LessonRepo {
  /** Every lesson not removed, newest first. */
  list(): Promise<StoredLesson[]>;
  /** The lesson, or null if there's none or it was removed. */
  get(id: string): Promise<StoredLesson | null>;
  /** Adds the lesson, or replaces the one with its id (bringing it back if it was removed). */
  save(lesson: StoredLesson): Promise<void>;
  /** Removes the lesson; its row is kept, marked removed. */
  remove(id: string): Promise<void>;
}

export interface SessionRepo {
  add(record: SessionRecord): Promise<void>;
  /** Every session, oldest first. */
  list(): Promise<SessionRecord[]>;
  /** One lesson's sessions, oldest first. */
  forLesson(lessonId: string): Promise<SessionRecord[]>;
  get(id: string): Promise<SessionRecord | null>;
}

export interface Storage {
  settings: SettingsRepo;
  lessons: LessonRepo;
  sessions: SessionRepo;
}

/** Newest first, then by id so ties keep one order. */
export const byNewest = (a: StoredLesson, b: StoredLesson): number =>
  b.createdAt - a.createdAt || a.id.localeCompare(b.id);

/** Oldest first, then by id. */
export const byOldest = (a: SessionRecord, b: SessionRecord): number =>
  a.startedAt - b.startedAt || a.id.localeCompare(b.id);
