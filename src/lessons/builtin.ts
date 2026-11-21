/**
 * The move library GloveBox ships, in five tiers: foundations, tracers,
 * tutting, contours and combos. Each is plain lesson data; the helpers here
 * only save writing the left hand out as the right hand's mirror image.
 */

import { mirrorPath } from './paths';
import { type HandSpecInput, type LessonDef, type LessonInput, lessonSchema, pathSchema } from './schema';

const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** Hand span (thumb to pinky) the library is written for, stage units. */
const SPAN = 0.17;

/** The right hand's spec as the left hand's mirror image (layouts and rotation mirror on their own). */
export const mirrored = (right: HandSpecInput): HandSpecInput => ({
  ...right,
  anchor: mirrorPath(pathSchema.parse(right.anchor)),
});

const both = (right: HandSpecInput) => ({ type: 'hands' as const, L: mirrored(right), R: right });

const lesson = (input: Omit<LessonInput, 'schemaVersion' | 'version' | 'origin' | 'activeSlots' | 'nominalSpan'>) =>
  lessonSchema.parse({
    schemaVersion: 1,
    version: 1,
    origin: 'builtin',
    activeSlots: ALL,
    nominalSpan: SPAN,
    ...input,
  });

const rolls: HandSpecInput = {
  anchor: { type: 'static', at: { x: 0.17, y: 0.06 } },
  layout: 'fan',
  roll: { amplitude: 0.3, width: 0.36, order: 'pinkyFirst' },
};
const wave = {
  type: 'wave' as const,
  center: { x: 0, y: 0 },
  spacing: 0.055,
  amplitude: 0.05,
  cycles: 1,
  dir: 1 as const,
};
const tracer: HandSpecInput = {
  anchor: { type: 'circle', center: { x: 0.13, y: 0.02 }, radius: 0.11, dir: 1 },
  layout: 'flat',
};
/** Tips around the right side of an imagined ball, top to bottom. */
const ballSide = [-72, -36, 0, 36, 72].map(degrees => ({
  x: 0.55 * Math.cos((degrees * Math.PI) / 180),
  y: 0.55 * Math.sin((degrees * Math.PI) / 180),
}));

