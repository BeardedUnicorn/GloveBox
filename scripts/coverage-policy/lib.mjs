/**
 * Enforces coverage-policy.json, the one list of what coverage leaves out
 * (docs/coverage-policy.md), and turns it into each gate's flags:
 *
 * - every entry says why, and every file it names exists;
 * - no inline coverage ignores anywhere in the source (v8/istanbul/c8
 *   ignore comments, Rust's coverage(off) attribute);
 * - vitest.config.ts takes its exclusions from the policy and keeps every
 *   threshold at 100;
 * - `--rust-ignore-regex` prints cargo llvm-cov's --ignore-filename-regex,
 *   and `--node-coverage-flags` the node --test flags for scripts/.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Folders whose files ship or build the app. */
export const SOURCE_DIRS = ['src', 'scripts', 'src-tauri/src'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', 'gen', 'coverage']);
const SOURCE_FILE = /\.(rs|ts|tsx|js|mjs|cjs|jsx)$/;

// Built from parts, so this file doesn't match its own patterns
const IGNORE_WORD = 'ign' + 'ore';
export const BANNED = [
  new RegExp(`\\b(?:v8|istanbul|c8)\\s+${IGNORE_WORD}\\b`),
  /#!?\[\s*(?:cfg_attr\s*\([^)]*,\s*)?coverage\s*\(\s*off\s*\)/,
];

/** The thresholds vitest.config.ts must keep, as written there. */
export const VITEST_THRESHOLDS = 'thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 }';

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** cargo llvm-cov's --ignore-filename-regex: the policy's Rust files. */
export function rustIgnoreRegex(policy) {
  return policy.rust.map(entry => `${escapeRegex(entry.file)}$`).join('|');
}

/** node --test's coverage flags for scripts/: 100% of lines, branches and functions, less the policy's files. */
export function nodeCoverageFlags(policy) {
  return [
    '--experimental-test-coverage',
    '--test-coverage-lines=100',
    '--test-coverage-branches=100',
    '--test-coverage-functions=100',
    '--test-coverage-include=scripts/**/*.mjs',
    ...policy.scripts.map(entry => `--test-coverage-exclude=${entry.glob}`),
  ];
}

/** Every source file under `dir` (recursively), skipping build output and dependencies. */
export function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SOURCE_FILE.test(name)) yield path;
  }
}

/** "file:line: inline coverage ignores are banned" for each banned marker in `text`. */
export function inlineIgnores(file, text) {
  return text
    .split('\n')
    .flatMap((line, index) =>
      BANNED.some(pattern => pattern.test(line)) ? [`${file}:${index + 1}: inline coverage ignores are banned`] : []
    );
}

const hasWhy = entry => typeof entry.why === 'string' && entry.why.trim() !== '';

/** Everything wrong with the policy and the repository at `root` ([] when all is well). */
export function check(root, policy) {
  const problems = [];
  const sections = { typescript: 'glob', scripts: 'glob', rust: 'file' };
  for (const [section, key] of Object.entries(sections)) {
    const entries = policy[section];
    if (!Array.isArray(entries)) {
      problems.push(`coverage-policy.json has no "${section}" list`);
      continue;
    }
    for (const entry of entries) {
      const name = entry[key];
      if (!hasWhy(entry)) problems.push(`coverage-policy.json: ${section} entry ${name} doesn't say why`);
      // A plain path (no wildcard) must be a file that exists
      if (typeof name === 'string' && !/[*{]/.test(name) && !existsSync(join(root, name))) {
        problems.push(`coverage-policy.json: ${section} entry ${name} doesn't exist`);
      }
    }
  }

  const vitestConfig = join(root, 'vitest.config.ts');
  if (!existsSync(vitestConfig)) {
    problems.push('vitest.config.ts is missing');
  } else {
    const config = readFileSync(vitestConfig, 'utf8');
    if (!config.includes('exclude: policy.typescript.map(entry => entry.glob)')) {
      problems.push("vitest.config.ts must take coverage's exclude list from coverage-policy.json alone");
    }
    if (!config.includes(VITEST_THRESHOLDS)) {
      problems.push(`vitest.config.ts must keep "${VITEST_THRESHOLDS}"`);
    }
  }

  for (const top of SOURCE_DIRS) {
    const dir = join(root, top);
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) problems.push(...inlineIgnores(relative(root, file), readFileSync(file, 'utf8')));
  }
  return problems;
}

/**
 * The command line: prints the flags a gate asks for, or checks the policy.
 * Returns the exit code.
 */
export function main(args, { root, out, err }) {
  const policy = JSON.parse(readFileSync(join(root, 'coverage-policy.json'), 'utf8'));
  if (args.includes('--rust-ignore-regex')) {
    out(rustIgnoreRegex(policy));
    return 0;
  }
  if (args.includes('--node-coverage-flags')) {
    out(nodeCoverageFlags(policy).join(' '));
    return 0;
  }
  const problems = check(root, policy);
  for (const problem of problems) err(problem);
  if (problems.length > 0) return 1;
  out('The coverage policy holds.');
  return 0;
}
