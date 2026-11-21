/**
 * Telling fingers apart by their hand's shape.
 *
 * When most of the slots are lost (at the start, after the hands crossed,
 * after the lights went out), frame-to-frame tracking has nothing to go on.
 * Instead (reacquire):
 *
 * 1. The lights are split into two hands by their x (two-means). The
 *    lesson, when there is one, says which group is which hand, so hands
 *    the lesson crosses stay right; otherwise the right hand is the group
 *    on the right (+x).
 * 2. Each hand's lights are matched to its fingers in the order whose shape
 *    best fits the calibrated hand (Procrustes, over all 120 orders of five),
 *    preferring an upright hand of the calibrated size, its calibrated
 *    colors, and the lesson's finger layout.
 *
 * The same shape keeps tracking honest frame to frame: it says where an
 * unseen finger should be (shapeAnchors), and puts back fingers that have
 * swapped lights (fixHandOrder).
 */

import { assign } from '../../core/hungarian';
import { applySimilarity, procrustes } from '../../core/procrustes';
import { FINGERS, type Finger, HANDS, type Hand, type Pose10, slotOf, type Vec2 } from '../../core/types';
import { centroid } from '../../core/vec';
import type { SlotTrack, StageLight } from './assign';
import { hueDistance } from './components';

/** One hand as calibrated: its five tips (thumb to pinky) around their center, in units of its span. */
export interface HandModel {
  template: readonly Vec2[];
  /** Thumb tip to pinky tip, stage units. */
  span: number;
}

export interface OrderWeights {
  /** Shape misfit, in span² units. */
  shape: number;
  /** A turned hand (radians²). */
  rotation: number;
  /** A hand bigger or smaller than calibrated (log-ratio²). */
  scale: number;
  /** Tips placed unlike the lesson's, around the hand's center (span² units). */
  prior: number;
  /** Colors unlike the calibrated ones (hue distance²). */
  hue: number;
}

export const DEFAULT_ORDER_WEIGHTS: OrderWeights = { shape: 40, rotation: 0.05, scale: 0.5, prior: 4, hue: 40 };

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Two groups by x (two-means), as indexes into `xs`, the group with the
 * smaller mean first. Values all in one place make one group.
 */
export function splitByX(xs: readonly number[]): [number[], number[]] {
  if (xs.length === 0) return [[], []];
  let low = Math.min(...xs);
  let high = Math.max(...xs);
  if (low === high) return [xs.map((_, i) => i), []];
  let groups: [number[], number[]] = [[], []];
  for (let round = 0; round < 20; round++) {
    const next: [number[], number[]] = [[], []];
    xs.forEach((x, i) => {
      next[Math.abs(x - low) <= Math.abs(x - high) ? 0 : 1].push(i);
    });
    const same = next[0].length === groups[0].length && next[0].every((i, k) => groups[0][k] === i);
    groups = next;
    if (same) break;
    const mean = (group: number[]) => group.reduce((sum, i) => sum + xs[i]!, 0) / group.length;
    low = mean(groups[0]);
    high = mean(groups[1]);
  }
  return groups;
}

/** The center of a hand's expected tips in the lesson, or null when it expects none. */
function priorCenter(prior: Pose10 | null, hand: Hand): Vec2 | null {
  if (prior === null) return null;
  const tips = FINGERS.map(f => prior[slotOf(hand, f)]).filter((p): p is Vec2 => p != null);
  return tips.length === 0 ? null : centroid(tips);
}

/**
 * The lights (indexes) of each hand: at most five each. Five lights or
 * fewer whose two groups are closer than `handSpan` are one hand.
 */
