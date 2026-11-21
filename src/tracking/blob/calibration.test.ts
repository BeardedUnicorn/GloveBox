import { describe, expect, test } from 'vitest';
import { emptyPose, type Pose10 } from '../../core/types';
import { OPEN_LEFT, OPEN_RIGHT, TEST_SPAN } from '../../test/darkCalibration';
import { type HandPlacement, twoHands } from '../../test/syntheticHands';
import { DEFAULT_LED_COLORS, type LedRenderOptions, type RGB, renderLeds } from '../synthetic/ledFrameRenderer';
import {
  type CalibrationOptions,
  type CalibrationState,
  calibrationResult,
  feedCalibration,
  INSTRUCTIONS,
  restartCalibration,
  startCalibration,
} from './calibration';

const QUICK: Partial<CalibrationOptions> = { roomFrames: 3, openFrames: 4, thumbFrames: 6 };
const open = twoHands(OPEN_LEFT, OPEN_RIGHT);
let frameIndex = 0;
const frame = (pose: Pose10, render: Partial<LedRenderOptions> = {}) =>
  renderLeds(pose, { frameIndex: frameIndex++, ...render });
const feed = (state: CalibrationState, pose: Pose10, times = 1, render: Partial<LedRenderOptions> = {}) => {
  let s = state;
  for (let i = 0; i < times; i++) s = feedCalibration(s, frame(pose, render));
  return s;
};
const wiggle = (i: number, left = true, right = true): Pose10 => {
  const curl = [0.35 * (0.5 + 0.5 * Math.sin(i * 0.7)), 0, 0, 0, 0];
  return twoHands(left ? { ...OPEN_LEFT, curl } : OPEN_LEFT, right ? { ...OPEN_RIGHT, curl } : OPEN_RIGHT);
};
const wiggleThumbs = (state: CalibrationState, frames: number, make: (i: number) => Pose10 = wiggle) => {
  let s = state;
  for (let i = 0; i < frames; i++) s = feedCalibration(s, frame(make(i)));
  return s;
};

const roomDone = () => feed(startCalibration(QUICK), emptyPose(), 3);
const openDone = () => feed(roomDone(), open, 4);

describe('the room step', () => {
  test('starts in the room step, saying what to do', () => {
    const state = startCalibration();
    expect(state).toMatchObject({ step: 'room', progress: 0, instruction: INSTRUCTIONS.room, problem: null });
    expect(state.options.roomFrames).toBe(30);
  });

  test('measures the dark, then sets thresholds well above it', () => {
    const one = feed(startCalibration(QUICK), emptyPose());
    expect(one.progress).toBeCloseTo(1 / 3);
    const done = feed(one, emptyPose(), 2);
    expect(done).toMatchObject({ step: 'open', progress: 0, instruction: INSTRUCTIONS.open });
    // A dark room: the floors decide
    expect(done.thresholds).toEqual({ low: 90, high: 150 });
  });

  test('a dim room raises the thresholds above it', () => {
    const done = feed(startCalibration(QUICK), emptyPose(), 3, { ambient: 120, noise: 5 });
    expect(done.thresholds!.high).toBe(125 + 60);
    expect(done.thresholds!.low).toBe(125 + 30);
  });

  test('too bright a room (or gloves left on) is a problem, and not counted', () => {
    const bright = feed(startCalibration(QUICK), emptyPose(), 1, { ambient: 230, noise: 0 });
    expect(bright.problem).toMatch(/too bright to calibrate \(230 of 255\)/);
    expect(bright.room).toEqual([]);
  });
});

describe('the open-hands step', () => {
  test('needs all ten lights, no more, and the hands apart', () => {
    const missing = [...open];
    missing[2] = null;
    expect(feed(roomDone(), missing).problem).toBe('Found 9 of 10 lights: show every fingertip.');
    const extra = [...open, { x: 0, y: 0.4 }];
    const eleven = { colors: [...DEFAULT_LED_COLORS, [255, 255, 255] as RGB] };
    expect(feed(roomDone(), extra, 1, eleven).problem).toBe('Found 11 lights, more than 10: hide any other lights.');
    const together = twoHands(
      { ...OPEN_LEFT, center: { x: -0.16, y: 0 } },
      { ...OPEN_RIGHT, center: { x: 0.16, y: 0.3 } }
    );
    expect(feed(roomDone(), together).problem).toBe('Hold your hands apart.');
  });

  test('held still, it moves on to the thumbs', () => {
    const halfway = feed(roomDone(), open, 2);
    expect(halfway).toMatchObject({ step: 'open', progress: 0.5, problem: null });
    expect(halfway.lights).toHaveLength(10);
    const done = feed(halfway, open, 2);
    expect(done).toMatchObject({ step: 'thumbs', progress: 0, instruction: INSTRUCTIONS.thumbs });
    expect(done.opened!.positions).toHaveLength(10);
  });

  test('moving starts the hold again', () => {
    const moved = twoHands({ ...OPEN_LEFT, center: { x: -0.36, y: 0 } }, OPEN_RIGHT);
    const state = feed(feed(roomDone(), open, 2), moved);
    expect(state).toMatchObject({ step: 'open', problem: 'Hold your hands still.', progress: 1 / 4 });
  });
});

