/**
 * What every Storage does, whatever it keeps data in: one suite, run against
 * each backend (localStorageStorage.test.ts, sqliteStorage.test.ts).
 */

import { describe, expect, test } from 'vitest';
import type { SessionRecord } from '../progression/types';
import type { Storage, StoredLesson } from '../storage/types';

export const lesson = (overrides: Partial<StoredLesson> = {}): StoredLesson => ({
  id: 'my-wave',
  version: 1,
  name: 'My wave',
  tier: 2,
  origin: 'recorded',
  def: { schemaVersion: 1, motion: { kind: 'track', frames: [[0.1, null]] } },
  createdAt: 1_000,
  updatedAt: 1_000,
  ...overrides,
});

export const session = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1',
  lessonId: 'finger-roll',
  lessonVersion: 1,
  startedAt: 1_700_000_000_000,
  day: '2023-11-14',
  durationMs: 61_000,
  tracker: 'landmarks',
  tempo: 0.5,
  difficulty: 'normal',
  accuracy: 87.25,
  grade: 'B',
  stars: 2,
  maxCombo: 14,
  meanLagMs: -12.5,
  perFinger: [90, 80.5, null, null, null, 70, 60, null, null, 100],
  ...overrides,
});

/** `make` returns a fresh, empty storage whose clock reads `now` (ms). */
export function storageContract(name: string, make: (now: () => number) => Storage) {
  describe(`${name}: settings`, () => {
    test('a missing key is null', async () => {
      expect(await make(() => 0).settings.get('nothing')).toBeNull();
    });

    test('keeps JSON values, and replaces them', async () => {
      const storage = make(() => 0);
      await storage.settings.set('settings', { view: 'performer', tempo: 0.5 });
      expect(await storage.settings.get('settings')).toEqual({ view: 'performer', tempo: 0.5 });
      await storage.settings.set('settings', { view: 'receiver' });
      expect(await storage.settings.get('settings')).toEqual({ view: 'receiver' });
      await storage.settings.set('flag', false);
      expect(await storage.settings.get('flag')).toBe(false);
    });
  });

  describe(`${name}: lessons`, () => {
    test('saves and reads a lesson back, def and all', async () => {
      const storage = make(() => 0);
      await storage.lessons.save(lesson());
      expect(await storage.lessons.get('my-wave')).toEqual(lesson());
      expect(await storage.lessons.get('nope')).toBeNull();
    });

    test('lists lessons newest first', async () => {
      const storage = make(() => 0);
      await storage.lessons.save(lesson({ id: 'b', createdAt: 1 }));
      await storage.lessons.save(lesson({ id: 'c', createdAt: 3 }));
      await storage.lessons.save(lesson({ id: 'a', createdAt: 3 }));
      expect((await storage.lessons.list()).map(l => l.id)).toEqual(['a', 'c', 'b']);
    });

    test('saving again replaces the lesson but keeps when it was created', async () => {
      const storage = make(() => 0);
      await storage.lessons.save(lesson());
      await storage.lessons.save(lesson({ name: 'Wave 2', version: 2, createdAt: 9_999, updatedAt: 5_000 }));
      expect(await storage.lessons.list()).toEqual([lesson({ name: 'Wave 2', version: 2, updatedAt: 5_000 })]);
    });

    test('a removed lesson is gone from the list, until it is saved again', async () => {
      const storage = make(() => 42);
      await storage.lessons.save(lesson());
      await storage.lessons.save(lesson({ id: 'other' }));
      await storage.lessons.remove('my-wave');
      expect((await storage.lessons.list()).map(l => l.id)).toEqual(['other']);
      expect(await storage.lessons.get('my-wave')).toBeNull();
      await storage.lessons.save(lesson({ updatedAt: 50 }));
      expect(await storage.lessons.get('my-wave')).toEqual(lesson({ updatedAt: 50 }));
    });
  });

  describe(`${name}: sessions`, () => {
    test('adds sessions and reads them back exactly', async () => {
      const storage = make(() => 0);
      await storage.sessions.add(session());
      expect(await storage.sessions.get('s1')).toEqual(session());
      expect(await storage.sessions.get('s2')).toBeNull();
    });

    test('lists them oldest first, all or for one lesson', async () => {
      const storage = make(() => 0);
      await storage.sessions.add(session({ id: 'late', startedAt: 30 }));
      await storage.sessions.add(session({ id: 'other', lessonId: 'wave', startedAt: 20 }));
      await storage.sessions.add(session({ id: 'b-early', startedAt: 10 }));
      await storage.sessions.add(session({ id: 'a-early', startedAt: 10 }));
      expect((await storage.sessions.list()).map(s => s.id)).toEqual(['a-early', 'b-early', 'other', 'late']);
      expect((await storage.sessions.forLesson('finger-roll')).map(s => s.id)).toEqual(['a-early', 'b-early', 'late']);
      expect(await storage.sessions.forLesson('nothing')).toEqual([]);
    });
  });
}
