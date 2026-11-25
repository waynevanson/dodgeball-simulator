//! Client-side prediction for the local player and their carried/thrown ball.
//!
//! The authoritative simulation still lives in SpacetimeDB. This module keeps a
//! small World containing the local player, the other players (only as targets
//! for touch auto-aim) and the one ball the local player owns. It advances that
//! world at 120 Hz, then reconciles against each 20 Hz server snapshot by
//! replaying inputs the server has not acknowledged yet.

use std::collections::VecDeque;

use bevy::prelude::*;
use dodgeball_sim::components::{
    Action, Ball, BallState, BallTag, Brain, Condition, Cooldowns, Player, PlayerStats, PlayerTag,
    Trail, Transform,
};
use dodgeball_sim::ecs::Entity;
use dodgeball_sim::game::sim::{ball::step_ball, intents, player::step_player};
use dodgeball_sim::resources::InputFrame;
use dodgeball_sim::snapshot::{BallOut, Frame, PlayerOut};
use dodgeball_sim::types::Phase;
use dodgeball_sim::world::World;

use crate::input::InputState;
use crate::model::{ClientState, FrameSample};

/// The simulation's fixed physics substep.
const STEP: f64 = 1.0 / 120.0;
/// SpacetimeDB's scheduled tick. Used to estimate how far ahead of a snapshot
/// the local prediction should be.
const TICK_SECONDS: f64 = 0.05;
/// Bound reconciliation work after a long stall/reconnect.
const MAX_REPLAY_TICKS: usize = 20;
/// A correction larger than this is a respawn/teleport, not prediction drift.
const SNAP_DISTANCE: f64 = 180.0;

#[derive(Resource)]
pub struct Prediction {
    world: World,
    player: Option<Entity>,
    ball: Option<u32>,
    timeline: VecDeque<(u64, InputFrame)>,
    last_tick: Option<u64>,
    last_raw: InputFrame,
    accumulator: f64,
    offset_x: f64,
    offset_y: f64,
}

impl Default for Prediction {
    fn default() -> Self {
        Self {
            world: World::empty(0),
            player: None,
            ball: None,
            timeline: VecDeque::new(),
            last_tick: None,
            last_raw: InputFrame::default(),
            accumulator: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }
}

impl Prediction {
    /// Record an input exactly as it was sent to the server. Inputs that the
    /// server has not acknowledged are replayed after each snapshot.
    pub fn push_input(&mut self, seq: u64, input: InputFrame) {
        if self.timeline.back().map(|(last, _)| *last) == Some(seq) {
            return;
        }
        self.timeline.push_back((seq, input));
        while self.timeline.len() > 128 {
            self.timeline.pop_front();
        }
    }

    pub fn reset(&mut self) {
        self.clear_world();
        self.timeline.clear();
        self.last_tick = None;
    }

    fn clear_world(&mut self) {
        self.world = World::empty(0);
        self.player = None;
        self.ball = None;
        self.accumulator = 0.0;
        self.offset_x = 0.0;
        self.offset_y = 0.0;
        self.last_raw = InputFrame::default();
    }

    fn is_new_tick(&self, tick: u64) -> bool {
        self.last_tick != Some(tick)
    }

