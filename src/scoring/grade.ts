/** Accuracy (0–100) as a grade and stars. */

import type { Difficulty, Grade, Stars } from '../progression/types';

export const GRADES: readonly { grade: Grade; min: number }[] = [
  { grade: 'S', min: 95 },
  { grade: 'A', min: 88 },
  { grade: 'B', min: 75 },
  { grade: 'C', min: 60 },
  { grade: 'D', min: 0 },
];

export const gradeFor = (accuracy: number): Grade => GRADES.find(g => accuracy >= g.min)!.grade;

/** One star at 60, two at 75, three at 90. */
export const starsFor = (accuracy: number): Stars => (accuracy >= 90 ? 3 : accuracy >= 75 ? 2 : accuracy >= 60 ? 1 : 0);

/** How much bigger (or smaller) than normal each difficulty's targets are. */
export const DIFFICULTY_RADIUS: Record<Difficulty, number> = { easy: 1.4, normal: 1, hard: 0.75 };
