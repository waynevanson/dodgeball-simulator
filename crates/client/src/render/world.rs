//! World rendering: static court, players, balls, trails, particles and the
//! aim cursor. Every visual is a Bevy sprite, mesh or gizmo; there is no
//! Canvas 2D context anywhere in the client.

use std::collections::HashMap;

use bevy::color::Alpha;
use bevy::math::Isometry2d;
use bevy::prelude::*;
use bevy::sprite::Text2dShadow;
use dodgeball_sim::snapshot::{BallOut, PlayerOut};
use dodgeball_sim::types::Team;

use crate::consts::{
    AMBER, AMBER_LIGHT, ATTACK_LINE, BLUE, COURT_BOTTOM, COURT_CX, COURT_CY, COURT_RIGHT, COURT_W,
    COURT_X, COURT_Y, INK, INK_DIM, INK_FAINT, RED, UI_H, UI_W,
};
use crate::model::{world_pos, ViewFrame};
use crate::render::textures::WorldTextures;

#[derive(Resource, Default)]
pub struct TrailPool {
    pub entities: Vec<Entity>,
}

#[derive(Component)]
pub struct TrailSprite;

#[derive(Resource, Default)]
pub struct PlayerVisuals {
    pub map: HashMap<u32, PlayerVisual>,
}

pub struct PlayerVisual {
    pub root: Entity,
    pub body: Entity,
    pub number: Entity,
    pub you: Entity,
    pub flash: Entity,
    pub glasses: Vec<Entity>,
    pub shadow: Entity,
}

#[derive(Component)]
pub struct PlayerRoot(pub u32);

#[derive(Component)]
pub struct PlayerBody;

#[derive(Component)]
pub struct PlayerNumber;

#[derive(Component)]
pub struct PlayerYou;

#[derive(Component)]
pub struct PlayerFlash;

#[derive(Component)]
pub struct PlayerGlasses(pub Color);

#[derive(Component)]
pub struct PlayerShadow;

#[derive(Resource, Default)]
pub struct BallVisuals {
    pub map: HashMap<u32, BallVisual>,
}

pub struct BallVisual {
    pub root: Entity,
    pub body: Entity,
    pub glow: Entity,
    pub shadow: Entity,
}

#[derive(Component)]
pub struct BallRoot(pub u32);

#[derive(Component)]
pub struct BallBody;

#[derive(Component)]
pub struct BallGlow;

#[derive(Component)]
pub struct BallShadow;

#[derive(Component)]
pub struct CourtLabel;

pub fn setup_world(mut commands: Commands, textures: Res<WorldTextures>) {
    commands.spawn((
        Sprite::from_image(textures.court.clone()),
        Transform::from_xyz(UI_W * 0.5, UI_H * 0.5, -100.0),
    ));

    // Court lettering. Text2d uses the same virtual 1280x720 space as the
    // simulation and the UI.
    court_label(
        &mut commands,
        "BLUE",
        COURT_X + COURT_W * 0.25,
        156.0,
        0.05,
        7.0,
    );
    court_label(
        &mut commands,
        "RED",
        COURT_X + COURT_W * 0.75,
        156.0,
        0.05,
        7.0,
    );
    court_label(
        &mut commands,
        "ATTACK",
        COURT_CX - ATTACK_LINE,
        24.0,
        0.0,
        5.0,
    );
    court_label(
        &mut commands,
        "ATTACK",
        COURT_CX + ATTACK_LINE,
        24.0,
        0.0,
        5.0,
    );
    court_label(&mut commands, "BACK LINE", COURT_X + 46.0, 10.0, 0.0, 5.0);
    court_label(
        &mut commands,
        "BACK LINE",
        COURT_RIGHT - 46.0,
        10.0,
        0.0,
        5.0,
    );

    let mut trails = TrailPool::default();
    for _ in 0..320 {
        let entity = commands
            .spawn((
                TrailSprite,
                Sprite {
                    image: textures.circle.clone(),
                    color: Color::WHITE,
                    custom_size: Some(Vec2::splat(4.0)),
                    ..default()
                },
                Transform::from_xyz(0.0, 0.0, 5.0),
                Visibility::Hidden,
            ))
            .id();
        trails.entities.push(entity);
    }
    commands.insert_resource(trails);
}

