import { describe, expect, test, vi } from 'vitest';
import {
  cameraConstraints,
  cameraMessage,
  cameraProblem,
  isVirtualCamera,
  listCameras,
  openCamera,
  preferredCamera,
} from '../camera/camera';
import { eachVideoFrame, type FrameScheduler, type VideoLike } from '../camera/frames';
import { SLOTS } from '../core/types';
import { identifyHands, MediaPipeHandTracker, TIP_LANDMARKS } from './mediapipe/handTracker';
import { createMediaPipeLandmarker, type Landmarker, MODEL_PATH, WASM_FILESET } from './mediapipe/landmarker';
import { TrackingPipeline } from './pipeline';
import { SyntheticTracker } from './synthetic/syntheticTracker';
import { type CameraFrame, emptyFrame } from './types';

vi.mock('@mediapipe/tasks-vision', () => ({
  HandLandmarker: { createFromOptions: vi.fn(async (fileset: unknown, options: unknown) => ({ fileset, options })) },
}));

// ── Camera ──────────────────────────────────────────────────────────────────

function fakeTrack(settings: MediaTrackSettings, label?: string) {
  const listeners = new Set<() => void>();
  return {
    label,
    getSettings: () => settings,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    stop: vi.fn(),
    end: () => {
      for (const l of listeners) l();
    },
  };
}

function fakeDevices(result: () => Promise<unknown>, devices: Partial<MediaDeviceInfo>[] = []) {
  return {
    getUserMedia: vi.fn(result),
    enumerateDevices: vi.fn(async () => devices),
  } as unknown as MediaDevices & { getUserMedia: ReturnType<typeof vi.fn> };
}

describe('the camera', () => {
  test('opens the front camera at 720p without sound, or a chosen one', async () => {
    expect(cameraConstraints()).toEqual({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 }, facingMode: 'user' },
    });
    expect(cameraConstraints('cam-2').video).toMatchObject({ deviceId: { exact: 'cam-2' } });
  });

  test('a granted camera reports its size, stops, and says when it goes away', async () => {
    const track = fakeTrack({ width: 1920, height: 1080, deviceId: 'cam-1' }, 'FaceTime HD Camera');
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    const devices = fakeDevices(async () => stream);
    const result = await openCamera(devices, 'cam-1');
    if (!result.ok) throw new Error('expected a camera');
    expect(devices.getUserMedia).toHaveBeenCalledWith(cameraConstraints('cam-1'));
    expect(result.camera).toMatchObject({ width: 1920, height: 1080, deviceId: 'cam-1', label: 'FaceTime HD Camera' });
    const ended = vi.fn();
    const off = result.camera.onEnded(ended);
    track.end();
    expect(ended).toHaveBeenCalledTimes(1);
    off();
    track.end();
    expect(ended).toHaveBeenCalledTimes(1);
    result.camera.stop();
    expect(track.stop).toHaveBeenCalled();
  });

  test('settings a camera leaves out get sensible defaults', async () => {
    const track = fakeTrack({});
    const result = await openCamera(fakeDevices(async () => ({ getVideoTracks: () => [track], getTracks: () => [] })));
    expect(result.ok && result.camera).toMatchObject({ width: 1280, height: 720, deviceId: '', label: '' });
  });

  test.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'not-found'],
    ['OverconstrainedError', 'not-found'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'in-use'],
    ['TypeError', 'unknown'],
  ])('a %s is a %s camera', async (name, problem) => {
    const result = await openCamera(fakeDevices(() => Promise.reject(Object.assign(new Error('no'), { name }))));
    expect(result).toEqual({ ok: false, problem, message: cameraMessage(problem as never) });
  });

  test('anything thrown that is not an error is an unknown problem', () => {
    expect(cameraProblem('nope')).toBe('unknown');
    expect(cameraProblem(null)).toBe('unknown');
    expect(cameraMessage('denied')).toMatch(/System Settings/);
  });

  test('a window without cameras says so', async () => {
    expect(await openCamera(undefined)).toMatchObject({ ok: false, problem: 'unsupported' });
    expect(await openCamera({} as MediaDevices)).toMatchObject({ ok: false, problem: 'unsupported' });
    expect(await listCameras(undefined)).toEqual([]);
  });

  test('lists cameras, naming those without labels and leaving out those the system hides', async () => {
    const devices = fakeDevices(
      async () => null,
      [
        { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
        { kind: 'videoinput', deviceId: 'a', label: 'FaceTime HD' },
        { kind: 'videoinput', deviceId: 'b', label: '' },
        { kind: 'videoinput', deviceId: '', label: '' },
      ]
    );
    expect(await listCameras(devices)).toEqual([
      { deviceId: 'a', label: 'FaceTime HD' },
      { deviceId: 'b', label: 'Camera 2' },
    ]);
  });
});