    /// Rebuild from a server snapshot, then replay inputs newer than the
    /// server's acknowledgement. The visual offset keeps small corrections from
    /// snapping the player while larger ones reset immediately.
    pub fn observe(&mut self, sample: &FrameSample, current: &InputFrame, now: f64) {
        let frame = &sample.frame;
        let Some(local) = frame
            .players
            .iter()
            .find(|player| player.tag.is_you)
            .cloned()
        else {
            self.reset();
            return;
        };

        let entity = Entity::pack(local.id, 0);
        let ack = local.last_input_seq;
        self.timeline.retain(|(seq, _)| *seq > ack);

        if frame.phase != Phase::Playing
            || !local.condition.alive
            || local.condition.entering_time > 0.0
        {
            self.clear_world();
            self.timeline.clear();
            return;
        }

        let previous_visual = self.player.and_then(|old| {
            self.world.player(old).map(|player| {
                (
                    player.transform.x + self.offset_x,
                    player.transform.y + self.offset_y,
                )
            })
        });
        let same_player = self.player.map(|old| old.index()) == Some(local.id);
        let previous_ball = self.ball;
        let ball = pick_ball(frame, &local, previous_ball);

        let unacked: Vec<InputFrame> = self.timeline.iter().map(|(_, input)| *input).collect();
        let elapsed_ticks = ((now - sample.at).max(0.0) / TICK_SECONDS).floor() as usize;
        let mut ticks = elapsed_ticks.max(unacked.len());
        if unacked.last().copied() != Some(*current) {
            ticks = ticks.max(unacked.len() + 1);
        }
        ticks = ticks.clamp(1, MAX_REPLAY_TICKS);

        self.world = World::empty(0);
        self.world.rush.active = frame.rush_active;
        for view in &frame.players {
            let player = player_from_view(view);
            self.world.players.insert(Entity::pack(view.id, 0), player);
        }
        self.player = Some(entity);
        self.ball = ball;
        if let Some(id) = ball {
            if let Some(view) = frame.balls.iter().find(|view| view.id == id) {
                self.world
                    .balls
                    .insert(Entity::pack(id, 0), ball_from_view(view, entity));
            }
        }

        let mut current_used = false;
        for index in 0..ticks {
            if let Some(input) = unacked.get(index) {
                self.step_tick(input);
            } else {
                let mut input = *current;
                if current_used {
                    clear_edges(&mut input);
                }
                self.step_tick(&input);
                current_used = true;
            }
        }

        self.last_raw = *current;
        self.accumulator = 0.0;
        if let Some((old_x, old_y)) = previous_visual.filter(|_| same_player) {
            if let Some(player) = self.world.player(entity) {
                let dx = old_x - player.transform.x;
                let dy = old_y - player.transform.y;
                if dx * dx + dy * dy <= SNAP_DISTANCE * SNAP_DISTANCE {
                    self.offset_x = dx;
                    self.offset_y = dy;
                } else {
                    self.offset_x = 0.0;
                    self.offset_y = 0.0;
                }
            }
        } else {
            self.offset_x = 0.0;
            self.offset_y = 0.0;
        }
    }

    /// Advance prediction between server snapshots.
    pub fn advance(&mut self, dt: f64, input: &InputFrame) {
        if self.player.is_none() {
            return;
        }
        let dt = dt.clamp(0.0, 0.1);
        self.accumulator += dt;
        let mut steps = 0;
        while self.accumulator >= STEP && steps < 24 {
            let step_input = edge_input(input, &self.last_raw);
            self.step(&step_input);
            self.last_raw = *input;
            self.accumulator -= STEP;
            steps += 1;
        }
        let decay = (-14.0 * dt).exp();
        self.offset_x *= decay;
        self.offset_y *= decay;
    }

    /// One server tick's worth of fixed substeps, with one-shot input edges
    /// consumed on the first substep only.
    fn step_tick(&mut self, input: &InputFrame) {
        let substeps = (TICK_SECONDS / STEP).round() as usize;
        let mut first = *input;
        self.step(&first);
        clear_edges(&mut first);
        for _ in 1..substeps {
            self.step(&first);
        }
    }

    fn step(&mut self, input: &InputFrame) {
        let Some(entity) = self.player else {
            return;
        };
        if let Some(player) = self.world.player(entity) {
            if let Some(ball) = player.carry {
                self.ball = Some(ball.index());
            }
        }

        let intent = intents::human_intent(&self.world, entity, input);
        if let Some(player) = self.world.player_mut(entity) {
            player.intent = intent;
        }
        step_player(&mut self.world, entity, STEP);

        if let Some(player) = self.world.player(entity) {
            if let Some(ball) = player.carry {
                self.ball = Some(ball.index());
            }
        }
        for ball in self.world.balls_vec() {
            step_ball(&mut self.world, ball, STEP);
        }

        // Prediction effects are cosmetic and never rendered. Discard them so
        // the tiny world does not accumulate entities.
        self.world.events.clear();
        self.world.particles.clear();
        self.world.floaters.clear();
        self.world.glasses.clear();
        self.world.time += STEP;
    }

