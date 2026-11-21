# Excluded-code checklist

The few files that coverage leaves out (see
[coverage-policy.md](../coverage-policy.md)) need a running, installed app.
Run this list before each release, using the bundled app
(`pnpm tauri build --debug --bundles app`) rather than `pnpm tauri dev`.

## `src-tauri/src/main.rs`, `src-tauri/src/app.rs`

- [ ] The app opens to the library without errors in the console (Web
      Inspector: right-click → Inspect Element).
- [ ] **Camera, first run:** reset with
      `tccutil reset Camera io.glovebox.trainer`. Starting a lesson then shows
      macOS's camera prompt once, with GloveBox's reason. After you allow it,
      the preview starts.
- [ ] **Camera, relaunch:** quit and reopen. The camera starts with no
      prompt.
- [ ] **Camera denied:** reset, deny, then start a lesson. GloveBox explains
      how to turn the camera on in System Settings.
- [ ] **No microphone:** nothing ever asks for the microphone.
- [ ] **Offline:** turn Wi-Fi off and relaunch. Hand tracking still loads,
      and the Network tab shows no requests to other hosts.
- [ ] **Entitlement:** `codesign -d --entitlements - GloveBox.app` lists
      `com.apple.security.device.camera`.

## `src-tauri/src/platform/os.rs` (updates)

- [ ] Install release N−1, launch, and wait 10 s. The update dialog offers
      N with its release notes.
- [ ] **Install** shows download progress, then restarts into N. A "What's
      new" notice appears once.
- [ ] **Later** closes the dialog. Settings → Updates → Check now opens it
      again.
- [ ] A `pnpm tauri dev` build's "Check now" says dev builds don't update.
- [ ] During a practice session the dialog doesn't open; it opens when the
      session ends.
- [ ] A debug bundle (`pnpm tauri build --debug`) with the production config
      finds the update but refuses to install it, saying it's a development
      build.
