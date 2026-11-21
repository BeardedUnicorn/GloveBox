# Coverage policy

GloveBox holds **100% unit test coverage** everywhere, from the first line of
code. There are no floors and no ramp-up.

| Code                                   | Measured with                       | Metrics held at 100%                                         |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| The app (`src/`)                       | vitest + v8 (`pnpm test:coverage`)  | lines, branches, functions, statements                       |
| Build and release scripts (`scripts/`) | `node --test` (`pnpm test:scripts`) | lines, branches, functions                                   |
| The Tauri shell (`src-tauri/`)         | `cargo llvm-cov`                    | lines, functions, regions (stable Rust has no branch metric) |

CI runs every gate (`.github/workflows/ci.yml`). `pnpm verify`
(`scripts/verify.sh`) runs the same gates on your computer.

## Rules

1. **No inline ignores.** `v8`/`istanbul`/`c8` ignore comments and Rust's
   `coverage(off)` attribute are banned. `scripts/check-coverage-policy.mjs`
   fails the build if one appears anywhere in `src/`, `scripts/` or
   `src-tauri/src/`.
2. **Exclusions are whole files, listed once,** in
   [`coverage-policy.json`](../coverage-policy.json), each with a `why`.
   - vitest reads the `typescript` list.
   - `pnpm test:scripts` reads `scripts` through
     `check-coverage-policy.mjs --node-coverage-flags`.
   - cargo llvm-cov reads `rust` through `--rust-ignore-regex`.
   - The check fails if vitest's config grows its own list or lowers a
     threshold, if an entry gives no reason, or if a listed file doesn't
     exist.
3. **An excluded file holds no logic.** It wires tested code together.
   Anything with a branch moves into a tested module.
4. **Delete instead of covering the impossible.** Remove a defensive `??`,
   `?.` or default that the types, zod or serde make unreachable. Don't
   write a test that fakes the impossible.

## What is excluded, and how it's checked instead

| Excluded                                                                              | Why                                                                                                          | Checked by                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Tests, test helpers, `*.d.ts`                                                         | not shipped runtime code                                                                                     | –                                                                              |
| `scripts/check-coverage-policy.mjs`, `scripts/fetch-model.mjs`, `scripts/release.mjs` | one-line entries into their tested `lib.mjs` / `commands.mjs`                                                | CI runs each of them                                                           |
| `src-tauri/src/main.rs`                                                               | binary entry                                                                                                 | [excluded-code checklist](qa/excluded-code-checklist.md)                       |
| `src-tauri/src/app.rs`                                                                | `tauri::Builder`, plugins, `generate_context!` and the run loop. They need a real event loop and main thread | [excluded-code checklist](qa/excluded-code-checklist.md)                       |
| `src-tauri/src/platform/os.rs`                                                        | the updater's real check, download, install and restart. They need an installed app                          | the release end-to-end test and the [checklist](qa/excluded-code-checklist.md) |

## Testing what's hard to test

Browser-only parts reach 100% through injection, not exclusion:

- **Camera:** `getUserMedia` arrives as a parameter, so fakes can grant it,
  deny it, have no device, or end the track (an unplugged camera).
- **MediaPipe:** the hand landmarker is built by an injected factory, so a
  fake returns fixture landmarks.
- **Canvas:** the renderer draws through a small `Ctx2D` interface, which a
  recording fake checks.
- **Frame loops:** `requestAnimationFrame` and `requestVideoFrameCallback`
  sit behind a `Scheduler` that tests drive by hand.
- **Tauri IPC:** `@tauri-apps/api/mocks` (`mockIPC`).
- **Rust platform calls:** a `Platform` trait with a recording fake in
  `testing.rs`. Error paths that can't be reached cheaply use failpoints
  (the `failpoints` feature).
- **Rust commands:** `tauri::test`'s mock runtime invokes each command the
  way the webview does, from the app's own origin (`tauri://localhost`). That
  includes a missing Platform, which is the error path `generate_handler!`
  makes for each `State` argument.
- **The release script:** `scripts/release/commands.mjs` runs on a scratch
  repository. A fake `spawnSync` plays git, Tauri (leaving the bundles it
  would), `plutil` and `gh`. The update signatures are real minisign
  signatures, from a key the test makes.

WebKit browser tests and Playwright end-to-end tests check what unit tests
can't: real video through MediaPipe, and a fake camera through the whole
app. They are on top of the unit gate and don't count toward it.
