pub mod ai;
pub mod effects;
pub mod flow;
pub mod sim;
pub mod spawn;

use crate::constants::*;
use crate::math::clamp;
use crate::resources::InputFrame;
use crate::types::Phase;
use crate::world::World;

/// One frame: match flow first, then the simulation, then effects.
pub fn tick(world: &mut World, dt: f64, input: &InputFrame) {
    let dt = clamp(dt, 0.0, 0.05);
    world.time += dt;

    flow::flow_step(world, dt);

    let phase = world.phase.id;
    if phase == Phase::Paused {
        return;
    }

    world.clock.sim += dt;
    world.feedback.shake = (world.feedback.shake - dt * 34.0).max(0.0);
    world.feedback.flash = (world.feedback.flash - dt * 2.6).max(0.0);

    let mut sim_dt = dt;
    if world.feedback.slowmo > 0.0 {
        world.feedback.slowmo = (world.feedback.slowmo - dt).max(0.0);
        sim_dt = dt * 0.36;
    }

    match phase {
        Phase::Menu | Phase::Countdown => sim::loop_::simulate(world, sim_dt, true),
        Phase::Playing => {
            world.set.elapsed += dt;
            if !world.set.sudden_death && world.set.elapsed >= SUDDEN_DEATH_AFTER {
                sim::rules::enter_sudden_death(world);
            }
            sim::intents::build_intents(world, input, dt);
            sim::loop_::simulate(world, sim_dt, false);
            if !world.set.resolved {
                sim::rules::update_arming(world);
                sim::rules::update_rush(world);
                sim::rules::update_shot_clock(world, dt);
            }
        }
        _ => sim::loop_::simulate(world, sim_dt, true),
    }

    effects::update_effects(world, dt);
}
