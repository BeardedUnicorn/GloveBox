/**
 * Teaching GloveBox your gloves, for Dark mode. Three steps, each fed one
 * grabbed frame at a time (feedCalibration), each saying what to do, how
 * far along it is, and what's in the way:
 *
 * 1. **room**: lights off, gloves off. The dark's brightest pixels set the
 *    thresholds: a light must be well above them.
 * 2. **open**: gloves on in a solid color, both hands up and open, palms to
 *    the camera, held still (about 2 s at 30 fps). The ten lights' places
 *    give each hand's shape and size, and their colors each finger's hue.
 * 3. **thumbs**: wiggle just your thumbs. The light that moves most on each
 *    hand is its thumb, which fixes which end of the hand is which, so a
 *    hand works palm in or palm out.
 *
 * Everything here is pure: each feed returns a new state.
 */

import { assign } from '../../core/hungarian';
import { FINGERS, HANDS, type Hand, slotOf, type Vec2 } from '../../core/types';
import { centroid, clamp, distance } from '../../core/vec';
import type { HandFit } from '../types';
import { DEFAULT_BLOB_OPTIONS, hueDistance } from './components';
import { type DetectedLight, type GrabbedFrame, LightDetector, type Thresholds } from './detect';
import type { HandModel } from './reacquire';
import { brightness, percentile } from './threshold';

export type CalibrationStep = 'room' | 'open' | 'thumbs' | 'done';

/** What Dark mode knows about your gloves (saved with the settings). */
export interface DarkCalibration {
  version: 1;
  thresholds: Thresholds;
  /** The grabbed frame's size these were measured in (areas scale with it). */
  frame: { width: number; height: number };
  /** Lit pixels a fingertip's light covers, in that frame. */
  blobArea: { min: number; max: number };
  hands: Record<Hand, HandModel>;
  /** By slot: the finger's color, or null where it can't be told from its hand's other fingers. */
  hues: (number | null)[];
  fit: HandFit;
}

export interface CalibrationOptions {
  /** Dark frames to measure. */
  roomFrames: number;
  /** A room brighter than this (its 99.9th percentile) can't be calibrated. */
  maxBackground: number;
  /** How far above the dark a light's brightest pixels must be. */
  margin: number;
  minHigh: number;
  minLow: number;
  /** Still frames with all ten lights. */
  openFrames: number;
  /** Stage units a light may drift and still count as still. */
  stableDist: number;
  /** Stage units between the hands. */
  minHandGap: number;
  /** Frames of thumb wiggling. */
  thumbFrames: number;
  /** A thumb must move this many times more than its hand's next-busiest light… */
  thumbRatio: number;
  /** …and at least this far in all (stage units). */
  minThumbMotion: number;
  /** A light moving farther than this between frames means the hands moved. */
  maxStep: number;
  /** Two fingers of a hand closer than this in hue can't be told apart by color. */
  hueDistinct: number;
}

export const DEFAULT_CALIBRATION_OPTIONS: CalibrationOptions = {
  roomFrames: 30,
  maxBackground: 200,
  margin: 60,
  minHigh: 150,
  minLow: 90,
  openFrames: 60,
  stableDist: 0.02,
  minHandGap: 0.03,
  thumbFrames: 45,
  thumbRatio: 2,
  minThumbMotion: 0.04,
  maxStep: 0.08,
  hueDistinct: 0.06,
};

export const INSTRUCTIONS: Record<CalibrationStep, string> = {
  room: 'Turn the room lights off and your gloves off, then hold still while GloveBox measures the dark.',
  open: 'Turn your gloves on in a solid color. Hold both hands up, fingers spread, palms toward the camera.',
  thumbs: 'Keep your hands where they are and wiggle just your thumbs.',
  done: 'Calibrated: GloveBox knows your gloves.',
};

interface HueSum {
  cos: number;
  sin: number;
  count: number;
}

interface OpenProgress {
  /** The first still frame's lights, by x: every later frame is matched to them. */
  reference: Vec2[];
  sums: Vec2[];
  hues: HueSum[];
  minArea: number;
  maxArea: number;
  frames: number;
  size: { width: number; height: number };
}

interface OpenResult {
  /** The ten lights' mean places, by x. */
  positions: Vec2[];
  hues: (number | null)[];
  minArea: number;
  maxArea: number;
  size: { width: number; height: number };
}

interface ThumbProgress {
  last: Vec2[];
  motion: number[];
  frames: number;
}

export interface CalibrationState {
  readonly step: CalibrationStep;
  readonly options: CalibrationOptions;
  /** 0–1 through the current step. */
  readonly progress: number;
  readonly instruction: string;
  /** Why the step isn't moving on, or null. */
  readonly problem: string | null;
  /** The lights in the latest frame (stage space), to draw. */
  readonly lights: Vec2[];
  readonly room: readonly number[];
  readonly thresholds: Thresholds | null;
  readonly open: OpenProgress | null;
  readonly opened: OpenResult | null;
  readonly thumbs: ThumbProgress | null;
  readonly result: DarkCalibration | null;
}

