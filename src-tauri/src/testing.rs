//! A recording Platform for tests: it answers checks and installs the way a
//! test says, and notes what it was asked to do.

use crate::platform::{AvailableUpdate, BoxFuture, DownloadEvent, OnDownload, Platform};
use std::sync::Mutex;

/// What a FakePlatform was asked to do.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Recorded {
    pub checks: usize,
    pub installs: usize,
    pub restarts: usize,
}

#[derive(Default)]
pub struct FakePlatform {
    /// check_update's answer (the default, Ok(None): nothing newer).
    check_reply: Mutex<Reply>,
    /// The steps an install's download goes through.
    download: Mutex<Vec<DownloadEvent>>,
    /// Why the install fails, after its download, if it does.
    install_error: Mutex<Option<String>>,
    recorded: Mutex<Recorded>,
}

/// A check's answer; Default is Ok(None), which Result itself can't derive.
#[derive(Default)]
struct Reply(Option<Result<Option<AvailableUpdate>, String>>);

impl FakePlatform {
    pub fn check_replies(&self, reply: Result<Option<AvailableUpdate>, String>) {
        self.check_reply.lock().expect("the reply").0 = Some(reply);
    }

    pub fn download_goes(&self, events: Vec<DownloadEvent>) {
        *self.download.lock().expect("the download") = events;
    }

    pub fn install_fails(&self, error: &str) {
        *self.install_error.lock().expect("the error") = Some(error.to_string());
    }

    pub fn recorded(&self) -> Recorded {
        self.recorded.lock().expect("the record").clone()
    }
}

impl Platform for FakePlatform {
    fn check_update(&self) -> BoxFuture<'_, Result<Option<AvailableUpdate>, String>> {
        self.recorded.lock().expect("the record").checks += 1;
        let reply = self
            .check_reply
            .lock()
            .expect("the reply")
            .0
            .clone()
            .unwrap_or(Ok(None));
        Box::pin(async move { reply })
    }

    fn install_update<'a>(
        &'a self,
        mut on_download: OnDownload<'a>,
    ) -> BoxFuture<'a, Result<(), String>> {
        let events = self.download.lock().expect("the download").clone();
        let error = self.install_error.lock().expect("the error").clone();
        Box::pin(async move {
            for event in events {
                on_download(event);
            }
            if let Some(error) = error {
                return Err(error);
            }
            self.recorded.lock().expect("the record").installs += 1;
            Ok(())
        })
    }

    fn restart(&self) {
        self.recorded.lock().expect("the record").restarts += 1;
    }
}
