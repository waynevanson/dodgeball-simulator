//! Bevy input -> the simulation's `InputFrame`, plus the on-screen touch
//! controls. Nothing in this module knows about the network or the renderer.

use bevy::input::mouse::MouseButton;
use bevy::prelude::*;
use bevy::window::PrimaryWindow;
use dodgeball_sim::resources::InputFrame;

use crate::consts::{UI_H, UI_W};
use crate::model::ClientState;

const STICK: Vec2 = Vec2::new(150.0, 552.0);
const STICK_R: f32 = 86.0;
const THROW_BTN: Vec2 = Vec2::new(1120.0, 556.0);
const THROW_R: f32 = 62.0;
const DASH_BTN: Vec2 = Vec2::new(1000.0, 646.0);
const DASH_R: f32 = 34.0;
const CATCH_BTN: Vec2 = Vec2::new(1190.0, 630.0);
const CATCH_R: f32 = 34.0;

#[derive(Resource, Default)]
pub struct InputState {
    pub design: Vec2,
    pub up: bool,
    pub down: bool,
    pub left: bool,
    pub right: bool,
    pub mouse_used: bool,
    pub left_down: bool,
    pub right_pressed: bool,
    pub dash: bool,
    pub catch: bool,
    pub pending_dash: bool,
    pub pending_catch: bool,
    pub pending_right: bool,
    pub pending_touch_dash: bool,
    pub pending_touch_catch: bool,
    pub using_touch: bool,
    pub touch_mx: f32,
    pub touch_my: f32,
    pub throw_down: bool,
    pub touch_dash: bool,
    pub touch_catch: bool,
    pub stick_id: Option<u64>,
    pub throw_id: Option<u64>,
}

impl InputState {
    pub fn mark_sent(&mut self) {
        self.right_pressed = false;
        self.dash = false;
        self.catch = false;
        self.touch_dash = false;
        self.touch_catch = false;
        self.pending_dash = false;
        self.pending_catch = false;
        self.pending_right = false;
        self.pending_touch_dash = false;
        self.pending_touch_catch = false;
    }

    pub fn build_frame(&mut self, state: &ClientState) -> InputFrame {
        let touch = self.using_touch || state.show_touch;
        let frame = InputFrame {
            up: !state.editing_name && !touch && self.up,
            down: !state.editing_name && !touch && self.down,
            left: !state.editing_name && !touch && self.left,
            right: !state.editing_name && !touch && self.right,
            mouse_x: self.design.x as f64,
            mouse_y: self.design.y as f64,
            mouse_used: self.mouse_used && !touch,
            left_down: if touch { false } else { self.left_down },
            right_pressed: (self.right_pressed || self.pending_right) && !touch,
            dash: if touch {
                false
            } else {
                self.dash || self.pending_dash
            },
            catch: if touch {
                false
            } else {
                self.catch || self.pending_catch
            },
            touch,
            touch_mx: self.touch_mx as f64,
            touch_my: self.touch_my as f64,
            throw_down: self.throw_down,
            touch_dash: self.pending_touch_dash || self.touch_dash,
            touch_catch: self.pending_touch_catch || self.touch_catch,
        };
        frame
    }
}

/// Kept as a small wrapper so input and UI read the same keyboard state.

pub fn gather_input(
    keys: Res<ButtonInput<KeyCode>>,
    mouse: Res<ButtonInput<MouseButton>>,
    windows: Query<&Window, With<PrimaryWindow>>,
    mut state: ResMut<InputState>,
    client: Res<ClientState>,
) {
    if !client.editing_name {
        state.up = keys.any_pressed([KeyCode::KeyW, KeyCode::ArrowUp]);
        state.down = keys.any_pressed([KeyCode::KeyS, KeyCode::ArrowDown]);
        state.left = keys.any_pressed([KeyCode::KeyA, KeyCode::ArrowLeft]);
        state.right = keys.any_pressed([KeyCode::KeyD, KeyCode::ArrowRight]);
    } else {
        state.up = false;
        state.down = false;
        state.left = false;
        state.right = false;
    }

    if let Ok(window) = windows.single() {
        if let Some(position) = window.cursor_position() {
            let design = design_from_window(position, window);
            if design.distance(state.design) > 0.01 {
                state.design = design;
                state.mouse_used = true;
            }
            if !client.show_touch && !state.using_touch {
                state.using_touch = false;
            }
        }
        state.using_touch = client.show_touch || state.using_touch;
    }

    if !client.editing_name {
        state.left_down = mouse.pressed(MouseButton::Left);
        state.right_pressed = mouse.just_pressed(MouseButton::Right);
        state.pending_right |= state.right_pressed;
        state.dash = keys.any_just_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        state.pending_dash |= state.dash;
        state.catch = keys.any_just_pressed([KeyCode::Space, KeyCode::KeyE]);
        state.pending_catch |= state.catch;
    } else {
        state.left_down = false;
        state.right_pressed = false;
        state.dash = false;
        state.catch = false;
    }
}

