/** Small vector math over stage-space points. */

import type { Vec2 } from './types';

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** `a` turned by `angle` radians (positive turns +x toward +y, which is clockwise on screen). */
export function rotate(a: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** The mean of some points; the origin for none. */
export function centroid(points: readonly Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce(add, { x: 0, y: 0 });
  return scale(sum, 1 / points.length);
}

/** `value` held to [min, max]. */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The true modulo: always in [0, m). */
export const mod = (value: number, m: number): number => ((value % m) + m) % m;
