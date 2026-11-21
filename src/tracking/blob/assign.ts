/**
 * Which light is which finger, frame to frame. Each of the ten slots keeps
 * a track: where its light was, how fast it was moving, when it was last
 * seen. Each frame, the Hungarian algorithm matches the tracks' predicted
 * positions to the lights found, cheapest overall. A slot can be left
 * unmatched (its light is hidden or strobing dark); it then coasts on its
 * last motion, less and less sure, and after `lostMs` it's lost.
 *
 * Lost slots are matched again from the lights left over, near where the
 * lesson expects them, or else near where they were last seen. When many
 * are lost at once, reacquire.ts works the whole hand out from its shape.
 */

import { assign } from '../../core/hungarian';
import type { Pose10, Slot, Vec2 } from '../../core/types';
import { hueDistance } from './components';

/** A light in stage space, as assignment sees it. */
export interface StageLight extends Vec2 {
  hue: number | null;
  brightness: number;
}

export interface SlotTrack {
  /** Where its light was last seen. */
  pos: Vec2;
  /** Stage units per ms. */
  vel: Vec2;
  /** When its light was last seen, ms. */
  lastSeen: number;
  /** Its light was found in the latest frame. */
  seen: boolean;
  /** Unseen for longer than lostMs: not tracked until it's found again. */
  lost: boolean;
}

export interface AssignParams {
  /** Stage units: the typical distance a light moves between frames. Costs are in units of σ². */
  sigma: number;
  /** Stage units: a light farther than this from a track's prediction can't be its light. */
  gate: number;
  /** The cost of leaving a slot unmatched this frame. */
  missCost: number;
  /** Weight of a hue difference (0–0.5), when the calibration has distinct hues… */
  hueWeight: number;
  /** …up to this much, below missCost: a light of the wrong color can still be taken when nothing else fits (a color-changing mode). */
  hueCap: number;
  /** Weight of the distance from the lesson's expected position (in σ²). Small: the lesson only guides. */
  priorWeight: number;
  /** A slot unseen this long is lost. */
  lostMs: number;
  /** How much of each frame's measured velocity is taken (0–1); the rest is the old velocity. */
  velocitySmoothing: number;
  /** A coasting track predicts its motion for at most this long. */
  maxPredictMs: number;
  /** Stage units: how far from its anchor (expected or last position) a lost slot may be found again. */
  reacquireGate: number;
}

export const DEFAULT_ASSIGN_PARAMS: AssignParams = {
  sigma: 0.03,
  gate: 0.12,
  missCost: 9,
  hueWeight: 600,
  hueCap: 6,
  priorWeight: 0.05,
  lostMs: 300,
  velocitySmoothing: 0.6,
  maxPredictMs: 120,
  reacquireGate: 0.2,
};

/** Too costly to choose, but finite, so the Hungarian algorithm's arithmetic stays exact. */
const NEVER = 1e9;

/** Where a track's light should be at `t`: its last position moved on by its velocity (for at most maxPredictMs). */
export function predict(track: SlotTrack, t: number, params: AssignParams = DEFAULT_ASSIGN_PARAMS): Vec2 {
  const dt = Math.min(Math.max(t - track.lastSeen, 0), params.maxPredictMs);
  return { x: track.pos.x + track.vel.x * dt, y: track.pos.y + track.vel.y * dt };
}

/** How sure a track is at `t`: 1 when seen, falling to 0 as it goes unseen for lostMs. */
export function confidenceOf(track: SlotTrack, t: number, params: AssignParams = DEFAULT_ASSIGN_PARAMS): number {
  if (track.seen) return 1;
  return Math.max(0, 1 - (t - track.lastSeen) / params.lostMs);
}

export interface AssignContext {
  /** Each slot's calibrated hue, or null (assignment ignores hue for that slot). */
  hues: readonly (number | null)[];
  /** Where the lesson expects each light now, or null. */
  prior: Pose10 | null;
  /** Where each untracked slot's light should be, worked out from its hand's tracked fingers (reacquire.ts shapeAnchors). */
  anchors?: Pose10;
  params: AssignParams;
}

function hueCost(slotHue: number | null, light: StageLight, params: AssignParams): number {
  if (slotHue === null || light.hue === null) return 0;
  return Math.min(params.hueCap, params.hueWeight * hueDistance(slotHue, light.hue) ** 2);
}

function priorCost(slot: Slot, light: StageLight, ctx: AssignContext): number {
  const expected = ctx.prior?.[slot];
  if (!expected) return 0;
  const { sigma, priorWeight } = ctx.params;
  return (priorWeight * ((expected.x - light.x) ** 2 + (expected.y - light.y) ** 2)) / sigma ** 2;
}

/**
 * Solves one matching: `rows` slots against `lights`, each slot also able
 * to go unmatched (its own dummy column, at missCost). Returns, by row, the
 * light index or -1.
 */
