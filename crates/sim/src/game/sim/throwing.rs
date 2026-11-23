use crate::constants::PHYS;
use crate::ecs::Entity;
use crate::math::clamp;
use crate::types::SfxEvent;
use crate::world::World;

use super::rules::end_rush;
use crate::game::effects::burst;
use crate::components::ParticleKind;

pub fn throw_ball(world: &mut World, entity: Entity) {
    let Some(ball_entity) = world.carried_ball(entity) else { return };
    let Some(player) = world.player(entity) else { return };

    let (px, py, pvx, pvy, facing, radius, charge, team) = (
        player.transform.x,
        player.transform.y,
        player.transform.vx,
        player.transform.vy,
        player.transform.facing,
        player.transform.radius,
        player.action.charge,
        player.tag.team,
    );
    let ball_radius = world
        .ball(ball_entity)
        .map(|ball| ball.transform.radius)
        .unwrap_or(10.0);

    let power = clamp(charge, 0.0, 1.0);
    let speed = PHYS.throw_min + (PHYS.throw_max - PHYS.throw_min) * power;
    let cos = facing.cos();
    let sin = facing.sin();

    let release_positions: Vec<crate::components::Pos> = world
        .players
        .iter()
        .filter(|(_, other)| other.condition.alive && other.tag.team != team)
        .map(|(_, other)| crate::components::Pos {
            x: other.transform.x,
            y: other.transform.y,
        })
        .collect();

    let (bx, by) = {
        let Some(ball) = world.ball_mut(ball_entity) else { return };
        ball.held_by = None;
        ball.transform.x = px + cos * (radius + ball_radius + 1.0);
        ball.transform.y = py + sin * (radius + ball_radius + 1.0);
        ball.transform.vx = cos * speed + pvx * 0.25;
        ball.transform.vy = sin * speed + pvy * 0.25;
        ball.state.live = true;
        ball.state.team = Some(team);
        ball.state.thrower = Some(entity);
        ball.state.thrower_team = Some(team);
        ball.tag.age = 0.0;
        ball.state.pickup_cd = 0.18;
        ball.trail.points.clear();
        ball.state.can_out = ball.state.armed;
        ball.state.rush = false;
        ball.state.valid_attempt = false;
        ball.state.warning_issued = false;
        ball.state.release_positions = release_positions;
        ball.state.ignore = None;
        ball.state.ignore_time = 0.0;
        (ball.transform.x, ball.transform.y)
    };

    if let Some(player) = world.player_mut(entity) {
        player.carry = None;
        player.action.charge = 0.0;
        player.action.charging = false;
        player.cooldowns.throw_cd = PHYS.throw_cd;
        player.stats.throws += 1;
    }

    // Any throw ends the opening rush (Rule 13.6) and resets the shot clock
    // (Rule 17.3.1).
    end_rush(world);
    world.last_throw.team = Some(team);
    world.reset_shot_clock();

    burst(
        world,
        bx,
        by,
        crate::constants::team_light(team),
        5,
        0.5,
        ParticleKind::Spark,
    );
    world.sfx(SfxEvent::Throw(power));
}

pub fn do_pickup(world: &mut World, player_entity: Entity, ball_entity: Entity) {
    let (bx, by, team) = match (world.ball(ball_entity), world.player(player_entity)) {
        (Some(ball), Some(player)) => (ball.transform.x, ball.transform.y, player.tag.team),
        _ => return,
    };

    if let Some(ball) = world.ball_mut(ball_entity) {
        ball.held_by = Some(player_entity);
        ball.state.live = false;
        ball.state.team = Some(team);
        ball.state.thrower = None;
        ball.state.touched = true;
        ball.state.armed = !ball.state.rush;
        ball.state.can_out = true;
        ball.state.thrower_team = None;
        ball.state.valid_attempt = false;
        ball.state.warning_issued = false;
        ball.transform.vx = 0.0;
        ball.transform.vy = 0.0;
        ball.trail.points.clear();
    }

    if let Some(player) = world.player_mut(player_entity) {
        player.carry = Some(ball_entity);
        player.action.charging = false;
        player.action.charge = 0.0;
    }

    burst(world, bx, by, "#fcd34d", 5, 0.4, ParticleKind::Spark);
    world.sfx(SfxEvent::Pickup);
}

pub fn drop_ball(world: &mut World, ball_entity: Entity, x: f64, y: f64) {
    let vx = world.rng.range(-90.0, 90.0);
    let vy = world.rng.range(-90.0, 90.0);
    if let Some(ball) = world.ball_mut(ball_entity) {
        ball.held_by = None;
        ball.state.live = false;
        ball.state.team = None;
        ball.state.thrower = None;
        ball.state.thrower_team = None;
        ball.transform.x = x;
        ball.transform.y = y;
        ball.transform.vx = vx;
        ball.transform.vy = vy;
        ball.state.pickup_cd = 0.4;
        ball.state.armed = true;
        ball.state.rush = false;
    }
}

/// Rule 13.7: a rushed ball arms once carried behind the attack line.
pub fn arm_ball(world: &mut World, player_entity: Entity) {
    let Some(ball_entity) = world.carried_ball(player_entity) else { return };
    let (x, y) = match world.player(player_entity) {
        Some(player) => (player.transform.x, player.transform.y),
        None => return,
    };
    if let Some(ball) = world.ball_mut(ball_entity) {
        if ball.state.armed {
            return;
        }
        ball.state.armed = true;
    }
    crate::game::effects::add_floater(world, x, y - 42.0, "ARMED", "#ffe9a8", 0.85, None);
    crate::game::effects::ring(world, x, y, "#fbbf24", 18.0);
    world.sfx(SfxEvent::Pickup);
}
