/** An Env for tests: a camera that does as told, clocks and frame loops driven by hand. */

import { type Mock, vi } from 'vitest';
import type { Camera, CameraResult } from '../camera/camera';
import type { Env, MetronomeLike } from '../env';
import type { FingertipTracker, TrackerFrame } from '../tracking/types';
import { type FakeCtx, fakeCtx } from './fakeCtx';

export interface FakeEnv extends Env {
  time: number;
  ctx: FakeCtx;
  camera: Camera & { stop: ReturnType<typeof vi.fn>; end(): void };
  tracker: FingertipTracker & { init: Mock; process: Mock; dispose: Mock };
  metronomes: (MetronomeLike & { update: ReturnType<typeof vi.fn> })[];
  /** Runs the next display frame at `time`. */
  frame(): void;
  /** Delivers a camera frame at `time`. */
  cameraFrame(): void;
  /** Lets pending promises settle. */
  settle(): Promise<void>;
}

export function fakeEnv(overrides: Partial<Env> = {}): FakeEnv {
  const queue: ((now: number) => void)[] = [];
  const cameraListeners = new Set<() => void>();
  let videoFrame: ((t: number) => void) | null = null;
  const ctx = fakeCtx();
  const camera = {
    stream: {} as MediaStream,
    track: {} as MediaStreamTrack,
    width: 1280,
    height: 720,
    deviceId: 'cam-1',
    onEnded: (listener: () => void) => {
      cameraListeners.add(listener);
      return () => cameraListeners.delete(listener);
    },
    stop: vi.fn(),
    end: () => {
      for (const l of cameraListeners) l();
    },
  };
  const tracker = {
    kind: 'landmarks' as const,
    init: vi.fn(async () => {}),
    process: vi.fn(
      async (frame: { t: number }): Promise<TrackerFrame> => ({
        t: frame.t,
        tips: new Array(10).fill(null),
        handScale: {},
      })
    ),
    dispose: vi.fn(),
  };
  const env: FakeEnv = {
    time: 0,
    ctx,
    camera,
    tracker,
    metronomes: [],
    openCamera: vi.fn(async (): Promise<CameraResult> => ({ ok: true, camera })),
    listCameras: vi.fn(async () => [{ deviceId: 'cam-1', label: 'FaceTime HD Camera' }]),
    attach: vi.fn(async () => {}),
    createTracker: vi.fn(() => tracker),
    now: () => env.time,
    wallClock: () => 1_763_726_400_000 + env.time,
    frames: { request: cb => queue.push(cb), cancel: vi.fn() },
    videoFrames: vi.fn((_video, onFrame) => {
      videoFrame = onFrame;
      return () => {
        videoFrame = null;
      };
    }),
    context2d: () => ctx,
    sprites: () => ({ get: () => ({}) as CanvasImageSource }),
    metronome: () => {
      const m = { update: vi.fn(), dispose: vi.fn() };
      env.metronomes.push(m);
      return m;
    },
    randomId: () => 'session-1',
    frame() {
      const next = queue.shift();
      next?.(env.time);
    },
    cameraFrame() {
      videoFrame?.(env.time);
    },
    settle: () => new Promise(resolve => setTimeout(resolve, 0)),
    ...overrides,
  };
  return env;
}