export function splitHands(
  lights: readonly StageLight[],
  prior: Pose10 | null,
  handSpan: number
): Record<Hand, number[]> {
  const centerOf = (group: number[]) => centroid(group.map(i => lights[i]!));
  let [lowX, highX] = splitByX(lights.map(light => light.x));
  if (lights.length <= 5 && highX.length > 0 && dist(centerOf(lowX), centerOf(highX)) < handSpan) {
    lowX = lights.map((_, i) => i);
    highX = [];
  }
  const pL = priorCenter(prior, 'L');
  const pR = priorCenter(prior, 'R');
  let hands: Record<Hand, number[]>;
  if (highX.length === 0) {
    // One group: the hand the lesson expects nearer, or the side of the stage it's on
    const c = centerOf(lowX);
    const right = pL && pR ? dist(c, pR) < dist(c, pL) : c.x >= 0;
    hands = right ? { L: [], R: lowX } : { L: lowX, R: [] };
  } else {
    let swapped = false;
    if (pL && pR) {
      const a = centerOf(lowX);
      const b = centerOf(highX);
      swapped = dist(a, pR) + dist(b, pL) < dist(a, pL) + dist(b, pR);
    }
    hands = swapped ? { L: highX, R: lowX } : { L: lowX, R: highX };
  }

  // A hand can't have more than five lights: give extras to the other hand, else drop the dimmest
  for (const hand of HANDS) {
    const other: Hand = hand === 'L' ? 'R' : 'L';
    while (hands[hand].length > 5) {
      if (hands[other].length < 5) {
        const target = hands[other].length > 0 ? centerOf(hands[other]) : { x: hand === 'L' ? 1 : -1, y: 0 };
        let best = 0;
        hands[hand].forEach((index, k) => {
          if (dist(lights[index]!, target) < dist(lights[hands[hand][best]!]!, target)) best = k;
        });
        hands[other] = [...hands[other], ...hands[hand].splice(best, 1)];
      } else {
        let dimmest = 0;
        hands[hand].forEach((index, k) => {
          if (lights[index]!.brightness < lights[hands[hand][dimmest]!]!.brightness) dimmest = k;
        });
        hands[hand].splice(dimmest, 1);
      }
    }
  }
  return hands;
}

/** Every way to give `count` points distinct fingers, as finger lists. */
export function fingerOrders(count: number): Finger[][] {
  const out: Finger[][] = [];
  const pick = (chosen: Finger[]) => {
    if (chosen.length === count) {
      out.push([...chosen]);
      return;
    }
    for (const f of FINGERS) {
      if (chosen.includes(f)) continue;
      chosen.push(f);
      pick(chosen);
      chosen.pop();
    }
  };
  pick([]);
  return out;
}

const ORDERS = [0, 1, 2, 3, 4, 5].map(fingerOrders);

function colorCost(point: StageLight, hue: number | null, weights: OrderWeights): number {
  return hue === null || point.hue === null ? 0 : weights.hue * hueDistance(hue, point.hue) ** 2;
}

/** A tip unlike the lesson's, each compared around its own hand's center (so a hand behind the beat isn't blamed). */
function priorCost(
  point: Vec2,
  center: Vec2,
  tip: Vec2 | null,
  priorMid: Vec2 | null,
  span: number,
  weights: OrderWeights
): number {
  if (tip === null || priorMid === null) return 0;
  const dx = point.x - center.x - (tip.x - priorMid.x);
  const dy = point.y - center.y - (tip.y - priorMid.y);
  return (weights.prior * (dx * dx + dy * dy)) / span ** 2;
}

/** The center of the lesson's tips for a hand, or null. */
function midOf(priorTips: readonly (Vec2 | null)[] | null): Vec2 | null {
  const known = (priorTips ?? []).filter((p): p is Vec2 => p != null);
  return known.length > 0 ? centroid(known) : null;
}

/**
 * What giving `points[i]` to finger `order[i]` costs (lower fits better):
 * the shape's misfit against the calibrated hand, a turned or resized hand,
 * and colors or a layout unlike the calibration's or the lesson's. For
 * three points or more.
 */
export function orderCost(
  points: readonly StageLight[],
  order: readonly Finger[],
  model: HandModel,
  priorTips: readonly (Vec2 | null)[] | null,
  hues: readonly (number | null)[],
  weights: OrderWeights = DEFAULT_ORDER_WEIGHTS
): number {
  const fit = procrustes(
    order.map(f => model.template[f]!),
    points
  );
  let cost =
    (weights.shape * fit.residual) / model.span ** 2 +
    weights.rotation * fit.rotation ** 2 +
    weights.scale * Math.log(fit.scale / model.span) ** 2;
  const center = centroid(points);
  const priorMid = midOf(priorTips);
  order.forEach((f, i) => {
    const point = points[i]!;
    cost += priorCost(point, center, priorTips?.[f] ?? null, priorMid, model.span, weights);
    cost += colorCost(point, hues[f]!, weights);
  });
  return cost;
}

