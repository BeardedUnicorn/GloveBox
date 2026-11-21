/**
 * Everything the app shows about progress, worked out from the saved
 * sessions alone: nothing here is stored, so it can never disagree with the
 * history. A few thousand sessions take a few milliseconds.
 */

import { SLOTS } from '../core/types';
import type { Day } from './days';
import { practiceByDay, type Streak, streaks } from './streaks';
import type { CatalogEntry, Grade, SessionRecord, Stars, Tier } from './types';
import { isLessonUnlocked, type TierProgress, tierProgress } from './unlocks';

/** How many of the latest sessions that used a finger make up its accuracy. */
export const FINGER_WINDOW = 20;

const GRADE_RANK: Record<Grade, number> = { S: 4, A: 3, B: 2, C: 1, D: 0 };

export interface LessonProgress {
  plays: number;
  bestAccuracy: number;
  bestGrade: Grade;
  /** The best stars any session earned. */
  stars: Stars;
  /** When it was last played: ms since the epoch. */
  lastPlayed: number;
  /** Each session's accuracy, oldest first. */
  history: { day: Day; accuracy: number }[];
}

export interface Progress {
  lessons: Record<string, LessonProgress>;
  tiers: Record<Tier, TierProgress>;
  streak: Streak;
  totals: { sessions: number; practiceMs: number; lessonsPlayed: number };
  /** Practice time per day, in ms. */
  practiceByDay: Record<Day, number>;
  /** Each slot's mean accuracy over the latest FINGER_WINDOW sessions that used it; null if none did. */
  fingerAccuracy: (number | null)[];
  isUnlocked(lessonId: string): boolean;
}

export function deriveProgress(
  sessions: readonly SessionRecord[],
  catalog: readonly CatalogEntry[],
  today: Day
): Progress {
  const ordered = [...sessions].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));

  const lessons: Record<string, LessonProgress> = {};
  let practiceMs = 0;
  for (const session of ordered) {
    practiceMs += session.durationMs;
    const seen = lessons[session.lessonId];
    const entry = { day: session.day, accuracy: session.accuracy };
    if (!seen) {
      lessons[session.lessonId] = {
        plays: 1,
        bestAccuracy: session.accuracy,
        bestGrade: session.grade,
        stars: session.stars,
        lastPlayed: session.startedAt,
        history: [entry],
      };
      continue;
    }
    seen.plays += 1;
    seen.bestAccuracy = Math.max(seen.bestAccuracy, session.accuracy);
    if (GRADE_RANK[session.grade] > GRADE_RANK[seen.bestGrade]) seen.bestGrade = session.grade;
    seen.stars = Math.max(seen.stars, session.stars) as Stars;
    seen.lastPlayed = session.startedAt;
    seen.history.push(entry);
  }

  const bestStars = Object.fromEntries(Object.entries(lessons).map(([id, lesson]) => [id, lesson.stars]));
  const tiers = tierProgress(catalog, bestStars);
  const byId = new Map(catalog.map(entry => [entry.id, entry]));
  const byDay = practiceByDay(ordered);

  const newestFirst = [...ordered].reverse();
  const fingerAccuracy = SLOTS.map(slot => {
    const values: number[] = [];
    for (const session of newestFirst) {
      const value = session.perFinger[slot];
      // null: the lesson didn't use the finger (and a record from before a slot existed has none)
      if (value == null) continue;
      values.push(value);
      if (values.length === FINGER_WINDOW) break;
    }
    return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
  });

  return {
    lessons,
    tiers,
    streak: streaks(byDay, today),
    totals: { sessions: ordered.length, practiceMs, lessonsPlayed: Object.keys(lessons).length },
    practiceByDay: byDay,
    fingerAccuracy,
    isUnlocked: lessonId => isLessonUnlocked(byId.get(lessonId), tiers),
  };
}
