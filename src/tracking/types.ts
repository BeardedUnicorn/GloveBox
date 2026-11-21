/**
 * What every fingertip tracker produces, whatever it watches: MediaPipe's
 * hand landmarks (Lit mode) or the gloves' LEDs (Dark mode). Both report the
 * ten tips in stage space (src/core/coords.ts), indexed by Slot; the
 * TrackingPipeline smooths them and the scorer compares them to the lesson.
 */

import type { Hand, Pose10, Vec2 } from '../core/types';

export interface TipSample extends Vec2 {
  /** 0–1: how sure the tracker is this is the finger. */
  confidence: number;
  /** Not seen this frame: carried forward from its last motion. */
  predicted?: boolean;
}

/** The ten tips, by Slot; null where a finger wasn't found. */
export type Tips10 = (TipSample | null)[];

export interface TrackerFrame {
  /** The camera frame's time, ms (performance.now() clock). */
  t: number;
  tips: Tips10;
  /** Each hand's size in stage units, for scoring tolerance: wrist to middle knuckle (Lit) or calibrated span (Dark). */
  handScale: Partial<Record<Hand, number>>;
  /** Lit mode: each hand's 21 landmarks in stage space, for the optional skeleton overlay. */
  skeleton?: Partial<Record<Hand, Vec2[]>>;
  /** Dark mode: every bright point found, assigned or not, for the debug overlay. */
  lights?: Vec2[];
}

/** One camera frame to look at. */
export interface CameraFrame {
  video: HTMLVideoElement;
  /** When it was captured, ms (performance.now() clock). */
  t: number;
  width: number;
  height: number;
}

export type TrackerKind = 'landmarks' | 'leds';

export interface FingertipTracker {
  readonly kind: TrackerKind;
  /** Loads models or starts workers; resolves when process() can run. */
  init(): Promise<void>;
  /** The tips in one frame; null when the frame couldn't be read. */
  process(frame: CameraFrame): Promise<TrackerFrame | null>;
  /** Where the lesson expects each light at a time: lets a tracker re-find fingers it lost. */
  setLessonPrior?(prior: ((t: number) => Pose10) | null): void;
  dispose(): void;
}

/**
 * The performer's hands, measured in calibration with both hands open:
 * their center and their span (thumb tip to pinky tip, the mean of both
 * hands), in stage units. Lessons are fit to it (coords.ts fitFor).
 */
export interface HandFit {
  center: Vec2;
  span: number;
}

/** A tracker frame with no tips. */
export const emptyFrame = (t: number): TrackerFrame => ({
  t,
  tips: [null, null, null, null, null, null, null, null, null, null],
  handScale: {},
});
