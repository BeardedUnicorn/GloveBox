/**
 * The move library GloveBox ships, in five tiers: foundations, flails and
 * whips, tutting, tech and contours, and combos. Each is plain lesson data;
 * the helpers here only save writing the left hand out as the right hand's
 * mirror image. docs/lessons/glove-tricks-review.md says where every move
 * comes from: the glovers who teach it and what they coach.
 */

import type { Vec2 } from '../core/types';
import { mirrorPath } from './paths';
import { type HandSpecInput, type LessonDef, type LessonInput, lessonSchema, pathSchema } from './schema';

const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** Hand span (thumb to pinky) the library is written for, stage units. */
const SPAN = 0.17;
/** The fingers that roll; the thumbs hold still (every teacher's rolls leave them out). */
const FOUR = [1, 2, 3, 4];

/** The right hand's spec as the left hand's mirror image (layouts and rotation mirror on their own). */
export const mirrored = (right: HandSpecInput): HandSpecInput => ({
  ...right,
  anchor: mirrorPath(pathSchema.parse(right.anchor)),
});

const both = (right: HandSpecInput) => ({ type: 'hands' as const, L: mirrored(right), R: right });

/** Every light unless the move hides some (the downward roll's tucked thumbs). */
type BuiltinInput = Omit<LessonInput, 'schemaVersion' | 'version' | 'origin' | 'nominalSpan' | 'activeSlots'> &
  Partial<Pick<LessonInput, 'activeSlots'>>;

const lesson = (input: BuiltinInput) =>
  lessonSchema.parse({
    schemaVersion: 1,
    version: 1,
    origin: 'builtin',
    activeSlots: ALL,
    nominalSpan: SPAN,
    ...input,
  });

const v = (x: number, y: number): Vec2 => ({ x, y });
/** Text cues at beats: [beat, words]. */
const cues = (...list: [number, string][]) => list.map(([beat, label]) => ({ beat, kind: 'text' as const, label }));

// ── Finger shapes, right hand, thumb → pinky, span units from the palm ──────

/** Underhand roll: palm up, pinky toward the middle, thumb out to the side, fingertips on an arc. */
const PINKY_IN = [v(0.5, 0.02), v(0.32, -0.4), v(0.1, -0.5), v(-0.12, -0.47), v(-0.32, -0.34)];
/** Overhand roll: palm down, the fingertips a row with the index toward the middle, the thumb tucked under. */
const ROW = [v(-0.12, 0.12), v(-0.32, -0.3), v(-0.1, -0.35), v(0.12, -0.33), v(0.32, -0.27)];
/** Splits: fingers pressed together, then one gap travelling across the hand. */
const THUMB_OUT = v(-0.34, -0.06);
const SPLIT_3_1 = [THUMB_OUT, v(-0.14, -0.48), v(-0.05, -0.53), v(0.04, -0.5), v(0.3, -0.38)];
const SPLIT_2_2 = [THUMB_OUT, v(-0.2, -0.48), v(-0.11, -0.53), v(0.13, -0.5), v(0.22, -0.42)];
const SPLIT_1_3 = [THUMB_OUT, v(-0.3, -0.45), v(-0.04, -0.53), v(0.05, -0.5), v(0.14, -0.42)];
const TOGETHER = [THUMB_OUT, v(-0.13, -0.48), v(-0.04, -0.53), v(0.05, -0.5), v(0.14, -0.42)];
/** Whips: the thumb at the palm point (it's the whip's center), the four fingers fanned around it. */
const WHIP = [v(0, 0), v(-0.12, -0.44), v(0.08, -0.46), v(0.26, -0.38), v(0.4, -0.24)];
/** An L: thumb out toward the middle, index straight up, the other fingers curled away. */
const L_UP = [v(-0.45, 0), v(0, -0.5), v(0.1, -0.14), v(0.17, -0.1), v(0.22, -0.05)];
/** The same L flipped over: thumb still toward the middle, index pointing down. */
const L_DOWN = L_UP.map(p => v(p.x, -p.y));
/** Pointing down and in at 45°, for tracing the other hand. */
const POINT = [v(-0.1, -0.1), v(-0.36, 0.36), v(0.08, 0.06), v(0.12, 0.02), v(0.14, -0.03)];
/** Clocking: the index knuckle at the palm point, the index the clock hand, the rest curled below. */
const CLOCK = [v(-0.16, 0.12), v(0, -0.42), v(0.1, 0.1), v(0.17, 0.14), v(0.22, 0.2)];
/** Point isolation: thumb and index pinched at the palm point, the other three fingers out. */
const PINCH = [v(0, 0.01), v(0.01, -0.01), v(0.24, -0.3), v(0.36, -0.23), v(0.45, -0.12)];
/** Fixed 45s: each finger a step lower than the one beside it. V: lowest toward the middle. */
const FORTY_FIVE_V = [THUMB_OUT, v(-0.18, -0.08), v(-0.06, -0.2), v(0.06, -0.32), v(0.18, -0.44)];
const FORTY_FIVE_A = [THUMB_OUT, v(-0.18, -0.48), v(-0.06, -0.36), v(0.06, -0.24), v(0.18, -0.12)];
/** All five tips gathered to a point, ready to burst open. */
const GATHER = [v(-0.05, -0.3), v(-0.02, -0.34), v(0.01, -0.35), v(0.04, -0.33), v(0.06, -0.3)];
/** Tips around the right side of an imagined ball, top to bottom. */
const BALL_SIDE = [-72, -36, 0, 36, 72].map(degrees => ({
  x: 0.55 * Math.cos((degrees * Math.PI) / 180),
  y: 0.55 * Math.sin((degrees * Math.PI) / 180),
}));

