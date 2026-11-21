/**
 * Dark mode's first step: which pixels are lit. A glove's LED is the
 * brightest thing in a dark room, so brightness alone finds it: V, the
 * largest of a pixel's red, green and blue.
 *
 * Hysteresis keeps a light whole without picking up the room: a pixel at
 * least `high` seeds a light, and pixels at least `low` join it only when
 * they touch one (8-connected), so a dim halo grows its light but a dim
 * reflection on its own stays dark.
 */

/** V = max(r, g, b) for each pixel of an RGBA image. */
export function brightness(rgba: Uint8ClampedArray, out = new Uint8Array(rgba.length / 4)): Uint8Array {
  for (let i = 0, p = 0; p < out.length; i += 4, p++) out[p] = Math.max(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
  return out;
}

/**
 * The lit mask (1 lit, 0 dark): pixels ≥ `high`, and the pixels ≥ `low`
 * 8-connected to them.
 */
export function hysteresis(
  v: Uint8Array,
  width: number,
  height: number,
  low: number,
  high: number,
  out = new Uint8Array(v.length)
): Uint8Array {
  out.fill(0);
  const stack = new Int32Array(v.length);
  let top = 0;
  for (let p = 0; p < v.length; p++) {
    if (v[p]! < high || out[p] === 1) continue;
    out[p] = 1;
    stack[top++] = p;
    while (top > 0) {
      const q = stack[--top]!;
      const x = q % width;
      const y = (q - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const n = ny * width + nx;
          if (out[n] === 0 && v[n]! >= low) {
            out[n] = 1;
            stack[top++] = n;
          }
        }
      }
    }
  }
  return out;
}

/**
 * The brightest each pixel has been over the last `frames` frames. LED
 * gloves in a strobe mode are dark for a frame or two at a time; pooling
 * keeps their lights found through the dark frames. One frame is no pooling.
 */
export class MaxPool {
  private readonly history: Uint8Array[] = [];
  private pooled: Uint8Array | null = null;

  constructor(private readonly frames: number) {
    if (!Number.isInteger(frames) || frames < 1) throw new Error(`MaxPool needs at least 1 frame (got ${frames})`);
  }

  /** Adds a frame's brightness; returns the pooled brightness (a buffer the next push reuses). */
  push(v: Uint8Array): Uint8Array {
    if (this.frames === 1) return v;
    if (this.history.length > 0 && this.history[0]!.length !== v.length) this.reset();
    this.history.push(v.slice());
    if (this.history.length > this.frames) this.history.shift();
    if (this.pooled === null || this.pooled.length !== v.length) this.pooled = new Uint8Array(v.length);
    const pooled = this.pooled;
    pooled.set(this.history[0]!);
    for (let f = 1; f < this.history.length; f++) {
      const frame = this.history[f]!;
      for (let p = 0; p < pooled.length; p++) if (frame[p]! > pooled[p]!) pooled[p] = frame[p]!;
    }
    return pooled;
  }

  reset(): void {
    this.history.length = 0;
    this.pooled = null;
  }
}

/** The brightness that `fraction` (0–1) of the pixels are at or below, from a histogram. */
export function percentile(v: Uint8Array, fraction: number): number {
  const counts = new Uint32Array(256);
  for (let p = 0; p < v.length; p++) counts[v[p]!]!++;
  const wanted = Math.ceil(fraction * v.length);
  let seen = 0;
  for (let level = 0; level < 255; level++) {
    seen += counts[level]!;
    if (seen >= wanted) return level;
  }
  return 255;
}
