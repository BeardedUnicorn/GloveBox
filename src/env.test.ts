import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Camera } from './camera/camera';
import { Metronome } from './engine/metronome';
import { browserEnv } from './env';
import { GlowSprites } from './render/glowSprites';
import { DEFAULT_SETTINGS } from './state/settings';
import { MediaPipeHandTracker } from './tracking/mediapipe/handTracker';

afterEach(() => vi.unstubAllGlobals());

describe('the browser environment', () => {
  test('cameras come from navigator.mediaDevices', async () => {
    const getUserMedia = vi.fn(async () => Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' })));
    const enumerateDevices = vi.fn(async () => []);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices } });
    expect(await browserEnv.openCamera('cam-1')).toMatchObject({ ok: false, problem: 'denied' });
    expect(getUserMedia.mock.calls[0]).toMatchObject([{ video: { deviceId: { exact: 'cam-1' } } }]);
    expect(await browserEnv.openCamera(null)).toMatchObject({ ok: false });
    expect(await browserEnv.listCameras()).toEqual([]);
  });

  test('attaching plays the camera on the video, muted and inline', async () => {
    const video = { play: vi.fn(async () => {}) } as unknown as HTMLVideoElement;
    const camera = { stream: { id: 'stream' } } as unknown as Camera;
    await browserEnv.attach(video, camera);
    expect(video).toMatchObject({ srcObject: camera.stream, muted: true, playsInline: true });
    expect(video.play).toHaveBeenCalled();
  });

  test('the tracker is MediaPipe, with the chosen delegate and handedness', () => {
    const tracker = browserEnv.createTracker({ ...DEFAULT_SETTINGS, swapHandedness: true });
    expect(tracker).toBeInstanceOf(MediaPipeHandTracker);
    expect((tracker as MediaPipeHandTracker).swapHandedness).toBe(true);
  });

  test('clocks, frames, canvases, sprites, sound and ids', () => {
    expect(browserEnv.now()).toBeGreaterThanOrEqual(0);
    expect(Math.abs(browserEnv.wallClock() - Date.now())).toBeLessThan(1000);
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    browserEnv.frames.request(() => {});
    expect(raf).toHaveBeenCalled();
    const request = vi.fn(() => 3);
    const cancel = vi.fn();
    const stop = browserEnv.videoFrames(
      { currentTime: 0, requestVideoFrameCallback: request, cancelVideoFrameCallback: cancel },
      () => {}
    );
    stop();
    expect(cancel).toHaveBeenCalledWith(3);
    const ctx = {};
    expect(browserEnv.context2d({ getContext: () => ctx } as unknown as HTMLCanvasElement)).toBe(ctx);
    expect(browserEnv.sprites()).toBeInstanceOf(GlowSprites);
    expect(browserEnv.metronome()).toBeInstanceOf(Metronome);
    expect(browserEnv.randomId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
