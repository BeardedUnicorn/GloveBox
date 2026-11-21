//! GloveBox's Tauri shell: a small Rust host around the web app, which does
//! the tracking, lessons and scoring itself. The shell grants the camera,
//! keeps the saved data and updates the app.

mod app;
pub mod permissions;
#[cfg(desktop)]
pub mod platform;
#[cfg(desktop)]
pub mod updates;

#[cfg(all(test, desktop))]
mod testing;

pub use app::run;