describe('the camera Automatic picks', () => {
  test('virtual cameras, and the order Automatic prefers', () => {
    for (const label of ['OBS Virtual Camera', 'Snap Camera', 'mmhmm', 'NDI Video', 'XSplit VCam']) {
      expect(isVirtualCamera(label), label).toBe(true);
    }
    for (const label of ['FaceTime HD Camera', 'MacBook Pro Camera', 'Logitech BRIO', 'Camera 1']) {
      expect(isVirtualCamera(label), label).toBe(false);
    }
    const obs = { deviceId: 'obs', label: 'OBS Virtual Camera' };
    const brio = { deviceId: 'brio', label: 'Logitech BRIO' };
    const facetime = { deviceId: 'ft', label: 'FaceTime HD Camera' };
    expect(preferredCamera([obs, brio, facetime])).toBe(facetime);
    expect(preferredCamera([obs, brio])).toBe(brio);
    expect(preferredCamera([obs])).toBe(obs);
    expect(preferredCamera([])).toBeUndefined();
  });

  function cameraOn(deviceId: string, label: string) {
    const track = fakeTrack({ deviceId }, label);
    return { track, stream: { getVideoTracks: () => [track], getTracks: () => [track] } };
  }

  /** A computer that offers `preferred` when asked for no camera in particular, and opens those in `opens` by id. */
  function computer(
    preferred: ReturnType<typeof cameraOn>,
    cameras: { deviceId: string; label: string }[],
    opens: Record<string, ReturnType<typeof cameraOn>> = {}
  ) {
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const id = ((constraints.video as MediaTrackConstraints).deviceId as { exact: string } | undefined)?.exact;
      if (!id) return preferred.stream;
      if (!opens[id]) throw Object.assign(new Error('busy'), { name: 'NotReadableError' });
      return opens[id].stream;
    });
    const enumerateDevices = vi.fn(async () => cameras.map(camera => ({ kind: 'videoinput', ...camera })));
    return { getUserMedia, enumerateDevices } as unknown as MediaDevices & {
      getUserMedia: typeof getUserMedia;
      enumerateDevices: typeof enumerateDevices;
    };
  }

  const OBS = { deviceId: 'obs', label: 'OBS Virtual Camera' };
  const FACETIME = { deviceId: 'ft', label: 'FaceTime HD Camera' };

  test('keeps a real camera the system offers, without looking further', async () => {
    const devices = computer(cameraOn('ft', 'FaceTime HD Camera'), [OBS, FACETIME]);
    const result = await openCamera(devices);
    expect(result.ok && result.camera.deviceId).toBe('ft');
    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(devices.enumerateDevices).not.toHaveBeenCalled();
  });

  test("swaps a virtual camera the system offers for the computer's own", async () => {
    const obs = cameraOn('obs', 'OBS Virtual Camera');
    const facetime = cameraOn('ft', 'FaceTime HD Camera');
    const devices = computer(obs, [OBS, FACETIME], { ft: facetime });
    const result = await openCamera(devices);
    expect(result.ok && result.camera).toMatchObject({ deviceId: 'ft', label: 'FaceTime HD Camera' });
    expect(devices.getUserMedia).toHaveBeenLastCalledWith(cameraConstraints('ft'));
    expect(obs.track.stop).toHaveBeenCalled();
    expect(facetime.track.stop).not.toHaveBeenCalled();
  });

  test.each([
    ['it is the only camera', [OBS]],
    ['no camera is listed', []],
  ])('keeps the virtual camera when %s', async (_, cameras) => {
    const obs = cameraOn('obs', 'OBS Virtual Camera');
    const devices = computer(obs, cameras);
    const result = await openCamera(devices);
    expect(result.ok && result.camera.deviceId).toBe('obs');
    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(obs.track.stop).not.toHaveBeenCalled();
  });

  test("keeps the virtual camera when the real one won't open", async () => {
    const obs = cameraOn('obs', 'OBS Virtual Camera');
    const devices = computer(obs, [OBS, FACETIME]);
    const result = await openCamera(devices);
    expect(result.ok && result.camera.deviceId).toBe('obs');
    expect(devices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(obs.track.stop).not.toHaveBeenCalled();
  });

  test('a camera chosen in Settings is used even when it is virtual', async () => {
    const obs = cameraOn('obs', 'OBS Virtual Camera');
    const devices = computer(obs, [OBS, FACETIME], { obs });
    const result = await openCamera(devices, 'obs');
    expect(result.ok && result.camera.deviceId).toBe('obs');
    expect(devices.enumerateDevices).not.toHaveBeenCalled();
  });
});

