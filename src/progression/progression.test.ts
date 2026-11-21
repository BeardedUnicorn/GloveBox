/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { session } from '../test/storageContract';
import { addDays, daysBetween, localDay, weekday } from './days';
import { deriveProgress, FINGER_WINDOW } from './derive';
import { practiceByDay, STREAK_DAY_MS, streaks } from './streaks';
import type { CatalogEntry, SessionRecord } from './types';
import { isLessonUnlocked, tierProgress } from './unlocks';

describe('days', () => {
  let tz: string | undefined;
  beforeEach(() => {
    tz = process.env.TZ;
    process.env.TZ = 'America/New_York';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  test('a moment belongs to its local day, changing at local midnight', () => {
    const lastMs = new Date(2026, 10, 21, 23, 59, 59, 999).getTime();
    expect(localDay(lastMs)).toBe('2026-11-21');
    expect(localDay(lastMs + 1)).toBe('2026-11-22');
    // 03:30 UTC is still the evening before in New York
    expect(localDay(Date.UTC(2026, 10, 22, 3, 30))).toBe('2026-11-21');
  });

  test('the 23-hour day of a daylight-saving change is still one day', () => {
    // Clocks went forward at 2:00 on 8 March 2026 in New York
    expect(localDay(new Date(2026, 2, 8, 1, 59).getTime())).toBe('2026-03-08');
    expect(localDay(new Date(2026, 2, 8, 3, 1).getTime())).toBe('2026-03-08');
    expect(localDay(new Date(2026, 2, 8, 0, 0).getTime() + 23 * 3_600_000)).toBe('2026-03-09');
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    // And the 25-hour day when they go back (1 November 2026)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  test('day arithmetic crosses months, years and leap days, both ways', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-11-21', -30)).toBe('2026-10-22');
    expect(daysBetween('2026-11-21', '2026-11-14')).toBe(-7);
    expect(weekday('2026-11-22')).toBe(0);
    expect(weekday('2026-11-21')).toBe(6);
  });
});

const day = (d: string, minutes: number): SessionRecord =>
  session({ id: `${d}-${minutes}`, day: d, durationMs: minutes * 60_000 });

describe('streaks', () => {
  test('practice adds up per day', () => {
    expect(practiceByDay([day('2026-11-20', 1), day('2026-11-20', 2), day('2026-11-21', 3)])).toEqual({
      '2026-11-20': 3 * 60_000,
      '2026-11-21': 3 * 60_000,
    });
  });

  test('a day counts with a minute of practice', () => {
    expect(streaks({ '2026-11-21': STREAK_DAY_MS - 1 }, '2026-11-21')).toEqual({ current: 0, longest: 0 });
    expect(streaks({ '2026-11-21': STREAK_DAY_MS }, '2026-11-21')).toEqual({ current: 1, longest: 1 });
  });

  test('the current streak runs back from today, or from yesterday while today is still open', () => {
    const byDay = { '2026-11-18': 60_000, '2026-11-19': 60_000, '2026-11-20': 60_000 };
    expect(streaks(byDay, '2026-11-20').current).toBe(3);
    expect(streaks(byDay, '2026-11-21').current).toBe(3);
    expect(streaks(byDay, '2026-11-22').current).toBe(0);
  });

  test('the longest streak is the longest run of counted days, gaps and short days breaking it', () => {
    const byDay = {
      '2026-10-01': 60_000,
      '2026-10-02': 60_000,
      '2026-10-03': 60_000,
      '2026-10-04': 30_000,
      '2026-10-05': 60_000,
      '2026-11-20': 60_000,
      '2026-11-21': 60_000,
    };
    expect(streaks(byDay, '2026-11-21')).toEqual({ current: 2, longest: 3 });
  });

  test('a streak runs across a daylight-saving change and the end of a month', () => {
    const byDay = { '2026-02-28': 60_000, '2026-03-01': 60_000, '2026-03-07': 60_000, '2026-03-08': 60_000 };
    expect(streaks(byDay, '2026-03-09')).toEqual({ current: 2, longest: 2 });
  });
});

const catalog: CatalogEntry[] = [
  { id: 'roll', name: 'Finger roll', tier: 1, origin: 'builtin' },
  { id: 'wave', name: 'Ten-light wave', tier: 1, origin: 'builtin' },
  { id: 'circle', name: 'Mirrored circle', tier: 2, origin: 'builtin' },
  { id: 'box', name: 'Tut box', tier: 3, origin: 'builtin' },
  { id: 'mine', name: 'My move', tier: 4, origin: 'recorded' },
];

describe('unlocks', () => {
  test('tier 1 is open from the start; the rest wait', () => {
    const tiers = tierProgress(catalog, {});
    expect(tiers[1]).toEqual({ unlocked: true, starsEarned: 0, starsPossible: 6 });
    expect(tiers[2].unlocked).toBe(false);
    expect(tiers[3].unlocked).toBe(false);
  });

  test('60% of a tier stars opens the next one', () => {
    expect(tierProgress(catalog, { roll: 3, wave: 0 })[2].unlocked).toBe(false);
    const tiers = tierProgress(catalog, { roll: 3, wave: 1 });
    expect(tiers[1].starsEarned).toBe(4);
    expect(tiers[2].unlocked).toBe(true);
    expect(tiers[3].unlocked).toBe(false);
  });

  test("a tier opens only when the one before it is open, and recorded lessons don't count", () => {
    // Stars in tier 2 don't open tier 3 while tier 2 itself is locked
    expect(tierProgress(catalog, { circle: 3 })[3].unlocked).toBe(false);
    // Tier 4 has only a recorded lesson: nothing to earn, so it doesn't hold tier 5 back
    const tiers = tierProgress(catalog, { roll: 3, wave: 3, circle: 3, box: 2 });
    expect(tiers[4]).toEqual({ unlocked: true, starsEarned: 0, starsPossible: 0 });
    expect(tiers[5].unlocked).toBe(true);
  });

  test('recorded and imported lessons are always open; unknown ones never', () => {
    const tiers = tierProgress(catalog, {});
    expect(isLessonUnlocked(catalog[4], tiers)).toBe(true);
    expect(isLessonUnlocked(catalog[0], tiers)).toBe(true);
    expect(isLessonUnlocked(catalog[2], tiers)).toBe(false);
    expect(isLessonUnlocked(undefined, tiers)).toBe(false);
  });
});

describe('deriving progress', () => {
  const played = (overrides: Partial<SessionRecord>) => session({ perFinger: new Array(10).fill(null), ...overrides });

  test('with no sessions, nothing is played and only tier 1 is open', () => {
    const progress = deriveProgress([], catalog, '2026-11-21');
    expect(progress.lessons).toEqual({});
    expect(progress.totals).toEqual({ sessions: 0, practiceMs: 0, lessonsPlayed: 0 });
    expect(progress.streak).toEqual({ current: 0, longest: 0 });
    expect(progress.fingerAccuracy).toEqual(new Array(10).fill(null));
    expect(progress.isUnlocked('roll')).toBe(true);
    expect(progress.isUnlocked('circle')).toBe(false);
  });

  test("each lesson's plays, bests and history, whatever order the sessions come in", () => {
    const sessions = [
      played({ id: 'c', lessonId: 'roll', startedAt: 300, day: '2026-11-21', accuracy: 70, grade: 'C', stars: 1 }),
      played({ id: 'a', lessonId: 'roll', startedAt: 100, day: '2026-11-20', accuracy: 96, grade: 'S', stars: 3 }),
      played({ id: 'b', lessonId: 'roll', startedAt: 200, day: '2026-11-20', accuracy: 80, grade: 'B', stars: 2 }),
      played({ id: 'd', lessonId: 'wave', startedAt: 250, day: '2026-11-21', accuracy: 50, grade: 'D', stars: 0 }),
      played({ id: 'e', lessonId: 'wave', startedAt: 260, day: '2026-11-21', accuracy: 62, grade: 'C', stars: 1 }),
    ];
    const progress = deriveProgress(sessions, catalog, '2026-11-21');
    expect(progress.lessons.roll).toEqual({
      plays: 3,
      bestAccuracy: 96,
      bestGrade: 'S',
      stars: 3,
      lastPlayed: 300,
      history: [
        { day: '2026-11-20', accuracy: 96 },
        { day: '2026-11-20', accuracy: 80 },
        { day: '2026-11-21', accuracy: 70 },
      ],
    });
    expect(progress.lessons.wave?.bestGrade).toBe('C');
    expect(progress.totals).toEqual({ sessions: 5, practiceMs: 5 * 61_000, lessonsPlayed: 2 });
    expect(progress.practiceByDay).toEqual({ '2026-11-20': 2 * 61_000, '2026-11-21': 3 * 61_000 });
    expect(progress.streak).toEqual({ current: 2, longest: 2 });
    // 3 + 1 of tier 1's 6 stars: tier 2 opens
    expect(progress.tiers[1].starsEarned).toBe(4);
    expect(progress.isUnlocked('circle')).toBe(true);
  });

  test('sessions that started at the same moment keep one order, by id', () => {
    const sessions = [played({ id: 'b', startedAt: 5, accuracy: 20 }), played({ id: 'a', startedAt: 5, accuracy: 10 })];
    const history = deriveProgress(sessions, catalog, 'x').lessons['finger-roll']?.history;
    expect(history?.map(entry => entry.accuracy)).toEqual([10, 20]);
  });

  test("a finger's accuracy is the mean of the latest sessions that used it", () => {
    const sessions = Array.from({ length: FINGER_WINDOW + 5 }, (_, i) =>
      played({
        id: `s${String(i).padStart(2, '0')}`,
        startedAt: i,
        // The oldest five score 0 on the left thumb; the window leaves them out
        perFinger: [i < 5 ? 0 : 80, i % 2 === 0 ? 50 : null, null, null, null, 90, null, null, null, null],
      })
    );
    const progress = deriveProgress([...sessions, played({ id: 'old', startedAt: -1, perFinger: [] })], catalog, 'x');
    expect(progress.fingerAccuracy[0]).toBe(80);
    expect(progress.fingerAccuracy[1]).toBe(50);
    expect(progress.fingerAccuracy[5]).toBe(90);
    expect(progress.fingerAccuracy[2]).toBeNull();
  });

  test('a lesson missing from the catalog still counts in the totals, and is not open', () => {
    const progress = deriveProgress([played({ lessonId: 'deleted' })], catalog, '2026-11-21');
    expect(progress.lessons.deleted?.plays).toBe(1);
    expect(progress.isUnlocked('deleted')).toBe(false);
  });

  test('takes a few milliseconds for thousands of sessions', () => {
    const sessions = Array.from({ length: 5_000 }, (_, i) =>
      session({ id: `s${i}`, lessonId: catalog[i % 4]?.id, startedAt: i, day: addDays('2025-01-01', i % 400) })
    );
    const start = performance.now();
    deriveProgress(sessions, catalog, '2026-11-21');
    expect(performance.now() - start).toBeLessThan(200);
  });
});
