/**
 * Lit mode: fingertips from MediaPipe's 21 hand landmarks, both hands.
 *
 * MediaPipe says which hand each one is; the label is checked against the
 * picture (two hands both called "Right" are told apart by where they are),
 * and calibration can swap it if this camera reports hands the other way
 * round (`swapHandedness`).
 */

import { aspectOf, rawToStage } from '../../core/coords';
import { FINGERS, type Hand, slotOf, type Vec2 } from '../../core/types';
import { distance } from '../../core/vec';
import { type CameraFrame, emptyFrame, type FingertipTracker, type TrackerFrame } from '../types';
import { createMediaPipeLandmarker, type Delegate, type Landmarker, type LandmarkerFactory } from './landmarker';

/** Landmark indices: the wrist, the middle finger's knuckle and the five fingertips. */
export const WRIST = 0;
export const MIDDLE_KNUCKLE = 9;
export const TIP_LANDMARKS = [4, 8, 12, 16, 20] as const;

export interface DetectedHand {
  hand: Hand;
  score: number;
  /** The 21 landmarks in stage space. */
  points: Vec2[];
}

/**
 * Which hand each detection is. Labels are trusted, swapped if asked; two
 * hands with the same label are told apart by position: the performer's
 * right hand is the one further to +x.
 */
export function identifyHands(
  detections: { label: string; score: number; points: Vec2[] }[],
  swap: boolean
): DetectedHand[] {
  const hands = detections.map(d => {
    const right = d.label === 'Right';
    return { hand: (right !== swap ? 'R' : 'L') as Hand, score: d.score, points: d.points };
  });
  if (hands.length === 2 && hands[0]!.hand === hands[1]!.hand) {
    const [a, b] = hands as [DetectedHand, DetectedHand];
    const aIsRight = a.points[WRIST]!.x > b.points[WRIST]!.x;
    a.hand = aIsRight ? 'R' : 'L';
    b.hand = aIsRight ? 'L' : 'R';
  }
  return hands;
}

export interface HandTrackerOptions {
  createLandmarker?: LandmarkerFactory;
  /** GPU first, falling back to the CPU if it won't start. */
  delegate?: Delegate;
  swapHandedness?: boolean;
}

export class MediaPipeHandTracker implements FingertipTracker {
  readonly kind = 'landmarks' as const;
  private landmarker: Landmarker | null = null;
  private lastTimestamp = -1;
  /** The delegate actually in use, once started. */
  delegate: Delegate | null = null;
  swapHandedness: boolean;

  constructor(private readonly options: HandTrackerOptions = {}) {
    this.swapHandedness = options.swapHandedness ?? false;
  }

  async init(): Promise<void> {
    const create = this.options.createLandmarker ?? createMediaPipeLandmarker;
    const preferred = this.options.delegate ?? 'GPU';
    try {
      this.landmarker = await create(preferred);
      this.delegate = preferred;
    } catch (error) {
      if (preferred === 'CPU') throw error;
      // WebGL can be missing or refuse (some GPUs, some webviews): the CPU always works
      this.landmarker = await create('CPU');
      this.delegate = 'CPU';
    }
  }

  async process(frame: CameraFrame): Promise<TrackerFrame | null> {
    const landmarker = this.landmarker;
    if (!landmarker) return null;
    // MediaPipe requires strictly increasing timestamps
    const timestamp = Math.max(frame.t, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    const result = landmarker.detectForVideo(frame.video, timestamp);
    const aspect = aspectOf(frame);
    const detections = result.landmarks.map((landmarks, i) => {
      const best = result.handedness[i]![0]!;
      return {
        label: best.categoryName,
        score: best.score,
        points: landmarks.map(l => rawToStage(l.x, l.y, aspect)),
      };
    });
    const out = emptyFrame(frame.t);
    out.skeleton = {};
    for (const { hand, score, points } of identifyHands(detections, this.swapHandedness)) {
      out.skeleton[hand] = points;
      out.handScale[hand] = distance(points[WRIST]!, points[MIDDLE_KNUCKLE]!);
      TIP_LANDMARKS.forEach((landmark, finger) => {
        const p = points[landmark]!;
        out.tips[slotOf(hand, FINGERS[finger]!)] = { x: p.x, y: p.y, confidence: score };
      });
    }
    return out;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
