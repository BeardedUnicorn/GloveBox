/**
 * Daily streaks: a day counts once it has a minute of practice in it, and
 * the current streak is the run of counted days that ends today, or
 * yesterday, since today isn't over yet.
 */

import { addDays, type Day, daysBetween } from './days';
import type { SessionRecord } from './types';

/** The practice a day needs to count toward a streak. */
export const STREAK_DAY_MS = 60_000;

export interface Streak {
  current: number;
  longest: number;
}

/** Practice time per day, in ms. */
export function practiceByDay(sessions: readonly SessionRecord[]): Record<Day, number> {
  const byDay: Record<Day, number> = {};
  for (const session of sessions) byDay[session.day] = (byDay[session.day] ?? 0) + session.durationMs;
  return byDay;
}

export function streaks(byDay: Readonly<Record<Day, number>>, today: Day): Streak {
  const counted = new Set(Object.keys(byDay).filter(day => (byDay[day] as number) >= STREAK_DAY_MS));

  let longest = 0;
  let run = 0;
  let previous: Day | null = null;
  for (const day of [...counted].sort()) {
    run = previous !== null && daysBetween(previous, day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  let current = 0;
  let day = counted.has(today) ? today : addDays(today, -1);
  while (counted.has(day)) {
    current += 1;
    day = addDays(day, -1);
  }
  return { current, longest };
}
