import { describe, expect, test } from 'vitest';
import { brightness, hysteresis, MaxPool, percentile } from './threshold';

/** An RGBA image from rows of [r, g, b] pixels. */
const rgba = (pixels: [number, number, number][]) =>
  new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255]));

/** A brightness image from rows of digits ×10 ("09" → 0, 90). */
const image = (rows: string[]) => ({
  v: new Uint8Array(
    rows
      .join('')
      .split('')
      .map(d => Number(d) * 10)
  ),
  width: rows[0]!.length,
  height: rows.length,
});

const asRows = (mask: Uint8Array, width: number) =>
  Array.from({ length: mask.length / width }, (_, y) => [...mask.slice(y * width, (y + 1) * width)].join(''));

describe('brightness', () => {
  test("is each pixel's largest channel", () => {
    expect([
      ...brightness(
        rgba([
          [200, 10, 20],
          [100, 10, 150],
          [5, 90, 30],
          [5, 30, 90],
          [0, 0, 0],
        ])
      ),
    ]).toEqual([200, 150, 90, 90, 0]);
  });

  test('writes into a buffer it is given', () => {
    const out = new Uint8Array(1);
    expect(brightness(rgba([[1, 2, 3]]), out)).toBe(out);
    expect(out[0]).toBe(3);
  });
});

describe('hysteresis', () => {
  test('bright pixels seed lights, which grow through touching dim ones, diagonals too', () => {
    const { v, width, height } = image([
      '0000000', //
      '0590000',
      '0050500',
      '0000009',
      '5000000',
    ]);
    // high 90, low 50: the 5 diagonal to the 9 joins, and the 5 beside it; the far 5s don't
    const mask = hysteresis(v, width, height, 50, 90);
    expect(asRows(mask, width)).toEqual(['0000000', '0110000', '0010000', '0000001', '0000000']);
  });

  test('works to every edge, and reuses its buffer', () => {
    const { v, width, height } = image(['95', '59']);
    const out = new Uint8Array(4).fill(7);
    expect(hysteresis(v, width, height, 50, 90, out)).toBe(out);
    expect(asRows(out, width)).toEqual(['11', '11']);
  });
});

describe('pooling frames for strobe modes', () => {
  test('one frame is no pooling', () => {
    const pool = new MaxPool(1);
    const v = new Uint8Array([1, 2]);
    expect(pool.push(v)).toBe(v);
  });

  test('keeps the brightest of the last frames, forgetting older ones', () => {
    const pool = new MaxPool(2);
    expect([...pool.push(new Uint8Array([9, 0]))]).toEqual([9, 0]);
    expect([...pool.push(new Uint8Array([0, 5]))]).toEqual([9, 5]);
    expect([...pool.push(new Uint8Array([1, 1]))]).toEqual([1, 5]);
  });

  test('starts over when the frame size changes, or on reset', () => {
    const pool = new MaxPool(3);
    pool.push(new Uint8Array([9, 9]));
    expect([...pool.push(new Uint8Array([1, 2, 3]))]).toEqual([1, 2, 3]);
    pool.reset();
    expect([...pool.push(new Uint8Array([4, 0, 0]))]).toEqual([4, 0, 0]);
  });

  test('needs a whole number of frames, at least one', () => {
    expect(() => new MaxPool(0)).toThrow(/at least 1 frame/);
    expect(() => new MaxPool(1.5)).toThrow(/at least 1 frame/);
  });
});

describe('percentile', () => {
  test('the level a share of the pixels are at or below', () => {
    const v = new Uint8Array(1000).fill(10);
    v[999] = 200;
    expect(percentile(v, 0.5)).toBe(10);
    expect(percentile(v, 0.999)).toBe(10);
    expect(percentile(v, 1)).toBe(200);
    expect(percentile(new Uint8Array([255, 255]), 0.5)).toBe(255);
  });
});
