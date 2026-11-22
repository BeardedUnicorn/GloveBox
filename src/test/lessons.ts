/**
 * A lesson for tests that need one with known timing, so tuning the built-in
 * library never moves their numbers: 72 bpm, 4 count-in beats, 4-beat loops,
 * 8 loops, all ten lights, with a text cue on beats 0 and 2.
 */

import { type LessonDef, lessonSchema } from '../lessons/schema';

const rollingHand = (x: number) => ({
  anchor: { type: 'static', at: { x, y: 0.06 } },
  layout: 'fan',
  roll: { amplitude: 0.3, width: 0.36, order: 'pinkyFirst' },
});

export const TEST_LESSON: LessonDef = lessonSchema.parse({
  schemaVersion: 1,
  id: 'test-rolls',
  version: 1,
  name: 'Test rolls',
  tier: 1,
  origin: 'builtin',
  timing: { bpm: 72, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
  activeSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  nominalSpan: 0.17,
  cues: [
    { beat: 0, kind: 'text', label: 'Roll' },
    { beat: 2, kind: 'text', label: 'Keep rolling' },
  ],
  motion: { kind: 'generator', spec: { type: 'hands', L: rollingHand(-0.17), R: rollingHand(0.17) } },
});
