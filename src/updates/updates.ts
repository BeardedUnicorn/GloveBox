/**
 * Updates from GloveBox's GitHub releases. The Rust side reads the release
 * feed and installs (src-tauri/src/updates.rs); this holds what the update
 * dialog and Settings → Updates show, and whether checks run on their own.
 * One store for the window, read with useUpdates().
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';

/** check_for_update's reply when there's a newer release. */
export interface AvailableUpdate {
  version: string;
  /** The version running now. */
  currentVersion: string;
  /** The release's CHANGELOG section (Markdown). */
  notes: string | null;
  /** Recent releases' notes, newest first (CHANGELOG sections); null from a feed without them. */
  changelog: string | null;
  date: string | null;
}

/** The `update-progress` event's payload. */
export interface DownloadProgress {
  downloaded: number;
  /** null when the server doesn't say. */
  total: number | null;
  /** The download is done and the update is being installed. */
  installing: boolean;
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking'; manual: boolean }
  | { status: 'upToDate' }
  /** A check the user asked for failed (automatic ones fail quietly). */
  | { status: 'checkFailed'; error: string }
  /** `open`: the dialog asks; Later closes it until the next check. */
  | { status: 'available'; update: AvailableUpdate; open: boolean }
  /** `progress` is null until the download starts. */
  | { status: 'installing'; update: AvailableUpdate; progress: DownloadProgress | null }
  | { status: 'installFailed'; update: AvailableUpdate; error: string };

export interface Updates {
  update: UpdateState;
  /** Checks run on their own (at launch, then daily). */
  autoCheck: boolean;
  /** When the last check succeeded, ms since the epoch; null if never. */
  lastCheckedAt: number | null;
}

/** The event install_update sends its progress as. */
export const UPDATE_PROGRESS = 'update-progress';

/** How long after the last check an automatic one is due. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** What a check in a browser (pnpm dev, without Tauri) says. */
export const NOT_INSTALLED = 'Updates work in the installed app.';

const AUTO_CHECK_KEY = 'glovebox.updates.autoCheck';
const LAST_CHECKED_KEY = 'glovebox.updates.lastCheckedAt';

/** localStorage can be unavailable; then nothing is remembered. */
function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered: the default comes back next launch
  }
}

/** A refusal as a sentence: the Rust side's words can start in lower case. */
export function sentence(reason: unknown): string {
  const text = String(reason);
  const capital = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

function initial(): Updates {
  const last = Number(stored(LAST_CHECKED_KEY));
  return {
    update: { status: 'idle' },
    autoCheck: stored(AUTO_CHECK_KEY) !== 'false',
    lastCheckedAt: last > 0 ? last : null,
  };
}

let current: Updates = initial();
const listeners = new Set<() => void>();

function set(next: Partial<Updates>): void {
  current = { ...current, ...next };
  for (const listener of listeners) listener();
}

const setUpdate = (update: UpdateState) => set({ update });

/** An automatic check is due: they're on, and the last one was a day ago (or never). */
export function automaticCheckDue(now: number): boolean {
  const last = current.lastCheckedAt;
  return current.autoCheck && (last === null || now - last >= CHECK_INTERVAL_MS);
}

export const updates = {
  get: (): Updates => current,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Asks the release feed for a newer version; one it finds opens the
   * dialog. A check the user asked for (`manual`) shows its failure; an
   * automatic one only logs it. Nothing happens while a check or an install
   * is under way.
   */
  async check({ manual }: { manual: boolean }): Promise<void> {
    const before = current.update;
    if (before.status === 'checking' || before.status === 'installing') return;
    if (!isTauri()) {
      if (manual) setUpdate({ status: 'checkFailed', error: NOT_INSTALLED });
      return;
    }
    setUpdate({ status: 'checking', manual });
    try {
      const found = await invoke<AvailableUpdate | null>('check_for_update');
      const now = Date.now();
      store(LAST_CHECKED_KEY, String(now));
      set({
        lastCheckedAt: now,
        update: found === null ? { status: 'upToDate' } : { status: 'available', update: found, open: true },
      });
    } catch (error) {
      if (manual) {
        setUpdate({ status: 'checkFailed', error: sentence(error) });
      } else {
        console.warn('The automatic update check failed:', error);
        setUpdate(before);
      }
    }
  },

  /** Closes the dialog; the next check asks again. */
  later(): void {
    const { update } = current;
    if (update.status === 'available' || update.status === 'installFailed') {
      setUpdate({ status: 'available', update: update.update, open: false });
    }
  },

  /** Opens the dialog again for the update a check found. */
  show(): void {
    const { update } = current;
    if (update.status === 'available') setUpdate({ ...update, open: true });
  },

  /**
   * Downloads and installs the update, showing its progress. On success the
   * app restarts into the new version, so this only comes back on failure.
   */
  async install(): Promise<void> {
    const { update } = current;
    if (update.status !== 'available' && update.status !== 'installFailed') return;
    const found = update.update;
    setUpdate({ status: 'installing', update: found, progress: null });
    const stop = await listen<DownloadProgress>(UPDATE_PROGRESS, event => {
      if (current.update.status === 'installing') setUpdate({ ...current.update, progress: event.payload });
    });
    try {
      await invoke<void>('install_update');
    } catch (error) {
      setUpdate({ status: 'installFailed', update: found, error: sentence(error) });
    } finally {
      stop();
    }
  },

  setAutoCheck(autoCheck: boolean): void {
    store(AUTO_CHECK_KEY, String(autoCheck));
    set({ autoCheck });
  },
};

/** The update state, re-rendering when it changes. */
export function useUpdates(): Updates {
  return useSyncExternalStore(updates.subscribe, updates.get);
}

/** A fresh store (from localStorage) for each test. */
export function resetUpdatesForTest(): void {
  current = initial();
  listeners.clear();
}
