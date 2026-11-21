import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  type AvailableUpdate,
  automaticCheckDue,
  CHECK_INTERVAL_MS,
  NOT_INSTALLED,
  resetUpdatesForTest,
  sentence,
  UPDATE_PROGRESS,
  updates,
  useUpdates,
} from './updates';

const UPDATE: AvailableUpdate = {
  version: '0.2.0',
  currentVersion: '0.1.0',
  notes: '### Added\n\n- Dark mode',
  changelog: null,
  date: '2026-12-01T10:00:00Z',
};

const tauri = globalThis as { isTauri?: boolean };

/** The Rust side, pretending: `handle` answers each command. */
function rust(handle: (cmd: string) => unknown) {
  mockIPC(cmd => handle(cmd), { shouldMockEvents: true });
}

beforeEach(() => {
  localStorage.clear();
  tauri.isTauri = true;
  resetUpdatesForTest();
});

afterEach(() => {
  clearMocks();
  delete tauri.isTauri;
  vi.restoreAllMocks();
});

describe('checking', () => {
  test('a newer release opens the dialog and remembers when it checked', async () => {
    rust(cmd => (cmd === 'check_for_update' ? UPDATE : null));
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    await updates.check({ manual: false });
    expect(updates.get()).toEqual({
      update: { status: 'available', update: UPDATE, open: true },
      autoCheck: true,
      lastCheckedAt: 1_000,
    });
    expect(localStorage.getItem('glovebox.updates.lastCheckedAt')).toBe('1000');
  });

  test('nothing newer is up to date', async () => {
    rust(() => null);
    await updates.check({ manual: true });
    expect(updates.get().update).toEqual({ status: 'upToDate' });
  });

  test('a check the user asked for shows why it failed', async () => {
    rust(() => {
      throw 'the network is down';
    });
    await updates.check({ manual: true });
    expect(updates.get().update).toEqual({ status: 'checkFailed', error: 'The network is down.' });
  });

  test('an automatic check fails quietly, leaving things as they were', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rust(() => {
      throw new Error('offline');
    });
    await updates.check({ manual: false });
    expect(updates.get().update).toEqual({ status: 'idle' });
    expect(warn).toHaveBeenCalledWith('The automatic update check failed:', expect.any(Error));
  });

  test('in a browser there is nothing to check: a manual check says so, an automatic one does nothing', async () => {
    delete tauri.isTauri;
    await updates.check({ manual: false });
    expect(updates.get().update).toEqual({ status: 'idle' });
    await updates.check({ manual: true });
    expect(updates.get().update).toEqual({ status: 'checkFailed', error: NOT_INSTALLED });
  });

  test('no second check while one is under way', async () => {
    let calls = 0;
    let answer: (value: null) => void = () => {};
    rust(() => {
      calls++;
      return new Promise(resolve => {
        answer = resolve;
      });
    });
    const first = updates.check({ manual: true });
    await updates.check({ manual: true });
    expect(updates.get().update).toEqual({ status: 'checking', manual: true });
    answer(null);
    await first;
    expect(calls).toBe(1);
  });
});

describe('the dialog', () => {
  async function found() {
    rust(() => UPDATE);
    await updates.check({ manual: false });
  }

  test('Later closes it; show opens it again', async () => {
    await found();
    updates.later();
    expect(updates.get().update).toEqual({ status: 'available', update: UPDATE, open: false });
    updates.show();
    expect(updates.get().update).toEqual({ status: 'available', update: UPDATE, open: true });
  });

  test('Later and show do nothing without an update', () => {
    updates.later();
    updates.show();
    expect(updates.get().update).toEqual({ status: 'idle' });
  });
});

describe('installing', () => {
  test('shows the download’s progress as the Rust side sends it', async () => {
    const seen: unknown[] = [];
    rust(cmd => {
      if (cmd === 'check_for_update') return UPDATE;
      return (async () => {
        await emit(UPDATE_PROGRESS, { downloaded: 50, total: 100, installing: false });
        seen.push(updates.get().update);
        await emit(UPDATE_PROGRESS, { downloaded: 100, total: 100, installing: true });
        seen.push(updates.get().update);
        // The app restarts here; the promise never settles in real life
        return null;
      })();
    });
    await updates.check({ manual: false });
    await updates.install();
    expect(seen).toEqual([
      { status: 'installing', update: UPDATE, progress: { downloaded: 50, total: 100, installing: false } },
      { status: 'installing', update: UPDATE, progress: { downloaded: 100, total: 100, installing: true } },
    ]);
  });

  test('a failed install says why, and Try again or Later still work', async () => {
    rust(cmd => {
      if (cmd === 'check_for_update') return UPDATE;
      throw "the update's signature doesn't match the file";
    });
    await updates.check({ manual: false });
    await updates.install();
    expect(updates.get().update).toEqual({
      status: 'installFailed',
      update: UPDATE,
      error: "The update's signature doesn't match the file.",
    });
    await updates.install();
    expect(updates.get().update.status).toBe('installFailed');
    updates.later();
    expect(updates.get().update).toEqual({ status: 'available', update: UPDATE, open: false });
  });

  test('progress for an install the store no longer shows is ignored', async () => {
    rust(cmd => {
      if (cmd === 'check_for_update') return UPDATE;
      return (async () => {
        // The store started over (a reload) while the old download still reports
        resetUpdatesForTest();
        await emit(UPDATE_PROGRESS, { downloaded: 1, total: null, installing: false });
        return null;
      })();
    });
    await updates.check({ manual: false });
    await updates.install();
    expect(updates.get().update).toEqual({ status: 'idle' });
  });

  test('nothing to install without an update', async () => {
    await updates.install();
    expect(updates.get().update).toEqual({ status: 'idle' });
  });
});

describe('the automatic checks', () => {
  test('are due when on, and a day after the last one (or never)', async () => {
    expect(automaticCheckDue(0)).toBe(true);
    rust(() => null);
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    await updates.check({ manual: false });
    expect(automaticCheckDue(10_000 + CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(automaticCheckDue(10_000 + CHECK_INTERVAL_MS)).toBe(true);
    updates.setAutoCheck(false);
    expect(automaticCheckDue(10_000 + CHECK_INTERVAL_MS)).toBe(false);
  });

  test('the switch and the last check are remembered across launches', () => {
    updates.setAutoCheck(false);
    localStorage.setItem('glovebox.updates.lastCheckedAt', '42');
    resetUpdatesForTest();
    expect(updates.get()).toMatchObject({ autoCheck: false, lastCheckedAt: 42 });
  });

  test('without localStorage nothing is remembered, and nothing breaks', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    resetUpdatesForTest();
    expect(updates.get()).toMatchObject({ autoCheck: true, lastCheckedAt: null });
    updates.setAutoCheck(false);
    expect(updates.get().autoCheck).toBe(false);
  });
});

describe('the store', () => {
  test('re-renders its readers when it changes, and they can stop listening', () => {
    const { result, unmount } = renderHook(() => useUpdates());
    expect(result.current.autoCheck).toBe(true);
    act(() => updates.setAutoCheck(false));
    expect(result.current.autoCheck).toBe(false);
    unmount();
    updates.setAutoCheck(true);
  });

  test('says a refusal as a sentence', () => {
    expect(sentence('no network')).toBe('No network.');
    expect(sentence('Already a sentence!')).toBe('Already a sentence!');
    expect(sentence(new Error('boom'))).toBe('Error: boom.');
  });
});
