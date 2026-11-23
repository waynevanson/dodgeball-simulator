use crate::constants::{COURT, PHYS};
use crate::ecs::Entity;
use crate::types::SfxEvent;
use crate::world::World;

/// Integrate one ball substep: carry, drag, walls, trails and landing.
pub fn step_ball(world: &mut World, entity: Entity, dt: f64) {
    let held_by = world.ball(entity).and_then(|ball| ball.held_by);
    if let Some(holder) = held_by {
        let holder_data = world
            .player(holder)
            .map(|player| {
                (
                    player.transform.x,
                    player.transform.y,
                    player.transform.radius,
                    player.transform.facing,
                )
            });
        if let Some((hx, hy, radius, facing)) = holder_data {
            let offset = radius + 5.0;
            if let Some(ball) = world.ball_mut(entity) {
                ball.transform.x = hx + facing.cos() * offset;
                ball.transform.y = hy + facing.sin() * offset;
                ball.tag.spin_v = 0.0;
                ball.trail.points.clear();
            }
            return;
        }
        if let Some(ball) = world.ball_mut(entity) {
            ball.held_by = None;
        }
    }

    let pre_speed = world
        .ball(entity)
        .map(|ball| ball.transform.vx.hypot(ball.transform.vy))
        .unwrap_or(0.0);

    let mut hit_surface = false;
    let mut speed = 0.0;

    if let Some(ball) = world.ball_mut(entity) {
        ball.tag.age += dt;
        ball.tag.bob += dt * 2.0;
        ball.tag.spin += ball.tag.spin_v * dt;
        ball.state.pickup_cd = (ball.state.pickup_cd - dt).max(0.0);
        ball.state.ignore_time = (ball.state.ignore_time - dt).max(0.0);
        if ball.state.ignore_time <= 0.0 {
            ball.state.ignore = None;
        }

        let drag = if ball.state.live { PHYS.ball_drag } else { PHYS.ball_drag_free };
        let friction = (-drag * dt).exp();
        ball.transform.vx *= friction;
        ball.transform.vy *= friction;
        ball.transform.x += ball.transform.vx * dt;
        ball.transform.y += ball.transform.vy * dt;

        if ball.state.live && pre_speed > 260.0 {
            ball.trail.points.push(crate::components::TrailPoint {
                x: ball.transform.x,
                y: ball.transform.y,
                a: 0.9,
            });
            if ball.trail.points.len() > 9 {
                ball.trail.points.remove(0);
            }
        }
        for point in &mut ball.trail.points {
            point.a -= dt * 4.0;
        }
        ball.trail.points.retain(|point| point.a > 0.0);

        // Walls are "surfaces": a live ball dies on contact (Rule 15.6).
        let radius = ball.transform.radius;
        if ball.transform.x < COURT.x + radius {
            ball.transform.x = COURT.x + radius;
            if ball.transform.vx < 0.0 {
                ball.transform.vx = -ball.transform.vx * PHYS.wall_damp;
            }
            ball.transform.vy *= 0.7;
            hit_surface = true;
        } else if ball.transform.x > COURT.right - radius {
            ball.transform.x = COURT.right - radius;
            if ball.transform.vx > 0.0 {
                ball.transform.vx = -ball.transform.vx * PHYS.wall_damp;
            }
            ball.transform.vy *= 0.7;
            hit_surface = true;
        }
        if ball.transform.y < COURT.y + radius {
            ball.transform.y = COURT.y + radius;
            if ball.transform.vy < 0.0 {
                ball.transform.vy = -ball.transform.vy * PHYS.wall_damp;
            }
            ball.transform.vx *= 0.7;
            hit_surface = true;
        } else if ball.transform.y > COURT.bottom - radius {
            ball.transform.y = COURT.bottom - radius;
            if ball.transform.vy > 0.0 {
                ball.transform.vy = -ball.transform.vy * PHYS.wall_damp;
            }
            ball.transform.vx *= 0.7;
            hit_surface = true;
        }

        speed = ball.transform.vx.hypot(ball.transform.vy);
        if speed < 6.0 {
            ball.transform.vx = 0.0;
            ball.transform.vy = 0.0;
        }
        ball.tag.spin_v = speed * 0.012;
    }

    let live = world.ball(entity).map(|ball| ball.state.live).unwrap_or(false);
    if hit_surface {
        if live {
            world.sfx(SfxEvent::Bounce(pre_speed / 1300.0));
        }
        land_ball(world, entity);
    } else if live && speed < PHYS.ball_live_speed {
        land_ball(world, entity);
    }
}

/// A live ball becomes dead on contact with any surface (Rule 15.6).
pub fn land_ball(world: &mut World, entity: Entity) {
    let Some(ball) = world.ball(entity) else { return };
    let was_live = ball.state.live;
    let thrower = ball.state.thrower;
    let thrower_team = ball.state.thrower_team;
    let valid_attempt = ball.state.valid_attempt;
    let already_warned = ball.state.warning_issued;
    let (x, y) = (ball.transform.x, ball.transform.y);

    if was_live && !valid_attempt && !already_warned {
        if let Some(team) = thrower_team {
            if let Some(ball) = world.ball_mut(entity) {
                ball.state.warning_issued = true;
            }
            world.warnings.add(team);
            if let Some(thrower) = thrower {
                let is_human = world
                    .player(thrower)
                    .map(|player| player.tag.is_human)
                    .unwrap_or(false);
                if is_human {
                    super::super::effects::add_floater(
                        world,
                        x,
                        y - 22.0,
                        "NO TOUCH",
                        "#fca5a5",
                        1.0,
                        None,
                    );
                }
            }
        }
    }

    if let Some(ball) = world.ball_mut(entity) {
        ball.state.live = false;
        ball.state.team = None;
        ball.state.rush = false;
        ball.state.armed = true;
        ball.state.thrower = None;
    }
}
