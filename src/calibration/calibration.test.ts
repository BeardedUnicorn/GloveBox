import { describe, expect, test, vi } from 'vitest';
import type { CameraResult } from '../camera/camera';
import { emptyPose, type Pose10, SLOTS, slotOf } from '../core/types';
import { DEFAULT_SETTINGS } from '../state/settings';
import { calibrateRendered, OPEN_LEFT, OPEN_RIGHT } from '../test/darkCalibration';
import { type FakeEnv, fakeEnv } from '../test/fakeEnv';
import { twoHands } from '../test/syntheticHands';
import { renderLeds } from '../tracking/synthetic/ledFrameRenderer';
import type { CameraFrame, TipSample, TrackerFrame } from '../tracking/types';
import { FAN_THUMB_PINKY, HOLD_MS, LitCalibration, RIGHT_MS, STILLNESS } from './litCalibration';
import { CalibrationRunner, type RunnerDeps } from './runner';
import { type CalibrationSource, darkSource, isDarkCalibration, litSource, type SourceFrame } from './sources';

const tip = (x: number, y = 0): TipSample => ({ x, y, confidence: 1 });

/** Tips for the hands given: each hand's thumb and pinky `span` apart, centered at ±0.3 (+ shift). */
function hands({ left = true, right = true, span = 0.2, shift = 0, only = 5 } = {}): TrackerFrame['tips'] {
  const tips: TrackerFrame['tips'] = SLOTS.map(() => null);
  for (const [hand, on, cx] of [
    ['L', left, -0.3],
    ['R', right, 0.3],
  ] as const) {
    if (!on) continue;
    for (let finger = 0; finger < only; finger++) {
      tips[slotOf(hand, finger as 0)] = tip(cx + shift + (finger / 4 - 0.5) * span);
    }
  }
  return tips;
}

const frame = (t: number, tips: TrackerFrame['tips']): TrackerFrame => ({ t, tips, handScale: {} });

/** Holds `tips` from `from` for `ms`, a frame every 50 ms. */
function hold(calibration: LitCalibration, from: number, ms: number, tips: TrackerFrame['tips']) {
  let state = calibration.feed(frame(from, tips));
  for (let t = from + 50; t <= from + ms; t += 50) state = calibration.feed(frame(t, tips));
  return state;
}

describe('Lit-mode calibration', () => {
  test('asks for all ten fingertips, held still', () => {
    const calibration = new LitCalibration(false);
    expect(calibration.feed(frame(0, hands({ right: false })))).toMatchObject({
      step: 'hands',
      progress: 0,
      hint: 'I can see 5 of your 10 fingertips.',
      result: null,
    });
    const start = calibration.feed(frame(0, hands()));
    expect(start).toMatchObject({ step: 'hands', progress: 0, hint: null });
    expect(start.instruction).toMatch(/both hands/);
    expect(calibration.feed(frame(HOLD_MS / 2, hands())).progress).toBeCloseTo(0.5);
    expect(calibration.feed(frame(HOLD_MS / 2 + 50, hands({ shift: STILLNESS * 2 })))).toMatchObject({
      progress: 0,
      hint: 'Hold still for a moment.',
    });
  });

  test('measures the hands, then checks which hand is the right one', () => {
    const calibration = new LitCalibration(false);
    const measured = hold(calibration, 0, HOLD_MS, hands({ span: 0.25 }));
    expect(measured).toMatchObject({ step: 'right', progress: 0, hint: null });
    expect(measured.instruction).toMatch(/only your right hand/);

    expect(calibration.feed(frame(2000, hands()))).toMatchObject({ hint: 'Only your right hand, please.' });
    expect(calibration.feed(frame(2050, hands({ left: false, right: false })))).toMatchObject({
      hint: 'Hold up your right hand.',
    });
    expect(calibration.feed(frame(2100, hands({ left: false, only: 3 })))).toMatchObject({
      hint: 'Hold up your right hand.',
    });
    const halfway = calibration.feed(frame(2150, hands({ left: false })));
    expect(halfway).toMatchObject({ step: 'right', progress: 0, hint: null });

    const done = hold(calibration, 2200, RIGHT_MS, hands({ left: false }));
    expect(done.step).toBe('done');
    expect(done.progress).toBe(1);
    expect(done.result?.swapHandedness).toBe(false);
    expect(done.result?.handFit.span).toBeCloseTo(0.25 / FAN_THUMB_PINKY);
    expect(done.result?.handFit.center.x).toBeCloseTo(0);
    // Once done, it stays done
    expect(calibration.feed(frame(9000, emptyFrameTips()))).toMatchObject({ step: 'done', progress: 1, hint: null });
  });

  test('a right hand the tracker calls the left flips the setting, either way', () => {
    for (const swap of [false, true]) {
      const calibration = new LitCalibration(swap);
      hold(calibration, 0, HOLD_MS, hands());
      const done = hold(calibration, 2000, RIGHT_MS, hands({ right: false }));
      expect(done.result?.swapHandedness).toBe(!swap);
    }
  });
});

