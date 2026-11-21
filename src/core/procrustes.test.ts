import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { applySimilarity, procrustes } from './procrustes';
import type { Vec2 } from './types';

const SHAPE: Vec2[] = [
  { x: -0.5, y: 0.2 },
  { x: -0.2, y: -0.3 },
  { x: 0, y: -0.4 },
  { x: 0.25, y: -0.3 },
  { x: 0.45, y: -0.1 },
];

describe('similarity Procrustes', () => {
  test('a shape fits itself exactly', () => {
    const fit = procrustes(SHAPE, SHAPE);
    expect(fit.scale).toBeCloseTo(1);
    expect(fit.rotation).toBeCloseTo(0);
    expect(fit.translation.x).toBeCloseTo(0);
    expect(fit.residual).toBeCloseTo(0);
  });

  test('recovers any rotation, scale and move, with nothing left over', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: 0.1, max: 4, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (rotation, scale, tx, ty) => {
          const s = { rotation, scale, translation: { x: tx, y: ty } };
          const target = SHAPE.map(p => applySimilarity(p, s));
          const fit = procrustes(SHAPE, target);
          expect(fit.scale).toBeCloseTo(scale, 6);
          expect(Math.cos(fit.rotation - rotation)).toBeCloseTo(1, 6);
          expect(fit.residual).toBeLessThan(1e-12);
        }
      )
    );
  });

  test('a misfit leaves a residual', () => {
    const swapped = [SHAPE[1]!, SHAPE[0]!, ...SHAPE.slice(2)];
    expect(procrustes(SHAPE, swapped).residual).toBeGreaterThan(0.01);
  });

  test('source points all in one place are only moved', () => {
    const fit = procrustes(
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ]
    );
    expect(fit).toMatchObject({ scale: 1, rotation: 0, translation: { x: 0, y: -1 } });
    expect(fit.residual).toBeCloseTo(2);
  });

  test('needs as many target points as source points', () => {
    expect(() => procrustes(SHAPE, SHAPE.slice(1))).toThrow(/as many target points/);
  });
});
