/**
 * A performance on camera, turned into a lesson track:
 *
 * 1. trimmed to the part kept;
 * 2. resampled to even steps of a beat, each light interpolated between the
 *    frames around it (across gaps of up to `maxGapMs`; longer, it's unseen);
 * 3. smoothed (a small Gaussian, so tracker jitter doesn't become the move);
 * 4. taken back to lesson units by removing the performer's fit, so it plays
 *    at the size of whoever practices it;
 * 5. lights seen less than `minCoverage` of the time are left out;
 * 6. the loop's seam is closed: the last samples ease into the first.
 */

import { type FitTransform, removeFit } from '../../core/coords';
import { type Pose10, SLOTS, type Slot, type Vec2 } from '../../core/types';
import { distance, lerp } from '../../core/vec';
import type { Tips10 } from '../../tracking/types';
import type { KeyframeTrack } from '../schema';

export interface RecordedFrame {
  t: number;
  tips: Tips10;
}

export interface ProcessOptions {
  bpm: number;
  /** When the kept part starts and ends, ms (frame times). */
  startMs: number;
  endMs: number;
  fit: FitTransform;
  samplesPerBeat?: number;
  maxGapMs?: number;
  /** Gaussian sigma, in samples; 0 for none. */
  smoothing?: number;
  /** The share of samples a light must be seen in to be part of the move. */
  minCoverage?: number;
  /** Samples at the end eased into the start. */
  seamSamples?: number;
}

export interface ProcessedRecording {
  track: KeyframeTrack;
  activeSlots: Slot[];
  beats: number;
}

/** Where `slot` was at time `t`, between the frames around it; null across a long gap. */
export function sampleAt(frames: readonly RecordedFrame[], slot: Slot, t: number, maxGapMs: number): Vec2 | null {
  let before: { t: number; p: Vec2 } | null = null;
  let after: { t: number; p: Vec2 } | null = null;
  for (const frame of frames) {
    const tip = frame.tips[slot];
    if (!tip) continue;
    if (frame.t <= t) before = { t: frame.t, p: tip };
    else {
      after = { t: frame.t, p: tip };
      break;
    }
  }
  if (before && before.t === t) return { x: before.p.x, y: before.p.y };
  if (!before || !after || after.t - before.t > maxGapMs) return null;
  const p = lerp(before.p, after.p, (t - before.t) / (after.t - before.t));
  return { x: p.x, y: p.y };
}

/** Gaussian smoothing over a series, skipping (and keeping) its gaps. */
export function smooth(series: (Vec2 | null)[], sigma: number): (Vec2 | null)[] {
  if (sigma <= 0) return series;
  const radius = Math.ceil(sigma * 2);
  return series.map((p, i) => {
    if (!p) return null;
    let x = 0;
    let y = 0;
    let weight = 0;
    for (let k = -radius; k <= radius; k++) {
      const q = series[i + k];
      if (!q) continue;
      const w = Math.exp(-(k * k) / (2 * sigma * sigma));
      x += q.x * w;
      y += q.y * w;
      weight += w;
    }
    return { x: x / weight, y: y / weight };
  });
}

/** Eases the last `n` samples of a looping series toward its start, so the loop has no jump. */
export function closeSeam(series: (Vec2 | null)[], n: number): (Vec2 | null)[] {
  const first = series[0];
  const last = series.at(-1);
  if (!first || !last || series.length < n + 2) return series;
  // The jump at the seam, less the step the motion was taking anyway
  const second = series[1];
  const step = second ? { x: second.x - first.x, y: second.y - first.y } : { x: 0, y: 0 };
  const jump = { x: first.x - step.x - last.x, y: first.y - step.y - last.y };
  return series.map((p, i) => {
    const into = i - (series.length - n);
    if (!p || into < 0) return p;
    const w = (into + 1) / n;
    return { x: p.x + jump.x * w, y: p.y + jump.y * w };
  });
}

const round = (v: number) => Math.round(v * 10_000) / 10_000;

export function processRecording(frames: readonly RecordedFrame[], options: ProcessOptions): ProcessedRecording {
  const samplesPerBeat = options.samplesPerBeat ?? 8;
  const maxGapMs = options.maxGapMs ?? 300;
  const msPerSample = 60_000 / options.bpm / samplesPerBeat;
  const kept = frames.filter(frame => frame.t >= options.startMs - maxGapMs && frame.t <= options.endMs + maxGapMs);
  const count = Math.max(2, Math.round((options.endMs - options.startMs) / msPerSample));
  const times = Array.from({ length: count }, (_, i) => options.startMs + i * msPerSample);

  const bySlot = SLOTS.map(slot => {
    const series = smooth(
      times.map(t => sampleAt(kept, slot, t, maxGapMs)),
      options.smoothing ?? 1
    ).map(p => (p ? removeFit(p, options.fit) : null));
    return closeSeam(series, options.seamSamples ?? Math.max(1, Math.round(samplesPerBeat / 2)));
  });
  const minCoverage = options.minCoverage ?? 0.6;
  const activeSlots = SLOTS.filter(slot => bySlot[slot]!.filter(Boolean).length >= minCoverage * count);
  const active = new Set<Slot>(activeSlots);

  const trackFrames = times.map((_, i) =>
    SLOTS.map(slot => {
      const p = bySlot[slot]![i];
      return active.has(slot) && p ? ([round(p.x), round(p.y)] as [number, number]) : null;
    })
  );
  return {
    track: { samplesPerBeat, interpolation: 'catmullRom', frames: trackFrames },
    activeSlots,
    beats: count / samplesPerBeat,
  };
}

/**
 * The whole number of beats, between `minBeats` and the take's length, at which the move
 * comes back closest to where it started: a good loop length to suggest.
 */
export function suggestLoopBeats(poseAt: (beat: number) => Pose10, totalBeats: number, minBeats = 2): number {
  let best = Math.max(minBeats, Math.floor(totalBeats));
  let bestCost = Number.POSITIVE_INFINITY;
  const start = poseAt(0);
  for (let beats = minBeats; beats <= Math.floor(totalBeats); beats++) {
    const end = poseAt(beats);
    let cost = 0;
    let n = 0;
    start.forEach((p, slot) => {
      const q = end[slot];
      if (!p || !q) return;
      cost += distance(p, q);
      n += 1;
    });
    const mean = n > 0 ? cost / n : Number.POSITIVE_INFINITY;
    // Prefer longer loops when they're as good: a real phrase over a fragment
    if (mean < bestCost - 0.002) {
      bestCost = mean;
      best = beats;
    }
  }
  return best;
}
