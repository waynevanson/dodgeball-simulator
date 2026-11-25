//! Shared Bevy client for the dodgeball simulator.
//!
//! This crate contains the complete presentation layer: the world renderer,
//! HUD, menus, input handling and the SpacetimeDB connection. The browser and
//! desktop crates are thin entry points around this library.

pub mod color;
pub mod consts;
pub mod input;
pub mod model;
pub mod net;
pub mod platform;
pub mod render;
pub mod ui;

use bevy::prelude::*;
use bevy::render::view::screenshot::{save_to_disk, Screenshot};
#[cfg(not(target_arch = "wasm32"))]
use bevy::window::WindowMode;

use crate::model::{ClientState, ViewFrame};

#[derive(Clone, Debug, Resource)]
pub struct ClientConfig {
    pub uri: String,
    pub database: String,
    pub player_name: String,
    pub muted: bool,
    pub autostart: bool,
}

pub fn run(config: ClientConfig) {
    let player_name = if config.player_name.trim().is_empty() {
        platform::load_player_name().unwrap_or_default()
    } else {
        config.player_name.clone()
    };
    let muted = config.muted || platform::load_muted();
    let token = platform::load_token(&config.uri, &config.database);
    let state = ClientState::new(
        player_name,
        muted,
        config.autostart,
        config.uri.clone(),
        config.database.clone(),
    );
    let view = ViewFrame(state.placeholder.clone());

    let window = make_window();

    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(window),
        ..default()
    }));
    app.insert_resource(state)
        .insert_resource(view)
        .insert_resource(input::InputState::default())
        .init_resource::<render::PlayerVisuals>()
        .init_resource::<render::BallVisuals>()
        .add_systems(
            Startup,
            (
                render::setup_textures,
                render::setup_camera,
                render::setup_world,
                render::setup_effect_pools,
                ui::setup_ui,
            )
                .chain(),
        )
        .add_systems(
            Update,
            (
                input::gather_input,
                input::gather_touches,
                update_view,
                ui::update_layout,
                ui::update_screens,
                ui::update_texts,
                ui::update_bars,
                ui::update_button_colors,
                ui::handle_actions,
                ui::name_input,
            )
                .chain(),
        )
        .add_systems(Update, debug_screenshot)
        .add_systems(
            Update,
            (
                render::sync_players,
                render::sync_balls,
                render::sync_trails,
                render::sync_particles,
                render::sync_floaters,
                render::draw_dynamic,
                render::camera_shake,
            ),
        );

    net::add_network(
        &mut app,
        net::NetConfig {
            uri: config.uri,
            database: config.database,
            token,
        },
    );
    app.add_systems(
        Update,
        net::send_input
            .after(input::gather_input)
            .after(input::gather_touches)
            .after(net::NetSet),
    );

    app.run();
}

fn update_view(time: Res<Time>, mut state: ResMut<ClientState>, mut view: ResMut<ViewFrame>) {
    let now = time.elapsed_secs_f64();
    let next = state.build_view(now);
    state.view = next.clone();
    view.0 = next;
}

#[cfg(target_arch = "wasm32")]
fn make_window() -> Window {
    Window {
        title: "Dodgeball Simulator".to_string(),
        canvas: Some("#game".to_string()),
        fit_canvas_to_parent: true,
        prevent_default_event_handling: true,
        resolution: (1280, 720).into(),
        ..default()
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn make_window() -> Window {
    Window {
        title: "Dodgeball Simulator".to_string(),
        resolution: (1280, 720).into(),
        mode: WindowMode::Windowed,
        resizable: true,
        ..default()
    }
}

fn debug_screenshot(mut commands: Commands, time: Res<Time>, mut done: Local<bool>) {
    if *done {
        return;
    }
    let Some(path) = std::env::var_os("DODGEBALL_SCREENSHOT") else {
        return;
    };
    if time.elapsed_secs() < 6.0 {
        return;
    }
    *done = true;
    let path = path.to_string_lossy().to_string();
    commands
        .spawn(Screenshot::primary_window())
        .observe(save_to_disk(path));
}