// ── Moves the combos reuse ─────────────────────────────────────────────────

/**
 * A roll relayed across both hands, eight fingers one after another (thumbs
 * still): each hand's turns take a quarter of the loop, the second hand
 * starting where the first leaves off. Opens first, from fists.
 */
const relayRoll = (layout: Vec2[], at: number, leftOrder: 'thumbFirst' | 'pinkyFirst', amplitude: number) => {
  const roll = { style: 'roll' as const, amplitude, width: 0.05, fingers: FOUR, spread: 0.25 };
  const rightOrder = leftOrder === 'thumbFirst' ? 'pinkyFirst' : 'thumbFirst';
  return {
    type: 'hands',
    L: { anchor: { type: 'static', at: v(-at, 0.04) }, layout, roll: { ...roll, order: leftOrder, offset: 0.5 } },
    R: { anchor: { type: 'static', at: v(at, 0.04) }, layout, roll: { ...roll, order: rightOrder, offset: 0.75 } },
  };
};

/** Underhand: the left index opens first and the roll crosses at the pinkies. */
const upwardRoll = relayRoll(PINKY_IN, 0.07, 'thumbFirst', 0.32);
/** Overhand: the left pinky opens first and the roll crosses at the index fingers. */
const downwardRoll = relayRoll(ROW, 0.07, 'pinkyFirst', 0.3);

/** A dip running left pinky → left index, across, right index → right pinky, fingers open throughout. */
const fingerWave = {
  type: 'hands' as const,
  L: {
    anchor: { type: 'static' as const, at: v(-0.13, 0.04) },
    layout: 'fan' as const,
    roll: { amplitude: 0.3, width: 0.25, order: 'pinkyFirst' as const, fingers: FOUR, spread: 0.5 },
  },
  R: {
    anchor: { type: 'static' as const, at: v(0.13, 0.04) },
    layout: 'fan' as const,
    roll: { amplitude: 0.3, width: 0.25, order: 'thumbFirst' as const, fingers: FOUR, spread: 0.5, offset: 0.5 },
  },
};

