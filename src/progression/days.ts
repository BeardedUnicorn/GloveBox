/**
 * Calendar days, as 'YYYY-MM-DD' strings. A session belongs to the local
 * day it started on; arithmetic between days runs on the calendar (in UTC),
 * so a daylight-saving change, with its 23- or 25-hour day, never skips or
 * repeats a day.
 */

export type Day = string;

const pad = (n: number) => String(n).padStart(2, '0');
const format = (year: number, month: number, date: number): Day => `${year}-${pad(month)}-${pad(date)}`;

/** The local day `ms` (since the epoch) falls on. */
export function localDay(ms: number): Day {
  const d = new Date(ms);
  return format(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Midnight UTC of the day, as ms: only for day arithmetic. */
function utc(day: Day): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, date);
}

/** The day `n` days after `day` (before, for negative n). */
export function addDays(day: Day, n: number): Day {
  const d = new Date(utc(day) + n * 86_400_000);
  return format(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** How many days `b` is after `a` (negative when it's before). */
export const daysBetween = (a: Day, b: Day): number => Math.round((utc(b) - utc(a)) / 86_400_000);

/** The day of the week, 0 Sunday to 6 Saturday. */
export const weekday = (day: Day): number => new Date(utc(day)).getUTCDay();
