/**
 * LED glows, drawn once per color and stamped with additive blending.
 * shadowBlur would draw the same thing, but slowly in WebKit.
 */

import type { Ctx2D } from './ctx';
import { withAlpha } from './palette';

/** Something that can be drawn, and its 2D context to paint it with. */
export interface Surface {
  image: CanvasImageSource;
  ctx: Ctx2D;
}
export type SurfaceFactory = (size: number) => Surface;

/** Pixels across one sprite: drawn scaled, so a modest size looks smooth. */
export const SPRITE_SIZE = 128;

export const canvasSurface: SurfaceFactory = size => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { image: canvas, ctx: canvas.getContext('2d') as unknown as Ctx2D };
};

/** Paints a glow: a white-hot core fading through the color to nothing. */
export function paintGlow(ctx: Ctx2D, size: number, color: string): void {
  const c = size / 2;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.18, withAlpha(color, 0.95));
  gradient.addColorStop(0.45, withAlpha(color, 0.35));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
}

export class GlowSprites {
  private readonly cache = new Map<string, CanvasImageSource>();

  constructor(private readonly makeSurface: SurfaceFactory = canvasSurface) {}

  /** The glow for `color`, painted the first time it's asked for. */
  get(color: string): CanvasImageSource {
    const cached = this.cache.get(color);
    if (cached) return cached;
    const surface = this.makeSurface(SPRITE_SIZE);
    paintGlow(surface.ctx, SPRITE_SIZE, color);
    this.cache.set(color, surface.image);
    return surface.image;
  }
}
