/**
 * Calibration's working parts, apart from React: the camera, the tracker,
 * and each frame handed to a calibration step machine, with the
 * performer's fingertips drawn so they can see what the camera sees.
 */

import type { Camera } from '../camera/camera';
import type { Size } from '../core/coords';
import { frameRect } from '../core/coords';
import type { Env } from '../env';
import type { Ctx2D } from '../render/ctx';
import { drawOverlay, type Sprites } from '../render/overlayRenderer';
import type { Settings } from '../state/settings';
import { TrackingPipeline } from '../tracking/pipeline';
import type { FingertipTracker, TrackerFrame } from '../tracking/types';

export interface RunnerState<S> {
  phase: 'opening' | 'running' | 'problem';
  message: string | null;
  step: S | null;
}

export interface RunnerDeps<S> {
  env: Env;
  settings: Settings;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  layout(): { size: Size; dpr: number };
  /** One tracked frame into the calibration; returns its state. */
  feed(frame: TrackerFrame): S;
}

export class CalibrationRunner<S> {
  private state: RunnerState<S> = { phase: 'opening', message: null, step: null };
  private readonly listeners = new Set<() => void>();
  private readonly ctx: Ctx2D | null;
  private readonly sprites: Sprites;
  private readonly pipeline = new TrackingPipeline();
  private camera: Camera | null = null;
  private tracker: FingertipTracker | null = null;
  private latest: TrackerFrame | null = null;
  private busy = false;
  private frameId: number | null = null;
  private stopFrames: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly deps: RunnerDeps<S>) {
    this.ctx = deps.env.context2d(deps.canvas);
    this.sprites = deps.env.sprites();
  }

  getState = (): RunnerState<S> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<RunnerState<S>>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  async open(): Promise<void> {
    const { env } = this.deps;
    this.set({ phase: 'opening', message: null });
    const result = await env.openCamera(this.deps.settings.cameraId);
    if (this.disposed) {
      if (result.ok) result.camera.stop();
      return;
    }
    if (!result.ok) {
      this.set({ phase: 'problem', message: result.message });
      return;
    }
    this.camera = result.camera;
    const tracker = env.createTracker(this.deps.settings);
    try {
      await env.attach(this.deps.video, result.camera);
      await tracker.init();
    } catch (error) {
      this.set({ phase: 'problem', message: `Hand tracking couldn't start: ${String(error)}` });
      return;
    }
    if (this.disposed) {
      tracker.dispose();
      return;
    }
    this.tracker = tracker;
    this.stopFrames = env.videoFrames(this.deps.video, t => void this.track(t));
    this.set({ phase: 'running' });
    this.draw();
  }

  private async track(t: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const camera = this.camera!;
    const raw = await this.tracker!.process({ video: this.deps.video, t, width: camera.width, height: camera.height });
    this.busy = false;
    if (!raw || this.disposed) return;
    this.latest = this.pipeline.push(raw);
    this.set({ step: this.deps.feed(raw) });
  }

  private draw = (): void => {
    if (this.disposed) return;
    this.frameId = this.deps.env.frames.request(this.draw);
    const ctx = this.ctx;
    if (!ctx) return;
    const { size, dpr } = this.deps.layout();
    const camera = this.camera!;
    drawOverlay(
      ctx,
      {
        view: this.deps.settings.view,
        rect: frameRect({ width: camera.width, height: camera.height }, size),
        size,
        dpr,
        palette: this.deps.settings.palette,
        activeSlots: [],
        targets: [],
        ghost: [],
        radius: { L: 0.02, R: 0.02 },
        hits: [],
        tips: this.latest?.tips ?? null,
        trail: [],
        skeleton: this.latest?.skeleton,
        lights: this.latest?.lights,
      },
      this.sprites
    );
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== null) this.deps.env.frames.cancel(this.frameId);
    this.stopFrames?.();
    this.tracker?.dispose();
    this.camera?.stop();
  }
}
