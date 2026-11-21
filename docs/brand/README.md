# GloveBox brand

| File                 | What it is                                                       | Used for                                                                 |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `icon-source.png`    | The logo on its dark rounded tile (1254 px, transparent corners) | The source of every app icon                                             |
| `mark-source.png`    | The logo's strokes alone, transparent (1254 px)                  | The source of `mark.png`                                                 |
| `mark.png`           | The mark cropped square, 512 px                                  | The README, and the app's top bar and loading screen (`public/mark.png`) |
| `social-preview.png` | 1280 × 640                                                       | GitHub's social preview (repository Settings → General → Social preview) |

The app's icons are generated from two squares made from `icon-source.png`:

- `src-tauri/app-icon.png`: the tile on Apple's icon grid (824 of 1024 px, with a soft
  shadow), for macOS, Windows and the web favicon (`public/favicon.png`,
  `public/apple-touch-icon.png`).
- `src-tauri/app-icon-mobile.png`: the tile full-bleed on its own background, for
  Android and iOS, which mask their own corners.

To regenerate them after changing the artwork:

```bash
pnpm tauri icon src-tauri/app-icon.png
```

That rewrites `src-tauri/icons/` for every platform. Then generate the phone icons from
the full-bleed square into a scratch folder, and copy only its `android/` and `ios/`
folders into `src-tauri/icons/`:

```bash
pnpm tauri icon src-tauri/app-icon-mobile.png -o /tmp/glovebox-mobile-icons --ios-color '#0d001d'
```

iOS app icons must have no alpha channel, so flatten the copied `ios/` PNGs (for
example, open and export each one without alpha) before submitting to the App Store.