fn court_label(commands: &mut Commands, text: &str, x: f32, size: f32, alpha: f32, z: f32) {
    let y = match text {
        "BLUE" | "RED" => COURT_CY + 8.0,
        "ATTACK" => COURT_Y + 24.0,
        _ => COURT_BOTTOM - 16.0,
    };
    let color = match text {
        "BLUE" => BLUE.main.with_alpha(alpha),
        "RED" => RED.main.with_alpha(alpha),
        _ => INK_FAINT.with_alpha(0.4),
    };
    let size = if text == "ATTACK" || text == "BACK LINE" {
        9.0
    } else {
        size
    };
    commands.spawn((
        CourtLabel,
        Text2d::new(text),
        TextFont {
            font_size: FontSize::Px(size),
            ..default()
        },
        TextColor(color),
        Transform::from_translation(world_pos(x as f64, y as f64).extend(z)),
    ));
}

fn player_texture(textures: &WorldTextures, team: Team) -> Handle<Image> {
    match team {
        Team::Blue => textures.player_blue.clone(),
        Team::Red => textures.player_red.clone(),
    }
}

fn spawn_player(
    commands: &mut Commands,
    textures: &WorldTextures,
    view: &PlayerOut,
) -> PlayerVisual {
    let radius = view.transform.radius as f32;
    let root = commands
        .spawn((
            PlayerRoot(view.id),
            Transform::from_translation(world_pos(view.transform.x, view.transform.y).extend(20.0)),
            Visibility::Visible,
        ))
        .id();

    let shadow = commands
        .spawn((
            PlayerShadow,
            Sprite {
                image: textures.circle.clone(),
                color: Color::srgba(0.0, 0.0, 0.0, 0.38),
                custom_size: Some(Vec2::new(radius * 1.96, radius * 0.92)),
                ..default()
            },
            Transform::from_xyz(1.0, -radius * 0.8, 1.0),
            ChildOf(root),
        ))
        .id();

    let body = commands
        .spawn((
            PlayerBody,
            Sprite {
                image: player_texture(textures, view.tag.team),
                custom_size: Some(Vec2::splat(radius * 2.0)),
                ..default()
            },
            Transform::from_xyz(0.0, 0.0, 10.0),
            ChildOf(root),
        ))
        .id();

    let flash = commands
        .spawn((
            PlayerFlash,
            Sprite {
                image: textures.circle.clone(),
                color: Color::srgba(1.0, 1.0, 1.0, 0.0),
                custom_size: Some(Vec2::splat(radius * 2.0)),
                ..default()
            },
            Transform::from_xyz(0.0, 0.0, 12.0),
            ChildOf(root),
        ))
        .id();

    let number = commands
        .spawn((
            PlayerNumber,
            Text2d::new(view.tag.number.to_string()),
            TextFont {
                font_size: FontSize::Px(12.0),
                ..default()
            },
            TextColor(Color::srgba(0.98, 0.99, 1.0, 0.92)),
            Text2dShadow {
                offset: Vec2::new(0.0, -1.0),
                color: Color::srgba(0.0, 0.0, 0.0, 0.8),
            },
            Transform::from_xyz(0.0, 0.0, 30.0),
            ChildOf(root),
        ))
        .id();

    let you = commands
        .spawn((
            PlayerYou,
            Text2d::new("YOU"),
            TextFont {
                font_size: FontSize::Px(9.0),
                ..default()
            },
            TextColor(INK.with_alpha(0.0)),
            Transform::from_xyz(0.0, -radius - 20.0, 16.0),
            ChildOf(root),
        ))
        .id();

    let mut glasses = Vec::new();
    for x in [-5.0_f32, 5.0_f32] {
        let outline = commands
            .spawn((
                PlayerGlasses(Color::srgba(0.03, 0.06, 0.12, 0.9)),
                Sprite {
                    image: textures.circle.clone(),
                    color: Color::srgba(0.03, 0.06, 0.12, 0.9),
                    custom_size: Some(Vec2::splat(10.0)),
                    ..default()
                },
                Transform::from_xyz(x, radius * 0.56, 13.0),
                ChildOf(root),
            ))
            .id();
        let lens = commands
            .spawn((
                PlayerGlasses(Color::srgba(0.75, 0.86, 1.0, 0.38)),
                Sprite {
                    image: textures.circle.clone(),
                    color: Color::srgba(0.75, 0.86, 1.0, 0.38),
                    custom_size: Some(Vec2::splat(7.5)),
                    ..default()
                },
                Transform::from_xyz(x, radius * 0.56, 14.0),
                ChildOf(root),
            ))
            .id();
        glasses.push(outline);
        glasses.push(lens);
    }
    let bridge = commands
        .spawn((
            PlayerGlasses(Color::srgba(0.03, 0.06, 0.12, 0.9)),
            Sprite {
                image: textures.square.clone(),
                color: Color::srgba(0.03, 0.06, 0.12, 0.9),
                custom_size: Some(Vec2::new(4.0, 1.5)),
                ..default()
            },
            Transform::from_xyz(0.0, radius * 0.56, 14.0),
            ChildOf(root),
        ))
        .id();
    glasses.push(bridge);

    PlayerVisual {
        root,
        body,
        number,
        you,
        flash,
        glasses,
        shadow,
    }
}

