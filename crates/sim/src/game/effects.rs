use crate::components::*;
use crate::constants::*;
use crate::ecs::Entity;
use crate::math::{clamp, TAU};
use crate::world::World;

fn transform_at(x: f64, y: f64, vx: f64, vy: f64) -> Transform {
    Transform { x, y, vx, vy, radius: 0.0, facing: 0.0 }
}

pub fn add_floater(
    world: &mut World,
    x: f64,
    y: f64,
    text: &str,
    color: &str,
    life: f64,
    size: Option<f64>,
) {
    let entity = world.spawn();
    world.floaters.insert(
        entity,
        Floater {
            transform: transform_at(x, y, 0.0, 0.0),
            text: text.to_string(),
            color: color.to_string(),
            life,
            max: life,
            size,
        },
    );
}

pub fn burst(
    world: &mut World,
    x: f64,
    y: f64,
    color: &str,
    count: usize,
    power: f64,
    kind: ParticleKind,
) {
    for _ in 0..count {
        let angle = world.rng.range(0.0, TAU);
        let speed = world.rng.range(50.0, 340.0) * power;
        let entity = world.spawn();
        world.particles.insert(
            entity,
            Particle {
                transform: transform_at(x, y, angle.cos() * speed, angle.sin() * speed),
                life: world.rng.range(0.22, 0.62),
                max: 0.62,
                size: world.rng.range(1.6, 4.2),
                color: color.to_string(),
                drag: 3.6,
                kind,
                spin: 0.0,
                spin_v: 0.0,
            },
        );
    }
}

pub fn ring(world: &mut World, x: f64, y: f64, color: &str, size: f64) {
    let entity = world.spawn();
    world.particles.insert(
        entity,
        Particle {
            transform: transform_at(x, y, 0.0, 0.0),
            life: 0.42,
            max: 0.42,
            size,
            color: color.to_string(),
            drag: 0.0,
            kind: ParticleKind::Ring,
            spin: 0.0,
            spin_v: 0.0,
        },
    );
}

pub fn confetti(world: &mut World, count: usize) {
    let colors = CONFETTI_COLORS;
    for _ in 0..count {
        let entity = world.spawn();
        let color = *world.rng.pick(&colors);
        world.particles.insert(
            entity,
            Particle {
                transform: transform_at(
                    world.rng.range(0.0, VIEW_W),
                    world.rng.range(-80.0, 120.0),
                    world.rng.range(-70.0, 70.0),
                    world.rng.range(70.0, 240.0),
                ),
                life: world.rng.range(1.6, 3.2),
                max: 3.2,
                size: world.rng.range(3.0, 7.0),
                color: color.to_string(),
                drag: 0.25,
                kind: ParticleKind::Confetti,
                spin: world.rng.range(0.0, TAU),
                spin_v: world.rng.range(-8.0, 8.0),
            },
        );
    }
}

pub fn drop_glasses(world: &mut World, entity: Entity) {
    let Some((px, py, radius)) = world
        .player(entity)
        .map(|player| (player.transform.x, player.transform.y, player.transform.radius))
    else {
        return;
    };
    let x = px + world.rng.range(-4.0, 4.0);
    let y = py - radius * 0.35;
    let vx = world.rng.range(-150.0, 150.0);
    let vy = world.rng.range(-220.0, -90.0);
    let rot = world.rng.range(-0.5, 0.5);
    let spin = world.rng.range(-12.0, 12.0);

    let glasses_entity = world.spawn();
    world.glasses.insert(
        glasses_entity,
        Glasses { transform: transform_at(x, y, vx, vy), rot, spin },
    );
}

