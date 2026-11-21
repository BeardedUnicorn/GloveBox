/**
 * Desktop updates with release notes (the README's "Desktop updates").
 *
 * Wiring, in the app's root component:
 * - `<UpdatePrompt blocked={onPracticeRoute} />` once: it checks 10 s after
 *   launch and daily, and asks before installing. While `blocked` (during
 *   practice) its dialog waits, so it never interrupts a session.
 * - `<UpdatedNotice onShowWhatsNew={() => navigate('/settings#whats-new')} />`
 *   once: a toast, once per version, after an update.
 *
 * In Settings: `<UpdatesSection />` (version, Check now, the automatic
 * check) and `<WhatsNew />` (every release's notes from CHANGELOG.md).
 *
 * APP_VERSION is package.json's version; the Rust commands are
 * check_for_update and install_update (src-tauri/src/updates.rs).
 */

export { RELEASES, type ReleaseNotes } from './changelog';
export { UpdatedNotice } from './UpdatedNotice';
export { UpdatePrompt } from './UpdatePrompt';
export { UpdatesSection } from './UpdatesSection';
export { updates, useUpdates } from './updates';
export { APP_VERSION } from './version';
export { WhatsNew } from './WhatsNew';
