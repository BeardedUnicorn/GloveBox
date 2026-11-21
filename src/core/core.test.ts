import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { assign, totalCost } from './hungarian';
import { DEFAULT_ONE_EURO, OneEuroFilter, OneEuroFilter2D, smoothingFactor } from './oneEuro';
import { emptyPose, fingerOf, handOf, SLOTS, slotName, slotOf } from './types';
import { add, centroid, clamp, distance, length, lerp, mod, rotate, scale, sub, vec } from './vec';

describe('slots', () => {
  test('each slot is one hand and finger, both ways', () => {
    for (const slot of SLOTS) expect(slotOf(handOf(slot), fingerOf(slot))).toBe(slot);
    expect(slotOf('L', 0)).toBe(0);
    expect(slotOf('R', 4)).toBe(9);
  });

  test('have names a person reads', () => {
    expect(slotName(1)).toBe('left index');
    expect(slotName(9)).toBe('right pinky');
  });

  test('an empty pose has ten empty slots', () => {
    expect(emptyPose()).toEqual(new Array(10).fill(null));
  });
});

describe('vectors', () => {
  test('arithmetic', () => {
    expect(add(vec(1, 2), vec(3, 4))).toEqual(vec(4, 6));
    expect(sub(vec(1, 2), vec(3, 4))).toEqual(vec(-2, -2));
    expect(scale(vec(1, -2), 3)).toEqual(vec(3, -6));
    expect(length(vec(3, 4))).toBe(5);
    expect(distance(vec(1, 1), vec(4, 5))).toBe(5);
    expect(lerp(vec(0, 0), vec(10, -10), 0.25)).toEqual(vec(2.5, -2.5));
  });

  test('a quarter turn takes +x to +y', () => {
    const turned = rotate(vec(1, 0), Math.PI / 2);
    expect(turned.x).toBeCloseTo(0);
    expect(turned.y).toBeCloseTo(1);
  });

  test('the centroid of nothing is the origin', () => {
    expect(centroid([])).toEqual(vec(0, 0));
    expect(centroid([vec(0, 0), vec(2, 4)])).toEqual(vec(1, 2));
  });

  test('clamp and a modulo that never goes negative', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(mod(-1, 4)).toBe(3);
    expect(mod(9, 4)).toBe(1);
  });
});

/** The least total cost over every way to assign rows to distinct columns (rows ≤ cols). */
function bruteForce(cost: number[][]): number {
  const cols = cost[0]?.length ?? 0;
  let best = Number.POSITIVE_INFINITY;
  const used = new Array<boolean>(cols).fill(false);
  const go = (row: number, sum: number) => {
    if (row === cost.length) {
      best = Math.min(best, sum);
      return;
    }
    for (let col = 0; col < cols; col++) {
      if (used[col]) continue;
      used[col] = true;
      go(row + 1, sum + (cost[row]?.[col] ?? 0));
      used[col] = false;
    }
  };
  go(0, 0);
  return best;
}

describe('the Hungarian algorithm', () => {
  test('finds the cheapest assignment', () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const result = assign(cost);
    expect(result).toEqual([1, 0, 2]);
    expect(totalCost(cost, result)).toBe(5);
  });

  test('empty matrices', () => {
    expect(assign([])).toEqual([]);
    expect(assign([[], []])).toEqual([-1, -1]);
  });

  test('more columns than rows leaves columns unused', () => {
    expect(assign([[9, 1, 9, 9]])).toEqual([1]);
  });

  test('more rows than columns leaves rows unassigned (-1)', () => {
    const cost = [[5], [1], [3]];
    const result = assign(cost);
    expect(result).toEqual([-1, 0, -1]);
    expect(totalCost(cost, result)).toBe(1);
  });

  test('matches brute force on random matrices up to 7×8', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }).chain(rows =>
          fc.integer({ min: rows, max: 8 }).chain(cols =>
            fc.array(fc.array(fc.integer({ min: 0, max: 50 }), { minLength: cols, maxLength: cols }), {
              minLength: rows,
              maxLength: rows,
            })
          )
        ),
        cost => {
          const result = assign(cost);
          expect(new Set(result).size).toBe(result.length);
          expect(totalCost(cost, result)).toBe(bruteForce(cost));
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('the One Euro filter', () => {
  test('the smoothing factor grows with the cutoff and the step', () => {
    expect(smoothingFactor(1, 1 / 60)).toBeLessThan(smoothingFactor(10, 1 / 60));
    expect(smoothingFactor(1, 1 / 60)).toBeLessThan(smoothingFactor(1, 1 / 10));
  });

  test('passes its first sample through, and a constant signal unchanged', () => {
    const filter = new OneEuroFilter();
    expect(filter.filter(0.3, 0)).toBe(0.3);
    for (let t = 16; t < 1000; t += 16) expect(filter.filter(0.3, t)).toBeCloseTo(0.3, 10);
  });

  test('a sample no newer than the last returns the last value', () => {
    const filter = new OneEuroFilter();
    filter.filter(1, 100);
    expect(filter.filter(5, 100)).toBe(1);
    expect(filter.filter(5, 50)).toBe(1);
  });

  test('reduces jitter on a held point', () => {
    const filter = new OneEuroFilter(DEFAULT_ONE_EURO);
    let rawSpread = 0;
    let smoothSpread = 0;
    for (let i = 0; i < 120; i++) {
      const noise = (i % 2 === 0 ? 1 : -1) * 0.01;
      const out = filter.filter(0.5 + noise, i * 16);
      if (i > 30) {
        rawSpread = Math.max(rawSpread, Math.abs(noise));
        smoothSpread = Math.max(smoothSpread, Math.abs(out - 0.5));
      }
    }
    expect(smoothSpread).toBeLessThan(rawSpread / 3);
  });

  test('follows a fast move closely', () => {
    const filter = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i <= 30; i++) out = filter.filter(i * 0.02, i * 16);
    expect(Math.abs(out - 0.6)).toBeLessThan(0.05);
  });

  test('starts over after a reset', () => {
    const filter = new OneEuroFilter();
    filter.filter(0, 0);
    filter.filter(1, 16);
    filter.reset();
    expect(filter.filter(7, 32)).toBe(7);
  });

  test('in 2D, each axis on its own', () => {
    const filter = new OneEuroFilter2D();
    expect(filter.filter(vec(1, 2), 0)).toEqual(vec(1, 2));
    const next = filter.filter(vec(1, 3), 16);
    expect(next.x).toBe(1);
    expect(next.y).toBeGreaterThan(2);
    expect(next.y).toBeLessThan(3);
    filter.reset();
    expect(filter.filter(vec(-1, -1), 32)).toEqual(vec(-1, -1));
  });
});
