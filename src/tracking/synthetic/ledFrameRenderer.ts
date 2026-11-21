/**
 * Glove lights without gloves: draws a pose's ten lights the way a webcam
 * sees LED gloves in a dark room, as a small RGBA frame (like the Dark-mode
 * grabber's). Each light is a white-hot core with a colored glow, over a
 * dim, noisy room. Strobe modes, dropped lights and noise are all
 * repeatable from a seed. Tests use it to check Dark mode end to end; a
 * demo can show it.
 */

import { stageToRaw } from '../../core/coords';
import type { Pose10 } from '../../core/types';
import type { GrabbedFrame } from '../blob/detect';

export type RGB = readonly [number, number, number];

/** The fingers' colors, thumb to pinky, on both hands (src/styles.css's --light-*). */
const FINGER_COLORS: RGB[] = [
  [255, 79, 109],
  [255, 184, 79],
  [109, 255, 158],
  [79, 210, 255],
  [180, 109, 255],
];

export const DEFAULT_LED_COLORS: readonly RGB[] = [...FINGER_COLORS, ...FINGER_COLORS];

export interface LedRenderOptions {
  width: number;
  height: number;
  /** The white-hot core's radius, pixels. */
  radius: number;
  /** How far the colored glow reaches past the core, pixels. */
  bloom: number;
  /** By slot. */
  colors: readonly RGB[];
  /** The room's brightness, 0–255… */
  ambient: number;
  /** …and how much each pixel of it varies, ±. */
  noise: number;
  /** Lights on for `on` frames, then off for `off`; null for steady lights. */
  strobe: { on: number; off: number } | null;
  /** The chance (0–1) each light is hidden in a frame. */
  dropout: number;
  seed: number;
  /** Which frame this is: drives the strobe, and the noise and dropout with the seed. */
  frameIndex: number;
}

export const DEFAULT_LED_RENDER: LedRenderOptions = {
  width: 320,
  height: 180,
  radius: 2,
  bloom: 3,
  colors: DEFAULT_LED_COLORS,
  ambient: 8,
  noise: 6,
  strobe: null,
  dropout: 0,
  seed: 1,
  frameIndex: 0,
};

/** A small, fast, seedable random number generator (mulberry32): numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether the lights are lit in frame `index` of a strobe. */
export const strobeLit = (strobe: LedRenderOptions['strobe'], index: number): boolean =>
  strobe === null || index % (strobe.on + strobe.off) < strobe.on;

/** The frame a webcam would see of `pose`'s lights (stage space). */
export function renderLeds(pose: Pose10, options: Partial<LedRenderOptions> = {}): GrabbedFrame {
  const o = { ...DEFAULT_LED_RENDER, ...options };
  const { width, height } = o;
  const data = new Uint8ClampedArray(width * height * 4);
  const random = mulberry32(o.seed * 7919 + o.frameIndex);
  for (let i = 0; i < data.length; i += 4) {
    const level = o.ambient + (random() * 2 - 1) * o.noise;
    data[i] = level;
    data[i + 1] = level;
    data[i + 2] = level;
    data[i + 3] = 255;
  }
  if (!strobeLit(o.strobe, o.frameIndex)) return { data, width, height };

  const aspect = width / height;
  const reach = o.radius + o.bloom;
  pose.forEach((p, slot) => {
    if (p === null || random() < o.dropout) return;
    const { u, v } = stageToRaw(p, aspect);
    const cx = u * width;
    const cy = v * height;
    const [r, g, b] = o.colors[slot]!;
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(height - 1, Math.ceil(cy + reach)); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(width - 1, Math.ceil(cx + reach)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > reach) continue;
        // The core is near white; the glow fades out in the light's own color
        const core = d <= o.radius;
        const k = core ? 1 : Math.exp(-(((d - o.radius) / (o.bloom / 2)) ** 2));
        const white = core ? 0.75 : 0;
        const i = (y * width + x) * 4;
        data[i] = Math.max(data[i]!, (r + (255 - r) * white) * k);
        data[i + 1] = Math.max(data[i + 1]!, (g + (255 - g) * white) * k);
        data[i + 2] = Math.max(data[i + 2]!, (b + (255 - b) * white) * k);
      }
    }
  });
  return { data, width, height };
}
