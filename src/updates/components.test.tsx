import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as entry from './index';
import { ReleaseNotesView } from './ReleaseNotesView';
import { UpdatedNotice } from './UpdatedNotice';
import { BY_TYPE_FROM, UpdateNotes } from './UpdateNotes';
import { DUE_CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, UpdatePrompt } from './UpdatePrompt';
import { UpdatesSection } from './UpdatesSection';
import { type AvailableUpdate, resetUpdatesForTest, type UpdateState, updates } from './updates';
import { LAST_SEEN_VERSION_KEY, updatedFrom } from './useUpdatedNotice';
import { APP_VERSION } from './version';
import { WhatsNew } from './WhatsNew';

const tauri = globalThis as { isTauri?: boolean };
const NOT_INSTALLED_TEXT = 'Updates work in the installed app.';

const section = (version: string, items: string) =>
  `## ${version} – 2026-12-0${version.at(2)}\n\n### Added\n\n${items}\n`;

const UPDATE: AvailableUpdate = {
  version: '0.3.0',
  currentVersion: '0.2.0',
  notes: '### Added\n\n- Tutting boxes',
  changelog: section('0.3.0', '- Tutting boxes'),
  date: null,
};

/** The store as if a check (and maybe an install) got this far. */
function storeIs(update: UpdateState) {
  // The store only moves through its own methods; reach each state the way the app does
  vi.spyOn(updates, 'get').mockReturnValue({ ...updates.get(), update });
  act(() => updates.setAutoCheck(updates.get().autoCheck));
}

beforeEach(() => {
  localStorage.clear();
  resetUpdatesForTest();
});

