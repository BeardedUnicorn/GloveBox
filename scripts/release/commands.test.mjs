import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createShell, FILES, main, parseArgs, USAGE } from './commands.mjs';

/** A minisign key of our own, to sign the fake builds' updates. */
function keyPair() {
  const id = Buffer.from('0123456789abcdef', 'hex');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const file = `untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), id, raw]).toString('base64')}\n`;
  const signFile = data => {
    const signature = sign(null, createHash('blake2b512').update(data).digest(), privateKey);
    const comment = 'timestamp:1\tfile:GloveBox.app.tar.gz';
    const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
    const lines = [
      'untrusted comment: signature',
      Buffer.concat([Buffer.from('ED'), id, signature]).toString('base64'),
      `trusted comment: ${comment}`,
      global.toString('base64'),
    ];
    return Buffer.from(`${lines.join('\n')}\n`).toString('base64');
  };
  return { publicKey: Buffer.from(file).toString('base64'), signFile };
}
const keys = keyPair();

const HEADER = '# Changelog\n\nWhat changed in each GloveBox release, newest first.\n';
const NOTE = '---\nbump: minor\ntype: Added\n---\nDark mode: practice with your gloves on.\n';
const FIX = '---\nbump: patch\ntype: Fixed\n---\nThe ghost trail no longer flickers.\n';

let root;
let scratchTmp;
let log;
let calls;
/** How the fake shell answers each command: (command, args) → a partial spawnSync result. */
let answer;
let env;
let host;

function write(file, text) {
  const full = join(root, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}
const read = file => readFileSync(join(root, file), 'utf8');

/** A scratch GloveBox at `version`, with `notes` in changes/. */
function repository({ version = '0.1.0', crateVersion = version, notes = {}, changelog = HEADER } = {}) {
  write(FILES.packageJson, `{\n  "name": "glovebox",\n  "version": "${version}"\n}\n`);
  write(FILES.cargoToml, `[package]\nname = "glovebox"\nversion = "${crateVersion}"\n\n[dependencies]\nserde = "1"\n`);
  write(FILES.cargoLock, `[[package]]\nname = "glovebox"\nversion = "${crateVersion}"\n`);
  write(FILES.changelog, changelog);
  write(`${FILES.changes}/README.md`, '# Change notes\n');
  for (const [name, text] of Object.entries(notes)) write(`${FILES.changes}/${name}`, text);
  write(
    FILES.tauriConf,
    JSON.stringify({
      productName: 'GloveBox',
      identifier: 'io.glovebox.trainer',
      plugins: { updater: { pubkey: keys.publicKey } },
    })
  );
}

/** Git on main, clean, with HEAD at `head` and the tags in `tags`. */
function git({ branch = 'main', status = '', tags = [], heads = ['abc'] } = {}) {
  let head = 0;
  return (command, args) => {
    if (command !== 'git') return undefined;
    const [sub, ...rest] = args;
    if (sub === 'branch') return { stdout: `${branch}\n` };
    if (sub === 'status') return { stdout: status };
    if (sub === 'rev-parse' && rest[0] === 'HEAD') return { stdout: `${heads[Math.min(head++, heads.length - 1)]}\n` };
    if (sub === 'rev-parse') return { status: tags.includes(rest.at(-1).replace('refs/tags/', '')) ? 0 : 1 };
    return {};
  };
}

const run = (args, overrides = {}) => {
  const spawn = (command, args, options) => {
    calls.push([command, ...args].join(' '));
    const result = answer(command, args, options) ?? {};
    return { status: 0, stdout: '', stderr: null, ...result };
  };
  return main(args, {
    root,
    sh: createShell(spawn, root),
    env,
    host,
    now: () => new Date(2026, 11, 1, 10, 30, 0, 123),
    tmpdir: scratchTmp,
    out: text => log.push(['out', text]),
    err: text => log.push(['err', text]),
    ...overrides,
  });
};
const said = () => log.map(([, text]) => text).join('\n');
const errors = () => log.filter(([kind]) => kind === 'err').map(([, text]) => text);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'glovebox-release-'));
  scratchTmp = mkdtempSync(join(tmpdir(), 'glovebox-release-tmp-'));
  log = [];
  calls = [];
  env = {};
  host = { platform: 'darwin', arch: 'arm64' };
  answer = git();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(scratchTmp, { recursive: true, force: true });
});

