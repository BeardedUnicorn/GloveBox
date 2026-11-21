/**
 * The release's pure parts (scripts/release/commands.mjs does the files, git
 * and builds): reading change notes, the next version, the CHANGELOG
 * section, the version in each manifest, what a release ships and how a
 * computer builds it, and the app's updates (their files, their signatures
 * and latest.json). Tested by lib.test.mjs.
 */

import { createHash, createPublicKey, verify } from 'node:crypto';

/** Bump levels, lowest first. */
export const BUMPS = ['patch', 'minor', 'major'];

/** Change types, in the order the CHANGELOG lists them (Keep a Changelog). */
export const TYPES = ['Added', 'Changed', 'Removed', 'Fixed', 'Security'];

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * A change note: front matter with `bump` and `type`, then the text for the
 * CHANGELOG, one bullet or one per `- ` line. Throws an error that names
 * the file when anything is missing or unknown.
 */
export function parseNote(file, text) {
  const fail = problem => {
    throw new Error(`${file}: ${problem} (see changes/README.md)`);
  };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0].trim() !== '---') fail('it should start with a --- line');
  const end = lines.indexOf('---', 1);
  if (end === -1) fail('the front matter has no closing --- line');

  const fields = {};
  for (const line of lines.slice(1, end)) {
    const content = line.replace(/#.*$/, '').trim();
    if (content === '') continue;
    const match = content.match(/^([a-z]+):\s*(\S+)$/i);
    if (!match) fail(`can't read "${line.trim()}" (expected "key: value")`);
    const [, key, value] = match;
    if (key !== 'bump' && key !== 'type') fail(`unknown field "${key}"`);
    fields[key] = value;
  }
  if (!fields.bump) fail('no bump');
  if (!BUMPS.includes(fields.bump)) fail(`bump "${fields.bump}" isn't one of ${BUMPS.join(', ')}`);
  if (!fields.type) fail('no type');
  if (!TYPES.includes(fields.type)) fail(`type "${fields.type}" isn't one of ${TYPES.join(', ')}`);

  const items = noteItems(lines.slice(end + 1));
  if (items.length === 0) fail('no text for the changelog');
  return { file, bump: fields.bump, type: fields.type, items };
}

/** The body's bullets: each `- ` line starts one, and other lines join the one before. */
function noteItems(lines) {
  const items = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('- ')) items.push(line.slice(2).trim());
    else if (items.length > 0) items[items.length - 1] += ` ${line}`;
    else items.push(line);
  }
  return items;
}

/** The highest bump the notes ask for; null with no notes. */
export function highestBump(notes) {
  let highest = -1;
  for (const note of notes) highest = Math.max(highest, BUMPS.indexOf(note.bump));
  return highest === -1 ? null : BUMPS[highest];
}

export const isVersion = text => VERSION.test(text);

export function bumpVersion(version, bump) {
  const match = version.match(VERSION);
  if (!match) throw new Error(`"${version}" isn't a version like 1.2.3`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`"${bump}" isn't one of ${BUMPS.join(', ')}`);
}

/** A local date as YYYY-MM-DD. */
export function isoDate(date) {
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const sectionHeading = (version, date) => `## ${version} – ${date}`;

/** The CHANGELOG section for a release: its heading, then the notes by type (and by file name within a type). */
export function renderSection(version, date, notes) {
  const parts = [sectionHeading(version, date)];
  if (notes.length === 0) parts.push('No user-facing changes.');
  for (const type of TYPES) {
    const ofType = notes.filter(note => note.type === type).sort((a, b) => a.file.localeCompare(b.file));
    if (ofType.length === 0) continue;
    parts.push(`### ${type}`, ofType.flatMap(note => note.items.map(item => `- ${item}`)).join('\n'));
  }
  return `${parts.join('\n\n')}\n`;
}

const HEADING = /^## (\S+)/;

/** The versions the CHANGELOG has sections for, newest first. */
export const changelogVersions = changelog => changelog.split('\n').flatMap(line => line.match(HEADING)?.[1] ?? []);

/** The CHANGELOG with a section added above the newest one (or at the end, with none yet). */
export function insertSection(changelog, version, section) {
  if (changelogVersions(changelog).includes(version)) throw new Error(`CHANGELOG.md already has ${version}`);
  const lines = changelog.split('\n');
  const first = lines.findIndex(line => HEADING.test(line));
  const added = section.trimEnd();
  if (first === -1) return `${changelog.trimEnd()}\n\n${added}\n`;
  return [...lines.slice(0, first), ...added.split('\n'), '', ...lines.slice(first)].join('\n');
}

/** A version's section without its heading (the release notes); null when it has none. */
export function extractSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex(line => line.match(HEADING)?.[1] === version);
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && HEADING.test(line));
  return lines
    .slice(start + 1, next === -1 ? undefined : next)
    .join('\n')
    .trim();
}

