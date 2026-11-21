import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test } from 'vitest';
import { BUILTIN_LESSONS } from '../lessons/builtin';
import { appStore } from '../state/appStore';
import { fakeEnv } from '../test/fakeEnv';
import { renderApp, step } from '../test/renderApp';
import { session } from '../test/storageContract';
import { HudBar, lagText } from './practice/PracticeScreen';

const MS_PER_BEAT = 60_000 / 72; // finger rolls: 72 bpm, 4 count-in beats, 8 loops of 4

describe('practicing a lesson', () => {
  test('waits at the first pose, counts in, plays through and shows the result', async () => {
    const { env, router } = await renderApp('/practice/finger-rolls');
    expect(screen.getByRole('dialog', { name: 'Ready' })).toHaveTextContent('Finger rolls');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await step(env, () => {
      env.time += 10;
      env.frame();
    });
    expect(screen.getByText('4')).toHaveClass('count-in');
    expect(screen.getByLabelText('Accuracy')).toHaveTextContent('0%');
    expect(screen.getByText('Loop 1 / 8')).toBeInTheDocument();

    while (router.state.location.pathname.startsWith('/practice')) {
      await step(env, () => {
        env.time += 250;
        env.cameraFrame();
        env.frame();
      });
      if (env.time > 40 * MS_PER_BEAT) throw new Error('never finished');
    }
    expect(router.state.location.pathname).toBe('/results/session-1');
    expect(await screen.findByLabelText('Grade D')).toBeInTheDocument();
    expect(screen.getByText('Keep at it')).toBeInTheDocument();
    expect(appStore.getState().sessions).toHaveLength(1);
  });

  test('tempo, view, pause and resume', async () => {
    const { env } = await renderApp('/practice/finger-rolls');
    const tempo = screen.getByRole('group', { name: 'Tempo' });
    await userEvent.click(within(tempo).getByRole('button', { name: '0.5×' }));
    expect(within(tempo).getByRole('button', { name: '0.5×' })).toHaveAttribute('aria-pressed', 'true');
    expect(appStore.getState().settings.tempo).toBe(0.5);
    await userEvent.click(
      within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'Receiver' })
    );
    expect(appStore.getState().settings.view).toBe('receiver');
    expect(document.querySelector('video')).not.toHaveClass('mirrored');

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await step(env, () => {
      env.time += 5 * MS_PER_BEAT * 2;
      env.frame();
    });
    expect(screen.getByLabelText('Session progress')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Paused')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByText('Paused')).toBeNull();
  });

  test('Space starts and pauses; hiding the window pauses; Escape leaves', async () => {
    const { env, router } = await renderApp('/practice/finger-rolls');
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByRole('dialog', { name: 'Ready' })).toBeNull();
    await step(env, () => {
      env.time += 100;
      env.frame();
    });
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ' });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByText('Paused')).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await step(env);
    expect(router.state.location.pathname).toBe('/');
  });

  test('without a camera: what to do, and the move can still be watched', async () => {
    const env = fakeEnv({ openCamera: async () => ({ ok: false, problem: 'denied', message: 'Allow the camera.' }) });
    await renderApp('/practice/finger-rolls', { env });
    expect(screen.getByRole('alert')).toHaveTextContent('Allow the camera.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await step(env);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Watch it' }));
    expect(screen.getByText('Watching the move…')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('watching from ready, and the starting messages', async () => {
    let open: (value: never) => void = () => {};
    const env = fakeEnv();
    const openCamera = env.openCamera;
    env.openCamera = () => new Promise(resolve => (open = resolve as never));
    await renderApp('/practice/finger-rolls', { env });
    expect(screen.getByText('Starting the camera…')).toBeInTheDocument();
    let init: () => void = () => {};
    env.tracker.init.mockImplementationOnce(() => new Promise<void>(resolve => (init = resolve)));
    await step(env, async () => open((await openCamera(null)) as never));
    expect(screen.getByText('Loading hand tracking…')).toBeInTheDocument();
    await step(env, () => init());
    await userEvent.click(screen.getByRole('button', { name: 'Watch it first' }));
    expect(screen.getByText('Watching the move…')).toBeInTheDocument();
  });

  test('a lesson that does not exist, or is still locked', async () => {
    await renderApp('/practice/nope');
    expect(screen.getByText('There\'s no lesson called "nope".')).toBeInTheDocument();
  });

  test('a locked lesson says how to open it', async () => {
    await renderApp('/practice/tut-box');
    expect(screen.getByText(/Tut box unlocks once/)).toBeInTheDocument();
  });

  test('the HUD shows a combo once there is one; the camera can be left undimmed', async () => {
    await renderApp('/practice/finger-rolls', { settings: { dimVideo: false } });
    expect(document.querySelector('video')).not.toHaveClass('dimmed');
    const hud = {
      countIn: null,
      loop: 2,
      loops: 8,
      progress: 0.3,
      accuracy: 88,
      combo: 6,
      lagMs: 0,
      paused: false,
      tempo: 1,
    };
    render(<HudBar lesson={BUILTIN_LESSONS[0]!} hud={hud} />, { wrapper: MemoryRouter });
    expect(screen.getByText('6 beat combo')).toBeInTheDocument();
  });

  test('how the lag reads', () => {
    expect(lagText(null)).toBe('');
    expect(lagText(10)).toBe('on the beat');
    expect(lagText(120)).toBe('120 ms behind');
    expect(lagText(-45)).toBe('45 ms ahead');
  });
});