/** The cheapest order for three to five points (orderCost), over every way to give them distinct fingers. */
export function bestOrder(
  points: readonly StageLight[],
  model: HandModel,
  priorTips: readonly (Vec2 | null)[] | null,
  hues: readonly (number | null)[],
  weights: OrderWeights = DEFAULT_ORDER_WEIGHTS
): { order: Finger[]; cost: number } {
  let best: { order: Finger[]; cost: number } | null = null;
  for (const order of ORDERS[points.length]!) {
    const cost = orderCost(points, order, model, priorTips, hues, weights);
    if (best === null || cost < best.cost) best = { order, cost };
  }
  return best!;
}

/**
 * Which point is which finger, for one hand: by finger (thumb first), an
 * index into `points` (at most five) or -1. `priorTips` are the lesson's
 * tips for this hand (or null), `hues` the calibrated hue of each finger.
 */
export function orderHand(
  points: readonly StageLight[],
  model: HandModel,
  priorTips: readonly (Vec2 | null)[] | null,
  hues: readonly (number | null)[],
  weights: OrderWeights = DEFAULT_ORDER_WEIGHTS
): number[] {
  const byFinger = [-1, -1, -1, -1, -1];
  if (points.length === 0) return byFinger;
  if (points.length <= 2) {
    // Too few points for a shape: each to the finger it sits nearest, the template placed on them
    const center = centroid(points);
    const priorMid = midOf(priorTips);
    const cost = points.map(point =>
      FINGERS.map(f => {
        const tip = model.template[f]!;
        const at = { x: center.x + tip.x * model.span, y: center.y + tip.y * model.span };
        return (
          dist(point, at) ** 2 / model.span ** 2 +
          priorCost(point, center, priorTips?.[f] ?? null, priorMid, model.span, weights) +
          colorCost(point, hues[f]!, weights)
        );
      })
    );
    assign(cost).forEach((finger, index) => {
      byFinger[finger] = index;
    });
    return byFinger;
  }
  bestOrder(points, model, priorTips, hues, weights).order.forEach((f, index) => {
    byFinger[f] = index;
  });
  return byFinger;
}

export interface ReacquireInput {
  lights: readonly StageLight[];
  hands: Record<Hand, HandModel>;
  /** By slot. */
  hues: readonly (number | null)[];
  prior: Pose10 | null;
  weights?: OrderWeights;
}

/** By slot: the light it is, or -1. */
export function reacquire({ lights, hands, hues, prior, weights }: ReacquireInput): number[] {
  const lightOf = new Array<number>(10).fill(-1);
  const split = splitHands(lights, prior, Math.max(hands.L.span, hands.R.span));
  for (const hand of HANDS) {
    const indexes = split[hand];
    const priorTips = prior === null ? null : FINGERS.map(f => prior[slotOf(hand, f)] ?? null);
    const handHues = FINGERS.map(f => hues[slotOf(hand, f)] ?? null);
    const byFinger = orderHand(
      indexes.map(i => lights[i]!),
      hands[hand],
      priorTips,
      handHues,
      weights
    );
    byFinger.forEach((point, f) => {
      if (point >= 0) lightOf[slotOf(hand, f as Finger)] = indexes[point]!;
    });
  }
  return lightOf;
}

/**
 * Where each untracked finger should be, from its own hand: the calibrated
 * hand fit (Procrustes) to the hand's fingers seen this frame, when at
 * least three were. By slot; null where it can't be told or is tracked.
 */
export function shapeAnchors(tracks: readonly (SlotTrack | null)[], hands: Record<Hand, HandModel>): Pose10 {
  const anchors: Pose10 = new Array(10).fill(null);
  for (const hand of HANDS) {
    const seen = FINGERS.filter(f => tracks[slotOf(hand, f)]?.seen === true);
    if (seen.length < 3 || seen.length === 5) continue;
    const { template } = hands[hand];
    const fit = procrustes(
      seen.map(f => template[f]!),
      seen.map(f => tracks[slotOf(hand, f)]!.pos)
    );
    for (const f of FINGERS) {
      if (!seen.includes(f)) anchors[slotOf(hand, f)] = applySimilarity(template[f]!, fit);
    }
  }
  return anchors;
}

