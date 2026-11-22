import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import { LessonPreview } from '../components/LessonPreview';
import { BUILTIN_LESSONS } from '../lessons/builtin';
import { exportLesson } from '../lessons/exchange';
import { type LessonDef, lessonSchema } from '../lessons/schema';
import { PALETTES, withAlpha } from '../render/palette';
import { appStore } from '../state/appStore';
import { createLocalStorage } from '../storage/localStorageStorage';
import { fakeEnv } from '../test/fakeEnv';
import { TEST_LESSON } from '../test/lessons';
import { renderApp, TODAY } from '../test/renderApp';
import { session } from '../test/storageContract';

const myMove: LessonDef = { ...BUILTIN_LESSONS[0]!, id: 'my-move', name: 'My move', origin: 'recorded' };
const day = (offset: number) => {
  const d = new Date(TODAY + offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('the app', () => {
  test('shows its name while loading, then the library', async () => {
    const storage = createLocalStorage(null);
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const list = storage.sessions.list;
    storage.sessions.list = async () => {
      await gate;
      return list();
    };
    appStore.setState({ ready: false });
    render(<App env={fakeEnv()} storage={storage} makeRouter={routes => createMemoryRouter(routes)} />);
    expect(screen.getByRole('status')).toHaveTextContent('GloveBox');
    await act(async () => release());
    expect(await screen.findByRole('heading', { name: 'Learn to glove' })).toBeInTheDocument();
  });

  test("says so when saved progress can't be read", async () => {
    const storage = createLocalStorage(null);
    storage.sessions.list = () => Promise.reject(new Error('locked'));
    appStore.setState({ ready: false });
    render(<App env={fakeEnv()} storage={storage} makeRouter={routes => createMemoryRouter(routes)} />);
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't be read (Error: locked)");
  });

  test('an unknown address finds nothing, with a way back', async () => {
    await renderApp('/nowhere');
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the library' })).toHaveAttribute('href', '/');
  });
});

describe('the library', () => {
  test('lists every tier, with tier 1 open and the rest locked at first', async () => {
    await renderApp('/');
    const tier1 = screen.getByRole('region', { name: 'Tier 1: Foundations' });
    expect(within(tier1).getAllByRole('button', { name: 'Learn' })).toHaveLength(5);
    const tier2 = screen.getByRole('region', { name: 'Tier 2: Flails & whips' });
    expect(within(tier2).getAllByRole('button', { name: 'Locked' })[0]).toBeDisabled();
    expect(within(tier2).getByText('Earn 9 more ★ in tier 1 to unlock')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next up: Finger wave' })).toHaveAttribute('href', '/practice/finger-wave');
    expect(screen.getByText('Start a streak today')).toBeInTheDocument();
  });

  test('shows bests, unlocks the next tier, and the streak', async () => {
    const played = ['finger-wave', 'upward-roll', 'downward-roll'].map((lessonId, i) =>
      session({
        id: `s${i}`,
        lessonId,
        accuracy: 96,
        grade: 'S',
        stars: 3,
        day: day(-i),
        startedAt: TODAY - i * 86_400_000,
      })
    );
    const { router } = await renderApp('/', { sessions: played });
    const rolls = screen.getByRole('article', { name: 'Upward finger roll' });
    expect(within(rolls).getByText('★★★')).toBeInTheDocument();
    expect(within(rolls).getByRole('button', { name: 'Practice' })).toBeEnabled();
    expect(
      within(screen.getByRole('region', { name: 'Tier 2: Flails & whips' })).getAllByRole('button', { name: 'Learn' })
    ).toHaveLength(5);
    expect(screen.getByText('🔥 3-day streak')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next up: Finger splits' })).toBeInTheDocument();
    await userEvent.click(within(rolls).getByRole('button', { name: 'Practice' }));
    expect(router.state.location.pathname).toBe('/practice/upward-roll');
  });

  test('every built-in lesson played: no "next up"', async () => {
    const played = BUILTIN_LESSONS.map((l, i) =>
      session({ id: `s${i}`, lessonId: l.id, accuracy: 99, grade: 'S', stars: 3 })
    );
    await renderApp('/', { sessions: played });
    expect(screen.queryByRole('link', { name: /Next up/ })).toBeNull();
  });

  test('My moves: empty, then a recorded move with export and delete', async () => {
    const { env } = await renderApp('/', { lessons: [myMove] });
    const mine = screen.getByRole('region', { name: 'My moves' });
    const card = within(mine).getByRole('article', { name: 'My move' });
    await userEvent.click(within(card).getByRole('button', { name: 'Export' }));
    expect(env.saveFile).toHaveBeenCalledWith('my-move.glovebox.json', exportLesson(myMove));

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(within(card).getByRole('button', { name: 'Delete' }));
    expect(within(mine).getByRole('article', { name: 'My move' })).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Delete' }));
    expect(await within(mine).findByText(/Perform a move on camera/)).toBeInTheDocument();
    confirm.mockRestore();
  });

  test('importing a lesson file adds it; a bad file says why', async () => {
    await renderApp('/');
    const input = screen.getByLabelText('Import a lesson') as HTMLInputElement;
    await userEvent.upload(input, new File(['not json'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't JSON");
    const shared = { ...myMove, id: 'upward-roll', name: 'Shared rolls' };
    await userEvent.upload(input, new File([exportLesson(shared)], 'shared.json', { type: 'application/json' }));
    expect(await screen.findByRole('article', { name: 'Shared rolls' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(appStore.getState().userLessons[0]).toMatchObject({ id: 'shared-rolls', origin: 'imported' });
    // Choosing nothing does nothing
    fireEvent.change(input, { target: { files: [] } });
  });
});

describe('a lesson preview', () => {
  const builtin = (id: string) => BUILTIN_LESSONS.find(lesson => lesson.id === id)!;
  const traces = (container: HTMLElement) => [...container.querySelectorAll('.lesson-preview-trace path')];
  /** The lights, as drawn: each trail copy for every slot, oldest first, then the lights themselves. */
  const lights = (container: HTMLElement) => [...container.querySelectorAll('.lesson-preview-lights circle')];
  const motionOf = (light: Element) => light.querySelector('animateMotion')!;
  const valuesOf = (light: Element) => motionOf(light).getAttribute('values')!.split(';');

  test("traces each light's path over a loop, and plays it there at the lesson's tempo", () => {
    // 72 bpm, 4-beat loops: 64 samples over 3⅓ seconds
    const { container } = render(<LessonPreview lesson={TEST_LESSON} />);
    const paths = traces(container);
    expect(paths).toHaveLength(10);
    const drawn = lights(container);
    expect(drawn).toHaveLength(40);

    const light = drawn.at(-1)!;
    const motion = motionOf(light);
    expect(motion).toHaveAttribute('dur', '3.333s');
    expect(motion).toHaveAttribute('begin', '0.000s');
    expect(motion).toHaveAttribute('calcMode', 'linear');
    expect(motion).toHaveAttribute('repeatCount', 'indefinite');
    const values = valuesOf(light);
    expect(values).toHaveLength(65);
    expect(values.at(-1)).toBe(values[0]);
    expect(values[0]).toMatch(/^[\d.]+ [\d.]+$/);
    // The light runs along its own trace, and never goes missing
    expect(paths[9]).toHaveAttribute('d', `M${values.join(' L')}`);
    expect(light.querySelector('animate')).toBeNull();
  });

  test('each light trails smaller, fainter copies of itself a little behind', () => {
    const { container } = render(<LessonPreview lesson={TEST_LESSON} />);
    // The left thumb's oldest copy, its newest, and the light itself
    const drawn = lights(container);
    const oldest = drawn[0]!;
    const newest = drawn[20]!;
    const light = drawn[30]!;
    for (const copy of [oldest, newest]) expect(valuesOf(copy)).toEqual(valuesOf(light));
    // Started part-way into the loop, so a copy is where the light was a fraction of a beat ago
    expect(motionOf(oldest)).toHaveAttribute('begin', '-3.133s');
    expect(motionOf(newest)).toHaveAttribute('begin', '-3.267s');
    const r = (el: Element) => Number(el.getAttribute('r'));
    const opacity = (el: Element) => Number(el.getAttribute('opacity'));
    expect(r(oldest)).toBeLessThan(r(newest));
    expect(r(newest)).toBeLessThan(r(light));
    expect(opacity(oldest)).toBeLessThan(opacity(newest));
    expect(opacity(light)).toBe(1);
  });

  test('draws only the lights a move uses, sampling long and short loops alike', () => {
    const roll = render(<LessonPreview lesson={builtin('downward-roll')} />).container;
    expect(traces(roll)).toHaveLength(8);
    expect(lights(roll)).toHaveLength(32);

    // 36 beats at 88 bpm: capped at 480 samples
    const show = lights(render(<LessonPreview lesson={builtin('first-light-show')} />).container).at(-1)!;
    expect(valuesOf(show)).toHaveLength(481);
    expect(motionOf(show)).toHaveAttribute('dur', '24.545s');
    // 2 beats: at least 64
    const flails = lights(render(<LessonPreview lesson={builtin('wrist-flails')} />).container).at(-1)!;
    expect(valuesOf(flails)).toHaveLength(65);
  });

  test("lights glow in the palette's colors, each preview with its own glows", () => {
    const first = render(<LessonPreview lesson={TEST_LESSON} palette="colorblind" />).container;
    const second = render(<LessonPreview lesson={TEST_LESSON} />).container;
    const glows = (container: HTMLElement) => [...container.querySelectorAll('radialGradient')];
    for (const container of [first, second]) {
      const ids = new Set(glows(container).map(glow => glow.id));
      expect(ids.size).toBe(5);
      for (const light of lights(container)) {
        expect(ids).toContain(light.getAttribute('fill')!.match(/^url\(#(.+)\)$/)![1]);
      }
    }
    expect(glows(first).map(glow => glow.id)).not.toContain(glows(second)[0]!.id);
    const colorOf = (container: HTMLElement, finger: number) =>
      glows(container)[finger]!.querySelectorAll('stop')[1]!.getAttribute('stop-color');
    expect(colorOf(first, 0)).toBe(withAlpha(PALETTES.colorblind[0]!, 0.95));
    expect(colorOf(second, 0)).toBe(withAlpha(PALETTES.rainbow[0]!, 0.95));
    expect(traces(first)[0]).toHaveAttribute('stroke', PALETTES.colorblind[0]);
  });

  test('a recorded move hides a light while it was lost, and lifts its trace there', () => {
    // 8 samples, 2 a beat: a 4-beat loop. The right thumb is lost at the start, the right index mid-way
    const at = (i: number): [number, number] => [Math.cos(i), Math.sin(i) * 0.1];
    const frames = Array.from({ length: 8 }, (_, i) => {
      const frame: ([number, number] | null)[] = new Array(10).fill(null);
      frame[5] = i < 2 ? null : at(i);
      frame[6] = i === 4 ? null : at(i + 1);
      return frame;
    });
    const recorded = lessonSchema.parse({
      ...TEST_LESSON,
      id: 'lost-lights',
      origin: 'recorded',
      timing: { ...TEST_LESSON.timing, bpm: 60 },
      activeSlots: [5, 6],
      cues: [],
      motion: { kind: 'track', track: { samplesPerBeat: 2, interpolation: 'linear', frames } },
    });
    const { container } = render(<LessonPreview lesson={recorded} />);
    const [thumbTrace, indexTrace] = traces(container);
    const [thumb, index] = lights(container).slice(-2);

    const thumbShown = thumb!.querySelector('animate')!;
    expect(thumbShown).toHaveAttribute('attributeName', 'visibility');
    expect(thumbShown).toHaveAttribute('calcMode', 'discrete');
    expect(thumbShown).toHaveAttribute('dur', '4.000s');
    expect(thumbShown).toHaveAttribute('begin', motionOf(thumb!).getAttribute('begin'));
    // Lost from half-way between its last frame and the first to half-way into the third
    const shown = thumbShown.getAttribute('values')!.split(';');
    expect(shown).toHaveLength(64);
    expect(shown.indexOf('visible')).toBe(12);
    expect(shown.lastIndexOf('visible')).toBe(59);
    expect(shown.at(-1)).toBe('hidden');
    // While it's lost, the light waits where it was last seen, round the loop
    const values = valuesOf(thumb!);
    expect(values[0]).toBe(values.at(-1));
    expect(values[0]).toBe(values[shown.lastIndexOf('visible')]);
    expect(thumbTrace!.getAttribute('d')!.match(/M/g)).toHaveLength(1);

    expect(index!.querySelector('animate')!.getAttribute('values')).toContain('hidden');
    expect(indexTrace!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
  });
});
