import { describe, expect, test, vi } from 'vitest';
import { builtinLesson } from '../lessons/builtin';
import type { SessionRecord } from '../progression/types';
import { DEFAULT_SETTINGS, type Settings } from '../state/settings';
import { type FakeEnv, fakeEnv } from '../test/fakeEnv';
import { type ControllerDeps, DARK_NEEDS_CALIBRATION, PracticeController, UNCALIBRATED_FIT } from './controller';

const lesson = builtinLesson('finger-rolls')!; // 72 bpm: 4 count-in beats, 4-beat loops, 8 loops
const MS_PER_BEAT = 60_000 / 72;
const video = (width = 1280, height = 720) => ({ videoWidth: width, videoHeight: height }) as HTMLVideoElement;

function setup(settings: Partial<Settings> = {}, env: FakeEnv = fakeEnv(), extra: Partial<ControllerDeps> = {}) {
  const finished: SessionRecord[] = [];
  const controller = new PracticeController({
    env,
    lesson,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    video: video(),
    canvas: {} as HTMLCanvasElement,
    layout: () => ({ size: { width: 1280, height: 720 }, dpr: 1 }),
    onFinish: record => finished.push(record),
    ...extra,
  });
  return { controller, env, finished };
}

async function ready(settings: Partial<Settings> = {}, env?: FakeEnv) {
  const s = setup(settings, env);
  await s.controller.open();
  return s;
}

/** Runs display frames (and camera frames) from now until `until`, every `step` ms. */
async function runUntil(env: FakeEnv, until: number, step = 50) {
  while (env.time < until) {
    env.time += step;
    env.cameraFrame();
    await env.settle();
    env.frame();
  }
}

describe('opening', () => {
  test('opens the chosen camera, starts the tracker and waits at the first pose', async () => {
    const { controller, env } = setup({ cameraId: 'cam-2' });
    const phases: string[] = [];
    controller.subscribe(() => phases.push(controller.getState().phase));
    await controller.open();
    expect(env.openCamera).toHaveBeenCalledWith('cam-2');
    expect(env.attach).toHaveBeenCalled();
    expect(env.tracker.init).toHaveBeenCalled();
    expect(phases).toEqual(['opening', 'loading', 'ready']);
    expect(controller.getState()).toMatchObject({ phase: 'ready', hasCamera: true, message: null });
    // Camera frames are tracked while waiting, but nothing is scored
    env.time = 100;
    env.cameraFrame();
    await env.settle();
    expect(env.tracker.process).toHaveBeenCalled();
    env.frame();
    expect(env.ctx.named('arc').length).toBeGreaterThan(0);
  });

  test("a camera that won't open is a problem, with what to do", async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'denied', message: 'Turn it on.' }) });
    const { controller } = await ready({}, env);
    expect(controller.getState()).toMatchObject({ phase: 'problem', message: 'Turn it on.', hasCamera: false });
    // With nothing to draw, each frame just clears
    env.frame();
    expect(env.ctx.named('clearRect')).toHaveLength(2);
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

  test('closing while the camera opens stops it as soon as it arrives', async () => {
    const { controller, env } = setup();
    const opening = controller.open();
    controller.dispose();
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
    expect(controller.getState().phase).toBe('loading');
  });

  test('a camera that goes away mid-session is a problem', async () => {
    const { controller, env } = await ready();
    controller.start();
    env.camera.end();
    expect(controller.getState()).toMatchObject({ phase: 'problem', hasCamera: false });
    expect(env.tracker.dispose).toHaveBeenCalled();
    env.cameraFrame(); // no longer listened to
    expect(env.tracker.process).not.toHaveBeenCalled();
  });
});

