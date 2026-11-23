use crate::components::*;
use crate::constants::*;
use crate::ecs::Entity;
use crate::math::TAU;
use crate::resources::*;
use crate::types::{difficulty, Team};
use crate::world::World;

/// Rule 13.1 / 9.3: both teams line up with a foot on the back line.
pub const BACKLINE_Y: [f64; ROSTER] = [-225.0, -135.0, -45.0, 45.0, 135.0, 225.0];

pub fn spawns(team: Team) -> [(f64, f64); ROSTER] {
    let x = match team {
        Team::Blue => COURT.x + PLAYER_RADIUS + 2.0,
        Team::Red => COURT.right - PLAYER_RADIUS - 2.0,
    };
    let mut result = [(0.0, 0.0); ROSTER];
    let mut index = 0;
    while index < ROSTER {
        result[index] = (x, COURT.cy + BACKLINE_Y[index]);
        index += 1;
    }
    result
}

/// Rule 12.1.2 (Foam): three balls per team on the centre line, 1.5m apart.
pub const BALL_SPAWNS: [(f64, f64); BALL_COUNT] = [
    (COURT.cx - 22.0, COURT.cy - BALL_MARK_SPACING),
    (COURT.cx - 22.0, COURT.cy),
    (COURT.cx - 22.0, COURT.cy + BALL_MARK_SPACING),
    (COURT.cx + 22.0, COURT.cy - BALL_MARK_SPACING),
    (COURT.cx + 22.0, COURT.cy),
    (COURT.cx + 22.0, COURT.cy + BALL_MARK_SPACING),
];

pub fn home_facing(team: Team) -> f64 {
    match team {
        Team::Blue => 0.0,
        Team::Red => std::f64::consts::PI,
    }
}

pub fn spawn_match(world: &mut World) {
    world.clock = Clock::default();
    world.feedback = Feedback::default();
    world.set = SetState { id: 0, resolved: true, ..SetState::default() };
    world.rush = Rush::default();
    world.shot = Shot { team: None, clock: SHOT_CLOCK, beep: 99 };
    world.queues = Queues::default();
    world.warnings = Warnings::default();
    world.lineup = Lineup { human_slot: CUSTOM_SLOT, custom_name: DEFAULT_CUSTOM_NAME.to_string() };
    world.last_throw = LastThrow::default();
    world.last_set = LastSet::default();
    world.claims.clear();
    world.events.clear();
    world.pending.clear();

    // A fresh red team every page load, seeded by the caller.
    let mut names = RED_NAMES.to_vec();
    world.rng.shuffle(&mut names);
    let mut numbers: Vec<u32> = (10..=99).collect();
    world.rng.shuffle(&mut numbers);
    world.red_roster = (0..ROSTER)
        .map(|index| RosterEntry {
            name: names[index],
            number: numbers[index],
            human: false,
            glasses: false,
        })
        .collect();

    for team in Team::ALL {
        for slot in 0..ROSTER {
            let entry = match team {
                Team::Blue => RosterEntry {
                    name: BLUE_LINEUP[slot].name,
                    number: BLUE_LINEUP[slot].number,
                    human: false,
                    glasses: BLUE_LINEUP[slot].glasses,
                },
                Team::Red => RosterEntry {
                    name: world.red_roster[slot].name,
                    number: world.red_roster[slot].number,
                    human: false,
                    glasses: false,
                },
            };
            let (x, y) = spawns(team)[slot];
            let entity = world.spawn();
            let phase = world.rng.range(0.0, TAU);

            world.players.insert(
                entity,
                Player {
                    transform: Transform {
                        x,
                        y,
                        vx: 0.0,
                        vy: 0.0,
                        radius: PLAYER_RADIUS,
                        facing: home_facing(team),
                    },
                    tag: PlayerTag {
                        name: entry.name.to_string(),
                        number: entry.number,
                        team,
                        slot,
                        is_human: entry.human,
                        glasses: entry.glasses,
                    },
                    condition: Condition {
                        alive: true,
                        has_glasses: entry.glasses,
                        ..Condition::default()
                    },
                    carry: None,
                    action: Action { dash_x: 1.0, ..Action::default() },
                    cooldowns: Cooldowns::default(),
                    intent: Intent::default(),
                    brain: Brain {
                        phase,
                        anchor_x: x,
                        anchor_y: y,
                        ..Brain::default()
                    },
                    trail: Trail::default(),
                    stats: PlayerStats::default(),
                },
            );
        }
    }

    for index in 0..BALL_COUNT {
        let (x, y) = BALL_SPAWNS[index % BALL_SPAWNS.len()];
        let entity = world.spawn();
        world.balls.insert(
            entity,
            Ball {
                transform: Transform {
                    x,
                    y,
                    radius: BALL_RADIUS,
                    ..Transform::default()
                },
                tag: BallTag {
                    spin: world.rng.range(0.0, TAU),
                    bob: world.rng.range(0.0, TAU),
                    ..BallTag::default()
                },
                state: BallState::default(),
                held_by: None,
                trail: Trail::default(),
            },
        );
        place_ball(world, entity, x, y);
    }

    set_lineup(world, CUSTOM_SLOT, DEFAULT_CUSTOM_NAME);
}

/// Choose which blue player the human controls and apply the custom sixth name.
pub fn set_lineup(world: &mut World, human_slot: usize, custom_name: &str) {
    let slot = human_slot.min(ROSTER - 1);
    let cleaned: String = custom_name
        .trim()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let cleaned: String = cleaned.chars().take(PLAYER_NAME_MAX).collect();
    let custom = if cleaned.is_empty() { DEFAULT_CUSTOM_NAME.to_string() } else { cleaned };

    world.lineup.human_slot = slot;
    world.lineup.custom_name = custom.clone();

    for entity in world.players_vec() {
        let Some(player) = world.player_mut(entity) else { continue };
        if player.tag.team != Team::Blue {
            continue;
        }
        player.tag.name = if player.tag.slot == CUSTOM_SLOT {
            custom.clone()
        } else {
            BLUE_LINEUP[player.tag.slot].name.to_string()
        };
        player.tag.is_human = player.tag.slot == slot;
    }
}

