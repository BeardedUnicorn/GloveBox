/**
 * The One Euro filter (Casiez, Roussel & Vogel, CHI 2012): smooths a noisy
 * signal hard while it's still and lightly while it moves fast, so a held
 * fingertip stops jittering without a moving one lagging.
 */

import type { Vec2 } from './types';

export interface OneEuroParams {
  /** Hz: the cutoff while still. Lower is smoother. */
  minCutoff: number;
  /** How quickly the cutoff rises with speed. Higher lags less. */
  beta: number;
  /** Hz: the cutoff for the speed estimate itself. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.5, beta: 1.2, dCutoff: 1 };

/** The smoothing factor for a cutoff (Hz) over a step of `dt` seconds. */
export function smoothingFactor(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/** One Euro over one number. */
export class OneEuroFilter {
  private last: { t: number; x: number; dx: number } | null = null;

  constructor(private readonly params: OneEuroParams = DEFAULT_ONE_EURO) {}

  /** The smoothed value of `x` sampled at `t` (ms). A sample no newer than the last returns the last value. */
  filter(x: number, t: number): number {
    const last = this.last;
    if (last === null) {
      this.last = { t, x, dx: 0 };
      return x;
    }
    const dt = (t - last.t) / 1000;
    if (dt <= 0) return last.x;
    const { minCutoff, beta, dCutoff } = this.params;
    const rawDx = (x - last.x) / dt;
    const dx = last.dx + smoothingFactor(dCutoff, dt) * (rawDx - last.dx);
    const cutoff = minCutoff + beta * Math.abs(dx);
    const smoothed = last.x + smoothingFactor(cutoff, dt) * (x - last.x);
    this.last = { t, x: smoothed, dx };
    return smoothed;
  }

  reset(): void {
    this.last = null;
  }
}

/** One Euro over a point: each axis on its own. */
export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(params: OneEuroParams = DEFAULT_ONE_EURO) {
    this.fx = new OneEuroFilter(params);
    this.fy = new OneEuroFilter(params);
  }

  filter(p: Vec2, t: number): Vec2 {
    return { x: this.fx.filter(p.x, t), y: this.fy.filter(p.y, t) };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
