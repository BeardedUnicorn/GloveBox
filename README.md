# GloveBox

**Learn to glove: a webcam light-show trainer for LED glove flow.**

Gloving is the rave flow art you do with LED gloves: one light on each
fingertip, ten in all, moved through finger rolls, waves, tracers, tutting
shapes and contours. Usually you perform a light show for a *receiver*, a
person sitting close with their eyes on your lights.

In GloveBox, **the webcam is the receiver**. The app shows you on camera and
draws a target circle for each of your ten fingertips. Those targets then move
through a move, and you follow them. GloveBox tracks your real fingertips,
lights each target up when you hit it, and scores how closely you followed.
Move up through the tiers as you get better.

> **Status: pre-alpha.** The architecture is planned and the app is under
> active development. See the [roadmap](#roadmap).

## Features (planned for 1.0)

- **Two ways to track your fingertips:**
  - **Lit mode** practices in a lit room. On-device hand tracking
    ([MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker))
    finds all ten fingertips and knows which finger is which.
  - **Dark mode** practices the real way, in the dark with your gloves on.
    GloveBox finds the LEDs as bright points and follows each one.
    Calibrating once teaches it your gloves.
- **Ghost-trail targets:** ten glowing target rings, with a fading trail
  showing where each finger goes next.
- **Live feedback:** each ring lights up while your fingertip is on it. You
  also get a running accuracy score and a readout of whether you're ahead of
  or behind the beat. Tempo control slows a move down (0.5×) to learn it, or
  speeds it up.
- **A move library in five tiers:**
  1. Foundations: finger rolls, ten-light waves, slow circles.
  2. Tracers: mirrored and opposite circles, figure-8 infinities.
  3. Tutting: boxes, rotations, staircases.
  4. Contours.
  5. Combos.
- **Progression:** grades, stars, tier unlocks, daily streaks, session
  history, and stats on which fingers are lagging.
- **Record mode:** perform a move on camera and save it as a lesson in your
  own library ("My Moves"). Lessons can be exported and shared as
  `.glovebox.json` files.
- **Two views:** practice in *performer* view, which is mirrored like a
  mirror, or switch to *receiver* view to see the show the way your receiver
  would.
- **Automatic updates** with release notes. The app tells you what each
  release since your version changed.

## Platforms

| Platform | Status |
|---|---|
| macOS (Apple silicon and Intel) | First target |
| Android, iOS | Planned (phase 2). The app is built with Tauri v2, which supports both |
| Windows, Linux | Not planned yet |

## Privacy

All camera processing happens **on your device**. No video, images or
tracking data leave your computer. The hand-tracking model and its runtime
ship inside the app, so GloveBox works offline. The MediaPipe library tries
to send usage metrics to Google by default. GloveBox's Content Security
Policy blocks that.

## Tech stack

- **[Tauri v2](https://v2.tauri.app/):** a small Rust shell, plus SQLite
  storage and the auto-updater.
- **React + TypeScript + Vite:** the whole app: tracking, lessons, scoring
  and UI.
- **MediaPipe Tasks Vision:** hand landmarks in Lit mode, running locally
  (WebAssembly and WebGL).
- **Custom LED-blob tracker** for Dark mode. It runs in a Web Worker:
  thresholding, connected components, then Hungarian matching of lights to
  fingers.
- **vitest, fast-check, `node --test` and `cargo llvm-cov`:** 100% unit test
  coverage, enforced in CI.

## Development

### Prerequisites

- [Rust](https://rustup.rs/). The version is pinned by `rust-toolchain.toml`.
- [Node.js](https://nodejs.org/) 24 (`.node-version`) and
  [pnpm](https://pnpm.io/).
- macOS: Xcode Command Line Tools.

### Commands

```bash
pnpm install
pnpm fetch-model        # downloads the hand-tracking model (sha256-checked)
pnpm tauri dev          # runs the app
pnpm test               # unit tests
pnpm test:coverage      # unit tests with the 100% coverage gate
```

With `pnpm tauri dev`, macOS asks for camera access on behalf of your
terminal app. To test the real permission prompt, build the app bundle with
`pnpm tauri build --debug --bundles app`.

## Roadmap

| Milestone | What it delivers |
|---|---|
| **M0** | Scaffold, camera access, local hand tracking, CI with 100% coverage gates |
| **M0.5** | Release pipeline (GitHub Actions), signed auto-updates with release notes |
| **M1** | Core math: coordinates, lesson clock, smoothing, move generators, scoring |
| **M2** | Lit-mode practice: targets, ghost trails, live hits, tempo, results |
| **M3** | Dark mode: LED-blob tracking and calibration |
| **M4** | Saved history and progression: tiers, stars, streaks, stats |
| **M5** | Record mode, plus lesson import and export |
| **M6** | First public macOS release |
| **M7** | Android and iOS |

## License

[MIT](LICENSE)