pub fn gather_touches(
    touches: Res<Touches>,
    mut state: ResMut<InputState>,
    client: Res<ClientState>,
    windows: Query<&Window, With<PrimaryWindow>>,
) {
    let Ok(window) = windows.single() else {
        return;
    };
    for touch in touches.iter_just_pressed() {
        let design = design_from_window(touch.position(), window);
        state.using_touch = true;
        state.mouse_used = false;
        match touch_target(design) {
            Some(TouchTarget::Stick) => {
                state.stick_id = Some(touch.id());
                update_stick(&mut state, design);
            }
            Some(TouchTarget::Throw) => {
                state.throw_id = Some(touch.id());
                state.throw_down = true;
            }
            Some(TouchTarget::Dash) => {
                state.touch_dash = true;
                state.pending_touch_dash = true;
            }
            Some(TouchTarget::Catch) => {
                state.touch_catch = true;
                state.pending_touch_catch = true;
            }
            None => {}
        }
    }

    for touch in touches.iter() {
        if Some(touch.id()) == state.stick_id {
            let design = design_from_window(touch.position(), window);
            update_stick(&mut state, design);
        }
    }

    for touch in touches.iter_just_released() {
        if Some(touch.id()) == state.stick_id {
            state.stick_id = None;
            state.touch_mx = 0.0;
            state.touch_my = 0.0;
        }
        if Some(touch.id()) == state.throw_id {
            state.throw_id = None;
            state.throw_down = false;
        }
    }

    if touches.any_just_pressed() || touches.any_just_released() {
        state.using_touch = true;
    }
    if client.show_touch && !state.using_touch {
        state.using_touch = true;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TouchTarget {
    Stick,
    Throw,
    Dash,
    Catch,
}

fn touch_target(design: Vec2) -> Option<TouchTarget> {
    if design.distance(STICK) <= STICK_R {
        Some(TouchTarget::Stick)
    } else if design.distance(THROW_BTN) <= THROW_R {
        Some(TouchTarget::Throw)
    } else if design.distance(DASH_BTN) <= DASH_R {
        Some(TouchTarget::Dash)
    } else if design.distance(CATCH_BTN) <= CATCH_R {
        Some(TouchTarget::Catch)
    } else {
        None
    }
}

fn update_stick(state: &mut InputState, design: Vec2) {
    let delta = design - STICK;
    let length = delta.length();
    let clamped = if length > STICK_R {
        delta / length * STICK_R
    } else {
        delta
    };
    state.touch_mx = clamped.x / STICK_R;
    state.touch_my = clamped.y / STICK_R;
}

pub fn design_from_window(position: Vec2, window: &Window) -> Vec2 {
    let scale = ui_scale(window);
    let offset = ui_offset(window);
    (position - offset) / scale
}

pub fn ui_scale(window: &Window) -> f32 {
    (window.width() / UI_W)
        .min(window.height() / UI_H)
        .max(0.01)
}

pub fn ui_offset(window: &Window) -> Vec2 {
    let scale = ui_scale(window);
    Vec2::new(
        (window.width() - UI_W * scale) * 0.5,
        (window.height() - UI_H * scale) * 0.5,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(width: u32, height: u32) -> Window {
        Window {
            resolution: bevy::window::WindowResolution::new(width, height),
            ..default()
        }
    }

    #[test]
    fn design_from_window_maps_a_16_9_surface() {
        let window = window(1280, 720);
        assert_eq!(design_from_window(Vec2::ZERO, &window), Vec2::ZERO);
        assert_eq!(
            design_from_window(Vec2::new(1280.0, 720.0), &window),
            Vec2::new(UI_W, UI_H)
        );
        assert_eq!(
            design_from_window(Vec2::new(640.0, 360.0), &window),
            Vec2::new(640.0, 360.0)
        );
    }

    #[test]
    fn design_from_window_accounts_for_letterboxing() {
        // 1000x1000 letterboxes the 16:9 design inside 1000x562.5 with 218.75
        // pixels of vertical padding.
        let window = window(1000, 1000);
        assert_eq!(ui_offset(&window), Vec2::new(0.0, 218.75));
        assert!((ui_scale(&window) - 0.78125).abs() < 1e-6);
        assert_eq!(
            design_from_window(Vec2::new(0.0, 218.75), &window),
            Vec2::ZERO
        );
        assert_eq!(
            design_from_window(Vec2::new(1000.0, 781.25), &window),
            Vec2::new(UI_W, UI_H)
        );
    }

    #[test]
    fn touch_controls_hit_in_design_space() {
        assert_eq!(touch_target(STICK), Some(TouchTarget::Stick));
        assert_eq!(touch_target(THROW_BTN), Some(TouchTarget::Throw));
        assert_eq!(touch_target(DASH_BTN), Some(TouchTarget::Dash));
        assert_eq!(touch_target(CATCH_BTN), Some(TouchTarget::Catch));
        assert_eq!(touch_target(Vec2::new(640.0, 200.0)), None);
        assert_eq!(touch_target(STICK + Vec2::new(STICK_R + 1.0, 0.0)), None);
    }

    #[test]
    fn stick_is_clamped_to_its_radius() {
        let mut state = InputState::default();
        update_stick(&mut state, STICK + Vec2::new(10_000.0, 0.0));
        assert!((state.touch_mx - 1.0).abs() < 1e-6);
        assert!(state.touch_my.abs() < 1e-6);

        update_stick(&mut state, STICK + Vec2::new(0.0, -STICK_R * 0.5));
        assert!(state.touch_mx.abs() < 1e-6);
        assert!((state.touch_my + 0.5).abs() < 1e-6);
    }

    fn client_state() -> ClientState {
        ClientState::new(
            "Player".to_string(),
            false,
            false,
            "uri".into(),
            "db".into(),
        )
    }

    #[test]
    fn editing_the_name_suppresses_movement() {
        let mut state = InputState {
            up: true,
            dash: true,
            pending_dash: true,
            ..default()
        };
        let mut client = client_state();
        let frame = state.build_frame(&client);
        assert!(frame.up);
        assert!(frame.dash);

        client.editing_name = true;
        let frame = state.build_frame(&client);
        assert!(!frame.up);
        assert!(frame.dash);
    }

    #[test]
    fn keyboard_maps_to_movement_and_one_shots() {
        let mut app = App::new();
        app.add_plugins(MinimalPlugins);
        app.init_resource::<ButtonInput<KeyCode>>();
        app.init_resource::<ButtonInput<MouseButton>>();
        app.insert_resource(client_state());
        app.init_resource::<InputState>();
        app.world_mut().spawn((Window::default(), PrimaryWindow));
        app.add_systems(Update, gather_input);

        {
            let mut keys = app.world_mut().resource_mut::<ButtonInput<KeyCode>>();
            keys.press(KeyCode::KeyW);
            keys.press(KeyCode::ShiftLeft);
        }
        app.update();
        {
            let state = app.world().resource::<InputState>();
            assert!(state.up);
            assert!(!state.down);
            assert!(state.dash);
            assert!(state.pending_dash);
        }

        {
            let mut keys = app.world_mut().resource_mut::<ButtonInput<KeyCode>>();
            keys.clear();
            keys.release(KeyCode::KeyW);
            keys.release(KeyCode::ShiftLeft);
            keys.press(KeyCode::Space);
        }
        app.update();
        {
            let state = app.world().resource::<InputState>();
            assert!(!state.up);
            assert!(state.catch);
            assert!(state.pending_catch);
        }

        app.world_mut().resource_mut::<ClientState>().editing_name = true;
        {
            let mut keys = app.world_mut().resource_mut::<ButtonInput<KeyCode>>();
            keys.clear();
            keys.release(KeyCode::Space);
            keys.press(KeyCode::KeyD);
        }
        app.update();
        assert!(!app.world().resource::<InputState>().right);
    }

    #[test]
    fn one_shot_edges_clear_after_sending() {
        let mut state = InputState {
            right_pressed: true,
            pending_right: true,
            dash: true,
            pending_dash: true,
            catch: true,
            pending_catch: true,
            touch_dash: true,
            pending_touch_dash: true,
            touch_catch: true,
            pending_touch_catch: true,
            ..default()
        };
        state.mark_sent();
        assert!(!state.right_pressed);
        assert!(!state.pending_right);
        assert!(!state.dash);
        assert!(!state.pending_dash);
        assert!(!state.catch);
        assert!(!state.pending_catch);
        assert!(!state.touch_dash);
        assert!(!state.pending_touch_dash);
        assert!(!state.touch_catch);
        assert!(!state.pending_touch_catch);
    }
}
