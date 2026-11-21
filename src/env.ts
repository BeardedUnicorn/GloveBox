/**
 * Everything GloveBox takes from the browser that tests need to replace:
 * the camera, the clocks, frame loops, canvas contexts, audio and trackers.
 * Screens get it from EnvContext (src/envContext.tsx); tests provide fakes.
 */

import { type Camera, type CameraInfo, type CameraResult, listCameras, openCamera } from './camera/camera';
import { animationFrames, eachVideoFrame, type FrameScheduler, type VideoLike } from './camera/frames';
import { Metronome } from './engine/metronome';
import type { Ctx2D } from './render/ctx';
import { GlowSprites } from './render/glowSprites';
import type { Sprites } from './render/overlayRenderer';
import type { Settings } from './state/settings';
import { MediaPipeHandTracker } from './tracking/mediapipe/handTracker';
import type { FingertipTracker } from './tracking/types';

export interface MetronomeLike {
  update(beat: number, beatsPerLoop: number): void;
  dispose(): void;
}

export interface Env {
  openCamera(deviceId: string | null): Promise<CameraResult>;
  listCameras(): Promise<CameraInfo[]>;
  /** Puts the camera on a <video> and starts it playing. */
  attach(video: HTMLVideoElement, camera: Camera): Promise<void>;
  /** The tracker the settings ask for. */
  createTracker(settings: Settings): FingertipTracker;
  /** Monotonic ms (performance.now): the clock frames and lessons run on. */
  now(): number;
  /** Wall-clock ms (Date.now): when sessions happened. */
  wallClock(): number;
  frames: FrameScheduler;
  videoFrames(video: VideoLike, onFrame: (t: number) => void): () => void;
  context2d(canvas: HTMLCanvasElement): Ctx2D | null;
  sprites(): Sprites;
  metronome(): MetronomeLike;
  randomId(): string;
}

export const browserEnv: Env = {
  openCamera: deviceId => openCamera(navigator.mediaDevices, deviceId ?? undefined),
  listCameras: () => listCameras(navigator.mediaDevices),
  async attach(video, camera) {
    video.srcObject = camera.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
  },
  createTracker: settings =>
    new MediaPipeHandTracker({ delegate: settings.delegate, swapHandedness: settings.swapHandedness }),
  now: () => performance.now(),
  wallClock: () => Date.now(),
  frames: animationFrames,
  videoFrames: (video, onFrame) => eachVideoFrame(video, onFrame),
  context2d: canvas => canvas.getContext('2d') as unknown as Ctx2D | null,
  sprites: () => new GlowSprites(),
  metronome: () => new Metronome(),
  randomId: () => crypto.randomUUID(),
};
