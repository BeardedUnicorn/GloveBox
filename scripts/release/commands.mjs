/**
 * `pnpm release`: cuts a GloveBox release from the change notes in changes/
 * (changes/README.md). It bumps the version by the highest note, writes the
 * CHANGELOG section, deletes the notes, then commits "Release X.Y.Z" and
 * tags vX.Y.Z. It builds nothing, and pushes nothing unless --publish. The
 * pushed tag starts the Release workflow (.github/workflows/release.yml),
 * which builds each Mac's installer with --rebuild and makes the GitHub
 * release with github-release.
 *
 * With the updater's signing key in TAURI_SIGNING_PRIVATE_KEY (the Release
 * workflow has it), each build also makes the app's signed update, and
 * github-release adds latest.json, which installed apps read to update
 * themselves (the README's "Desktop updates").
 *
 * Everything that touches the world comes in `deps` (the shell, the
 * environment, the clock, the computer), so the tests run it for real on a
 * scratch repository. lib.mjs has the pure parts.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  assetName,
  BUMPS,
  buildPlan,
  buildTargets,
  bumpVersion,
  bundlePath,
  cargoTomlName,
  cargoTomlVersion,
  extractSection,
  highestBump,
  insertSection,
  isoDate,
  macAppInfoPlist,
  missingAssets,
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
  UPDATE_MANIFEST,
  updateAssetNames,
  updateBundlePaths,
  updateManifest,
  verifyUpdateSignature,
} from './lib.mjs';

/** The files a release reads and writes, relative to the repository root. */
export const FILES = {
  packageJson: 'package.json',
  cargoToml: 'src-tauri/Cargo.toml',
  cargoLock: 'src-tauri/Cargo.lock',
  changelog: 'CHANGELOG.md',
  changes: 'changes',
  releases: 'releases',
  tauriConf: 'src-tauri/tauri.conf.json',
  /** Merged into tauri.conf.json for a release: the update feed. */
  productionConf: 'src-tauri/tauri.production.conf.json',
  /** Merged in too when the key is there to sign the updates. */
  updaterConf: 'src-tauri/tauri.updater.conf.json',
};

export const USAGE = `Usage: pnpm release [--dry-run] [--patch | --minor | --major] [--publish]
       pnpm release --rebuild [--target <name>]...
       pnpm release publish
       pnpm release github-release

Bumps the version by the highest change note in changes/, writes the
CHANGELOG section, then commits "Release X.Y.Z" and tags vX.Y.Z. It builds
nothing: the Release workflow builds the installers from the pushed tag.
Run it on main with nothing uncommitted.

Options:
  --dry-run              Print the next version and its section; change nothing
  --patch, --minor, --major
                         Bump this level instead of the notes' highest (the
                         first release is --minor: 0.0.0 to 0.1.0)
  --publish              Then push main and the tag
  --rebuild              Only build the current version's installers into
                         releases/ (no bump, no commit)
  --target <name>        (With --rebuild) Build this instead of this Mac's own
                         installer; repeat it for more: ${TARGETS.join(', ')}
  -h, --help             Show this

publish                  Push main and the current version's tag. The tag starts
                         the Release workflow, which builds every installer and
                         makes the GitHub release.
github-release           (The Release workflow's last step) Make the current
                         version's GitHub release with its CHANGELOG section,
                         every installer and update in releases/ and the
                         latest.json made from them, or replace its files.`;

/** A reason to stop, said to the person running the release. */
class Stop extends Error {}
const stop = message => {
  throw new Stop(message);
};

/** Runs `fn`, turning what it throws into a Stop with the same words. */
function checked(fn) {
  try {
    return fn();
  } catch (error) {
    stop(error.message);
  }
}

const tagOf = version => `v${version}`;

/**
 * The shell, on Node's spawnSync: `run` shows the command's output and
 * stops if it fails, `output` returns what it printed, and `succeeds` says
 * whether it worked.
 */
export function createShell(spawnSync, root) {
  const describe = (command, args) => [command, ...args].join(' ');
  const finish = (result, command, args) => {
    if (result.error) stop(`${describe(command, args)}: ${result.error.message}`);
    if (result.status !== 0) {
      const said = (result.stderr ?? '').trim();
      stop(`${describe(command, args)} failed (exit ${result.status})${said ? `:\n${said}` : ''}`);
    }
    return result;
  };
  return {
    run(command, args, { cwd = root } = {}) {
      finish(spawnSync(command, args, { cwd, stdio: 'inherit' }), command, args);
    },
    output(command, args) {
      return finish(spawnSync(command, args, { cwd: root, encoding: 'utf8' }), command, args).stdout.trim();
    },
    succeeds(command, args) {
      return spawnSync(command, args, { cwd: root, stdio: 'ignore' }).status === 0;
    },
  };
}

