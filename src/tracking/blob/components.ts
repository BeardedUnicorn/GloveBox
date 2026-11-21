/**
 * From lit pixels to lights: each 8-connected patch of the lit mask
 * (threshold.ts) is one candidate light. It's described by its
 * brightness-weighted centroid, its size and its color. An LED's core
 * saturates to white, so the color comes from its colored halo.
 */

/** One light found in a frame, in that frame's pixels (a pixel's center is at +0.5). */
export interface Blob {
  x: number;
  y: number;
  /** Lit pixels. */
  area: number;
  /** ΣV over its pixels: how much light it gives. */
  brightness: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Its color's hue, 0–1 (0 red, 1/3 green, 2/3 blue); null for a white or gray light. */
  hue: number | null;
}

export interface BlobOptions {
  /** Fewer lit pixels than this is noise. */
  minArea: number;
  /** More is a lamp or a window, not a fingertip. */
  maxArea: number;
  /** Pixels: patches whose centers are closer are one light (a diffuser's halo breaks up). */
  mergeDist: number;
  /** The brightest this many lights are kept. */
  maxBlobs: number;
}

export const DEFAULT_BLOB_OPTIONS: BlobOptions = { minArea: 2, maxArea: 2000, mergeDist: 3, maxBlobs: 16 };

/** Pixels whose color is this saturated or more count toward a light's hue. */
const MIN_SATURATION = 0.15;
/** A light whose colored pixels give less than this share of its brightness has no hue. */
const MIN_COLOR_SHARE = 0.05;
/** At most this many patches are looked at closely: the brightest. */
const MAX_CANDIDATES = 64;

/** HSV hue (0–1) and saturation (0–1) of a color; hue 0 for grays. */
export function hueOf(r: number, g: number, b: number): { hue: number; saturation: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, saturation: 0 };
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { hue: h / 6, saturation: d / max };
}

/** The shortest way around the hue circle between two hues: 0–0.5. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
}

interface Patch {
  area: number;
  brightness: number;
  sx: number;
  sy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Color, as a weighted sum of hue angles on the unit circle. */
  cos: number;
  sin: number;
  colorWeight: number;
}

function joined(a: Patch, b: Patch): Patch {
  return {
    area: a.area + b.area,
    brightness: a.brightness + b.brightness,
    sx: a.sx + b.sx,
    sy: a.sy + b.sy,
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    cos: a.cos + b.cos,
    sin: a.sin + b.sin,
    colorWeight: a.colorWeight + b.colorWeight,
  };
}

const centerOf = (patch: Patch) => ({ x: patch.sx / patch.brightness, y: patch.sy / patch.brightness });

/** Joins patches closer than `dist` until none are (single link). */
function mergeClose(patches: Patch[], dist: number): Patch[] {
  const out = [...patches];
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = centerOf(out[i]!);
        const b = centerOf(out[j]!);
        if (Math.hypot(a.x - b.x, a.y - b.y) < dist) {
          out[i] = joined(out[i]!, out[j]!);
          out.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * The lights in a frame: the lit `mask`'s 8-connected patches, measured on
 * `v` (brightness) and `rgba` (color), merged, filtered by size and the
 * brightest `maxBlobs` kept, brightest first.
 */
export function findBlobs(
  mask: Uint8Array,
  v: Uint8Array,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: BlobOptions = DEFAULT_BLOB_OPTIONS
): Blob[] {
  // Pass 1: provisional labels, with union-find over the neighbors already seen
  const labels = new Int32Array(mask.length);
  const parent: number[] = [0];
  const find = (label: number): number => {
    let root = label;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[label] !== root) {
      const next = parent[label]!;
      parent[label] = root;
      label = next;
    }
    return root;
  };
  const union = (a: number, b: number): number => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return ra;
    if (ra < rb) {
      parent[rb] = ra;
      return ra;
    }
    parent[ra] = rb;
    return rb;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (mask[p] === 0) continue;
      let label = 0;
      const look = (n: number) => {
        const other = labels[n]!;
        if (other === 0) return;
        label = label === 0 ? find(other) : union(label, other);
      };
      if (x > 0) look(p - 1);
      if (y > 0) {
        if (x > 0) look(p - width - 1);
        look(p - width);
        if (x < width - 1) look(p - width + 1);
      }
      if (label === 0) {
        label = parent.length;
        parent.push(label);
      }
      labels[p] = label;
    }
  }

  // Pass 2: measure each patch
  const byRoot = new Map<number, Patch>();
  for (let p = 0; p < labels.length; p++) {
    const label = labels[p]!;
    if (label === 0) continue;
    const root = find(label);
    const x = p % width;
    const y = (p - x) / width;
    const value = v[p]!;
    let patch = byRoot.get(root);
    if (patch === undefined) {
      patch = {
        area: 0,
        brightness: 0,
        sx: 0,
        sy: 0,
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        cos: 0,
        sin: 0,
        colorWeight: 0,
      };
      byRoot.set(root, patch);
    }
    patch.area++;
    patch.brightness += value;
    patch.sx += (x + 0.5) * value;
    patch.sy += (y + 0.5) * value;
    if (x < patch.minX) patch.minX = x;
    if (x > patch.maxX) patch.maxX = x;
    if (y > patch.maxY) patch.maxY = y;
    const { hue, saturation } = hueOf(rgba[p * 4]!, rgba[p * 4 + 1]!, rgba[p * 4 + 2]!);
    if (saturation >= MIN_SATURATION) {
      const weight = saturation * value;
      patch.cos += Math.cos(2 * Math.PI * hue) * weight;
      patch.sin += Math.sin(2 * Math.PI * hue) * weight;
      patch.colorWeight += weight;
    }
  }

  // Patches have brightness > 0 only if lit pixels had V > 0; a mask of zero-brightness pixels gives no light
  const candidates = [...byRoot.values()]
    .filter(patch => patch.brightness > 0)
    .sort((a, b) => b.brightness - a.brightness)
    .slice(0, MAX_CANDIDATES);
  return mergeClose(candidates, options.mergeDist)
    .filter(patch => patch.area >= options.minArea && patch.area <= options.maxArea)
    .sort((a, b) => b.brightness - a.brightness)
    .slice(0, options.maxBlobs)
    .map(patch => {
      const { x, y } = centerOf(patch);
      const colored = patch.colorWeight >= MIN_COLOR_SHARE * patch.brightness;
      const angle = Math.atan2(patch.sin, patch.cos) / (2 * Math.PI);
      return {
        x,
        y,
        area: patch.area,
        brightness: patch.brightness,
        minX: patch.minX,
        minY: patch.minY,
        maxX: patch.maxX,
        maxY: patch.maxY,
        hue: colored ? (angle + 1) % 1 : null,
      };
    });
}