function emptyFrameTips() {
  return SLOTS.map(() => null);
}

describe('calibration sources', () => {
  const cameraFrame = (t: number): CameraFrame => ({ video: {} as HTMLVideoElement, t, width: 1280, height: 720 });

  test('Lit: the tracker feeds the calibration, through to the settings it found', async () => {
    const env = fakeEnv();
    let tips = hands();
    env.tracker.process.mockImplementation(async (f: { t: number }) => frame(f.t, tips));
    const source = litSource(env.tracker, false);
    await source.init();
    expect(env.tracker.init).toHaveBeenCalled();
    const first = (await source.process(cameraFrame(0)))!;
    expect(first.view).toMatchObject({ stepLabel: 'Step 1 of 2', done: false, progress: 0 });
    expect(first.tips).toBe(tips);
    expect(first.result).toBeNull();
    let out: SourceFrame | null = first;
    for (let t = 50; t <= HOLD_MS; t += 50) out = await source.process(cameraFrame(t));
    expect(out!.view.stepLabel).toBe('Step 2 of 2');
    tips = hands({ left: false });
    for (let t = 2000; t <= 2000 + RIGHT_MS; t += 50) out = await source.process(cameraFrame(t));
    expect(out!.view).toMatchObject({ done: true, stepLabel: 'Step 2 of 2' });
    expect(out!.result).toMatchObject({ swapHandedness: false, handFit: { span: expect.any(Number) } });
    source.dispose();
    expect(env.tracker.dispose).toHaveBeenCalled();
  });

  test("Lit: a frame the tracker couldn't read gives nothing", async () => {
    const env = fakeEnv();
    env.tracker.process.mockResolvedValueOnce(null);
    expect(await litSource(env.tracker, false).process(cameraFrame(0))).toBeNull();
  });

  test('Dark: the room, the lights, then the thumbs, to a saved calibration', async () => {
    let pose: Pose10 = emptyPose();
    let index = 0;
    const grab = vi.fn(() => renderLeds(pose, { frameIndex: index++ }));
    const source = darkSource(grab);
    await source.init();
    let out = (await source.process(cameraFrame(0)))!;
    expect(out.view).toMatchObject({ stepLabel: 'Step 1 of 3', done: false });
    expect(out.tips).toBeNull();
    expect(out.result).toBeNull();
    while (out.view.stepLabel === 'Step 1 of 3' && index < 200) out = (await source.process(cameraFrame(index)))!;
    pose = twoHands(OPEN_LEFT, OPEN_RIGHT);
    while (out.view.stepLabel === 'Step 2 of 3' && index < 400) out = (await source.process(cameraFrame(index)))!;
    expect(out.lights?.length).toBeGreaterThan(0);
    let wiggle = 0;
    while (!out.view.done && index < 600) {
      const curl = [0.35 * (0.5 + 0.5 * Math.sin(wiggle++ * 0.7)), 0, 0, 0, 0];
      pose = twoHands({ ...OPEN_LEFT, curl }, { ...OPEN_RIGHT, curl });
      out = (await source.process(cameraFrame(index)))!;
    }
    expect(out.view).toMatchObject({ done: true, stepLabel: 'Step 3 of 3' });
    expect(isDarkCalibration(out.result?.darkCalibration)).toBe(true);
    source.dispose();
  });

  test('Dark: no grabbed frame, nothing to say', async () => {
    expect(await darkSource(() => null).process(cameraFrame(0))).toBeNull();
  });

  test('a saved Dark-mode calibration is recognized; anything else is not', () => {
    const saved = JSON.parse(JSON.stringify(calibrateRendered()));
    expect(isDarkCalibration(saved)).toBe(true);
    expect(isDarkCalibration(null)).toBe(false);
    expect(isDarkCalibration('calibrated')).toBe(false);
    expect(isDarkCalibration({ ...saved, version: 2 })).toBe(false);
    expect(isDarkCalibration({ ...saved, hands: 'none' })).toBe(false);
    expect(isDarkCalibration({ ...saved, hues: {} })).toBe(false);
    expect(isDarkCalibration({ ...saved, fit: 0.2 })).toBe(false);
  });
});

