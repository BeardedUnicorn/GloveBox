/** Renders the app's real routes at a path, with a fake Env and fresh in-memory storage. */

import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { EnvContext } from '../envContext';
import type { LessonDef } from '../lessons/schema';
import type { SessionRecord } from '../progression/types';
import { routes } from '../routes';
import { appStore, SETTINGS_KEY } from '../state/appStore';
import { DEFAULT_SETTINGS, type Settings } from '../state/settings';
import { createLocalStorage } from '../storage/localStorageStorage';
import { type FakeEnv, fakeEnv } from './fakeEnv';

/** 2026-11-21, noon local: "today" for progress. */
export const TODAY = new Date(2026, 10, 21, 12).getTime();

export interface RenderOptions {
  env?: FakeEnv;
  settings?: Partial<Settings>;
  sessions?: SessionRecord[];
  lessons?: LessonDef[];
}

export async function renderApp(path: string, options: RenderOptions = {}) {
  const env = options.env ?? fakeEnv();
  const storage = createLocalStorage(null);
  if (options.settings) await storage.settings.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...options.settings });
  for (const session of options.sessions ?? []) await storage.sessions.add(session);
  for (const lesson of options.lessons ?? []) {
    await storage.lessons.save({
      id: lesson.id,
      version: lesson.version,
      name: lesson.name,
      tier: lesson.tier,
      origin: lesson.origin === 'imported' ? 'imported' : 'recorded',
      def: lesson,
      createdAt: TODAY,
      updatedAt: TODAY,
    });
  }
  await appStore.getState().init(storage, () => TODAY);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <EnvContext.Provider value={env}>
      <RouterProvider router={router} />
    </EnvContext.Provider>
  );
  await act(async () => {
    await env.settle();
  });
  return { ...view, env, router, storage };
}

/** Runs `fn` (driving fake frames or time) inside act, then lets promises settle. */
export async function step(env: FakeEnv, fn: () => void = () => {}) {
  await act(async () => {
    fn();
    await env.settle();
  });
}
