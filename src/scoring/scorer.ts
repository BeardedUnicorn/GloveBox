/**
 * How closely the performer follows the lesson, frame by frame.
 *
 * - Each target's radius scales with the hand's size (difficulty widens or
 *   narrows it). Inside the radius a finger earns full credit, fading to
 *   none `falloff` radii further out. The ring drawn is the radius scored.
 * - People run a little behind the beat. Each hand gets the one lag in the
 *   window that fits all its fingers best, so a steady lag costs nothing
 *   while a finger out of place still does. That lag is also the live "you're
 *   120 ms behind" readout.
 * - strict mode scores each finger against its own target. pattern mode
 *   scores any light against any target (Hungarian matching), which is
 *   what a receiver sees, and all Dark mode can know.
 */

import { assign } from '../core/hungarian';
import { HANDS, type Hand, handOf, type Pose10, type Slot } from '../core/types';
import { distance } from '../core/vec';
import type { Grade, Stars } from '../progression/types';
import type { TrackerFrame } from '../tracking/types';
import { gradeFor, starsFor } from './grade';

export interface ScoringParams {
  radiusK: number;
  falloff: number;
  lagWindowMs: [number, number];
  lagStepMs: number;
  graceMs: number;
  identity: 'strict' | 'pattern';
}

export const DEFAULT_SCORING: ScoringParams = {
  radiusK: 0.5,
  falloff: 1,
  lagWindowMs: [-60, 180],
  lagStepMs: 20,
  graceMs: 200,
  identity: 'strict',
};

/** A frame that comes much later than the last counts as at most this long. */
const MAX_FRAME_MS = 100;
/** A beat whose mean score is at least this keeps the combo going. */
export const COMBO_SCORE = 0.8;
/** A hit target stays lit until the finger is this many radii away (no flicker at the edge). */
const HIT_RELEASE = 1.2;

export interface ScorerOptions {
  params: ScoringParams;
  activeSlots: readonly Slot[];
  /** Radius multiplier (grade.ts DIFFICULTY_RADIUS). */
  difficulty: number;
  /** Where every light should be at time t (ms), in stage space. */
  expectedAt(t: number): Pose10;
  /** The lesson's beat at time t. */
  beatAt(t: number): number;
  /** Beats per loop, for per-loop accuracy. */
  periodBeats: number;
  /** The hand scale to assume until the tracker has measured one. */
  fallbackScale: number;
  /** Scoring starts at this beat: half a beat into the lesson, after the count-in. */
  startBeat?: number;
}

export interface FrameScore {
  t: number;
  /** Each slot's credit, 0–1; null for slots the lesson doesn't use. */
  perSlot: (number | null)[];
  /** Whether each slot's target is lit as hit. */
  hits: boolean[];
  /** The frame's mean credit over active slots, 0–1. */
  score: number;
  /** The lag each hand is running at, ms (positive: behind). */
  lagMs: Partial<Record<Hand, number>>;
  /** Whether this frame counts toward the result (not the count-in, not paused). */
  counted: boolean;
}

export interface ScoreSummary {
  /** 0–100. */
  accuracy: number;
  grade: Grade;
  stars: Stars;
  /** 0–100 per slot; null for unused slots. */
  perFinger: (number | null)[];
  combo: number;
  maxCombo: number;
  meanLagMs: number;
  /** Time scored. */
  durationMs: number;
  /** 0–100 for each loop played so far. */
  loops: number[];
}

/** Credit for a finger `d` from a target of radius `r`. */
export const credit = (d: number, r: number, falloff: number): number =>
  d <= r ? 1 : Math.max(0, 1 - (d - r) / (falloff * r));

export class Scorer {
  private readonly lags: number[];
  private readonly active: Set<Slot>;
  private readonly scale: Record<Hand, number>;
  private hits = new Array<boolean>(10).fill(false);
  /** Each hand's lag, as an index into `lags`: kept while the hand is out of sight. */
  private readonly lagIndex: Record<Hand, number>;
  private lastT: number | null = null;

  private weight = 0;
  private scoreSum = 0;
  private lagSum = 0;
  private readonly slotSum = new Array<number>(10).fill(0);
  private readonly loopSums = new Map<number, { score: number; weight: number }>();
  private beat: { index: number; score: number; weight: number } | null = null;
  private combo = 0;
  private maxCombo = 0;

  constructor(private readonly options: ScorerOptions) {
    const [min, max] = options.params.lagWindowMs;
    this.lags = [];
    for (let lag = min; lag <= max; lag += options.params.lagStepMs) this.lags.push(lag);
    // Until a hand is seen, assume it's on the beat (or as near as the window allows)
    const nearest = this.lags.reduce((best, lag, i) => (Math.abs(lag) < Math.abs(this.lags[best]!) ? i : best), 0);
    this.lagIndex = { L: nearest, R: nearest };
    this.active = new Set(options.activeSlots);
    this.scale = { L: options.fallbackScale, R: options.fallbackScale };
  }

  /** The target radius for a hand, stage units: what the ring is drawn at. */
  radius(hand: Hand): number {
    const { params, difficulty } = this.options;
    return params.radiusK * this.scale[hand] * difficulty;
  }

