use crate::components::{Intent, Player};
use crate::constants::{ATTACK_DIST, BALL_RADIUS, COURT};
use crate::ecs::Entity;
use crate::math::{angle_to, clamp, closest_approach, dist, norm};
use crate::types::Team;
use crate::world::World;

use crate::game::sim::bounds;

fn read_player(world: &World, entity: Entity) -> Option<Player> {
    world.player(entity).cloned()
}

/// Decide what an AI player wants to do this frame: where to move, where to
/// aim, and whether to charge, throw, dash or catch.
pub fn build_ai_intent(world: &mut World, entity: Entity, dt: f64) -> Intent {
    let Some(player) = read_player(world, entity) else { return Intent::default() };
    let mut intent = Intent { aim: player.transform.facing, ..Intent::default() };
    let Some(diff) = player.brain.diff else { return intent };
    if !player.condition.alive {
        return intent;
    }

    let mut brain = player.brain;
    let team = player.tag.team;
    let transform = player.transform;

    let foes: Vec<Entity> = world
        .players
        .iter()
        .filter(|(_, other)| other.condition.alive && other.tag.team != team)
        .map(|(other_entity, _)| other_entity)
        .collect();
    if foes.is_empty() {
        return intent;
    }
    let mates: Vec<Entity> = world
        .players
        .iter()
        .filter(|(other_entity, other)| {
            other.condition.alive && other.tag.team == team && *other_entity != entity
        })
        .map(|(other_entity, _)| other_entity)
        .collect();
    let area = bounds(world, team);
    let clock = world.clock.sim;
    let shot_team = world.shot.team;
    let shot_clock = world.shot.clock;
    let rush_active = world.rush.active;

    // --- refresh noisy internal state
    brain.strafe_timer -= dt;
    if brain.strafe_timer <= 0.0 {
        brain.strafe = world.rng.sign();
        brain.strafe_timer = world.rng.range(0.8, 1.8);
    }

    brain.aim_timer -= dt;
    if brain.aim_timer <= 0.0 {
        brain.aim_error = world.rng.range(-1.0, 1.0) * diff.aim_error;
        brain.aim_timer = world.rng.range(0.25, 0.5);
    }

    let current_target_alive = brain.target.and_then(|target| {
        world
            .player(target)
            .map(|other| other.condition.alive && other.tag.team != team)
    });
    brain.target_timer -= dt;
    if brain.target_timer <= 0.0
        || current_target_alive.is_none()
        || current_target_alive == Some(false)
    {
        brain.target_timer = world.rng.range(0.45, 0.9);
        brain.target = Some(choose_target(world, &transform, &foes));
    }

    let target_entity = brain
        .target
        .filter(|target| {
            world
                .player(*target)
                .map(|other| other.condition.alive)
                .unwrap_or(false)
        })
        .unwrap_or(foes[0]);
    let live_target = read_player(world, target_entity).unwrap_or(player.clone());

    // --- aim, leading the target's movement
    let throw_speed = 1150.0;
    let d_target = dist(
        transform.x,
        transform.y,
        live_target.transform.x,
        live_target.transform.y,
    );
    let time_to_target = d_target / throw_speed;
    let aim_x = live_target.transform.x + live_target.transform.vx * time_to_target * diff.lead;
    let aim_y = live_target.transform.y + live_target.transform.vy * time_to_target * diff.lead;
    intent.aim =
        angle_to(transform.x, transform.y, aim_x, aim_y) + brain.aim_error * (0.65 + d_target / 1100.0);

    let held = player.carry;
    let held_unarmed = held
        .and_then(|ball| world.ball(ball))
        .map(|ball| !ball.state.armed)
        .unwrap_or(false);
    let held_armed = held
        .and_then(|ball| world.ball(ball))
        .map(|ball| ball.state.armed)
        .unwrap_or(false);

    // --- attack: charge up, then let fly (only with an armed ball)
    if held.is_some() && held_armed && d_target < 1020.0 {
        let desired_charge = clamp(0.42 + d_target / 1500.0, 0.45, 1.0);
        if !player.action.charging {
            intent.charge = true;
            brain.release_delay = diff.throw_delay * world.rng.range(0.7, 1.4);
        } else {
            intent.charge = true;
            if player.action.charge >= desired_charge {
                brain.release_delay -= dt;
                if brain.release_delay <= 0.0 {
                    intent.release = true;
                    brain.release_delay = diff.throw_delay * world.rng.range(1.5, 3.0);
                }
            }
        }
        // Rule 17.3: don't get caught holding the ball on the shot clock.
        if shot_team == Some(team) && shot_clock <= 3.2 {
            intent.release = true;
        }
    }

    // --- movement defaults by role
    let mut mx;
    let mut my;

    if held_unarmed {
        // Rule 13.7.1: carry the ball behind the attack line before throwing.
        let retreat_x = match team {
            Team::Blue => COURT.cx - ATTACK_DIST - 45.0,
            Team::Red => COURT.cx + ATTACK_DIST + 45.0,
        };
        mx = (retreat_x - transform.x).signum();
        my = (clock * 1.4 + brain.phase).sin() * 0.45;
        if player.action.dash_cd <= 0.0
            && (retreat_x - transform.x).abs() > 90.0
            && world.rng.chance(0.4)
        {
            intent.dash = true;
        }
    } else if held.is_some() {
        // Kite: hold a comfortable throwing distance from the target.
        let preferred = 300.0 + (clock * 0.7 + brain.phase).sin() * 70.0;
        let angle = angle_to(
            transform.x,
            transform.y,
            live_target.transform.x,
            live_target.transform.y,
        );
        let closing = clamp((d_target - preferred) / 240.0, -1.0, 1.0);
        let strafe_angle = angle + brain.strafe * (std::f64::consts::PI / 2.0);
        mx = angle.cos() * closing + strafe_angle.cos() * 0.9;
        my = angle.sin() * closing + strafe_angle.sin() * 0.9;
    } else {
        let claimed = world
            .claims
            .iter()
            .find(|(player_entity, _)| *player_entity == entity)
            .map(|(_, ball)| *ball);
        let claimed_valid = claimed
            .and_then(|ball_entity| {
                world.ball(ball_entity).map(|ball| {
                    (
                        ball.transform.x,
                        ball.transform.y,
                        ball.held_by.is_none() && !ball.state.live,
                    )
                })
            })
            .filter(|(_, _, valid)| *valid);

        if let Some((bx, by, _)) = claimed_valid {
            let n = norm(bx - transform.x, by - transform.y);
            mx = n.x;
            my = n.y;
            let d = dist(transform.x, transform.y, bx, by);
            let rush_urgency = if rush_active { 6.0 } else { 2.2 };
            if d > 140.0
                && player.action.dash_cd <= 0.0
                && world.rng.chance(diff.dash_chance * dt * rush_urgency)
            {
                intent.dash = true;
            }
        } else {
            // Nothing to fetch: hold a line, shuffle sideways, dare them to throw.
            brain.anchor_timer -= dt;
            if brain.anchor_timer <= 0.0 {
                brain.anchor_timer = world.rng.range(0.6, 1.2);
                let line_x = match team {
                    Team::Blue => COURT.cx - 175.0,
                    Team::Red => COURT.cx + 175.0,
                };
                let mut safe_x = line_x;
                for foe_entity in &foes {
                    let foe = match world.player(*foe_entity) {
                        Some(foe) => foe,
                        None => continue,
                    };
                    if foe.carry.is_none() {
                        continue;
                    }
                    safe_x = match team {
                        Team::Blue => safe_x.min(foe.transform.x - 230.0),
                        Team::Red => safe_x.max(foe.transform.x + 230.0),
                    };
                }
                safe_x = clamp(safe_x, area.min_x + 80.0, area.max_x - 80.0);
                brain.anchor_x =
                    clamp(safe_x + world.rng.range(-45.0, 45.0), area.min_x + 70.0, area.max_x - 70.0);
                brain.anchor_y = clamp(
                    live_target.transform.y + (clock * 0.9 + brain.phase).sin() * 150.0,
                    COURT.y + 70.0,
                    COURT.bottom - 70.0,
                );
            }
            let n = norm(brain.anchor_x - transform.x, brain.anchor_y - transform.y);
            mx = n.x;
            my = n.y;
        }
    }

    // --- personal space
    for mate_entity in &mates {
        let Some(mate) = world.player(*mate_entity) else { continue };
        let d = dist(transform.x, transform.y, mate.transform.x, mate.transform.y);
        if d < 66.0 && d > 0.01 {
            mx += ((transform.x - mate.transform.x) / d) * 0.9;
            my += ((transform.y - mate.transform.y) / d) * 0.9;
        }
    }

    // --- incoming ball? catch it, block it, or get out of the way
    if let Some(threat) = find_threat(world, entity) {
        if brain.catch_ball != Some(threat.ball) {
            brain.catch_ball = Some(threat.ball);
            let can_block = !world.set.sudden_death;
            brain.will_catch =
                (held.is_none() || can_block) && world.rng.chance(diff.catch_chance);
        }
        if brain.will_catch && player.cooldowns.catch_cd <= 0.0 && threat.t < 0.3 {
            intent.catch = true;
        }

        if world.rng.chance(diff.dodge) || threat.t < 0.35 {
            let dodge = dodge_direction(world, entity, threat.ball);
            mx = dodge.0;
            my = dodge.1;
            if threat.t < 0.3
                && player.action.dash_cd <= 0.0
                && world.rng.chance(diff.dash_chance)
            {
                intent.dash = true;
            }
        }
    }

    // --- don't scrape the walls
    if transform.x < area.min_x + 46.0 && mx < 0.0 {
        mx *= 0.12;
    }
    if transform.x > area.max_x - 46.0 && mx > 0.0 {
        mx *= 0.12;
    }
    if transform.y < COURT.y + 56.0 && my < 0.0 {
        my *= 0.12;
    }
    if transform.y > COURT.bottom - 56.0 && my > 0.0 {
        my *= 0.12;
    }

    let movement = norm(mx, my);
    intent.mx = movement.x;
    intent.my = movement.y;

    if let Some(slot) = world.player_mut(entity) {
        slot.brain = brain;
    }
    intent
}

