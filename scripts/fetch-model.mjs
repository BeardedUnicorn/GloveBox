#!/usr/bin/env node
// Downloads the hand-tracking model into public/models/: scripts/model/lib.mjs
import { fileURLToPath } from 'node:url';
import { main } from './model/lib.mjs';

process.exitCode = await main({
  root: fileURLToPath(new URL('..', import.meta.url)),
  fetch,
  out: text => console.log(text),
  err: text => console.error(text),
});
