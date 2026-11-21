/**
 * Made-up hands for tests: where an open hand's five fingertips sit, palm to
 * the camera, in stage space (performer's view: +x their right).
 */

import { FINGERS, type Hand, type Pose10, slotOf, type Vec2 } from '../core/types';
import { rotate } from '../core/vec';

/**
 * The right hand's open tips, thumb to pinky, around the hand's center, in
 * units of its span (thumb tip to pinky tip ≈ 1). Palm to the camera in the
 * mirror view, the right thumb is toward the body's middle (−x).
 */
export const RIGHT_OPEN: readonly Vec2[] = [
  { x: -0.52, y: 0.18 },
  { x: -0.25, y: -0.3 },
  { x: 0, y: -0.4 },
  { x: 0.24, y: -0.33 },
  { x: 0.47, y: -0.12 },
];

/** The left hand is the right one mirrored. */
export const LEFT_OPEN: readonly Vec2[] = RIGHT_OPEN.map(p => ({ x: -p.x, y: p.y }));

export interface HandPlacement {
  center: Vec2;
  span: number;
  /** Radians. */
  rotation?: number;
  /** Per finger, thumb to pinky: how far (span units) each tip is pulled in toward the palm. */
  curl?: readonly number[];
}

/** One hand's five tips, thumb to pinky. */
export function handTips(hand: Hand, { center, span, rotation = 0, curl = [0, 0, 0, 0, 0] }: HandPlacement): Vec2[] {
  const shape = hand === 'R' ? RIGHT_OPEN : LEFT_OPEN;
  return shape.map((tip, f) => {
    const pull = 1 - (curl[f] ?? 0);
    const turned = rotate({ x: tip.x * pull, y: tip.y * pull }, rotation);
    return { x: center.x + turned.x * span, y: center.y + turned.y * span };
  });
}

/** Both hands as a pose; a hand given as null has no lights. */
export function twoHands(left: HandPlacement | null, right: HandPlacement | null): Pose10 {
  const pose: Pose10 = new Array(10).fill(null);
  for (const [hand, placement] of [
    ['L', left],
    ['R', right],
  ] as const) {
    if (placement === null) continue;
    handTips(hand, placement).forEach((tip, f) => {
      pose[slotOf(hand, FINGERS[f]!)] = tip;
    });
  }
  return pose;
}