function match(
  rows: readonly Slot[],
  lights: readonly StageLight[],
  cost: (slot: Slot, light: StageLight) => number,
  missCost: number
): number[] {
  if (rows.length === 0) return [];
  const matrix = rows.map((slot, row) => [
    ...lights.map(light => cost(slot, light)),
    ...rows.map((_, dummy) => (dummy === row ? missCost : NEVER)),
  ]);
  return assign(matrix).map(col => (col < lights.length ? col : -1));
}

export interface StepResult {
  tracks: (SlotTrack | null)[];
  /** By slot: the light it was matched to this frame, or -1. */
  lightOf: number[];
}

/**
 * Advances the ten tracks to the frame at `t` with `lights`: tracked slots
 * are matched near their predictions, then (with `refindLost`) lost ones
 * from what's left. Returns new tracks (the given ones are left as they were).
 */
export function stepTracks(
  tracks: readonly (SlotTrack | null)[],
  lights: readonly StageLight[],
  t: number,
  ctx: AssignContext,
  refindLost = true
): StepResult {
  const { params } = ctx;
  const lightOf = tracks.map(() => -1);
  const taken = new Set<number>();
  const slots = tracks.map((_, slot) => slot as Slot);

  // Tracked slots, near where they're heading
  const active = slots.filter(slot => tracks[slot] !== null && !tracks[slot]!.lost);
  const predicted = new Map(active.map(slot => [slot, predict(tracks[slot]!, t, params)]));
  const near = match(
    active,
    lights,
    (slot, light) => {
      const p = predicted.get(slot)!;
      const d2 = (p.x - light.x) ** 2 + (p.y - light.y) ** 2;
      if (d2 > params.gate ** 2) return NEVER;
      return d2 / params.sigma ** 2 + hueCost(ctx.hues[slot]!, light, params) + priorCost(slot, light, ctx);
    },
    params.missCost
  );
  near.forEach((light, row) => {
    if (light < 0) return;
    lightOf[active[row]!] = light;
    taken.add(light);
  });

  // Lost (or never found) slots, from the lights left: near where their hand's shape puts them, where the
  // lesson expects them, or where they were
  const anchors = new Map<Slot, Vec2>();
  for (const slot of refindLost ? slots : []) {
    if (active.includes(slot)) continue;
    const anchor = ctx.anchors?.[slot] ?? ctx.prior?.[slot] ?? tracks[slot]?.pos;
    if (anchor) anchors.set(slot, anchor);
  }
  const free = lights.map((_, index) => index).filter(index => !taken.has(index));
  const lost = [...anchors.keys()];
  const found = match(
    lost,
    free.map(index => lights[index]!),
    (slot, light) => {
      const a = anchors.get(slot)!;
      const d2 = (a.x - light.x) ** 2 + (a.y - light.y) ** 2;
      if (d2 > params.reacquireGate ** 2) return NEVER;
      return d2 / params.sigma ** 2 / 4 + hueCost(ctx.hues[slot]!, light, params);
    },
    params.missCost
  );
  found.forEach((light, row) => {
    if (light >= 0) lightOf[lost[row]!] = free[light]!;
  });

  const next = tracks.map((track, slot): SlotTrack | null => {
    const index = lightOf[slot]!;
    if (index >= 0) {
      const light = lights[index]!;
      const pos = { x: light.x, y: light.y };
      if (track === null || track.lost) return { pos, vel: { x: 0, y: 0 }, lastSeen: t, seen: true, lost: false };
      const dt = t - track.lastSeen;
      const k = params.velocitySmoothing;
      const measured = dt > 0 ? { x: (pos.x - track.pos.x) / dt, y: (pos.y - track.pos.y) / dt } : track.vel;
      return {
        pos,
        vel: { x: track.vel.x + k * (measured.x - track.vel.x), y: track.vel.y + k * (measured.y - track.vel.y) },
        lastSeen: t,
        seen: true,
        lost: false,
      };
    }
    if (track === null) return null;
    return { ...track, seen: false, lost: track.lost || t - track.lastSeen > params.lostMs };
  });
  return { tracks: next, lightOf };
}

/** Tracks for slots placed by a fresh reacquisition: `lightOf[slot]` is a light index or -1. */
export function tracksFrom(
  lights: readonly StageLight[],
  lightOf: readonly number[],
  t: number,
  previous: readonly (SlotTrack | null)[]
): (SlotTrack | null)[] {
  return lightOf.map((index, slot) => {
    if (index >= 0) {
      const light = lights[index]!;
      return { pos: { x: light.x, y: light.y }, vel: { x: 0, y: 0 }, lastSeen: t, seen: true, lost: false };
    }
    const track = previous[slot] ?? null;
    return track === null ? null : { ...track, seen: false, lost: true };
  });
}
