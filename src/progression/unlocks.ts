/**
 * Which lessons are open. Tier 1 always is; each next tier opens once the
 * tier before it is open and its built-in lessons have earned at least 60%
 * of their stars (each lesson's best, out of 3). Lessons the performer
 * recorded or imported are always open and never count toward a tier.
 */

import type { CatalogEntry, Stars, Tier } from './types';

export const TIERS: readonly Tier[] = [1, 2, 3, 4, 5];
export const STARS_PER_LESSON = 3;
/** The share of a tier's stars that opens the next tier. */
export const UNLOCK_SHARE = 0.6;

export interface TierProgress {
  unlocked: boolean;
  starsEarned: number;
  starsPossible: number;
}

/** Each tier's stars and whether it's open, from each lesson's best stars. */
export function tierProgress(
  catalog: readonly CatalogEntry[],
  bestStars: Readonly<Record<string, Stars>>
): Record<Tier, TierProgress> {
  const tiers = {} as Record<Tier, TierProgress>;
  let open = true;
  for (const tier of TIERS) {
    const lessons = catalog.filter(entry => entry.origin === 'builtin' && entry.tier === tier);
    const starsPossible = lessons.length * STARS_PER_LESSON;
    const starsEarned = lessons.reduce((sum, entry) => sum + (bestStars[entry.id] ?? 0), 0);
    tiers[tier] = { unlocked: open, starsEarned, starsPossible };
    // A tier with no lessons holds nothing back
    open = open && (starsPossible === 0 || starsEarned >= UNLOCK_SHARE * starsPossible);
  }
  return tiers;
}

/** Whether a catalog lesson is open; an unknown one isn't. */
export function isLessonUnlocked(
  entry: CatalogEntry | undefined,
  tiers: Readonly<Record<Tier, TierProgress>>
): boolean {
  if (!entry) return false;
  return entry.origin !== 'builtin' || tiers[entry.tier].unlocked;
}
