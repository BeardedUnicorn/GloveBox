import { RELEASES, type ReleaseNotes } from './changelog';
import { ReleaseNotesView } from './ReleaseNotesView';
import './updates.css';

/** Settings → What's new: every release's notes, newest first (the bundled CHANGELOG.md). */
export function WhatsNew({ releases = RELEASES }: { releases?: ReleaseNotes[] }) {
  return (
    <section className="panel whats-new" aria-labelledby="whats-new-heading">
      <h2 id="whats-new-heading">What's new</h2>
      {releases.length === 0 ? (
        <p className="muted">No releases yet: this is a development build.</p>
      ) : (
        releases.map(release => (
          <ReleaseNotesView key={release.version} release={release} title={`GloveBox ${release.version}`} />
        ))
      )}
    </section>
  );
}