pub fn on_dash(world: &mut World, entity: Entity) {
    world.sfx(crate::types::SfxEvent::Dash);
    let Some(player) = world.player(entity) else { return };
    let (x, y, dash_x, dash_y) =
        (player.transform.x, player.transform.y, player.action.dash_x, player.action.dash_y);

    for _ in 0..7 {
        let particle_entity = world.spawn();
        let vx = -dash_x * world.rng.range(30.0, 120.0) + world.rng.range(-40.0, 40.0);
        let vy = -dash_y * world.rng.range(30.0, 120.0) + world.rng.range(-40.0, 40.0);
        world.particles.insert(
            particle_entity,
            Particle {
                transform: transform_at(
                    x + world.rng.range(-6.0, 6.0),
                    y + world.rng.range(-6.0, 6.0),
                    vx,
                    vy,
                ),
                life: world.rng.range(0.2, 0.45),
                max: 0.45,
                size: world.rng.range(2.0, 5.0),
                color: "rgba(203,213,225,0.55)".to_string(),
                drag: 4.0,
                kind: ParticleKind::Dust,
                spin: 0.0,
                spin_v: 0.0,
            },
        );
    }
}

pub fn punch(world: &mut World) {
    world.feedback.shake = world.feedback.shake.max(11.0);
    world.feedback.flash = world.feedback.flash.max(0.26);
    world.feedback.slowmo = 0.3;
}

pub fn celebrate(world: &mut World, winner: crate::types::Team) {
    if winner == crate::types::Team::Blue {
        confetti(world, 110);
    }
}

/// Age and retire every effect entity.
pub fn update_effects(world: &mut World, dt: f64) {
    let particles = world.particles.entities();
    for entity in &particles {
        let Some(particle) = world.particles.get_mut(*entity) else { continue };
        particle.life -= dt;
        particle.transform.x += particle.transform.vx * dt;
        particle.transform.y += particle.transform.vy * dt;
        let drag = (-particle.drag * dt).exp();
        particle.transform.vx *= drag;
        particle.transform.vy *= drag;
        if particle.kind == ParticleKind::Confetti {
            particle.transform.vy += 150.0 * dt;
            particle.transform.vx *= 1.0 - 0.6 * dt;
            particle.spin += particle.spin_v * dt;
        }
    }

    let expired: Vec<Entity> = particles
        .iter()
        .copied()
        .filter(|entity| {
            world
                .particles
                .get(*entity)
                .map(|particle| particle.life <= 0.0)
                .unwrap_or(false)
        })
        .collect();
    for entity in expired {
        world.despawn(entity);
    }

    let excess = world.particles.len().saturating_sub(MAX_PARTICLES);
    for entity in world.particles.entities().into_iter().take(excess) {
        world.despawn(entity);
    }

    for entity in world.glasses.entities() {
        let Some(glasses) = world.glasses.get_mut(entity) else { continue };
        glasses.transform.x += glasses.transform.vx * dt;
        glasses.transform.y += glasses.transform.vy * dt;
        let drag = (-4.2 * dt).exp();
        glasses.transform.vx *= drag;
        glasses.transform.vy *= drag;
        glasses.rot += glasses.spin * dt;
        glasses.spin *= (-3.4 * dt).exp();
        glasses.transform.x = clamp(glasses.transform.x, COURT.x + 22.0, COURT.right - 22.0);
        glasses.transform.y = clamp(glasses.transform.y, COURT.y + 22.0, COURT.bottom - 22.0);
    }

    let floaters = world.floaters.entities();
    for entity in &floaters {
        let Some(floater) = world.floaters.get_mut(*entity) else { continue };
        floater.life -= dt;
        floater.transform.y -= 30.0 * dt;
    }

    let expired: Vec<Entity> = floaters
        .iter()
        .copied()
        .filter(|entity| {
            world
                .floaters
                .get(*entity)
                .map(|floater| floater.life <= 0.0)
                .unwrap_or(false)
        })
        .collect();
    for entity in expired {
        world.despawn(entity);
    }

    let excess = world.floaters.len().saturating_sub(MAX_FLOATERS);
    for entity in world.floaters.entities().into_iter().take(excess) {
        world.despawn(entity);
    }
}
