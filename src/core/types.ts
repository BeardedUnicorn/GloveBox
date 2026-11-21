/**
 * The words every part of GloveBox shares: hands, fingers, the ten light
 * slots, and points in stage space (src/core/coords.ts).
 */

/** The performer's own hand: L is their left, whatever the view. */
export type Hand = 'L' | 'R';

/** 0 thumb, 1 index, 2 middle, 3 ring, 4 pinky. */
export type Finger = 0 | 1 | 2 | 3 | 4;

/** One of the ten lights: 0–4 the left hand's thumb to pinky, 5–9 the right's. */
export type Slot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** A point in stage space: frame-height units from the frame's center, y down, +x the performer's right. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Where each of the ten lights is (or should be); null where a slot has none. */
export type Pose10 = (Vec2 | null)[];

export const HANDS: readonly Hand[] = ['L', 'R'];
export const FINGERS: readonly Finger[] = [0, 1, 2, 3, 4];
export const SLOTS: readonly Slot[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;

export const slotOf = (hand: Hand, finger: Finger): Slot => ((hand === 'L' ? 0 : 5) + finger) as Slot;
export const handOf = (slot: Slot): Hand => (slot < 5 ? 'L' : 'R');
export const fingerOf = (slot: Slot): Finger => (slot % 5) as Finger;

/** "left index", "right pinky". */
export const slotName = (slot: Slot): string =>
  `${handOf(slot) === 'L' ? 'left' : 'right'} ${FINGER_NAMES[fingerOf(slot)]}`;

/** A pose with no lights. */
export const emptyPose = (): Pose10 => SLOTS.map(() => null);
