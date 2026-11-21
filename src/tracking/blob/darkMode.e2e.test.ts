/**
 * Dark mode end to end, on rendered glove frames: calibrate through the
 * three steps, then track moving hands (finger rolls, turning hands, a
 * strobe mode, dropped lights, hands that cross, the lights going out) and
 * check the tips found against the truth.
 */

import { describe, expect, test } from 'vitest';
import { emptyPose, FINGERS, type Hand, type Pose10, slotOf } from '../../core/types';
import { distance } from '../../core/vec';
import { type HandPlacement, LEFT_OPEN, RIGHT_OPEN, twoHands } from '../../test/syntheticHands';
import { type LedRenderOptions, renderLeds, strobeLit } from '../synthetic/ledFrameRenderer';
import type { CameraFrame, TrackerFrame } from '../types';
import { BlobTracker } from './blobTracker';
import {
  type CalibrationState,
  calibrationResult,
  type DarkCalibration,
  feedCalibration,
  startCalibration,
} from './calibration';

/** Hands close to the camera, as when gloving for a receiver. */
const SPAN = 0.3;
const OPEN_L: HandPlacement = { center: { x: -0.42, y: 0 }, span: SPAN };
const OPEN_R: HandPlacement = { center: { x: 0.42, y: 0 }, span: SPAN };
const FRAME_MS = 1000 / 30;
/** Stage units: a tip this close to the truth is right (about 3.6 px of a 180 px frame). */
const TOLERANCE = 0.02;

function calibrate(render: Partial<LedRenderOptions> = {}): CalibrationState {
  let state = startCalibration();
  let frame = 0;
  const feed = (pose: Pose10) => {
    state = feedCalibration(state, renderLeds(pose, { ...render, frameIndex: frame++ }));
  };
  while (state.step === 'room' && frame < 200) feed(emptyPose());
  while (state.step === 'open' && frame < 400) feed(twoHands(OPEN_L, OPEN_R));
  let wiggle = 0;
  while (state.step === 'thumbs' && frame < 600) {
    const curl = [0.35 * (0.5 + 0.5 * Math.sin(wiggle++ * 0.7)), 0, 0, 0, 0];
    feed(twoHands({ ...OPEN_L, curl }, { ...OPEN_R, curl }));
  }
  return state;
}

describe('calibrating from rendered frames', { timeout: 60_000 }, () => {
  test('learns the thresholds, each hand, which end is the thumb, the colors and the fit', () => {
    const state = calibrate({ noise: 10 });
    expect(state.step).toBe('done');
    const result = calibrationResult(state)!;
    expect(result.thresholds.high).toBeGreaterThan(result.thresholds.low);
    expect(result.hands.R.span).toBeCloseTo(SPAN * Math.hypot(0.99, 0.3), 2);
    expect(result.fit.span).toBeCloseTo(result.hands.L.span, 5);
    expect(result.fit.center.x).toBeCloseTo(0, 2);
    // The thumbs were found: each template runs thumb to pinky like the truth
    for (const [hand, truth] of [
      ['L', LEFT_OPEN],
      ['R', RIGHT_OPEN],
    ] as const) {
      result.hands[hand].template.forEach((tip, f) => {
        const expected = truth[f]!;
        const scale = SPAN / result.hands[hand].span;
        expect(tip.x / scale).toBeCloseTo(expected.x - truth.reduce((s, p) => s + p.x, 0) / 5, 1);
      });
    }
    // Every finger's own color, which the renderer gave it
    expect(result.hues.every(hue => hue !== null)).toBe(true);
  });
});

interface Run {
  /** Visible lights found within TOLERANCE of the truth, as a share. */
  accuracy: number;
  visible: number;
  results: TrackerFrame[];
  /** Mean ms per frame, past the first few. */
  meanMs: number;
}

async function track(
  calibration: DarkCalibration,
  poses: (i: number) => Pose10,
  frames: number,
  render: Partial<LedRenderOptions>,
  { poolFrames = 1, prior = false, from = 3 } = {}
): Promise<Run> {
  let current: ReturnType<typeof renderLeds> | null = null;
  const tracker = new BlobTracker({ calibration, grab: () => current, pipeline: { poolFrames } });
  await tracker.init();
  if (prior) tracker.setLessonPrior(t => poses(Math.round(t / FRAME_MS)));
  let visible = 0;
  let correct = 0;
  let ms = 0;
  const results: TrackerFrame[] = [];
  for (let i = 0; i < frames; i++) {
    const truth = poses(i);
    current = renderLeds(truth, { ...render, frameIndex: i });
    const frame: CameraFrame = { video: {} as HTMLVideoElement, t: i * FRAME_MS, width: 1280, height: 720 };
    const started = performance.now();
    const result = (await tracker.process(frame))!;
    if (i >= 10) ms += performance.now() - started;
    results.push(result);
    if (i < from || !strobeLit(render.strobe ?? null, i)) continue;
    truth.forEach((p, slot) => {
      if (p === null) return;
      visible++;
      const tip = result.tips[slot];
      if (tip && distance(tip, p) < TOLERANCE) correct++;
    });
  }
  tracker.dispose();
  return { accuracy: correct / visible, visible, results, meanMs: ms / (frames - 10) };
}

