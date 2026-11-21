/**
 * Lit-mode calibration, fed tracker frames one by one:
 *
 * 1. hands: both hands up, fingers spread, held still. Measures how big
 *    the performer's hands look and where they hold them, so lessons fit
 *    them (HandFit).
 * 2. right: only the right hand up. If the tracker calls it the left, this
 *    camera reports hands the other way round: swap from now on.
 */

import { type Hand, slotOf } from '../core/types';
import { centroid, distance } from '../core/vec';
import { LAYOUT_POINTS } from '../lessons/generators';
import type { HandFit, TrackerFrame } from '../tracking/types';

export type LitStep = 'hands' | 'right' | 'done';

export interface LitResult {
  handFit: HandFit;
  swapHandedness: boolean;
}

export interface LitCalibrationState {
  step: LitStep;
  /** 0–1 through the current step's hold. */
  progress: number;
  instruction: string;
  /** What's stopping the hold, if anything. */
  hint: string | null;
  result: LitResult | null;
}

/** Thumb tip to pinky tip of the library's open-hand shape, in span units. */
export const FAN_THUMB_PINKY = distance(LAYOUT_POINTS.fan[0]!, LAYOUT_POINTS.fan[4]!);

export const HOLD_MS = 1500;
export const RIGHT_MS = 1000;
/** How far (stage units) the hands may drift during a hold. */
export const STILLNESS = 0.03;

const INSTRUCTIONS: Record<LitStep, string> = {
  hands: 'Hold both hands up, palms to the camera, fingers spread wide. Keep still.',
  right: 'Now put your left hand down and hold up only your right hand.',
  done: 'All set. Lessons now fit your hands.',
};

const handTips = (frame: TrackerFrame, hand: Hand) =>
  [0, 1, 2, 3, 4].map(finger => frame.tips[slotOf(hand, finger as 0)]);

export class LitCalibration {
  private step: LitStep = 'hands';
  private holdStart: number | null = null;
  private anchor: { x: number; y: number } | null = null;
  private samples: { span: number; center: { x: number; y: number } }[] = [];
  private handFit: HandFit | null = null;
  private result: LitResult | null = null;

  constructor(private readonly swapHandedness: boolean) {}

  private state(progress: number, hint: string | null): LitCalibrationState {
    return { step: this.step, progress, instruction: INSTRUCTIONS[this.step], hint, result: this.result };
  }

  private restart(hint: string | null): LitCalibrationState {
    this.holdStart = null;
    this.anchor = null;
    this.samples = [];
    return this.state(0, hint);
  }

  feed(frame: TrackerFrame): LitCalibrationState {
    if (this.step === 'hands') return this.feedHands(frame);
    if (this.step === 'right') return this.feedRight(frame);
    return this.state(1, null);
  }

  private feedHands(frame: TrackerFrame): LitCalibrationState {
    const tips = frame.tips.filter(tip => tip !== null);
    if (tips.length < 10) return this.restart(`I can see ${tips.length} of your 10 fingertips.`);
    const center = centroid(tips);
    if (this.anchor && distance(center, this.anchor) > STILLNESS) return this.restart('Hold still for a moment.');
    this.anchor ??= center;
    this.holdStart ??= frame.t;
    const spans = (['L', 'R'] as const).map(hand => {
      const [thumb, , , , pinky] = handTips(frame, hand);
      return distance(thumb!, pinky!);
    });
    this.samples.push({ span: (spans[0]! + spans[1]!) / 2 / FAN_THUMB_PINKY, center });
    const progress = Math.min(1, (frame.t - this.holdStart) / HOLD_MS);
    if (progress < 1) return this.state(progress, null);
    const n = this.samples.length;
    this.handFit = {
      span: this.samples.reduce((sum, s) => sum + s.span, 0) / n,
      center: centroid(this.samples.map(s => s.center)),
    };
    this.step = 'right';
    return this.restart(null);
  }

  private feedRight(frame: TrackerFrame): LitCalibrationState {
    const left = handTips(frame, 'L').filter(Boolean).length;
    const right = handTips(frame, 'R').filter(Boolean).length;
    const one = (right === 5 && left === 0) || (left === 5 && right === 0);
    if (!one) return this.restart(left + right > 5 ? 'Only your right hand, please.' : 'Hold up your right hand.');
    this.holdStart ??= frame.t;
    const progress = Math.min(1, (frame.t - this.holdStart) / RIGHT_MS);
    if (progress < 1) return this.state(progress, null);
    // A right hand reported as the left: this camera's labels are the other way round
    const swap = left === 5 ? !this.swapHandedness : this.swapHandedness;
    this.result = { handFit: this.handFit!, swapHandedness: swap };
    this.step = 'done';
    return this.state(1, null);
  }
}
