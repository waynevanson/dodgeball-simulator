use crate::components::Intent;
use crate::ecs::Entity;
use crate::math::{angle_to, dist};
use crate::resources::InputFrame;
use crate::types::Team;
use crate::world::World;

use super::halves;

pub fn build_intents(world: &mut World, input: &InputFrame, dt: f64) {
    assign_claims(world);

    for entity in world.players_vec() {
        let Some(player) = world.player(entity) else { continue };
        if !player.condition.alive {
            continue;
        }
        let is_human = player.tag.is_human;

        let intent = if is_human {
            human_intent(world, entity, input)
        } else {
            crate::game::ai::build_ai_intent(world, entity, dt)
        };

        if let Some(player) = world.player_mut(entity) {
            player.intent = intent;
        }
    }
}

/// Nearest eligible ball per player, rebuilt every frame for the AI.
pub fn assign_claims(world: &mut World) {
    world.claims.clear();

    let seekers: Vec<Entity> = world
        .players
        .iter()
        .filter(|(_, player)| {
            player.condition.alive && player.carry.is_none() && !player.tag.is_human
        })
        .map(|(entity, _)| entity)
        .collect();

    let free: Vec<Entity> = world
        .balls
        .iter()
        .filter(|(_, ball)| ball.held_by.is_none() && !ball.state.live)
        .map(|(entity, _)| entity)
        .collect();

    if seekers.is_empty() || free.is_empty() {
        return;
    }

    struct Pair {
        player: Entity,
        ball: Entity,
        cost: f64,
    }

    let mut pairs: Vec<Pair> = Vec::new();
    for player_entity in seekers {
        let Some(player) = world.player(player_entity) else { continue };
        let area = halves(player.tag.team);
        for ball_entity in &free {
            let Some(ball) = world.ball(*ball_entity) else { continue };
            if ball.transform.x < area.min_x - 6.0 || ball.transform.x > area.max_x + 6.0 {
                continue;
            }
            let mut cost = dist(
                player.transform.x,
                player.transform.y,
                ball.transform.x,
                ball.transform.y,
            );
            if player.brain.seek == Some(*ball_entity) {
                cost -= 70.0;
            }
            pairs.push(Pair { player: player_entity, ball: *ball_entity, cost });
        }
    }

    pairs.sort_by(|a, b| a.cost.partial_cmp(&b.cost).unwrap_or(std::cmp::Ordering::Equal));

    let mut claimed_players: Vec<Entity> = Vec::new();
    let mut claimed_balls: Vec<Entity> = Vec::new();
    for pair in pairs {
        if claimed_players.contains(&pair.player) || claimed_balls.contains(&pair.ball) {
            continue;
        }
        claimed_players.push(pair.player);
        claimed_balls.push(pair.ball);
        world.claims.push((pair.player, pair.ball));
    }

    for (player_entity, ball_entity) in world.claims.clone() {
        if let Some(player) = world.player_mut(player_entity) {
            player.brain.seek = Some(ball_entity);
        }
    }
}

pub fn human_intent(world: &World, entity: Entity, input: &InputFrame) -> Intent {
    let Some(player) = world.player(entity) else { return Intent::default() };
    let (x, y, facing, team, alive) = (
        player.transform.x,
        player.transform.y,
        player.transform.facing,
        player.tag.team,
        player.condition.alive,
    );

    let mut intent = Intent { aim: facing, ..Intent::default() };
    if !alive {
        return intent;
    }

    if input.touch {
        intent.mx = input.touch_mx;
        intent.my = input.touch_my;
        intent.aim = auto_aim(world, x, y, team, facing);
        intent.charge = input.throw_down;
        intent.release = !input.throw_down;
        intent.dash = input.touch_dash;
        intent.catch = input.touch_catch;
        return intent;
    }

    let mut mx = 0.0;
    let mut my = 0.0;
    if input.right {
        mx += 1.0;
    }
    if input.left {
        mx -= 1.0;
    }
    if input.down {
        my += 1.0;
    }
    if input.up {
        my -= 1.0;
    }
    intent.mx = mx;
    intent.my = my;
    intent.aim = if input.mouse_used {
        angle_to(x, y, input.mouse_x, input.mouse_y)
    } else {
        facing
    };
    intent.charge = input.left_down;
    intent.release = !input.left_down;
    intent.dash = input.dash;
    intent.catch = input.catch || input.right_pressed;
    intent
}

pub fn auto_aim(world: &World, x: f64, y: f64, team: Team, facing: f64) -> f64 {
    let mut best: Option<(f64, f64, f64, f64)> = None;
    let mut best_distance = f64::INFINITY;
    for (_, other) in world.players.iter() {
        if !other.condition.alive || other.tag.team == team {
            continue;
        }
        let d = dist(x, y, other.transform.x, other.transform.y);
        if d < best_distance {
            best_distance = d;
            best = Some((
                other.transform.x,
                other.transform.y,
                other.transform.vx,
                other.transform.vy,
            ));
        }
    }
    let Some((tx, ty, tvx, tvy)) = best else { return facing };
    let flight = best_distance / 1150.0;
    angle_to(x, y, tx + tvx * flight * 0.85, ty + tvy * flight * 0.85)
}
