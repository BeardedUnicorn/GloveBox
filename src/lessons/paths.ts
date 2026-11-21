/** Where a path is at a phase of its loop (0 → 1), and its mirror image for the other hand. */

import { mod } from '../core/vec';
import type { Vec2 } from '../core/types';
import type { PathSpec } from './schema';

const TAU = Math.PI * 2;

/** Slow in, slow out. */
export const inOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The point of `path` at `phase` (any number: one loop is 1). */
export function pointOn(path: PathSpec, phase: number): Vec2 {
  const p = mod(phase, 1);
  switch (path.type) {
    case 'static':
      return path.at;
    case 'circle': {
      const angle = path.start + path.dir * TAU * p;
      return { x: path.center.x + path.radius * Math.cos(angle), y: path.center.y + path.radius * Math.sin(angle) };
    }
    case 'lissajous':
      return {
        x: path.center.x + path.ax * Math.sin(TAU * path.fx * p + path.phase),
        y: path.center.y + path.ay * Math.sin(TAU * path.fy * p),
      };
    case 'polyline': {
      const points = path.closed ? [...path.points, path.points[0]!] : [...path.points, ...path.points.slice(0, -1).reverse()];
      const segments = points.length - 1;
      const at = p * segments;
      const index = Math.floor(at);
      const local = at - index;
      const move = local <= path.holdFrac ? 0 : (local - path.holdFrac) / (1 - path.holdFrac);
      const t = path.ease === 'inOutCubic' ? inOutCubic(move) : move;
      const a = points[index]!;
      const b = points[index + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
}

/** The phases where a polyline's holds begin: its corners, for "hit" cues. */
export function corners(path: PathSpec): number[] {
  if (path.type !== 'polyline') return [];
  const segments = path.closed ? path.points.length : 2 * (path.points.length - 1);
  return Array.from({ length: segments }, (_, i) => i / segments);
}

const mirrorPoint = (v: Vec2): Vec2 => ({ x: -v.x, y: v.y });

/** The same path reflected across x = 0: what the other hand does in a mirrored move. */
export function mirrorPath(path: PathSpec): PathSpec {
  switch (path.type) {
    case 'static':
      return { ...path, at: mirrorPoint(path.at) };
    case 'circle':
      return { ...path, center: mirrorPoint(path.center), dir: path.dir === 1 ? -1 : 1, start: Math.PI - path.start };
    case 'lissajous':
      return { ...path, center: mirrorPoint(path.center), phase: path.phase + Math.PI };
    case 'polyline':
      return { ...path, points: path.points.map(mirrorPoint) };
  }
}
