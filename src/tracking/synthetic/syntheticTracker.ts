/**
 * A pretend performer: tips that follow a pose function, as late, as
 * jittery and as patchy as asked. It drives the "Watch" preview (the move
 * performed for you, no camera needed) and the engine's tests.
 */

import type { Pose10 } from '../../core/types';
import type { CameraFrame, FingertipTracker, TrackerFrame } from '../types';

export interface SyntheticOptions {
  /** Where the performer's fingertips are at time t, stage space. */
  poseAt(t: number): Pose10;
  lagMs?: number;
  /** Jitter, stage units (uniform ±noise on each axis). */
  noise?: number;
  /** The chance (0–1) a tip is missing in a frame. */
  dropout?: number;
  handScale?: number;
  random?: () => number;
}

export class SyntheticTracker implements FingertipTracker {
  readonly kind = 'landmarks' as const;

  constructor(private readonly options: SyntheticOptions) {}

  async init(): Promise<void> {}

  async process(frame: CameraFrame | { t: number }): Promise<TrackerFrame> {
    const { poseAt, lagMs = 0, noise = 0, dropout = 0, handScale = 0.07, random = Math.random } = this.options;
    const jitter = () => (random() * 2 - 1) * noise;
    const tips = poseAt(frame.t - lagMs).map(p =>
      p && random() >= dropout ? { x: p.x + jitter(), y: p.y + jitter(), confidence: 1 } : null
    );
    return { t: frame.t, tips, handScale: { L: handScale, R: handScale } };
  }

  dispose(): void {}
}
