/**
 * Calling back once per new camera frame. WebKit (Safari 15.4+) and
 * Chromium have requestVideoFrameCallback, which fires exactly when a frame
 * arrives and says when it was captured; elsewhere a requestAnimationFrame
 * loop watches the video's time advance.
 */

/** requestAnimationFrame, injectable. */
export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(id: number): void;
}

export const animationFrames: FrameScheduler = {
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id),
};

/** The parts of a <video> this needs. */
export interface VideoLike {
  currentTime: number;
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: { captureTime?: number; mediaTime: number }) => void
  ) => number;
  cancelVideoFrameCallback?: (id: number) => void;
}

/** Calls `onFrame(t)` with each new frame's capture time (ms) until the returned stop is called. */
export function eachVideoFrame(
  video: VideoLike,
  onFrame: (t: number) => void,
  scheduler: FrameScheduler = animationFrames
): () => void {
  let stopped = false;
  if (video.requestVideoFrameCallback && video.cancelVideoFrameCallback) {
    const request = video.requestVideoFrameCallback.bind(video);
    const cancel = video.cancelVideoFrameCallback.bind(video);
    let id = 0;
    const tick = (now: number, metadata: { captureTime?: number }) => {
      if (stopped) return;
      onFrame(metadata.captureTime ?? now);
      id = request(tick);
    };
    id = request(tick);
    return () => {
      stopped = true;
      cancel(id);
    };
  }
  let lastTime = -1;
  let id = 0;
  const tick = (now: number) => {
    if (stopped) return;
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      onFrame(now);
    }
    id = scheduler.request(tick);
  };
  id = scheduler.request(tick);
  return () => {
    stopped = true;
    scheduler.cancel(id);
  };
}
