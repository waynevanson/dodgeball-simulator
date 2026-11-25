use dodgeball_client::{run, ClientConfig};

fn main() {
    let uri = std::env::var("DODGEBALL_SPACETIME_URI")
        .or_else(|_| std::env::var("SPACETIME_URI"))
        .unwrap_or_else(|_| "ws://localhost:3000".to_string());
    let database = std::env::var("DODGEBALL_SPACETIME_DB")
        .or_else(|_| std::env::var("SPACETIME_DB"))
        .unwrap_or_else(|_| "dodgeball-simulator".to_string());
    let player_name = std::env::var("DODGEBALL_PLAYER_NAME").unwrap_or_default();
    let muted = std::env::var("DODGEBALL_MUTED")
        .map(|value| value == "1")
        .unwrap_or(false);
    let autostart = std::env::var("DODGEBALL_AUTOSTART")
        .map(|value| value == "1")
        .unwrap_or(false);

    run(ClientConfig {
        uri,
        database,
        player_name,
        muted,
        autostart,
    });
}
