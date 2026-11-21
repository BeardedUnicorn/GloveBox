//! The Platform on Tauri: the updater plugin's real check, download, install
//! and restart. They need an installed app, so coverage leaves this file out
//! (coverage-policy.json) and it holds calls only: every decision is in
//! updates.rs, which is tested.

use super::{AvailableUpdate, BoxFuture, DownloadEvent, OnDownload, Platform};
use crate::updates::{available_update, install_refusal, updater_error};
use std::sync::Mutex;
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

pub struct OsPlatform<R: Runtime> {
    app: AppHandle<R>,
    /// The update the last check found, for install_update.
    update: Mutex<Option<Update>>,
}

impl<R: Runtime> OsPlatform<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self {
            app,
            update: Mutex::new(None),
        }
    }
}

impl<R: Runtime> Platform for OsPlatform<R> {
    fn check_update(&self) -> BoxFuture<'_, Result<Option<AvailableUpdate>, String>> {
        Box::pin(async move {
            let updater = self.app.updater().map_err(|error| updater_error(&error))?;
            let found = updater
                .check()
                .await
                .map_err(|error| updater_error(&error))?;
            let available = found.as_ref().map(|update| {
                available_update(
                    update.version.clone(),
                    update.current_version.clone(),
                    update.body.clone(),
                    &update.raw_json,
                )
            });
            *self.update.lock().unwrap_or_else(|e| e.into_inner()) = found;
            Ok(available)
        })
    }

    fn install_update<'a>(
        &'a self,
        on_download: OnDownload<'a>,
    ) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            if let Some(refusal) = install_refusal(cfg!(debug_assertions)) {
                return Err(refusal.to_string());
            }
            let update = self
                .update
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            let update = update.ok_or("Check for updates first.")?;
            // Both callbacks report to on_download, one at a time
            let on_download = Mutex::new(on_download);
            let report = |event| (on_download.lock().unwrap_or_else(|e| e.into_inner()))(event);
            update
                .download_and_install(
                    |bytes, total| {
                        report(DownloadEvent::Chunk {
                            bytes: bytes as u64,
                            total,
                        })
                    },
                    || report(DownloadEvent::Downloaded),
                )
                .await
                .map_err(|error| updater_error(&error))
        })
    }

    fn restart(&self) {
        self.app.restart();
    }
}