    /// Overlay predicted local state on the interpolated server frame.
    pub fn apply(&self, frame: &mut Frame) {
        let Some(entity) = self.player else {
            return;
        };
        let Some(player) = self.world.player(entity) else {
            return;
        };
        let Some(view) = frame
            .players
            .iter_mut()
            .find(|view| view.id == entity.index())
        else {
            return;
        };
        // Death/elimination is authoritative; never extend a dead player's
        // prediction over a snapshot that already shows the elimination.
        if !view.condition.alive {
            return;
        }

        view.transform.x = player.transform.x + self.offset_x;
        view.transform.y = player.transform.y + self.offset_y;
        view.transform.vx = player.transform.vx;
        view.transform.vy = player.transform.vy;
        view.transform.radius = player.transform.radius;
        view.transform.facing = player.transform.facing;
        view.condition.alive = player.condition.alive;
        view.condition.has_glasses = player.condition.has_glasses;
        view.condition.entering_time = player.condition.entering_time;
        view.condition.hit_flash = player.condition.hit_flash;
        view.carry.ball = player.carry.map(|ball| ball.index());
        view.action.charge = player.action.charge;
        view.action.charging = player.action.charging;
        view.action.dash_time = player.action.dash_time;
        view.action.dash_cd = player.action.dash_cd;
        view.action.dash_x = player.action.dash_x;
        view.action.dash_y = player.action.dash_y;
        view.cooldowns.catch_window = player.cooldowns.catch_window;
        view.cooldowns.catch_cd = player.cooldowns.catch_cd;
        view.cooldowns.throw_cd = player.cooldowns.throw_cd;
        view.cooldowns.pickup_cd = player.cooldowns.pickup_cd;
        view.trail.points = player.trail.points.clone();

        let Some(id) = self.ball else {
            return;
        };
        let Some(ball) = self.world.ball(Entity::pack(id, 0)) else {
            return;
        };
        let Some(view_ball) = frame.balls.iter_mut().find(|view| view.id == id) else {
            return;
        };
        let held_by_local = ball.held_by == Some(entity);
        let offset_x = if held_by_local { self.offset_x } else { 0.0 };
        let offset_y = if held_by_local { self.offset_y } else { 0.0 };

        view_ball.transform.x = ball.transform.x + offset_x;
        view_ball.transform.y = ball.transform.y + offset_y;
        view_ball.transform.vx = ball.transform.vx;
        view_ball.transform.vy = ball.transform.vy;
        view_ball.transform.radius = ball.transform.radius;
        view_ball.transform.facing = ball.transform.facing;
        view_ball.tag.spin = ball.tag.spin;
        view_ball.tag.spin_v = ball.tag.spin_v;
        view_ball.tag.bob = ball.tag.bob;
        view_ball.tag.age = ball.tag.age;
        view_ball.state.live = ball.state.live;
        view_ball.state.armed = ball.state.armed;
        view_ball.state.rush = ball.state.rush;
        view_ball.state.can_out = ball.state.can_out;
        view_ball.state.team = ball.state.team;
        view_ball.state.touched = ball.state.touched;
        view_ball.state.valid_attempt = ball.state.valid_attempt;
        view_ball.state.warning_issued = ball.state.warning_issued;
        view_ball.held.by = ball.held_by.map(|holder| holder.index());
        view_ball.trail.points = ball.trail.points.clone();
    }
}

/// Run prediction after network updates and before the view is built. The
/// current input is sampled here, before `send_input` consumes one-shot edges.
pub fn update_prediction(
    time: Res<Time>,
    state: Res<ClientState>,
    mut input: ResMut<InputState>,
    mut prediction: ResMut<Prediction>,
) {
    let now = time.elapsed_secs_f64();
    let Some(sample) = state.samples.last() else {
        prediction.reset();
        return;
    };
    let current = input.build_frame(&state);
    if prediction.is_new_tick(sample.tick) {
        prediction.last_tick = Some(sample.tick);
        prediction.observe(sample, &current, now);
    } else {
        prediction.advance(time.delta_secs_f64(), &current);
    }
}

fn pick_ball(frame: &Frame, local: &PlayerOut, previous: Option<u32>) -> Option<u32> {
    if let Some(id) = local.carry.ball {
        return frame
            .balls
            .iter()
            .any(|ball| ball.id == id && ball.held.by == Some(local.id))
            .then_some(id);
    }
    let id = previous?;
    let ball = frame.balls.iter().find(|ball| ball.id == id)?;
    if ball.held.by == Some(local.id)
        || (ball.state.live && ball.state.team == Some(local.tag.team))
    {
        Some(id)
    } else {
        None
    }
}

fn player_from_view(view: &PlayerOut) -> Player {
    Player {
        transform: Transform {
            x: view.transform.x,
            y: view.transform.y,
            vx: view.transform.vx,
            vy: view.transform.vy,
            radius: view.transform.radius,
            facing: view.transform.facing,
        },
        tag: PlayerTag {
            name: view.tag.name.clone(),
            number: view.tag.number,
            team: view.tag.team,
            slot: view.tag.slot,
            owner: view.tag.owner,
            is_human: view.tag.is_human,
            glasses: view.tag.glasses,
        },
        condition: Condition {
            alive: view.condition.alive,
            has_glasses: view.condition.has_glasses,
            entering_time: view.condition.entering_time,
            hit_flash: view.condition.hit_flash,
            out_at: view.condition.out_at,
            out_x: view.condition.out_x,
            out_y: view.condition.out_y,
        },
        carry: view.carry.ball.map(|id| Entity::pack(id, 0)),
        action: Action {
            charge: view.action.charge,
            charging: view.action.charging,
            dash_time: view.action.dash_time,
            dash_cd: view.action.dash_cd,
            dash_x: view.action.dash_x,
            dash_y: view.action.dash_y,
        },
        cooldowns: Cooldowns {
            catch_window: view.cooldowns.catch_window,
            catch_cd: view.cooldowns.catch_cd,
            throw_cd: view.cooldowns.throw_cd,
            pickup_cd: view.cooldowns.pickup_cd,
        },
        intent: Default::default(),
        brain: Brain::default(),
        trail: Trail {
            points: view.trail.points.clone(),
        },
        stats: PlayerStats {
            throws: view.stats.throws,
            catches: view.stats.catches,
            outs: view.stats.outs,
        },
    }
}

fn ball_from_view(view: &BallOut, owner: Entity) -> Ball {
    Ball {
        transform: Transform {
            x: view.transform.x,
            y: view.transform.y,
            vx: view.transform.vx,
            vy: view.transform.vy,
            radius: view.transform.radius,
            facing: view.transform.facing,
        },
        tag: BallTag {
            spin: view.tag.spin,
            spin_v: view.tag.spin_v,
            bob: view.tag.bob,
            age: view.tag.age,
        },
        state: BallState {
            live: view.state.live,
            armed: view.state.armed,
            rush: view.state.rush,
            can_out: view.state.can_out,
            team: view.state.team,
            thrower: view.state.live.then_some(owner),
            thrower_team: view.state.team,
            touched: view.state.touched,
            valid_attempt: view.state.valid_attempt,
            warning_issued: view.state.warning_issued,
            ignore: None,
            ignore_time: 0.0,
            bounces: 0,
            pickup_cd: 0.0,
            release_positions: Vec::new(),
        },
        held_by: view.held.by.map(|id| Entity::pack(id, 0)),
        trail: Trail {
            points: view.trail.points.clone(),
        },
    }
}

fn edge_input(raw: &InputFrame, previous: &InputFrame) -> InputFrame {
    let mut input = *raw;
    input.dash = raw.dash && !previous.dash;
    input.catch = raw.catch && !previous.catch;
    input.right_pressed = raw.right_pressed && !previous.right_pressed;
    input.touch_dash = raw.touch_dash && !previous.touch_dash;
    input.touch_catch = raw.touch_catch && !previous.touch_catch;
    input
}

fn clear_edges(input: &mut InputFrame) {
    input.dash = false;
    input.catch = false;
    input.right_pressed = false;
    input.touch_dash = false;
    input.touch_catch = false;
}

#[cfg(test)]
mod tests {
    use super::*;
    use dodgeball_sim::types::DifficultyId;

