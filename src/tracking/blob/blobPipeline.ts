/**
 * Dark mode, one frame at a time: the frame's lights (detect.ts), matched
 * to the ten slots' tracks (assign.ts), whole hands found again by their
 * shape when most slots are lost (reacquire.ts), and the result as a
 * TrackerFrame. It runs in the worker (blob.worker.ts), or in the page
 * when there's no worker.
 */

import type { Pose10 } from '../../core/types';
import type { TrackerFrame } from '../types';
import {
  type AssignParams,
  confidenceOf,
  DEFAULT_ASSIGN_PARAMS,
  predict,
  type SlotTrack,
  stepTracks,
  tracksFrom,
} from './assign';
import type { DarkCalibration } from './calibration';
import { type BlobOptions, DEFAULT_BLOB_OPTIONS } from './components';
import { type GrabbedFrame, LightDetector } from './detect';
import {
  DEFAULT_ORDER_CHECK,
  DEFAULT_ORDER_WEIGHTS,
  fixHandOrder,
  type OrderCheck,
  type OrderWeights,
  reacquire,
  shapeAnchors,
} from './reacquire';

export interface PipelineOptions {
  assign: AssignParams;
  order: OrderWeights;
  /** When a hand's tracks are put back in the order its shape says (reacquire.ts fixHandOrder). */
  orderCheck: OrderCheck;
  /** Patches closer than this (pixels) are one light; the brightest maxBlobs are kept. */
  mergeDist: number;
  maxBlobs: number;
  /** Frames of brightness pooled, for gloves in a strobe mode (1: none). */
  poolFrames: number;
  /** Whole hands are found again once this many slots are lost… */
  reacquireLost: number;
  /** …and at least this many lights are left unmatched. */
  reacquireLights: number;
}

export const DEFAULT_PIPELINE_OPTIONS: PipelineOptions = {
  assign: DEFAULT_ASSIGN_PARAMS,
  order: DEFAULT_ORDER_WEIGHTS,
  orderCheck: DEFAULT_ORDER_CHECK,
  mergeDist: DEFAULT_BLOB_OPTIONS.mergeDist,
  maxBlobs: DEFAULT_BLOB_OPTIONS.maxBlobs,
  poolFrames: 1,
  reacquireLost: 4,
  reacquireLights: 3,
};

export class BlobPipeline {
  private readonly options: PipelineOptions;
  private detector: LightDetector | null = null;
  private detectorPixels = 0;
  private tracks: (SlotTrack | null)[] = new Array(10).fill(null);

  constructor(
    private readonly calibration: DarkCalibration,
    options: Partial<PipelineOptions> = {}
  ) {
    this.options = { ...DEFAULT_PIPELINE_OPTIONS, ...options };
  }

  /** The detector for frames of this size: light sizes scale with the frame's area. */
  private detectorFor(frame: GrabbedFrame): LightDetector {
    const pixels = frame.width * frame.height;
    if (this.detector === null || this.detectorPixels !== pixels) {
      const { calibration: c, options: o } = this;
      const k = pixels / (c.frame.width * c.frame.height);
      const blobs: BlobOptions = {
        minArea: Math.max(1, Math.floor(c.blobArea.min * k)),
        maxArea: Math.ceil(c.blobArea.max * k),
        mergeDist: o.mergeDist,
        maxBlobs: o.maxBlobs,
      };
      this.detector = new LightDetector(c.thresholds, blobs, o.poolFrames);
      this.detectorPixels = pixels;
    }
    return this.detector;
  }

  /** The ten tips in `frame`, captured at `t` (ms), with the lesson's expected `prior` positions or null. */
  process(frame: GrabbedFrame, t: number, prior: Pose10 | null): TrackerFrame {
    const { calibration: c, options: o } = this;
    const lights = this.detectorFor(frame).detect(frame);
    const ctx = { hues: c.hues, prior, params: o.assign };
    // Tracked slots first. With many lost and lights to spare, whole hands are
    // found again by their shape; a few lost slots are found one by one.
    const tracked = stepTracks(this.tracks, lights, t, ctx, false);
    const lost = tracked.tracks.filter(track => track === null || track.lost).length;
    const unmatched = lights.length - tracked.lightOf.filter(index => index >= 0).length;
    let tracks: (SlotTrack | null)[];
    if (lost >= o.reacquireLost && unmatched >= o.reacquireLights) {
      const lightOf = reacquire({ lights, hands: c.hands, hues: c.hues, prior, weights: o.order });
      tracks = tracksFrom(lights, lightOf, t, tracked.tracks);
    } else {
      const step = stepTracks(this.tracks, lights, t, { ...ctx, anchors: shapeAnchors(tracked.tracks, c.hands) });
      tracks = fixHandOrder({
        lights,
        lightOf: step.lightOf,
        tracks: step.tracks,
        t,
        hands: c.hands,
        hues: c.hues,
        check: o.orderCheck,
        weights: o.order,
      }).tracks;
    }
    this.tracks = tracks;

    return {
      t,
      tips: tracks.map(track => {
        if (track === null || track.lost) return null;
        if (track.seen) return { x: track.pos.x, y: track.pos.y, confidence: 1 };
        return { ...predict(track, t, o.assign), confidence: confidenceOf(track, t, o.assign), predicted: true };
      }),
      handScale: { L: c.hands.L.span, R: c.hands.R.span },
      lights: lights.map(light => ({ x: light.x, y: light.y })),
    };
  }

  /** Forgets every track (and pooled frame): the next frame starts fresh. */
  reset(): void {
    this.tracks = new Array(10).fill(null);
    this.detector?.reset();
  }
}