/** A wrist flail: the palm on a small circle, the fingers pointing out from it all the way round. */
const flail = (center: Vec2, dir: 1 | -1, turn: 1 | -1, phase = 0): HandSpecInput => ({
  anchor: { type: 'circle', center, radius: 0.05, dir, start: -Math.PI / 2 },
  layout: 'flat',
  rotation: { perLoop: turn },
  phase,
});
const RIGHT_FLAIL = flail(v(0.2, 0.02), 1, 1);
/** Both hands circling clockwise, the left hand's turn written mirrored (-1) so it turns the same way on screen. */
const sameWay = (phase: number) => ({
  type: 'hands',
  L: flail(v(-0.2, 0.02), 1, -1, phase),
  R: RIGHT_FLAIL,
});
const wristFlails = both(RIGHT_FLAIL);
const splitFlails = sameWay(0.5);

const whips = {
  type: 'hands' as const,
  ...(() => {
    const right: HandSpecInput = {
      anchor: { type: 'static', at: v(0.15, 0.03) },
      layout: WHIP,
      rotation: { base: -1.1, perLoop: 1 },
      roll: { amplitude: 0.36, width: 0.35, order: 'thumbFirst', fingers: FOUR, spread: 0.12 },
    };
    return { R: right, L: { ...mirrored(right), phase: 0.5 } };
  })(),
};

const fingerBox = {
  type: 'hands' as const,
  L: { anchor: { type: 'static' as const, at: v(-0.08, 0.06) }, layout: L_UP },
  R: {
    anchor: {
      type: 'polyline' as const,
      // From the field goal (thumbs touching) to the box's top-right corner: thumb on the left index, index on the left thumb
      points: [v(0.08, 0.06), v(-0.08 + 0.45 * SPAN, 0.06 - 0.5 * SPAN)],
      closed: false,
      ease: 'inOutCubic' as const,
      holdFrac: 0.5,
    },
    layout: { steps: [L_UP, L_DOWN], holdFrac: 0.5 },
  },
};

/** Where the tracing index goes: in along the left thumb, into the corner, up the left index. */
const TRACE = [v(-0.03, 0.045), v(-0.085, 0.045), v(-0.085, -0.02)];
const tracing = {
  type: 'hands' as const,
  L: { anchor: { type: 'static' as const, at: v(-0.1, 0.06) }, layout: L_UP },
  R: {
    anchor: {
      type: 'polyline' as const,
      // The palm sits up and to the right of the index tip it steers
      points: TRACE.map(p => v(p.x - POINT[1]!.x * SPAN, p.y - POINT[1]!.y * SPAN)),
      closed: false,
      ease: 'inOutCubic' as const,
      holdFrac: 0.4,
    },
    layout: POINT,
  },
};

const clocking = both({
  anchor: { type: 'static', at: v(0.15, 0.06) },
  layout: CLOCK,
  rotation: { steps: [-1, -0.5, 0, 0.5, 1, 0.5, 0, -0.5].map(k => (k * Math.PI) / 3), holdFrac: 0.6 },
});