export function startCalibration(options: Partial<CalibrationOptions> = {}): CalibrationState {
  return {
    step: 'room',
    options: { ...DEFAULT_CALIBRATION_OPTIONS, ...options },
    progress: 0,
    instruction: INSTRUCTIONS.room,
    problem: null,
    lights: [],
    room: [],
    thresholds: null,
    open: null,
    opened: null,
    thumbs: null,
    result: null,
  };
}

/** Begins `step` again (and everything after it); a step whose earlier steps aren't done begins at the first missing one. */
export function restartCalibration(state: CalibrationState, step: Exclude<CalibrationStep, 'done'>): CalibrationState {
  if (step === 'room' || state.thresholds === null) return startCalibration(state.options);
  if (step === 'open' || state.opened === null) {
    return { ...enter(state, 'open'), open: null, opened: null, thumbs: null, result: null };
  }
  return { ...enter(state, 'thumbs'), thumbs: null, result: null };
}

/** The calibration, once done. */
export const calibrationResult = (state: CalibrationState): DarkCalibration | null => state.result;

function enter(state: CalibrationState, step: CalibrationStep): CalibrationState {
  return { ...state, step, progress: step === 'done' ? 1 : 0, instruction: INSTRUCTIONS[step], problem: null };
}

const at = (light: Vec2): Vec2 => ({ x: light.x, y: light.y });

/** Each of `points` matched to one of `reference` (same count), closest overall: by reference index, the point there. */
function matchTo<T extends Vec2>(reference: readonly Vec2[], points: readonly T[]): T[] {
  const byRef = assign(reference.map(r => points.map(p => distance(r, p) ** 2)));
  return byRef.map(index => points[index]!);
}

/** Feeds one frame to the step under way; returns the new state. A finished calibration ignores frames. */
export function feedCalibration(state: CalibrationState, frame: GrabbedFrame): CalibrationState {
  switch (state.step) {
    case 'room':
      return feedRoom(state, frame);
    case 'open':
      return feedOpen(state, frame);
    case 'thumbs':
      return feedThumbs(state, frame);
    default:
      return state;
  }
}

function feedRoom(state: CalibrationState, frame: GrabbedFrame): CalibrationState {
  const o = state.options;
  const level = percentile(brightness(frame.data), 0.999);
  if (level > o.maxBackground) {
    return {
      ...state,
      problem: `It's too bright to calibrate (${level} of 255). Turn off the lights, any screens facing the camera and your gloves.`,
    };
  }
  const room = [...state.room, level];
  if (room.length < o.roomFrames) return { ...state, room, progress: room.length / o.roomFrames, problem: null };
  const dark = Math.max(...room);
  const high = clamp(dark + o.margin, o.minHigh, 245);
  const low = clamp(Math.round(dark + o.margin / 2), o.minLow, high - 10);
  return { ...enter(state, 'open'), room, thresholds: { low, high }, open: null };
}

function detect(state: CalibrationState, frame: GrabbedFrame): DetectedLight[] {
  return new LightDetector(state.thresholds!, DEFAULT_BLOB_OPTIONS).detect(frame);
}

function feedOpen(state: CalibrationState, frame: GrabbedFrame): CalibrationState {
  const o = state.options;
  const lights = detect(state, frame);
  const shown = lights.map(at);
  const restart = (problem: string): CalibrationState => ({
    ...state,
    lights: shown,
    open: null,
    progress: 0,
    problem,
  });
  if (lights.length < 10) return restart(`Found ${lights.length} of 10 lights: show every fingertip.`);
  if (lights.length > 10) return restart(`Found ${lights.length} lights, more than 10: hide any other lights.`);
  const byX = [...lights].sort((a, b) => a.x - b.x);
  if (byX[5]!.x - byX[4]!.x < o.minHandGap) return restart('Hold your hands apart.');

  const size = { width: frame.width, height: frame.height };
  const fresh = (problem: string | null): CalibrationState => ({
    ...state,
    lights: shown,
    problem,
    progress: 1 / o.openFrames,
    open: {
      reference: byX.map(at),
      sums: byX.map(at),
      hues: byX.map(light => addHue({ cos: 0, sin: 0, count: 0 }, light.hue)),
      minArea: Math.min(...byX.map(light => light.area)),
      maxArea: Math.max(...byX.map(light => light.area)),
      frames: 1,
      size,
    },
  });
  const open = state.open;
  if (open === null) return fresh(null);

  // Matched to the first still frame: drifting too far starts the hold again
  const matched = matchTo(open.reference, lights);
  if (matched.some((light, i) => distance(light, open.reference[i]!) > o.stableDist)) {
    return fresh('Hold your hands still.');
  }
  const next: OpenProgress = {
    ...open,
    sums: open.sums.map((sum, i) => ({ x: sum.x + matched[i]!.x, y: sum.y + matched[i]!.y })),
    hues: open.hues.map((sum, i) => addHue(sum, matched[i]!.hue)),
    minArea: Math.min(open.minArea, ...matched.map(light => light.area)),
    maxArea: Math.max(open.maxArea, ...matched.map(light => light.area)),
    frames: open.frames + 1,
  };
  if (next.frames < o.openFrames) {
    return { ...state, lights: shown, problem: null, open: next, progress: next.frames / o.openFrames };
  }
  const opened: OpenResult = {
    positions: next.sums.map(sum => ({ x: sum.x / next.frames, y: sum.y / next.frames })),
    hues: next.hues.map(sum => meanHue(sum, next.frames)),
    minArea: next.minArea,
    maxArea: next.maxArea,
    size: next.size,
  };
  return { ...enter(state, 'thumbs'), lights: shown, open: next, opened, thumbs: null };
}

