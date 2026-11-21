import { describe, expect, test, vi } from 'vitest';
import type { Pose10 } from '../core/types';
import { SLOTS } from '../core/types';
import { fakeCtx } from '../test/fakeCtx';
import type { TipSample } from '../tracking/types';
import { canvasSurface, GlowSprites, paintGlow, SPRITE_SIZE } from './glowSprites';
import { drawOverlay, ghostPoses, HAND_BONES, type OverlayScene } from './overlayRenderer';
import { PALETTES, slotColor, withAlpha } from './palette';

describe('the palette', () => {
  test('one color per finger, the same on both hands', () => {
    expect(slotColor(0, 'rainbow')).toBe(PALETTES.rainbow[0]);
    expect(slotColor(5, 'rainbow')).toBe(PALETTES.rainbow[0]);
    expect(slotColor(9, 'colorblind')).toBe(PALETTES.colorblind[4]);
  });

  test('colors with alpha', () => {
    expect(withAlpha('#ff4f6d', 0.5)).toBe('rgba(255, 79, 109, 0.5)');
  });
});

describe('glow sprites', () => {
  test('a glow is a white core fading through the color to nothing', () => {
    const ctx = fakeCtx();
    paintGlow(ctx, 100, '#00ff00');
    expect(ctx.named('createRadialGradient')).toEqual([[50, 50, 0, 50, 50, 50]]);
    const gradient = ctx.fillStyle as unknown as { stops: [number, string][] };
    expect(gradient.stops.at(0)).toEqual([0, 'rgba(255, 255, 255, 1)']);
    expect(gradient.stops.at(-1)).toEqual([1, 'rgba(0, 255, 0, 0)']);
    expect(ctx.named('fill')).toHaveLength(1);
  });

  test('each color is painted once, then reused', () => {
    const made: unknown[] = [];
    const sprites = new GlowSprites(size => {
      const surface = { image: { size } as unknown as CanvasImageSource, ctx: fakeCtx() };
      made.push(surface);
      return surface;
    });
    const a = sprites.get('#ff0000');
    expect(sprites.get('#ff0000')).toBe(a);
    expect(sprites.get('#0000ff')).not.toBe(a);
    expect(made).toHaveLength(2);
    expect((a as unknown as { size: number }).size).toBe(SPRITE_SIZE);
  });

  test('the default surface is a canvas of the size asked', () => {
    const getContext = vi.fn(() => fakeCtx());
    const canvas = { width: 0, height: 0, getContext };
    vi.stubGlobal('document', { createElement: () => canvas });
    const surface = canvasSurface(64);
    expect(surface.image).toBe(canvas);
    expect(canvas.width).toBe(64);
    expect(getContext).toHaveBeenCalledWith('2d');
    vi.unstubAllGlobals();
    expect(new GlowSprites()).toBeInstanceOf(GlowSprites);
  });
});

const at = (x: number, y = 0) => ({ x, y });
const tip = (x: number, extra: Partial<TipSample> = {}): TipSample => ({ x, y: 0, confidence: 1, ...extra });
const pose = (fill: (slot: number) => { x: number; y: number } | null): Pose10 => SLOTS.map(fill);

const scene = (extra: Partial<OverlayScene> = {}): OverlayScene => ({
  view: 'performer',
  rect: { left: 0, top: 0, width: 1600, height: 900 },
  size: { width: 1600, height: 900 },
  dpr: 2,
  palette: 'rainbow',
  activeSlots: [5, 6],
  targets: pose(slot => (slot >= 5 ? at(0.1 * (slot - 4)) : null)),
  ghost: [],
  radius: { L: 0.03, R: 0.03 },
  hits: new Array(10).fill(false),
  tips: null,
  trail: [],
  ...extra,
});

const sprites = { get: (color: string) => ({ color }) as unknown as CanvasImageSource };

