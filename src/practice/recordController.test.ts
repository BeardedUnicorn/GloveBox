import { describe, expect, test, vi } from 'vitest';
import type { CameraResult } from '../camera/camera';
import { SLOTS } from '../core/types';
import { DEFAULT_SETTINGS, type Settings } from '../state/settings';
import { type FakeEnv, fakeEnv } from '../test/fakeEnv';
import type { TrackerFrame } from '../tracking/types';
import { COUNT_IN_BEATS, MAX_TAKE_MS, RecordController, type RecordDeps } from './recordController';

const BPM = 120; // 500 ms a beat
const MS_PER_BEAT = 60_000 / BPM;
const START = COUNT_IN_BEATS * MS_PER_BEAT; // the take starts this long after Record

/** The right hand circling once a second (two beats at 120 bpm); the left hand unseen. */
function circling(visible: (t: number) => boolean = () => true) {
  return async (frame: { t: number }): Promise<TrackerFrame> => {
    const angle = (2 * Math.PI * frame.t) / 1000;
    return {
      t: frame.t,
      tips: SLOTS.map(slot =>
        slot >= 5 && visible(frame.t)
          ? { x: 0.2 + (slot - 5) * 0.03 + 0.1 * Math.cos(angle), y: 0.1 * Math.sin(angle), confidence: 1 }
          : null
      ),
      handScale: {},
    };
  };
}