    #[test]
    fn one_shot_edges_are_consumed_once() {
        let previous = InputFrame::default();
        let raw = InputFrame {
            dash: true,
            catch: true,
            right_pressed: true,
            touch_dash: true,
            touch_catch: true,
            ..InputFrame::default()
        };
        let first = edge_input(&raw, &previous);
        assert!(first.dash);
        assert!(first.catch);
        assert!(first.right_pressed);
        assert!(first.touch_dash);
        assert!(first.touch_catch);

        let second = edge_input(&raw, &raw);
        assert!(!second.dash);
        assert!(!second.catch);
        assert!(!second.right_pressed);
        assert!(!second.touch_dash);
        assert!(!second.touch_catch);
    }

    #[test]
    fn prediction_moves_the_local_player_before_the_next_snapshot() {
        let mut world = dodgeball_sim::world::World::new(7, DifficultyId::Pro, 5, "Tester");
        world.phase.id = Phase::Playing;
        let local = world
            .players
            .iter()
            .find(|(_, player)| player.tag.is_human)
            .map(|(entity, _)| entity)
            .expect("human player");
        if let Some(player) = world.player_mut(local) {
            player.transform.x = 400.0;
            player.transform.y = 300.0;
            player.transform.vx = 0.0;
            player.transform.vy = 0.0;
        }

        let mut frame = world.frame();
        frame.phase = Phase::Playing;
        let sample = FrameSample {
            at: 1.0,
            tick: 1,
            frame,
        };
        let input = InputFrame {
            right: true,
            ..InputFrame::default()
        };

        let mut prediction = Prediction::default();
        prediction.observe(&sample, &input, 1.0);
        let predicted = prediction
            .world
            .player(Entity::pack(local.index(), 0))
            .expect("predicted player")
            .transform
            .x;
        assert!(predicted > 400.0, "player should have moved right");
        assert!(predicted < 450.0, "one tick should not teleport");

        let mut view = sample.frame;
        prediction.apply(&mut view);
        let shown = view
            .players
            .iter()
            .find(|player| player.tag.is_you)
            .expect("local view")
            .transform
            .x;
        assert!((shown - (predicted + prediction.offset_x)).abs() < 1e-9);
    }
}
