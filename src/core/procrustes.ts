/**
 * Similarity Procrustes in 2D: the rotation, uniform scale and translation
 * that best carry one ordered set of points onto another (least squares).
 * Dark mode uses it to tell which light is which finger: a hand's lights
 * fit the calibrated hand shape best in the right finger order.
 */

import type { Vec2 } from './types';
import { centroid, rotate } from './vec';

export interface Similarity {
  scale: number;
  /** Radians (rotate() in vec.ts). */
  rotation: number;
  translation: Vec2;
}

export interface ProcrustesFit extends Similarity {
  /** The sum of squared distances left between the carried source and the target. */
  residual: number;
}

/** `p` carried by `s`: scaled, turned, then moved. */
export function applySimilarity(p: Vec2, s: Similarity): Vec2 {
  const turned = rotate(p, s.rotation);
  return { x: turned.x * s.scale + s.translation.x, y: turned.y * s.scale + s.translation.y };
}

/**
 * The similarity carrying `source[i]` onto `target[i]` with the least
 * squared error. Source points all in one place have no shape to fit: they
 * are only moved (scale 1, no rotation).
 */
export function procrustes(source: readonly Vec2[], target: readonly Vec2[]): ProcrustesFit {
  if (source.length !== target.length) {
    throw new Error(`procrustes needs as many target points as source points (${source.length} ≠ ${target.length})`);
  }
  const cs = centroid(source);
  const ct = centroid(target);
  let dot = 0;
  let cross = 0;
  let spread = 0;
  for (let i = 0; i < source.length; i++) {
    const a = source[i]!;
    const b = target[i]!;
    const ax = a.x - cs.x;
    const ay = a.y - cs.y;
    const bx = b.x - ct.x;
    const by = b.y - ct.y;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
    spread += ax * ax + ay * ay;
  }
  const rotation = spread === 0 ? 0 : Math.atan2(cross, dot);
  const scale = spread === 0 ? 1 : Math.hypot(dot, cross) / spread;
  const turned = rotate(cs, rotation);
  const translation = { x: ct.x - turned.x * scale, y: ct.y - turned.y * scale };
  const fit = { scale, rotation, translation };
  let residual = 0;
  for (let i = 0; i < source.length; i++) {
    const p = applySimilarity(source[i]!, fit);
    const b = target[i]!;
    residual += (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
  }
  return { ...fit, residual };
}
