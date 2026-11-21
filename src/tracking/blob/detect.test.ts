import { describe, expect, test } from 'vitest';
import { emptyPose } from '../../core/types';
import { renderLeds } from '../synthetic/ledFrameRenderer';
import { LightDetector } from './detect';

describe('detecting lights', () => {
  const pose = emptyPose();
  pose[0] = { x: 0.5, y: -0.2 };
  pose[6] = { x: -0.3, y: 0.1 };

  test('finds each light in stage space, with its color and size', () => {
    const lights = new LightDetector({ low: 90, high: 150 }).detect(renderLeds(pose));
    expect(lights).toHaveLength(2);
    const near = (p: { x: number; y: number }) => lights.find(l => Math.hypot(l.x - p.x, l.y - p.y) < 0.01);
    expect(near(pose[0]!)?.hue).not.toBeNull();
    expect(near(pose[6]!)?.area).toBeGreaterThan(5);
  });

  test('follows a change of frame size, and pools strobe frames until reset', () => {
    const detector = new LightDetector({ low: 90, high: 150 }, undefined, 2);
    expect(detector.detect(renderLeds(pose, { width: 160, height: 90 }))).toHaveLength(2);
    expect(detector.detect(renderLeds(pose))).toHaveLength(2);
    // Lights off: the pool still holds the last frame's lights
    expect(detector.detect(renderLeds(pose, { strobe: { on: 1, off: 1 }, frameIndex: 1 }))).toHaveLength(2);
    detector.reset();
    expect(detector.detect(renderLeds(pose, { strobe: { on: 1, off: 1 }, frameIndex: 1 }))).toHaveLength(0);
  });
});
