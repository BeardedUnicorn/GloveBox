import { describe, expect, test } from 'vitest';
import { type BlobOptions, DEFAULT_BLOB_OPTIONS, findBlobs, hueDistance, hueOf } from './components';

/**
 * A test image from rows of characters: '.' dark, 'W' white (255), 'r'/'g'/'b'
 * a saturated color at 200, 'd' a lit pixel of brightness 0.
 */
function picture(rows: string[]) {
  const width = rows[0]!.length;
  const height = rows.length;
  const colors: Record<string, [number, number, number]> = {
    '.': [0, 0, 0],
    W: [255, 255, 255],
    r: [200, 0, 40],
    g: [0, 200, 0],
    b: [0, 0, 200],
    d: [0, 0, 0],
  };
  const chars = rows.join('').split('');
  const rgba = new Uint8ClampedArray(chars.flatMap(c => [...colors[c]!, 255]));
  const v = new Uint8Array(chars.map(c => Math.max(...colors[c]!)));
  const mask = new Uint8Array(chars.map(c => (c === '.' ? 0 : 1)));
  return { rgba, v, mask, width, height };
}

const blobsOf = (rows: string[], options: Partial<BlobOptions> = {}) => {
  const { rgba, v, mask, width, height } = picture(rows);
  return findBlobs(mask, v, rgba, width, height, { ...DEFAULT_BLOB_OPTIONS, minArea: 1, mergeDist: 0, ...options });
};

describe('color', () => {
  test('hue and saturation', () => {
    expect(hueOf(10, 10, 10)).toEqual({ hue: 0, saturation: 0 });
    expect(hueOf(255, 0, 0).hue).toBe(0);
    expect(hueOf(255, 0, 51).hue).toBeCloseTo(1 - 0.2 / 6);
    expect(hueOf(255, 51, 0).hue).toBeCloseTo(0.2 / 6);
    expect(hueOf(0, 255, 0).hue).toBeCloseTo(1 / 3);
    expect(hueOf(0, 0, 255)).toEqual({ hue: 2 / 3, saturation: 1 });
  });

  test('hue distance goes the short way round', () => {
    expect(hueDistance(0.95, 0.05)).toBeCloseTo(0.1);
    expect(hueDistance(0.2, 0.5)).toBeCloseTo(0.3);
    expect(hueDistance(0, 0.5)).toBeCloseTo(0.5);
  });
});

describe('finding lights', () => {
  test('a light: its brightness-weighted center, size, box and color', () => {
    const [blob, ...rest] = blobsOf(['.....', '.rr..', '.rr..', '.....']);
    expect(rest).toEqual([]);
    expect(blob).toMatchObject({ x: 2, y: 2, area: 4, minX: 1, minY: 1, maxX: 2, maxY: 2 });
    expect(blob!.brightness).toBe(800);
    expect(hueDistance(blob!.hue!, hueOf(200, 0, 40).hue)).toBeLessThan(1e-9);
  });

  test('white lights have no hue; diagonal pixels are one light', () => {
    const [blob] = blobsOf(['W..', '.W.', '..W']);
    expect(blob).toMatchObject({ area: 3, hue: null, x: 1.5, y: 1.5 });
  });

  test('separate lights, brightest first', () => {
    const blobs = blobsOf(['gg...b', 'gg...b', '......']);
    expect(blobs.map(blob => blob.area)).toEqual([4, 2]);
  });

  test('patches that meet only further down are joined, whichever was labeled first', () => {
    // Labels 1, 2 and 3 on the top row; the rows below join 2 with 3, then 1 with both
    expect(blobsOf(['W.W.W', 'W..W.', '.WW..'])).toHaveLength(1);
    // A patch starting right of an earlier one: the earlier label wins, then a lower-labeled one joins
    expect(blobsOf(['..W', 'WW.'])).toHaveLength(1);
    // A patch reaching further left on a lower row
    const [blob] = blobsOf(['..WW', 'WWW.']);
    expect(blob).toMatchObject({ minX: 0, maxX: 3, area: 5 });
  });

  test('patches nearer than mergeDist are one light', () => {
    expect(blobsOf(['W.W'], { mergeDist: 3 })).toHaveLength(1);
    expect(blobsOf(['W.W'], { mergeDist: 1 })).toHaveLength(2);
  });

  test('too small, too big, and past maxBlobs are dropped', () => {
    expect(blobsOf(['W...WW'], { minArea: 2 }).map(blob => blob.area)).toEqual([2]);
    expect(blobsOf(['W...WW'], { maxArea: 1 }).map(blob => blob.area)).toEqual([1]);
    expect(blobsOf(['W.W.W.W'], { maxBlobs: 2 })).toHaveLength(2);
  });

  test('lit pixels with no brightness give no light', () => {
    expect(blobsOf(['dd..'])).toEqual([]);
  });

  test('a light whose colored pixels are too few has no hue', () => {
    const [blob] = blobsOf(['WWWWWWWWWWWWWWWWWWWWWWWWWWWWWb']);
    expect(blob!.hue).toBeNull();
  });
});