describe('tracking rendered gloves', { timeout: 60_000 }, () => {
  const calibration = calibrate().result!;

  /** Hands circling in opposite phase, turning, each finger rolling in turn: one loop every `period` frames. */
  const circling =
    (period: number, turn: number) =>
    (i: number): Pose10 => {
      const a = (i / period) * 2 * Math.PI;
      const roll = (hand: Hand) =>
        FINGERS.map(f => 0.3 * Math.max(0, Math.sin(i * 0.35 - f * 0.9 + (hand === 'L' ? Math.PI : 0))));
      return twoHands(
        {
          center: { x: -0.42 + 0.1 * Math.cos(a), y: 0.1 * Math.sin(a) },
          span: SPAN,
          curl: roll('L'),
          rotation: turn * Math.sin(a),
        },
        {
          center: { x: 0.42 - 0.1 * Math.cos(a), y: 0.1 * Math.sin(a) },
          span: SPAN,
          curl: roll('R'),
          rotation: -turn * Math.sin(a),
        }
      );
    };

  test('≥ 95% of the lights in the right place: fast circles, turning hands, rolling fingers, a noisy room', async () => {
    const run = await track(calibration, circling(30, 0.6), 180, { noise: 20, ambient: 14 });
    console.info(`circling: ${(100 * run.accuracy).toFixed(1)}% of ${run.visible}, ${run.meanMs.toFixed(2)} ms/frame`);
    expect(run.accuracy).toBeGreaterThanOrEqual(0.95);
    // ≈0.6 ms on an Apple-silicon Mac; a CI runner under coverage instrumentation is ~10× slower.
    // The bound catches an order-of-magnitude regression without failing on a slow machine.
    expect(run.meanMs).toBeLessThan(20);
  });

  test('≥ 95% through a strobe mode, pooling two frames', async () => {
    const run = await track(
      calibration,
      circling(45, 0.4),
      180,
      { noise: 8, strobe: { on: 3, off: 1 } },
      { poolFrames: 2 }
    );
    console.info(`strobe: ${(100 * run.accuracy).toFixed(1)}% of ${run.visible}`);
    expect(run.accuracy).toBeGreaterThanOrEqual(0.95);
  });

  test('≥ 95% with one light in ten hidden at random each frame', async () => {
    const run = await track(calibration, circling(45, 0.4), 180, { noise: 8, dropout: 0.1 });
    console.info(`dropout: ${(100 * run.accuracy).toFixed(1)}% of ${run.visible}`);
    expect(run.accuracy).toBeGreaterThanOrEqual(0.95);
  });

  test('≥ 95% for one-color gloves with one light in five hidden: fingers are kept apart by their hand’s shape', async () => {
    const white: Partial<LedRenderOptions> = { colors: new Array(10).fill([230, 230, 255]) };
    const plain = calibrate(white).result!;
    expect(plain.hues.every(hue => hue === null)).toBe(true);
    for (const seed of [1, 2, 3]) {
      const run = await track(plain, circling(45, 0.4), 180, { ...white, noise: 8, dropout: 0.2, seed });
      console.info(`white, 20% dropout, seed ${seed}: ${(100 * run.accuracy).toFixed(1)}%`);
      expect(run.accuracy).toBeGreaterThanOrEqual(0.95);
    }
  });

  /** The hands slide across each other, stay crossed, then come back: 0–29 apart, 30–69 crossing, 70–119 crossed, 120–159 back, 160– apart. */
  const crossing = (i: number): Pose10 => {
    const phase = i < 30 ? 0 : i < 70 ? (i - 30) / 40 : i < 120 ? 1 : i < 160 ? 1 - (i - 120) / 40 : 0;
    const x = 0.42 - 0.84 * phase;
    return twoHands({ center: { x: -x, y: 0.02 }, span: SPAN }, { center: { x, y: -0.02 }, span: SPAN });
  };

  test('hands that cross are right again within 10 frames of separating, crossed and uncrossed, with the lesson', async () => {
    const run = await track(calibration, crossing, 200, { noise: 8 }, { prior: true });
    for (const [from, to] of [
      [80, 120],
      [170, 200],
    ] as const) {
      const part = await track(calibration, crossing, to, { noise: 8 }, { prior: true, from });
      console.info(`crossing ${from}–${to}: ${(100 * part.accuracy).toFixed(1)}%`);
      expect(part.accuracy).toBeGreaterThanOrEqual(0.95);
    }
    expect(run.accuracy).toBeGreaterThanOrEqual(0.95);
  });

  /** The lights go out for 20 frames (longer than a slot is kept), and come back with the hands moved, turned and nearer. */
  const blackout = (i: number): Pose10 => {
    if (i >= 40 && i < 60) return emptyPose();
    const moved = i >= 60;
    return twoHands(
      { center: { x: moved ? -0.3 : -0.42, y: moved ? 0.12 : 0 }, span: SPAN, rotation: moved ? 0.5 : 0 },
      {
        center: { x: moved ? 0.55 : 0.42, y: moved ? -0.1 : 0 },
        span: SPAN * (moved ? 1.2 : 1),
        rotation: moved ? -0.4 : 0,
      }
    );
  };

  test('after the lights go out, each finger is found again by its hand’s shape (no lesson) within 3 frames', async () => {
    const run = await track(calibration, blackout, 100, { noise: 8 }, { from: 63 });
    console.info(`blackout: ${(100 * run.accuracy).toFixed(1)}%`);
    expect(run.accuracy).toBe(1);
    // While dark, nothing is reported once the slots are lost
    expect(run.results[59]!.tips.every(tip => tip === null)).toBe(true);
  });

  test('a light is never put on the wrong hand while the hands are apart, with no lesson', async () => {
    const { results } = await track(calibration, circling(45, 0.4), 90, { noise: 8 });
    for (const frame of results.slice(3)) {
      for (const f of FINGERS) {
        const l = frame.tips[slotOf('L', f)];
        const r = frame.tips[slotOf('R', f)];
        if (l) expect(l.x).toBeLessThan(0);
        if (r) expect(r.x).toBeGreaterThan(0);
      }
    }
  });
});
