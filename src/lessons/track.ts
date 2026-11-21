/**
 * Recorded moves: a keyframe track sampled evenly in beats, played back
 * smoothly. Centripetal Catmull–Rom passes through every sample without the
 * loops and overshoots uniform splines make at sharp turns.
 */

import type { Pose10, Vec2 } from '../core/types';
import { distance, lerp, mod } from '../core/vec';
import type { KeyframeTrack } from './schema';

const toVec = (sample: [number, number] | null): Vec2 | null => (sample ? { x: sample[0], y: sample[1] } : null);

/** The knot spacing for centripetal Catmull–Rom (alpha ½), never zero. */
const knot = (a: Vec2, b: Vec2): number => Math.max(Math.sqrt(distance(a, b)), 1e-4);

/** The centripetal Catmull–Rom point between p1 and p2 at t (0–1), with p0 and p3 as neighbors. */
export function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + t * (t2 - t1);
  const mix = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => lerp(a, b, (u - ta) / (tb - ta));
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** A missing neighbor stands in as the reflection of the segment it would continue. */
const extend = (from: Vec2, through: Vec2): Vec2 => ({ x: 2 * through.x - from.x, y: 2 * through.y - from.y });

/** The track's lights at `sample` (fractional, looping). */
export function trackPose(track: KeyframeTrack, sample: number): Pose10 {
  const frames = track.frames;
  const n = frames.length;
  const at = mod(sample, n);
  const i1 = Math.floor(at);
  const t = at - i1;
  const i0 = (i1 - 1 + n) % n;
  const i2 = (i1 + 1) % n;
  const i3 = (i1 + 2) % n;
  return frames[i1]!.map((_, slot) => {
    const p1 = toVec(frames[i1]![slot]!);
    const p2 = toVec(frames[i2]![slot]!);
    if (!p1 || !p2) return t < 0.5 ? p1 : p2;
    if (track.interpolation === 'linear') return lerp(p1, p2, t);
    const p0 = toVec(frames[i0]![slot]!) ?? extend(p2, p1);
    const p3 = toVec(frames[i3]![slot]!) ?? extend(p1, p2);
    return catmullRom(p0, p1, p2, p3, t);
  });
}
