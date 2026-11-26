//! Small platform boundary for persistence, window actions and speech.

use bevy::window::Window;

#[cfg(target_arch = "wasm32")]
fn storage() -> Option<web_sys::Storage> {
    web_sys::window()?.local_storage().ok().flatten()
}

#[cfg(not(target_arch = "wasm32"))]
fn native_path(key: &str) -> Option<std::path::PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|home| std::path::PathBuf::from(home).join(".config"))
        })?;
    Some(base.join("dodgeball-simulator").join(key))
}

pub fn load(key: &str) -> Option<String> {
    #[cfg(target_arch = "wasm32")]
    {
        return storage()?.get_item(key).ok().flatten();
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::fs::read_to_string(native_path(key)?).ok()
    }
}

pub fn save(key: &str, value: &str) {
    #[cfg(target_arch = "wasm32")]
    {
        if let Some(storage) = storage() {
            let _ = storage.set_item(key, value);
        }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(path) = native_path(key) {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(path, value);
        }
    }
}

pub fn token_key(uri: &str, database: &str) -> String {
    format!("{uri}/{database}/auth_token")
}

pub fn load_token(uri: &str, database: &str) -> Option<String> {
    load(&token_key(uri, database))
}

pub fn save_token(uri: &str, database: &str, token: &str) {
    save(&token_key(uri, database), token);
}

pub fn load_player_name() -> Option<String> {
    load("player_name")
}

pub fn save_player_name(name: &str) {
    save("player_name", name);
}

pub fn load_muted() -> bool {
    load("muted").as_deref() == Some("1")
}

pub fn save_muted(muted: bool) {
    save("muted", if muted { "1" } else { "0" });
}

/// Toggle fullscreen the way each target expects: the browser Fullscreen API on
/// wasm, and the window mode on native.
pub fn toggle_fullscreen(window: &mut Window) {
    #[cfg(target_arch = "wasm32")]
    {
        let _ = window;
        toggle_browser_fullscreen();
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        use bevy::window::{MonitorSelection, WindowMode};
        window.mode = match window.mode {
            WindowMode::Windowed => WindowMode::BorderlessFullscreen(MonitorSelection::Primary),
            _ => WindowMode::Windowed,
        };
    }
}

#[cfg(target_arch = "wasm32")]
fn toggle_browser_fullscreen() {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    if document.fullscreen_element().is_some() {
        document.exit_fullscreen();
    } else if let Some(element) = document
        .get_element_by_id("app")
        .or_else(|| document.document_element())
    {
        // Rejection (for example a non-gesture call) is harmless.
        let _ = element.request_fullscreen();
    }
}