afterEach(() => {
  clearMocks();
  delete tauri.isTauri;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the update dialog', () => {
  test('stays closed with nothing to show', () => {
    render(<UpdatePrompt blocked={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('offers the update with its notes, and Later closes it', async () => {
    tauri.isTauri = true;
    mockIPC(() => UPDATE);
    render(<UpdatePrompt blocked={false} />);
    await act(() => updates.check({ manual: true }));

    expect(screen.getByRole('dialog', { name: 'GloveBox 0.3.0 is available' })).toBeInTheDocument();
    expect(screen.getByText(/You have 0\.2\.0\./)).toBeInTheDocument();
    expect(screen.getByText('Tutting boxes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('waits while blocked (during practice), then asks', async () => {
    tauri.isTauri = true;
    mockIPC(() => UPDATE);
    const { rerender } = render(<UpdatePrompt blocked />);
    await act(() => updates.check({ manual: false }));
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<UpdatePrompt blocked={false} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('Escape closes it like Later; other keys don’t, and it stops listening once closed', async () => {
    tauri.isTauri = true;
    mockIPC(() => UPDATE);
    render(<UpdatePrompt blocked={false} />);
    await act(() => updates.check({ manual: true }));
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const later = vi.spyOn(updates, 'later');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(later).not.toHaveBeenCalled();
  });

  test('installs, showing the download, then what installing looks like', () => {
    const { rerender } = render(<UpdatePrompt blocked />);
    storeIs({ status: 'installing', update: UPDATE, progress: null });
    rerender(<UpdatePrompt blocked />);
    expect(screen.getByText('Starting the download…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install and restart' })).toBeDisabled();
    // Nothing closes it mid-install
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    storeIs({
      status: 'installing',
      update: UPDATE,
      progress: { downloaded: 2_500_000, total: 10_000_000, installing: false },
    });
    expect(screen.getByText('Downloading… 2.5 MB of 10.0 MB')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Downloading the update' })).toHaveAttribute('aria-valuenow', '25');

    storeIs({
      status: 'installing',
      update: UPDATE,
      progress: { downloaded: 1_000_000, total: null, installing: false },
    });
    expect(screen.getByText('Downloading… 1.0 MB')).toBeInTheDocument();

    storeIs({ status: 'installing', update: UPDATE, progress: { downloaded: 1, total: 1, installing: true } });
    expect(screen.getByText("Installing… GloveBox restarts when it's done.")).toBeInTheDocument();
  });

  test('a failed install says why; Try again installs again', async () => {
    tauri.isTauri = true;
    mockIPC(
      cmd => {
        if (cmd === 'check_for_update') return UPDATE;
        throw 'the disk is full';
      },
      { shouldMockEvents: true }
    );
    render(<UpdatePrompt blocked={false} />);
    await act(() => updates.check({ manual: true }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install and restart' })));
    expect(screen.getByRole('alert')).toHaveTextContent("The update couldn't be installed. The disk is full.");
    const install = vi.spyOn(updates, 'install').mockResolvedValue();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(install).toHaveBeenCalled();
  });
});

describe('the automatic checks', () => {
  test('run 10 s after launch, then whenever the daily one is due (hourly, or on showing the window)', () => {
    vi.useFakeTimers();
    const check = vi.spyOn(updates, 'check').mockResolvedValue();
    const { unmount } = render(<UpdatePrompt blocked={false} checkAutomatically />);
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ manual: false });

    vi.advanceTimersByTime(DUE_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledTimes(3);

    unmount();
    vi.advanceTimersByTime(DUE_CHECK_INTERVAL_MS);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledTimes(3);
  });

  test("don't run when switched off, or in a development build", () => {
    vi.useFakeTimers();
    const check = vi.spyOn(updates, 'check').mockResolvedValue();
    updates.setAutoCheck(false);
    render(<UpdatePrompt blocked={false} checkAutomatically />);
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS + DUE_CHECK_INTERVAL_MS);
    expect(check).not.toHaveBeenCalled();

    // Tests run as a development build (import.meta.env.DEV)
    updates.setAutoCheck(true);
    render(<UpdatePrompt blocked={false} />);
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
    expect(check).toHaveBeenCalledTimes(0);
  });
});

describe('the update’s notes', () => {
  const behind = (count: number): AvailableUpdate => {
    const versions = Array.from({ length: count }, (_, i) => `0.${count + 1 - i}.0`);
    const changelog = [
      ...versions.map(version => section(version, `- New in ${version}`)),
      '## 0.1.5 – 2026-11-01\n\nNo user-facing changes.\n',
    ].join('\n');
    return { version: versions[0]!, currentVersion: '0.1.0', notes: `- New in ${versions[0]}`, changelog, date: null };
  };

  test('one release behind: its own notes', () => {
    render(<UpdateNotes update={UPDATE} />);
    expect(screen.getByRole('heading', { name: 'Added' })).toBeInTheDocument();
    expect(screen.queryByRole('group')).toBeNull();
  });

  test('a release without notes says so', () => {
    render(<UpdateNotes update={{ ...UPDATE, notes: null, changelog: null }} />);
    expect(screen.getByText('This release has no notes.')).toBeInTheDocument();
  });

  test('some releases behind: each release, or all by type', () => {
    render(<UpdateNotes update={behind(2)} />);
    expect(screen.getByRole('heading', { name: /GloveBox 0\.3\.0/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /GloveBox 0\.2\.0/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'By type' }));
    expect(screen.getByRole('heading', { name: 'Everything new since 0.1.0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'By type' })).toHaveAttribute('aria-pressed', 'true');
  });

  test(`${BY_TYPE_FROM} or more releases behind: starts by type`, () => {
    render(<UpdateNotes update={behind(BY_TYPE_FROM)} />);
    expect(screen.getByRole('heading', { name: 'Everything new since 0.1.0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'By release' }));
    expect(screen.getAllByRole('heading', { name: /^GloveBox 0\.\d\.0/ })).toHaveLength(BY_TYPE_FROM);
  });

  test('the dialog says how many releases behind', async () => {
    tauri.isTauri = true;
    mockIPC(() => behind(3));
    render(<UpdatePrompt blocked={false} />);
    await act(() => updates.check({ manual: true }));
    expect(screen.getByText(/You have 0\.1\.0, 4 releases behind\./)).toBeInTheDocument();
  });

  test('a release is its intro and its headings', () => {
    render(
      <ReleaseNotesView
        release={{ version: '0.2.0', date: '2026-12-01', intro: 'No user-facing changes.', groups: [] }}
        title="GloveBox 0.2.0"
      />
    );
    expect(screen.getByRole('heading', { name: /GloveBox 0\.2\.0\s*·\s*2026-12-01/ })).toBeInTheDocument();
    expect(screen.getByText('No user-facing changes.')).toBeInTheDocument();
  });
});

describe('Settings → Updates', () => {
  test('shows the version and checks when asked', async () => {
    tauri.isTauri = true;
    mockIPC(() => null);
    render(<UpdatesSection />);
    expect(screen.getByText(APP_VERSION)).toBeInTheDocument();
    expect(screen.getByText('Never checked.')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check for updates' })));
    expect(screen.getByText('GloveBox is up to date.')).toBeInTheDocument();
    expect(screen.getByText(/^Last checked /)).toBeInTheDocument();
  });

  test('says what each check found', () => {
    render(<UpdatesSection />);
    storeIs({ status: 'checking', manual: true });
    expect(screen.getByText('Checking for updates…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();

    storeIs({ status: 'checkFailed', error: NOT_INSTALLED_TEXT });
    expect(screen.getByRole('alert')).toHaveTextContent(`Couldn't check for updates. ${NOT_INSTALLED_TEXT}`);

    storeIs({ status: 'installing', update: UPDATE, progress: null });
    expect(screen.getByText('Installing GloveBox 0.3.0…')).toBeInTheDocument();

    storeIs({ status: 'installFailed', update: UPDATE, error: 'no' });
    expect(screen.getByText('GloveBox 0.3.0 is available.')).toBeInTheDocument();
  });

  test('an update found offers its notes again', async () => {
    tauri.isTauri = true;
    mockIPC(() => UPDATE);
    render(
      <>
        <UpdatesSection />
        <UpdatePrompt blocked={false} />
      </>
    );
    await act(() => updates.check({ manual: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    fireEvent.click(screen.getByRole('button', { name: "See what's new" }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('switches the automatic checks', () => {
    render(<UpdatesSection />);
    const box = screen.getByRole('checkbox', { name: 'Check for updates automatically' });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(updates.get().autoCheck).toBe(false);
  });
});

describe("What's new", () => {
  test('lists every release, newest first', () => {
    render(
      <WhatsNew
        releases={[
          { version: '0.2.0', date: '2026-12-01', intro: '', groups: [{ heading: 'Added', items: ['Contours'] }] },
          { version: '0.1.0', date: null, intro: '', groups: [{ heading: 'Added', items: ['The first lessons'] }] },
        ]}
      />
    );
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual([
      'GloveBox 0.2.0 · 2026-12-01',
      'GloveBox 0.1.0',
    ]);
  });

  test("a build with no releases yet says so (the app's own CHANGELOG by default)", () => {
    render(<WhatsNew releases={[]} />);
    expect(screen.getByText(/No releases yet/)).toBeInTheDocument();
    render(<WhatsNew />);
    expect(screen.getAllByRole('heading', { name: "What's new" })).toHaveLength(2);
  });
});

describe('the updated notice', () => {
  test('an update came from an older version only', () => {
    expect(updatedFrom('0.1.0', '0.2.0')).toBe('0.1.0');
    expect(updatedFrom('0.2.0', '0.2.0')).toBeNull();
    expect(updatedFrom('0.3.0', '0.2.0')).toBeNull();
    expect(updatedFrom(null, '0.2.0')).toBeNull();
    expect(updatedFrom('0.1.0', 'dev')).toBeNull();
  });

  test('shows once after an update, then remembers this version', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.1.0');
    const onShowWhatsNew = vi.fn();
    const { unmount } = render(<UpdatedNotice onShowWhatsNew={onShowWhatsNew} version="0.2.0" />);
    expect(screen.getByRole('status')).toHaveTextContent('Updated to GloveBox 0.2.0 (from 0.1.0)');
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('0.2.0');
    fireEvent.click(screen.getByRole('button', { name: "See what's new" }));
    expect(onShowWhatsNew).toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    unmount();

    render(<UpdatedNotice onShowWhatsNew={onShowWhatsNew} version="0.2.0" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('can be dismissed; the first launch ever shows nothing', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.1.0');
    render(<UpdatedNotice onShowWhatsNew={() => {}} version="0.2.0" />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();

    localStorage.clear();
    render(<UpdatedNotice onShowWhatsNew={() => {}} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(APP_VERSION);
  });

  test('without localStorage there is no notice, and nothing breaks', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<UpdatedNotice onShowWhatsNew={() => {}} version="0.2.0" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

test('the entry point exports the pieces the app wires in', () => {
  expect(Object.keys(entry).sort()).toEqual([
    'APP_VERSION',
    'RELEASES',
    'UpdatePrompt',
    'UpdatedNotice',
    'UpdatesSection',
    'WhatsNew',
    'updates',
    'useUpdates',
  ]);
});
