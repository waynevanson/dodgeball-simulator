//! Presentation constants shared by the world renderer and Bevy UI.

use bevy::color::Color;
use dodgeball_sim::constants::{
    ATTACK_DIST, BALL_MARK_SPACING, COURT, VIEW_H, VIEW_W, WINS_NEEDED,
};
use dodgeball_sim::types::Team;

pub use dodgeball_sim::constants::{
    BALL_RADIUS, PHYS, PLAYER_RADIUS, PX_PER_METRE, SHOT_CLOCK, SHOT_CLOCK_WARN,
};

pub const UI_W: f32 = VIEW_W as f32;
pub const UI_H: f32 = VIEW_H as f32;

pub const COURT_X: f32 = COURT.x as f32;
pub const COURT_Y: f32 = COURT.y as f32;
pub const COURT_W: f32 = COURT.w as f32;
pub const COURT_H: f32 = COURT.h as f32;
pub const COURT_RIGHT: f32 = COURT.right as f32;
pub const COURT_BOTTOM: f32 = COURT.bottom as f32;
pub const COURT_CX: f32 = COURT.cx as f32;
pub const COURT_CY: f32 = COURT.cy as f32;
pub const ATTACK_LINE: f32 = ATTACK_DIST as f32;
pub const BALL_MARK_GAP: f32 = BALL_MARK_SPACING as f32;
pub const WINS: u32 = WINS_NEEDED;

pub const INK: Color = Color::srgb(0.909, 0.933, 0.988);
pub const INK_DIM: Color = Color::srgb(0.604, 0.659, 0.761);
pub const INK_FAINT: Color = Color::srgb(0.392, 0.455, 0.545);
pub const PANEL_FILL: Color = Color::srgba(0.043, 0.063, 0.106, 0.94);
pub const PANEL_LINE: Color = Color::srgba(0.58, 0.64, 0.70, 0.18);
pub const DARK: Color = Color::srgb(0.016, 0.027, 0.047);

pub struct TeamPalette {
    pub main: Color,
    pub light: Color,
    pub dark: Color,
    pub deep: Color,
    pub glow: Color,
}

pub const BLUE: TeamPalette = TeamPalette {
    main: Color::srgb(0.357, 0.576, 1.0),
    light: Color::srgb(0.765, 0.835, 1.0),
    dark: Color::srgb(0.114, 0.247, 0.561),
    deep: Color::srgb(0.043, 0.102, 0.227),
    glow: Color::srgba(0.357, 0.576, 1.0, 0.55),
};

pub const RED: TeamPalette = TeamPalette {
    main: Color::srgb(1.0, 0.373, 0.451),
    light: Color::srgb(1.0, 0.761, 0.792),
    dark: Color::srgb(0.561, 0.106, 0.176),
    deep: Color::srgb(0.239, 0.043, 0.078),
    glow: Color::srgba(1.0, 0.373, 0.451, 0.55),
};

pub fn palette(team: Team) -> &'static TeamPalette {
    match team {
        Team::Blue => &BLUE,
        Team::Red => &RED,
    }
}

pub fn team_name(team: Team) -> &'static str {
    match team {
        Team::Blue => "BLUE",
        Team::Red => "RED",
    }
}

pub const AMBER: Color = Color::srgb(0.984, 0.749, 0.141);
pub const AMBER_LIGHT: Color = Color::srgb(1.0, 0.965, 0.812);
pub const DANGER: Color = Color::srgb(1.0, 0.541, 0.604);
pub const WHITE: Color = Color::WHITE;
