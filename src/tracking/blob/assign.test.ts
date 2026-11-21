import { describe, expect, test } from 'vitest';
import { emptyPose, type Pose10 } from '../../core/types';
import {
  type AssignContext,
  confidenceOf,
  DEFAULT_ASSIGN_PARAMS,
  predict,
  type SlotTrack,
  type StageLight,
  stepTracks,
  tracksFrom,
} from './assign';

const light = (x: number, y: number, hue: number | null = null): StageLight => ({ x, y, hue, brightness: 100 });
const track = (x: number, y: number, over: Partial<SlotTrack> = {}): SlotTrack => ({
  pos: { x, y },
  vel: { x: 0, y: 0 },
  lastSeen: 0,
  seen: true,
  lost: false,
  ...over,
});
const none = (): (SlotTrack | null)[] => new Array(10).fill(null);
const ctx = (over: Partial<AssignContext> = {}): AssignContext => ({
  hues: new Array(10).fill(null),
  prior: null,
  params: DEFAULT_ASSIGN_PARAMS,
  ...over,
});

describe('prediction and confidence', () => {
  test('a track moves on by its velocity, for at most maxPredictMs', () => {
    const t = track(0, 0, { vel: { x: 0.001, y: -0.001 }, lastSeen: 100 });
    expect(predict(t, 150)).toEqual({ x: 0.05, y: -0.05 });
    expect(predict(t, 10_000)).toEqual({ x: 0.12, y: -0.12 });
    expect(predict(t, 50)).toEqual({ x: 0, y: 0 });
  });

  test('a seen track is sure; an unseen one fades out over lostMs', () => {
    expect(confidenceOf(track(0, 0), 999)).toBe(1);
    expect(confidenceOf(track(0, 0, { seen: false }), 150)).toBeCloseTo(0.5);
    expect(confidenceOf(track(0, 0, { seen: false }), 1000)).toBe(0);
  });
});

describe('matching tracks to lights', () => {
  test('each track takes the light nearest its prediction', () => {
    const tracks = none();
    tracks[0] = track(0, 0, { vel: { x: 0.0005, y: 0 } });
    tracks[1] = track(0.1, 0);
    const { tracks: next, lightOf } = stepTracks(tracks, [light(0.1, 0.005), light(0.017, 0)], 33, ctx());
    expect(lightOf.slice(0, 2)).toEqual([1, 0]);
    expect(next[0]).toMatchObject({ pos: { x: 0.017, y: 0 }, lastSeen: 33, seen: true });
    // Its velocity moved toward the measured one
    expect(next[0]!.vel.x).toBeCloseTo(0.0005 + 0.6 * (0.017 / 33 - 0.0005));
  });

  test('a light beyond the gate is never taken; the track coasts, then is lost', () => {
    const tracks = none();
    tracks[0] = track(0, 0);
    const first = stepTracks(tracks, [light(0.5, 0)], 100, ctx(), false);
    expect(first.lightOf[0]).toBe(-1);
    expect(first.tracks[0]).toMatchObject({ seen: false, lost: false });
    const later = stepTracks(first.tracks, [], 400, ctx(), false);
    expect(later.tracks[0]).toMatchObject({ seen: false, lost: true });
  });

  test('a slot never found stays empty', () => {
    expect(stepTracks(none(), [], 0, ctx()).tracks).toEqual(none());
  });

  test('a light seen twice at the same time keeps its velocity', () => {
    const tracks = none();
    tracks[0] = track(0, 0, { vel: { x: 0.01, y: 0 }, lastSeen: 50 });
    expect(stepTracks(tracks, [light(0.005, 0)], 50, ctx()).tracks[0]!.vel).toEqual({ x: 0.01, y: 0 });
  });

  test('colors steer the match when the calibration has them, but cost no more than hueCap', () => {
    const tracks = none();
    tracks[0] = track(0, 0);
    tracks[1] = track(0.001, 0);
    const hues = new Array(10).fill(null);
    hues[0] = 0;
    hues[1] = 0.5;
    // Slot 0 is red, slot 1 cyan: each takes its own color though slot 1 is nearer the red light
    const lights = [light(0.002, 0, 0.5), light(0.0005, 0, 0)];
    expect(stepTracks(tracks, lights, 33, ctx({ hues })).lightOf.slice(0, 2)).toEqual([1, 0]);
    // A light without a hue is matched by place alone
    expect(stepTracks(tracks, [light(0.0005, 0), light(0.002, 0)], 33, ctx({ hues })).lightOf.slice(0, 2)).toEqual([
      0, 1,
    ]);
  });

  test("the lesson's expected position nudges the match", () => {
    const tracks = none();
    tracks[0] = track(0, 0);
    const prior: Pose10 = emptyPose();
    prior[0] = { x: 0.03, y: 0 };
    const lights = [light(-0.02, 0), light(0.021, 0)];
    expect(stepTracks(tracks, lights, 33, ctx()).lightOf[0]).toBe(0);
    expect(
      stepTracks(tracks, lights, 33, ctx({ prior, params: { ...DEFAULT_ASSIGN_PARAMS, priorWeight: 2 } })).lightOf[0]
    ).toBe(1);
    // A prior without this slot changes nothing
    expect(stepTracks(tracks, lights, 33, ctx({ prior: emptyPose() })).lightOf[0]).toBe(0);
  });

  test('lost slots are found again from the lights left: near their anchor, the prior, or where they were', () => {
    const tracks = none();
    tracks[0] = track(0, 0);
    tracks[1] = track(0.3, 0, { lost: true });
    tracks[2] = track(-0.3, 0, { lost: true });
    const anchors = emptyPose();
    anchors[3] = { x: 0.6, y: 0.1 };
    const prior = emptyPose();
    prior[2] = { x: -0.45, y: 0 };
    const lights = [light(0.01, 0), light(0.32, 0), light(-0.44, 0), light(0.61, 0.1), light(0.9, 0.4)];
    const { tracks: next, lightOf } = stepTracks(tracks, lights, 33, ctx({ anchors, prior }));
    expect(lightOf.slice(0, 4)).toEqual([0, 1, 2, 3]);
    // A found-again track starts afresh
    expect(next[1]).toEqual({ pos: { x: 0.32, y: 0 }, vel: { x: 0, y: 0 }, lastSeen: 33, seen: true, lost: false });
    expect(next[3]!.pos).toEqual({ x: 0.61, y: 0.1 });
    // A light too far from any anchor stays unmatched
    expect(lightOf).not.toContain(4);
  });

  test('without refindLost, lost slots stay lost', () => {
    const tracks = none();
    tracks[1] = track(0.3, 0, { lost: true });
    expect(stepTracks(tracks, [light(0.3, 0)], 33, ctx(), false).lightOf[1]).toBe(-1);
  });
});

describe('tracks from a reacquisition', () => {
  test('placed slots start afresh; the rest are lost or stay empty', () => {
    const previous = none();
    previous[1] = track(0.5, 0.5);
    const lightOf = new Array(10).fill(-1);
    lightOf[0] = 0;
    const next = tracksFrom([light(0.1, 0.2)], lightOf, 99, previous);
    expect(next[0]).toEqual({ pos: { x: 0.1, y: 0.2 }, vel: { x: 0, y: 0 }, lastSeen: 99, seen: true, lost: false });
    expect(next[1]).toMatchObject({ pos: { x: 0.5, y: 0.5 }, seen: false, lost: true });
    expect(next[2]).toBeNull();
  });
});
