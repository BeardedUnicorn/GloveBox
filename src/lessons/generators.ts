/**
 * Moves from generators: each GenSpec becomes a function from a phase of its
 * loop (0 → 1) to the ten lights' positions, in lesson units.
 *
 * A hand's tips are its palm (the anchor path) plus the five layout offsets,
 * turned by its rotation and scaled by the span, each pulled toward the palm
 * while its finger curls in a roll. Layouts are written for the right hand,
 * palm to the camera, fingers up (thumb toward the middle, at -x); the left
 * hand is the mirror image of everything, its rotation included.
 */

import { FINGERS, type Finger, type Hand, type Pose10, type Slot, slotOf, type Vec2 } from '../core/types';
import { length, lerp, mod, rotate } from '../core/vec';
import { corners, inOutCubic, pointOn } from './paths';
import type { GenSpec, HandSpec } from './schema';

/** Right-hand tip offsets, thumb → pinky, in span units (thumb to pinky ≈ 1). */
export const LAYOUT_POINTS: Record<'fan' | 'flat' | 'ring' | 'fist', Vec2[]> = {
  fan: [
    { x: -0.5, y: -0.05 },
    { x: -0.22, y: -0.45 },
    { x: 0, y: -0.52 },
    { x: 0.2, y: -0.46 },
    { x: 0.4, y: -0.3 },
  ],
  flat: [
    { x: -0.3, y: -0.12 },
    { x: -0.14, y: -0.48 },
    { x: -0.02, y: -0.53 },
    { x: 0.1, y: -0.5 },
    { x: 0.21, y: -0.42 },
  ],
  // Fingertips around an imagined ball, thumb at the inner side to pinky at the outer
  ring: [200, 235, 270, 305, 340].map(degrees => {
    const angle = (degrees * Math.PI) / 180;
    return { x: 0.45 * Math.cos(angle), y: 0.45 * Math.sin(angle) };
  }),
  fist: [
    { x: -0.16, y: -0.08 },
    { x: -0.08, y: -0.16 },
    { x: 0, y: -0.18 },
    { x: 0.08, y: -0.16 },
    { x: 0.15, y: -0.12 },
  ],
};

export const layoutPoints = (layout: HandSpec['layout']): Vec2[] =>
  typeof layout === 'string' ? LAYOUT_POINTS[layout] : layout;

/** A raised-cosine bump: 1 at 0, 0 from ±width/2 out. */
export function bump(d: number, width: number): number {
  return Math.abs(d) >= width / 2 ? 0 : 0.5 * (1 + Math.cos((2 * Math.PI * d) / width));
}

/** How far through its curl (0–1) a finger is at `phase` of a roll. */
export function rollAmount(roll: NonNullable<HandSpec['roll']>, finger: Finger, phase: number): number {
  const order = roll.order === 'thumbFirst' ? finger : 4 - finger;
  // Signed distance from this finger's turn, wrapped into [-0.5, 0.5)
  const d = mod(phase * roll.cyclesPerLoop - order / 5 - roll.width / 2 + 0.5, 1) - 0.5;
  return bump(d, roll.width);
}

/** The rotation (radians) at `phase`. */
export function rotationAt(rotation: HandSpec['rotation'], phase: number): number {
  if (!rotation) return 0;
  let angle = rotation.base + rotation.perLoop * 2 * Math.PI * phase;
  const steps = rotation.steps;
  if (steps) {
    const at = mod(phase, 1) * steps.length;
    const index = Math.floor(at);
    const local = at - index;
    const from = steps[index]!;
    const to = steps[(index + 1) % steps.length]!;
    // Hold the first half, turn in the second
    angle += from + (to - from) * inOutCubic(Math.max(0, local - 0.5) * 2);
  }
  return angle;
}

