//! The Tauri app: its builder, plugins and run loop. They need a real event
//! loop and main thread, so this file holds wiring only (coverage-policy.json);
//! every decision it makes is in a tested module.

use crate::{migrations, permissions};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(migrations::DATABASE, migrations::migrations())
                .build(),
        )
        .on_permission_request(|_webview, kind| permissions::decide(kind));

    // Updates from the GitHub releases (updates.rs): desktop only, as a phone
    // is updated through its store
    #[cfg(desktop)]
    let builder = {
        use crate::platform::os::OsPlatform;
        use crate::updates::{self, Updates};
        use std::sync::Arc;
        use tauri::Manager;

        builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .setup(|app| {
                app.manage(Updates(Arc::new(OsPlatform::new(app.handle().clone()))));
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                updates::check_for_update,
                updates::install_update
            ])
    };

    builder
        .run(tauri::generate_context!())
        .expect("GloveBox couldn't start");
}