function addHue(sum: HueSum, hue: number | null): HueSum {
  if (hue === null) return sum;
  return {
    cos: sum.cos + Math.cos(2 * Math.PI * hue),
    sin: sum.sin + Math.sin(2 * Math.PI * hue),
    count: sum.count + 1,
  };
}

/** The mean of a light's hues, if it had one in at least half the frames. */
function meanHue(sum: HueSum, frames: number): number | null {
  if (sum.count < frames / 2) return null;
  return (Math.atan2(sum.sin, sum.cos) / (2 * Math.PI) + 1) % 1;
}

function feedThumbs(state: CalibrationState, frame: GrabbedFrame): CalibrationState {
  const o = state.options;
  const opened = state.opened!;
  const lights = detect(state, frame);
  const shown = lights.map(at);
  if (lights.length !== 10) return { ...state, lights: shown, problem: 'Keep all ten lights in view.' };
  const last = state.thumbs?.last ?? opened.positions;
  const matched = matchTo(last, shown);
  const steps = matched.map((p, i) => distance(p, last[i]!));
  if (steps.some(step => step > o.maxStep)) {
    return { ...restartCalibration(state, 'open'), lights: shown, problem: 'Your hands moved: hold them up again.' };
  }
  const thumbs: ThumbProgress = {
    last: matched,
    motion: (state.thumbs?.motion ?? opened.positions.map(() => 0)).map((m, i) => m + steps[i]!),
    frames: (state.thumbs?.frames ?? 0) + 1,
  };
  if (thumbs.frames < o.thumbFrames) {
    return { ...state, lights: shown, problem: null, thumbs, progress: thumbs.frames / o.thumbFrames };
  }

  // Each hand's five lights, by x: the left hand is the five on the left of the stage
  const orders: Partial<Record<Hand, number[]>> = {};
  for (const hand of HANDS) {
    const byX = hand === 'L' ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
    const motion = byX.map(i => thumbs.motion[i]!);
    const thumbRank = motion.indexOf(Math.max(...motion));
    const others = motion.filter((_, rank) => rank !== thumbRank);
    const most = motion[thumbRank]!;
    const again = (problem: string): CalibrationState => ({
      ...state,
      lights: shown,
      problem,
      progress: 0,
      thumbs: { last: matched, motion: matched.map(() => 0), frames: 0 },
    });
    if (most < o.minThumbMotion || most < o.thumbRatio * Math.max(...others)) {
      return again('Wiggle just your thumbs, a little more, keeping your other fingers still.');
    }
    // The thumb is at one end of the hand: it decides which way the fingers run
    if (thumbRank === 0) orders[hand] = byX;
    else if (thumbRank === 4) orders[hand] = [...byX].reverse();
    else return again("Couldn't find a thumb at the edge of your hand: spread your fingers wide.");
  }
  return {
    ...enter(state, 'done'),
    lights: shown,
    thumbs,
    result: buildCalibration(state, opened, orders as Record<Hand, number[]>),
  };
}

function buildCalibration(
  state: CalibrationState,
  opened: OpenResult,
  orders: Record<Hand, number[]>
): DarkCalibration {
  const o = state.options;
  const hues: (number | null)[] = new Array(10).fill(null);
  const hands = {} as Record<Hand, HandModel>;
  for (const hand of HANDS) {
    const order = orders[hand];
    const tips = order.map(i => opened.positions[i]!);
    const center = centroid(tips);
    const span = distance(tips[0]!, tips[4]!);
    hands[hand] = { template: tips.map(p => ({ x: (p.x - center.x) / span, y: (p.y - center.y) / span })), span };
    const handHues = order.map(i => opened.hues[i]!);
    for (const f of FINGERS) {
      const hue = handHues[f]!;
      const distinct =
        hue !== null &&
        handHues.every((other, g) => g === f || other === null || hueDistance(hue, other) > o.hueDistinct);
      hues[slotOf(hand, f)] = distinct ? hue : null;
    }
  }
  return {
    version: 1,
    thresholds: state.thresholds!,
    frame: opened.size,
    blobArea: { min: Math.max(1, Math.floor(opened.minArea * 0.25)), max: Math.ceil(opened.maxArea * 4) },
    hands,
    hues,
    fit: { center: centroid(opened.positions), span: (hands.L.span + hands.R.span) / 2 },
  };
}
