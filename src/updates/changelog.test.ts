import { describe, expect, test } from 'vitest';
import {
  combineReleases,
  hasUserFacingChanges,
  parseChangelog,
  parseReleaseSection,
  RELEASES,
  releasesBetween,
  releasesSince,
} from './changelog';
import { APP_VERSION, compareVersions, isVersion } from './version';

const CHANGELOG = `# Changelog

What changed in each GloveBox release, newest first.

## 0.3.0 – 2026-12-10

### Fixed

- The ghost trail no longer
  flickers.

### Added

- Tutting boxes
- Contours

## 0.2.0 – 2026-12-01

No user-facing changes.

## 0.1.0

### Added

- The first lessons
`;

describe('versions', () => {
  test('the app knows its own version', () => {
    expect(isVersion(APP_VERSION)).toBe(true);
  });

  test('compare by major, minor, then patch', () => {
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(isVersion('1.2')).toBe(false);
    expect(isVersion(7)).toBe(false);
  });
});

describe('the CHANGELOG', () => {
  test('reads each release, newest first, without the header', () => {
    const releases = parseChangelog(CHANGELOG);
    expect(releases.map(release => [release.version, release.date])).toEqual([
      ['0.3.0', '2026-12-10'],
      ['0.2.0', '2026-12-01'],
      ['0.1.0', null],
    ]);
    expect(releases[0]?.groups).toEqual([
      { heading: 'Fixed', items: ['The ghost trail no longer flickers.'] },
      { heading: 'Added', items: ['Tutting boxes', 'Contours'] },
    ]);
    expect(releases[1]).toEqual({ version: '0.2.0', date: '2026-12-01', intro: 'No user-facing changes.', groups: [] });
  });

  test('a section’s text alone, as an update’s notes', () => {
    expect(parseReleaseSection('0.4.0', '### Changed\nSlower tempo by default\n- And a bullet')).toEqual({
      version: '0.4.0',
      date: null,
      intro: '',
      groups: [{ heading: 'Changed', items: ['Slower tempo by default', 'And a bullet'] }],
    });
  });

  test('only releases with notes count as user-facing', () => {
    const [newest, quiet] = parseChangelog(CHANGELOG);
    expect(hasUserFacingChanges(newest!)).toBe(true);
    expect(hasUserFacingChanges(quiet!)).toBe(false);
  });

  test('what an update brings: after the current version, up to the new one', () => {
    const releases = parseChangelog(`${CHANGELOG}\n## next\n\n- not a version\n`);
    expect(releasesSince(releases, '0.1.0', '0.3.0').map(release => release.version)).toEqual(['0.3.0', '0.2.0']);
    expect(releasesBetween(CHANGELOG, '0.2.0', '0.2.0')).toEqual([]);
  });

  test('several releases combine by type, in the CHANGELOG’s order, newest first', () => {
    const combined = combineReleases([
      parseReleaseSection('0.5.0', '### Fixed\n- Five\n### Thanks\n- Everyone', '2026-12-20'),
      parseReleaseSection('0.4.0', '### Added\n- Four\n### Fixed\n- Four fix'),
    ]);
    expect(combined).toEqual({
      version: '0.5.0',
      date: '2026-12-20',
      intro: '',
      groups: [
        { heading: 'Added', items: ['Four'] },
        { heading: 'Fixed', items: ['Five', 'Four fix'] },
        { heading: 'Thanks', items: ['Everyone'] },
      ],
    });
    expect(combineReleases([])).toEqual({ version: '', date: null, intro: '', groups: [] });
  });

  test('the bundled CHANGELOG parses', () => {
    expect(Array.isArray(RELEASES)).toBe(true);
    for (const release of RELEASES) expect(isVersion(release.version)).toBe(true);
  });
});