fn choose_target(world: &mut World, transform: &crate::components::Transform, foes: &[Entity]) -> Entity {
    let mut best = foes[0];
    let mut best_score = f64::INFINITY;
    for foe_entity in foes {
        let Some((fx, fy, carry, charging)) = world.player(*foe_entity).map(|foe| {
            (foe.transform.x, foe.transform.y, foe.carry.is_some(), foe.action.charging)
        }) else {
            continue;
        };
        let mut score = dist(transform.x, transform.y, fx, fy);
        if carry {
            score -= 130.0;
        }
        if charging {
            score -= 70.0;
        }
        score += world.rng.range(-70.0, 70.0);
        if score < best_score {
            best_score = score;
            best = *foe_entity;
        }
    }
    best
}

pub struct Threat {
    pub ball: Entity,
    pub t: f64,
    pub d: f64,
}

/// The incoming ball most likely to ruin this player's day.
pub fn find_threat(world: &World, entity: Entity) -> Option<Threat> {
    let Some(player) = world.player(entity) else { return None };
    let mut best: Option<Threat> = None;
    for (ball_entity, ball) in world.balls.iter() {
        if !ball.state.live || ball.held_by.is_some() || ball.state.team == Some(player.tag.team) {
            continue;
        }
        let approach = closest_approach(
            player.transform.x,
            player.transform.y,
            ball.transform.x,
            ball.transform.y,
            ball.transform.vx,
            ball.transform.vy,
            0.85,
        );
        if approach.t <= 0.04 {
            continue;
        }
        let clearance = player.transform.radius + BALL_RADIUS + 13.0;
        if approach.d > clearance {
            continue;
        }
        if best.as_ref().map(|current| approach.t < current.t).unwrap_or(true) {
            best = Some(Threat { ball: ball_entity, t: approach.t, d: approach.d });
        }
    }
    best
}