/** How many releases' notes the update feed carries: enough for any update, without growing for good. */
export const FEED_RELEASES = 30;

/** The newest `limit` releases' sections, newest first, without the file's own header ('' with no release yet). */
export function releaseSections(changelog, limit = FEED_RELEASES) {
  const lines = changelog.split('\n');
  const headings = lines.flatMap((line, index) => (HEADING.test(line) ? [index] : []));
  if (headings.length === 0) return '';
  return lines.slice(headings[0], headings[limit]).join('\n').trim();
}

// The version in each kind of manifest. Each edit replaces only the version
// text, so the file's formatting is kept.

const PACKAGE_JSON_VERSION = /^(\s*"version":\s*")([^"]*)(")/m;

export function packageJsonVersion(text, file) {
  const match = text.match(PACKAGE_JSON_VERSION);
  if (!match) throw new Error(`${file}: no "version"`);
  return match[2];
}

export function setPackageJsonVersion(text, version, file) {
  packageJsonVersion(text, file);
  return text.replace(PACKAGE_JSON_VERSION, `$1${version}$3`);
}

/** The [package] table: from its header to the next table. */
function packageTable(text, file) {
  const start = text.search(/^\[package\]\s*$/m);
  if (start === -1) throw new Error(`${file}: no [package] table`);
  const rest = text.slice(start + 1).search(/^\[/m);
  const end = rest === -1 ? text.length : start + 1 + rest;
  return { start, end, table: text.slice(start, end) };
}

function cargoField(text, field, file) {
  const match = packageTable(text, file).table.match(new RegExp(`^${field}\\s*=\\s*"([^"]*)"`, 'm'));
  if (!match) throw new Error(`${file}: no ${field} in [package]`);
  return match[1];
}

export const cargoTomlVersion = (text, file) => cargoField(text, 'version', file);
export const cargoTomlName = (text, file) => cargoField(text, 'name', file);

export function setCargoTomlVersion(text, version, file) {
  cargoTomlVersion(text, file);
  const { start, end, table } = packageTable(text, file);
  return text.slice(0, start) + table.replace(/^(version\s*=\s*")[^"]*(")/m, `$1${version}$2`) + text.slice(end);
}

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cargo.lock with each named package at the version; each must be listed exactly once. */
export function setCargoLockVersions(text, names, version) {
  let next = text;
  for (const name of names) {
    const entry = new RegExp(`(\\[\\[package\\]\\]\\nname = "${escapeRegex(name)}"\\nversion = ")[^"]*(")`, 'g');
    const count = next.match(entry)?.length ?? 0;
    if (count !== 1) throw new Error(`Cargo.lock lists ${name} ${count} times, expected once`);
    next = next.replace(entry, `$1${version}$2`);
  }
  return next;
}

// What a release ships: one installer per target, named
// `<product>-<version>-<suffix>`, and each one's update. The Release workflow
// builds every target; a local --rebuild builds this computer's own.

/**
 * The desktop targets: the OS and CPU each runs on, its Rust target, and the
 * Tauri bundle the installer comes from. Windows, Linux and Android go here
 * when the app ships there (with their suffix, update and plan).
 */
const DESKTOP = {
  'macos-arm64': {
    platform: 'darwin',
    arch: 'arm64',
    triple: 'aarch64-apple-darwin',
    bundle: 'dmg',
    file: 'aarch64.dmg',
    suffix: 'macos-arm64.dmg',
    update: { platform: 'darwin-aarch64', suffix: 'macos-arm64.app.tar.gz' },
  },
  'macos-x64': {
    platform: 'darwin',
    arch: 'x64',
    triple: 'x86_64-apple-darwin',
    bundle: 'dmg',
    file: 'x64.dmg',
    suffix: 'macos-x64.dmg',
    update: { platform: 'darwin-x86_64', suffix: 'macos-x64.app.tar.gz' },
  },
};

/** Every target a release ships, in the order the release lists them. */
export const TARGETS = Object.keys(DESKTOP);

const PLATFORMS = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
const describeHost = ({ platform, arch }) => `${PLATFORMS[platform] ?? platform} (${arch})`;

export const isTarget = name => TARGETS.includes(name);

function requireTarget(target) {
  if (!isTarget(target)) throw new Error(`Unknown target "${target}" (one of ${TARGETS.join(', ')})`);
  return DESKTOP[target];
}

/** The installer a target ships as. */
export function assetName(product, version, target) {
  return `${product}-${version}-${requireTarget(target).suffix}`;
}

/** The files a target's update ships as: `{ file, signature }`. */
export function updateAssetNames(product, version, target) {
  const file = `${product}-${version}-${requireTarget(target).update.suffix}`;
  return { file, signature: `${file}.sig` };
}

/** Every file a release ships, latest.json aside (it's made from them): each installer, then each update. */
export function releaseAssets(product, version) {
  const updates = TARGETS.flatMap(target => {
    const { file, signature } = updateAssetNames(product, version, target);
    return [file, signature];
  });
  return [...TARGETS.map(target => assetName(product, version, target)), ...updates];
}

/** Every file a release ships for the version that isn't among `files` (file names). */
export function missingAssets(product, version, files) {
  return releaseAssets(product, version).filter(name => !files.includes(name));
}

/**
 * How a computer builds a target: a Tauri build, natively (triple null) or
 * cross-compiled for the other Mac CPU (`--target <triple>`). Throws for a
 * target the computer can't build.
 */
export function buildPlan(target, host) {
  const desktop = requireTarget(target);
  if (desktop.platform !== host.platform) throw new Error(`${target} can't be built on ${describeHost(host)}`);
  return { kind: 'tauri', triple: desktop.arch === host.arch ? null : desktop.triple };
}

/** The targets to build: the ones named (in order, once each), or else this computer's own. */
export function buildTargets({ targets = [], platform, arch }) {
  for (const target of targets) requireTarget(target);
  if (targets.length > 0) return [...new Set(targets)];
  const own = TARGETS.find(target => DESKTOP[target].platform === platform && DESKTOP[target].arch === arch);
  if (!own) throw new Error(`There's no installer for ${describeHost({ platform, arch })}: name one with --target`);
  return [own];
}

/** Where Tauri leaves the Cargo build's bundles, relative to the repository root. */
const bundleDir = plan => (plan.triple ? `src-tauri/target/${plan.triple}/release/bundle` : 'src-tauri/target/release/bundle');

/** Where Tauri leaves a target's installer, relative to the repository root. */
export function bundlePath(product, version, target, plan) {
  const { bundle, file } = requireTarget(target);
  return `${bundleDir(plan)}/${bundle}/${product}_${version}_${file}`;
}

/** Where Tauri leaves a target's update and its signature (made from the .app), relative to the repository root. */
export function updateBundlePaths(product, target, plan) {
  requireTarget(target);
  const file = `${bundleDir(plan)}/macos/${product}.app.tar.gz`;
  return { file, signature: `${file}.sig` };
}

/** The Info.plist of the app a target's installer was made from, relative to the repository root. */
export function macAppInfoPlist(product, target, plan) {
  requireTarget(target);
  return `${bundleDir(plan)}/macos/${product}.app/Contents/Info.plist`;
}

/** The file the app's updater reads, in the latest GitHub release (tauri.production.conf.json). */
export const UPDATE_MANIFEST = 'latest.json';

/** Where a release's files download from. */
export const releaseDownloadUrl = (repository, version) => `https://github.com/${repository}/releases/download/v${version}`;

/**
 * latest.json: the version, its notes and date, and for each target its
 * update's address and signature (`signatures`: the .sig files' text, by
 * target). `changelog` is every recent release's section, so an app some
 * releases behind can show what each brought; the updater reads the rest.
 */
export function updateManifest({ product, version, notes, changelog, pubDate, downloadUrl, signatures }) {
  const platforms = {};
  for (const target of TARGETS) {
    const signature = signatures[target]?.trim();
    if (!signature) throw new Error(`There's no update signature for ${target}`);
    platforms[DESKTOP[target].update.platform] = {
      signature,
      url: `${downloadUrl}/${updateAssetNames(product, version, target).file}`,
    };
  }
  return { version, notes, changelog, pub_date: pubDate, platforms };
}

// Minisign, as the updater checks it: a public key is "Ed", its 8-byte key
// id and the Ed25519 key; a signature is its algorithm ("ED": of the file's
// BLAKE2b-512, "Ed": of the file itself), the key id and the signature,
// then a trusted comment and a signature over both. Tauri base64-encodes
// each file.

/** tauri.conf.json's pubkey before the updater key is made (README "Desktop updates"). */
export const PUBKEY_PLACEHOLDER = 'REPLACE_WITH_THE_UPDATER_PUBLIC_KEY';

const minisignLines = text => Buffer.from(text.trim(), 'base64').toString('utf8').trimEnd().split('\n');

/** How minisign shows a key id. */
const keyId = bytes => Buffer.from(bytes).reverse().toString('hex').toUpperCase();

/**
 * Checks that `signature` (a .sig file's text) signs `data` with
 * `publicKey` (plugins.updater.pubkey), as the app does before it installs
 * an update. Throws saying what's wrong.
 */
export function verifyUpdateSignature({ publicKey, signature, data }) {
  if (publicKey === PUBKEY_PLACEHOLDER) {
    throw new Error(
      "tauri.conf.json's plugins.updater.pubkey is still the placeholder: make the updater key (README \"Desktop updates\")"
    );
  }
  const key = Buffer.from(minisignLines(publicKey)[1] ?? '', 'base64');
  if (key.length !== 42 || key.toString('latin1', 0, 2) !== 'Ed') {
    throw new Error("The app's updater public key (plugins.updater.pubkey) isn't a minisign public key");
  }
  const [, signed = '', trusted = '', global = ''] = minisignLines(signature);
  const signatureBytes = Buffer.from(signed, 'base64');
  const algorithm = signatureBytes.toString('latin1', 0, 2);
  if (signatureBytes.length !== 74 || (algorithm !== 'ED' && algorithm !== 'Ed')) {
    throw new Error("The update's signature isn't a minisign signature");
  }
  const signedBy = keyId(signatureBytes.subarray(2, 10));
  const trustedKey = keyId(key.subarray(2, 10));
  if (signedBy !== trustedKey) {
    throw new Error(`The update is signed with key ${signedBy}, but the app trusts key ${trustedKey}`);
  }
  const ed25519 = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: key.subarray(10).toString('base64url') },
    format: 'jwk',
  });
  const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
  if (!verify(null, message, ed25519, signatureBytes.subarray(10))) {
    throw new Error("The update's signature doesn't match the file");
  }
  const comment = Buffer.from(trusted.replace(/^trusted comment: /, ''));
  if (!verify(null, Buffer.concat([signatureBytes.subarray(10), comment]), ed25519, Buffer.from(global, 'base64'))) {
    throw new Error("The update signature's trusted comment doesn't match it");
  }
}
