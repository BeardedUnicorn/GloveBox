/**
 * Once per new version, a notice that GloveBox was updated, linking to
 * What's new. The version that last ran is kept in localStorage; the first
 * launch ever, or a version older than the last one seen (a dev build, a
 * downgrade), is noted without one.
 */

import { useEffect, useState } from 'react';
import { compareVersions, isVersion } from './version';

/** The version this webview last ran. */
export const LAST_SEEN_VERSION_KEY = 'glovebox.lastSeenVersion';

function lastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

function remember(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // Not remembered: the notice may show again next launch
  }
}

/** The version an update came from: `seen` when it's an older version than `current`, else null. */
export function updatedFrom(seen: unknown, current: string): string | null {
  return isVersion(seen) && isVersion(current) && compareVersions(seen, current) < 0 ? seen : null;
}

export interface UpdatedNotice {
  /** The update just made (from → to), until dismissed; null when there's none. */
  notice: { from: string; to: string } | null;
  dismiss: () => void;
}

/** The notice for `current`, the running version (APP_VERSION). */
export function useUpdatedNotice(current: string): UpdatedNotice {
  // Read once, before this run is remembered below
  const [from, setFrom] = useState(() => updatedFrom(lastSeen(), current));
  useEffect(() => remember(current), [current]);
  return { notice: from === null ? null : { from, to: current }, dismiss: () => setFrom(null) };
}
