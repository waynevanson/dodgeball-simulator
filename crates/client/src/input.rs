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
    let offset = ui_offset(window);
    for touch in touches.iter_just_pressed() {
        let design = design_from_window(touch.position(), window);
        state.using_touch = true;
        state.mouse_used = false;
        if design.distance(STICK) <= STICK_R {
            state.stick_id = Some(touch.id());
            update_stick(&mut state, design, offset);
            continue;
        }
        if design.distance(THROW_BTN) <= THROW_R {
            state.throw_id = Some(touch.id());
            state.throw_down = true;
            continue;
        }
        if design.distance(DASH_BTN) <= DASH_R {
            state.touch_dash = true;
            state.pending_touch_dash = true;
            continue;
        }
        if design.distance(CATCH_BTN) <= CATCH_R {
            state.touch_catch = true;
            state.pending_touch_catch = true;
        }
    }

    for touch in touches.iter() {
        if Some(touch.id()) == state.stick_id {
            let design = design_from_window(touch.position(), window);
            update_stick(&mut state, design, offset);
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

fn update_stick(state: &mut InputState, design: Vec2, _offset: Vec2) {
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
    let width = window.width().max(1.0);
    let height = window.height().max(1.0);
    Vec2::new(position.x / width * UI_W, position.y / height * UI_H)
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
