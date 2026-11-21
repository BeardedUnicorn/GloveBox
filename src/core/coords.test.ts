import { describe, expect, test } from 'vitest';
import { emptyFrame } from '../tracking/types';
import {
  applyFit,
  aspectOf,
  clampFit,
  fitFor,
  frameRect,
  IDENTITY_FIT,
  rawToStage,
  removeFit,
  stageBounds,
  stageLength,
  stageToRaw,
  stageToScreen,
} from './coords';

const ASPECT = 16 / 9;

describe('stage space', () => {
  test("the camera's left is the performer's right", () => {
    expect(rawToStage(0.5, 0.5, ASPECT)).toEqual({ x: 0, y: 0 });
    // A hand at the left of the unmirrored frame is the performer's right: +x
    expect(rawToStage(0, 0, ASPECT)).toEqual({ x: ASPECT / 2, y: -0.5 });
    expect(rawToStage(1, 1, ASPECT)).toEqual({ x: -ASPECT / 2, y: 0.5 });
  });

  test('converts back to the raw frame', () => {
    const p = rawToStage(0.2, 0.7, ASPECT);
    const raw = stageToRaw(p, ASPECT);
    expect(raw.u).toBeCloseTo(0.2);
    expect(raw.v).toBeCloseTo(0.7);
  });

  test('is one frame-height tall and an aspect wide', () => {
    expect(aspectOf({ width: 1280, height: 720 })).toBeCloseTo(ASPECT);
    expect(stageBounds(2)).toEqual({ minX: -1, maxX: 1, minY: -0.5, maxY: 0.5 });
  });
});

describe('drawing the stage', () => {
  test('cover fills the box, cropping the frame', () => {
    expect(frameRect({ width: 1280, height: 720 }, { width: 800, height: 800 })).toEqual({
      left: -(1422.2222222222222 - 800) / 2,
      top: 0,
      width: 1422.2222222222222,
      height: 800,
    });
  });

  test('contain fits the frame inside the box', () => {
    expect(frameRect({ width: 1280, height: 720 }, { width: 640, height: 640 }, 'contain')).toEqual({
      left: 0,
      top: 140,
      width: 640,
      height: 360,
    });
  });

  test('performer view is a mirror; receiver view is what the camera sees', () => {
    const rect = { left: 0, top: 0, width: 1600, height: 900 };
    const right = { x: 0.5, y: -0.25 };
    expect(stageToScreen(right, rect, 'performer')).toEqual({ x: 800 + 450, y: 450 - 225 });
    expect(stageToScreen(right, rect, 'receiver')).toEqual({ x: 800 - 450, y: 450 - 225 });
    expect(stageLength(0.1, rect)).toBeCloseTo(90);
  });
});

describe('fitting a lesson to the performer', () => {
  test('moves and scales lesson points, and back', () => {
    const fit = fitFor({ x: 0.1, y: -0.05 }, 0.3, 0.15);
    expect(fit.scale).toBe(2);
    const p = applyFit({ x: 0.1, y: 0.1 }, fit);
    expect(p.x).toBeCloseTo(0.3);
    expect(p.y).toBeCloseTo(0.15);
    const back = removeFit(p, fit);
    expect(back.x).toBeCloseTo(0.1);
    expect(back.y).toBeCloseTo(0.1);
    expect(applyFit({ x: 0.2, y: 0.3 }, IDENTITY_FIT)).toEqual({ x: 0.2, y: 0.3 });
  });

  const bounds = { minX: -0.3, maxX: 0.3, minY: -0.2, maxY: 0.2 };

  test('a fit that already keeps the lesson on screen stays as it is', () => {
    expect(clampFit({ center: { x: 0.1, y: 0 }, scale: 1 }, bounds, ASPECT)).toEqual({
      center: { x: 0.1, y: 0 },
      scale: 1,
    });
  });

  test('a lesson too big for the screen shrinks to fit', () => {
    const fit = clampFit({ center: { x: 0, y: 0 }, scale: 5 }, bounds, ASPECT);
    expect(fit.scale).toBeCloseTo((1 - 0.08) / 0.4);
  });

  test('a lesson off an edge is moved back in, on each side', () => {
    const left = clampFit({ center: { x: -0.8, y: 0 }, scale: 1 }, bounds, ASPECT);
    expect(left.center.x + bounds.minX).toBeCloseTo(-ASPECT / 2 + 0.04);
    const bottom = clampFit({ center: { x: 0, y: 0.45 }, scale: 1 }, bounds, ASPECT);
    expect(bottom.center.y + bounds.maxY).toBeCloseTo(0.5 - 0.04);
  });
});

describe('tracker frames', () => {
  test('an empty frame has ten missing tips', () => {
    expect(emptyFrame(5)).toEqual({ t: 5, tips: new Array(10).fill(null), handScale: {} });
  });
});