/** The options the command line asks for. */
export function parseArgs(args) {
  const options = { command: 'release', dryRun: false, publish: false, rebuild: false, level: null, targets: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'publish' || arg === 'github-release') options.command = arg;
    else if (arg === '-h' || arg === '--help') options.command = 'help';
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--publish') options.publish = true;
    else if (arg === '--rebuild') options.rebuild = true;
    else if (arg === '--target') {
      const target = args[++i];
      if (target === undefined) stop('--target needs a name.');
      options.targets.push(target);
    } else if (arg.startsWith('--') && BUMPS.includes(arg.slice(2))) {
      const level = arg.slice(2);
      if (options.level && options.level !== level)
        stop(`Pick one of --patch, --minor and --major (not --${options.level} and ${arg}).`);
      options.level = level;
    } else stop(`Unknown option "${arg}". pnpm release --help says what it takes.`);
  }
  if (options.targets.length > 0 && !options.rebuild) stop('--target goes with --rebuild.');
  if (options.rebuild && options.command === 'release') options.command = 'rebuild';
  return options;
}

/**
 * Runs `pnpm release <args>`; returns the exit code.
 *
 * deps: `root` (the repository), `sh` (createShell's), `env`, `host`
 * ({ platform, arch }), `now()` (a Date), `tmpdir` (for the notes file),
 * `out` and `err` (lines for the person running it).
 */
