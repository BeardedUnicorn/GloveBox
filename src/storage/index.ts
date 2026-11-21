/** The app's storage: SQLite inside Tauri, localStorage in a plain browser. */

import { isTauri } from '@tauri-apps/api/core';
import { createLocalStorage } from './localStorageStorage';
import { createSqliteStorage } from './sqliteStorage';
import type { Storage } from './types';

export type { LessonRepo, SessionRepo, SettingsRepo, Storage, StoredLesson } from './types';

export function createStorage(): Storage {
  return isTauri() ? createSqliteStorage() : createLocalStorage();
}