describe('camera frames', () => {
  test('with requestVideoFrameCallback: once per frame, at its capture time', () => {
    const callbacks: ((now: number, meta: { captureTime?: number; mediaTime: number }) => void)[] = [];
    const cancel = vi.fn();
    let ids = 0;
    const video: VideoLike = {
      currentTime: 0,
      requestVideoFrameCallback: cb => {
        callbacks.push(cb);
        return ++ids;
      },
      cancelVideoFrameCallback: cancel,
    };
    const seen: number[] = [];
    const stop = eachVideoFrame(video, t => seen.push(t));
    callbacks.shift()!(100, { captureTime: 90, mediaTime: 0 });
    callbacks.shift()!(116, { mediaTime: 0.016 });
    expect(seen).toEqual([90, 116]);
    stop();
    expect(cancel).toHaveBeenCalledWith(3);
    callbacks.shift()!(132, { mediaTime: 0.032 }); // arrives after stop
    expect(seen).toEqual([90, 116]);
  });

  test('without it: an animation-frame loop, only when the video moved on', () => {
    const queue: ((now: number) => void)[] = [];
    const scheduler: FrameScheduler = { request: cb => queue.push(cb), cancel: vi.fn() };
    const video: VideoLike = { currentTime: 0 };
    const seen: number[] = [];
    const stop = eachVideoFrame(video, t => seen.push(t), scheduler);
    queue.shift()!(10);
    queue.shift()!(20); // same video time
    video.currentTime = 0.033;
    queue.shift()!(30);
    expect(seen).toEqual([10, 30]);
    stop();
    expect(scheduler.cancel).toHaveBeenCalled();
    queue.shift()!(40);
    expect(seen).toEqual([10, 30]);
  });

  test('the default scheduler is the browser animation frame', () => {
    const raf = vi.fn(() => 7);
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);
    const stop = eachVideoFrame({ currentTime: 0 }, () => {});
    stop();
    expect(raf).toHaveBeenCalled();
    expect(caf).toHaveBeenCalledWith(7);
    vi.unstubAllGlobals();
  });
});

// ── MediaPipe ───────────────────────────────────────────────────────────────

