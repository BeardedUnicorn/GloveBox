/**
 * Stage space, the one coordinate system GloveBox thinks in, and the only
 * place where anything is mirrored.
 *
 * - Origin at the camera frame's center, y down, 1 unit = the frame's
 *   height, so a circle is a circle at any aspect ratio.
 * - +x is the performer's right. The camera sees their right hand on the
 *   left of its (unmirrored) frame, so stage x flips the frame's u.
 *
 * Performer view (the default) shows the stage like a mirror: +x on the
 * screen's right, the video flipped by CSS. Receiver view shows what the
 * camera, the receiver, sees: +x on the screen's left. The data never
 * changes with the view; only stageToScreen does.
 */

import type { Vec2 } from './types';

export type View = 'performer' | 'receiver';

export interface Size {
  width: number;
  height: number;
}

/** Where the camera frame is drawn, in CSS pixels; it can overflow the box (cover). */
export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rectangle in stage units. */
export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const aspectOf = (size: Size): number => size.width / size.height;

/** A point of the unmirrored camera frame (u right, v down, both 0–1) in stage space. */
export const rawToStage = (u: number, v: number, aspect: number): Vec2 => ({ x: (0.5 - u) * aspect, y: v - 0.5 });

/** The stage point back in the unmirrored camera frame's 0–1 coordinates. */
export const stageToRaw = (p: Vec2, aspect: number): { u: number; v: number } => ({
  u: 0.5 - p.x / aspect,
  v: p.y + 0.5,
});

/** The visible stage: x within ±aspect/2, y within ±0.5. */
export const stageBounds = (aspect: number): Rect => ({
  minX: -aspect / 2,
  maxX: aspect / 2,
  minY: -0.5,
  maxY: 0.5,
});

/** The frame drawn to fill `box` (CSS object-fit: cover) or to fit inside it (contain), centered. */
export function frameRect(frame: Size, box: Size, fit: 'cover' | 'contain' = 'cover'): FrameRect {
  const sx = box.width / frame.width;
  const sy = box.height / frame.height;
  const k = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const width = frame.width * k;
  const height = frame.height * k;
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
}

/** A stage point on screen, in the box's CSS pixels. */
export function stageToScreen(p: Vec2, rect: FrameRect, view: View): Vec2 {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const x = view === 'performer' ? p.x : -p.x;
  return { x: cx + x * rect.height, y: cy + p.y * rect.height };
}

/** Stage units as CSS pixels (a radius, a line width). */
export const stageLength = (units: number, rect: FrameRect): number => units * rect.height;

/**
 * Lessons are written at a nominal hand span around the origin; the fit
 * moves and sizes one to the performer's own hands (measured in
 * calibration): lesson point p is shown at center + p·scale.
 */
export interface FitTransform {
  center: Vec2;
  scale: number;
}

export const IDENTITY_FIT: FitTransform = { center: { x: 0, y: 0 }, scale: 1 };

export const applyFit = (p: Vec2, fit: FitTransform): Vec2 => ({
  x: fit.center.x + p.x * fit.scale,
  y: fit.center.y + p.y * fit.scale,
});

export const removeFit = (p: Vec2, fit: FitTransform): Vec2 => ({
  x: (p.x - fit.center.x) / fit.scale,
  y: (p.y - fit.center.y) / fit.scale,
});

/** The fit for a performer whose hands span `span` around `center`, for a lesson written at `nominalSpan`. */
export const fitFor = (center: Vec2, span: number, nominalSpan: number): FitTransform => ({
  center,
  scale: span / nominalSpan,
});

/**
 * `fit`, changed as little as it takes for a lesson inside `bounds` to stay
 * on screen within `margin`: smaller if it can't fit, then moved in.
 */
export function clampFit(fit: FitTransform, bounds: Rect, aspect: number, margin = 0.04): FitTransform {
  const stage = stageBounds(aspect);
  const room = { x: stage.maxX - stage.minX - 2 * margin, y: stage.maxY - stage.minY - 2 * margin };
  const size = { x: bounds.maxX - bounds.minX, y: bounds.maxY - bounds.minY };
  const scale = Math.min(fit.scale, room.x / size.x, room.y / size.y);
  const axis = (center: number, min: number, max: number, lo: number, hi: number) => {
    const low = center + min * scale;
    const high = center + max * scale;
    if (low < lo + margin) return center + (lo + margin - low);
    if (high > hi - margin) return center - (high - (hi - margin));
    return center;
  };
  return {
    scale,
    center: {
      x: axis(fit.center.x, bounds.minX, bounds.maxX, stage.minX, stage.maxX),
      y: axis(fit.center.y, bounds.minY, bounds.maxY, stage.minY, stage.maxY),
    },
  };
}
