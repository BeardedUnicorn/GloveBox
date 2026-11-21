import { describe, expect, test } from 'vitest';
import { emptyPose, type Hand, type Pose10, slotOf, type Vec2 } from '../../core/types';
import { centroid, distance } from '../../core/vec';
import { handTips, LEFT_OPEN, RIGHT_OPEN, twoHands } from '../../test/syntheticHands';
import type { SlotTrack, StageLight } from './assign';
import {
  bestOrder,
  fingerOrders,
  fixHandOrder,
  type HandModel,
  orderCost,
  orderHand,
  reacquire,
  shapeAnchors,
  splitByX,
  splitHands,
} from './reacquire';

const SPAN = 0.3;

function model(shape: readonly Vec2[]): HandModel {
  const c = centroid(shape);
  const span = distance(shape[0]!, shape[4]!);
  return { template: shape.map(p => ({ x: (p.x - c.x) / span, y: (p.y - c.y) / span })), span: span * SPAN };
}

const HANDS_MODEL: Record<Hand, HandModel> = { L: model(LEFT_OPEN), R: model(RIGHT_OPEN) };
const NO_HUES = new Array(10).fill(null);
const HAND_SPAN = HANDS_MODEL.R.span;
const L_AT = { center: { x: -0.4, y: 0 }, span: SPAN };
const R_AT = { center: { x: 0.4, y: 0 }, span: SPAN };

const lit = (p: Vec2, hue: number | null = null, brightness = 100): StageLight => ({ ...p, hue, brightness });
const seen = (p: Vec2): SlotTrack => ({ pos: p, vel: { x: 0, y: 0 }, lastSeen: 0, seen: true, lost: false });