pub fn sync_players(
    mut commands: Commands,
    textures: Res<WorldTextures>,
    frame: Res<ViewFrame>,
    mut visuals: ResMut<PlayerVisuals>,
    mut roots: Query<(&PlayerRoot, &mut Transform, &mut Visibility)>,
    mut sprites: Query<&mut Sprite>,
    mut texts: Query<(&mut Text2d, &mut TextColor)>,
    glasses_query: Query<&PlayerGlasses>,
) {
    for view in &frame.0.players {
        if !visuals.map.contains_key(&view.id) {
            let visual = spawn_player(&mut commands, &textures, view);
            visuals.map.insert(view.id, visual);
        }
        let Some(visual) = visuals.map.get(&view.id) else {
            continue;
        };
        let radius = view.transform.radius as f32;
        let entering = view.condition.entering_time > 0.0;
        let alpha = if entering { 0.55 } else { 1.0 };
        let team = view.tag.team;
        let palette = match team {
            Team::Blue => &BLUE,
            Team::Red => &RED,
        };

        if let Ok((_, mut transform, mut visibility)) = roots.get_mut(visual.root) {
            transform.translation = world_pos(view.transform.x, view.transform.y)
                .extend(20.0 + (1.0 - view.transform.y as f32 / UI_H) * 10.0);
            *visibility = if view.condition.alive {
                Visibility::Visible
            } else {
                Visibility::Hidden
            };
        }

        if let Ok(mut sprite) = sprites.get_mut(visual.body) {
            sprite.image = player_texture(&textures, team);
            sprite.custom_size = Some(Vec2::splat(radius * 2.0));
            sprite.color = Color::srgba(1.0, 1.0, 1.0, alpha);
        }
        if let Ok(mut sprite) = sprites.get_mut(visual.shadow) {
            sprite.custom_size = Some(Vec2::new(radius * 1.96, radius * 0.92));
        }
        if let Ok(mut sprite) = sprites.get_mut(visual.flash) {
            sprite.custom_size = Some(Vec2::splat(radius * 2.0));
            sprite.color = Color::srgba(
                1.0,
                1.0,
                1.0,
                (view.condition.hit_flash as f32).clamp(0.0, 0.85),
            );
        }
        for entity in &visual.glasses {
            if let Ok(mut sprite) = sprites.get_mut(*entity) {
                if let Ok(glasses) = glasses_query.get(*entity) {
                    sprite.color = glasses.0.with_alpha(if view.condition.has_glasses {
                        0.38 + 0.52 * alpha
                    } else {
                        0.0
                    });
                }
            }
        }
        if let Ok((mut text, mut color)) = texts.get_mut(visual.number) {
            text.0 = view.tag.number.to_string();
            color.0 = Color::srgba(0.98, 0.99, 1.0, 0.92 * alpha);
        }
        if let Ok((mut text, mut color)) = texts.get_mut(visual.you) {
            text.0 = "YOU".to_string();
            color.0 = palette
                .light
                .with_alpha(if view.tag.is_you { 0.7 } else { 0.0 });
        }
    }
}

fn spawn_ball(commands: &mut Commands, textures: &WorldTextures, view: &BallOut) -> BallVisual {
    let radius = view.transform.radius as f32;
    let root = commands
        .spawn((
            BallRoot(view.id),
            Transform::from_translation(world_pos(view.transform.x, view.transform.y).extend(25.0)),
            Visibility::Visible,
        ))
        .id();
    let shadow = commands
        .spawn((
            BallShadow,
            Sprite {
                image: textures.circle.clone(),
                color: Color::srgba(0.0, 0.0, 0.0, 0.34),
                custom_size: Some(Vec2::new(radius * 1.9, radius * 1.0)),
                ..default()
            },
            Transform::from_xyz(2.0, -radius * 0.62, 1.0),
            ChildOf(root),
        ))
        .id();
    let body = commands
        .spawn((
            BallBody,
            Sprite {
                image: textures.ball_cold.clone(),
                custom_size: Some(Vec2::splat(radius * 2.0)),
                ..default()
            },
            Transform::from_xyz(0.0, 0.0, 10.0),
            ChildOf(root),
        ))
        .id();
    let glow = commands
        .spawn((
            BallGlow,
            Sprite {
                image: textures.glow.clone(),
                color: Color::srgba(1.0, 1.0, 1.0, 0.0),
                custom_size: Some(Vec2::splat(radius * 5.0)),
                ..default()
            },
            Transform::from_xyz(0.0, 0.0, 9.0),
            ChildOf(root),
        ))
        .id();
    BallVisual {
        root,
        body,
        glow,
        shadow,
    }
}