/// Push the match difficulty onto every AI brain.
pub fn apply_difficulty(world: &mut World) {
    let chosen = difficulty(world.match_state.difficulty);
    for (_, player) in world.players.iter_mut() {
        player.brain.diff = if player.tag.is_human { None } else { Some(chosen) };
    }
}

pub fn start_set(world: &mut World) {
    world.set.id += 1;
    world.set.resolved = false;
    world.set.winner = None;
    world.set.elapsed = 0.0;
    world.set.sudden_death = false;
    world.rush.active = true;
    world.last_throw.team = None;
    world.shot = Shot { team: None, clock: SHOT_CLOCK, beep: 99 };
    world.warnings = Warnings::default();
    world.queues = Queues::default();
    world.feedback.slowmo = 0.0;
    world.feedback.shake = 0.0;
    world.feedback.flash = 0.0;
    world.claims.clear();

    setup_formation(world);
    apply_difficulty(world);
}

pub fn to_menu(world: &mut World) {
    world.set.id = 0;
    world.set.resolved = true;
    world.set.winner = None;
    world.set.elapsed = 0.0;
    world.set.sudden_death = false;
    world.rush.active = false;
    world.last_throw.team = None;
    world.shot = Shot { team: None, clock: SHOT_CLOCK, beep: 99 };
    world.warnings = Warnings::default();
    world.queues = Queues::default();
    world.feedback.slowmo = 0.0;
    world.feedback.shake = 0.0;
    world.feedback.flash = 0.0;
    world.claims.clear();

    setup_formation(world);
}

pub fn setup_formation(world: &mut World) {
    clear_effects(world);

    let player_entities = world.players_vec();
    for entity in player_entities {
        let Some(player) = world.player(entity) else { continue };
        let (x, y) = spawns(player.tag.team)[player.tag.slot];
        reset_player(world, entity, x, y);
    }

    let ball_entities = world.balls_vec();
    for (index, entity) in ball_entities.iter().enumerate() {
        let (x, y) = BALL_SPAWNS[index % BALL_SPAWNS.len()];
        place_ball(world, *entity, x, y);
    }
}

pub fn reset_player(world: &mut World, entity: Entity, x: f64, y: f64) {
    let Some(player) = world.player_mut(entity) else { return };
    player.transform.x = x;
    player.transform.y = y;
    player.transform.vx = 0.0;
    player.transform.vy = 0.0;
    player.transform.facing = home_facing(player.tag.team);

    player.condition.alive = true;
    player.condition.has_glasses = player.tag.glasses;
    player.condition.entering_time = 0.0;
    player.condition.hit_flash = 0.0;
    player.condition.out_at = 0.0;
    player.condition.out_x = x;
    player.condition.out_y = y;

    player.carry = None;

    player.action = Action { dash_x: 1.0, ..Action::default() };
    player.cooldowns = Cooldowns::default();
    player.trail.points.clear();
    player.stats = PlayerStats::default();

    player.brain.seek = None;
    player.brain.target = None;
    player.brain.target_timer = 0.0;
    player.brain.aim_timer = 0.0;
    player.brain.release_delay = 0.0;
    player.brain.catch_ball = None;
    player.brain.will_catch = false;
    player.brain.anchor_x = x;
    player.brain.anchor_y = y;
    player.brain.anchor_timer = 0.0;
}

/// Rule 25.2: return from the queue over the back line.
pub fn reenter_player(world: &mut World, entity: Entity) {
    let Some(player) = world.player_mut(entity) else { return };
    let (x, y) = spawns(player.tag.team)[player.tag.slot];
    player.condition.alive = true;
    player.transform.x = x;
    player.transform.y = y;
    player.transform.vx = 0.0;
    player.transform.vy = 0.0;
    player.carry = None;
    player.action.charge = 0.0;
    player.action.charging = false;
    player.action.dash_time = 0.0;
    player.action.dash_cd = 0.2;
    player.cooldowns.catch_window = 0.0;
    player.cooldowns.catch_cd = 0.4;
    player.cooldowns.throw_cd = 0.0;
    player.cooldowns.pickup_cd = 0.3;
    player.condition.hit_flash = 0.0;
    player.condition.entering_time = ENTER_GRACE;
    player.condition.out_at = 0.0;
    player.trail.points.clear();
    player.brain.seek = None;
    player.brain.target = None;
    player.brain.target_timer = 0.0;
    player.brain.release_delay = 0.0;
    player.brain.catch_ball = None;
    player.brain.will_catch = false;
}

pub fn place_ball(world: &mut World, entity: Entity, x: f64, y: f64) {
    let Some(ball) = world.ball_mut(entity) else { return };
    ball.held_by = None;
    ball.state = BallState {
        live: false,
        armed: false,
        rush: true,
        can_out: true,
        ..BallState::default()
    };
    ball.transform.x = x;
    ball.transform.y = y;
    ball.transform.vx = 0.0;
    ball.transform.vy = 0.0;
    ball.tag.age = 0.0;
    ball.trail.points.clear();
}

pub fn clear_effects(world: &mut World) {
    for entity in world.particles.entities() {
        world.despawn(entity);
    }
    for entity in world.floaters.entities() {
        world.despawn(entity);
    }
    for entity in world.glasses.entities() {
        world.despawn(entity);
    }
}
