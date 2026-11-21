/**
 * One frame's lights, in stage space: brightness, the hysteresis threshold
 * (with optional strobe pooling) and the patches, each light then placed
 * on the stage (src/core/coords.ts). Calibration and tracking both look
 * at frames through this.
 */

import { rawToStage } from '../../core/coords';
import type { StageLight } from './assign';
import { type BlobOptions, DEFAULT_BLOB_OPTIONS, findBlobs } from './components';
import { brightness, hysteresis, MaxPool } from './threshold';

/** A small RGBA copy of a camera frame (blobTracker.ts createVideoGrabber makes them). */
export interface GrabbedFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Thresholds {
  /** A light's pixels reach at least this… */
  low: number;
  /** …and its brightest at least this (0–255). */
  high: number;
}

/** A light with its size, for calibration. */
export interface DetectedLight extends StageLight {
  area: number;
}

export class LightDetector {
  private readonly pool: MaxPool;
  private v = new Uint8Array(0);
  private mask = new Uint8Array(0);

  constructor(
    private readonly thresholds: Thresholds,
    private readonly blobOptions: BlobOptions = DEFAULT_BLOB_OPTIONS,
    poolFrames = 1
  ) {
    this.pool = new MaxPool(poolFrames);
  }

  /** The lights in `frame`, brightest first. */
  detect(frame: GrabbedFrame): DetectedLight[] {
    const { data, width, height } = frame;
    const pixels = width * height;
    if (this.v.length !== pixels) {
      this.v = new Uint8Array(pixels);
      this.mask = new Uint8Array(pixels);
    }
    const pooled = this.pool.push(brightness(data, this.v));
    hysteresis(pooled, width, height, this.thresholds.low, this.thresholds.high, this.mask);
    const aspect = width / height;
    return findBlobs(this.mask, pooled, data, width, height, this.blobOptions).map(blob => ({
      ...rawToStage(blob.x / width, blob.y / height, aspect),
      hue: blob.hue,
      brightness: blob.brightness,
      area: blob.area,
    }));
  }

  reset(): void {
    this.pool.reset();
  }
}
