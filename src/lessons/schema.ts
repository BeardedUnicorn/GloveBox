/**
 * A lesson: one move, as the ten target lights follow it. Built-in lessons
 * describe their move with generators (paths, finger layouts, rolls,
 * waves); recorded and imported ones carry a keyframe track. Both are data
 * in this one schema, which also checks every imported `.glovebox.json`.
 *
 * Positions are lesson units: stage units for a performer whose hands span
 * `nominalSpan`, around the origin. The practice screen fits them to the
 * real performer (core/coords.ts fitFor).
 */

import { z } from 'zod';

export const vec2Schema = z.object({ x: z.number(), y: z.number() });
const direction = z.union([z.literal(1), z.literal(-1)]);

/** Where a hand's palm goes over one loop (phase 0→1). */
export const pathSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('static'), at: vec2Schema }),
  z.object({
    type: z.literal('circle'),
    center: vec2Schema,
    radius: z.number().positive(),
    /** 1 clockwise on screen (performer view), -1 counter-clockwise. */
    dir: direction,
    /** Where on the circle it starts: radians from +x. */
    start: z.number().default(0),
  }),
  z.object({
    type: z.literal('lissajous'),
    center: vec2Schema,
    ax: z.number().positive(),
    ay: z.number().positive(),
    /** Cycles per loop on each axis: 1:2 draws a sideways figure 8 (an infinity). */
    fx: z.number().int().positive(),
    fy: z.number().int().positive(),
    /** Radians added to the x motion only. */
    phase: z.number().default(0),
  }),
  z.object({
    type: z.literal('polyline'),
    points: z.array(vec2Schema).min(2),
    /** Back to the first point at the end (a box) or not (a line traced back and forth). */
    closed: z.boolean(),
    ease: z.enum(['linear', 'inOutCubic']),
    /** The part of each segment's time spent still at its start: a tut's hit. */
    holdFrac: z.number().min(0).max(0.9).default(0),
  }),
]);

export const LAYOUTS = ['fan', 'flat', 'ring', 'fist'] as const;

/** One hand: its palm's path, where its five tips sit around the palm, and how they move. */
export const handSchema = z.object({
  anchor: pathSchema,
  /** A named shape, or five tip offsets (thumb→pinky) in span units, written for the right hand. */
  layout: z.union([z.enum(LAYOUTS), z.array(vec2Schema).length(5)]),
  rotation: z
    .object({
      /** Radians. */
      base: z.number().default(0),
      /** Full turns per loop. */
      perLoop: z.number().default(0),
      /** Angles held in turn, each eased into: tutting's 90° turns. */
      steps: z.array(z.number()).min(2).optional(),
    })
    .optional(),
  /** Fingers curling one after another. */
  roll: z
    .object({
      /** How far a tip curls toward the palm, span units. */
      amplitude: z.number().positive(),
      /** How much of the loop one finger's curl takes. */
      width: z.number().positive().max(1),
      order: z.enum(['thumbFirst', 'pinkyFirst']),
      cyclesPerLoop: z.number().int().positive().default(1),
    })
    .optional(),
  /** Shifts this hand's timing, in loops: 0.5 moves it opposite the other. */
  phase: z.number().default(0),
});

export type PathSpec = z.infer<typeof pathSchema>;
export type HandSpec = z.infer<typeof handSchema>;
export type HandSpecInput = z.input<typeof handSchema>;

/** A move described by generators. */
export type GenSpec =
  | { type: 'hands'; L?: HandSpec; R?: HandSpec }
  | {
      type: 'wave';
      center: { x: number; y: number };
      /** Between neighboring lights, lesson units. */
      spacing: number;
      amplitude: number;
      cycles: number;
      /** 1 travels toward the performer's right, -1 toward their left. */
      dir: 1 | -1;
    }
  | { type: 'sequence'; parts: { beats: number; spec: GenSpec; blendBeats: number }[] };

export const genSchema: z.ZodType<GenSpec, z.input<z.ZodType<GenSpec>>> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('hands'), L: handSchema.optional(), R: handSchema.optional() }),
    z.object({
      type: z.literal('wave'),
      center: vec2Schema,
      spacing: z.number().positive(),
      amplitude: z.number().positive(),
      cycles: z.number().positive(),
      dir: direction,
    }),
    z.object({
      type: z.literal('sequence'),
      parts: z
        .array(z.object({ beats: z.number().positive(), spec: genSchema, blendBeats: z.number().min(0).default(0) }))
        .min(1),
    }),
  ])
) as z.ZodType<GenSpec, z.input<z.ZodType<GenSpec>>>;

/** A recorded move: every slot's position at evenly spaced samples. */
export const trackSchema = z.object({
  samplesPerBeat: z.number().positive(),
  interpolation: z.enum(['linear', 'catmullRom']),
  /** frames[sample][slot]: [x, y] in lesson units, or null where that light wasn't seen. */
  frames: z
    .array(z.array(z.union([z.tuple([z.number(), z.number()]), z.null()])).length(10))
    .min(2),
});

export type KeyframeTrack = z.infer<typeof trackSchema>;

const slot = z.number().int().min(0).max(9);

export const scoringSchema = z.object({
  /** The target's radius as a multiple of the hand's scale. */
  radiusK: z.number().positive(),
  /** How far past the radius (in radii) a finger still earns partial credit. */
  falloff: z.number().positive(),
  /** The lag (ms) the scorer looks across for the best fit: early to late. */
  lagWindowMs: z.tuple([z.number(), z.number()]),
  /** How long a finger may go unseen before it scores nothing. */
  graceMs: z.number().min(0),
  /** strict: each finger to its own target. pattern: any light to any target (Dark mode). */
  identity: z.enum(['strict', 'pattern']),
});

export const lessonSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().default(''),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  tags: z.array(z.string()).default([]),
  origin: z.enum(['builtin', 'recorded', 'imported']),
  timing: z.object({
    bpm: z.number().min(20).max(240),
    beatsPerLoop: z.number().positive(),
    defaultLoops: z.number().int().positive(),
    countInBeats: z.number().int().min(0),
  }),
  activeSlots: z.array(slot).min(1),
  /** The hand span (thumb tip to pinky tip, stage units) the lesson is written for. */
  nominalSpan: z.number().positive(),
  scoring: scoringSchema.partial().optional(),
  cues: z
    .array(z.object({ beat: z.number().min(0), kind: z.enum(['hit', 'text']), label: z.string().optional() }))
    .default([]),
  motion: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('generator'), spec: genSchema }),
    z.object({ kind: z.literal('track'), track: trackSchema }),
  ]),
});

export type LessonDef = z.infer<typeof lessonSchema>;
export type LessonInput = z.input<typeof lessonSchema>;
export type ScoringOverrides = z.infer<typeof scoringSchema>;

/** A lesson from untrusted JSON (an import, a saved row), or why it isn't one. */
export function parseLesson(json: unknown): { ok: true; lesson: LessonDef } | { ok: false; error: string } {
  const result = lessonSchema.safeParse(json);
  if (result.success) return { ok: true, lesson: result.data };
  const issue = result.error.issues[0]!;
  return { ok: false, error: `${issue.path.join('.') || 'lesson'}: ${issue.message}` };
}
