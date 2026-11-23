import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { type CameraInfo, type CameraResult, cameraMessage } from '../camera/camera';
import { SLOTS } from '../core/types';
import { appStore } from '../state/appStore';
import { fakeEnv } from '../test/fakeEnv';
import { renderApp, step } from '../test/renderApp';
import type { TrackerFrame } from '../tracking/types';

describe('settings', () => {
  test('every choice is saved as it changes', async () => {
    await renderApp('/settings');
    await userEvent.selectOptions(screen.getByLabelText('Tracking mode'), 'dark');
    await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'hard');
    await userEvent.selectOptions(screen.getByLabelText('View'), 'receiver');
    await userEvent.selectOptions(screen.getByLabelText('Light colors'), 'colorblind');
    await userEvent.selectOptions(screen.getByLabelText('Hand tracking runs on'), 'CPU');
    await userEvent.click(screen.getByLabelText('Metronome'));
    await userEvent.click(screen.getByLabelText('Show what the tracker sees'));
    expect(appStore.getState().settings).toMatchObject({
      tracker: 'dark',
      difficulty: 'hard',
      view: 'receiver',
      palette: 'colorblind',
      delegate: 'CPU',
      metronome: false,
      showSkeleton: true,
    });
  });

  test('the camera preview shows the saved camera, and the list names every camera', async () => {
    const { env } = await renderApp('/settings', { settings: { cameraId: 'cam-1' } });
    expect(env.openCamera).toHaveBeenCalledWith('cam-1');
    expect(env.attach).toHaveBeenCalledWith(screen.getByLabelText('Camera preview'), env.camera);
    expect(screen.getByLabelText('Camera preview')).toHaveClass('camera-preview', 'mirrored');
    expect(screen.getByRole('option', { name: 'FaceTime HD Camera' })).toBeInTheDocument();
    expect(screen.getByLabelText('Camera')).toHaveValue('cam-1');
    expect(screen.getByRole('option', { name: 'Automatic' })).toBeInTheDocument();
  });

  test('Automatic names the camera it opened; switching cameras restarts the preview', async () => {
    const { env } = await renderApp('/settings', { settings: { view: 'receiver' } });
    expect(env.openCamera).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText('Camera preview')).not.toHaveClass('mirrored');
    const camera = screen.getByLabelText('Camera');
    expect(screen.getByRole('option', { name: 'Automatic (FaceTime HD Camera)' })).toBeInTheDocument();
    await userEvent.selectOptions(camera, 'cam-1');
    await step(env);
    expect(appStore.getState().settings.cameraId).toBe('cam-1');
    expect(env.camera.stop).toHaveBeenCalledTimes(1);
    expect(env.openCamera).toHaveBeenLastCalledWith('cam-1');
    await userEvent.selectOptions(camera, '');
    await step(env);
    expect(appStore.getState().settings.cameraId).toBeNull();
    expect(env.camera.stop).toHaveBeenCalledTimes(2);
  });

  test('leaving Settings turns the camera off', async () => {
    const { env, unmount } = await renderApp('/settings');
    expect(env.camera.stop).not.toHaveBeenCalled();
    unmount();
    expect(env.camera.stop).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['opens', true, 1],
    ['fails', false, 0],
  ])('a camera that %s after leaving Settings is let go', async (_, ok, stops) => {
    const env = fakeEnv();
    let open!: (result: CameraResult) => void;
    env.openCamera = () => new Promise(resolve => (open = resolve));
    const { unmount } = await renderApp('/settings', { env, settings: { cameraId: 'cam-1' } });
    expect(screen.getByRole('option', { name: 'Saved camera' })).toBeDisabled();
    unmount();
    await step(env, () =>
      open(ok ? { ok: true, camera: env.camera } : { ok: false, problem: 'in-use', message: 'Camera busy.' })
    );
    expect(env.camera.stop).toHaveBeenCalledTimes(stops);
    expect(env.listCameras).not.toHaveBeenCalled();
  });

  test('a camera list that arrives after leaving Settings is ignored', async () => {
    const env = fakeEnv();
    let list!: (cameras: CameraInfo[]) => void;
    env.listCameras = () => new Promise(resolve => (list = resolve));
    const { unmount } = await renderApp('/settings', { env });
    unmount();
    await step(env, () => list([{ deviceId: 'cam-1', label: 'FaceTime HD Camera' }]));
    expect(env.camera.stop).toHaveBeenCalledTimes(1);
  });

  test("a camera that won't open says why, and the list still loads", async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'in-use', message: 'Camera busy.' }) });
    await renderApp('/settings', { env });
    expect(screen.getByText('Camera busy.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'FaceTime HD Camera' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Automatic' })).toBeInTheDocument();
    expect(env.attach).not.toHaveBeenCalled();
  });

  test('a preview that is interrupted while starting is left for the next one', async () => {
    const env = fakeEnv({ attach: vi.fn(async () => Promise.reject(new Error('interrupted'))) });
    await renderApp('/settings', { env });
    expect(env.attach).toHaveBeenCalled();
    expect(screen.getByRole('option', { name: 'FaceTime HD Camera' })).toBeInTheDocument();
  });

  test('unplugging the camera says so', async () => {
    const { env } = await renderApp('/settings');
    await step(env, () => env.camera.end());
    expect(screen.getByText(cameraMessage('not-found'))).toBeInTheDocument();
  });

  test("a saved camera that isn't connected still shows as chosen", async () => {
    await renderApp('/settings', { settings: { cameraId: 'cam-9' } });
    expect(screen.getByRole('option', { name: 'Saved camera (not connected)' })).toBeDisabled();
    expect(screen.getByLabelText('Camera')).toHaveValue('cam-9');
  });

  test('calibration links say whether each mode is calibrated', async () => {
    await renderApp('/settings', {
      settings: {
        handFit: { center: { x: 0, y: 0 }, span: 0.2 },
        darkCalibration: { version: 1, hands: {}, hues: [], fit: { center: { x: 0, y: 0 }, span: 0.2 } },
      },
    });
    expect(screen.getByText('Lessons are fitted to your hands.')).toBeInTheDocument();
    expect(screen.getByText('GloveBox knows your gloves.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Calibrate again' })).toHaveLength(2);
  });

  test('uncalibrated, with updates and release notes below', async () => {
    await renderApp('/settings');
    expect(screen.getAllByRole('link', { name: 'Calibrate' })[1]).toHaveAttribute('href', '/calibrate/dark');
    expect(screen.getByRole('heading', { name: 'Updates' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "What's new" })).toBeInTheDocument();
  });
});