export const BUILTIN_LESSONS: LessonDef[] = [
  // ── Tier 1: foundations ─────────────────────────────────────────────────
  lesson({
    id: 'finger-wave',
    name: 'Finger wave',
    description:
      'Fingers open, palms to the camera. One finger at a time dips toward the palm and comes back, from your left pinky across to your right pinky: a wave rolling over both hands.',
    tips: [
      'Your thumbs stay still: only the four fingers dip.',
      'The wave crosses the middle from your left index straight to your right index, with no gap.',
      'Go slowly at first and watch for a finger that moves early.',
    ],
    tier: 1,
    tags: ['wave', 'fingers'],
    timing: { bpm: 66, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    motion: { kind: 'generator', spec: fingerWave },
  }),
  lesson({
    id: 'upward-roll',
    name: 'Upward finger roll',
    description:
      'The first move every glover learns. Palms up, pinky edges together, thumbs out: open one finger at a time from your left index across to your right, then close them in the same order.',
    tips: [
      'Your pinkies are where the roll crosses hands: keep them touching, moving one right after the other.',
      'Open each finger all the way. Clean rolls come from reach, not speed.',
      'Keep your thumbs out and still. Once it feels easy, practice leading with your right hand too.',
    ],
    tier: 1,
    tags: ['rolls', 'fingers'],
    timing: { bpm: 90, beatsPerLoop: 16, defaultLoops: 3, countInBeats: 4 },
    cues: cues([0, 'Open, one finger a beat'], [8, 'Close, in the same order']),
    motion: { kind: 'generator', spec: upwardRoll },
  }),
  lesson({
    id: 'downward-roll',
    name: 'Downward finger roll',
    description:
      'The overhand roll. Palms down, fists side by side with the index fingers touching, thumbs tucked: open from your left pinky across to your right pinky, then close the same way.',
    tips: [
      'Your index fingers touch and move together: they are the bridge between your hands.',
      'Look for the U: the shape should match on both sides of the middle.',
      'Tuck your thumbs under so the fingers have something to wrap around.',
    ],
    tier: 1,
    tags: ['rolls', 'fingers'],
    timing: { bpm: 90, beatsPerLoop: 16, defaultLoops: 3, countInBeats: 4 },
    activeSlots: [1, 2, 3, 4, 6, 7, 8, 9],
    cues: cues([0, 'Open, one finger a beat'], [8, 'Close, in the same order']),
    motion: { kind: 'generator', spec: downwardRoll },
  }),
  lesson({
    id: 'splits',
    name: 'Finger splits',
    description:
      'Compressions: split your pinky off, then two and two (the "Spock"), then one and three, then close up. The gap travels across your hand.',
    tips: [
      'Move one gap at a time; the other fingers stay pressed together.',
      'Each split lands on a beat: count 1, 2, 3, 4.',
      "Stretch first and don't force it. Two and two is the hard one.",
    ],
    tier: 1,
    tags: ['fingers', 'tech'],
    timing: { bpm: 60, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
    cues: cues([0, '3 + 1'], [1, '2 + 2'], [2, '1 + 3'], [3, 'Together']),
    motion: {
      kind: 'generator',
      spec: both({
        anchor: { type: 'static', at: v(0.16, 0.06) },
        layout: { steps: [SPLIT_3_1, SPLIT_2_2, SPLIT_1_3, TOGETHER], holdFrac: 0.5 },
      }),
    },
  }),
  lesson({
    id: 'roll-crawl',
    name: 'Roll crawl',
    description:
      'Rolls that travel. Slide both hands sideways while the roll opens, freeze, slide on while it closes, and freeze again on two fists.',
    tips: [
      'Move only while the fingers roll. When both hands are fists, freeze.',
      'Keep your pinkies together while the hands travel.',
      'Slide in straight lines: your two hands move as one.',
    ],
    tier: 1,
    tags: ['rolls', 'movement'],
    timing: { bpm: 84, beatsPerLoop: 16, defaultLoops: 3, countInBeats: 4 },
    cues: cues(
      [0, 'Freeze on two fists'],
      [2, 'Slide and open'],
      [4, 'Freeze'],
      [6, 'Slide and close'],
      [8, 'Freeze on two fists'],
      [10, 'Slide back and open'],
      [12, 'Freeze'],
      [14, 'Slide back and close']
    ),
    motion: {
      kind: 'generator',
      spec: {
        type: 'hands',
        ...Object.fromEntries(
          (['L', 'R'] as const).map(hand => {
            const x = hand === 'L' ? -0.07 : 0.07;
            const spec: HandSpecInput = {
              anchor: {
                type: 'polyline',
                points: [v(x - 0.12, 0.03), v(x, 0.03), v(x + 0.12, 0.03)],
                closed: false,
                ease: 'inOutCubic',
                holdFrac: 0.5,
              },
              layout: PINKY_IN,
              // Two rolls a loop, timed to the slides: open on one, close on the next, still in between
              roll: {
                style: 'roll',
                amplitude: 0.32,
                width: 0.025,
                order: hand === 'L' ? 'thumbFirst' : 'pinkyFirst',
                fingers: FOUR,
                spread: 0.125,
                offset: hand === 'L' ? -0.25 : -0.125,
                cyclesPerLoop: 2,
              },
            };
            return [hand, spec];
          })
        ),
      },
    },
  }),

  // ── Tier 2: flails and whips ────────────────────────────────────────────
  lesson({
    id: 'wrist-flails',
    name: 'Wrist flails',
    description:
      'Fingers together, each hand swings a circle from the wrist, mirrored, with the fingers pointing out all the way round. Two rings of light.',
    tips: [
      'Never stop: flails are continuous circles, with no pauses.',
      'Faster only looks better while the circle stays round.',
      'Relax your wrist and reach a little; tension makes the circle lumpy.',
    ],
    tier: 2,
    tags: ['flails', 'circles'],
    timing: { bpm: 84, beatsPerLoop: 2, defaultLoops: 12, countInBeats: 4 },
    motion: { kind: 'generator', spec: wristFlails },
  }),
  lesson({
    id: 'split-flails',
    name: 'Split flails',
    description: 'Both hands flail the same way round, half a turn apart, like runners in staggered lanes.',
    tips: [
      'Same direction, opposite timing: one hand at the top while the other is at the bottom.',
      'Lost it? Find the four checkpoints again: top, side, bottom, side.',
    ],
    tier: 2,
    tags: ['flails', 'circles'],
    timing: { bpm: 84, beatsPerLoop: 2, defaultLoops: 12, countInBeats: 4 },
    motion: { kind: 'generator', spec: splitFlails },
  }),
  lesson({
    id: 'flail-patterns',
    name: 'Four flail patterns',
    description:
      'All four ways two hands can flail, two circles each: together the same way, together mirrored, split the same way, split mirrored.',
    tips: [
      '"Together" means both hands start at the top; "split" means half a turn apart.',
      'Mirrored circles go opposite ways. Split and mirrored is the hardest of the four.',
      'Learn each pattern at 0.5× before linking them.',
    ],
    tier: 2,
    tags: ['flails', 'circles'],
    timing: { bpm: 84, beatsPerLoop: 16, defaultLoops: 3, countInBeats: 4 },
    cues: cues([0, 'Together, same way'], [4, 'Together, mirrored'], [8, 'Split, mirrored'], [12, 'Split, same way']),
    motion: {
      kind: 'generator',
      spec: {
        type: 'sequence',
        // Ordered so the left hand changes pattern where it already is (both "together" start at the top, both
        // "split" at the bottom): only the together ↔ split changes need a beat to catch up
        parts: [
          { spec: sameWay(0), catchUp: 0 },
          { spec: wristFlails, catchUp: 1 },
          { spec: { ...wristFlails, L: { ...wristFlails.L, phase: 0.5 } }, catchUp: 0 },
          { spec: splitFlails, catchUp: 1 },
        ].flatMap(({ spec, catchUp }) => [
          { beats: 2, spec, blendBeats: 0 },
          { beats: 2, spec, blendBeats: catchUp },
        ]),
      },
    },
  }),
  lesson({
    id: 'figure-8',
    name: 'Figure 8',
    description:
      'One sideways 8 in front of your chest: your right hand leads and your left follows a quarter-turn behind. Glovers often join the wrists; here the hands stay apart so the camera sees both.',
    tips: [
      'Let your elbows do the work, not your wrists.',
      "Keep turning the same way; don't reverse partway through.",
      'Keep both loops of the 8 the same size.',
    ],
    tier: 2,
    tags: ['figure 8', 'flow'],
    timing: { bpm: 72, beatsPerLoop: 4, defaultLoops: 6, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: (() => {
        const eight = { type: 'lissajous' as const, center: v(0, 0.02), ax: 0.2, ay: 0.08, fx: 1, fy: 2 };
        return {
          type: 'hands',
          R: { anchor: eight, layout: 'flat' },
          L: { anchor: eight, layout: 'flat', phase: 0.75 },
        };
      })(),
    },
  }),
  lesson({
    id: 'whips',
    name: 'Whips',
    description:
      'Your fingers roll open and sweep a full circle around a still thumb, then close around it. The hands take turns.',
    tips: [
      'Point your thumb at the viewer: it is the center of the circle and barely moves.',
      'Your palm faces the viewer, not off to the side.',
      'A whip is a finger roll turned around the thumb. Get clean rolls first.',
    ],
    tier: 2,
    tags: ['whips', 'rolls', 'circles'],
    timing: { bpm: 76, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
    motion: { kind: 'generator', spec: whips },
  }),

  // ── Tier 3: tutting ─────────────────────────────────────────────────────
  lesson({
    id: 'king-tut-box',
    name: 'King Tut box',
    description: 'Flat hands, bent 90° at the wrist, trace a box and stop dead on each corner.',
    tips: [
      'Flat, straight angles: no bending at the knuckles ("duck hands").',
      'Lift your elbows so your wrists can bend a full 90°.',
      'Hit each corner on the beat before you move on.',
    ],
    tier: 3,
    tags: ['tutting', 'box'],
    timing: { bpm: 76, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    cues: cues([0, 'Stop on every corner']),
    motion: {
      kind: 'generator',
      spec: both({
        anchor: {
          type: 'polyline',
          points: [v(0.08, -0.06), v(0.22, -0.06), v(0.22, 0.08), v(0.08, 0.08)],
          closed: true,
          ease: 'inOutCubic',
          holdFrac: 0.4,
        },
        layout: 'flat',
        // Turn while sliding, land square on the corner
        rotation: { steps: [0, Math.PI / 2, 0, Math.PI / 2], holdFrac: 0.4 },
      }),
    },
  }),
  lesson({
    id: 'grid-slides',
    name: 'Grid slides',
    description:
      'Slide a still, spread hand along straight lines (out, up, in and down) and land each point on the beat. Nothing tilts.',
    tips: [
      'The shape of your hand never changes, only where it is.',
      'Land and freeze: no drifting after the stop.',
      'Gentle and precise beats fast.',
    ],
    tier: 3,
    tags: ['tutting', 'grid', 'isolation'],
    timing: { bpm: 76, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    cues: cues([0, 'Out and back'], [2, 'Up and back'], [4, 'In and back'], [6, 'Down and back']),
    motion: {
      kind: 'generator',
      spec: (() => {
        const c = v(0.18, 0.03);
        return both({
          anchor: {
            type: 'polyline',
            points: [c, v(0.27, 0.03), c, v(0.18, -0.06), c, v(0.1, 0.03), c, v(0.18, 0.12)],
            closed: true,
            ease: 'inOutCubic',
            holdFrac: 0.5,
          },
          layout: 'fan',
        });
      })(),
    },
  }),
  lesson({
    id: 'box-move',
    name: 'Box move',
    description:
      'Both hands go round a box like turning a steering wheel, one on each side, rolling the fingers on every corner. A simpler take on the box move: the palms stay facing you.',
    tips: [
      'Get the path clean before you add the rolls.',
      'Hold every corner while the fingers roll.',
      'Turn it like a steering wheel: both hands move together.',
    ],
    tier: 3,
    tags: ['tutting', 'box', 'rolls'],
    timing: { bpm: 72, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    cues: cues([0, 'Roll on the corner, then turn']),
    motion: {
      kind: 'generator',
      spec: (() => {
        const hand = (phase: number): HandSpecInput => ({
          anchor: {
            type: 'polyline',
            points: [v(0.13, -0.13), v(0.13, 0.13), v(-0.13, 0.13), v(-0.13, -0.13)],
            closed: true,
            ease: 'inOutCubic',
            holdFrac: 0.5,
          },
          layout: 'fan',
          roll: { amplitude: 0.3, width: 0.2, order: 'thumbFirst', fingers: FOUR, spread: 0.4, cyclesPerLoop: 4 },
          phase,
        });
        return { type: 'hands', R: hand(0), L: hand(0.5) };
      })(),
    },
  }),
  lesson({
    id: 'finger-box',
    name: 'Finger box',
    description:
      'Make two Ls, thumb to thumb: the field goal. Flip your right hand up and over to close a box, then open it again.',
    tips: [
      'Keep every angle at 90°; slanted fingers look sloppy.',
      'Fingertips meet at the corners: thumb to index.',
      "Curl your other fingers away so they don't linger in the shape.",
    ],
    tier: 3,
    tags: ['tutting', 'finger tutting', 'box'],
    timing: { bpm: 66, beatsPerLoop: 4, defaultLoops: 8, countInBeats: 4 },
    cues: cues([0, 'Field goal'], [2, 'Box']),
    motion: { kind: 'generator', spec: fingerBox },
  }),
  lesson({
    id: 'tracing',
    name: 'Tracing',
    description:
      'Your left hand holds an L. Your right index slides along the inside of the thumb, up the index finger and back, stopping on each corner.',
    tips: [
      'Keep the tracing finger touching the other hand.',
      'Hit each corner cleanly before you start the next line.',
      'Your still hand stays still: no floating.',
    ],
    tier: 3,
    tags: ['tutting', 'finger tutting', 'tracing'],
    timing: { bpm: 70, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    cues: cues([0, 'Along the thumb'], [2, 'Up the index'], [4, 'Back down'], [6, 'Back along the thumb']),
    motion: { kind: 'generator', spec: tracing },
  }),

  // ── Tier 4: tech and contours ───────────────────────────────────────────
  lesson({
    id: 'clocking',
    name: 'Clocking',
    description:
      'Each index finger is a clock hand, ticking from angle to angle around its knuckle: one tick a beat, over the top and back.',
    tips: ['The center of the clock, your knuckle, never moves.', "Tick, don't sweep: land each angle on the beat."],
    tier: 4,
    tags: ['tech', 'clocking'],
    timing: { bpm: 72, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    cues: cues([0, 'Tick on every beat']),
    motion: { kind: 'generator', spec: clocking },
  }),
  lesson({
    id: 'point-isolation',
    name: 'Point isolation',
    description:
      'Pinch your thumb and index together and keep that point dead still while the rest of your hand swings around it.',
    tips: [
      'Pick a real spot in the air and keep the pinch on it.',
      'The usual mistake: the "still" point drifts the way your hand moves.',
      'Try one hand at a time first.',
    ],
    tier: 4,
    tags: ['tech', 'isolation'],
    timing: { bpm: 66, beatsPerLoop: 4, defaultLoops: 6, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: both({
        anchor: { type: 'static', at: v(0.12, 0.06) },
        layout: PINCH,
        rotation: { steps: [-0.6, 0.6], holdFrac: 0 },
      }),
    },
  }),
  lesson({
    id: 'fixed-45s',
    name: 'Fixed 45s',
    description:
      'Bend each finger a little more than the one beside it, so your fingertips make a 45° line. Your hands make a V, then flip it upside down.',
    tips: [
      'Each finger one step lower than the last: a straight line, no dents.',
      'Keep the angle at 45° on both hands.',
    ],
    tier: 4,
    tags: ['tech', 'fingers'],
    timing: { bpm: 66, beatsPerLoop: 4, defaultLoops: 6, countInBeats: 4 },
    cues: cues([0, 'V'], [2, 'Flip it']),
    motion: {
      kind: 'generator',
      spec: both({
        anchor: { type: 'static', at: v(0.13, 0.08) },
        layout: { steps: [FORTY_FIVE_V, FORTY_FIVE_A], holdFrac: 0.5 },
      }),
    },
  }),
  lesson({
    id: 'ball-contour',
    name: 'Ball contour',
    description:
      'Hold an imaginary ball between your hands and rock it side to side at a steady speed. The shape of the ball never changes.',
    tips: [
      'The ball never changes size.',
      'Keep a steady speed; change it only with the music.',
      'Let your hands press on the surface of the ball.',
    ],
    tier: 4,
    tags: ['contours', 'liquid'],
    timing: { bpm: 66, beatsPerLoop: 8, defaultLoops: 4, countInBeats: 4 },
    motion: {
      kind: 'generator',
      spec: {
        type: 'hands',
        R: {
          anchor: { type: 'static', at: v(0, 0.02) },
          layout: BALL_SIDE,
          rotation: { steps: [-0.7, 0.7], holdFrac: 0 },
        },
        // The left hand mirrors its rotation, so the same turn of the ball is the opposite steps
        L: {
          anchor: { type: 'static', at: v(0, 0.02) },
          layout: BALL_SIDE,
          rotation: { steps: [0.7, -0.7], holdFrac: 0 },
        },
      },
    },
  }),

  // ── Tier 5: combos ──────────────────────────────────────────────────────
  lesson({
    id: 'roll-to-whip',
    name: 'Roll to whip',
    description: 'An upward roll that opens straight into whips, then winds down into wrist flails.',
    tips: [
      'The roll is the bridge: open into the first whip without stopping.',
      'Keep your whips the same size on both sides.',
    ],
    tier: 5,
    tags: ['combo'],
    timing: { bpm: 84, beatsPerLoop: 24, defaultLoops: 2, countInBeats: 4 },
    cues: cues([0, 'Roll'], [8, 'Whips'], [16, 'Flails']),
    motion: {
      kind: 'generator',
      spec: {
        type: 'sequence',
        parts: [
          { beats: 8, spec: upwardRoll, blendBeats: 1 },
          { beats: 4, spec: whips, blendBeats: 0 },
          { beats: 4, spec: whips, blendBeats: 1 },
          ...[0, 0, 0, 1].map(blendBeats => ({ beats: 2, spec: wristFlails, blendBeats })),
        ],
      },
    },
  }),
  lesson({
    id: 'tech-combo',
    name: 'Tech combo',
    description: 'A tech set: a finger box, into tracing, into clocking.',
    tips: ['Land each shape before you start the next.', 'Whatever one hand does, the still hand stays still.'],
    tier: 5,
    tags: ['combo', 'tutting', 'tech'],
    timing: { bpm: 70, beatsPerLoop: 24, defaultLoops: 2, countInBeats: 4 },
    cues: cues([0, 'Finger box'], [8, 'Trace'], [16, 'Clock']),
    motion: {
      kind: 'generator',
      spec: {
        type: 'sequence',
        parts: [
          { beats: 4, spec: fingerBox, blendBeats: 0 },
          { beats: 4, spec: fingerBox, blendBeats: 1 },
          { beats: 8, spec: tracing, blendBeats: 1 },
          { beats: 8, spec: clocking, blendBeats: 1 },
        ],
      },
    },
  }),
  lesson({
    id: 'first-light-show',
    name: 'First light show',
    description:
      'Your first full show, in the shape every show has: slow rolls to open, flails building up, a burst on the drop, then a wave to wind down.',
    tips: [
      'A light show has a shape: start simple, build, hit the drop, wind down.',
      'Save your biggest moment for the climax.',
      'Clean and symmetrical beats a long list of moves.',
    ],
    tier: 5,
    tags: ['combo', 'show'],
    timing: { bpm: 88, beatsPerLoop: 36, defaultLoops: 2, countInBeats: 4 },
    cues: cues([0, 'Open with rolls'], [8, 'Build'], [16, 'Gather…'], [17, 'Burst!'], [20, 'Flail'], [28, 'Wind down']),
    motion: {
      kind: 'generator',
      spec: {
        type: 'sequence',
        parts: [
          { beats: 8, spec: upwardRoll, blendBeats: 1 },
          ...[0, 0, 0, 1].map(blendBeats => ({ beats: 2, spec: wristFlails, blendBeats })),
          {
            beats: 4,
            spec: both({
              anchor: { type: 'static', at: v(0.12, 0.04) },
              layout: { steps: [GATHER, 'fan'], holdFrac: 0.5 },
            }),
            blendBeats: 1,
          },
          ...[0, 0, 0, 1].map(blendBeats => ({ beats: 2, spec: splitFlails, blendBeats })),
          { beats: 8, spec: fingerWave, blendBeats: 1 },
        ],
      },
    },
  }),
];

/** A built-in lesson by id. */
export const builtinLesson = (id: string): LessonDef | undefined => BUILTIN_LESSONS.find(l => l.id === id);