// ── The runner ──────────────────────────────────────────────────────────────

function fakeSource(results: (SourceFrame | null)[] = []) {
  const queue = [...results];
  return {
    init: vi.fn(async () => {}),
    process: vi.fn(async () => (queue.length > 0 ? queue.shift()! : null)),
    dispose: vi.fn(),
  } satisfies CalibrationSource;
}

const view = (done = false) => ({
  instruction: 'Do it',
  hint: null,
  progress: done ? 1 : 0.5,
  stepLabel: 'Step 1 of 1',
  done,
});

function setup(source: CalibrationSource = fakeSource(), env: FakeEnv = fakeEnv(), extra: Partial<RunnerDeps> = {}) {
  const onResult = vi.fn();
  const runner = new CalibrationRunner({
    env,
    settings: { ...DEFAULT_SETTINGS, cameraId: 'cam-2' },
    source,
    video: {} as HTMLVideoElement,
    canvas: {} as HTMLCanvasElement,
    layout: () => ({ size: { width: 1280, height: 720 }, dpr: 2 }),
    onResult,
    ...extra,
  });
  return { runner, env, onResult, source };
}

async function cameraFrame(env: FakeEnv, t: number) {
  env.time = t;
  env.cameraFrame();
  await env.settle();
}

describe('the calibration runner', () => {
  test('opens the camera and the source, then feeds it frames and draws what it sees', async () => {
    const source = fakeSource([{ view: view(), tips: hands(), result: null }]);
    const { runner, env } = setup(source);
    const phases: string[] = [];
    runner.subscribe(() => phases.push(runner.getState().phase));
    await runner.open();
    expect(env.openCamera).toHaveBeenCalledWith('cam-2');
    expect(source.init).toHaveBeenCalled();
    expect(phases).toEqual(['opening', 'running']);
    // Drawn before any frame: nothing yet
    expect(env.ctx.named('drawImage')).toEqual([]);
    await cameraFrame(env, 10);
    expect(runner.getState().view).toMatchObject({ instruction: 'Do it' });
    env.frame();
    expect(env.ctx.named('drawImage')).toHaveLength(10);
    expect(env.ctx.named('setTransform')[0]).toEqual([2, 0, 0, 2, 0, 0]);
  });

  test('draws lights when the source has lights instead of tips', async () => {
    const source = fakeSource([{ view: view(), tips: null, lights: [{ x: 0, y: 0 }], result: null }]);
    const { runner, env } = setup(source);
    await runner.open();
    await cameraFrame(env, 10);
    env.ctx.calls.length = 0;
    env.frame();
    expect(env.ctx.named('arc')).toHaveLength(1);
    expect(env.ctx.named('drawImage')).toEqual([]);
  });

  test('reports what the calibration found, once', async () => {
    const found = { swapHandedness: true };
    const source = fakeSource([
      { view: view(true), tips: null, result: found },
      { view: view(true), tips: null, result: found },
    ]);
    const { runner, env, onResult } = setup(source);
    await runner.open();
    await cameraFrame(env, 10);
    await cameraFrame(env, 20);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(found);
    expect(runner.getState().view?.done).toBe(true);
  });

  test('a frame the source has nothing to say about changes nothing', async () => {
    const { runner, env } = setup(fakeSource([null]));
    await runner.open();
    await cameraFrame(env, 10);
    expect(runner.getState().view).toBeNull();
  });

  test('a frame arriving while the last is still being worked on is dropped', async () => {
    const source = fakeSource();
    const { runner, env } = setup(source);
    await runner.open();
    env.cameraFrame();
    env.cameraFrame();
    await env.settle();
    expect(source.process).toHaveBeenCalledTimes(1);
  });

  test("a camera that won't open, or a source that won't start, is a problem", async () => {
    const denied = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'denied', message: 'Turn it on.' }) });
    const first = setup(fakeSource(), denied);
    await first.runner.open();
    expect(first.runner.getState()).toMatchObject({ phase: 'problem', message: 'Turn it on.' });

    const source = fakeSource();
    source.init.mockRejectedValueOnce(new Error('no WASM'));
    const second = setup(source);
    await second.runner.open();
    expect(second.runner.getState()).toMatchObject({
      phase: 'problem',
      message: "Tracking couldn't start: Error: no WASM",
    });
  });

  test('trying again replaces the frame feed and keeps one draw loop', async () => {
    const { runner, env } = setup();
    const stop = vi.fn();
    (env.videoFrames as ReturnType<typeof vi.fn>).mockReturnValueOnce(stop);
    await runner.open();
    await runner.open();
    expect(stop).toHaveBeenCalled();
    // One draw when it first opened, none from trying again, then one per display frame
    expect(env.ctx.named('setTransform')).toHaveLength(1);
    env.frame();
    env.frame();
    expect(env.ctx.named('setTransform')).toHaveLength(3);
  });

  test('closing while the camera opens stops it when it arrives; a refusal after closing is ignored', async () => {
    let resolve: (result: CameraResult) => void = () => {};
    const env = fakeEnv({ openCamera: () => new Promise(r => (resolve = r)) });
    const { runner } = setup(fakeSource(), env);
    const opening = runner.open();
    runner.dispose();
    resolve({ ok: true, camera: env.camera });
    await opening;
    expect(env.camera.stop).toHaveBeenCalled();

    const refused = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'denied', message: 'no' }) });
    const second = setup(fakeSource(), refused);
    const again = second.runner.open();
    second.runner.dispose();
    await again;
    expect(second.runner.getState().phase).toBe('opening');
  });

  test('closing while the source starts leaves it closed', async () => {
    const source = fakeSource();
    const { runner, env } = setup(source);
    source.init.mockImplementationOnce(async () => runner.dispose());
    await runner.open();
    expect(source.dispose).toHaveBeenCalled();
    expect(env.videoFrames).not.toHaveBeenCalled();
    expect(runner.getState().phase).toBe('opening');
  });

  test('a frame finished after closing is ignored; the draw loop stops', async () => {
    let finish: (frame: SourceFrame | null) => void = () => {};
    const source = fakeSource();
    source.process.mockImplementationOnce(() => new Promise(r => (finish = r)));
    const { runner, env } = setup(source);
    await runner.open();
    env.cameraFrame();
    runner.dispose();
    runner.dispose();
    finish({ view: view(), tips: null, result: null });
    await env.settle();
    expect(runner.getState().view).toBeNull();
    env.ctx.calls.length = 0;
    env.frame();
    expect(env.ctx.calls).toEqual([]);
    expect(env.frames.cancel).toHaveBeenCalled();
  });

  test('closing before it opened is fine; an unsubscribed listener hears nothing', () => {
    const { runner, env, source } = setup();
    const listener = vi.fn();
    runner.subscribe(listener)();
    runner.dispose();
    expect(env.frames.cancel).not.toHaveBeenCalled();
    expect(source.dispose).toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  test('without a canvas context it still runs', async () => {
    const source = fakeSource([{ view: view(), tips: hands(), result: null }]);
    const { runner, env } = setup(source, fakeEnv({ context2d: () => null }));
    await runner.open();
    await cameraFrame(env, 10);
    env.frame();
    expect(runner.getState().view).not.toBeNull();
    expect(env.ctx.calls).toEqual([]);
  });
});
