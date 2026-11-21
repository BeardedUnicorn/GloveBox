import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { isModel, MODEL, main, sha256 } from './lib.mjs';

const GOOD = Buffer.from('a tiny stand-in model');
const model = {
  url: 'https://models.example/hand.task',
  path: 'public/models/hand.task',
  bytes: GOOD.length,
  sha256: sha256(GOOD),
};

let root;
let log;

const run = fetch =>
  main({ root, fetch, model, out: text => log.push(['out', text]), err: text => log.push(['err', text]) });
const respond =
  (body, status = 200) =>
  async url => {
    log.push(['fetch', url]);
    return { ok: status === 200, status, arrayBuffer: async () => body };
  };
const saved = () => join(root, model.path);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'glovebox-model-'));
  log = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the model', () => {
  test('is pinned by size and sha256', () => {
    assert.equal(MODEL.path, 'public/models/hand_landmarker.task');
    assert.match(MODEL.sha256, /^[0-9a-f]{64}$/);
    assert.equal(isModel(GOOD, model), true);
    assert.equal(isModel(Buffer.from('a tiny stand-in modeL'), model), false, 'same size, other bytes');
    assert.equal(isModel(Buffer.from('short'), model), false);
  });
});

describe('fetching it', () => {
  test('downloads, checks and saves it', async () => {
    assert.equal(await run(respond(GOOD)), 0);
    assert.deepEqual(readFileSync(saved()), GOOD);
    assert.deepEqual(log[1], ['fetch', model.url]);
    assert.match(log.at(-1)[1], /^Saved public\/models\/hand\.task/);
  });

  test('keeps a good copy without downloading', async () => {
    mkdirSync(dirname(saved()), { recursive: true });
    writeFileSync(saved(), GOOD);
    assert.equal(await run(respond(GOOD)), 0);
    assert.deepEqual(log, [['out', 'public/models/hand.task is already the model.']]);
  });

  test('replaces a damaged copy', async () => {
    mkdirSync(dirname(saved()), { recursive: true });
    writeFileSync(saved(), 'half a download');
    assert.equal(await run(respond(GOOD)), 0);
    assert.deepEqual(readFileSync(saved()), GOOD);
  });

  test('a failed download writes nothing', async () => {
    assert.equal(await run(respond(GOOD, 404)), 1);
    assert.deepEqual(log.at(-1), ['err', 'The download failed: HTTP 404']);
    assert.equal(existsSync(saved()), false);
  });

  test("a download that isn't the model writes nothing", async () => {
    assert.equal(await run(respond(Buffer.from('something else entirely'))), 1);
    assert.match(log.at(-1)[1], /isn't the expected model \(23 bytes, sha256 [0-9a-f]{64}\); nothing was written/);
    assert.equal(existsSync(saved()), false);
  });
});
