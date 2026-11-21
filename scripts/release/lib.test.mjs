import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  assetName,
  BUMPS,
  buildPlan,
  buildTargets,
  bumpVersion,
  bundlePath,
  cargoTomlName,
  cargoTomlVersion,
  changelogVersions,
  extractSection,
  FEED_RELEASES,
  highestBump,
  insertSection,
  isoDate,
  isTarget,
  isVersion,
  macAppInfoPlist,
  missingAssets,
  PUBKEY_PLACEHOLDER,
  packageJsonVersion,
  parseNote,
  releaseAssets,
  releaseDownloadUrl,
  releaseSections,
  renderSection,
  setCargoLockVersions,
  setCargoTomlVersion,
  setPackageJsonVersion,
  TARGETS,
  TYPES,
  UPDATE_MANIFEST,
  updateAssetNames,
  updateBundlePaths,
  updateManifest,
  verifyUpdateSignature,
} from './lib.mjs';

describe('change notes', () => {
  it('reads the front matter and the bullets', () => {
    const note = parseNote(
      'changes/dark-mode.md',
      '---\nbump: minor # something new\ntype: Added\n\n---\nPractice in the dark:\nGloveBox follows your LEDs.\n'
    );
    assert.deepEqual(note, {
      file: 'changes/dark-mode.md',
      bump: 'minor',
      type: 'Added',
      items: ['Practice in the dark: GloveBox follows your LEDs.'],
    });
  });

  it('reads several bullets, Windows line ends and all', () => {
    const note = parseNote('x.md', '---\r\nbump: patch\r\ntype: Fixed\r\n---\r\n- One\r\n  more\r\n- Two\r\n');
    assert.deepEqual(note.items, ['One more', 'Two']);
  });

  it('names the file and what is wrong', () => {
    const cases = [
      ['bump: patch', /x\.md: it should start with a --- line \(see changes\/README\.md\)/],
      ['---\nbump: patch', /no closing --- line/],
      ['---\nbump patch\n---\ntext', /can't read "bump patch"/],
      ['---\nbump: patch\nlevel: 2\n---\ntext', /unknown field "level"/],
      ['---\ntype: Added\n---\ntext', /no bump/],
      ['---\nbump: huge\ntype: Added\n---\ntext', /bump "huge" isn't one of patch, minor, major/],
      ['---\nbump: patch\n---\ntext', /no type/],
      ['---\nbump: patch\ntype: Tweaked\n---\ntext', /type "Tweaked" isn't one of Added/],
      ['---\nbump: patch\ntype: Fixed\n---\n\n', /no text for the changelog/],
    ];
    for (const [text, problem] of cases) assert.throws(() => parseNote('x.md', text), problem);
  });

  it('the highest bump wins; none without notes', () => {
    assert.equal(highestBump([]), null);
    assert.equal(highestBump([{ bump: 'patch' }, { bump: 'minor' }, { bump: 'patch' }]), 'minor');
    assert.equal(highestBump([{ bump: 'major' }, { bump: 'minor' }]), 'major');
    assert.deepEqual(BUMPS, ['patch', 'minor', 'major']);
  });
});

describe('versions', () => {
  it('bumps each level', () => {
    assert.equal(bumpVersion('0.0.0', 'minor'), '0.1.0');
    assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
    assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
    assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  });

  it('refuses what it can’t bump', () => {
    assert.throws(() => bumpVersion('1.2', 'patch'), /"1\.2" isn't a version like 1\.2\.3/);
    assert.throws(() => bumpVersion('1.2.3', 'mega'), /"mega" isn't one of patch, minor, major/);
    assert.equal(isVersion('1.2.3'), true);
    assert.equal(isVersion('v1.2.3'), false);
  });

  it('dates are local YYYY-MM-DD', () => {
    assert.equal(isoDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  });
});

describe('the CHANGELOG', () => {
  const notes = [
    { file: 'changes/b.md', type: 'Fixed', items: ['Second fix'] },
    { file: 'changes/a.md', type: 'Fixed', items: ['First fix'] },
    { file: 'changes/c.md', type: 'Added', items: ['A move', 'Another'] },
  ];

  it('renders a section by type, and by file within a type', () => {
    assert.equal(
      renderSection('0.2.0', '2026-12-01', notes),
      '## 0.2.0 – 2026-12-01\n\n### Added\n\n- A move\n- Another\n\n### Fixed\n\n- First fix\n- Second fix\n'
    );
    assert.equal(renderSection('0.2.1', '2026-12-02', []), '## 0.2.1 – 2026-12-02\n\nNo user-facing changes.\n');
    assert.deepEqual(TYPES, ['Added', 'Changed', 'Removed', 'Fixed', 'Security']);
  });

  const header = '# Changelog\n\nWhat changed.\n';

  it('inserts the first section after the header, and later ones above the newest', () => {
    const first = insertSection(header, '0.1.0', '## 0.1.0 – 2026-11-30\n\n- First\n');
    assert.equal(first, '# Changelog\n\nWhat changed.\n\n## 0.1.0 – 2026-11-30\n\n- First\n');
    const second = insertSection(first, '0.2.0', '## 0.2.0 – 2026-12-01\n\n- Second\n');
    assert.deepEqual(changelogVersions(second), ['0.2.0', '0.1.0']);
    assert.throws(() => insertSection(second, '0.2.0', '## 0.2.0'), /CHANGELOG\.md already has 0\.2\.0/);
  });

  it('extracts a version’s notes without the heading', () => {
    const changelog = `${header}\n## 0.2.0 – 2026-12-01\n\n- Second\n\n## 0.1.0 – 2026-11-30\n\n- First\n`;
    assert.equal(extractSection(changelog, '0.2.0'), '- Second');
    assert.equal(extractSection(changelog, '0.1.0'), '- First');
    assert.equal(extractSection(changelog, '9.9.9'), null);
  });

  it('the feed carries the newest releases only, without the header', () => {
    const sections = Array.from({ length: 3 }, (_, i) => `## 0.${3 - i}.0 – d\n\n- r${3 - i}`).join('\n\n');
    const changelog = `${header}\n${sections}\n`;
    assert.equal(releaseSections(changelog, 2), '## 0.3.0 – d\n\n- r3\n\n## 0.2.0 – d\n\n- r2');
    assert.equal(releaseSections(changelog), sections);
    assert.equal(releaseSections(header), '');
    assert.equal(FEED_RELEASES, 30);
  });
});

describe('manifests', () => {
  it('package.json: reads and sets only the version', () => {
    const text = '{\n  "name": "glovebox",\n  "version": "0.1.0",\n  "dependencies": { "x": "1.0.0" }\n}\n';
    assert.equal(packageJsonVersion(text, 'package.json'), '0.1.0');
    assert.equal(setPackageJsonVersion(text, '0.2.0', 'package.json'), text.replace('0.1.0', '0.2.0'));
    assert.throws(() => packageJsonVersion('{}', 'package.json'), /package\.json: no "version"/);
  });

  const toml = '[package]\nname = "glovebox"\nversion = "0.1.0"\n\n[dependencies]\nserde = { version = "1" }\n';

  it('Cargo.toml: reads and sets the [package] version, leaving dependencies alone', () => {
    assert.equal(cargoTomlName(toml, 'Cargo.toml'), 'glovebox');
    assert.equal(cargoTomlVersion(toml, 'Cargo.toml'), '0.1.0');
    assert.equal(setCargoTomlVersion(toml, '0.2.0', 'Cargo.toml'), toml.replace('"0.1.0"', '"0.2.0"'));
    // A [package] table that ends the file
    assert.equal(cargoTomlVersion('[package]\nversion = "3.0.0"\n', 'Cargo.toml'), '3.0.0');
  });

  it('Cargo.toml: says what it can’t find', () => {
    assert.throws(() => cargoTomlVersion('[workspace]\n', 'Cargo.toml'), /Cargo\.toml: no \[package\] table/);
    assert.throws(() => cargoTomlName('[package]\nversion = "1.0.0"\n', 'Cargo.toml'), /no name in \[package\]/);
  });

  it('Cargo.lock: sets each named package listed once', () => {
    const lock = '[[package]]\nname = "glovebox"\nversion = "0.1.0"\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n';
    assert.equal(setCargoLockVersions(lock, ['glovebox'], '0.2.0'), lock.replace('0.1.0', '0.2.0'));
    assert.throws(() => setCargoLockVersions(lock, ['missing'], '0.2.0'), /lists missing 0 times, expected once/);
    assert.throws(
      () => setCargoLockVersions(`${lock}\n${lock}`, ['serde'], '2.0.0'),
      /lists serde 2 times, expected once/
    );
  });
});

describe('what a release ships', () => {
  it('a dmg per Mac, and each one’s update and signature', () => {
    assert.deepEqual(TARGETS, ['macos-arm64', 'macos-x64']);
    assert.equal(isTarget('macos-x64'), true);
    assert.equal(isTarget('windows-x64'), false);
    assert.equal(assetName('GloveBox', '0.2.0', 'macos-arm64'), 'GloveBox-0.2.0-macos-arm64.dmg');
    assert.deepEqual(updateAssetNames('GloveBox', '0.2.0', 'macos-x64'), {
      file: 'GloveBox-0.2.0-macos-x64.app.tar.gz',
      signature: 'GloveBox-0.2.0-macos-x64.app.tar.gz.sig',
    });
    assert.deepEqual(releaseAssets('GloveBox', '0.2.0'), [
      'GloveBox-0.2.0-macos-arm64.dmg',
      'GloveBox-0.2.0-macos-x64.dmg',
      'GloveBox-0.2.0-macos-arm64.app.tar.gz',
      'GloveBox-0.2.0-macos-arm64.app.tar.gz.sig',
      'GloveBox-0.2.0-macos-x64.app.tar.gz',
      'GloveBox-0.2.0-macos-x64.app.tar.gz.sig',
    ]);
    assert.deepEqual(missingAssets('GloveBox', '0.2.0', releaseAssets('GloveBox', '0.2.0').slice(1)), [
      'GloveBox-0.2.0-macos-arm64.dmg',
    ]);
    assert.throws(() => assetName('GloveBox', '0.2.0', 'amiga'), /Unknown target "amiga" \(one of macos-arm64, macos-x64\)/);
  });

  it('a Mac builds its own CPU natively and the other cross-compiled', () => {
    const appleSilicon = { platform: 'darwin', arch: 'arm64' };
    assert.deepEqual(buildPlan('macos-arm64', appleSilicon), { kind: 'tauri', triple: null });
    assert.deepEqual(buildPlan('macos-x64', appleSilicon), { kind: 'tauri', triple: 'x86_64-apple-darwin' });
    assert.throws(() => buildPlan('macos-arm64', { platform: 'linux', arch: 'x64' }), /can't be built on Linux \(x64\)/);
    assert.throws(() => buildPlan('macos-arm64', { platform: 'aix', arch: 'ppc64' }), /can't be built on aix \(ppc64\)/);
  });

  it('builds the targets named (once each), or else this computer’s own', () => {
    assert.deepEqual(buildTargets({ targets: ['macos-x64', 'macos-x64'], platform: 'darwin', arch: 'arm64' }), [
      'macos-x64',
    ]);
    assert.deepEqual(buildTargets({ platform: 'darwin', arch: 'x64' }), ['macos-x64']);
    assert.throws(() => buildTargets({ platform: 'win32', arch: 'x64' }), /no installer for Windows \(x64\): name one/);
    assert.throws(() => buildTargets({ targets: ['zx81'], platform: 'darwin', arch: 'x64' }), /Unknown target "zx81"/);
  });

  it('knows where Tauri leaves each file', () => {
    const native = { kind: 'tauri', triple: null };
    const cross = { kind: 'tauri', triple: 'x86_64-apple-darwin' };
    assert.equal(
      bundlePath('GloveBox', '0.2.0', 'macos-arm64', native),
      'src-tauri/target/release/bundle/dmg/GloveBox_0.2.0_aarch64.dmg'
    );
    assert.equal(
      bundlePath('GloveBox', '0.2.0', 'macos-x64', cross),
      'src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/GloveBox_0.2.0_x64.dmg'
    );
    assert.deepEqual(updateBundlePaths('GloveBox', 'macos-x64', cross), {
      file: 'src-tauri/target/x86_64-apple-darwin/release/bundle/macos/GloveBox.app.tar.gz',
      signature: 'src-tauri/target/x86_64-apple-darwin/release/bundle/macos/GloveBox.app.tar.gz.sig',
    });
    assert.equal(
      macAppInfoPlist('GloveBox', 'macos-arm64', native),
      'src-tauri/target/release/bundle/macos/GloveBox.app/Contents/Info.plist'
    );
  });
});

describe('the update feed', () => {
  it('latest.json: each Mac’s update, the notes and every recent release', () => {
    const manifest = updateManifest({
      product: 'GloveBox',
      version: '0.2.0',
      notes: '- Second',
      changelog: '## 0.2.0 – d\n\n- Second',
      pubDate: '2026-12-01T10:00:00Z',
      downloadUrl: releaseDownloadUrl('BeardedUnicorn/GloveBox', '0.2.0'),
      signatures: { 'macos-arm64': ' sig-arm\n', 'macos-x64': 'sig-x64' },
    });
    assert.equal(UPDATE_MANIFEST, 'latest.json');
    assert.deepEqual(manifest, {
      version: '0.2.0',
      notes: '- Second',
      changelog: '## 0.2.0 – d\n\n- Second',
      pub_date: '2026-12-01T10:00:00Z',
      platforms: {
        'darwin-aarch64': {
          signature: 'sig-arm',
          url: 'https://github.com/BeardedUnicorn/GloveBox/releases/download/v0.2.0/GloveBox-0.2.0-macos-arm64.app.tar.gz',
        },
        'darwin-x86_64': {
          signature: 'sig-x64',
          url: 'https://github.com/BeardedUnicorn/GloveBox/releases/download/v0.2.0/GloveBox-0.2.0-macos-x64.app.tar.gz',
        },
      },
    });
  });

  it('refuses a target without a signature', () => {
    const base = { product: 'GloveBox', version: '0.2.0', notes: '', changelog: '', pubDate: '', downloadUrl: '' };
    assert.throws(() => updateManifest({ ...base, signatures: { 'macos-arm64': 'sig' } }), /no update signature for macos-x64/);
    assert.throws(
      () => updateManifest({ ...base, signatures: { 'macos-arm64': '  ', 'macos-x64': 'sig' } }),
      /no update signature for macos-arm64/
    );
  });
});

describe('update signatures', () => {
  // A real pair from `tauri signer sign` (TaskMint's test key; it signs "hello")
  const tauriKey =
    'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDk1QjVGMDdCMzk5NzcxNjgKUldSb2NaYzVlL0MxbFdZV1dGK01PVFhlMDhtVm55dDlRTUtjVDh0NzltMjZ3ZDdZY25DNHVIZ3gK';
  const tauriSignature =
    'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSb2NaYzVlL0MxbFZYckVSTldqZ2FrbkFGbmxKTTBpWmxaeFdKU21oZEU0UjR1Sm9jTGxQWkI4a0ZyYnNjUHhEc3h1ZXY5WDFrRmI4blByM1RFMUpZYmZCMHBRWnd2Q3djPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk0MTA4ODQ2CWZpbGU6aGVsbG8udHh0Ci9PTGprVUh6ejZBOU1NU0c3TDFaMGVvL2VQYmRDc21VTDlEaGZlaXMwMDhWSVQxWTRRcTVSeUdwNFFXK0FpMmtKTU5CRVNhNXFGdUJOUzZvQ3laWUNnPT0K';

  /** A minisign key of our own, so the test can make any signature. */
  function keyPair(id = Buffer.from('0123456789abcdef', 'hex')) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
    const file = `untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), id, raw]).toString('base64')}\n`;
    const signFile = (data, { algorithm = 'ED', comment = 'timestamp:1\tfile:x', tamper = false } = {}) => {
      const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
      const signature = sign(null, message, privateKey);
      const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
      const lines = [
        'untrusted comment: signature',
        Buffer.concat([Buffer.from(algorithm), id, signature]).toString('base64'),
        `trusted comment: ${tamper ? `${comment}x` : comment}`,
        global.toString('base64'),
      ];
      return Buffer.from(`${lines.join('\n')}\n`).toString('base64');
    };
    return { publicKey: Buffer.from(file).toString('base64'), signFile };
  }

  const data = Buffer.from('the update');

  it("accepts Tauri's own signature, and only for its file", () => {
    verifyUpdateSignature({ publicKey: tauriKey, signature: tauriSignature, data: Buffer.from('hello') });
    assert.throws(
      () => verifyUpdateSignature({ publicKey: tauriKey, signature: tauriSignature, data: Buffer.from('hellO') }),
      /The update's signature doesn't match the file/
    );
  });

  it('accepts a signature of the file or of its hash, by the trusted key', () => {
    const { publicKey, signFile } = keyPair();
    verifyUpdateSignature({ publicKey, signature: signFile(data), data });
    verifyUpdateSignature({ publicKey, signature: signFile(data, { algorithm: 'Ed' }), data });
  });

  it('names the key an update was signed with when the app trusts another', () => {
    const { signFile } = keyPair(Buffer.from('1111111111111111', 'hex'));
    assert.throws(
      () => verifyUpdateSignature({ publicKey: tauriKey, signature: signFile(data), data }),
      /The update is signed with key 1111111111111111, but the app trusts key 95B5F07B39977168/
    );
  });

  it('refuses a changed trusted comment', () => {
    const { publicKey, signFile } = keyPair();
    assert.throws(
      () => verifyUpdateSignature({ publicKey, signature: signFile(data, { tamper: true }), data }),
      /trusted comment doesn't match/
    );
  });

  it('says when the app still has the placeholder key', () => {
    const { signFile } = keyPair();
    assert.throws(
      () => verifyUpdateSignature({ publicKey: PUBKEY_PLACEHOLDER, signature: signFile(data), data }),
      /still the placeholder: make the updater key/
    );
  });

  it("refuses a key or signature that isn't minisign's", () => {
    const { publicKey, signFile } = keyPair();
    for (const key of ['', Buffer.from('a\nb').toString('base64')]) {
      assert.throws(
        () => verifyUpdateSignature({ publicKey: key, signature: signFile(data), data }),
        /isn't a minisign public key/
      );
    }
    for (const signature of ['', Buffer.from('a\nRVg=\n').toString('base64'), signFile(data, { algorithm: 'XX' })]) {
      assert.throws(() => verifyUpdateSignature({ publicKey, signature, data }), /isn't a minisign signature/);
    }
  });
});
