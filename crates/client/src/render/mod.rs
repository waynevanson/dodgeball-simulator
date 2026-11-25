//! World rendering and camera setup.

pub mod effects;
pub mod textures;
pub mod world;

use bevy::camera::{OrthographicProjection, Projection, ScalingMode};
use bevy::prelude::*;

use crate::consts::{UI_H, UI_W};

pub fn setup_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::Fixed {
                width: UI_W,
                height: UI_H,
            },
            ..OrthographicProjection::default_2d()
        }),
        Transform::from_xyz(UI_W * 0.5, UI_H * 0.5, 500.0),
    ));
}

pub use effects::{camera_shake, setup_effect_pools, sync_floaters, sync_particles};
pub use textures::setup_textures;
pub use world::{
    draw_dynamic, setup_world, sync_balls, sync_players, sync_trails, BallVisuals, PlayerVisuals,
};
