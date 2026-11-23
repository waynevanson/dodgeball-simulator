use crate::constants::COURT;
use crate::math::clamp;
use crate::world::World;

use super::ball::step_ball;
use super::bounds;
use super::contacts::resolve_collisions;
use super::player::step_player;

pub fn simulate(world: &mut World, dt: f64, frozen: bool) {
    let steps = ((dt / (1.0 / 120.0)).ceil() as usize).max(1);
    let sdt = dt / steps as f64;

    for _ in 0..steps {
        if !frozen {
            for entity in world.players_vec() {
                let alive = world
                    .player(entity)
                    .map(|player| player.condition.alive)
                    .unwrap_or(false);
                if alive {
                    step_player(world, entity, sdt);
                }
            }
            separate_players(world);
        }

        for entity in world.balls_vec() {
            step_ball(world, entity, sdt);
        }

        if !frozen && !world.set.resolved {
            resolve_collisions(world);
        }
    }
}

pub fn separate_players(world: &mut World) {
    let list = world.players_vec();

    for i in 0..list.len() {
        let a_entity = list[i];
        let Some((ax, ay, ar, a_alive)) = world
            .player(a_entity)
            .map(|a| (a.transform.x, a.transform.y, a.transform.radius, a.condition.alive))
        else {
            continue;
        };
        if !a_alive {
            continue;
        }

        for b_entity in list.iter().skip(i + 1) {
            let Some((bx, by, br, b_alive)) = world
                .player(*b_entity)
                .map(|b| (b.transform.x, b.transform.y, b.transform.radius, b.condition.alive))
            else {
                continue;
            };
            if !b_alive {
                continue;
            }

            let mut dx = bx - ax;
            let mut dy = by - ay;
            let mut d = dx.hypot(dy);
            let min = ar + br;
            if d >= min {
                continue;
            }
            if d < 0.001 {
                dx = world.rng.range(-1.0, 1.0);
                dy = world.rng.range(-1.0, 1.0);
                d = dx.hypot(dy);
                if d == 0.0 {
                    d = 1.0;
                }
            }
            let push = (min - d) * 0.5;
            let ux = dx / d;
            let uy = dy / d;

            if let Some(a) = world.player_mut(a_entity) {
                a.transform.x -= ux * push;
                a.transform.y -= uy * push;
            }
            if let Some(b) = world.player_mut(*b_entity) {
                b.transform.x += ux * push;
                b.transform.y += uy * push;
            }
        }
    }

    for entity in list {
        let Some(player) = world.player(entity) else { continue };
        if !player.condition.alive {
            continue;
        }
        let area = bounds(world, player.tag.team);
        let radius = player.transform.radius;
        let (x, y) = (player.transform.x, player.transform.y);
        let x = clamp(x, area.min_x + radius, area.max_x - radius);
        let y = clamp(y, COURT.y + radius, COURT.bottom - radius);
        if let Some(player) = world.player_mut(entity) {
            player.transform.x = x;
            player.transform.y = y;
        }
    }
}
