use crate::components::ParticleKind;
use crate::constants::{team_light, team_main, NEAR_MISS, PHYS};
use crate::ecs::Entity;
use crate::math::dist;
use crate::types::SfxEvent;
use crate::world::World;

use super::ball::land_ball;
use super::out::{eliminate, reenter, Cause};
use super::throwing::do_pickup;
use crate::game::effects::{add_floater, burst, drop_glasses, ring};

/// Ball/player and ball/attempt resolution for one substep.
pub fn resolve_collisions(world: &mut World) {
    if world.set.resolved {
        return;
    }

    for ball_entity in world.balls_vec() {
        let (held, live) = match world.ball(ball_entity) {
            Some(ball) => (ball.held_by.is_some(), ball.state.live),
            None => continue,
        };
        if held {
            continue;
        }
        if live {
            check_attempt(world, ball_entity);
        }

        for player_entity in world.players_vec() {
            let Some(player) = world.player(player_entity) else { continue };
            if !player.condition.alive || player.condition.entering_time > 0.0 {
                continue;
            }

            let Some(ball) = world.ball(ball_entity) else { continue };
            if ball.held_by.is_some() {
                break;
            }

            if ball.state.ignore == Some(player_entity) && ball.state.ignore_time > 0.0 {
                continue;
            }

            let rr = player.transform.radius + ball.transform.radius;
            let dx = ball.transform.x - player.transform.x;
            let dy = ball.transform.y - player.transform.y;
            if dx * dx + dy * dy > rr * rr {
                continue;
            }

            let ball_live = ball.state.live;
            let ball_team = ball.state.team;
            let can_out = ball.state.can_out;
            let ball_pickup_cd = ball.state.pickup_cd;
            let ball_rush = ball.state.rush;
            let ball_x = ball.transform.x;
            let player_team = player.tag.team;
            let carry_free = player.carry.is_none();
            let player_pickup_cd = player.cooldowns.pickup_cd;
            let catch_window = player.cooldowns.catch_window;

            if ball_live {
                if ball_team == Some(player_team) {
                    continue;
                }
                if catch_window > 0.0 {
                    do_catch(world, player_entity, ball_entity);
                } else if can_out {
                    do_hit(world, player_entity, ball_entity);
                }
                if world.set.resolved {
                    return;
                }
            } else if carry_free && ball_pickup_cd <= 0.0 && player_pickup_cd <= 0.0 {
                // Rule 13.6.1: during the rush you may only take your own three.
                if world.rush.active && ball_rush && super::is_opponent_side(player_team, ball_x) {
                    continue;
                }
                do_pickup(world, player_entity, ball_entity);
            }
        }
    }
}

/// Rule 16.1: a valid attempt lands or passes within a metre of an opponent,
/// or of where an opponent stood when the ball was released.
pub fn check_attempt(world: &mut World, ball_entity: Entity) {
    let Some(ball) = world.ball(ball_entity) else { return };
    if !ball.state.live || ball.state.valid_attempt {
        return;
    }
    let (bx, by) = (ball.transform.x, ball.transform.y);
    let release_positions = ball.state.release_positions.clone();
    let thrower_team = ball.state.thrower_team;

    let near_release = release_positions
        .iter()
        .any(|pos| dist(bx, by, pos.x, pos.y) < NEAR_MISS);
    let near_player = world.players.iter().any(|(_, player)| {
        player.condition.alive
            && Some(player.tag.team) != thrower_team
            && dist(bx, by, player.transform.x, player.transform.y) < NEAR_MISS
    });

    if near_release || near_player {
        if let Some(ball) = world.ball_mut(ball_entity) {
            ball.state.valid_attempt = true;
        }
    }
}

pub fn do_hit(world: &mut World, player_entity: Entity, ball_entity: Entity) {
    let Some(ball) = world.ball(ball_entity) else { return };
    let color = ball.state.team.map(team_main).unwrap_or("#fbbf24");
    let thrower = ball.state.thrower;

    if let Some(ball) = world.ball_mut(ball_entity) {
        ball.state.valid_attempt = true;
    }
    land_ball(world, ball_entity);
    if let Some(ball) = world.ball_mut(ball_entity) {
        ball.state.pickup_cd = 0.3;
    }

    if let Some(thrower) = thrower {
        if let Some(player) = world.player_mut(thrower) {
            player.stats.outs += 1;
        }
    }

    let Some(player) = world.player(player_entity) else { return };
    let (px, py) = (player.transform.x, player.transform.y);
    let has_glasses = player.condition.has_glasses;

    burst(world, px, py, color, 18, 1.15, ParticleKind::Spark);
    ring(world, px, py, color, 24.0);
    world.feedback.shake = world.feedback.shake.max(10.0);
    world.feedback.flash = world.feedback.flash.max(0.2);

    if has_glasses {
        if let Some(player) = world.player_mut(player_entity) {
            player.condition.has_glasses = false;
        }
        drop_glasses(world, player_entity);
        add_floater(world, px, py - 62.0, "HEADSHOT!", "#ffe9a8", 1.9, Some(34.0));
        add_floater(world, px, py - 30.0, "GLASSES OFF", "#e2e8f0", 1.5, Some(17.0));
        world.feedback.shake = world.feedback.shake.max(15.0);
        world.feedback.flash = world.feedback.flash.max(0.34);
        world.sfx(SfxEvent::Headshot);
    } else {
        world.sfx(SfxEvent::Hit);
    }

    eliminate(world, player_entity, Cause::Hit);
}