describe('the hand landmarker', () => {
  test('loads the bundled runtime and model, for two hands in video mode', async () => {
    const made = (await createMediaPipeLandmarker('GPU')) as unknown as { fileset: unknown; options: unknown };
    expect(made.fileset).toEqual(WASM_FILESET);
    expect(made.options).toMatchObject({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    expect(WASM_FILESET.wasmBinaryPath).toMatch(/^\/mediapipe\/wasm\//);
  });
});

/** 21 raw landmarks for a hand whose wrist is at (u, v), fingertips 0.1 above it. */
const rawHand = (u: number, v: number) =>
  Array.from({ length: 21 }, (_, i) => ({
    x: u + (i % 5) * 0.01,
    y: i === 0 ? v : v - 0.05 - (TIP_LANDMARKS.includes(i as 4) ? 0.05 : 0),
    z: 0,
    visibility: 1,
  }));

const frame = (t: number): CameraFrame => ({ video: {} as HTMLVideoElement, t, width: 1600, height: 900 });

function fakeLandmarker(results: {
  landmarks: ReturnType<typeof rawHand>[];
  labels: string[];
}): Landmarker & { timestamps: number[] } {
  const timestamps: number[] = [];
  return {
    timestamps,
    detectForVideo: (_video, timestamp) => {
      timestamps.push(timestamp);
      return {
        landmarks: results.landmarks,
        handedness: results.labels.map((categoryName, index) => [{ categoryName, score: 0.9, index, displayName: '' }]),
      };
    },
    close: vi.fn(),
  };
}

describe('identifying hands', () => {
  const at = (x: number) => Array.from({ length: 21 }, () => ({ x, y: 0 }));

  test('trusts the labels, or swaps them', () => {
    const hands = [
      { label: 'Right', score: 1, points: at(0.3) },
      { label: 'Left', score: 1, points: at(-0.3) },
    ];
    expect(identifyHands(hands, false).map(h => h.hand)).toEqual(['R', 'L']);
    expect(identifyHands(hands, true).map(h => h.hand)).toEqual(['L', 'R']);
  });

  test('two hands with one label are told apart by position', () => {
    const same = [
      { label: 'Right', score: 1, points: at(-0.3) },
      { label: 'Right', score: 1, points: at(0.3) },
    ];
    expect(identifyHands(same, false).map(h => h.hand)).toEqual(['L', 'R']);
    expect(identifyHands([...same].reverse(), false).map(h => h.hand)).toEqual(['R', 'L']);
  });
});

describe('the Lit-mode tracker', () => {
  test("reports both hands' tips in stage space, with their scale and skeleton", async () => {
    const landmarker = fakeLandmarker({ landmarks: [rawHand(0.3, 0.6), rawHand(0.6, 0.6)], labels: ['Right', 'Left'] });
    const tracker = new MediaPipeHandTracker({ createLandmarker: async () => landmarker });
    expect(await tracker.process(frame(0))).toBeNull(); // not started yet
    await tracker.init();
    expect(tracker.delegate).toBe('GPU');
    const out = (await tracker.process(frame(100)))!;
    // The camera's left (u 0.3) is the performer's right: +x
    expect(out.tips[7]!.x).toBeGreaterThan(0);
    expect(out.tips[2]!.x).toBeLessThan(0);
    expect(out.tips.every(Boolean)).toBe(true);
    expect(out.tips[5]!.confidence).toBe(0.9);
    expect(out.handScale.R).toBeCloseTo(0.05 * 1, 1);
    expect(out.skeleton?.R).toHaveLength(21);
    tracker.dispose();
    expect(landmarker.close).toHaveBeenCalled();
    expect(await tracker.process(frame(200))).toBeNull();
  });

  test('timestamps always increase, as MediaPipe requires', async () => {
    const landmarker = fakeLandmarker({ landmarks: [], labels: [] });
    const tracker = new MediaPipeHandTracker({ createLandmarker: async () => landmarker });
    await tracker.init();
    await tracker.process(frame(100));
    await tracker.process(frame(100));
    await tracker.process(frame(50));
    expect(landmarker.timestamps).toEqual([100, 101, 102]);
    expect((await tracker.process(frame(300)))!.tips).toEqual(emptyFrame(300).tips);
  });

  test("falls back to the CPU when the GPU won't start", async () => {
    const landmarker = fakeLandmarker({ landmarks: [], labels: [] });
    const create = vi.fn(async (delegate: string) => {
      if (delegate === 'GPU') throw new Error('no WebGL');
      return landmarker;
    });
    const tracker = new MediaPipeHandTracker({ createLandmarker: create });
    await tracker.init();
    expect(tracker.delegate).toBe('CPU');
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("a CPU that won't start is an error", async () => {
    const tracker = new MediaPipeHandTracker({
      delegate: 'CPU',
      createLandmarker: async () => {
        throw new Error('no WASM');
      },
    });
    await expect(tracker.init()).rejects.toThrow('no WASM');
  });

  test('uses the real landmarker unless given one, and can swap hands', async () => {
    const tracker = new MediaPipeHandTracker({ swapHandedness: true });
    expect(tracker.swapHandedness).toBe(true);
    await tracker.init();
    expect(tracker.delegate).toBe('GPU');
  });
});

// ── Pipeline and the synthetic performer ────────────────────────────────────

describe('the tracking pipeline', () => {
  const tipsAt = (x: number) => SLOTS.map(() => ({ x, y: 0, confidence: 1 }));

  test('smooths tips and passes hand scale on', () => {
    const pipeline = new TrackingPipeline();
    const first = pipeline.push({ t: 0, tips: tipsAt(0), handScale: { L: 0.07 } });
    expect(first.tips[0]).toEqual({ x: 0, y: 0, confidence: 1 });
    const second = pipeline.push({ t: 16, tips: tipsAt(0.1), handScale: {} });
    expect(second.tips[0]!.x).toBeGreaterThan(0);
    expect(second.tips[0]!.x).toBeLessThan(0.1);
    expect(second.handScale).toEqual({ L: 0.07 });
  });

  test('carries a lost tip along its motion, fading, then lets it go', () => {
    const pipeline = new TrackingPipeline({ graceMs: 100 });
    for (let t = 0; t <= 160; t += 16) pipeline.push({ t, tips: tipsAt(t / 1000), handScale: {} });
    const held = pipeline.push({ ...emptyFrame(210), handScale: {} });
    expect(held.tips[0]!.predicted).toBe(true);
    expect(held.tips[0]!.x).toBeGreaterThan(0.15);
    expect(held.tips[0]!.confidence).toBeCloseTo(0.5, 1);
    expect(pipeline.push(emptyFrame(300)).tips[0]).toBeNull();
    // Seen again: starts fresh, unsmoothed
    expect(pipeline.push({ t: 316, tips: tipsAt(0.9), handScale: {} }).tips[0]!.x).toBe(0.9);
  });

  test("a tracker's own guesses are treated as unseen; a repeated frame doesn't change velocity", () => {
    const pipeline = new TrackingPipeline();
    pipeline.push({ t: 0, tips: tipsAt(0), handScale: {} });
    pipeline.push({ t: 0, tips: tipsAt(0), handScale: {} });
    const guess = SLOTS.map(() => ({ x: 5, y: 5, confidence: 0.2, predicted: true }));
    expect(pipeline.push({ t: 20, tips: guess, handScale: {} }).tips[0]).toMatchObject({ x: 0, y: 0, predicted: true });
  });

  test('without smoothing, tips pass straight through (and still gap-hold)', () => {
    const pipeline = new TrackingPipeline({ oneEuro: null });
    pipeline.push({ t: 0, tips: tipsAt(0), handScale: {} });
    expect(pipeline.push({ t: 16, tips: tipsAt(0.1), handScale: {} }).tips[0]!.x).toBe(0.1);
    expect(pipeline.push(emptyFrame(32)).tips[0]!.predicted).toBe(true);
  });

  test('a tip never seen stays empty; reset forgets everything', () => {
    const pipeline = new TrackingPipeline();
    expect(pipeline.push(emptyFrame(0)).tips[3]).toBeNull();
    pipeline.push({ t: 10, tips: tipsAt(0.5), handScale: { R: 0.06 } });
    pipeline.reset();
    const after = pipeline.push(emptyFrame(20));
    expect(after.tips[3]).toBeNull();
    expect(after.handScale).toEqual({});
  });
});

describe('the synthetic performer', () => {
  const pose = (t: number) => SLOTS.map(slot => (slot < 5 ? { x: t / 1000, y: slot } : null));

  test('follows the pose exactly by default', async () => {
    const tracker = new SyntheticTracker({ poseAt: pose });
    await tracker.init();
    const out = await tracker.process({ t: 500 });
    expect(out.tips[0]).toEqual({ x: 0.5, y: 0, confidence: 1 });
    expect(out.tips[9]).toBeNull();
    expect(out.handScale).toEqual({ L: 0.07, R: 0.07 });
    tracker.dispose();
    expect(tracker.kind).toBe('landmarks');
  });

  test('can lag, jitter and drop tips', async () => {
    const tracker = new SyntheticTracker({
      poseAt: pose,
      lagMs: 100,
      noise: 0.01,
      dropout: 0.5,
      random: () => 0.75,
      handScale: 0.1,
    });
    const out = await tracker.process({ t: 500 });
    expect(out.tips[0]!.x).toBeCloseTo(0.4 + 0.005);
    const dropped = await new SyntheticTracker({ poseAt: pose, dropout: 0.5, random: () => 0.25 }).process({ t: 0 });
    expect(dropped.tips[0]).toBeNull();
  });
});
