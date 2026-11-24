# Changelog

What changed in each GloveBox release, newest first. Versions follow
[semantic versioning](https://semver.org):

- a major release can stop older lessons, progress or settings from working,
- a minor one adds features,
- a patch fixes things.

`pnpm release` writes each section from the change notes in `changes/`
(see [changes/README.md](changes/README.md)). The app shows this file in
Settings → What's new, and the update dialog shows the sections a new
version brings.

## 1.3.0 – 2026-11-23

### Added

- Fit to me: the first time you open a lesson, hold both hands up where you'll practice and GloveBox sizes and centers the lesson to them, however far you stand from the camera. "Refit to me" on the Ready card measures again when you move.
- The target rings are smaller, so neighboring fingers' rings no longer overlap, and the rolls, roll crawl and grid slides hold the two hands a little farther apart. Scores are a touch stricter right at the center of a ring; how far out a near miss still counts is unchanged.

## 1.2.0 – 2026-11-23

### Added

- Settings lists every camera by name and shows a live picture from the one you pick, so you can see it's the right one.

### Fixed

- GloveBox no longer picks a virtual camera, like OBS's, on its own. Automatic now uses your Mac's own camera.

## 1.1.0 – 2026-11-21

### Changed

- Lesson cards play their move: the lights run through it at the lesson's tempo, with light trails, over a faint line of where each one goes. If your system is set to reduce motion, the cards show the glowing paths alone, as before.

### Fixed

- A recorded move where the camera lost one of your lights partway through no longer breaks the library. Its card leaves that light out while it was lost.

## 1.0.0 – 2026-11-21

### Added

- Coaching for every move: tips on what to watch for before you start, and cues on screen while the move plays, in practice and in Watch.

### Changed

- The move library is rebuilt from how glovers actually teach: 22 lessons instead of 12. Finger rolls are now real rolls that pass from one hand to the other, with your thumbs still and your pinkies (or index fingers) touching in the middle. New moves include finger waves, downward rolls, splits, roll crawls, wrist flails and all four flail patterns, whips, King Tut boxes, finger boxes, tracing, clocking, point isolation, fixed 45s and a first full light show.
- Tier 2 is now Flails & whips and tier 4 is Tech & contours. A "tracer" is a light mode, not a move.
- Stars from the old lessons don't count toward the new ones, so tiers above the first may lock again until you earn stars in the new library. Your streak, practice calendar and finger stats all keep counting your past sessions.

## 0.1.1 – 2026-11-21

### Changed

- GloveBox has its own icon: glowing glove trails in cyan and magenta, in the Dock, the app switcher and the app's own top bar.

## 0.1.0 – 2026-11-21

No user-facing changes.