describe('the shell', () => {
  const spawned = [];
  const fake = result => (command, args, options) => {
    spawned.push({ command, args, options });
    return result;
  };

  it('runs a command in the repository or a folder given, showing its output', () => {
    const sh = createShell(fake({ status: 0 }), '/repo');
    sh.run('git', ['status']);
    sh.run('zip', ['-q'], { cwd: '/elsewhere' });
    assert.deepEqual(
      spawned.slice(-2).map(call => call.options),
      [
        { cwd: '/repo', stdio: 'inherit' },
        { cwd: '/elsewhere', stdio: 'inherit' },
      ]
    );
  });

  it('returns what a command printed, trimmed', () => {
    assert.equal(createShell(fake({ status: 0, stdout: ' main\n' }), '/repo').output('git', ['branch']), 'main');
  });

  it("stops when a command fails or can't start, saying what it printed", () => {
    assert.throws(() => createShell(fake({ status: 2, stderr: 'no such ref\n' }), '/r').output('git', ['x']), {
      message: 'git x failed (exit 2):\nno such ref',
    });
    assert.throws(() => createShell(fake({ status: 1, stderr: null }), '/r').run('pnpm', ['tauri']), {
      message: 'pnpm tauri failed (exit 1)',
    });
    assert.throws(() => createShell(fake({ error: new Error('ENOENT') }), '/r').run('gh', []), {
      message: 'gh: ENOENT',
    });
  });

  it('says whether a command succeeds', () => {
    assert.equal(createShell(fake({ status: 0 }), '/r').succeeds('gh', ['release', 'view']), true);
    assert.equal(createShell(fake({ status: 1 }), '/r').succeeds('gh', ['release', 'view']), false);
  });
});

describe('the command line', () => {
  it('reads each command and option', () => {
    assert.deepEqual(parseArgs([]), {
      command: 'release',
      dryRun: false,
      publish: false,
      rebuild: false,
      level: null,
      targets: [],
    });
    assert.equal(parseArgs(['publish']).command, 'publish');
    assert.equal(parseArgs(['github-release']).command, 'github-release');
    assert.equal(parseArgs(['-h']).command, 'help');
    assert.deepEqual(parseArgs(['--rebuild', '--target', 'macos-x64', '--target', 'macos-arm64']), {
      command: 'rebuild',
      dryRun: false,
      publish: false,
      rebuild: true,
      level: null,
      targets: ['macos-x64', 'macos-arm64'],
    });
    const options = parseArgs(['--dry-run', '--minor', '--minor', '--publish']);
    assert.deepEqual([options.dryRun, options.level, options.publish], [true, 'minor', true]);
  });

  it('refuses what it doesn’t take', () => {
    repository();
    for (const [args, problem] of [
      [['--fast'], /Unknown option "--fast"/],
      [['minor'], /Unknown option "minor"/],
      [['--rebuild', '--target'], /--target needs a name/],
      [['--target', 'macos-x64'], /--target goes with --rebuild/],
      [['--patch', '--major'], /Pick one of --patch, --minor and --major \(not --patch and --major\)/],
    ]) {
      log = [];
      assert.equal(run(args), 1);
      assert.match(errors()[0], problem);
    }
  });

  it('--help shows the usage', () => {
    assert.equal(run(['--help']), 0);
    assert.equal(said(), USAGE);
  });
});

