#!/usr/bin/env node
// Checks coverage-policy.json, or prints a gate's flags: scripts/coverage-policy/lib.mjs
import { fileURLToPath } from 'node:url';
import { main } from './coverage-policy/lib.mjs';

process.exitCode = main(process.argv.slice(2), {
  root: fileURLToPath(new URL('..', import.meta.url)),
  out: text => console.log(text),
  err: text => console.error(text),
});
