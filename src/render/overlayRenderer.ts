/**
 * The practice overlay, drawn over the camera every display frame:
 * - ghost trails: where each target goes over the next beat, fading out;
 * - target rings at the scored radius, glowing while a finger is on them;
 * - the performer's own fingertips as LEDs, with short trails;
 * - optionally, Lit mode's hand skeleton and Dark mode's raw lights.
 *
 * Everything arrives in stage space and goes through stageToScreen, so
 * performer and receiver views differ only there.
 */

import { type FrameRect, type Size, stageLength, stageToScreen, type View } from '../core/coords';
import { type Hand, handOf, type Pose10, SLOTS, type Slot, type Vec2 } from '../core/types';
import type { Tips10 } from '../tracking/types';
import type { Ctx2D } from './ctx';
import { type Palette, slotColor, withAlpha } from './palette';

/** MediaPipe's 21-landmark hand, as bones between landmarks. */
export const HAND_BONES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

export interface OverlayScene {
  view: View;
  /** Where the camera frame sits in the canvas, CSS pixels. */
  rect: FrameRect;
  /** The canvas's CSS size. */
  size: Size;
  dpr: number;
  palette: Palette;
  activeSlots: readonly Slot[];
  /** Where each target is now. */
  targets: Pose10;
  /** Where the targets will be over the next beat, soonest first. */
  ghost: Pose10[];
  /** Each hand's target radius, stage units. */
  radius: Record<Hand, number>;
  hits: boolean[];
  tips: Tips10 | null;
  /** The performer's recent tips, oldest first. */
  trail: Tips10[];
  skeleton?: Partial<Record<Hand, Vec2[]>>;
  lights?: Vec2[];
}

export interface Sprites {
  get(color: string): CanvasImageSource;
}

/** Smallest LED drawn for a fingertip, CSS pixels. */
const MIN_TIP_GLOW = 22;

export function drawOverlay(ctx: Ctx2D, scene: OverlayScene, sprites: Sprites): void {
  const { rect, view, dpr, size } = scene;
  const screen = (p: Vec2) => stageToScreen(p, rect, view);
  const px = (units: number) => stageLength(units, rect);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const line = (a: Vec2, b: Vec2) => {
    const p = screen(a);
    const q = screen(b);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  };

  // Skeleton under everything, quiet
  if (scene.skeleton) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    for (const points of Object.values(scene.skeleton)) {
      for (const [a, b] of HAND_BONES) line(points[a]!, points[b]!);
    }
  }

  ctx.globalCompositeOperation = 'lighter';

  // Ghost trails: from each target along where it's going, thinning and fading
  for (const slot of scene.activeSlots) {
    const color = slotColor(slot, scene.palette);
    const width = px(scene.radius[handOf(slot)]) * 0.5;
    const path = [scene.targets[slot], ...scene.ghost.map(pose => pose[slot])];
    const n = path.length - 1;
    for (let k = 0; k < n; k++) {
      const a = path[k];
      const b = path[k + 1];
      if (!a || !b) continue;
      const fade = 1 - k / n;
      ctx.strokeStyle = withAlpha(color, 0.5 * fade);
      ctx.lineWidth = Math.max(1, width * fade);
      line(a, b);
    }
  }

  // Target rings
  for (const slot of scene.activeSlots) {
    const target = scene.targets[slot];
    if (!target) continue;
    const color = slotColor(slot, scene.palette);
    const p = screen(target);
    const r = px(scene.radius[handOf(slot)]);
    const hit = scene.hits[slot];
    if (hit) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sprites.get(color), p.x - 1.7 * r, p.y - 1.7 * r, 3.4 * r, 3.4 * r);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = withAlpha(color, hit ? 0.25 : 0.08);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hit ? '#ffffff' : withAlpha(color, 0.9);
    ctx.lineWidth = hit ? 3.5 : 2.5;
    ctx.stroke();
  }

  // The performer's trails, then their lights on top
  const active = new Set(scene.activeSlots);
  for (const slot of SLOTS) {
    const color = slotColor(slot, scene.palette);
    const dim = active.has(slot) ? 1 : 0.35;
    const trail = scene.trail.map(tips => tips[slot]);
    for (let k = 1; k < trail.length; k++) {
      const a = trail[k - 1];
      const b = trail[k];
      if (!a || !b) continue;
      ctx.strokeStyle = withAlpha(color, 0.45 * dim * (k / trail.length));
      ctx.lineWidth = 3;
      line(a, b);
    }
    const tip = scene.tips?.[slot];
    if (!tip) continue;
    const p = screen(tip);
    const glow = Math.max(MIN_TIP_GLOW, px(scene.radius[handOf(slot)]) * 1.5) * (tip.predicted ? 0.6 : 1);
    ctx.globalAlpha = Math.max(0.15, tip.confidence) * dim;
    ctx.drawImage(sprites.get(color), p.x - glow / 2, p.y - glow / 2, glow, glow);
    ctx.globalAlpha = 1;
  }

  // Dark mode's raw lights: what the tracker saw, assigned or not
  if (scene.lights) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (const light of scene.lights) {
      const p = screen(light);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** The ghost: the targets at `samples` points over the next `lookahead` beats. */
export function ghostPoses(poseAtBeat: (beat: number) => Pose10, beat: number, lookahead = 1, samples = 16): Pose10[] {
  return Array.from({ length: samples }, (_, i) => poseAtBeat(beat + ((i + 1) / samples) * lookahead));
}
