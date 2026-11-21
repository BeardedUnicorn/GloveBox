/**
 * CHANGELOG.md (bundled as text) as release notes: for Settings → What's
 * new, and for an update's notes the same way. `pnpm release` writes it: a
 * `## X.Y.Z – date` section per release, newest first, with `### Added`-style
 * headings over `- ` bullets. Text before a section's first heading is its
 * intro ("No user-facing changes.").
 */

import changelogText from '../../CHANGELOG.md?raw';
import { compareVersions, isVersion } from './version';

export interface ReleaseGroup {
  /** Added, Changed, Removed, Fixed or Security. */
  heading: string;
  items: string[];
}

export interface ReleaseNotes {
  version: string;
  /** The release's date as the CHANGELOG writes it (YYYY-MM-DD), when it has one. */
  date: string | null;
  intro: string;
  groups: ReleaseGroup[];
}

/** The CHANGELOG's own order of headings; any other heading goes after these. */
export const GROUP_ORDER = ['Added', 'Changed', 'Removed', 'Fixed', 'Security'];

const SECTION = /^## (\S+)(?:\s+[–-]\s+(\S+))?\s*$/;
const GROUP = /^### (.+)$/;

/** One release's notes from its section's text (without the `## X.Y.Z` heading). */
export function parseReleaseSection(version: string, text: string, date: string | null = null): ReleaseNotes {
  const intro: string[] = [];
  const groups: ReleaseGroup[] = [];
  let group: ReleaseGroup | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const heading = line.match(GROUP);
    if (heading) {
      group = { heading: heading[1]!, items: [] };
      groups.push(group);
    } else if (!group) {
      intro.push(line);
    } else if (line.startsWith('- ') || group.items.length === 0) {
      group.items.push(line.replace(/^- /, ''));
    } else {
      // A wrapped bullet's next line
      group.items[group.items.length - 1] += ` ${line}`;
    }
  }
  return { version, date, intro: intro.join(' '), groups };
}

/** Every release in a CHANGELOG, in its order (newest first); the file's own header is left out. */
export function parseChangelog(text: string): ReleaseNotes[] {
  const sections: { version: string; date: string | null; lines: string[] }[] = [];
  for (const line of text.split('\n')) {
    const heading = line.match(SECTION);
    if (heading) sections.push({ version: heading[1]!, date: heading[2] ?? null, lines: [] });
    else sections.at(-1)?.lines.push(line);
  }
  return sections.map(section => parseReleaseSection(section.version, section.lines.join('\n'), section.date));
}

/** Whether a release has anything to read: a release with no notes says "No user-facing changes." instead. */
export const hasUserFacingChanges = (release: ReleaseNotes): boolean =>
  release.groups.some(group => group.items.length > 0);

/** The releases after `from` up to `to`, in the order given: what an update from one to the other brings. */
export function releasesSince(releases: ReleaseNotes[], from: string, to: string): ReleaseNotes[] {
  return releases.filter(
    release =>
      isVersion(release.version) &&
      compareVersions(release.version, from) > 0 &&
      compareVersions(release.version, to) <= 0
  );
}

/** releasesSince, from a changelog's text (an update feed's), newest first. */
export const releasesBetween = (text: string, current: string, latest: string): ReleaseNotes[] =>
  releasesSince(parseChangelog(text), current, latest);

const groupRank = (heading: string) => {
  const index = GROUP_ORDER.indexOf(heading);
  return index === -1 ? GROUP_ORDER.length : index;
};

/**
 * Several releases' notes as one: every bullet under its heading, the
 * newest release's first. For an update many releases ahead, where what
 * changed matters more than which release changed it.
 */
export function combineReleases(releases: ReleaseNotes[]): ReleaseNotes {
  const byHeading = new Map<string, string[]>();
  for (const release of releases) {
    for (const group of release.groups) {
      byHeading.set(group.heading, [...(byHeading.get(group.heading) ?? []), ...group.items]);
    }
  }
  const groups = [...byHeading.entries()]
    .map(([heading, items]) => ({ heading, items }))
    .sort((a, b) => groupRank(a.heading) - groupRank(b.heading));
  const newest = releases[0];
  return { version: newest?.version ?? '', date: newest?.date ?? null, intro: '', groups };
}

/** The app's own release notes, newest first. */
export const RELEASES: ReleaseNotes[] = parseChangelog(changelogText);