export function main(args, deps) {
  const { root, sh, env, host, now, tmpdir, out } = deps;
  const path = file => join(root, file);
  const read = file => readFileSync(path(file), 'utf8');
  const write = (file, text) => writeFileSync(path(file), text);
  const git = (...gitArgs) => sh.output('git', gitArgs);
  const tagExists = tag => sh.succeeds('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`]);
  const tauriConf = () => JSON.parse(read(FILES.tauriConf));
  const productName = () => tauriConf().productName;

  /** The version every manifest says; stops if they disagree. */
  function currentVersion() {
    const pkg = checked(() => packageJsonVersion(read(FILES.packageJson), FILES.packageJson));
    const crate = checked(() => cargoTomlVersion(read(FILES.cargoToml), FILES.cargoToml));
    if (pkg !== crate) {
      stop(`The manifests disagree on the version:\n  ${pkg}  ${FILES.packageJson}\n  ${crate}  ${FILES.cargoToml}`);
    }
    return pkg;
  }

  function changeNotes() {
    if (!existsSync(path(FILES.changes))) return [];
    return readdirSync(path(FILES.changes))
      .filter(name => name.endsWith('.md') && name !== 'README.md')
      .sort()
      .map(name => {
        const file = `${FILES.changes}/${name}`;
        return checked(() => parseNote(file, read(file)));
      });
  }

  function requireMainAndClean() {
    const branch = git('branch', '--show-current');
    if (branch !== 'main') stop(`Releases are cut on main (this is ${branch || 'a detached HEAD'}).`);
    const status = git('status', '--porcelain');
    if (status) stop(`Commit or set aside these changes first:\n${status}`);
  }

  /** Every path a release changes: the manifests, the lock file, the CHANGELOG and the notes it deletes. */
  const releasePaths = notes => [
    FILES.packageJson,
    FILES.cargoToml,
    FILES.cargoLock,
    FILES.changelog,
    ...notes.map(note => note.file),
  ];

  /**
   * Writes the version everywhere and the CHANGELOG section, and deletes the
   * notes. Every file's new text is worked out first, so a problem with any
   * of them stops it before anything is written.
   */
  function writeRelease(version, section, notes) {
    const texts = checked(() => [
      [FILES.packageJson, setPackageJsonVersion(read(FILES.packageJson), version, FILES.packageJson)],
      [FILES.cargoToml, setCargoTomlVersion(read(FILES.cargoToml), version, FILES.cargoToml)],
      [
        FILES.cargoLock,
        setCargoLockVersions(read(FILES.cargoLock), [cargoTomlName(read(FILES.cargoToml), FILES.cargoToml)], version),
      ],
      [FILES.changelog, insertSection(read(FILES.changelog), version, section)],
    ]);
    for (const [file, text] of texts) write(file, text);
    for (const note of notes) rmSync(path(note.file));
  }

  function commitAndTag(version, section, paths) {
    git('add', '--all', '--', ...paths);
    const body = section.split('\n').slice(1).join('\n').trim();
    sh.run('git', ['commit', '--quiet', '-m', `Release ${version}`, '-m', body]);
    sh.run('git', ['tag', '--annotate', tagOf(version), '-m', `${productName()} ${version}`]);
  }

  function release(options) {
    const current = currentVersion();
    const notes = changeNotes();
    const level = options.level ?? highestBump(notes);
    if (!level) {
      stop(`No change notes in ${FILES.changes}/ (changes/README.md says how to write one).
To release without any, pass --patch, --minor or --major.`);
    }
    const version = checked(() => bumpVersion(current, level));
    const section = renderSection(version, isoDate(now()), notes);

    if (options.dryRun) {
      out(`${current} → ${version} (${options.level ? `--${level}` : `${level}, from the notes`})`);
      if (notes.length > 0) out(`Notes: ${notes.map(note => note.file).join(', ')}`);
      out(`\n${section}`);
      return;
    }

    requireMainAndClean();
    if (tagExists(tagOf(version))) stop(`The tag ${tagOf(version)} already exists.`);

    out(`Releasing ${version} (${current} → ${version}, ${level})`);
    const paths = releasePaths(notes);
    const before = git('rev-parse', 'HEAD');
    try {
      writeRelease(version, section, notes);
      commitAndTag(version, section, paths);
    } catch (error) {
      // Once the release is committed, only the tag is missing
      if (git('rev-parse', 'HEAD') === before) {
        deps.err('Putting the version, CHANGELOG and notes back as they were.');
        git('restore', '--source=HEAD', '--staged', '--worktree', '--', ...paths);
      }
      throw error;
    }
    out(`Committed "Release ${version}" and tagged ${tagOf(version)} (not pushed).`);
    if (options.publish) publish(version);
  }

  /** Pushes main and the tag; the tag starts the Release workflow. */
  function publish(version = currentVersion()) {
    const tag = tagOf(version);
    if (!tagExists(tag)) stop(`There's no tag ${tag}: release ${version} first.`);
    if (git('branch', '--show-current') !== 'main') stop('Publish from main.');
    if (extractSection(read(FILES.changelog), version) === null) stop(`CHANGELOG.md has no ${version} section.`);
    sh.run('git', ['push', 'origin', 'main', tag]);
    out(`Pushed main and ${tag}. The Release workflow builds the installers and makes the GitHub release:
  gh run list --workflow release.yml`);
  }

  function copyBuilt(from, destination) {
    if (!existsSync(path(from))) stop(`The build finished, but ${from} isn't there.`);
    copyFileSync(path(from), destination);
  }

  /**
   * Builds one target's installer (and its update, with `updates`) and puts
   * them in releases/; returns their paths.
   */
  function buildTarget(version, plan, updates) {
    const name = productName();
    if (plan.triple) sh.run('rustup', ['target', 'add', plan.triple]);
    const configs = ['--config', FILES.productionConf, ...(updates ? ['--config', FILES.updaterConf] : [])];
    // A Developer ID from the APPLE_* secrets replaces the ad-hoc signature
    if (env.APPLE_SIGNING_IDENTITY) {
      configs.push('--config', JSON.stringify({ bundle: { macOS: { signingIdentity: env.APPLE_SIGNING_IDENTITY } } }));
    }
    const cross = plan.triple ? ['--target', plan.triple] : [];
    sh.run('pnpm', ['tauri', 'build', ...cross, ...configs]);

    const plist = path(macAppInfoPlist(name, plan.target, plan));
    const identifier = sh.output('plutil', ['-extract', 'CFBundleIdentifier', 'raw', plist]);
    const expected = tauriConf().identifier;
    if (identifier !== expected) stop(`The app is ${identifier}, but GloveBox is ${expected}.`);

    const installer = path(join(FILES.releases, assetName(name, version, plan.target)));
    copyBuilt(bundlePath(name, version, plan.target, plan), installer);
    if (!updates) return [installer];

    const from = updateBundlePaths(name, plan.target, plan);
    const to = updateAssetNames(name, version, plan.target);
    for (const file of [from.file, from.signature]) {
      if (!existsSync(path(file))) stop(`The build finished, but ${file} isn't there.`);
    }
    // The key installed apps check updates with: a mismatch can't ship
    checked(() =>
      verifyUpdateSignature({
        publicKey: tauriConf().plugins.updater.pubkey,
        signature: read(from.signature),
        data: readFileSync(path(from.file)),
      })
    );
    return [
      [from.file, to.file],
      [from.signature, to.signature],
    ].map(([source, file]) => {
      const destination = path(join(FILES.releases, file));
      copyBuilt(source, destination);
      return destination;
    });
  }

  function rebuild(options) {
    const version = currentVersion();
    const plans = checked(() =>
      buildTargets({ targets: options.targets, ...host }).map(target => ({ target, ...buildPlan(target, host) }))
    );
    if (git('status', '--porcelain')) out('The working tree has changes: the installers include them.');
    mkdirSync(path(FILES.releases), { recursive: true });
    const updates = Boolean(env.TAURI_SIGNING_PRIVATE_KEY);
    if (!updates) out("TAURI_SIGNING_PRIVATE_KEY isn't set, so the builds make no updates.");
    const files = plans.flatMap(plan => buildTarget(version, plan, updates));
    out(`\nIn ${FILES.releases}/:`);
    for (const file of files) out(`  ${relative(path(FILES.releases), file)}`);
  }

  /** latest.json for the release: each update's address and signature, and the notes. */
  function writeUpdateManifest(version, notes, changelog, dir) {
    const repository = env.GH_REPO;
    if (!repository) stop('GH_REPO (owner/name) says where the release is; the Release workflow sets it.');
    const name = productName();
    const signatures = Object.fromEntries(
      TARGETS.map(target => [
        target,
        readFileSync(join(dir, updateAssetNames(name, version, target).signature), 'utf8'),
      ])
    );
    const manifest = checked(() =>
      updateManifest({
        product: name,
        version,
        notes,
        changelog,
        pubDate: now()
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z'),
        downloadUrl: releaseDownloadUrl(repository, version),
        signatures,
      })
    );
    const file = join(dir, UPDATE_MANIFEST);
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    return file;
  }

  /**
   * The Release workflow's last step: makes the GitHub release for the
   * checked-out tag with its CHANGELOG section, every file in releases/ and
   * latest.json, or replaces the files of one that exists. A release is
   * never made with a file missing.
   */
  function githubRelease() {
    const version = currentVersion();
    const tag = tagOf(version);
    if (env.GITHUB_REF_NAME && env.GITHUB_REF_NAME !== tag) {
      stop(`This run is for ${env.GITHUB_REF_NAME}, but the manifests say ${version}.`);
    }
    if (!tagExists(tag)) stop(`There's no tag ${tag}.`);
    const changelog = read(FILES.changelog);
    const notes = extractSection(changelog, version);
    if (notes === null) stop(`CHANGELOG.md has no ${version} section.`);

    const name = productName();
    const dir = path(FILES.releases);
    const missing = missingAssets(name, version, existsSync(dir) ? readdirSync(dir) : []);
    if (missing.length > 0) stop(`${FILES.releases}/ is missing ${missing.join(', ')}.`);
    const files = [
      ...releaseAssets(name, version).map(file => join(dir, file)),
      writeUpdateManifest(version, notes, releaseSections(changelog), dir),
    ];

    if (sh.succeeds('gh', ['release', 'view', tag])) {
      sh.run('gh', ['release', 'upload', tag, '--clobber', ...files]);
      out(`Replaced the files of the ${tag} release.`);
      return;
    }
    const notesFile = join(tmpdir, `glovebox-${version}-notes.md`);
    writeFileSync(notesFile, `${notes}\n`);
    try {
      sh.run('gh', [
        'release',
        'create',
        tag,
        '--verify-tag',
        '--title',
        `${name} ${version}`,
        '--notes-file',
        notesFile,
        ...files,
      ]);
    } finally {
      rmSync(notesFile, { force: true });
    }
    out(`Made the ${tag} release.`);
  }

  try {
    const options = parseArgs(args);
    if (options.command === 'help') out(USAGE);
    else if (options.command === 'publish') publish();
    else if (options.command === 'github-release') githubRelease();
    else if (options.command === 'rebuild') rebuild(options);
    else release(options);
    return 0;
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    deps.err(error.message);
    return 1;
  }
}
