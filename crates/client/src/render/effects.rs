//! Pooled particle and floater rendering, plus camera shake.

use bevy::color::Alpha;
use bevy::prelude::*;

use crate::color::parse_css;
use crate::consts::{INK, UI_H, UI_W};
use crate::model::{world_pos, ViewFrame};
use crate::render::textures::WorldTextures;

const PARTICLE_POOL: usize = 512;
const FLOATER_POOL: usize = 32;

#[derive(Resource, Default)]
pub struct EffectPools {
    pub particles: Vec<Entity>,
    pub floaters: Vec<Entity>,
}

#[derive(Component)]
pub struct ParticleSprite;

#[derive(Component)]
pub struct FloaterSprite;

pub fn setup_effect_pools(mut commands: Commands, textures: Res<WorldTextures>) {
    let mut pools = EffectPools::default();
    for _ in 0..PARTICLE_POOL {
        let entity = commands
            .spawn((
                ParticleSprite,
                Sprite {
                    image: textures.circle.clone(),
                    color: Color::WHITE,
                    custom_size: Some(Vec2::splat(4.0)),
                    ..default()
                },
                Transform::from_xyz(0.0, 0.0, 30.0),
                Visibility::Hidden,
            ))
            .id();
        pools.particles.push(entity);
    }
    for _ in 0..FLOATER_POOL {
        let entity = commands
            .spawn((
                FloaterSprite,
                Text2d::new(""),
                TextFont {
                    font_size: FontSize::Px(15.0),
                    ..default()
                },
                TextColor(INK),
                Transform::from_xyz(0.0, 0.0, 40.0),
                Visibility::Hidden,
            ))
            .id();
        pools.floaters.push(entity);
    }
    commands.insert_resource(pools);
}

pub fn sync_particles(
    frame: Res<ViewFrame>,
    pools: Res<EffectPools>,
    textures: Res<WorldTextures>,
    mut sprites: Query<(&mut Sprite, &mut Transform, &mut Visibility), With<ParticleSprite>>,
) {
    let particles = &frame.0.particles;
    for (index, entity) in pools.particles.iter().enumerate() {
        let Ok((mut sprite, mut transform, mut visibility)) = sprites.get_mut(*entity) else {
            continue;
        };
        let Some(particle) = particles.get(index) else {
            *visibility = Visibility::Hidden;
            continue;
        };
        let t = (particle.life / particle.max.max(0.001)).clamp(0.0, 1.0) as f32;
        let mut color = parse_css(&particle.color);
        color = color.with_alpha(color.alpha() * t.min(1.0));
        sprite.color = color;
        let (image, size) = match particle.kind.as_str() {
            "ring" => {
                let radius = particle.size as f32 + (1.0 - t) * 46.0;
                (textures.ring.clone(), Vec2::splat(radius * 2.0))
            }
            "confetti" => (
                textures.square.clone(),
                Vec2::new(particle.size as f32, (particle.size as f32) * 0.5),
            ),
            "dust" => {
                let radius = particle.size as f32 * (0.35 + t * 0.85);
                (textures.circle.clone(), Vec2::splat(radius * 2.0))
            }
            _ => {
                let radius = particle.size as f32 * (0.35 + t * 0.85);
                (textures.circle.clone(), Vec2::splat(radius * 2.0))
            }
        };
        sprite.image = image;
        sprite.custom_size = Some(size);
        transform.translation = world_pos(particle.x, particle.y)
            .extend(30.0 + (1.0 - particle.y as f32 / UI_H) * 10.0);
        transform.rotation = Quat::from_rotation_z(-(particle.spin as f32));
        *visibility = Visibility::Visible;
    }
}

pub fn sync_floaters(
    frame: Res<ViewFrame>,
    pools: Res<EffectPools>,
    mut texts: Query<
        (
            &mut Text2d,
            &mut TextFont,
            &mut TextColor,
            &mut Transform,
            &mut Visibility,
        ),
        With<FloaterSprite>,
    >,
) {
    for (index, entity) in pools.floaters.iter().enumerate() {
        let Ok((mut text, mut font, mut color, mut transform, mut visibility)) =
            texts.get_mut(*entity)
        else {
            continue;
        };
        let Some(floater) = frame.0.floaters.get(index) else {
            *visibility = Visibility::Hidden;
            continue;
        };
        let t = (floater.life / floater.max.max(0.001)).clamp(0.0, 1.0) as f32;
        let pop = 1.0 + (1.0 - t) * 0.18;
        text.0 = floater.text.clone();
        font.font_size = FontSize::Px((floater.size.unwrap_or(15.0) as f32) * pop);
        let mut c = parse_css(&floater.color);
        c = c.with_alpha(c.alpha().min(1.0) * (t * 1.6).min(1.0));
        color.0 = c;
        transform.translation =
            world_pos(floater.x, floater.y).extend(45.0 + (1.0 - floater.y as f32 / UI_H) * 10.0);
        *visibility = Visibility::Visible;
    }
}

pub fn camera_shake(
    frame: Res<ViewFrame>,
    mut camera: Query<&mut Transform, With<Camera2d>>,
    _time: Res<Time>,
) {
    let Ok(mut transform) = camera.single_mut() else {
        return;
    };
    let shake = frame.0.feedback.shake as f32;
    if shake > 0.4 {
        let scale = shake * 0.42;
        transform.translation.x = UI_W * 0.5 + (fastrand::f32() * 2.0 - 1.0) * scale;
        transform.translation.y = UI_H * 0.5 + (fastrand::f32() * 2.0 - 1.0) * scale;
    } else {
        transform.translation.x = UI_W * 0.5;
        transform.translation.y = UI_H * 0.5;
    }
}
