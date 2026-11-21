import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { check, inlineIgnores, main, nodeCoverageFlags, rustIgnoreRegex, VITEST_THRESHOLDS, walk } from './lib.mjs';

// Markers built from parts, so this test file doesn't trip the check itself
const IGNORE = 'ign' + 'ore';
const V8_MARKER = `/* v8 ${IGNORE} next */`;
const RUST_MARKER = '#[coverage' + '(off)]';

const GOOD_VITEST = `
const policy = JSON.parse(readFileSync('coverage-policy.json'));
coverage: { exclude: policy.typescript.map(entry => entry.glob), ${VITEST_THRESHOLDS} }
`;

const policy = () => ({
  typescript: [{ glob: 'src/**/*.test.ts', why: 'tests' }],
  scripts: [{ glob: 'scripts/entry.mjs', why: 'entry' }],
  rust: [{ file: 'src-tauri/src/main.rs', why: 'binary entry' }],
});

let root;

function write(path, text = '') {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'glovebox-coverage-'));
  write('vitest.config.ts', GOOD_VITEST);
  write('scripts/entry.mjs', 'main();\n');
  write('src-tauri/src/main.rs', 'fn main() {}\n');
  write('coverage-policy.json', JSON.stringify(policy()));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the gates flags', () => {
  test("cargo llvm-cov's ignore regex matches each Rust file at the end of a path", () => {
    const regex = rustIgnoreRegex({ rust: [{ file: 'src-tauri/src/main.rs' }, { file: 'src-tauri/src/app.rs' }] });
    assert.equal(regex, 'src-tauri/src/main\\.rs$|src-tauri/src/app\\.rs$');
    assert.match('/Users/me/GloveBox/src-tauri/src/app.rs', new RegExp(regex));
    assert.doesNotMatch('/Users/me/GloveBox/src-tauri/src/apps.rs', new RegExp(regex));
  });

  test('node --test is held at 100% and leaves out only the policy scripts', () => {
    assert.deepEqual(nodeCoverageFlags({ scripts: [{ glob: 'scripts/a.mjs' }] }), [
      '--experimental-test-coverage',
      '--test-coverage-lines=100',
      '--test-coverage-branches=100',
      '--test-coverage-functions=100',
      '--test-coverage-include=scripts/**/*.mjs',
      '--test-coverage-exclude=scripts/a.mjs',
    ]);
  });
});

describe('walking the source', () => {
  test('finds source files in nested folders, skipping dependencies, build output and other files', () => {
    write('src/a.ts');
    write('src/deep/b.tsx');
    write('src/notes.md');
    write('src/node_modules/x.js');
    write('src/target/y.rs');
    const found = [...walk(join(root, 'src'))].map(file => file.slice(root.length + 1)).sort();
    assert.deepEqual(found, ['src/a.ts', 'src/deep/b.tsx']);
  });

  test('inline ignores are reported with their line', () => {
    assert.deepEqual(inlineIgnores('x.ts', `ok\n${V8_MARKER}\nok`), ['x.ts:2: inline coverage ignores are banned']);
    assert.deepEqual(inlineIgnores('y.rs', `${RUST_MARKER}\nfn f() {}`), [
      'y.rs:1: inline coverage ignores are banned',
    ]);
    assert.deepEqual(inlineIgnores('z.ts', 'const ignored = true;'), []);
  });
});

describe('checking the policy', () => {
  test('a policy whose files exist, a preset vitest config and clean source pass', () => {
    write('src/a.ts', 'export const a = 1;\n');
    assert.deepEqual(check(root, policy()), []);
  });

  test('every section must be a list', () => {
    const { typescript, rust } = policy();
    assert.deepEqual(check(root, { typescript, rust }), ['coverage-policy.json has no "scripts" list']);
  });

  test('every entry says why, and a plain path must exist', () => {
    const bad = policy();
    bad.typescript.push({ glob: 'src/**/*.d.ts', why: '  ' });
    bad.scripts.push({ glob: 'scripts/gone.mjs', why: 'entry' });
    bad.rust.push({ why: 42 });
    assert.deepEqual(check(root, bad), [
      "coverage-policy.json: typescript entry src/**/*.d.ts doesn't say why",
      "coverage-policy.json: scripts entry scripts/gone.mjs doesn't exist",
      "coverage-policy.json: rust entry undefined doesn't say why",
    ]);
  });

  test('vitest.config.ts must exist', () => {
    rmSync(join(root, 'vitest.config.ts'));
    assert.deepEqual(check(root, policy()), ['vitest.config.ts is missing']);
  });

  test('vitest.config.ts takes its exclusions from the policy and keeps 100% thresholds', () => {
    write('vitest.config.ts', "coverage: { exclude: ['src/main.tsx'], thresholds: { lines: 90 } }");
    assert.deepEqual(check(root, policy()), [
      "vitest.config.ts must take coverage's exclude list from coverage-policy.json alone",
      `vitest.config.ts must keep "${VITEST_THRESHOLDS}"`,
    ]);
  });

  test('an inline ignore anywhere in the source fails', () => {
    write('src/deep/a.ts', `${V8_MARKER}\nexport const a = 1;\n`);
    write('src-tauri/src/lib.rs', RUST_MARKER);
    assert.deepEqual(check(root, policy()).sort(), [
      'src-tauri/src/lib.rs:1: inline coverage ignores are banned',
      'src/deep/a.ts:1: inline coverage ignores are banned',
    ]);
  });
});

describe('the command line', () => {
  const run = args => {
    const out = [];
    const err = [];
    const code = main(args, { root, out: text => out.push(text), err: text => err.push(text) });
    return { code, out, err };
  };

  test('prints the Rust ignore regex', () => {
    assert.deepEqual(run(['--rust-ignore-regex']), { code: 0, out: ['src-tauri/src/main\\.rs$'], err: [] });
  });

  test('prints the node coverage flags on one line', () => {
    const { code, out } = run(['--node-coverage-flags']);
    assert.equal(code, 0);
    assert.match(out[0], /^--experimental-test-coverage .*--test-coverage-exclude=scripts\/entry\.mjs$/);
  });

  test('checks the policy: ok', () => {
    assert.deepEqual(run([]), { code: 0, out: ['The coverage policy holds.'], err: [] });
  });

  test('checks the policy: each problem, then a failing exit code', () => {
    rmSync(join(root, 'vitest.config.ts'));
    assert.deepEqual(run([]), { code: 1, out: [], err: ['vitest.config.ts is missing'] });
  });
});
