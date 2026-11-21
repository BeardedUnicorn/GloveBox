import { describe, expect, test } from 'vitest';
import { emptyPose } from '../../core/types';
import { DEFAULT_LED_COLORS, mulberry32, renderLeds, strobeLit } from './ledFrameRenderer';

const at = (frame: ReturnType<typeof renderLeds>, x: number, y: number) => {
  const i = (y * frame.width + x) * 4;
  return [...frame.data.slice(i, i + 4)];
};

describe('rendering glove lights', () => {
  test('a dim, noisy room, the same for the same seed and frame', () => {
    const a = renderLeds(emptyPose(), { width: 8, height: 4, ambient: 20, noise: 5 });
    const b = renderLeds(emptyPose(), { width: 8, height: 4, ambient: 20, noise: 5 });
    expect(a.data).toEqual(b.data);
    const pixel = at(a, 3, 2);
    expect(pixel[0]).toBeGreaterThanOrEqual(15);
    expect(pixel[0]).toBeLessThanOrEqual(25);
    expect(pixel[3]).toBe(255);
    expect(renderLeds(emptyPose(), { width: 8, height: 4, frameIndex: 1 }).data).not.toEqual(
      renderLeds(emptyPose(), { width: 8, height: 4 }).data
    );
  });

  test('a light is a near-white core with a glow of its color', () => {
    const pose = emptyPose();
    pose[0] = { x: 0, y: 0 };
    const frame = renderLeds(pose, { noise: 0, ambient: 0 });
    const core = at(frame, 160, 90);
    expect(Math.min(...core.slice(0, 3))).toBeGreaterThan(200);
    const [r, g, b] = at(frame, 163, 90);
    const [cr, cg, cb] = DEFAULT_LED_COLORS[0]!;
    // The glow keeps the light's own color balance
    expect(r! / cr).toBeCloseTo(g! / cg, 1);
    expect(r! / cr).toBeCloseTo(b! / cb, 1);
    expect(at(frame, 170, 90).slice(0, 3)).toEqual([0, 0, 0]);
  });

  test('lights off the edge are clipped; strobe frames and dropped lights are dark', () => {
    const pose = emptyPose();
    pose[3] = { x: 0.888, y: -0.5 };
    expect(() => renderLeds(pose)).not.toThrow();
    const lit = { x: 0, y: 0 };
    pose[3] = lit;
    expect(strobeLit(null, 7)).toBe(true);
    expect(strobeLit({ on: 2, off: 1 }, 2)).toBe(false);
    const dark = renderLeds(pose, { strobe: { on: 2, off: 1 }, frameIndex: 2, noise: 0, ambient: 0 });
    expect(at(dark, 160, 90).slice(0, 3)).toEqual([0, 0, 0]);
    const dropped = renderLeds(pose, { dropout: 1, noise: 0, ambient: 0 });
    expect(at(dropped, 160, 90).slice(0, 3)).toEqual([0, 0, 0]);
  });

  test('mulberry32 is repeatable and stays in [0, 1)', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const n = a();
      expect(n).toBe(b());
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});