export const BUILTIN_LESSONS: LessonDef[] = [
  // ── Tier 1: foundations ─────────────────────────────────────────────────
  lesson({
    id: 'finger-rolls',
    name: 'Finger rolls',
    description: 'Hands still, fingers curling one after another, pinky to thumb. The first thing every glover learns.',
    tier: 1,
    tags: ['fingers', 'rolls'],
    timing: { bpm: 72, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
    motion: { kind: 'generator', spec: both(rolls) },
  }),
  lesson({
    id: 'ten-light-wave',
    name: 'Ten-light wave',
    description: 'All ten lights in a row, a wave rolling through them from your left to your right.',
    tier: 1,
    tags: ['wave'],
    timing: { bpm: 64, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
    motion: { kind: 'generator', spec: wave },
  }),
  lesson({
    id: 'slow-circles',
    name: 'Slow circles',
    description: 'Each hand draws a small circle, mirroring the other. Keep the fingers spread and steady.',
    tier: 1,
    tags: ['tracers', 'circles'],
    timing: { bpm: 60, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: both({ anchor: { type: 'circle', center: { x: 0.17, y: 0.04 }, radius: 0.06, dir: 1 }, layout: 'fan' }),
    },
  }),

  // ── Tier 2: tracers ─────────────────────────────────────────────────────
  lesson({
    id: 'mirror-tracers',
    name: 'Mirror tracers',
    description: 'Bigger, faster mirrored circles. Your lights should leave trails your receiver can follow.',
    tier: 2,
    tags: ['tracers', 'circles'],
    timing: { bpm: 84, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
    motion: { kind: 'generator', spec: both(tracer) },
  }),
  lesson({
    id: 'opposite-tracers',
    name: 'Opposite tracers',
    description: 'Both hands circle the same way, half a turn apart: one up while the other is down.',
    tier: 2,
    tags: ['tracers', 'circles'],
    timing: { bpm: 80, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: {
        type: 'hands',
        R: { anchor: { type: 'circle', center: { x: 0.14, y: 0.02 }, radius: 0.09, dir: 1 }, layout: 'flat' },
        L: {
          anchor: { type: 'circle', center: { x: -0.14, y: 0.02 }, radius: 0.09, dir: 1 },
          layout: 'flat',
          phase: 0.5,
        },
      },
    },
  }),
  lesson({
    id: 'infinity',
    name: 'Infinity',
    description: 'A sideways figure 8 with each hand, mirrored. Smooth through the crossing, no corners.',
    tier: 2,
    tags: ['tracers', 'infinity'],
    timing: { bpm: 72, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: both({
        anchor: { type: 'lissajous', center: { x: 0.16, y: 0.02 }, ax: 0.12, ay: 0.06, fx: 1, fy: 2 },
        layout: 'flat',
      }),
    },
  }),
  lesson({
    id: 'vertical-infinity',
    name: 'Vertical infinity',
    description: 'The figure 8 stood on end: up through the middle, around and back down.',
    tier: 2,
    tags: ['tracers', 'infinity'],
    timing: { bpm: 72, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: both({
        anchor: { type: 'lissajous', center: { x: 0.16, y: 0.02 }, ax: 0.06, ay: 0.13, fx: 2, fy: 1 },
        layout: 'flat',
      }),
    },
  }),

  // ── Tier 3: tutting ─────────────────────────────────────────────────────
  lesson({
    id: 'tut-box',
    name: 'Tut box',
    description: 'Flat hands trace a box, stopping dead on each corner and turning a quarter. Hit the corners.',
    tier: 3,
    tags: ['tutting', 'box'],
    timing: { bpm: 76, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    cues: [{ beat: 0, kind: 'text', label: 'Stop on every corner' }],
    motion: {
      kind: 'generator',
      spec: both({
        anchor: {
          type: 'polyline',
          points: [
            { x: 0.08, y: -0.06 },
            { x: 0.22, y: -0.06 },
            { x: 0.22, y: 0.08 },
            { x: 0.08, y: 0.08 },
          ],
          closed: true,
          ease: 'inOutCubic',
          holdFrac: 0.4,
        },
        layout: 'flat',
        rotation: { steps: [0, Math.PI / 2, 0, Math.PI / 2] },
      }),
    },
  }),
  lesson({
    id: 'tut-staircase',
    name: 'Staircase',
    description: 'Up the stairs and back down: sharp right angles, a pause on every step.',
    tier: 3,
    tags: ['tutting'],
    timing: { bpm: 80, beatsPerLoop: 10, defaultLoops: 4, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: both({
        anchor: {
          type: 'polyline',
          points: [
            { x: 0.06, y: 0.1 },
            { x: 0.06, y: 0.02 },
            { x: 0.14, y: 0.02 },
            { x: 0.14, y: -0.06 },
            { x: 0.22, y: -0.06 },
            { x: 0.22, y: -0.14 },
          ],
          closed: false,
          ease: 'inOutCubic',
          holdFrac: 0.4,
        },
        layout: 'flat',
      }),
    },
  }),

  // ── Tier 4: contours ────────────────────────────────────────────────────
  lesson({
    id: 'ball-contour',
    name: 'Ball contour',
    description:
      'Hold an imaginary ball between your hands and rock it side to side. The shape of the ball never changes.',
    tier: 4,
    tags: ['contours'],
    timing: { bpm: 66, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: {
        type: 'hands',
        R: { anchor: { type: 'static', at: { x: 0, y: 0.02 } }, layout: ballSide, rotation: { steps: [-0.7, 0.7] } },
        // The left hand mirrors its rotation, so the same turn of the ball is the opposite steps
        L: { anchor: { type: 'static', at: { x: 0, y: 0.02 } }, layout: ballSide, rotation: { steps: [0.7, -0.7] } },
      },
    },
  }),
  lesson({
    id: 'plane-contour',
    name: 'Plane contour',
    description: 'Flat hands slide out and back without tilting, like pressing on a pane of glass.',
    tier: 4,
    tags: ['contours', 'isolation'],
    timing: { bpm: 70, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: both({
        anchor: {
          type: 'polyline',
          points: [
            { x: 0.06, y: 0 },
            { x: 0.24, y: 0 },
          ],
          closed: false,
          ease: 'inOutCubic',
          holdFrac: 0.15,
        },
        layout: 'flat',
      }),
    },
  }),

  // ── Tier 5: combos ──────────────────────────────────────────────────────
  lesson({
    id: 'flow-combo',
    name: 'Flow combo',
    description: 'Rolls into a wave into tracers, each flowing into the next. Your first full set.',
    tier: 5,
    tags: ['combo'],
    timing: { bpm: 80, beatsPerLoop: 12, defaultLoops: 4, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: {
        type: 'sequence',
        parts: [
          { beats: 4, spec: both(rolls), blendBeats: 1 },
          { beats: 4, spec: wave, blendBeats: 1 },
          { beats: 4, spec: both(tracer), blendBeats: 1 },
        ],
      },
    },
  }),
];

/** A built-in lesson by id. */
export const builtinLesson = (id: string): LessonDef | undefined => BUILTIN_LESSONS.find(l => l.id === id);
