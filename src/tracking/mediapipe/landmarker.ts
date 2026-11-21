/**
 * MediaPipe's Hand Landmarker, loaded from the app's own files so it works
 * offline: the WASM runtime vite.config.ts copies to /mediapipe/wasm/ and
 * the model scripts/fetch-model.mjs puts in /models/. The library is
 * imported only when Lit mode starts, keeping it out of the first load.
 */

import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

export const WASM_FILESET = {
  wasmLoaderPath: '/mediapipe/wasm/vision_wasm_internal.js',
  wasmBinaryPath: '/mediapipe/wasm/vision_wasm_internal.wasm',
};
export const MODEL_PATH = '/models/hand_landmarker.task';

export type Delegate = 'GPU' | 'CPU';

/** The part of HandLandmarker the tracker uses. */
export interface Landmarker {
  detectForVideo(video: HTMLVideoElement, timestamp: number): Pick<HandLandmarkerResult, 'landmarks' | 'handedness'>;
  close(): void;
}

export type LandmarkerFactory = (delegate: Delegate) => Promise<Landmarker>;

/** The real Hand Landmarker: two hands, video mode, on `delegate`. */
export const createMediaPipeLandmarker: LandmarkerFactory = async delegate => {
  const { HandLandmarker } = await import('@mediapipe/tasks-vision');
  return HandLandmarker.createFromOptions(WASM_FILESET, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
};
