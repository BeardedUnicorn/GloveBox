/**
 * Storage in the app: the SQL plugin's SQLite database, whose schema the
 * Rust side migrates when it's first opened (src-tauri/migrations/). Every
 * write is a single INSERT or UPSERT: the plugin runs statements on a
 * connection pool, so a transaction across calls couldn't be trusted.
 */

import Database from '@tauri-apps/plugin-sql';
import type { Grade, SessionRecord, Stars, Tier } from '../progression/types';
import type { TrackerKind } from '../tracking/types';
import { byNewest, type Storage, type StoredLesson } from './types';

/** The database the Rust side migrates (src-tauri/src/migrations.rs DATABASE). */
export const DATABASE = 'sqlite:glovebox.db';

/** The part of the plugin's Database this uses. */
export interface SqlDatabase {
  execute(query: string, values?: unknown[]): Promise<unknown>;
  select<T>(query: string, values?: unknown[]): Promise<T>;
}

interface LessonRow {
  id: string;
  version: number;
  origin: StoredLesson['origin'];
  name: string;
  tier: Tier;
  def_json: string;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  id: string;
  lesson_id: string;
  lesson_version: number;
  started_at: number;
  day: string;
  duration_ms: number;
  tracker: TrackerKind;
  tempo: number;
  difficulty: SessionRecord['difficulty'];
  accuracy: number;
  grade: Grade;
  stars: Stars;
  max_combo: number;
  mean_lag_ms: number;
  per_finger_json: string;
}

const LESSON_COLUMNS = 'id, version, origin, name, tier, def_json, created_at, updated_at';

const toLesson = (row: LessonRow): StoredLesson => ({
  id: row.id,
  version: row.version,
  origin: row.origin,
  name: row.name,
  tier: row.tier,
  def: JSON.parse(row.def_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSession = (row: SessionRow): SessionRecord => ({
  id: row.id,
  lessonId: row.lesson_id,
  lessonVersion: row.lesson_version,
  startedAt: row.started_at,
  day: row.day,
  durationMs: row.duration_ms,
  tracker: row.tracker,
  tempo: row.tempo,
  difficulty: row.difficulty,
  accuracy: row.accuracy,
  grade: row.grade,
  stars: row.stars,
  maxCombo: row.max_combo,
  meanLagMs: row.mean_lag_ms,
  perFinger: JSON.parse(row.per_finger_json),
});

/**
 * Storage over `db`, which is opened (and migrated) once, on first use:
 * by default the app's database through the SQL plugin.
 */
export function createSqliteStorage(
  open: () => Promise<SqlDatabase> = () => Database.load(DATABASE),
  now = Date.now
): Storage {
  let opened: Promise<SqlDatabase> | null = null;
  const db = () => {
    opened ??= open();
    return opened;
  };
  const execute = async (query: string, values: unknown[]) => {
    await (await db()).execute(query, values);
  };
  const select = async <T>(query: string, values: unknown[] = []) => (await db()).select<T[]>(query, values);

  return {
    settings: {
      get: async <T>(key: string) => {
        const rows = await select<{ value: string }>('SELECT value FROM kv WHERE key = $1', [key]);
        return rows[0] ? (JSON.parse(rows[0].value) as T) : null;
      },
      set: (key, value) =>
        execute('INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
          key,
          JSON.stringify(value),
        ]),
    },
    lessons: {
      list: async () =>
        (await select<LessonRow>(`SELECT ${LESSON_COLUMNS} FROM lessons WHERE deleted_at IS NULL`))
          .map(toLesson)
          .sort(byNewest),
      get: async id => {
        const rows = await select<LessonRow>(
          `SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = $1 AND deleted_at IS NULL`,
          [id]
        );
        return rows[0] ? toLesson(rows[0]) : null;
      },
      save: lesson =>
        execute(
          `INSERT INTO lessons (${LESSON_COLUMNS}, deleted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
           ON CONFLICT (id) DO UPDATE SET version = excluded.version, origin = excluded.origin,
             name = excluded.name, tier = excluded.tier, def_json = excluded.def_json,
             updated_at = excluded.updated_at, deleted_at = NULL`,
          [
            lesson.id,
            lesson.version,
            lesson.origin,
            lesson.name,
            lesson.tier,
            JSON.stringify(lesson.def),
            lesson.createdAt,
            lesson.updatedAt,
          ]
        ),
      remove: id => execute('UPDATE lessons SET deleted_at = $1 WHERE id = $2', [now(), id]),
    },
    sessions: {
      add: record =>
        execute(
          `INSERT INTO sessions (id, lesson_id, lesson_version, started_at, day, duration_ms, tracker, tempo,
             difficulty, accuracy, grade, stars, max_combo, mean_lag_ms, per_finger_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            record.id,
            record.lessonId,
            record.lessonVersion,
            record.startedAt,
            record.day,
            Math.round(record.durationMs),
            record.tracker,
            record.tempo,
            record.difficulty,
            record.accuracy,
            record.grade,
            record.stars,
            record.maxCombo,
            record.meanLagMs,
            JSON.stringify(record.perFinger),
          ]
        ),
      list: async () => (await select<SessionRow>('SELECT * FROM sessions ORDER BY started_at, id')).map(toSession),
      forLesson: async lessonId =>
        (
          await select<SessionRow>('SELECT * FROM sessions WHERE lesson_id = $1 ORDER BY started_at, id', [lessonId])
        ).map(toSession),
      get: async id => {
        const rows = await select<SessionRow>('SELECT * FROM sessions WHERE id = $1', [id]);
        return rows[0] ? toSession(rows[0]) : null;
      },
    },
  };
}
