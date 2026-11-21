import { useMemo, useState } from 'react';
import { combineReleases, hasUserFacingChanges, parseReleaseSection, releasesBetween } from './changelog';
import { ReleaseNotesView } from './ReleaseNotesView';
import type { AvailableUpdate } from './updates';

/** From this many releases behind, the notes start out by type: what changed matters more than when. */
export const BY_TYPE_FROM = 5;

type View = 'release' | 'type';

/** The releases an update brings: every one since the version running now, newest first. */
export function useReleasesSince(update: AvailableUpdate) {
  return useMemo(
    () => (update.changelog ? releasesBetween(update.changelog, update.currentVersion, update.version) : []),
    [update.changelog, update.currentVersion, update.version]
  );
}

/**
 * What an update brings. Some releases behind, that's each release since
 * this version that changed something to see, by release or all together
 * by type (Added, Fixed…), which is how it starts from BY_TYPE_FROM
 * releases. Otherwise the new release's own notes.
 */
export function UpdateNotes({ update }: { update: AvailableUpdate }) {
  const since = useReleasesSince(update).filter(hasUserFacingChanges);
  const [chosen, setChosen] = useState<View | null>(null);

  if (since.length > 1) {
    const view = chosen ?? (since.length >= BY_TYPE_FROM ? 'type' : 'release');
    return (
      <div className="update-notes">
        <fieldset className="row view-toggle" aria-label="Show the changes">
          {(['release', 'type'] as const).map(option => (
            <button
              key={option}
              type="button"
              className={`btn small ${view === option ? 'primary' : 'ghost'}`}
              aria-pressed={view === option}
              onClick={() => setChosen(option)}
            >
              {option === 'release' ? 'By release' : 'By type'}
            </button>
          ))}
        </fieldset>
        {view === 'type' ? (
          <ReleaseNotesView
            release={{ ...combineReleases(since), date: null }}
            title={`Everything new since ${update.currentVersion}`}
          />
        ) : (
          since.map(release => (
            <ReleaseNotesView key={release.version} release={release} title={`GloveBox ${release.version}`} />
          ))
        )}
      </div>
    );
  }
  if (!update.notes) return <p className="muted">This release has no notes.</p>;
  return <ReleaseNotesView release={parseReleaseSection(update.version, update.notes)} />;
}