pub fn sync_balls(
    mut commands: Commands,
    textures: Res<WorldTextures>,
    frame: Res<ViewFrame>,
    mut visuals: ResMut<BallVisuals>,
    mut roots: Query<(&BallRoot, &mut Transform, &mut Visibility), Without<BallBody>>,
    mut sprites: Query<&mut Sprite>,
    mut bodies: Query<&mut Transform, With<BallBody>>,
) {
    for view in &frame.0.balls {
        if !visuals.map.contains_key(&view.id) {
            let visual = spawn_ball(&mut commands, &textures, view);
            visuals.map.insert(view.id, visual);
        }
        let Some(visual) = visuals.map.get(&view.id) else {
            continue;
        };
        let radius = view.transform.radius as f32;
        let dangerous = view.state.live && view.state.can_out;
        let warm = dangerous || (view.held.by.is_some() && view.state.armed);
        if let Ok((_, mut transform, mut visibility)) = roots.get_mut(visual.root) {
            transform.translation = world_pos(view.transform.x, view.transform.y)
                .extend(25.0 + (1.0 - view.transform.y as f32 / UI_H) * 10.0);
            *visibility = Visibility::Visible;
        }
        if let Ok(mut sprite) = sprites.get_mut(visual.body) {
            sprite.image = if warm {
                textures.ball_warm.clone()
            } else {
                textures.ball_cold.clone()
            };
            sprite.custom_size = Some(Vec2::splat(radius * 2.0));
            sprite.color = Color::WHITE;
        }
        if let Ok(mut sprite) = sprites.get_mut(visual.glow) {
            sprite.custom_size = Some(Vec2::splat(radius * (if dangerous { 6.0 } else { 3.5 })));
            sprite.color = AMBER.with_alpha(if dangerous { 0.32 } else { 0.0 });
        }
        if let Ok(mut sprite) = sprites.get_mut(visual.shadow) {
            sprite.custom_size = Some(Vec2::new(radius * 1.9, radius * 1.0));
        }
        // The stripe is baked into the texture; rotate the body sprite to show
        // spin without rotating the shadow.
        if let Ok(mut transform) = bodies.get_mut(visual.body) {
            transform.rotation = Quat::from_rotation_z(-(view.tag.spin as f32));
        }
    }
}