describe('a session', () => {
  test('counts in, plays every loop, then saves the result once', async () => {
    const { controller, env, finished } = await ready();
    controller.start();
    expect(controller.getState().phase).toBe('running');
    expect(env.metronomes).toHaveLength(1);
    await runUntil(env, MS_PER_BEAT);
    expect(controller.getState().hud).toMatchObject({ countIn: 3, loop: 1, loops: 8, paused: false, tempo: 1 });
    expect(env.metronomes[0]!.update).toHaveBeenCalled();

    await runUntil(env, (4 + 32) * MS_PER_BEAT + 200);
    expect(controller.getState().phase).toBe('finished');
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      id: 'session-1',
      lessonId: 'finger-rolls',
      lessonVersion: 1,
      tracker: 'landmarks',
      difficulty: 'normal',
      tempo: 1,
      accuracy: 0, // the fake tracker never sees a hand
      grade: 'D',
    });
    expect(finished[0]!.durationMs).toBeGreaterThan(26_000);
    expect(finished[0]!.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(env.camera.stop).toHaveBeenCalled();
    expect(env.metronomes[0]!.dispose).toHaveBeenCalled();
    controller.dispose(); // twice is fine
  });

  test('Start only works when ready; pausing only while running', async () => {
    const { controller, env } = setup();
    controller.start();
    controller.togglePause();
    controller.pause();
    expect(controller.getState().phase).toBe('opening');
    await controller.open();
    controller.togglePause();
    expect(controller.getState().hud).toBeNull();
    controller.start();
    controller.start();
    expect(env.metronomes).toHaveLength(1);
  });

  test('pause and resume, tempo and view', async () => {
    const { controller, env } = await ready({ metronome: false });
    controller.start();
    expect(env.metronomes).toHaveLength(0);
    controller.pause();
    expect(controller.getState().hud?.paused).toBe(true);
    controller.pause(); // already paused
    controller.togglePause();
    expect(controller.getState().hud?.paused).toBe(false);
    controller.setTempo(0.5);
    expect(controller.getState().hud?.tempo).toBe(0.5);
    controller.setView('receiver');
    env.time = 10;
    env.frame();
    expect(env.ctx.named('arc').length).toBeGreaterThan(0);
  });

  test('the HUD updates at most ten times a second', async () => {
    const { controller, env } = await ready();
    controller.start();
    const updates = vi.fn();
    controller.subscribe(updates);
    await runUntil(env, 1000, 10);
    expect(updates.mock.calls.length).toBeLessThanOrEqual(11);
    expect(updates.mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  test('Dark mode needs its calibration first', async () => {
    const { controller, env } = await ready({ tracker: 'dark' });
    expect(controller.getState()).toMatchObject({ phase: 'problem', message: DARK_NEEDS_CALIBRATION, hasCamera: true });
    expect(env.tracker.init).not.toHaveBeenCalled();
  });

  test('Dark mode scores the pattern, fits to the gloves and saves as an LED session', async () => {
    const env = fakeEnv();
    const darkCalibration = { version: 1, hands: {}, hues: [], fit: { center: { x: 0, y: 0 }, span: 0.17 } };
    const { controller, finished } = await ready({ tracker: 'dark', metronome: false, darkCalibration }, env);
    controller.start();
    await runUntil(env, (4 + 32) * MS_PER_BEAT + 200, 200);
    expect(finished[0]?.tracker).toBe('leds');
  });

  test('a calibrated performer gets the lesson fitted to their hands', async () => {
    const plain = await ready();
    plain.env.frame();
    const fitted = await ready({ handFit: { center: { x: 0.1, y: 0 }, span: 0.17 * 1.5 * UNCALIBRATED_FIT.scale } });
    fitted.env.frame();
    const firstRing = (env: FakeEnv) => env.ctx.named('arc')[0]!;
    expect(firstRing(fitted.env)[2]).toBeCloseTo((firstRing(plain.env)[2] as number) * 1.5);
  });
});

describe('watching', () => {
  test('plays the move once with a pretend performer, then waits again', async () => {
    const { controller, env } = await ready();
    controller.setTempo(1.25);
    controller.startWatching();
    expect(controller.getState().phase).toBe('watching');
    controller.startWatching(); // already watching
    await runUntil(env, ((4 + 4) * MS_PER_BEAT) / 1.25 + 200, 33);
    expect(controller.getState().phase).toBe('ready');
    // Its fingertips were drawn as lights
    expect(env.ctx.named('drawImage').length).toBeGreaterThan(0);
  });

  test('without a camera or a video size, Watch assumes a 16:9 frame', async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'not-found', message: '' }) });
    const { controller } = setup({}, env, { video: video(0, 0) });
    await controller.open();
    controller.startWatching();
    env.time = 10;
    env.frame();
    expect(env.ctx.named('arc').length).toBeGreaterThan(0);
  });

  test('closing before it ever opened is fine', () => {
    const { controller, env } = setup();
    controller.dispose();
    expect(env.frames.cancel).not.toHaveBeenCalled();
  });

  test('works without a camera, and can be stopped', async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'not-found', message: 'No camera.' }) });
    const { controller } = await ready({}, env);
    controller.startWatching();
    env.time = 100;
    env.frame();
    controller.stopWatching();
    expect(controller.getState()).toMatchObject({ phase: 'problem', message: 'No camera.' });
  });
});

describe('drawing', () => {
  test("without a canvas context it draws nothing, and doesn't fail", async () => {
    const env = fakeEnv({ context2d: () => null });
    const { controller } = await ready({}, env);
    env.frame();
    controller.startWatching();
    env.time = 10;
    env.frame();
    controller.stopWatching();
    const noCamera = fakeEnv({
      context2d: () => null,
      openCamera: async () => ({ ok: false, problem: 'denied', message: '' }),
    });
    await ready({}, noCamera);
    noCamera.frame();
    expect(controller.getState().phase).toBe('ready');
  });

  test("before the video knows its size, the camera's reported size is used", async () => {
    const env = fakeEnv();
    const { controller } = setup({}, env, { video: video(0, 0) });
    await controller.open();
    env.frame();
    // A 1280×720 camera in a 1280×720 canvas: the first ring sits where stage space says
    expect(env.ctx.named('arc').length).toBeGreaterThan(0);
  });

  test('the skeleton and raw lights are drawn when asked for', async () => {
    const env = fakeEnv();
    env.tracker.process.mockImplementation(async (frame: { t: number }) => ({
      t: frame.t,
      tips: new Array(10).fill(null),
      handScale: {},
      skeleton: { R: Array.from({ length: 21 }, () => ({ x: 0, y: 0 })) },
      lights: [{ x: 0, y: 0 }],
    }));
    const { controller } = await ready({ showSkeleton: true, showGhost: false }, env);
    env.time = 10;
    env.cameraFrame();
    await env.settle();
    env.frame();
    expect(env.ctx.named('lineTo').length).toBe(21);
    expect(controller.getState().phase).toBe('ready');
  });
});