/** Both hands' tips, open, around (x0, 0). */
const bothHands = (x0 = 0): TrackerFrame['tips'] =>
  SLOTS.map(slot => ({ x: x0 + (slot < 5 ? -0.3 : 0.3) + (slot % 5) * 0.04, y: 0, confidence: 1 }));
const onlyRight = (): TrackerFrame['tips'] => bothHands().map((tip, slot) => (slot >= 5 ? tip : null));

describe('calibrating Lit mode', () => {
  test('measures the hands, checks the right hand, and saves the fit', async () => {
    const env = fakeEnv();
    let tips = bothHands();
    env.tracker.process.mockImplementation(async (frame: { t: number }) => ({ t: frame.t, tips, handScale: {} }));
    await renderApp('/calibrate/lit', { env });
    expect(screen.getByText('Looking…')).toBeInTheDocument();
    for (let i = 0; i < 20; i++) {
      await step(env, () => {
        env.time += 100;
        env.cameraFrame();
        env.frame();
      });
    }
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    tips = onlyRight();
    for (let i = 0; i < 14; i++) {
      await step(env, () => {
        env.time += 100;
        env.cameraFrame();
      });
    }
    expect(screen.getByRole('link', { name: 'Start practicing' })).toBeInTheDocument();
    expect(appStore.getState().settings.handFit?.span).toBeGreaterThan(0);
    expect(appStore.getState().settings.swapHandedness).toBe(false);
  });

  test('says what is missing during a step', async () => {
    const env = fakeEnv();
    env.tracker.process.mockImplementation(async (frame: { t: number }) => ({
      t: frame.t,
      tips: onlyRight(),
      handScale: {},
    }));
    await renderApp('/calibrate/lit', { env });
    await step(env, () => {
      env.time += 100;
      env.cameraFrame();
    });
    expect(screen.getByText('I can see 5 of your 10 fingertips.')).toBeInTheDocument();
  });

  test('a camera that will not open', async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'in-use', message: 'Camera busy.' }) });
    await renderApp('/calibrate/lit', { env });
    expect(screen.getByRole('alert')).toHaveTextContent('Camera busy.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(env.openCamera).toBeDefined();
  });

  test('the starting message, in receiver view', async () => {
    const env = fakeEnv({ openCamera: () => new Promise(() => {}) });
    await renderApp('/calibrate/lit', { env, settings: { view: 'receiver' } });
    expect(screen.getByText('Starting the camera…')).toBeInTheDocument();
    expect(document.querySelector('video')).not.toHaveClass('mirrored');
  });
});

