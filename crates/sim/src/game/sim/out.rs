use crate::components::*;
use crate::constants::{team_light, team_main};
use crate::ecs::Entity;
use crate::types::{SfxEvent, Team};
use crate::world::World;

use super::throwing::drop_ball;
use crate::game::effects::{add_floater, burst, ring};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Cause {
    Hit,
    Caught,
}

pub fn eliminate(world: &mut World, entity: Entity, cause: Cause) {
    let Some(player) = world.player(entity) else { return };
    if !player.condition.alive {
        return;
    }
    let team = player.tag.team;
    let (x, y) = (player.transform.x, player.transform.y);
    let carried = player.carry;

    let sim = world.clock.sim;
    if let Some(player) = world.player_mut(entity) {
        player.condition.alive = false;
        player.condition.out_at = sim;
        player.condition.out_x = x;
        player.condition.out_y = y;
        player.action.charging = false;
        player.action.charge = 0.0;
        player.cooldowns.catch_window = 0.0;
        player.carry = None;
    }

    if let Some(ball_entity) = carried {
        drop_ball(world, ball_entity, x, y);
    }

    world.queues.get_mut(team).push(entity);

    burst(world, x, y, team_main(team), 20, 1.4, ParticleKind::Spark);
    ring(world, x, y, team_light(team), 30.0);

    let (is_human, glasses, name) = world
        .player(entity)
        .map(|player| {
            (player.tag.is_human, player.tag.glasses, player.tag.name.clone())
        })
        .unwrap_or((false, false, String::new()));
    let _ = name;

    if !is_human && !glasses {
        add_floater(world, x, y - 40.0, "OUT!", team_light(team), 1.0, None);
    }

    world.feedback.shake = world
        .feedback
        .shake
        .max(if cause == Cause::Caught { 8.0 } else { 11.0 });
    world.feedback.flash = world.feedback.flash.max(0.24);

    check_set_end(world);
}

/// Rule 25: re-entry from the queue, over the back line.
pub fn reenter(world: &mut World, team: Team) {
    let entity = {
        let queue = world.queues.get_mut(team);
        if queue.is_empty() {
            return;
        }
        queue.remove(0)
    };

    crate::game::spawn::reenter_player(world, entity);
    let (x, y, name) = match world.player(entity) {
        Some(player) => (
            player.transform.x,
            player.transform.y,
            player.tag.name.to_uppercase(),
        ),
        None => return,
    };

    burst(world, x, y, team_light(team), 14, 0.9, ParticleKind::Spark);
    ring(world, x, y, team_light(team), 22.0);
    add_floater(world, x, y - 36.0, &format!("{name} IN"), team_light(team), 1.2, None);
    world.sfx(SfxEvent::Pickup);
}

/// Rule 29.3.2: simultaneous all-out voids the set in the Foam format.
pub fn check_set_end(world: &mut World) {
    if world.set.resolved {
        return;
    }
    let blue = world.alive_count(Team::Blue);
    let red = world.alive_count(Team::Red);
    if blue > 0 && red > 0 {
        return;
    }

    world.set.resolved = true;
    let winner = if blue == red {
        None
    } else if blue > red {
        Some(Team::Blue)
    } else {
        Some(Team::Red)
    };
    world.set.winner = winner;
    if let Some(winner) = winner {
        world.last_set.winner = Some(winner);
    }
    world.reset_shot_clock();
}