export interface OrderCheck {
  /** A whole hand is reordered when the best order costs at most this share of the current one… */
  ratio: number;
  /** …and the current order costs at least this: a hand that fits well is left alone. */
  minCost: number;
  /** Spans: how far from a hand's center a spare light can still be one of its fingers. */
  reach: number;
}

export const DEFAULT_ORDER_CHECK: OrderCheck = { ratio: 0.35, minCost: 0.5, reach: 0.9 };

export interface HandOrderInput {
  lights: readonly StageLight[];
  /** By slot: the light it holds this frame, or -1. */
  lightOf: readonly number[];
  tracks: readonly (SlotTrack | null)[];
  t: number;
  hands: Record<Hand, HandModel>;
  hues: readonly (number | null)[];
  check?: OrderCheck;
  weights?: OrderWeights;
}

/**
 * Puts each hand's fingers back in the order its shape says. Fingers can
 * end up holding each other's lights (a light hidden for a frame and taken
 * by its neighbor's track, or a hand found again from too few lights) and
 * keep them; and a finger that's never been found has no track to be found
 * by.
 *
 * - A hand short of fingers, holding at least two lights, with spare lights
 *   near it, is ordered again from its lights and the nearest spares.
 * - A hand holding all five is reordered when another order fits the
 *   calibrated hand far better.
 *
 * Returns new tracks and lights (the given ones are left as they were).
 */
export function fixHandOrder({
  lights,
  lightOf,
  tracks,
  t,
  hands,
  hues,
  check = DEFAULT_ORDER_CHECK,
  weights = DEFAULT_ORDER_WEIGHTS,
}: HandOrderInput): { tracks: (SlotTrack | null)[]; lightOf: number[] } {
  const outTracks = [...tracks];
  const outLightOf = [...lightOf];
  const used = new Set(lightOf.filter(index => index >= 0));
  for (const hand of HANDS) {
    const slots = FINGERS.map(f => slotOf(hand, f));
    const model = hands[hand];
    const handHues = slots.map(slot => hues[slot] ?? null);
    const heldBy = slots.map(slot => outLightOf[slot]!);
    const held = heldBy.filter(index => index >= 0);
    let candidates: number[];
    if (held.length === 5) {
      const points = held.map(index => lights[index]!);
      const current = orderCost(points, [0, 1, 2, 3, 4], model, null, handHues, weights);
      if (current < check.minCost) continue;
      const best = bestOrder(points, model, null, handHues, weights);
      if (best.cost > check.ratio * current) continue;
      candidates = held;
    } else {
      if (held.length < 2) continue;
      const center = centroid(held.map(index => lights[index]!));
      const spare = lights
        .map((light, index) => ({ index, d: dist(light, center) }))
        .filter(({ index, d }) => !used.has(index) && d <= check.reach * model.span)
        .sort((a, b) => a.d - b.d)
        .slice(0, 5 - held.length)
        .map(({ index }) => index);
      if (spare.length === 0) continue;
      candidates = [...held, ...spare];
    }
    const byFinger = orderHand(
      candidates.map(index => lights[index]!),
      model,
      null,
      handHues,
      weights
    );
    slots.forEach((slot, f) => {
      const point = byFinger[f]!;
      const before = heldBy[f]!;
      if (point < 0) {
        // Its light went to another finger: lost until it's found again
        if (before >= 0) outTracks[slot] = { ...outTracks[slot]!, seen: false, lost: true };
        outLightOf[slot] = -1;
        return;
      }
      const index = candidates[point]!;
      used.add(index);
      outLightOf[slot] = index;
      if (index === before) return;
      const light = lights[index]!;
      outTracks[slot] = { pos: { x: light.x, y: light.y }, vel: { x: 0, y: 0 }, lastSeen: t, seen: true, lost: false };
    });
  }
  return { tracks: outTracks, lightOf: outLightOf };
}