/// Sidestep perpendicular to the incoming ball's path.
pub fn dodge_direction(world: &World, entity: Entity, ball_entity: Entity) -> (f64, f64) {
    let Some(player) = world.player(entity) else { return (0.0, 0.0) };
    let Some(ball) = world.ball(ball_entity) else { return (0.0, 0.0) };
    let angle = ball.transform.vy.atan2(ball.transform.vx);
    let perp_a = angle + std::f64::consts::PI / 2.0;
    let perp_b = angle - std::f64::consts::PI / 2.0;
    let rel_x = player.transform.x - ball.transform.x;
    let rel_y = player.transform.y - ball.transform.y;
    let dot_a = perp_a.cos() * rel_x + perp_a.sin() * rel_y;
    let perp = if dot_a >= 0.0 { perp_a } else { perp_b };

    let mut dx = perp.cos();
    let mut dy = perp.sin();
    let away = norm(rel_x, rel_y);
    dx += away.x * 0.45;
    dy += away.y * 0.45;

    let area = bounds(world, player.tag.team);
    if player.transform.x + dx * 90.0 < area.min_x + 26.0 {
        dx = dx.abs() + 0.7;
    }
    if player.transform.x + dx * 90.0 > area.max_x - 26.0 {
        dx = -dx.abs() - 0.7;
    }
    if player.transform.y + dy * 90.0 < COURT.y + 34.0 {
        dy = dy.abs() + 0.7;
    }
    if player.transform.y + dy * 90.0 > COURT.bottom - 34.0 {
        dy = -dy.abs() - 0.7;
    }

    let n = norm(dx, dy);
    (n.x, n.y)
}