  update(frame: TrackerFrame, paused = false): FrameScore {
    for (const hand of HANDS) {
      const measured = frame.handScale[hand];
      if (measured !== undefined) this.scale[hand] = measured;
    }
    const { perSlot, distances, lagMs } =
      this.options.params.identity === 'strict' ? this.scoreStrict(frame) : this.scorePattern(frame);

    perSlot.forEach((s, slot) => {
      if (s === null) return;
      const r = this.radius(handOf(slot as Slot));
      const d = distances[slot]!;
      this.hits[slot] = d <= r || (this.hits[slot]! && d <= HIT_RELEASE * r);
    });

    const scores = perSlot.filter((s): s is number => s !== null);
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    const beat = this.options.beatAt(frame.t);
    const counted = !paused && beat >= (this.options.startBeat ?? 0.5);
    if (counted) this.accumulate(frame.t, beat, score, perSlot, lagMs);
    this.lastT = frame.t;
    return { t: frame.t, perSlot, hits: [...this.hits], score, lagMs, counted };
  }

  /** Each finger against its own target, each hand at its best lag. */
  private scoreStrict(frame: TrackerFrame) {
    const lagMs: Partial<Record<Hand, number>> = {};
    const expected = this.lags.map(lag => this.options.expectedAt(frame.t - lag));
    for (const hand of HANDS) {
      const slots = [...this.active].filter(slot => handOf(slot) === hand && frame.tips[slot]);
      if (slots.length === 0) continue;
      let best = Number.POSITIVE_INFINITY;
      expected.forEach((pose, i) => {
        const cost = slots.reduce<number>((sum, slot) => sum + distance(frame.tips[slot]!, pose[slot]!), 0);
        if (cost < best) {
          best = cost;
          this.lagIndex[hand] = i;
        }
      });
      lagMs[hand] = this.lags[this.lagIndex[hand]]!;
    }
    const distances = new Array<number>(10).fill(Number.POSITIVE_INFINITY);
    const perSlot = new Array<number | null>(10).fill(null);
    for (const slot of this.active) {
      const hand = handOf(slot);
      const target = expected[this.lagIndex[hand]]![slot]!;
      const tip = frame.tips[slot];
      if (!tip) {
        perSlot[slot] = 0;
        continue;
      }
      const d = distance(tip, target);
      distances[slot] = d;
      perSlot[slot] = credit(d, this.radius(hand), this.options.params.falloff) * (tip.predicted ? tip.confidence : 1);
    }
    return { perSlot, distances, lagMs };
  }

  /** Any light against any target: one lag for both hands, the best matching at each. */
  private scorePattern(frame: TrackerFrame) {
    const targets = [...this.active];
    const lights = frame.tips.filter(tip => tip !== null);
    const penalty = 3 * Math.max(this.radius('L'), this.radius('R'));
    let best: { cost: number; lag: number; matched: (number | null)[] } | null = null;
    for (const lag of this.lags) {
      const expected = this.options.expectedAt(frame.t - lag);
      const cost = targets.map(slot => lights.map(light => distance(light, expected[slot]!)));
      // With no lights, every row's list is empty and assign leaves each target unmatched
      const matched = assign(cost).map((col, row) => (col < 0 ? null : cost[row]![col]!));
      const total = matched.reduce<number>((sum, d) => sum + (d ?? penalty), 0);
      if (best === null || total < best.cost) best = { cost: total, lag, matched };
    }
    const chosen = best!;
    const distances = new Array<number>(10).fill(Number.POSITIVE_INFINITY);
    const perSlot = new Array<number | null>(10).fill(null);
    targets.forEach((slot, row) => {
      const d = chosen.matched[row]!;
      if (d === null) {
        perSlot[slot] = 0;
        return;
      }
      distances[slot] = d;
      perSlot[slot] = credit(d, this.radius(handOf(slot)), this.options.params.falloff);
    });
    return { perSlot, distances, lagMs: { L: chosen.lag, R: chosen.lag } };
  }

  private accumulate(
    t: number,
    beat: number,
    score: number,
    perSlot: (number | null)[],
    lagMs: Partial<Record<Hand, number>>
  ) {
    const dt = this.lastT === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, t - this.lastT));
    // A frame with no time behind it (the first, a repeat) adds nothing
    if (dt === 0) return;
    this.weight += dt;
    this.scoreSum += score * dt;
    const lags = Object.values(lagMs);
    const lag = lags.length > 0 ? lags.reduce((a, b) => a + b, 0) / lags.length : 0;
    this.lagSum += lag * dt;
    perSlot.forEach((s, slot) => {
      if (s !== null) this.slotSum[slot] = this.slotSum[slot]! + s * dt;
    });

    const loop = Math.floor(beat / this.options.periodBeats);
    const loopSum = this.loopSums.get(loop) ?? { score: 0, weight: 0 };
    loopSum.score += score * dt;
    loopSum.weight += dt;
    this.loopSums.set(loop, loopSum);

    const index = Math.floor(beat);
    if (this.beat && this.beat.index !== index) this.closeBeat();
    if (!this.beat || this.beat.index !== index) this.beat = { index, score: 0, weight: 0 };
    this.beat.score += score * dt;
    this.beat.weight += dt;
  }

  private closeBeat(): void {
    const beat = this.beat!;
    if (beat.score / beat.weight >= COMBO_SCORE) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    } else {
      this.combo = 0;
    }
  }

  summary(): ScoreSummary {
    const accuracy = this.weight > 0 ? (100 * this.scoreSum) / this.weight : 0;
    return {
      accuracy,
      grade: gradeFor(accuracy),
      stars: starsFor(accuracy),
      perFinger: this.slotSum.map((sum, slot) =>
        this.active.has(slot as Slot) ? (this.weight > 0 ? (100 * sum) / this.weight : 0) : null
      ),
      combo: this.combo,
      maxCombo: this.maxCombo,
      meanLagMs: this.weight > 0 ? this.lagSum / this.weight : 0,
      durationMs: this.weight,
      loops: [...this.loopSums.entries()].sort(([a], [b]) => a - b).map(([, sum]) => (100 * sum.score) / sum.weight),
    };
  }
}
