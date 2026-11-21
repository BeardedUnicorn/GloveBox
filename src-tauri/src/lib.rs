//! GloveBox's Tauri shell: a small Rust host around the web app, which does
//! the tracking, lessons and scoring itself. The shell grants the camera,
//! keeps the saved data and updates the app.

mod app;
pub mod permissions;

pub use app::run;
