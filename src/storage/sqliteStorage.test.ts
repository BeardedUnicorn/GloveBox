// @vitest-environment jsdom
// (mockIPC needs a window; the database itself is node:sqlite)
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearMocks } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { migratedDatabase, mockSqlPlugin } from '../test/sqlite';
import { lesson, session, storageContract } from '../test/storageContract';
import { createStorage } from './index';
import { createSqliteStorage, DATABASE } from './sqliteStorage';

afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
});

storageContract('SQLite', now => {
  mockSqlPlugin(migratedDatabase());
  return createSqliteStorage(undefined, now);
});

describe('SQLite storage', () => {
  test('opens the database the Rust side migrates, once', async () => {
    const calls = mockSqlPlugin(migratedDatabase());
    const storage = createSqliteStorage();
    await storage.settings.set('a', 1);
    await storage.settings.get('a');
    expect(calls.filter(call => call.cmd === 'plugin:sql|load')).toEqual([{ cmd: 'plugin:sql|load', db: DATABASE }]);
    const rust = readFileSync(join(import.meta.dirname, '../../src-tauri/src/migrations.rs'), 'utf8');
    expect(rust).toContain(`pub const DATABASE: &str = "${DATABASE}";`);
  });

  test('writes each change as one statement', async () => {
    const calls = mockSqlPlugin(migratedDatabase());
    const storage = createSqliteStorage(undefined, () => 7);
    await storage.settings.set('a', 1);
    await storage.lessons.save(lesson());
    await storage.lessons.remove('my-wave');
    await storage.sessions.add(session());
    const writes = calls.filter(call => call.cmd === 'plugin:sql|execute');
    expect(writes.map(call => call.query?.split(' ')[0])).toEqual(['INSERT', 'INSERT', 'UPDATE', 'INSERT']);
    expect(writes[2]?.values).toEqual([7, 'my-wave']);
  });

  test('rounds a session duration to whole milliseconds', async () => {
    mockSqlPlugin(migratedDatabase());
    const storage = createSqliteStorage();
    await storage.sessions.add(session({ durationMs: 61_000.6 }));
    expect((await storage.sessions.get('s1'))?.durationMs).toBe(61_001);
  });

  test('the schema refuses values the app never writes', async () => {
    mockSqlPlugin(migratedDatabase());
    const storage = createSqliteStorage();
    await expect(storage.sessions.add(session({ tracker: 'sonar' as never }))).rejects.toThrow(/CHECK constraint/);
    await expect(storage.lessons.save(lesson({ tier: 9 as never }))).rejects.toThrow(/CHECK constraint/);
  });

  test('a database that fails to open fails each call', async () => {
    const storage = createSqliteStorage(() => Promise.reject(new Error('no disk')));
    await expect(storage.sessions.list()).rejects.toThrow('no disk');
  });
});

describe('choosing a storage', () => {
  test('inside Tauri it is SQLite', async () => {
    vi.stubGlobal('isTauri', true);
    const calls = mockSqlPlugin(migratedDatabase());
    await createStorage().settings.set('a', 1);
    expect(calls[0]?.cmd).toBe('plugin:sql|load');
  });

  test('in a plain browser it is localStorage', async () => {
    const calls = mockSqlPlugin(migratedDatabase());
    const storage = createStorage();
    await storage.settings.set('a', 1);
    expect(await storage.settings.get('a')).toBe(1);
    expect(calls).toEqual([]);
  });
});