describe('the overlay', () => {
  test('clears at the device pixel ratio and draws a ring per active target', () => {
    const ctx = fakeCtx();
    drawOverlay(ctx, scene(), sprites);
    expect(ctx.named('setTransform')[0]).toEqual([2, 0, 0, 2, 0, 0]);
    expect(ctx.named('clearRect')[0]).toEqual([0, 0, 1600, 900]);
    // Slot 5 at x 0.1: 800 + 0.1·900 in performer view, radius 0.03·900
    expect(ctx.named('arc')).toEqual([
      [890, 450, 27, 0, Math.PI * 2],
      [980, 450, 27, 0, Math.PI * 2],
    ]);
    expect(ctx.named('drawImage')).toEqual([]);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  test('receiver view draws the mirror image', () => {
    const ctx = fakeCtx();
    drawOverlay(ctx, scene({ view: 'receiver', activeSlots: [5] }), sprites);
    expect(ctx.named('arc')[0]!.slice(0, 2)).toEqual([710, 450]);
  });

  test('a hit target glows and rings white', () => {
    const ctx = fakeCtx();
    const hits = new Array(10).fill(false);
    hits[5] = true;
    drawOverlay(ctx, scene({ hits, activeSlots: [5] }), sprites);
    const [image, x, , w] = ctx.named('drawImage')[0]!;
    expect((image as { color: string }).color).toBe(slotColor(5, 'rainbow'));
    expect(x).toBeCloseTo(890 - 1.7 * 27);
    expect(w).toBeCloseTo(3.4 * 27);
    expect(ctx.sets.strokeStyle).toContain('#ffffff');
  });

  test('a target with nowhere to be is skipped', () => {
    const ctx = fakeCtx();
    drawOverlay(ctx, scene({ activeSlots: [0] }), sprites);
    expect(ctx.named('arc')).toEqual([]);
  });

  test('ghost trails fade along where the targets go, skipping gaps', () => {
    const ctx = fakeCtx();
    const ghost = [pose(slot => (slot === 5 ? at(0.2) : null)), pose(slot => (slot === 5 ? at(0.3) : null))];
    drawOverlay(ctx, scene({ activeSlots: [5, 6], ghost }), sprites);
    // Slot 5: target → 0.2 → 0.3 (two segments); slot 6's ghost is empty
    expect(ctx.named('moveTo').slice(0, 2)).toEqual([
      [890, 450],
      [980, 450],
    ]);
    expect(ctx.named('lineTo').slice(0, 2)).toEqual([
      [980, 450],
      [1070, 450],
    ]);
    expect(ctx.sets.lineWidth!.slice(0, 2)).toEqual([13.5, 6.75]);
  });

  test("the performer's tips are LEDs, dimmer for guesses and for fingers the lesson doesn't use", () => {
    const ctx = fakeCtx();
    const tips = SLOTS.map(slot =>
      slot === 0 ? tip(-0.2) : slot === 5 ? tip(0.1, { predicted: true, confidence: 0.5 }) : null
    );
    drawOverlay(ctx, scene({ tips }), sprites);
    const images = ctx.named('drawImage');
    expect(images).toHaveLength(2);
    // Slot 0 (unused): full size, dimmed; slot 5: 60% size for a guess
    expect(images[0]![3]).toBeCloseTo(40.5);
    expect(images[1]![3]).toBeCloseTo(40.5 * 0.6);
    expect(ctx.sets.globalAlpha).toEqual([0.35, 1, 0.5, 1]);
  });

  test('tiny targets still get a fingertip glow you can see', () => {
    const ctx = fakeCtx();
    drawOverlay(
      ctx,
      scene({ radius: { L: 0.001, R: 0.001 }, tips: SLOTS.map(s => (s === 6 ? tip(0) : null)) }),
      sprites
    );
    expect(ctx.named('drawImage')[0]![3]).toBe(22);
  });

  test('trails follow each tip, skipping frames it was missing', () => {
    const ctx = fakeCtx();
    const trail = [0, 0.01, null, 0.03].map(x => SLOTS.map(slot => (slot === 6 && x !== null ? tip(x) : null)));
    drawOverlay(ctx, scene({ activeSlots: [5], trail }), sprites);
    // Only the first pair is unbroken
    expect(ctx.named('lineTo')).toHaveLength(1);
  });

  test("Lit mode's skeleton and Dark mode's lights, when given", () => {
    const ctx = fakeCtx();
    const hand = Array.from({ length: 21 }, (_, i) => at(i * 0.01));
    drawOverlay(ctx, scene({ activeSlots: [], skeleton: { R: hand }, lights: [at(0), at(0.1)] }), sprites);
    expect(ctx.named('lineTo')).toHaveLength(HAND_BONES.length);
    expect(ctx.named('arc')).toHaveLength(2);
  });
});

describe('the ghost', () => {
  test('samples the next beat, soonest first', () => {
    const poseAt = vi.fn((beat: number) => pose(() => at(beat)));
    const ghost = ghostPoses(poseAt, 2, 1, 4);
    expect(ghost.map(p => p[0]!.x)).toEqual([2.25, 2.5, 2.75, 3]);
    expect(ghostPoses(poseAt, 0)).toHaveLength(16);
  });
});
