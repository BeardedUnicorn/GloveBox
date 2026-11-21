//! What the webview may use. GloveBox watches your hands through the camera,
//! so the camera is allowed without a second WebKit prompt: macOS still asks
//! once, with Info.plist's NSCameraUsageDescription. It never records sound,
//! so the microphone, and anything else a page might ask for, is refused.

use tauri::webview::{PermissionKind, PermissionResponse};

/// The answer to the webview asking for `kind`.
pub fn decide(kind: PermissionKind) -> PermissionResponse {
    match kind {
        PermissionKind::Camera => PermissionResponse::Allow,
        _ => PermissionResponse::Deny,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_camera_is_allowed() {
        assert_eq!(decide(PermissionKind::Camera), PermissionResponse::Allow);
    }

    #[test]
    fn the_microphone_and_everything_else_are_refused() {
        for kind in [
            PermissionKind::Microphone,
            PermissionKind::Geolocation,
            PermissionKind::Notifications,
        ] {
            assert_eq!(decide(kind), PermissionResponse::Deny, "{kind:?}");
        }
    }
}
