/** How the Progress screen writes times, counts, stars and days. */

import type { Day } from '../../progression/days';
import type { Stars } from '../../progression/types';

/** "45 s", "12 min", "2 h", "1 h 5 min". */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "1 day", "3 days". */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "★★☆". */
export const starsText = (stars: Stars): string => '★'.repeat(stars) + '☆'.repeat(3 - stars);

/** "Sat, Nov 21". */
export const formatDay = (day: Day): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

/** "87%". */
export const percent = (value: number): string => `${Math.round(value)}%`;
