/// <reference types="node" />
/**
 * A real SQLite (node:sqlite, in memory) behind the SQL plugin's IPC, for
 * storage tests: the database is created from src-tauri/migrations/, the
 * same SQL the app's migrations run, and `plugin:sql|*` calls are answered
 * from it, so the tests run the exact statements the app sends.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mockIPC } from '@tauri-apps/api/mocks';

const MIGRATIONS = join(import.meta.dirname, '../../src-tauri/migrations');

/** Every migration's SQL, in order. */
export const migrationSql = (): string[] =>
  readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => readFileSync(join(MIGRATIONS, name), 'utf8'));

export function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const sql of migrationSql()) db.exec(sql);
  return db;
}

// sqlx binds `$1`, `$2`… by number; node:sqlite binds numbered parameters
// written `?1`, `?2`…, so the statements are rewritten that way to run here.
const numbered = (query: string) => query.replace(/\$(\d+)/g, '?$1');

export interface SqlCall {
  cmd: string;
  db?: string;
  query?: string;
  values?: unknown[];
}

/** Answers the SQL plugin's IPC from `db`, recording each call. */
export function mockSqlPlugin(db: DatabaseSync): SqlCall[] {
  const calls: SqlCall[] = [];
  mockIPC((cmd, payload) => {
    const args = payload as { db: string; query: string; values: (string | number | null)[] };
    calls.push({ cmd, ...args });
    switch (cmd) {
      case 'plugin:sql|load':
        return args.db;
      case 'plugin:sql|execute': {
        const result = db.prepare(numbered(args.query)).run(...args.values);
        return [Number(result.changes), Number(result.lastInsertRowid)];
      }
      case 'plugin:sql|select':
        return db
          .prepare(numbered(args.query))
          .all(...args.values)
          .map(row => ({ ...row }));
      default:
        throw new Error(`unexpected IPC call ${cmd}`);
    }
  });
  return calls;
}