describe('the thumbs step', () => {
  test('finds each thumb, then builds the calibration', () => {
    const state = wiggleThumbs(openDone(), 6);
    expect(state).toMatchObject({ step: 'done', progress: 1, instruction: INSTRUCTIONS.done, problem: null });
    const result = calibrationResult(state)!;
    expect(result.version).toBe(1);
    expect(result.frame).toEqual({ width: 320, height: 180 });
    expect(result.blobArea.min).toBeGreaterThanOrEqual(1);
    expect(result.blobArea.max).toBeGreaterThan(result.blobArea.min);
    // Thumbs at the inner ends, palms to the camera
    expect(result.hands.R.template[0]!.x).toBeLessThan(result.hands.R.template[4]!.x);
    expect(result.hands.L.template[0]!.x).toBeGreaterThan(result.hands.L.template[4]!.x);
    expect(result.hands.R.span).toBeCloseTo(TEST_SPAN * Math.hypot(0.99, 0.3), 2);
    // Feeding a finished calibration changes nothing
    expect(feedCalibration(state, frame(open))).toBe(state);
  });

  test('backs of the hands to the camera: the thumbs are at the outer ends', () => {
    const flipLeft: HandPlacement = { ...OPEN_LEFT, rotation: 0 };
    const backs = (i: number) => {
      const curl = [0.35 * (0.5 + 0.5 * Math.sin(i * 0.7)), 0, 0, 0, 0];
      const pose = twoHands({ ...flipLeft, curl }, { ...OPEN_RIGHT, curl });
      // Mirror each hand about its own center: the thumb moves to the outer side
      return pose.map((p, slot) => {
        const center = slot < 5 ? OPEN_LEFT.center : OPEN_RIGHT.center;
        return p && { x: 2 * center.x - p.x, y: p.y };
      });
    };
    let state = feed(roomDone(), backs(-Math.PI / 1.4), 4);
    expect(state.step).toBe('thumbs');
    state = wiggleThumbs(state, 6, backs);
    const result = calibrationResult(state)!;
    expect(result.hands.R.template[0]!.x).toBeGreaterThan(result.hands.R.template[4]!.x);
  });

  test('needs all ten lights in view', () => {
    const missing = [...open];
    missing[0] = null;
    expect(feed(openDone(), missing).problem).toBe('Keep all ten lights in view.');
  });

  test('a hand that moves goes back to the open step', () => {
    const moved = twoHands({ ...OPEN_LEFT, center: { x: -0.2, y: 0.1 } }, OPEN_RIGHT);
    const state = feed(openDone(), moved);
    expect(state).toMatchObject({ step: 'open', problem: 'Your hands moved: hold them up again.' });
  });

  test("thumbs that don't move, or other fingers moving as much, mean wiggle again", () => {
    const still = wiggleThumbs(openDone(), 6, () => open);
    expect(still).toMatchObject({ step: 'thumbs', progress: 0 });
    expect(still.problem).toMatch(/Wiggle just your thumbs/);
    const everything = wiggleThumbs(openDone(), 6, i => {
      const curl = new Array(5).fill(0.3 * (0.5 + 0.5 * Math.sin(i * 0.7)));
      return twoHands({ ...OPEN_LEFT, curl }, { ...OPEN_RIGHT, curl });
    });
    expect(everything.problem).toMatch(/Wiggle just your thumbs/);
  });

  test('a busiest light in the middle of a hand is not a thumb', () => {
    const middle = wiggleThumbs(openDone(), 6, i => {
      const curl = [0, 0, 0.35 * (0.5 + 0.5 * Math.sin(i * 0.7)), 0, 0];
      return twoHands({ ...OPEN_LEFT, curl }, { ...OPEN_RIGHT, curl });
    });
    expect(middle.problem).toMatch(/Couldn't find a thumb/);
  });
});

describe('colors', () => {
  test('fingers of one hand sharing a color have no hue; gray lights have none', () => {
    const red: RGB = [255, 60, 80];
    const colors: RGB[] = [red, red, [255, 184, 79], [109, 255, 158], [230, 230, 230], red, red, red, red, red];
    const render = { colors };
    let state = feed(startCalibration(QUICK), emptyPose(), 3, render);
    state = feed(state, open, 4, render);
    for (let i = 0; i < 6; i++)
      state = feedCalibration(state, renderLeds(wiggle(i), { ...render, frameIndex: frameIndex++ }));
    const { hues } = calibrationResult(state)!;
    expect(hues.slice(0, 5).map(hue => hue !== null)).toEqual([false, false, true, true, false]);
    expect(hues.slice(5).every(hue => hue === null)).toBe(true);
  });

  test('a light colored in fewer than half the frames has no hue', () => {
    let state = feed(startCalibration(QUICK), emptyPose(), 3);
    const white: RGB[] = new Array(10).fill([240, 240, 240]);
    state = feed(state, open, 1);
    state = feed(state, open, 3, { colors: white });
    expect(state.opened!.hues.every(hue => hue === null)).toBe(true);
  });
});

describe('starting a step again', () => {
  test('each step, and the first missing one when earlier steps are not done', () => {
    const done = wiggleThumbs(openDone(), 6);
    expect(restartCalibration(done, 'thumbs')).toMatchObject({ step: 'thumbs', thumbs: null, result: null });
    expect(restartCalibration(done, 'open')).toMatchObject({ step: 'open', opened: null, result: null });
    expect(restartCalibration(done, 'room')).toMatchObject({ step: 'room', thresholds: null });
    // Thumbs before the open step is done start at the open step; open before the room, at the room
    expect(restartCalibration(roomDone(), 'thumbs').step).toBe('open');
    expect(restartCalibration(startCalibration(QUICK), 'open').step).toBe('room');
  });
});
