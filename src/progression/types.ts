/**
 * What a finished practice session leaves behind, and what progression is
 * worked out from. Sessions are the source of truth: progress, unlocks and
 * streaks are derived from them (progression/derive.ts), never stored.
 */

import type { TrackerKind } from '../tracking/types';

export type Tier = 1 | 2 | 3 | 4 | 5;
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
export type Stars = 0 | 1 | 2 | 3;
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface SessionRecord {
  id: string;
  lessonId: string;
  lessonVersion: number;
  /** When it started: ms since the epoch. */
  startedAt: number;
  /** The local calendar day it started, YYYY-MM-DD: what streaks count. */
  day: string;
  /** Time actually practicing (count-in and pauses left out). */
  durationMs: number;
  tracker: TrackerKind;
  /** The tempo multiplier (0.5 slow … 1.25 fast). */
  tempo: number;
  difficulty: Difficulty;
  /** 0–100. */
  accuracy: number;
  grade: Grade;
  stars: Stars;
  maxCombo: number;
  /** How far behind the beat the hands ran, on average (negative: ahead). */
  meanLagMs: number;
  /** Each slot's accuracy, 0–100; null for slots the lesson didn't use. */
  perFinger: (number | null)[];
}

/** A lesson as progression sees it. */
export interface CatalogEntry {
  id: string;
  name: string;
  tier: Tier;
  origin: 'builtin' | 'recorded' | 'imported';
}
