import type { ReleaseNotes } from './changelog';

/** One release's notes: its intro, then each heading's bullets. */
export function ReleaseNotesView({ release, title }: { release: ReleaseNotes; title?: string }) {
  return (
    <section className="notes" aria-label={title ?? `GloveBox ${release.version}`}>
      {title && (
        <h3 className="release-title">
          {title}
          {release.date && <span className="faint"> · {release.date}</span>}
        </h3>
      )}
      {release.intro && <p className="muted">{release.intro}</p>}
      {release.groups.map(group => (
        <div key={group.heading}>
          <h4>{group.heading}</h4>
          <ul>
            {group.items.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