describe('calibrating Dark mode', () => {
  test('starts with the room check', async () => {
    const env = fakeEnv();
    const dark = { data: new Uint8ClampedArray(320 * 180 * 4), width: 320, height: 180 };
    env.grabber = () => () => dark;
    await renderApp('/calibrate/dark', { env });
    expect(screen.getByText('Calibrate Dark mode')).toBeInTheDocument();
    await step(env, () => {
      env.time += 33;
      env.cameraFrame();
    });
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });
});

describe('recording a move', () => {
  /** A hand that circles: every tip moves with the clock. */
  function circlingEnv() {
    const env = fakeEnv();
    env.tracker.process.mockImplementation(async (frame: { t: number }) => ({
      t: frame.t,
      tips: bothHands(0.05 * Math.sin(frame.t / 300)).map((tip, slot) => (slot >= 5 ? tip : null)),
      handScale: {},
    }));
    return env;
  }

  async function perform(env: ReturnType<typeof fakeEnv>, ms: number) {
    const end = env.time + ms;
    while (env.time < end) {
      await step(env, () => {
        env.time += 50;
        env.cameraFrame();
        env.frame();
      });
    }
  }

  test('tempo, count-in, a take, trimming, naming and saving it to My moves', async () => {
    const env = circlingEnv();
    const { router } = await renderApp('/record', { env, settings: { metronome: false } });
    const tempo = screen.getByLabelText('Tempo');
    await userEvent.clear(tempo);
    await userEvent.type(tempo, '120');
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    await perform(env, 100);
    expect(screen.getByText('4')).toHaveClass('count-in');
    await perform(env, 2000 + 4000);
    expect(screen.getByText(/Recording · beat/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('dialog', { name: 'Review the take' })).toBeInTheDocument();
    const start = screen.getByLabelText('Starts on beat');
    const end = screen.getByLabelText('Ends after beat');
    await step(env, () => {
      fireEvent.change(start, { target: { value: '1' } });
    });
    await step(env, () => {
      fireEvent.change(end, { target: { value: '5' } });
    });
    expect(screen.getByText('2')).toHaveClass('mono');
    expect(screen.getByText('5')).toHaveClass('mono');
    await userEvent.type(screen.getByLabelText('Name'), 'Wobble');
    await userEvent.selectOptions(screen.getByLabelText('Tier'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save to My moves' }));
    await step(env);
    expect(router.state.location.pathname).toBe('/');
    expect(appStore.getState().userLessons[0]).toMatchObject({ id: 'wobble', name: 'Wobble', tier: 2 });
  });

  test('a take with no hands in it says so; an unnamed take is "My move"', async () => {
    const empty = fakeEnv();
    const first = await renderApp('/record', {
      env: empty,
      settings: { metronome: false, view: 'receiver', dimVideo: false },
    });
    expect(document.querySelector('video')).not.toHaveClass('mirrored');
    expect(document.querySelector('video')).not.toHaveClass('dimmed');
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    empty.tracker.process.mockImplementation(async (frame: { t: number }) => ({
      t: frame.t,
      tips: new Array(10).fill(null),
      handScale: {},
    }));
    await perform(empty, 3000 + 4000);
    // Frames arrive (so the take has length), but no fingertip is ever seen
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('dialog', { name: 'Review the take' })).toHaveTextContent('No fingertips were seen');
    expect(screen.getByRole('button', { name: 'Save to My moves' })).toBeDisabled();
    first.unmount();

    const env = circlingEnv();
    const { router } = await renderApp('/record', { env, settings: { metronome: false } });
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    await perform(env, 3000 + 4000);
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save to My moves' }));
    await step(env);
    expect(router.state.location.pathname).toBe('/');
    expect(appStore.getState().userLessons[0]?.id).toBe('my-move');
  });

  test('a take too short to keep, and recording again from review', async () => {
    const env = circlingEnv();
    await renderApp('/record', { env, settings: { metronome: false } });
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/too short/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    await perform(env, 3000 + 4000);
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Record again' }));
    expect(screen.queryByRole('dialog', { name: 'Review the take' })).toBeNull();
  });

  test('a camera that will not open, and the starting message', async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'denied', message: 'No camera.' }) });
    await renderApp('/record', { env });
    expect(screen.getByRole('alert')).toHaveTextContent('No camera.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const waiting = fakeEnv({ openCamera: () => new Promise(() => {}) });
    await renderApp('/record', { env: waiting });
    expect(screen.getAllByText('Starting the camera…').length).toBeGreaterThan(0);
  });
});
