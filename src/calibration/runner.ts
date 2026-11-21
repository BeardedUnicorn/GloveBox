/**
 * Calibration's working parts, apart from React: the camera, a calibration
 * source (sources.ts) fed each camera frame, and the performer's
 * fingertips or lights drawn so they can see what the camera sees.
 */

import type { Camera } from '../camera/camera';
import { frameRect, type Size } from '../core/coords';
import type { Env } from '../env';
import type { Ctx2D } from '../render/ctx';
import { drawOverlay, type Sprites } from '../render/overlayRenderer';
import type { Settings } from '../state/settings';
import { TrackingPipeline } from '../tracking/pipeline';
import type { CalibrationSource, CalibrationView, SourceFrame } from './sources';

export interface RunnerState {
  phase: 'opening' | 'running' | 'problem';
  message: string | null;
  view: CalibrationView | null;
}

export interface RunnerDeps {
  env: Env;
  settings: Settings;
  source: CalibrationSource;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  layout(): { size: Size; dpr: number };
  /** Called once, with the settings the calibration found. */
  onResult(result: Partial<Settings>): void;
}

export class CalibrationRunner {
  private state: RunnerState = { phase: 'opening', message: null, view: null };
  private readonly listeners = new Set<() => void>();
  private readonly ctx: Ctx2D | null;
  private readonly sprites: Sprites;
  private readonly pipeline = new TrackingPipeline();
  private camera: Camera | null = null;
  private latest: SourceFrame | null = null;
  private busy = false;
  private reported = false;
  private frameId: number | null = null;
  private stopFrames: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly deps: RunnerDeps) {
    this.ctx = deps.env.context2d(deps.canvas);
    this.sprites = deps.env.sprites();
  }

  getState = (): RunnerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<RunnerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  async open(): Promise<void> {
    const { env, source } = this.deps;
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
    try {
      await env.attach(this.deps.video, result.camera);
      await source.init();
    } catch (error) {
      this.set({ phase: 'problem', message: `Tracking couldn't start: ${String(error)}` });
      return;
    }
    if (this.disposed) return;
    this.stopFrames?.();
    this.stopFrames = env.videoFrames(this.deps.video, t => void this.track(t));
    this.set({ phase: 'running' });
    if (this.frameId === null) this.draw();
  }

  private async track(t: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const camera = this.camera!;
    const out = await this.deps.source.process({
      video: this.deps.video,
      t,
      width: camera.width,
      height: camera.height,
    });
    this.busy = false;
    if (!out || this.disposed) return;
    const smoothed = out.tips ? this.pipeline.push({ t, tips: out.tips, handScale: {} }).tips : null;
    this.latest = { ...out, tips: smoothed };
    this.set({ view: out.view });
    if (out.result && !this.reported) {
      this.reported = true;
      this.deps.onResult(out.result);
    }
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
    this.deps.source.dispose();
    this.camera?.stop();
  }
}
