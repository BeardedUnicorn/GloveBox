#!/usr/bin/env node
// pnpm release: cuts, builds and publishes releases (scripts/release/commands.mjs)
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createShell, main } from './release/commands.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

process.exitCode = main(process.argv.slice(2), {
  root,
  sh: createShell(spawnSync, root),
  env: process.env,
  host: { platform: process.platform, arch: process.arch },
  now: () => new Date(),
  tmpdir: tmpdir(),
  out: text => console.log(text),
  err: text => console.error(text),
});
