use crate::components::ParticleKind;
use crate::constants::*;
use crate::types::{SfxEvent, Team};
use crate::world::World;

use super::throwing::arm_ball;
use crate::game::effects::{add_floater, burst};
use crate::game::spawn::spawns;

/// Rule 13.7.1: arm every carried rushed ball that is now behind the line.
pub fn update_arming(world: &mut World) {
    for entity in world.players_vec() {
        let Some(player) = world.player(entity) else { continue };
        if !player.condition.alive {
            continue;
        }
        let armed = player
            .carry
            .and_then(|ball_entity| world.ball(ball_entity))
            .map(|ball| ball.state.armed)
            .unwrap_or(true);
        if armed {
            continue;
        }
        if super::behind_attack_line(player) {
            arm_ball(world, entity);
        }
    }
}

pub fn update_rush(world: &mut World) {
    if !world.rush.active {
        return;
    }
    let all_touched = world.balls.iter().all(|(_, ball)| ball.state.touched);
    if all_touched {
        end_rush(world);
    }
}

pub fn end_rush(world: &mut World) {
    if !world.rush.active {
        return;
    }
    world.rush.active = false;
    for entity in world.balls_vec() {
        let Some(ball) = world.ball_mut(entity) else { continue };
        // Balls still on the floor are ordinary dead balls now.
        if ball.held_by.is_none() {
            ball.state.rush = false;
            ball.state.armed = true;
        }
    }
}

pub fn update_shot_clock(world: &mut World, dt: f64) {
    let advantage = world.advantage_team();
    if advantage != world.shot.team {
        world.shot.team = advantage;
        world.shot.clock = SHOT_CLOCK;
        world.shot.beep = 99;
    }
    let Some(team) = advantage else { return };

    world.shot.clock = (world.shot.clock - dt).max(0.0);
    let secs = world.shot.clock.ceil() as i32;
    if secs != world.shot.beep && secs <= SHOT_CLOCK_WARN as i32 && secs > 0 {
        world.shot.beep = secs;
        world.sfx(SfxEvent::Beep(secs == 1));
    }
    if world.shot.clock <= 0.0 {
        forfeit_possession(world, team);
    }
}

/// Rule 17.3.3: ten seconds without an attempt forfeits every held ball.
pub fn forfeit_possession(world: &mut World, team: Team) {
    let opponent = team.other();
    let drop_x = match opponent {
        Team::Blue => COURT.cx - ATTACK_DIST - 80.0,
        Team::Red => COURT.cx + ATTACK_DIST + 80.0,
    };

    let held: Vec<(crate::ecs::Entity, crate::ecs::Entity)> = world
        .players
        .iter()
        .filter(|(_, player)| player.tag.team == team && player.carry.is_some())
        .filter_map(|(entity, player)| player.carry.map(|ball| (entity, ball)))
        .collect();

    for (player_entity, ball_entity) in held {
        if let Some(player) = world.player_mut(player_entity) {
            player.carry = None;
            player.action.charging = false;
            player.action.charge = 0.0;
        }
        let y = world.rng.range(COURT.y + 90.0, COURT.bottom - 90.0);
        let (bx, by) = {
            let Some(ball) = world.ball_mut(ball_entity) else { continue };
            ball.held_by = None;
            ball.state.live = false;
            ball.state.team = None;
            ball.state.armed = true;
            ball.state.rush = false;
            ball.state.thrower = None;
            ball.state.thrower_team = None;
            ball.transform.x = drop_x;
            ball.transform.y = y;
            ball.transform.vx = 0.0;
            ball.transform.vy = 0.0;
            ball.state.pickup_cd = 0.2;
            (ball.transform.x, ball.transform.y)
        };
        burst(world, bx, by, team_light(opponent), 8, 0.7, ParticleKind::Spark);
    }

    line_up(world);
    add_floater(world, COURT.cx, COURT.cy - 10.0, "10s — BALLS FORFEITED", "#fbbf24", 1.8, None);
    add_floater(world, COURT.cx, COURT.cy + 24.0, "LINE UP", "#e2e8f0", 1.6, None);
    world.feedback.shake = world.feedback.shake.max(8.0);
    world.sfx(SfxEvent::Whistle);
    world.reset_shot_clock();
}

pub fn line_up(world: &mut World) {
    for entity in world.players_vec() {
        let (x, y) = match world.player(entity) {
            Some(player) if player.condition.alive => {
                spawns(player.tag.team)[player.tag.slot]
            }
            _ => continue,
        };
        if let Some(player) = world.player_mut(entity) {
            player.transform.x = x;
            player.transform.y = y;
            player.transform.vx = 0.0;
            player.transform.vy = 0.0;
            player.action.charging = false;
            player.action.charge = 0.0;
            player.cooldowns.catch_window = 0.0;
            player.trail.points.clear();
        }
    }
}

pub fn enter_sudden_death(world: &mut World) {
    world.set.sudden_death = true;
    add_floater(world, COURT.cx, COURT.cy - 40.0, "SUDDEN DEATH", "#ff8a9a", 2.4, None);
    add_floater(
        world,
        COURT.cx,
        COURT.cy + 2.0,
        "BLOCKING DISABLED",
        "rgba(255,194,202,0.9)",
        2.4,
        None,
    );
    world.feedback.shake = world.feedback.shake.max(7.0);
    world.sfx(SfxEvent::Whistle);
}