describe('pnpm release', () => {
  it('--dry-run shows the next version and its section, and changes nothing', () => {
    repository({ notes: { 'dark.md': NOTE, 'trail.md': FIX } });
    assert.equal(run(['--dry-run']), 0);
    assert.equal(
      said(),
      '0.1.0 → 0.2.0 (minor, from the notes)\nNotes: changes/dark.md, changes/trail.md\n\n' +
        '## 0.2.0 – 2026-12-01\n\n### Added\n\n- Dark mode: practice with your gloves on.\n\n' +
        '### Fixed\n\n- The ghost trail no longer flickers.\n'
    );
    assert.equal(read(FILES.packageJson).includes('"0.1.0"'), true);
    assert.deepEqual(calls, []);
  });

  it('a level given overrides the notes; the first release is --minor from 0.0.0', () => {
    repository({ version: '0.0.0' });
    rmSync(join(root, FILES.changes), { recursive: true });
    assert.equal(run(['--dry-run', '--minor']), 0);
    assert.equal(log[0][1], '0.0.0 → 0.1.0 (--minor)');
    assert.match(said(), /No user-facing changes\./);
    assert.doesNotMatch(said(), /Notes:/);
  });

  it('needs notes or a level', () => {
    repository();
    assert.equal(run([]), 1);
    assert.match(
      errors()[0],
      /No change notes in changes\/ .*\nTo release without any, pass --patch, --minor or --major\./
    );
  });

  it('says which note it can’t read', () => {
    repository({ notes: { 'bad.md': '---\nbump: minor\n---\ntext\n' } });
    assert.equal(run(['--dry-run']), 1);
    assert.deepEqual(errors(), ['changes/bad.md: no type (see changes/README.md)']);
  });

  it('the manifests must agree on a version it can bump', () => {
    repository({ version: '0.1.0', crateVersion: '0.2.0' });
    assert.equal(run(['--patch']), 1);
    assert.match(
      errors()[0],
      /disagree on the version:\n {2}0\.1\.0 {2}package\.json\n {2}0\.2\.0 {2}src-tauri\/Cargo\.toml/
    );

    log = [];
    repository({ version: '1.0' });
    assert.equal(run(['--patch']), 1);
    assert.deepEqual(errors(), ['"1.0" isn\'t a version like 1.2.3']);

    log = [];
    write(FILES.packageJson, '{}');
    assert.equal(run(['--patch']), 1);
    assert.deepEqual(errors(), ['package.json: no "version"']);
  });

  it('is cut on a clean main, for a version not yet tagged', () => {
    repository({ notes: { 'dark.md': NOTE } });
    for (const [state, problem] of [
      [{ branch: 'dark-mode' }, 'Releases are cut on main (this is dark-mode).'],
      [{ branch: '' }, 'Releases are cut on main (this is a detached HEAD).'],
      [{ status: '?? notes.txt\n' }, 'Commit or set aside these changes first:\n?? notes.txt'],
      [{ tags: ['v0.2.0'] }, 'The tag v0.2.0 already exists.'],
    ]) {
      log = [];
      answer = git(state);
      assert.equal(run([]), 1);
      assert.deepEqual(errors(), [problem]);
    }
  });

  it('writes the version and CHANGELOG, deletes the notes, commits and tags', () => {
    repository({ notes: { 'dark.md': NOTE } });
    assert.equal(run([]), 0);

    assert.match(read(FILES.packageJson), /"version": "0\.2\.0"/);
    assert.match(read(FILES.cargoToml), /^version = "0\.2\.0"$/m);
    assert.match(read(FILES.cargoLock), /version = "0\.2\.0"/);
    assert.equal(
      read(FILES.changelog),
      `${HEADER}\n## 0.2.0 – 2026-12-01\n\n### Added\n\n- Dark mode: practice with your gloves on.\n`
    );
    assert.deepEqual(readdirSync(join(root, FILES.changes)), ['README.md']);
    assert.deepEqual(calls.slice(-3), [
      'git add --all -- package.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md changes/dark.md',
      'git commit --quiet -m Release 0.2.0 -m ### Added\n\n- Dark mode: practice with your gloves on.',
      'git tag --annotate v0.2.0 -m GloveBox 0.2.0',
    ]);
    assert.match(said(), /Releasing 0\.2\.0 \(0\.1\.0 → 0\.2\.0, minor\)/);
    assert.match(said(), /Committed "Release 0\.2\.0" and tagged v0\.2\.0 \(not pushed\)\./);
  });

  it('--publish then pushes main and the tag', () => {
    repository({ notes: { 'dark.md': NOTE } });
    const tags = [];
    const base = git({ tags });
    answer = (command, args) => {
      if (command === 'git' && args[0] === 'tag') tags.push(args[2]);
      return base(command, args);
    };
    assert.equal(run(['--publish']), 0);
    assert.equal(calls.at(-1), 'git push origin main v0.2.0');
    assert.match(said(), /Pushed main and v0\.2\.0/);
  });

  it('puts everything back when it stops before the commit', () => {
    repository({ notes: { 'dark.md': NOTE }, changelog: `${HEADER}\n## 0.2.0 – 2026-11-30\n\n- Already\n` });
    assert.equal(run([]), 1);
    assert.deepEqual(errors(), [
      'Putting the version, CHANGELOG and notes back as they were.',
      'CHANGELOG.md already has 0.2.0',
    ]);
    assert.equal(
      calls.at(-1),
      'git restore --source=HEAD --staged --worktree -- package.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md changes/dark.md'
    );
  });

  it('leaves a commit that worked when only the tag failed', () => {
    repository({ notes: { 'dark.md': NOTE } });
    const base = git({ heads: ['before', 'after'] });
    answer = (command, args) =>
      command === 'git' && args[0] === 'tag' ? { status: 128, stderr: 'locked' } : base(command, args);
    assert.equal(run([]), 1);
    assert.deepEqual(errors(), ['git tag --annotate v0.2.0 -m GloveBox 0.2.0 failed (exit 128):\nlocked']);
    assert.equal(
      calls.some(call => call.startsWith('git restore')),
      false
    );
  });
});

