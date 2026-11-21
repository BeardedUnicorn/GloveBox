//! What the shell asks of the operating system, as a trait: the update
//! commands (updates.rs) decide what to do, and a Platform does it. The real
//! one (os.rs) uses Tauri's updater plugin; tests use the recording fake in
//! testing.rs.

use serde::Serialize;
use std::future::Future;
use std::pin::Pin;

pub mod os;

/// A future a Platform hands back.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Told about each step of a download, in order.
pub type OnDownload<'a> = Box<dyn FnMut(DownloadEvent) + Send + 'a>;

/// check_for_update's reply when the release feed names a newer version.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    pub version: String,
    /// The version running now.
    pub current_version: String,
    /// The new release's CHANGELOG section (Markdown).
    pub notes: Option<String>,
    /// Every recent release's sections, newest first: what an app several releases behind missed.
    pub changelog: Option<String>,
    /// When it was released (RFC 3339).
    pub date: Option<String>,
}

/// A step of an update's download.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DownloadEvent {
    /// Some bytes arrived; `total` is the download's size, when the server says.
    Chunk { bytes: u64, total: Option<u64> },
    /// It's all here (and its signature checked): installing is next.
    Downloaded,
}

pub trait Platform: Send + Sync {
    /// Asks the release feed for a newer version; keeps what it found for install_update.
    fn check_update(&self) -> BoxFuture<'_, Result<Option<AvailableUpdate>, String>>;
    /// Downloads, checks and installs the update the last check found.
    fn install_update<'a>(
        &'a self,
        on_download: OnDownload<'a>,
    ) -> BoxFuture<'a, Result<(), String>>;
    /// Starts the app again (into the version just installed).
    fn restart(&self);
}
