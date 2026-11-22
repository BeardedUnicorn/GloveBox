import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import { LessonPreview } from '../components/LessonPreview';
import { BUILTIN_LESSONS } from '../lessons/builtin';
import { exportLesson } from '../lessons/exchange';
import type { LessonDef } from '../lessons/schema';
import { appStore } from '../state/appStore';
import { createLocalStorage } from '../storage/localStorageStorage';
import { fakeEnv } from '../test/fakeEnv';
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
  test("draws each active light's path over a loop", () => {
    const { container } = render(<LessonPreview lesson={BUILTIN_LESSONS[1]!} />);
    expect(container.querySelectorAll('path')).toHaveLength(10);
    expect(container.querySelector('path')!.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+ L/);
  });
});
