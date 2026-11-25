use wasm_bindgen::prelude::*;

/// Browser entry point. Vite passes the same configuration the old TypeScript
/// client read from `VITE_SPACETIME_*`.
#[wasm_bindgen]
pub fn start(uri: &str, database: &str, player_name: &str, muted: bool, autostart: bool) {
    console_error_panic_hook::set_once();
    dodgeball_client::run(dodgeball_client::ClientConfig {
        uri: uri.to_string(),
        database: database.to_string(),
        player_name: player_name.to_string(),
        muted,
        autostart,
    });
}
