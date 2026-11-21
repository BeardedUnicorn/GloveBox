//! Updates from GloveBox's GitHub releases. The webview decides when to check
//! and asks before anything downloads (src/updates/updates.ts); these
//! commands ask the Platform for the release feed and install what it found,
//! restarting into it and sending the download's progress as it goes. The
//! feed, the signature check and the install itself are the updater
//! plugin's (platform/os.rs).

use crate::platform::{AvailableUpdate, DownloadEvent, Platform};
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime, State};

/// The event install_update sends its progress as.
pub const UPDATE_PROGRESS: &str = "update-progress";

/// A dev build has no update feed (tauri.conf.json's endpoints are empty):
/// it never updates itself into a release.
pub const DEV_BUILDS: &str = "Dev builds don't update: install a release to try updates.";

/// A debug build's executable isn't an installed app, so the updater would replace the wrong thing.
pub const DEBUG_INSTALL: &str =
    "A development build can't install updates. Build the app to try one.";

/// How far a download of unknown size gets between progress events.
const UNKNOWN_SIZE_STEP: u64 = 512 * 1024;

/// The Platform the update commands use (managed state).
pub struct Updates(pub Arc<dyn Platform>);

/// UPDATE_PROGRESS's payload.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// Bytes downloaded so far.
    pub downloaded: u64,
    /// The download's size, when the server says.
    pub total: Option<u64>,
    /// The download is done and the update is being installed.
    pub installing: bool,
}

/// The download's progress, once per whole percent (or per
/// UNKNOWN_SIZE_STEP of a download of unknown size) rather than once per
/// chunk, which would be thousands of events.
#[derive(Debug, Default)]
struct Reporter {
    downloaded: u64,
    total: Option<u64>,
    /// The step the last event was sent at.
    sent: Option<u64>,
}

impl Reporter {
    /// The event to send for `event`, if any.
    fn next(&mut self, event: DownloadEvent) -> Option<Progress> {
        match event {
            DownloadEvent::Chunk { bytes, total } => {
                self.downloaded += bytes;
                self.total = total.or(self.total);
                let step = match self.total {
                    Some(total) if total > 0 => self.downloaded.min(total) * 100 / total,
                    _ => self.downloaded / UNKNOWN_SIZE_STEP,
                };
                if self.sent == Some(step) {
                    return None;
                }
                self.sent = Some(step);
                Some(self.progress(false))
            }
            DownloadEvent::Downloaded => Some(self.progress(true)),
        }
    }

    fn progress(&self, installing: bool) -> Progress {
        Progress {
            downloaded: self.downloaded,
            total: self.total,
            installing,
        }
    }
}

/// What the feed found, as the webview sees it: latest.json's `changelog`
/// and `pub_date` beside the version and its notes.
pub fn available_update(
    version: String,
    current_version: String,
    notes: Option<String>,
    feed: &Value,
) -> AvailableUpdate {
    AvailableUpdate {
        version,
        current_version,
        notes,
        changelog: feed["changelog"].as_str().map(str::to_string),
        date: feed["pub_date"].as_str().map(str::to_string),
    }
}

/// An updater failure in words for the update dialog.
pub fn updater_error(error: &tauri_plugin_updater::Error) -> String {
    match error {
        tauri_plugin_updater::Error::EmptyEndpoints => DEV_BUILDS.to_string(),
        other => other.to_string(),
    }
}

/// Why this build can't install an update, if it can't.
pub fn install_refusal(debug_build: bool) -> Option<&'static str> {
    debug_build.then_some(DEBUG_INSTALL)
}

/// Downloads and installs the update the last check found, telling `emit`
/// the progress, then restarts into it. Only comes back on failure.
pub async fn install(
    platform: &dyn Platform,
    emit: &(dyn Fn(Progress) + Send + Sync),
) -> Result<(), String> {
    let mut reporter = Reporter::default();
    platform
        .install_update(Box::new(move |event| {
            if let Some(progress) = reporter.next(event) {
                emit(progress);
            }
        }))
        .await?;
    platform.restart();
    Ok(())
}

/// The newer release the feed names, if any.
#[tauri::command]
pub async fn check_for_update(
    updates: State<'_, Updates>,
) -> Result<Option<AvailableUpdate>, String> {
    updates.0.check_update().await
}

