import { createContext, useContext } from 'react';
import { browserEnv, type Env } from './env';

/** The browser, or a test's stand-in for it (src/env.ts). */
export const EnvContext = createContext<Env>(browserEnv);

export const useEnv = (): Env => useContext(EnvContext);