describe('pnpm release publish', () => {
  const released = `${HEADER}\n## 0.2.0 – 2026-12-01\n\n- Dark mode\n`;

  it('needs the tag, main and a CHANGELOG section', () => {
    repository({ version: '0.2.0', changelog: released });
    for (const [state, changelog, problem] of [
      [{}, released, "There's no tag v0.2.0: release 0.2.0 first."],
      [{ tags: ['v0.2.0'], branch: 'x' }, released, 'Publish from main.'],
      [{ tags: ['v0.2.0'] }, HEADER, 'CHANGELOG.md has no 0.2.0 section.'],
    ]) {
      log = [];
      answer = git(state);
      write(FILES.changelog, changelog);
      assert.equal(run(['publish']), 1);
      assert.deepEqual(errors(), [problem]);
    }
  });

  it('pushes main and the tag', () => {
    repository({ version: '0.2.0', changelog: released });
    answer = git({ tags: ['v0.2.0'] });
    assert.equal(run(['publish']), 0);
    assert.equal(calls.at(-1), 'git push origin main v0.2.0');
  });
});

describe('pnpm release --rebuild', () => {
  /** Tauri, pretending: leaves the bundles where the real build does, for the plan's target dir. */
  function tauriBuilds({ identifier = 'io.glovebox.trainer', installer = true, update = true, tamper = false } = {}) {
    const base = git();
    return (command, args) => {
      if (command === 'pnpm') {
        const triple = args.includes('--target') ? args[args.indexOf('--target') + 1] : null;
        const dir = triple ? `src-tauri/target/${triple}/release/bundle` : 'src-tauri/target/release/bundle';
        const file = triple ? 'x64' : 'aarch64';
        if (installer) write(`${dir}/dmg/GloveBox_0.2.0_${file}.dmg`, 'dmg');
        if (update) {
          write(`${dir}/macos/GloveBox.app.tar.gz`, 'the update');
          write(`${dir}/macos/GloveBox.app.tar.gz.sig`, keys.signFile(Buffer.from(tamper ? 'other' : 'the update')));
        }
        return {};
      }
      if (command === 'plutil') return { stdout: `${identifier}\n` };
      return base(command, args);
    };
  }

  beforeEach(() => repository({ version: '0.2.0' }));

  it("builds this Mac's installer, without updates when there's no key", () => {
    answer = tauriBuilds();
    assert.equal(run(['--rebuild']), 0);
    assert.ok(calls.includes('pnpm tauri build --config src-tauri/tauri.production.conf.json'));
    assert.deepEqual(readdirSync(join(root, FILES.releases)), ['GloveBox-0.2.0-macos-arm64.dmg']);
    assert.match(said(), /TAURI_SIGNING_PRIVATE_KEY isn't set, so the builds make no updates\./);
    assert.match(said(), /In releases\/:\n {2}GloveBox-0\.2\.0-macos-arm64\.dmg/);
  });

  it('with the key: the other Mac cross-compiled, its update checked against the app’s key, a Developer ID if given', () => {
    env = { TAURI_SIGNING_PRIVATE_KEY: 'key', APPLE_SIGNING_IDENTITY: 'Developer ID Application: Me (TEAM)' };
    answer = tauriBuilds();
    assert.equal(run(['--rebuild', '--target', 'macos-x64']), 0);
    assert.ok(calls.includes('rustup target add x86_64-apple-darwin'));
    assert.ok(
      calls.includes(
        'pnpm tauri build --target x86_64-apple-darwin --config src-tauri/tauri.production.conf.json ' +
          '--config src-tauri/tauri.updater.conf.json ' +
          '--config {"bundle":{"macOS":{"signingIdentity":"Developer ID Application: Me (TEAM)"}}}'
      )
    );
    assert.deepEqual(readdirSync(join(root, FILES.releases)).sort(), [
      'GloveBox-0.2.0-macos-x64.app.tar.gz',
      'GloveBox-0.2.0-macos-x64.app.tar.gz.sig',
      'GloveBox-0.2.0-macos-x64.dmg',
    ]);
  });

  it('notes uncommitted changes', () => {
    answer = (command, args) => (command === 'git' ? { stdout: ' M x' } : tauriBuilds()(command, args));
    assert.equal(run(['--rebuild']), 0);
    assert.match(said(), /The working tree has changes: the installers include them\./);
  });

  it('stops for a target it can’t build here, or one it doesn’t know', () => {
    host = { platform: 'linux', arch: 'x64' };
    assert.equal(run(['--rebuild', '--target', 'macos-arm64']), 1);
    assert.deepEqual(errors(), ["macos-arm64 can't be built on Linux (x64)"]);
  });

  it('stops when the build isn’t GloveBox, or left something out', () => {
    env = { TAURI_SIGNING_PRIVATE_KEY: 'key' };
    for (const [builds, problem] of [
      [{ identifier: 'io.other.app' }, 'The app is io.other.app, but GloveBox is io.glovebox.trainer.'],
      [
        { installer: false },
        "The build finished, but src-tauri/target/release/bundle/dmg/GloveBox_0.2.0_aarch64.dmg isn't there.",
      ],
      [
        { update: false },
        "The build finished, but src-tauri/target/release/bundle/macos/GloveBox.app.tar.gz isn't there.",
      ],
      [{ tamper: true }, "The update's signature doesn't match the file"],
    ]) {
      log = [];
      rmSync(join(root, 'src-tauri/target'), { recursive: true, force: true });
      answer = tauriBuilds(builds);
      assert.equal(run(['--rebuild']), 1);
      assert.deepEqual(errors(), [problem]);
    }
  });
});

describe('pnpm release github-release', () => {
  const released = `${HEADER}\n## 0.2.0 – 2026-12-01\n\n- Dark mode\n\n## 0.1.0 – 2026-11-30\n\n- First\n`;
  const assets = [
    'GloveBox-0.2.0-macos-arm64.dmg',
    'GloveBox-0.2.0-macos-x64.dmg',
    'GloveBox-0.2.0-macos-arm64.app.tar.gz',
    'GloveBox-0.2.0-macos-x64.app.tar.gz',
  ];

  function built({ signatures = true } = {}) {
    for (const file of assets) write(`${FILES.releases}/${file}`, file);
    if (signatures) {
      write(`${FILES.releases}/GloveBox-0.2.0-macos-arm64.app.tar.gz.sig`, 'sig-arm\n');
      write(`${FILES.releases}/GloveBox-0.2.0-macos-x64.app.tar.gz.sig`, 'sig-x64\n');
    }
  }

  beforeEach(() => {
    repository({ version: '0.2.0', changelog: released });
    env = { GH_REPO: 'BeardedUnicorn/GloveBox', GITHUB_REF_NAME: 'v0.2.0' };
  });

  it('makes the release with the version’s notes, every file and latest.json', () => {
    built();
    let notesSeen = null;
    const base = git({ tags: ['v0.2.0'] });
    answer = (command, args) => {
      if (command === 'gh' && args[1] === 'view') return { status: 1 };
      if (command === 'gh' && args[1] === 'create')
        notesSeen = readFileSync(args[args.indexOf('--notes-file') + 1], 'utf8');
      return base(command, args);
    };
    assert.equal(run(['github-release']), 0);

    const dir = join(root, FILES.releases);
    const create = calls.find(call => call.startsWith('gh release create'));
    assert.match(
      create,
      /^gh release create v0\.2\.0 --verify-tag --title GloveBox 0\.2\.0 --notes-file \S+glovebox-0\.2\.0-notes\.md /
    );
    assert.ok(create.endsWith(`${join(dir, 'GloveBox-0.2.0-macos-x64.app.tar.gz.sig')} ${join(dir, 'latest.json')}`));
    assert.equal(notesSeen, '- Dark mode\n');
    assert.deepEqual(readdirSync(scratchTmp), [], 'the notes file is cleaned up');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8')), {
      version: '0.2.0',
      notes: '- Dark mode',
      changelog: '## 0.2.0 – 2026-12-01\n\n- Dark mode\n\n## 0.1.0 – 2026-11-30\n\n- First',
      pub_date: new Date(2026, 11, 1, 10, 30, 0, 123).toISOString().replace(/\.\d{3}Z$/, 'Z'),
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
    assert.match(said(), /Made the v0\.2\.0 release\./);
  });

  it('replaces the files of a release that exists (a re-run)', () => {
    built();
    delete env.GITHUB_REF_NAME;
    answer = git({ tags: ['v0.2.0'] });
    assert.equal(run(['github-release']), 0);
    assert.match(calls.at(-1), /^gh release upload v0\.2\.0 --clobber /);
    assert.match(said(), /Replaced the files of the v0\.2\.0 release\./);
  });

  it('cleans up the notes file when making the release fails', () => {
    built();
    const base = git({ tags: ['v0.2.0'] });
    answer = (command, args) => {
      if (command === 'gh') return { status: 1, stderr: args[1] === 'create' ? 'HTTP 422' : '' };
      return base(command, args);
    };
    assert.equal(run(['github-release']), 1);
    assert.match(errors()[0], /failed \(exit 1\):\nHTTP 422$/);
    assert.deepEqual(readdirSync(scratchTmp), []);
  });

  it('stops before making a release that would be wrong', () => {
    const cases = [
      [() => (env.GITHUB_REF_NAME = 'v0.3.0'), 'This run is for v0.3.0, but the manifests say 0.2.0.'],
      [() => (answer = git()), "There's no tag v0.2.0."],
      [() => write(FILES.changelog, HEADER), 'CHANGELOG.md has no 0.2.0 section.'],
      [
        () => {},
        `releases/ is missing ${[...assets.slice(0, 3), 'GloveBox-0.2.0-macos-arm64.app.tar.gz.sig', assets[3], 'GloveBox-0.2.0-macos-x64.app.tar.gz.sig'].join(', ')}.`,
      ],
      [
        () => {
          built();
          rmSync(join(root, FILES.releases, assets[0]));
        },
        `releases/ is missing ${assets[0]}.`,
      ],
      [
        () => {
          built();
          delete env.GH_REPO;
        },
        'GH_REPO (owner/name) says where the release is; the Release workflow sets it.',
      ],
      [
        () => {
          built();
          write(`${FILES.releases}/GloveBox-0.2.0-macos-x64.app.tar.gz.sig`, '\n');
        },
        "There's no update signature for macos-x64",
      ],
    ];
    for (const [setup, problem] of cases) {
      log = [];
      rmSync(join(root, FILES.releases), { recursive: true, force: true });
      repository({ version: '0.2.0', changelog: released });
      env = { GH_REPO: 'BeardedUnicorn/GloveBox', GITHUB_REF_NAME: 'v0.2.0' };
      answer = git({ tags: ['v0.2.0'] });
      setup();
      assert.equal(run(['github-release']), 1, problem);
      assert.deepEqual(errors(), [problem]);
    }
  });

  it('lets an unexpected failure through, rather than calling it a reason', () => {
    built();
    answer = git({ tags: ['v0.2.0'] });
    rmSync(join(root, FILES.tauriConf));
    assert.throws(() => run(['github-release']), { code: 'ENOENT' });
    assert.equal(existsSync(join(root, FILES.releases, 'latest.json')), false);
  });
});
