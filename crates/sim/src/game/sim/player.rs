use crate::constants::{COURT, PHYS};
use crate::ecs::Entity;
use crate::math::{damp, norm};
use crate::world::World;

use super::{bounds, throwing};

/// One fixed substep for one player. Timers, charge, dash and movement.
pub fn step_player(world: &mut World, entity: Entity, dt: f64) {
    let team = match world.player(entity) {
        Some(player) => player.tag.team,
        None => return,
    };
    let area = bounds(world, team);

    let mut throw_now = false;
    let mut dash_now = false;

    {
        let Some(player) = world.players.get_mut(entity) else { return };
        let can_play = player.condition.entering_time <= 0.0;

        player.condition.entering_time = (player.condition.entering_time - dt).max(0.0);
        player.action.dash_cd = (player.action.dash_cd - dt).max(0.0);
        player.cooldowns.throw_cd = (player.cooldowns.throw_cd - dt).max(0.0);
        player.cooldowns.catch_cd = (player.cooldowns.catch_cd - dt).max(0.0);
        player.cooldowns.catch_window = (player.cooldowns.catch_window - dt).max(0.0);
        player.cooldowns.pickup_cd = (player.cooldowns.pickup_cd - dt).max(0.0);
        player.condition.hit_flash = (player.condition.hit_flash - dt * 3.0).max(0.0);

        if player.intent.aim.is_finite() {
            player.transform.facing = player.intent.aim;
        }

        if player.intent.catch && can_play {
            let ready = player.cooldowns.catch_cd <= 0.0
                && player.cooldowns.catch_window <= 0.0
                && player.condition.entering_time <= 0.0;
            if ready {
                player.cooldowns.catch_window = PHYS.catch_window;
                player.cooldowns.catch_cd = PHYS.catch_cd;
                world.events.push(crate::types::SfxEvent::CatchStart);
            }
        }

        let direction = norm(player.intent.mx, player.intent.my);
        let moving = direction.l > 0.06;

        if player.intent.dash && can_play && player.action.dash_cd <= 0.0 {
            player.action.dash_cd = PHYS.dash_cd;
            player.action.dash_time = PHYS.dash_time;
            player.action.dash_x = if moving {
                direction.x
            } else {
                player.transform.facing.cos()
            };
            player.action.dash_y = if moving {
                direction.y
            } else {
                player.transform.facing.sin()
            };
            dash_now = true;
        }

        if can_play && player.action.charging && player.intent.release && player.carry.is_some() {
            throw_now = true;
        } else if can_play && player.intent.charge && player.carry.is_some() {
            player.action.charging = true;
            player.action.charge = (player.action.charge + dt / PHYS.charge_time).min(1.0);
        } else if player.action.charging {
            player.action.charging = false;
            player.action.charge = 0.0;
        }

        let slow = if player.action.charging { 0.68 } else { 1.0 }
            * if player.cooldowns.catch_window > 0.0 { 0.6 } else { 1.0 };

        if player.action.dash_time > 0.0 {
            player.action.dash_time = (player.action.dash_time - dt).max(0.0);
            let k = player.action.dash_time / PHYS.dash_time;
            let mul = 0.35 + 0.65 * k;
            player.transform.vx = player.action.dash_x * PHYS.dash_speed * mul;
            player.transform.vy = player.action.dash_y * PHYS.dash_speed * mul;
            player.trail.points.push(crate::components::TrailPoint {
                x: player.transform.x,
                y: player.transform.y,
                a: 0.8,
            });
            if player.trail.points.len() > 12 {
                player.trail.points.remove(0);
            }
        } else {
            let speed = player.brain.diff.map(|diff| diff.speed).unwrap_or(1.0);
            let max_v = PHYS.speed * speed * slow;
            player.transform.vx = damp(player.transform.vx, direction.x * max_v, 15.0, dt);
            player.transform.vy = damp(player.transform.vy, direction.y * max_v, 15.0, dt);
        }

        let mut kept = Vec::with_capacity(player.trail.points.len());
        for point in &player.trail.points {
            let a = point.a - dt * 3.5;
            if a > 0.0 {
                kept.push(crate::components::TrailPoint { x: point.x, y: point.y, a });
            }
        }
        player.trail.points = kept;

        player.transform.x += player.transform.vx * dt;
        player.transform.y += player.transform.vy * dt;

        // Stay in your own half (with a little leeway during the opening rush).
        let radius = player.transform.radius;
        if player.transform.x < area.min_x + radius {
            player.transform.x = area.min_x + radius;
            if player.transform.vx < 0.0 {
                player.transform.vx = 0.0;
            }
        } else if player.transform.x > area.max_x - radius {
            player.transform.x = area.max_x - radius;
            if player.transform.vx > 0.0 {
                player.transform.vx = 0.0;
            }
        }
        if player.transform.y < COURT.y + radius {
            player.transform.y = COURT.y + radius;
            if player.transform.vy < 0.0 {
                player.transform.vy = 0.0;
            }
        } else if player.transform.y > COURT.bottom - radius {
            player.transform.y = COURT.bottom - radius;
            if player.transform.vy > 0.0 {
                player.transform.vy = 0.0;
            }
        }
    }

    if dash_now {
        super::super::effects::on_dash(world, entity);
    }
    if throw_now {
        throwing::throw_ball(world, entity);
    }
}