pub fn do_catch(world: &mut World, player_entity: Entity, ball_entity: Entity) {
    let Some(player) = world.player(player_entity) else { return };
    let team = player.tag.team;
    let has_ball_in_hand = player.carry.is_some();

    if has_ball_in_hand {
        // Rule 21: a ball in hand is a shield, not a free catch.
        if world.set.sudden_death {
            return; // Rule 9.7.1: no blocking in sudden death
        }
        do_block(world, player_entity, ball_entity);
        return;
    }

    let Some(ball) = world.ball(ball_entity) else { return };
    let thrower = ball.state.thrower;
    let palette = ball.state.team.unwrap_or(team);

    {
        let Some(ball) = world.ball_mut(ball_entity) else { return };
        ball.state.live = false;
        ball.state.team = Some(team);
        ball.state.thrower = None;
        ball.state.thrower_team = None;
        ball.transform.vx = 0.0;
        ball.transform.vy = 0.0;
        ball.trail.points.clear();
        ball.held_by = Some(player_entity);
        ball.state.armed = true;
        ball.state.rush = false;
        ball.state.can_out = true;
        ball.state.valid_attempt = true;
    }

    {
        let Some(player) = world.player_mut(player_entity) else { return };
        player.cooldowns.catch_window = 0.0;
        player.carry = Some(ball_entity);
        player.stats.catches += 1;
    }

    let (px, py) = match world.player(player_entity) {
        Some(player) => (player.transform.x, player.transform.y),
        None => return,
    };

    burst(world, px, py, team_light(palette), 18, 1.1, ParticleKind::Spark);
    ring(world, px, py, team_light(palette), 26.0);
    add_floater(world, px, py - 40.0, "CAUGHT!", team_light(palette), 1.2, None);
    world.feedback.shake = world.feedback.shake.max(7.0);
    world.feedback.flash = world.feedback.flash.max(0.16);
    world.sfx(SfxEvent::Catch);

    // Rule 23.1: the thrower is out. Rule 23.4: a queued teammate re-enters.
    if let Some(thrower) = thrower {
        let thrower_data = world.player(thrower).and_then(|player| {
            player.condition.alive.then_some((
                player.transform.x,
                player.transform.y,
                player.tag.team,
            ))
        });
        if let Some((tx, ty, thrower_team)) = thrower_data {
            add_floater(world, tx, ty - 36.0, "OUT", team_light(thrower_team), 1.1, None);
            eliminate(world, thrower, Cause::Caught);
            if !world.set.resolved {
                reenter(world, team);
            }
        }
    }
}

/// Rule 21.2: a blocked ball remains live.
pub fn do_block(world: &mut World, player_entity: Entity, ball_entity: Entity) {
    let Some(player) = world.player(player_entity) else { return };
    let (px, py) = (player.transform.x, player.transform.y);

    let Some(ball) = world.ball(ball_entity) else { return };
    let (bvx, bvy) = (ball.transform.vx, ball.transform.vy);
    let angle = bvy.atan2(bvx) + std::f64::consts::PI + world.rng.range(-0.55, 0.55);
    let speed = (bvx.hypot(bvy) * PHYS.block_retain).max(PHYS.block_min_speed);

    {
        let Some(ball) = world.ball_mut(ball_entity) else { return };
        ball.transform.vx = angle.cos() * speed;
        ball.transform.vy = angle.sin() * speed;
        ball.state.ignore = Some(player_entity);
        ball.state.ignore_time = 0.26;
        ball.state.valid_attempt = true;
        ball.state.pickup_cd = 0.2;
    }

    if let Some(player) = world.player_mut(player_entity) {
        player.cooldowns.catch_window = 0.0;
    }

    burst(world, px, py, "#dbeafe", 9, 0.8, ParticleKind::Spark);
    ring(world, px, py, "#dbeafe", 18.0);
    add_floater(world, px, py - 38.0, "BLOCK", "#dbeafe", 0.9, None);
    world.feedback.shake = world.feedback.shake.max(4.0);
    world.sfx(SfxEvent::Block);
}