/// Dynamic outlines, trails, glasses and court annotations.
pub fn draw_dynamic(
    mut gizmos: Gizmos,
    frame: Res<ViewFrame>,
    input: Res<crate::input::InputState>,
    client: Res<crate::model::ClientState>,
    time: Res<Time>,
) {
    let f = &frame.0;
    let now = time.elapsed_secs() as f64;

    for player in &f.players {
        let p = world_pos(player.transform.x, player.transform.y);
        let radius = player.transform.radius as f32;
        if !player.condition.alive {
            let x = world_pos(player.condition.out_x, player.condition.out_y);
            let fade =
                (1.0 - (f.clock.sim - player.condition.out_at) / 2.2).clamp(0.25, 1.0) as f32;
            let color = INK_DIM.with_alpha(0.3 * fade);
            gizmos.circle_2d(Isometry2d::from_translation(x), 15.0, color);
            gizmos.line_2d(x + Vec2::new(-6.5, -6.5), x + Vec2::new(6.5, 6.5), color);
            gizmos.line_2d(x + Vec2::new(6.5, -6.5), x + Vec2::new(-6.5, 6.5), color);
            continue;
        }

        // Facing wedge.
        let facing = -(player.transform.facing as f32);
        let dir = Vec2::new(facing.cos(), facing.sin());
        gizmos.line_2d(p, p + dir * (radius * 0.92), INK.with_alpha(0.3));

        if player.cooldowns.catch_window > 0.0 {
            let k = 1.0 - player.cooldowns.catch_window as f32 / 0.32;
            gizmos.circle_2d(
                Isometry2d::from_translation(p),
                radius + 7.0 + k * 16.0,
                INK.with_alpha(0.6 * (1.0 - k)),
            );
        }
        if player.condition.entering_time > 0.0 {
            gizmos.circle_2d(
                Isometry2d::from_translation(p),
                radius + 6.0,
                INK.with_alpha(0.55),
            );
        }
        if player.action.charging {
            let charge = (player.action.charge as f32).clamp(0.0, 1.0);
            gizmos.arc_2d(
                Isometry2d::from_translation(p),
                std::f32::consts::TAU * charge,
                radius + 8.0,
                if charge > 0.985 { AMBER_LIGHT } else { AMBER },
            );
            let len = 60.0 + 250.0 * charge;
            let offset = radius + 11.0;
            let start = p + dir * offset;
            let end = start + dir * len;
            gizmos.line_2d(start, end, AMBER.with_alpha(0.4));
        }
        if player.tag.is_you {
            let pulse = (now as f32 * 4.0).sin() * 1.6;
            gizmos.circle_2d(
                Isometry2d::from_translation(p),
                radius + 10.0 + pulse,
                INK.with_alpha(0.42),
            );
        }
    }

    for ball in &f.balls {
        let p = world_pos(ball.transform.x, ball.transform.y);
        let radius = ball.transform.radius as f32;
        if !ball.state.armed {
            let pulse = (f.clock.sim as f32 * 2.3 + ball.tag.bob as f32).sin() * 0.5 + 0.5;
            gizmos.circle_2d(
                Isometry2d::from_translation(p),
                radius + 5.0 + pulse * 2.0,
                INK.with_alpha(0.1 + pulse * 0.14),
            );
        }
    }

    for glasses in &f.glasses {
        let p = world_pos(glasses.x, glasses.y);
        let angle = -(glasses.rot as f32);
        let dir = Vec2::new(angle.cos(), angle.sin());
        let side = Vec2::new(-dir.y, dir.x);
        gizmos.line_2d(p - side * 9.0, p + side * 9.0, INK.with_alpha(0.55));
        gizmos.circle_2d(
            Isometry2d::from_translation(p - side * 6.0),
            4.0,
            INK.with_alpha(0.5),
        );
        gizmos.circle_2d(
            Isometry2d::from_translation(p + side * 6.0),
            4.0,
            INK.with_alpha(0.5),
        );
    }

    if client.screen != crate::model::UiScreen::None {
        return;
    }
    if !client.show_touch && input.mouse_used {
        let p = world_pos(input.design.x as f64, input.design.y as f64);
        gizmos.circle_2d(Isometry2d::from_translation(p), 11.0, INK.with_alpha(0.5));
        gizmos.line_2d(
            p + Vec2::new(-16.0, 0.0),
            p + Vec2::new(16.0, 0.0),
            INK.with_alpha(0.35),
        );
        gizmos.line_2d(
            p + Vec2::new(0.0, -16.0),
            p + Vec2::new(0.0, 16.0),
            INK.with_alpha(0.35),
        );
    }
}

pub fn sync_trails(
    frame: Res<ViewFrame>,
    textures: Res<WorldTextures>,
    pool: Res<TrailPool>,
    mut sprites: Query<(&mut Sprite, &mut Transform, &mut Visibility), With<TrailSprite>>,
) {
    let mut index = 0usize;
    for player in &frame.0.players {
        for point in &player.trail.points {
            if index >= pool.entities.len() {
                break;
            }
            let entity = pool.entities[index];
            index += 1;
            if let Ok((mut sprite, mut transform, mut visibility)) = sprites.get_mut(entity) {
                let color = match player.tag.team {
                    Team::Blue => BLUE.main,
                    Team::Red => RED.main,
                };
                sprite.image = textures.circle.clone();
                sprite.color = color.with_alpha(0.05 + point.a as f32 * 0.2);
                sprite.custom_size = Some(Vec2::splat(
                    player.transform.radius as f32 * (0.5 + point.a as f32 * 0.45) * 2.0,
                ));
                transform.translation = world_pos(point.x, point.y).extend(5.0);
                *visibility = Visibility::Visible;
            }
        }
    }
    for ball in &frame.0.balls {
        for point in &ball.trail.points {
            if index >= pool.entities.len() {
                break;
            }
            let entity = pool.entities[index];
            index += 1;
            if let Ok((mut sprite, mut transform, mut visibility)) = sprites.get_mut(entity) {
                let color = if ball.state.can_out { AMBER } else { INK_DIM };
                sprite.image = textures.circle.clone();
                sprite.color = color.with_alpha(0.04 + point.a as f32 * 0.16);
                sprite.custom_size = Some(Vec2::splat(ball.transform.radius as f32 * 1.7));
                transform.translation = world_pos(point.x, point.y).extend(15.0);
                *visibility = Visibility::Visible;
            }
        }
    }
    for entity in pool.entities.iter().skip(index) {
        if let Ok((_, _, mut visibility)) = sprites.get_mut(*entity) {
            *visibility = Visibility::Hidden;
        }
    }
}