/// Installs the update check_for_update found and restarts into it, sending UPDATE_PROGRESS.
#[tauri::command]
pub async fn install_update<R: Runtime>(
    app: AppHandle<R>,
    updates: State<'_, Updates>,
) -> Result<(), String> {
    let emit = |progress: Progress| {
        let _ = app.emit(UPDATE_PROGRESS, progress);
    };
    install(updates.0.as_ref(), &emit).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{FakePlatform, Recorded};
    use serde_json::json;
    use std::sync::Mutex;
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{
        INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
    };
    use tauri::webview::InvokeRequest;
    use tauri::{App, Listener, WebviewWindow, WebviewWindowBuilder};

    fn chunk(bytes: u64, total: Option<u64>) -> DownloadEvent {
        DownloadEvent::Chunk { bytes, total }
    }

    fn update() -> AvailableUpdate {
        AvailableUpdate {
            version: "0.2.0".into(),
            current_version: "0.1.0".into(),
            notes: Some("### Added\n\n- Dark mode".into()),
            changelog: Some("## 0.2.0 – 2026-12-01".into()),
            date: Some("2026-12-01T10:00:00Z".into()),
        }
    }

    /// An app with the update commands, and the fake as its Platform (or none at all).
    fn app(platform: Option<Arc<FakePlatform>>) -> (App<MockRuntime>, WebviewWindow<MockRuntime>) {
        let mut builder = mock_builder();
        if let Some(platform) = platform {
            builder = builder.manage(Updates(platform));
        }
        let app = builder
            .invoke_handler(tauri::generate_handler![check_for_update, install_update])
            .build(mock_context(noop_assets()))
            .expect("the mock app builds");
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("the mock window builds");
        (app, webview)
    }

    fn invoke(webview: &WebviewWindow<MockRuntime>, cmd: &str) -> Result<Value, Value> {
        get_ipc_response(
            webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                // The app's own pages (a remote page may not call app commands)
                url: "tauri://localhost".parse().expect("a URL"),
                body: InvokeBody::Json(json!({})),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().expect("JSON"))
    }

    /// Every UPDATE_PROGRESS payload the app sends, as it sends them.
    fn progress_events(app: &App<MockRuntime>) -> Arc<Mutex<Vec<Value>>> {
        let sent = Arc::new(Mutex::new(Vec::new()));
        let sink = sent.clone();
        app.listen_any(UPDATE_PROGRESS, move |event| {
            let payload = serde_json::from_str(event.payload()).expect("JSON");
            sink.lock().expect("the list").push(payload);
        });
        sent
    }

    #[test]
    fn a_check_returns_the_newer_release_for_the_webview() {
        let platform = Arc::new(FakePlatform::default());
        platform.check_replies(Ok(Some(update())));
        let (_app, webview) = app(Some(platform.clone()));

        assert_eq!(
            invoke(&webview, "check_for_update"),
            Ok(json!({
                "version": "0.2.0",
                "currentVersion": "0.1.0",
                "notes": "### Added\n\n- Dark mode",
                "changelog": "## 0.2.0 – 2026-12-01",
                "date": "2026-12-01T10:00:00Z",
            }))
        );
        assert_eq!(platform.recorded().checks, 1);
    }

    #[test]
    fn a_check_with_nothing_newer_returns_null_and_a_failed_one_says_why() {
        let platform = Arc::new(FakePlatform::default());
        let (_app, webview) = app(Some(platform.clone()));
        assert_eq!(invoke(&webview, "check_for_update"), Ok(Value::Null));

        platform.check_replies(Err("the network is down".into()));
        assert_eq!(
            invoke(&webview, "check_for_update"),
            Err(json!("the network is down"))
        );
    }

    #[test]
    fn an_install_sends_progress_once_per_percent_then_restarts() {
        let platform = Arc::new(FakePlatform::default());
        // 1000 bytes in chunks of 4: 250 chunks, but 101 whole percents (0–100)
        let mut events = vec![chunk(4, Some(1000)); 250];
        events.push(DownloadEvent::Downloaded);
        platform.download_goes(events);
        let (app, webview) = app(Some(platform.clone()));
        let sent = progress_events(&app);

        assert_eq!(invoke(&webview, "install_update"), Ok(Value::Null));

        let sent = sent.lock().expect("the list");
        assert_eq!(sent.len(), 101 + 1);
        assert_eq!(
            sent[0],
            json!({ "downloaded": 4, "total": 1000, "installing": false })
        );
        assert_eq!(
            sent[100],
            json!({ "downloaded": 1000, "total": 1000, "installing": false })
        );
        assert_eq!(
            sent[101],
            json!({ "downloaded": 1000, "total": 1000, "installing": true })
        );
        assert_eq!(
            platform.recorded(),
            Recorded {
                checks: 0,
                installs: 1,
                restarts: 1
            }
        );
    }

    #[test]
    fn a_failed_install_says_why_and_doesnt_restart() {
        let platform = Arc::new(FakePlatform::default());
        platform.download_goes(vec![chunk(10, Some(10)), DownloadEvent::Downloaded]);
        platform.install_fails("the signature doesn't match");
        let (app, webview) = app(Some(platform.clone()));
        let sent = progress_events(&app);

        assert_eq!(
            invoke(&webview, "install_update"),
            Err(json!("the signature doesn't match"))
        );
        assert_eq!(sent.lock().expect("the list").len(), 2);
        assert_eq!(platform.recorded().restarts, 0);
    }

    #[test]
    fn the_commands_refuse_without_a_platform() {
        let (_app, webview) = app(None);
        for cmd in ["check_for_update", "install_update"] {
            let error = invoke(&webview, cmd).expect_err(cmd);
            assert!(
                error.to_string().contains("state not managed"),
                "{cmd}: {error}"
            );
        }
    }

    #[test]
    fn a_download_of_unknown_size_is_reported_every_half_megabyte() {
        let kb = 1024;
        let mut reporter = Reporter::default();
        let sent: Vec<_> = [
            chunk(100 * kb, None),
            chunk(300 * kb, None),
            chunk(200 * kb, None),
            chunk(200 * kb, Some(0)),
            DownloadEvent::Downloaded,
        ]
        .into_iter()
        .filter_map(|event| reporter.next(event))
        .map(|progress| (progress.downloaded, progress.installing))
        .collect();
        // 100 KB (step 0), 600 KB (step 1), then the end
        assert_eq!(
            sent,
            [(100 * kb, false), (600 * kb, false), (800 * kb, true)]
        );
    }

    #[test]
    fn a_size_seen_once_is_kept_and_more_than_it_counts_as_done() {
        let mut reporter = Reporter::default();
        assert_eq!(
            reporter.next(chunk(50, Some(100))).map(|p| p.total),
            Some(Some(100))
        );
        assert_eq!(reporter.next(chunk(0, None)), None);
        // A server that sent more than it said stops at 100%
        assert_eq!(
            reporter.next(chunk(80, None)),
            Some(Progress {
                downloaded: 130,
                total: Some(100),
                installing: false
            })
        );
        assert_eq!(reporter.next(chunk(10, None)), None);
    }

    #[test]
    fn the_feed_adds_its_changelog_and_date() {
        let feed = json!({ "version": "0.2.0", "changelog": "## 0.2.0", "pub_date": "2026-12-01T10:00:00Z" });
        assert_eq!(
            available_update("0.2.0".into(), "0.1.0".into(), None, &feed),
            AvailableUpdate {
                notes: None,
                changelog: Some("## 0.2.0".into()),
                ..update()
            }
        );
        // An older feed without them
        let bare = available_update("0.2.0".into(), "0.1.0".into(), None, &json!({}));
        assert_eq!((bare.changelog, bare.date), (None, None));
    }

    #[test]
    fn updater_failures_are_said_plainly() {
        assert_eq!(
            updater_error(&tauri_plugin_updater::Error::EmptyEndpoints),
            DEV_BUILDS
        );
        assert_eq!(
            updater_error(&tauri_plugin_updater::Error::ReleaseNotFound),
            "Could not fetch a valid release JSON from the remote"
        );
    }

    #[test]
    fn only_a_release_build_installs() {
        assert_eq!(install_refusal(true), Some(DEBUG_INSTALL));
        assert_eq!(install_refusal(false), None);
    }
}
