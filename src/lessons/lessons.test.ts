import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { distance } from '../core/vec';
import type { Pose10, Vec2 } from '../core/types';
import { BUILTIN_LESSONS, builtinLesson, mirrored } from './builtin';
import { boundsOf, compile } from './compile';
import { bump, compileGen, handTips, LAYOUT_POINTS, layoutPoints, LEFT_TO_RIGHT, rollAmount, rotationAt } from './generators';
import { corners, inOutCubic, mirrorPath, pointOn } from './paths';
import { type GenSpec, type HandSpec, handSchema, type LessonDef, lessonSchema, parseLesson, pathSchema } from './schema';
import { catmullRom, trackPose } from './track';

const v = (x: number, y: number): Vec2 => ({ x, y });
const close = (a: Vec2 | null | undefined, b: Vec2, digits = 6) => {
  expect(a).not.toBeNull();
  expect(a!.x).toBeCloseTo(b.x, digits);
  expect(a!.y).toBeCloseTo(b.y, digits);
};
const hand = (input: unknown): HandSpec => handSchema.parse(input);

describe('paths', () => {
  test('static stays put', () => {
    expect(pointOn(pathSchema.parse({ type: 'static', at: v(1, 2) }), 0.7)).toEqual(v(1, 2));
  });

  test('a circle starts at its start angle and turns its way', () => {
    const cw = pathSchema.parse({ type: 'circle', center: v(0, 0), radius: 1, dir: 1 });
    close(pointOn(cw, 0), v(1, 0));
    close(pointOn(cw, 0.25), v(0, 1)); // +y is down: clockwise on screen
    const ccw = pathSchema.parse({ type: 'circle', center: v(0, 0), radius: 1, dir: -1 });
    close(pointOn(ccw, 0.25), v(0, -1));
    close(pointOn(cw, 1.25), pointOn(cw, 0.25));
    close(pointOn(cw, -0.75), pointOn(cw, 0.25));
  });

  test('a 1:2 lissajous is an infinity: two loops in y per loop in x', () => {
    const inf = pathSchema.parse({ type: 'lissajous', center: v(0, 0), ax: 2, ay: 1, fx: 1, fy: 2 });
    close(pointOn(inf, 0), v(0, 0));
    close(pointOn(inf, 0.125), v(2 * Math.sin(Math.PI / 4), 1));
    close(pointOn(inf, 0.5), v(0, 0));
  });

  test('a closed polyline visits each corner, holding there first', () => {
    const box = pathSchema.parse({
      type: 'polyline',
      points: [v(0, 0), v(1, 0), v(1, 1), v(0, 1)],
      closed: true,
      ease: 'linear',
      holdFrac: 0.5,
    });
    close(pointOn(box, 0), v(0, 0));
    close(pointOn(box, 0.1), v(0, 0)); // still holding
    close(pointOn(box, 0.1875), v(0.5, 0)); // halfway through the move
    close(pointOn(box, 0.25), v(1, 0));
    close(pointOn(box, 0.99), v(0, 0.08)); // back up the last side
    expect(corners(box)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  test('an open polyline goes out and comes back, eased', () => {
    const line = pathSchema.parse({ type: 'polyline', points: [v(0, 0), v(2, 0)], closed: false, ease: 'inOutCubic' });
    close(pointOn(line, 0.25), v(1, 0));
    close(pointOn(line, 0.5), v(2, 0));
    close(pointOn(line, 0.75), v(1, 0));
    expect(corners(line)).toEqual([0, 0.5]);
    expect(corners(pathSchema.parse({ type: 'static', at: v(0, 0) }))).toEqual([]);
  });

  test('inOutCubic is 0, ½ and 1 at its ends and middle, and symmetric', () => {
    expect(inOutCubic(0)).toBe(0);
    expect(inOutCubic(0.5)).toBe(0.5);
    expect(inOutCubic(1)).toBe(1);
    expect(inOutCubic(0.2) + inOutCubic(0.8)).toBeCloseTo(1);
  });

  test('every mirrored path is the reflection of the original at every phase', () => {
    const paths = [
      { type: 'static', at: v(0.2, 0.1) },
      { type: 'circle', center: v(0.2, 0), radius: 0.1, dir: 1, start: 0.3 },
      { type: 'lissajous', center: v(0.1, 0), ax: 0.1, ay: 0.05, fx: 1, fy: 2, phase: 0.2 },
      { type: 'polyline', points: [v(0.1, 0), v(0.3, 0.1)], closed: false, ease: 'linear' },
    ].map(p => pathSchema.parse(p));
    for (const path of paths) {
      const mirror = mirrorPath(path);
      for (const phase of [0, 0.13, 0.5, 0.77]) {
        const a = pointOn(path, phase);
        close(pointOn(mirror, phase), v(-a.x, a.y));
      }
    }
    const ccw = mirrorPath(pathSchema.parse({ type: 'circle', center: v(0, 0), radius: 1, dir: -1 }));
    expect(ccw.type === 'circle' && ccw.dir).toBe(1);
  });
});

describe('hand generators', () => {
  test('named layouts have five tips; custom ones are used as given', () => {
    for (const name of ['fan', 'flat', 'ring', 'fist'] as const) expect(LAYOUT_POINTS[name]).toHaveLength(5);
    const custom = [v(0, -1), v(0, -1), v(0, -1), v(0, -1), v(0, -1)];
    expect(layoutPoints(custom)).toBe(custom);
    // Thumb on the inside (-x for the right hand), pinky outside
    expect(LAYOUT_POINTS.fan[0]!.x).toBeLessThan(LAYOUT_POINTS.fan[4]!.x);
  });

  test('a bump is 1 at its center and 0 past half its width', () => {
    expect(bump(0, 0.4)).toBe(1);
    expect(bump(0.1, 0.4)).toBeCloseTo(0.5);
    expect(bump(0.2, 0.4)).toBe(0);
    expect(bump(-0.3, 0.4)).toBe(0);
  });

  test('a roll curls each finger in turn, in its order', () => {
    const roll = hand({ anchor: { type: 'static', at: v(0, 0) }, layout: 'fan', roll: { amplitude: 0.3, width: 0.2, order: 'thumbFirst' } }).roll!;
    // Finger i peaks at phase i/5 + width/2
    expect(rollAmount(roll, 0, 0.1)).toBeCloseTo(1);
    expect(rollAmount(roll, 2, 0.5)).toBeCloseTo(1);
    expect(rollAmount(roll, 2, 0.1)).toBe(0);
    const pinkyFirst = { ...roll, order: 'pinkyFirst' as const };
    expect(rollAmount(pinkyFirst, 4, 0.1)).toBeCloseTo(1);
  });

  test('rotation: none, a steady spin, and held steps eased into', () => {
    expect(rotationAt(undefined, 0.3)).toBe(0);
    const spin = hand({ anchor: { type: 'static', at: v(0, 0) }, layout: 'fan', rotation: { base: 1, perLoop: 1 } }).rotation;
    expect(rotationAt(spin, 0.25)).toBeCloseTo(1 + Math.PI / 2);
    const steps = hand({ anchor: { type: 'static', at: v(0, 0) }, layout: 'fan', rotation: { steps: [0, 1] } }).rotation;
    expect(rotationAt(steps, 0.1)).toBe(0); // holding the first step
    expect(rotationAt(steps, 0.375)).toBeCloseTo(0.5); // halfway through the turn
    expect(rotationAt(steps, 0.6)).toBe(1);
    expect(rotationAt(steps, 0.99)).toBeCloseTo(0, 1); // turning back to the first
  });

  test("the left hand's tips are the mirror image of the right's", () => {
    const right = hand({
      anchor: { type: 'circle', center: v(0.15, 0), radius: 0.05, dir: 1 },
      layout: 'fan',
      rotation: { perLoop: 0.25 },
      roll: { amplitude: 0.2, width: 0.3, order: 'pinkyFirst' },
    });
    const left = hand(mirrored(right));
    for (const phase of [0, 0.2, 0.55]) {
      const r = handTips('R', right, phase, 0.2);
      const l = handTips('L', left, phase, 0.2);
      r.forEach((tip, i) => close(l[i], v(-tip.x, tip.y)));
    }
  });

  test('a curl pulls a tip toward the palm, never through it, and a tip at the palm stays put', () => {
    const still = hand({ anchor: { type: 'static', at: v(0, 0) }, layout: 'fan' });
    const curling = hand({ ...still, roll: { amplitude: 5, width: 1, order: 'thumbFirst' } });
    const open = handTips('R', still, 0.5, 1);
    const curled = handTips('R', curling, 0.5, 1);
    curled.forEach((tip, i) => expect(Math.hypot(tip.x, tip.y)).toBeLessThanOrEqual(Math.hypot(open[i]!.x, open[i]!.y)));
    const atPalm = hand({ ...curling, layout: [v(0, 0), v(0, -1), v(0, -1), v(0, -1), v(0, -1)] });
    close(handTips('R', atPalm, 0.1, 1)[0], v(0, 0));
  });

  test('a hands spec fills only the hands it has', () => {
    const right = hand({ anchor: { type: 'static', at: v(0.2, 0) }, layout: 'fist' });
    const pose = compileGen({ type: 'hands', R: right }, 0.2).pose(0);
    expect(pose.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(pose.slice(5).every(p => p !== null)).toBe(true);
  });

  test("a polyline hand's corners are key phases, shifted by its phase", () => {
    const box = hand({
      anchor: { type: 'polyline', points: [v(0, 0), v(1, 0), v(1, 1), v(0, 1)], closed: true, ease: 'linear' },
      layout: 'flat',
      phase: 0.1,
    });
    expect(compileGen({ type: 'hands', R: box, L: mirrored(box) as HandSpec }, 0.2).keyPhases.map(k => +k.toFixed(6))).toEqual([
      0.15, 0.4, 0.65, 0.9,
    ]);
  });

  test('a wave lays the ten lights out left to right and rolls through them', () => {
    const wave: GenSpec = { type: 'wave', center: v(0, 0), spacing: 0.1, amplitude: 0.05, cycles: 1, dir: 1 };
    const motion = compileGen(wave, 0.2);
    const pose = motion.pose(0);
    const xs = LEFT_TO_RIGHT.map(slot => pose[slot]!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(pose[4]!.x).toBeCloseTo(-0.45);
    expect(pose[4]!.y).toBeCloseTo(0);
    expect(motion.keyPhases).toEqual([]);
    // Each light reaches the crest a tenth of a loop after its left neighbor
    expect(motion.pose(0.25)[4]!.y).toBeCloseTo(motion.pose(0.35)[3]!.y);
  });

  test('a sequence plays its parts in turn and blends into the next', () => {
    const at = (x: number): GenSpec => ({ type: 'hands', R: hand({ anchor: { type: 'static', at: v(x, 0) }, layout: 'fist' }) });
    const seq = compileGen(
      {
        type: 'sequence',
        parts: [
          { beats: 2, spec: at(0), blendBeats: 1 },
          { beats: 2, spec: at(1), blendBeats: 0 },
        ],
      },
      1
    );
    const palmX = (pose: Pose10) => pose[7]!.x - LAYOUT_POINTS.fist[2]!.x;
    expect(palmX(seq.pose(0))).toBeCloseTo(0);
    expect(palmX(seq.pose(0.375))).toBeCloseTo(0.5); // half way through the blend
    expect(palmX(seq.pose(0.6))).toBeCloseTo(1);
    expect(palmX(seq.pose(0.99))).toBeCloseTo(1); // the last part doesn't blend back
  });

  test('blending between parts that light different slots switches halfway', () => {
    const right: GenSpec = { type: 'hands', R: hand({ anchor: { type: 'static', at: v(1, 0) }, layout: 'fist' }) };
    const left: GenSpec = { type: 'hands', L: hand({ anchor: { type: 'static', at: v(-1, 0) }, layout: 'fist' }) };
    const seq = compileGen(
      {
        type: 'sequence',
        parts: [
          { beats: 1, spec: right, blendBeats: 1 },
          { beats: 1, spec: left, blendBeats: 0 },
        ],
      },
      1
    );
    expect(seq.pose(0.1)[5]).not.toBeNull(); // early in the blend: still the right hand
    expect(seq.pose(0.1)[0]).toBeNull();
    expect(seq.pose(0.4)[5]).toBeNull(); // late: the left hand
    expect(seq.pose(0.4)[0]).not.toBeNull();
  });

  test("a sequence's key phases are its parts', placed in the whole", () => {
    const box = hand({
      anchor: { type: 'polyline', points: [v(0, 0), v(1, 0)], closed: false, ease: 'linear' },
      layout: 'flat',
    });
    const seq = compileGen(
      {
        type: 'sequence',
        parts: [
          { beats: 3, spec: { type: 'wave', center: v(0, 0), spacing: 0.1, amplitude: 0.1, cycles: 1, dir: -1 }, blendBeats: 0 },
          { beats: 1, spec: { type: 'hands', R: box }, blendBeats: 0 },
        ],
      },
      1
    );
    expect(seq.keyPhases).toEqual([0.75, 0.875]);
  });
});

describe('keyframe tracks', () => {
  test('Catmull–Rom passes through its keyframes', () => {
    const [a, b, c, d] = [v(0, 0), v(1, 0), v(1, 1), v(3, 1)];
    close(catmullRom(a, b, c, d, 0), b);
    close(catmullRom(a, b, c, d, 1), c);
    // Coincident points don't divide by zero
    const p = catmullRom(b, b, b, b, 0.5);
    close(p, b);
  });

  const track = (frames: ([number, number] | null)[][], interpolation: 'linear' | 'catmullRom' = 'catmullRom') => ({
    samplesPerBeat: 1,
    interpolation,
    frames: frames.map(row => [...row, ...new Array(10 - row.length).fill(null)]),
  });

  test('plays back through every sample and loops', () => {
    const t = track([[[0, 0]], [[1, 0]], [[1, 1]], [[0, 1]]]);
    close(trackPose(t, 1)[0], v(1, 0));
    close(trackPose(t, 4)[0], v(0, 0));
    close(trackPose(t, -1)[0], v(0, 1));
    const mid = trackPose(t, 1.5)[0]!;
    expect(mid.x).toBeGreaterThan(1); // the curve bulges out between corners
    expect(trackPose(t, 1)[1]).toBeNull();
  });

  test('linear tracks draw straight lines', () => {
    close(trackPose(track([[[0, 0]], [[2, 2]]], 'linear'), 0.25)[0], v(0.5, 0.5));
  });

  test('a missing neighbor is extended from the segment; a missing end snaps to the nearer sample', () => {
    const t = track([[null], [[0, 0]], [[1, 0]], [null]]);
    close(trackPose(t, 1.5)[0], v(0.5, 0));
    expect(trackPose(t, 0.4)[0]).toBeNull();
    close(trackPose(t, 0.6)[0], v(0, 0));
  });
});

describe('compiling a lesson', () => {
  const base = (motion: unknown, extra: object = {}): LessonDef =>
    lessonSchema.parse({
      schemaVersion: 1,
      id: 'test',
      version: 1,
      name: 'Test',
      tier: 1,
      origin: 'recorded',
      timing: { bpm: 60, beatsPerLoop: 4, defaultLoops: 1, countInBeats: 0 },
      activeSlots: [5],
      nominalSpan: 0.2,
      motion,
      ...extra,
    });

  test('a generator loops every beatsPerLoop and lights only active slots', () => {
    const motion = compile(
      base({ kind: 'generator', spec: { type: 'hands', R: { anchor: { type: 'circle', center: { x: 0, y: 0 }, radius: 0.1, dir: 1 }, layout: 'fan' } } })
    );
    expect(motion.periodBeats).toBe(4);
    close(motion.pose(5)[5], motion.pose(1)[5]!);
    expect(motion.pose(1).filter(Boolean)).toHaveLength(1);
    expect(motion.bounds.maxX).toBeGreaterThan(motion.bounds.minX);
  });

  test("a track's period is its length in beats, and hit cues join the key beats", () => {
    const frames = [0, 1, 2, 3, 4, 5].map(i => [null, null, null, null, null, [i / 10, 0], null, null, null, null]);
    const motion = compile(
      base(
        { kind: 'track', track: { samplesPerBeat: 2, interpolation: 'linear', frames } },
        { cues: [{ beat: 4, kind: 'hit' }, { beat: 1, kind: 'text', label: 'go' }] }
      )
    );
    expect(motion.periodBeats).toBe(3);
    close(motion.pose(1)[5], v(0.2, 0));
    expect(motion.keyBeats).toEqual([1]);
  });

  test('bounds skip empty slots', () => {
    const bounds = boundsOf(() => [v(1, 2), null, v(-1, 0), null, null, null, null, null, null, null], 1);
    expect(bounds).toEqual({ minX: -1, maxX: 1, minY: 0, maxY: 2 });
  });
});

describe('the lesson schema', () => {
  test('a valid lesson parses; anything else says where it went wrong', () => {
    const lesson = BUILTIN_LESSONS[0]!;
    expect(parseLesson(JSON.parse(JSON.stringify(lesson)))).toEqual({ ok: true, lesson });
    expect(parseLesson({ ...lesson, timing: { ...lesson.timing, bpm: 1000 } })).toEqual({
      ok: false,
      error: expect.stringMatching(/^timing\.bpm: /),
    });
    expect(parseLesson(42)).toEqual({ ok: false, error: expect.stringMatching(/^lesson: /) });
  });
});

describe('the built-in library', () => {
  test('has unique ids and something in every tier', () => {
    expect(new Set(BUILTIN_LESSONS.map(l => l.id)).size).toBe(BUILTIN_LESSONS.length);
    expect(new Set(BUILTIN_LESSONS.map(l => l.tier))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(builtinLesson('tut-box')?.name).toBe('Tut box');
    expect(builtinLesson('nope')).toBeUndefined();
  });

  test.each(BUILTIN_LESSONS.map(l => [l.id, l] as const))('%s loops seamlessly, moves smoothly and fits the stage', (_, lesson) => {
    const motion = compile(lesson);
    const start = motion.pose(0);
    const end = motion.pose(motion.periodBeats - 1e-6);
    lesson.activeSlots.forEach(slot => close(end[slot], start[slot]!, 3));
    // No light jumps: at most a small step between samples 1/60 of a beat apart
    let worst = 0;
    for (let i = 0; i < motion.periodBeats * 60; i++) {
      const a = motion.pose(i / 60);
      const b = motion.pose((i + 1) / 60);
      for (const slot of lesson.activeSlots) worst = Math.max(worst, distance(a[slot]!, b[slot]!));
    }
    expect(worst).toBeLessThan(0.02);
    // Inside the visible stage (16:9: x within ±0.89, y within ±0.5) with room to spare
    expect(motion.bounds.minX).toBeGreaterThan(-0.6);
    expect(motion.bounds.maxX).toBeLessThan(0.6);
    expect(motion.bounds.minY).toBeGreaterThan(-0.4);
    expect(motion.bounds.maxY).toBeLessThan(0.4);
  });

  test('random phases of every lesson put every active light somewhere finite', () => {
    const motions = BUILTIN_LESSONS.map(l => [l, compile(l)] as const);
    fc.assert(
      fc.property(fc.double({ min: -100, max: 100, noNaN: true }), beat => {
        for (const [lesson, motion] of motions) {
          const pose = motion.pose(beat);
          for (const slot of lesson.activeSlots) expect(Number.isFinite(pose[slot]!.x + pose[slot]!.y)).toBe(true);
        }
      })
    );
  });
});