describe('the results', () => {
  const result = session({
    id: 'r1',
    lessonId: 'finger-rolls',
    accuracy: 91.4,
    grade: 'A',
    stars: 3,
    maxCombo: 12,
    meanLagMs: 80,
    durationMs: 65_000,
    perFinger: [90, 80, 70, 60, 50, 95, 85, 75, 65, 55],
  });

  test('grade, stars, numbers and each finger, with the way on', async () => {
    const played = BUILTIN_LESSONS.slice(0, 3).map((l, i) =>
      session({ id: `p${i}`, lessonId: l.id, stars: 3, grade: 'S', accuracy: 99 })
    );
    await renderApp('/results/r1', { sessions: [...played, result] });
    expect(screen.getByLabelText('Grade A')).toBeInTheDocument();
    expect(screen.getByText('Great')).toBeInTheDocument();
    expect(screen.getByLabelText('3 of 3 stars')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('12 beats')).toBeInTheDocument();
    expect(screen.getByText('80 ms behind')).toBeInTheDocument();
    expect(screen.getByText('1 min')).toBeInTheDocument();
    expect(screen.getByLabelText('Left hand thumb 90%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Again' })).toHaveAttribute('href', '/practice/finger-rolls');
    expect(screen.getByRole('link', { name: 'Next: Ten-light wave' })).toBeInTheDocument();
  });

  test('fingers a move leaves out; no next lesson when it is locked or last', async () => {
    const lastLesson = BUILTIN_LESSONS.at(-1)!;
    await renderApp('/results/r2', {
      sessions: [
        session({ id: 'r2', lessonId: lastLesson.id, perFinger: [null, null, null, null, null, 50, 50, 50, 50, 50] }),
      ],
    });
    expect(screen.getAllByText('not in this move')).toHaveLength(5);
    expect(screen.queryByRole('link', { name: /^Next:/ })).toBeNull();
  });

  test("a recorded lesson's result, and a lesson since deleted", async () => {
    await renderApp('/results/r3', { sessions: [session({ id: 'r3', lessonId: 'gone-lesson', grade: 'S' })] });
    expect(screen.getByText('gone-lesson')).toBeInTheDocument();
    expect(screen.getByText('Flawless')).toBeInTheDocument();
  });

  test('a session that is not saved here', async () => {
    await renderApp('/results/missing');
    expect(screen.getByText("That session isn't saved here.")).toBeInTheDocument();
  });
});
