//! The Tauri app: its builder, plugins and run loop. They need a real event
//! loop and main thread, so this file holds wiring only (coverage-policy.json);
//! every decision it makes is in a tested module.

use crate::permissions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_permission_request(|_webview, kind| permissions::decide(kind))
        .run(tauri::generate_context!())
        .expect("GloveBox couldn't start");
}
