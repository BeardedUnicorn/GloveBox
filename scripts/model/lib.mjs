/**
 * The hand-tracking model GloveBox ships (Lit mode): MediaPipe's Hand
 * Landmarker, float16, version 1. It's too big for git, so `pnpm
 * fetch-model` downloads it into public/models/, where Vite bundles it into
 * the app, and checks it is byte for byte the model this was written for.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const MODEL = {
  url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  path: 'public/models/hand_landmarker.task',
  bytes: 7_819_105,
  sha256: 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1',
};

export const sha256 = data => createHash('sha256').update(data).digest('hex');

/** Whether `data` is the model: its size, then its hash. */
export const isModel = (data, model = MODEL) => data.length === model.bytes && sha256(data) === model.sha256;

/**
 * Makes sure the model is at `root`/MODEL.path: keeps a good copy, and
 * otherwise downloads it with `fetch` and checks it before writing it.
 * Returns the exit code.
 */
export async function main({ root, fetch, out, err, model = MODEL }) {
  const file = join(root, model.path);
  if (existsSync(file) && isModel(readFileSync(file), model)) {
    out(`${model.path} is already the model.`);
    return 0;
  }
  out(`Downloading ${model.url}`);
  const response = await fetch(model.url);
  if (!response.ok) {
    err(`The download failed: HTTP ${response.status}`);
    return 1;
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (!isModel(data, model)) {
    err(`The download isn't the expected model (${data.length} bytes, sha256 ${sha256(data)}); nothing was written.`);
    return 1;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  out(`Saved ${model.path} (${data.length} bytes, sha256 checked).`);
  return 0;
}