function setup(settings: Partial<Settings> = {}, env: FakeEnv = fakeEnv(), extra: Partial<RecordDeps> = {}) {
  env.tracker.process.mockImplementation(circling());
  const controller = new RecordController({
    env,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    video: { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement,
    canvas: {} as HTMLCanvasElement,
    layout: () => ({ size: { width: 1280, height: 720 }, dpr: 1 }),
    nominalSpan: 0.17,
    ...extra,
  });
  return { controller, env };
}

async function ready(settings: Partial<Settings> = {}, env?: FakeEnv) {
  const s = setup(settings, env);
  await s.controller.open();
  s.controller.setBpm(BPM);
  return s;
}

/** Runs camera and display frames until `until`, every `step` ms. */
async function runUntil(env: FakeEnv, until: number, step = 50) {
  while (env.time < until) {
    env.time += step;
    env.cameraFrame();
    await env.settle();
    env.frame();
  }
}

/** A take of `beats` beats, from Record to Stop. */
async function take(controller: RecordController, env: FakeEnv, beats: number) {
  controller.record();
  const start = env.time + START;
  await runUntil(env, start + beats * MS_PER_BEAT);
  controller.stop();
  return start;
}

describe('opening', () => {
  test('opens the camera and Lit-mode tracking, then waits to record', async () => {
    const { controller, env } = setup({ tracker: 'dark', cameraId: 'cam-2' });
    const phases: string[] = [];
    controller.subscribe(() => phases.push(controller.getState().phase));
    await controller.open();
    expect(env.openCamera).toHaveBeenCalledWith('cam-2');
    expect(env.createTracker).toHaveBeenCalledWith(expect.objectContaining({ tracker: 'lit' }));
    expect(phases).toEqual(['opening', 'setup']);
    // Live fingertips are drawn while waiting
    env.time = 10;
    env.cameraFrame();
    await env.settle();
    env.frame();
    expect(env.ctx.named('drawImage').length).toBeGreaterThan(0);
  });

  test("a camera that won't open is a problem", async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'denied', message: 'Turn it on.' }) });
    const { controller } = await ready({}, env);
    expect(controller.getState()).toMatchObject({ phase: 'problem', message: 'Turn it on.' });
  });

  test("hand tracking that won't start is a problem", async () => {
    const env = fakeEnv();
    env.tracker.init.mockRejectedValueOnce(new Error('no WASM'));
    const { controller } = await ready({}, env);
    expect(controller.getState()).toMatchObject({
      phase: 'problem',
      message: "Hand tracking couldn't start: Error: no WASM",
    });
  });

  test('trying again reuses the running loop', async () => {
    const { controller, env } = await ready();
    const stop = vi.fn();
    (env.videoFrames as ReturnType<typeof vi.fn>).mockReturnValueOnce(stop);
    await controller.open();
    await controller.open();
    expect(stop).toHaveBeenCalled();
    expect(controller.getState().phase).toBe('setup');
  });

  test('closing while the camera opens stops it when it arrives', async () => {
    let resolve: (result: CameraResult) => void = () => {};
    const env = fakeEnv({ openCamera: () => new Promise(r => (resolve = r)) });
    const { controller } = setup({}, env);
    const opening = controller.open();
    controller.dispose();
    resolve({ ok: true, camera: env.camera });
    await opening;
    expect(env.camera.stop).toHaveBeenCalled();
    expect(env.attach).not.toHaveBeenCalled();
  });

  test('closing while the camera is refused just stops', async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'denied', message: 'no' }) });
    const { controller } = setup({}, env);
    const opening = controller.open();
    controller.dispose();
    await opening;
    expect(controller.getState().phase).toBe('opening');
  });

  test('closing while the tracker loads disposes it', async () => {
    const env = fakeEnv();
    const { controller } = setup({}, env);
    env.tracker.init.mockImplementationOnce(async () => controller.dispose());
    await controller.open();
    expect(env.tracker.dispose).toHaveBeenCalled();
    expect(env.videoFrames).not.toHaveBeenCalled();
  });

  test('closing before it opened, twice, is fine; an unsubscribed listener hears nothing', () => {
    const { controller, env } = setup();
    const listener = vi.fn();
    const off = controller.subscribe(listener);
    off();
    controller.dispose();
    controller.dispose();
    expect(env.frames.cancel).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('the tempo', () => {
  test('is set only while setting up, rounded and held to 40–200', async () => {
    const { controller } = setup();
    controller.setBpm(90);
    expect(controller.getState().bpm).toBe(80); // still opening
    await controller.open();
    controller.setBpm(10);
    expect(controller.getState().bpm).toBe(40);
    controller.setBpm(500);
    expect(controller.getState().bpm).toBe(200);
    controller.setBpm(99.6);
    expect(controller.getState().bpm).toBe(100);
  });
});

describe('a take', () => {
  test('counts in, records, and opens for review as a loop', async () => {
    const { controller, env } = await ready();
    controller.record();
    expect(controller.getState()).toMatchObject({ phase: 'counting', countIn: 4, beats: 0 });
    expect(env.metronomes).toHaveLength(1);
    controller.setBpm(60); // not while counting
    expect(controller.getState().bpm).toBe(BPM);
    await runUntil(env, MS_PER_BEAT);
    expect(controller.getState().countIn).toBe(3);
    await runUntil(env, START + 10);
    expect(controller.getState().phase).toBe('recording');
    expect(env.metronomes[0]!.update).toHaveBeenCalled();
    await runUntil(env, START + 4.5 * MS_PER_BEAT);
    expect(Math.floor(controller.getState().beats)).toBe(4);

    controller.stop();
    const state = controller.getState();
    expect(state.phase).toBe('review');
    expect(state.message).toBeNull();
    expect(env.metronomes[0]!.dispose).toHaveBeenCalled();
    // The hand comes round every two beats: the suggested loop is a whole number of those
    expect(state.trim.start).toBe(0);
    expect(state.trim.end % 2).toBe(0);
    expect(state.beats).toBeGreaterThan(4);

    const lesson = controller.buildLesson({ name: 'Circles', tier: 2, tags: ['recorded'] }, 'circles');
    expect(lesson).toMatchObject({
      id: 'circles',
      name: 'Circles',
      tier: 2,
      origin: 'recorded',
      activeSlots: [5, 6, 7, 8, 9],
    });
    expect(lesson?.timing.bpm).toBe(BPM);

    // Review plays the take back, drawn where it was performed
    env.ctx.calls.length = 0;
    env.time += 100;
    env.frame();
    expect(env.ctx.named('arc').length).toBe(5);
  });

  test('trimming is held inside the take', async () => {
    const { controller, env } = await ready();
    await take(controller, env, 5);
    const beats = controller.getState().beats;
    controller.setTrim(-3, 100);
    expect(controller.getState().trim).toEqual({ start: 0, end: beats });
    controller.setTrim(100, 0);
    expect(controller.getState().trim).toEqual({ start: beats - 1, end: beats });
    controller.setTrim(1, 3);
    expect(controller.getState().trim).toEqual({ start: 1, end: 3 });
  });

  test('trimming to a part where no hand was seen says so, and leaves nothing to save', async () => {
    const env = fakeEnv();
    const { controller } = await ready({}, env);
    // Seen for the first four beats of the take only
    env.tracker.process.mockImplementation(circling(t => t < START + 4 * MS_PER_BEAT));
    await take(controller, env, 5);
    expect(controller.getState().message).toBeNull();
    controller.setTrim(4, 5);
    expect(controller.getState().message).toMatch(/No fingertips were seen/);
    expect(controller.buildLesson({ name: 'x', tier: 1, tags: [] }, 'x')).toBeNull();
  });

  test('a take with no hand in it says so', async () => {
    const env = fakeEnv();
    const { controller } = await ready({ metronome: false }, env);
    env.tracker.process.mockImplementation(circling(() => false));
    await take(controller, env, 3);
    expect(controller.getState()).toMatchObject({ phase: 'review', message: expect.stringMatching(/No fingertips/) });
    expect(env.metronomes).toHaveLength(0);
    expect(controller.buildLesson({ name: 'x', tier: 1, tags: [] }, 'x')).toBeNull();
    // Nothing to play back: only the live view is drawn
    env.ctx.calls.length = 0;
    env.frame();
    expect(env.ctx.named('arc')).toEqual([]);
  });

  test('stopping in the count-in, or after less than a beat, is too short', async () => {
    const { controller, env } = await ready();
    controller.record();
    await runUntil(env, 500);
    controller.stop();
    expect(controller.getState()).toMatchObject({
      phase: 'setup',
      countIn: null,
      message: expect.stringMatching(/too short/),
    });
    controller.record();
    await runUntil(env, env.time + START + 200);
    controller.stop();
    expect(controller.getState().phase).toBe('setup');
  });

  test("the take's first beat has every light: the end of the count-in is kept to start it from", async () => {
    const { controller, env } = await ready();
    await take(controller, env, 3);
    const lesson = controller.buildLesson({ name: 'x', tier: 1, tags: [] }, 'x')!;
    if (lesson.motion.kind !== 'track') throw new Error('expected a track');
    expect(lesson.motion.track.frames[0]!.slice(5).every(p => p !== null)).toBe(true);
  });

  test('a camera frame arriving while the last is still tracked is dropped; one after closing is ignored', async () => {
    const { controller, env } = await ready();
    env.cameraFrame();
    env.cameraFrame();
    await env.settle();
    expect(env.tracker.process).toHaveBeenCalledTimes(1);
    env.cameraFrame();
    controller.dispose();
    await env.settle();
    env.frame(); // the loop's next frame, after closing
    expect(env.tracker.dispose).toHaveBeenCalled();
    expect(env.camera.stop).toHaveBeenCalled();
  });

  test('Record works from review (again) and from setup only', async () => {
    const { controller, env } = setup();
    controller.record();
    controller.stop();
    expect(controller.getState().phase).toBe('opening');
    await controller.open();
    controller.setBpm(BPM);
    await take(controller, env, 3);
    controller.setTrim(0, 2);
    controller.record();
    expect(controller.getState()).toMatchObject({ phase: 'counting', beats: 0 });
    controller.setTrim(0, 1); // not while counting
    expect(controller.buildLesson({ name: 'x', tier: 1, tags: [] }, 'x')).toBeNull();
  });

  test(`a take stops itself after ${MAX_TAKE_MS / 1000} s`, async () => {
    const { controller, env } = await ready({ metronome: false });
    controller.record();
    await runUntil(env, START + MAX_TAKE_MS + 600, 500);
    expect(controller.getState().phase).toBe('review');
    expect(controller.getState().beats).toBeGreaterThan(110);
  });

  test("a calibrated performer's size is taken out of the take", async () => {
    const plain = await ready();
    await take(plain.controller, plain.env, 4);
    const fitted = await ready({ handFit: { center: { x: 0.2, y: 0 }, span: 0.34 } });
    await take(fitted.controller, fitted.env, 4);
    const tip = (c: RecordController) => c.buildLesson({ name: 'x', tier: 1, tags: [] }, 'x')!;
    const a = tip(plain.controller).motion;
    const b = tip(fitted.controller).motion;
    if (a.kind !== 'track' || b.kind !== 'track') throw new Error('expected tracks');
    // Twice the span: half the size in lesson units, around the hands' center
    expect(b.track.frames[0]![5]![0]).toBeCloseTo((a.track.frames[0]![5]![0] - 0.2) / 2, 2);
  });
});

describe('drawing', () => {
  test('without a canvas context it draws nothing and still runs', async () => {
    const env = fakeEnv({ context2d: () => null });
    const { controller } = await ready({}, env);
    await take(controller, env, 3);
    env.frame();
    expect(controller.getState().phase).toBe('review');
    expect(env.ctx.calls).toEqual([]);
  });
});
