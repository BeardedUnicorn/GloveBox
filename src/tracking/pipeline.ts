/**
 * What every tracker's frames go through before they're scored or drawn:
 * One Euro smoothing per fingertip, and a short gap-hold. A finger lost for
 * a moment (motion blur, a strobing LED, crossing the other hand) carries
 * on along its last motion with fading confidence; after `graceMs` it's
 * gone until it's seen again.
 */

import { DEFAULT_ONE_EURO, OneEuroFilter2D, type OneEuroParams } from '../core/oneEuro';
import { HANDS, type Hand, type Vec2 } from '../core/types';
import type { TipSample, TrackerFrame } from './types';

interface SlotState {
  filter: OneEuroFilter2D;
  last: { t: number; p: Vec2; confidence: number } | null;
  velocity: Vec2;
}

export interface PipelineOptions {
  oneEuro?: OneEuroParams;
  graceMs?: number;
}

export class TrackingPipeline {
  private readonly slots: SlotState[];
  private readonly graceMs: number;
  private readonly scale: Partial<Record<Hand, number>> = {};

  constructor(private readonly options: PipelineOptions = {}) {
    this.graceMs = options.graceMs ?? 200;
    this.slots = Array.from({ length: 10 }, () => this.freshSlot());
  }

  private freshSlot(): SlotState {
    return {
      filter: new OneEuroFilter2D(this.options.oneEuro ?? DEFAULT_ONE_EURO),
      last: null,
      velocity: { x: 0, y: 0 },
    };
  }

  push(frame: TrackerFrame): TrackerFrame {
    const tips = frame.tips.map((tip, slot): TipSample | null => {
      const state = this.slots[slot]!;
      if (tip && !tip.predicted) {
        const p = state.filter.filter(tip, frame.t);
        if (state.last && frame.t > state.last.t) {
          const dt = frame.t - state.last.t;
          const v = { x: (p.x - state.last.p.x) / dt, y: (p.y - state.last.p.y) / dt };
          state.velocity = { x: (state.velocity.x + v.x) / 2, y: (state.velocity.y + v.y) / 2 };
        }
        state.last = { t: frame.t, p, confidence: tip.confidence };
        return { x: p.x, y: p.y, confidence: tip.confidence };
      }
      const last = state.last;
      const gap = last ? frame.t - last.t : Number.POSITIVE_INFINITY;
      if (!last || gap > this.graceMs) {
        this.slots[slot] = this.freshSlot();
        return null;
      }
      return {
        x: last.p.x + state.velocity.x * gap,
        y: last.p.y + state.velocity.y * gap,
        confidence: last.confidence * (1 - gap / this.graceMs),
        predicted: true,
      };
    });
    // A hand's measured size outlasts a frame where it wasn't measured
    for (const hand of HANDS) {
      const measured = frame.handScale[hand];
      if (measured !== undefined) this.scale[hand] = measured;
    }
    return { ...frame, tips, handScale: { ...this.scale } };
  }

  reset(): void {
    this.slots.forEach((_, slot) => {
      this.slots[slot] = this.freshSlot();
    });
    for (const hand of HANDS) delete this.scale[hand];
  }
}