describe('splitting the lights into hands', () => {
  test('two-means on x', () => {
    expect(splitByX([])).toEqual([[], []]);
    expect(splitByX([2, 2, 2])).toEqual([[0, 1, 2], []]);
    expect(splitByX([0.4, -0.5, 0.5, -0.4, 0.1])).toEqual([
      [1, 3],
      [0, 2, 4],
    ]);
  });

  const pose = twoHands(L_AT, R_AT);
  const lights = pose.map(p => lit(p!));

  test('the right hand is on the right, unless the lesson has them crossed', () => {
    const plain = splitHands(lights, null, HAND_SPAN);
    expect(plain.L.sort()).toEqual([0, 1, 2, 3, 4]);
    const crossed = twoHands(R_AT, L_AT);
    const guided = splitHands(lights, crossed, HAND_SPAN);
    expect(guided.L.sort()).toEqual([5, 6, 7, 8, 9]);
    // A lesson with only one hand doesn't decide
    const oneHand = twoHands(null, L_AT);
    expect(splitHands(lights, oneHand, HAND_SPAN).L.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  test('one group goes to the hand the lesson expects nearer, or the side it is on', () => {
    const right = handTips('R', R_AT).map(p => lit(p));
    // One hand's five lights stay one hand
    expect(splitHands(right, null, HAND_SPAN)).toEqual({ L: [], R: [0, 1, 2, 3, 4] });
    // A few lights far apart are two hands
    const apart = [lit({ x: -0.5, y: 0 }), lit({ x: 0.5, y: 0 })];
    expect(splitHands(apart, null, HAND_SPAN)).toEqual({ L: [0], R: [1] });
    const single = [lit({ x: -0.2, y: 0 })];
    expect(splitHands(single, null, HAND_SPAN)).toEqual({ L: [0], R: [] });
    expect(splitHands(single, twoHands({ ...L_AT, center: { x: 0.5, y: 0 } }, R_AT), HAND_SPAN)).toEqual({
      L: [],
      R: [0],
    });
  });

  test('a hand gets at most five: extras go to the other hand, or the dimmest are dropped', () => {
    // Six on the left, two on the right: the left's light nearest the right hand moves over
    const xs = [-0.6, -0.55, -0.5, -0.45, -0.4, -0.1, 0.5, 0.6];
    const moved = splitHands(
      xs.map(x => lit({ x, y: 0 })),
      null,
      HAND_SPAN
    );
    expect(moved.L).toHaveLength(5);
    expect(moved.R).toContain(5);
    // Six in one place on either side: the other hand is empty, so one moves toward it
    for (const x of [-0.3, 0.3]) {
      const same = splitHands(
        new Array(6).fill(0).map(() => lit({ x, y: 0 })),
        null,
        HAND_SPAN
      );
      expect(same.L.length + same.R.length).toBe(6);
      expect(Math.max(same.L.length, same.R.length)).toBe(5);
    }
    // Six and six: each drops its dimmest
    const twelve = [...xs.slice(0, 6), 0.4, 0.45, 0.5, 0.55, 0.6, 0.65].map((x, i) => lit({ x, y: 0 }, null, 200 - i));
    const dropped = splitHands(twelve, null, HAND_SPAN);
    expect(dropped.L).not.toContain(5);
    expect(dropped.R).not.toContain(11);
    expect(dropped.L).toHaveLength(5);
    expect(dropped.R).toHaveLength(5);
  });
});

describe('ordering a hand by its shape', () => {
  test('every way to give points distinct fingers', () => {
    expect(fingerOrders(5)).toHaveLength(120);
    expect(fingerOrders(3)).toHaveLength(60);
    expect(fingerOrders(0)).toEqual([[]]);
  });

  test('five shuffled lights come back thumb to pinky, even turned and resized', () => {
    for (const hand of ['L', 'R'] as const) {
      const tips = handTips(hand, { center: { x: 0.1, y: -0.1 }, span: SPAN * 1.3, rotation: 0.6 });
      const shuffle = [3, 0, 4, 1, 2];
      const byFinger = orderHand(
        shuffle.map(i => lit(tips[i]!)),
        HANDS_MODEL[hand],
        null,
        [null, null, null, null, null]
      );
      expect(byFinger.map(point => shuffle[point])).toEqual([0, 1, 2, 3, 4]);
    }
  });

  test("three or four lights are fit too; the calibration's colors and the lesson's layout help", () => {
    const tips = handTips('R', R_AT);
    expect(
      orderHand(
        [tips[1], tips[2], tips[4]].map(p => lit(p!)),
        HANDS_MODEL.R,
        null,
        new Array(5).fill(null)
      )
    ).toEqual([-1, 0, 1, -1, 2]);
    const hues = [0, 0.1, 0.3, 0.5, 0.7];
    const colored = [0, 1, 2, 3].map(f => lit(tips[f]!, hues[f]!));
    expect(orderHand(colored, HANDS_MODEL.R, handTips('R', { ...R_AT, center: { x: 0.3, y: 0 } }), hues)).toEqual([
      0, 1, 2, 3, -1,
    ]);
    const cheaper = orderCost(colored, [0, 1, 2, 3], HANDS_MODEL.R, null, hues);
    expect(cheaper).toBeLessThan(orderCost(colored, [1, 0, 2, 3], HANDS_MODEL.R, null, hues));
    expect(bestOrder(colored, HANDS_MODEL.R, null, hues).order).toEqual([0, 1, 2, 3]);
  });

  test('one or two lights go to the fingers they sit nearest, with the lesson and colors weighing in', () => {
    const tips = handTips('R', R_AT);
    expect(orderHand([], HANDS_MODEL.R, null, new Array(5).fill(null))).toEqual([-1, -1, -1, -1, -1]);
    const pair = [lit(tips[0]!), lit(tips[4]!)];
    expect(orderHand(pair, HANDS_MODEL.R, null, new Array(5).fill(null))).toEqual([0, -1, -1, -1, 1]);
    const prior = handTips('R', R_AT);
    expect(orderHand(pair, HANDS_MODEL.R, prior, [0, null, null, null, 0.5])).toEqual([0, -1, -1, -1, 1]);
    expect(orderHand([lit(tips[2]!)], HANDS_MODEL.R, [null, null, null, null, null], new Array(5).fill(null))).toEqual([
      -1, -1, 0, -1, -1,
    ]);
  });

  test('reacquiring both hands', () => {
    const pose = twoHands(L_AT, R_AT);
    const order = [7, 2, 9, 0, 5, 1, 8, 3, 6, 4];
    const lights = order.map(slot => lit(pose[slot]!));
    const lightOf = reacquire({ lights, hands: HANDS_MODEL, hues: NO_HUES, prior: null });
    expect(lightOf.map(index => order[index])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Crossed in the lesson: the hands are named by it
    const crossed: Pose10 = twoHands(R_AT, L_AT);
    const guided = reacquire({ lights: pose.map(p => lit(p!)), hands: HANDS_MODEL, hues: NO_HUES, prior: crossed });
    expect(guided.slice(0, 5).every(index => index >= 5)).toBe(true);
    // A lesson with only the right hand leaves the left to its shape
    const partial = reacquire({ lights, hands: HANDS_MODEL, hues: NO_HUES, prior: twoHands(null, R_AT) });
    expect(partial.map(index => order[index])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('keeping hands in order while tracking', () => {
  test("an unseen finger's place, from its hand's seen fingers", () => {
    const tips = handTips('R', { ...R_AT, rotation: 0.3 });
    const tracks: (SlotTrack | null)[] = new Array(10).fill(null);
    for (const f of [0, 1, 2] as const) tracks[slotOf('R', f)] = seen(tips[f]!);
    const anchors = shapeAnchors(tracks, HANDS_MODEL);
    expect(distance(anchors[slotOf('R', 4)]!, tips[4]!)).toBeLessThan(1e-9);
    expect(anchors[slotOf('R', 0)]).toBeNull();
    // Too few seen (the left hand) or all five: no anchors
    expect(anchors.slice(0, 5)).toEqual([null, null, null, null, null]);
    const all = twoHands(L_AT, R_AT).map(p => seen(p!));
    expect(shapeAnchors(all, HANDS_MODEL)).toEqual(emptyPose());
  });

  const pose = twoHands(L_AT, R_AT);
  const lights = pose.map(p => lit(p!));
  const identity = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const tracksFor = (lightOf: number[]) => lightOf.map(index => (index >= 0 ? seen(lights[index]!) : null));
  const fix = (lightOf: number[], tracks = tracksFor(lightOf)) =>
    fixHandOrder({ lights, lightOf, tracks, t: 5, hands: HANDS_MODEL, hues: NO_HUES });

  test('a hand in order is left alone', () => {
    const { lightOf, tracks } = fix(identity);
    expect(lightOf).toEqual(identity);
    expect(tracks).toEqual(tracksFor(identity));
  });

  test('fingers that swapped lights are put back', () => {
    const scrambled = [0, 1, 3, 4, 2, 5, 7, 6, 8, 9];
    const { lightOf, tracks } = fix(scrambled);
    expect(lightOf).toEqual(identity);
    expect(tracks[2]).toMatchObject({ pos: { x: lights[2]!.x, y: lights[2]!.y }, lastSeen: 5, seen: true });
  });

  test('a small misfit, or one no order beats by enough, is left alone', () => {
    // A curled finger fits less well, but no other order is far better
    const curled = handTips('R', { ...R_AT, curl: [0, 0.4, 0, 0, 0] });
    const bent = [...pose.slice(0, 5), ...curled].map(p => lit(p!));
    const kept = fixHandOrder({
      lights: bent,
      lightOf: identity,
      tracks: bent.map(light => seen(light)),
      t: 5,
      hands: HANDS_MODEL,
      hues: NO_HUES,
      check: { ratio: 0.35, minCost: 0, reach: 0.9 },
    });
    expect(kept.lightOf).toEqual(identity);
  });

  test('a hand short of fingers takes spare lights near it', () => {
    // The right pinky was never found; its light (9) is spare
    const lightOf = [...identity.slice(0, 9), -1];
    const { lightOf: fixed, tracks } = fix(lightOf);
    expect(fixed).toEqual(identity);
    expect(tracks[9]).toMatchObject({ pos: { x: lights[9]!.x, y: lights[9]!.y }, seen: true, lost: false });
  });

  test('a finger whose light goes to another is lost; one that had none stays without', () => {
    // Right hand: thumb and pinky hold each other's lights, ring holds nothing, middle and index are missing;
    // the ring's light is spare. Reordered from 3 lights: thumb, ring, pinky; index and middle get none
    const lightOf = [...identity.slice(0, 5), 9, -1, -1, -1, 5];
    const tracks = tracksFor(lightOf);
    tracks[7] = { ...seen(lights[7]!), seen: false };
    const freeLights = [...lights];
    freeLights[6] = lit({ x: 5, y: 5 });
    freeLights[7] = lit({ x: 5, y: 5 });
    const result = fixHandOrder({ lights: freeLights, lightOf, tracks, t: 5, hands: HANDS_MODEL, hues: NO_HUES });
    expect(result.lightOf.slice(5)).toEqual([5, -1, -1, 8, 9]);
    expect(result.tracks[7]).toMatchObject({ seen: false });
  });

  test('a hand holding fewer than two lights, or with no spares near, is left to the tracker', () => {
    const few = [0, -1, -1, -1, -1, 5, 6, 7, 8, 9];
    expect(fix(few).lightOf).toEqual(few);
    const away = [...lights];
    away[9] = lit({ x: 3, y: 3 });
    const lightOf = [...identity.slice(0, 9), -1];
    const result = fixHandOrder({
      lights: away,
      lightOf,
      tracks: tracksFor(lightOf),
      t: 5,
      hands: HANDS_MODEL,
      hues: NO_HUES,
    });
    expect(result.lightOf).toEqual(lightOf);
  });

  test('a finger holding a light given to another loses its track', () => {
    // Right thumb holds the index's light, pinky its own; the ring's light is spare, the others far away.
    // Reordered from three lights: index, ring, pinky; the thumb has no light left
    const lightOf = [...identity.slice(0, 5), 6, -1, -1, -1, 9];
    const result = fixHandOrder({
      lights: lights.map((light, i) => (i === 5 || i === 7 ? lit({ x: 9, y: 9 }) : light)),
      lightOf,
      tracks: tracksFor(lightOf),
      t: 5,
      hands: HANDS_MODEL,
      hues: NO_HUES,
    });
    expect(result.lightOf.slice(5)).toEqual([-1, 6, -1, 8, 9]);
    expect(result.tracks[5]).toMatchObject({ seen: false, lost: true });
    expect(result.tracks[8]!.pos).toEqual({ x: lights[8]!.x, y: lights[8]!.y });
  });
});
