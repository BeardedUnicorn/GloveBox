/** The ten lights' colors: one per finger, the same on both hands, as most glovers set their gloves. */

import { fingerOf, type Slot } from '../core/types';

export type Palette = 'rainbow' | 'colorblind';

export const PALETTES: Record<Palette, readonly string[]> = {
  // thumb, index, middle, ring, pinky (styles.css --light-*)
  rainbow: ['#ff4f6d', '#ffb84f', '#6dff9e', '#4fd2ff', '#b46dff'],
  // Okabe–Ito: told apart with any color vision
  colorblind: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#cc79a7'],
};

export const slotColor = (slot: Slot, palette: Palette): string => PALETTES[palette][fingerOf(slot)]!;

/** `#rrggbb` at `alpha`, as a CSS color. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