/** One hand's five tips at `phase`, in lesson units. */
export function handTips(hand: Hand, spec: HandSpec, phase: number, span: number): Vec2[] {
  const p = phase + spec.phase;
  const mirror = hand === 'L' ? -1 : 1;
  const anchor = pointOn(spec.anchor, p);
  const angle = rotationAt(spec.rotation, p);
  return layoutPoints(spec.layout).map((offset, i) => {
    let local = offset;
    if (spec.roll) {
      // Curling pulls the tip toward the palm, along the finger
      const pull = rollAmount(spec.roll, i as Finger, p) * spec.roll.amplitude;
      const reach = length(offset) || 1;
      const k = Math.max(0, 1 - pull / reach);
      local = { x: offset.x * k, y: offset.y * k };
    }
    const turned = rotate(local, angle);
    return { x: anchor.x + mirror * turned.x * span, y: anchor.y + turned.y * span };
  });
}

/** Stage order, left to right, of the ten lights with palms to the camera (a wave runs along it). */
export const LEFT_TO_RIGHT: readonly Slot[] = [4, 3, 2, 1, 0, 5, 6, 7, 8, 9];

export interface GenMotion {
  /** The lights at a phase of the loop. */
  pose(phase: number): Pose10;
  /** Phases (0–1) where the move hits a corner, for cues. */
  keyPhases: number[];
}

/** A GenSpec as a function of phase, for a hand span of `span` (lesson units). */
export function compileGen(spec: GenSpec, span: number): GenMotion {
  switch (spec.type) {
    case 'hands': {
      const hands = (['L', 'R'] as const).flatMap(hand => {
        const handSpec = spec[hand];
        return handSpec ? [{ hand, spec: handSpec }] : [];
      });
      return {
        pose(phase) {
          const pose: Pose10 = new Array(10).fill(null);
          for (const { hand, spec: handSpec } of hands) {
            handTips(hand, handSpec, phase, span).forEach((tip, finger) => {
              pose[slotOf(hand, FINGERS[finger]!)] = tip;
            });
          }
          return pose;
        },
        keyPhases: [...new Set(hands.flatMap(({ spec: h }) => corners(h.anchor).map(c => mod(c - h.phase, 1))))].sort(
          (a, b) => a - b
        ),
      };
    }
    case 'wave':
      return {
        pose(phase) {
          const pose: Pose10 = new Array(10).fill(null);
          LEFT_TO_RIGHT.forEach((slot, k) => {
            pose[slot] = {
              x: spec.center.x + (k - 4.5) * spec.spacing,
              y: spec.center.y + spec.amplitude * Math.sin(2 * Math.PI * (phase * spec.cycles - (spec.dir * k) / 10)),
            };
          });
          return pose;
        },
        keyPhases: [],
      };
    case 'sequence': {
      const parts = spec.parts.map(part => ({ ...part, motion: compileGen(part.spec, span) }));
      const total = parts.reduce((sum, part) => sum + part.beats, 0);
      const starts = parts.map((_, i) => parts.slice(0, i).reduce((sum, part) => sum + part.beats, 0));
      return {
        pose(phase) {
          const beat = mod(phase, 1) * total;
          const index = starts.findLastIndex(start => start <= beat);
          const part = parts[index]!;
          const local = (beat - starts[index]!) / part.beats;
          const pose = part.motion.pose(local);
          const intoBlend = beat - (starts[index]! + part.beats - part.blendBeats);
          if (part.blendBeats === 0 || intoBlend < 0) return pose;
          // Ease into where the next part starts
          const next = parts[(index + 1) % parts.length]!.motion.pose(0);
          const t = inOutCubic(intoBlend / part.blendBeats);
          return pose.map((p, slot) => {
            const q = next[slot] as Vec2 | null;
            if (!p || !q) return t < 0.5 ? p : q;
            return lerp(p, q, t);
          });
        },
        keyPhases: parts.flatMap((part, i) => part.motion.keyPhases.map(k => (starts[i]! + k * part.beats) / total)),
      };
    }
  }
}
