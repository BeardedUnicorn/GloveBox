import { useEffect, useMemo } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { browserEnv, type Env } from './env';
import { EnvContext } from './envContext';
import { routes } from './routes';
import { appStore, useApp } from './state/appStore';
import { createStorage } from './storage';
import type { Storage } from './storage/types';

export interface AppProps {
  env?: Env;
  storage?: Storage;
  /** Hash routing in the app (no server to answer deep links); tests pass a memory router. */
  makeRouter?: typeof createHashRouter;
}

/** GloveBox's window: loads saved data, then routes. */
export function App({ env = browserEnv, storage, makeRouter = createHashRouter }: AppProps) {
  const ready = useApp(state => state.ready);
  const loadError = useApp(state => state.loadError);
  useEffect(() => {
    void appStore.getState().init(storage ?? createStorage());
  }, [storage]);
  const router = useMemo(() => makeRouter(routes), [makeRouter]);
  if (!ready) {
    return (
      <div className="boot" role="status">
        <span className="brand-dot" aria-hidden="true" /> GloveBox
      </div>
    );
  }
  return (
    <EnvContext.Provider value={env}>
      {loadError && (
        <div className="alert load-error" role="alert">
          Your saved progress couldn't be read ({loadError}). New practice won't be saved until GloveBox is restarted.
        </div>
      )}
      <RouterProvider router={router} />
    </EnvContext.Provider>
  );
}
