/**
 * Dark mode's fingertip tracker: the gloves' LEDs, found in the dark.
 *
 * Each camera frame is grabbed small (createVideoGrabber: 320 px wide) and
 * handed to the pipeline (blobPipeline.ts), in a worker when there is one
 * (createBlobWorker), so the page never waits on it, or in the page
 * otherwise.
 */

import type { Pose10 } from '../../core/types';
import type { CameraFrame, FingertipTracker, TrackerFrame } from '../types';
import { BlobPipeline, type PipelineOptions } from './blobPipeline';
import type { DarkCalibration } from './calibration';
import type { GrabbedFrame } from './detect';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

/** Copies a camera frame small enough to look at every pixel; null when it can't (the video isn't playing yet). */
export type FrameGrab = (frame: CameraFrame) => GrabbedFrame | null;

/** The part of a Worker the tracker uses. */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  terminate(): void;
}

export interface BlobTrackerOptions {
  calibration: DarkCalibration;
  grab: FrameGrab;
  /** Runs the pipeline off the main thread; without one it runs in the page. */
  worker?: WorkerLike;
  pipeline?: Partial<PipelineOptions>;
}

export class BlobTracker implements FingertipTracker {
  readonly kind = 'leds' as const;
  private pipeline: BlobPipeline | null = null;
  private prior: ((t: number) => Pose10) | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, (frame: TrackerFrame | null) => void>();
  private ready: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private disposed = false;

  constructor(private readonly options: BlobTrackerOptions) {}

  async init(): Promise<void> {
    const { worker, calibration, pipeline } = this.options;
    if (!worker) {
      this.pipeline = new BlobPipeline(calibration, pipeline);
      return;
    }
    worker.onmessage = event => this.receive(event.data);
    await new Promise<void>((resolve, reject) => {
      this.ready = { resolve, reject };
      worker.postMessage({ type: 'init', calibration, options: pipeline });
    });
  }

  private receive(message: WorkerResponse): void {
    switch (message.type) {
      case 'ready':
        this.ready?.resolve();
        this.ready = null;
        return;
      case 'result':
        this.settle(message.id, message.frame);
        return;
      case 'error':
        if (message.id === null) {
          this.ready?.reject(new Error(message.message));
          this.ready = null;
        } else {
          this.settle(message.id, null);
        }
    }
  }

  private settle(id: number, frame: TrackerFrame | null): void {
    this.pending.get(id)?.(frame);
    this.pending.delete(id);
  }

  async process(frame: CameraFrame): Promise<TrackerFrame | null> {
    if (this.disposed) return null;
    const grabbed = this.options.grab(frame);
    if (grabbed === null) return null;
    const prior = this.prior?.(frame.t) ?? null;
    const { worker } = this.options;
    if (!worker) return this.pipeline?.process(grabbed, frame.t, prior) ?? null;
    const id = this.nextId++;
    // A copy the worker owns: the grabber may reuse its buffer
    const pixels = grabbed.data.slice();
    return new Promise(resolve => {
      this.pending.set(id, resolve);
      worker.postMessage(
        { type: 'frame', id, t: frame.t, width: grabbed.width, height: grabbed.height, buffer: pixels.buffer, prior },
        [pixels.buffer]
      );
    });
  }

  setLessonPrior(prior: ((t: number) => Pose10) | null): void {
    this.prior = prior;
  }

  dispose(): void {
    this.disposed = true;
    this.options.worker?.terminate();
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
    this.ready?.reject(new Error('The Dark-mode tracker was closed before it started.'));
    this.ready = null;
    this.pipeline = null;
  }
}

/** The Dark-mode worker (blob.worker.ts), as a module worker Vite bundles. */
export function createBlobWorker(): WorkerLike {
  return new Worker(new URL('./blob.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/** What the grabber draws on: an OffscreenCanvas, or a stand-in in tests. */
export interface GrabCanvas {
  getContext(id: '2d', options: { willReadFrequently: boolean }): GrabContext | null;
}

export interface GrabContext {
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
}

export interface GrabberOptions {
  /** Pixels wide; the height keeps the camera's aspect. */
  width: number;
  createCanvas: (width: number, height: number) => GrabCanvas;
}

const offscreen = (width: number, height: number): GrabCanvas =>
  new OffscreenCanvas(width, height) as unknown as GrabCanvas;

/** Grabs each camera frame `width` pixels wide (320 by default: every pixel can be looked at in well under a frame). */
export function createVideoGrabber(options: Partial<GrabberOptions> = {}): FrameGrab {
  const width = options.width ?? 320;
  const createCanvas = options.createCanvas ?? offscreen;
  let canvas: { context: GrabContext; height: number } | null = null;
  return frame => {
    if (frame.width === 0 || frame.height === 0) return null;
    const height = Math.round((width * frame.height) / frame.width);
    if (canvas === null || canvas.height !== height) {
      const context = createCanvas(width, height).getContext('2d', { willReadFrequently: true });
      if (context === null) return null;
      canvas = { context, height };
    }
    canvas.context.drawImage(frame.video, 0, 0, width, height);
    return { data: canvas.context.getImageData(0, 0, width, height).data, width, height };
  };
}
