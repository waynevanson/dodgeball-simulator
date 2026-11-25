//! Authoritative SpacetimeDB module.
//!
//! The simulation itself lives in `dodgeball-sim`. This module owns the
//! database lifecycle: it serialises the ECS world into a private table
//! between calls, runs the scheduled tick, accepts one input stream per
//! client, and publishes a presentation snapshot for subscribers.

use dodgeball_sim::constants::{DEFAULT_CUSTOM_NAME, PLAYER_NAME_MAX, ROSTER};
use dodgeball_sim::game::{self, flow, spawn};
use dodgeball_sim::resources::InputFrame;
use dodgeball_sim::types::{DifficultyId, Phase, Trigger};
use dodgeball_sim::world::World;
use spacetimedb::{reducer, table, Identity, ReducerContext, ScheduleAt, Table, Timestamp};

const TICK_MS: u64 = 50;
const TICK_SECONDS: f64 = TICK_MS as f64 / 1000.0;
const DEFAULT_SEED: u64 = 0x5EED_D06E_BA11;
const FRAME_ID: u32 = 0;
const SIM_ID: u32 = 0;
const STATE_ID: u32 = 0;

// --------------------------------------------------------------------- tables

/// The authoritative ECS world. It is deliberately private: clients only see
/// the presentation snapshot below.
#[table(accessor = sim_state)]
#[derive(Clone)]
pub struct SimState {
    #[primary_key]
    pub id: u32,
    pub data: Vec<u8>,
}

/// The latest `Frame` snapshot, encoded as JSON. Clients subscribe to this row;
/// every tick replaces it with the current presentation state.
#[table(accessor = frame_state, public)]
#[derive(Clone)]
pub struct FrameState {
    #[primary_key]
    pub id: u32,
    pub tick: u64,
    pub json: String,
}

/// Active client session. `owner_id` is the stable id the simulation stores on
/// the controlled player.
#[table(accessor = participant, public)]
#[derive(Clone)]
pub struct Participant {
    #[primary_key]
    pub identity: Identity,
    #[unique]
    pub owner_id: u64,
    pub name: String,
    pub team: Option<String>,
    pub slot: Option<u8>,
    pub spectator: bool,
}

/// Latest input from one client. Private: other clients cannot read it.
#[table(accessor = player_input)]
#[derive(Clone)]
pub struct PlayerInput {
    #[primary_key]
    pub identity: Identity,
    pub owner_id: u64,
    pub seq: u64,
    /// JSON-encoded `InputFrame`.
    pub data: String,
    pub updated_at: Timestamp,
}

/// Small amount of server bookkeeping that is not part of the simulation.
#[table(accessor = server_state)]
#[derive(Clone)]
pub struct ServerState {
    #[primary_key]
    pub id: u32,
    pub next_owner: u64,
    pub tick: u64,
}

/// The scheduled game loop. One row produces one `tick` call every 50 ms.
#[table(accessor = tick_timer, scheduled(tick))]
#[derive(Clone)]
pub struct TickTimer {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Transient sound/event notifications. Event rows are broadcast to subscribers
/// and then removed by SpacetimeDB.
#[table(accessor = game_event, public, event)]
#[derive(Clone)]
pub struct GameEvent {
    pub data: String,
}

// -------------------------------------------------------------------- helpers

fn encode_world(world: &World) -> Vec<u8> {
    bincode::serialize(world).expect("world serialization")
}

fn decode_world(bytes: &[u8]) -> Result<World, String> {
    bincode::deserialize(bytes).map_err(|error| format!("world deserialization failed: {error}"))
}

fn load_world(ctx: &ReducerContext) -> Result<World, String> {
    let row = ctx
        .db
        .sim_state()
        .id()
        .find(SIM_ID)
        .ok_or_else(|| "simulation state is missing".to_string())?;
    decode_world(&row.data)
}

fn save_world(ctx: &ReducerContext, world: &World) {
    let data = encode_world(world);
    if let Some(row) = ctx.db.sim_state().id().find(SIM_ID) {
        ctx.db.sim_state().id().update(SimState { data, ..row });
    } else {
        let _ = ctx.db.sim_state().insert(SimState { id: SIM_ID, data });
    }
}

fn write_frame(ctx: &ReducerContext, world: &World, tick: u64, acknowledge_inputs: bool) {
    let acks: std::collections::HashMap<u64, u64> = if acknowledge_inputs {
        ctx.db
            .player_input()
            .iter()
            .map(|row| (row.owner_id, row.seq))
            .collect()
    } else {
        std::collections::HashMap::new()
    };
    let mut frame = world.frame();
    for player in &mut frame.players {
        if let Some(owner) = player.tag.owner {
            player.last_input_seq = acks.get(&owner).copied().unwrap_or(0);
        }
    }
    let json = serde_json::to_string(&frame).expect("frame serialization");
    match ctx.db.frame_state().id().find(FRAME_ID) {
        Some(row) => {
            ctx.db
                .frame_state()
                .id()
                .update(FrameState { tick, json, ..row });
        }
        None => {
            let _ = ctx.db.frame_state().insert(FrameState {
                id: FRAME_ID,
                tick,
                json,
            });
        }
    }
}

fn ticker() -> TickTimer {
    TickTimer {
        scheduled_id: 0,
        scheduled_at: ScheduleAt::Interval(std::time::Duration::from_millis(TICK_MS).into()),
    }
}

fn initial_world() -> World {
    World::new_headless(DEFAULT_SEED, DifficultyId::Pro)
}

fn clean_name(name: &str) -> String {
    let cleaned: String = name.trim().split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned: String = cleaned.chars().take(PLAYER_NAME_MAX).collect();
    if cleaned.is_empty() {
        DEFAULT_CUSTOM_NAME.to_string()
    } else {
        cleaned
    }
}

fn team_from_row(value: Option<&str>) -> Option<dodgeball_sim::types::Team> {
    match value {
        Some("blue") => Some(dodgeball_sim::types::Team::Blue),
        Some("red") => Some(dodgeball_sim::types::Team::Red),
        _ => None,
    }
}

fn team_name(team: dodgeball_sim::types::Team) -> String {
    match team {
        dodgeball_sim::types::Team::Blue => "blue".to_string(),
        dodgeball_sim::types::Team::Red => "red".to_string(),
    }
}

fn occupied_slot(ctx: &ReducerContext, team: &str) -> Vec<u8> {
    ctx.db
        .participant()
        .iter()
        .filter(|row| !row.spectator && row.team.as_deref() == Some(team))
        .filter_map(|row| row.slot)
        .collect()
}

fn first_free_slot(occupied: &[u8]) -> Option<u8> {
    (0..ROSTER as u8).find(|slot| !occupied.contains(slot))
}

fn next_owner(ctx: &ReducerContext) -> u64 {
    ctx.db
        .server_state()
        .id()
        .find(STATE_ID)
        .map(|state| state.next_owner)
        .unwrap_or(1)
}

fn write_server_state(ctx: &ReducerContext, state: &ServerState) {
    match ctx.db.server_state().id().find(STATE_ID) {
        Some(_) => {
            ctx.db.server_state().id().update(state.clone());
        }
        None => {
            let _ = ctx.db.server_state().insert(state.clone());
        }
    }
}

fn sync_frame(ctx: &ReducerContext, world: &World) {
    let tick = ctx
        .db
        .server_state()
        .id()
        .find(STATE_ID)
        .map(|state| state.tick)
        .unwrap_or(0);
    write_frame(ctx, world, tick, false);
}

/// Attach or detach a client from a simulation player. Returns whether the
/// player actually exists.
fn set_owner(
    ctx: &ReducerContext,
    world: &mut World,
    team: dodgeball_sim::types::Team,
    slot: u8,
    owner: Option<u64>,
    name: Option<&str>,
) {
    spawn::assign_owner(world, team, slot as usize, owner, name);
    save_world(ctx, world);
    sync_frame(ctx, world);
}

// -------------------------------------------------------------------- lifecycle

#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    let world = initial_world();
    let _ = ctx.db.sim_state().insert(SimState {
        id: SIM_ID,
        data: encode_world(&world),
    });
    let _ = ctx.db.server_state().insert(ServerState {
        id: STATE_ID,
        next_owner: 1,
        tick: 0,
    });
    let _ = ctx.db.frame_state().insert(FrameState {
        id: FRAME_ID,
        tick: 0,
        json: serde_json::to_string(&world.frame()).expect("frame serialization"),
    });
    let _ = ctx.db.tick_timer().insert(ticker());
}

/// Safe to call after republishing an existing database (where `init` does not
/// run again). It does nothing if the loop is already running.
#[reducer]
pub fn ensure_tick(ctx: &ReducerContext) {
    if ctx.db.tick_timer().iter().next().is_none() {
        let _ = ctx.db.tick_timer().insert(ticker());
    }
}

// -------------------------------------------------------------------- reducers

/// Join the arena with a display name. Teams and slots are assigned
/// automatically; the 13th player onward becomes a spectator.
#[reducer]
pub fn join(ctx: &ReducerContext, name: String) -> Result<(), String> {
    let identity = ctx.sender();

    if let Some(mut existing) = ctx.db.participant().identity().find(identity) {
        existing.name = clean_name(&name);
        ctx.db.participant().identity().update(existing.clone());

        // A reloaded browser starts its input sequence at zero. Reset the
        // server side too so the first few inputs are not discarded as stale.
        if let Some(mut input) = ctx.db.player_input().identity().find(identity) {
            input.seq = 0;
            input.data =
                serde_json::to_string(&InputFrame::default()).unwrap_or_else(|_| "{}".to_string());
            input.updated_at = ctx.timestamp;
            ctx.db.player_input().identity().update(input);
        }

        if !existing.spectator {
            let team = team_from_row(existing.team.as_deref());
            let slot = existing.slot.unwrap_or(0);
            if let Some(team) = team {
                let mut world = load_world(ctx)?;
                set_owner(
                    ctx,
                    &mut world,
                    team,
                    slot,
                    Some(existing.owner_id),
                    Some(&existing.name),
                );
            }
        }
        return Ok(());
    }

    let blue = occupied_slot(ctx, "blue");
    let red = occupied_slot(ctx, "red");
    let blue_count = blue.len();
    let red_count = red.len();
    let (team, slot) = if blue_count < ROSTER && blue_count <= red_count {
        match first_free_slot(&blue) {
            Some(slot) => (Some(dodgeball_sim::types::Team::Blue), Some(slot)),
            None => (None, None),
        }
    } else if red_count < ROSTER {
        match first_free_slot(&red) {
            Some(slot) => (Some(dodgeball_sim::types::Team::Red), Some(slot)),
            None => (None, None),
        }
    } else {
        (None, None)
    };

    let owner_id = next_owner(ctx);
    let mut state = ctx
        .db
        .server_state()
        .id()
        .find(STATE_ID)
        .unwrap_or(ServerState {
            id: STATE_ID,
            next_owner: 1,
            tick: 0,
        });
    state.next_owner = state.next_owner.saturating_add(1);
    write_server_state(ctx, &state);

    let display = clean_name(&name);
    let (team_row, slot_row) = match (team, slot) {
        (Some(team), Some(slot)) => (Some(team_name(team)), Some(slot)),
        _ => (None, None),
    };

    let _ = ctx.db.participant().insert(Participant {
        identity,
        owner_id,
        name: display.clone(),
        team: team_row,
        slot: slot_row,
        spectator: team.is_none(),
    });

    let _ = ctx.db.player_input().insert(PlayerInput {
        identity,
        owner_id,
        seq: 0,
        data: serde_json::to_string(&InputFrame::default()).expect("input serialization"),
        updated_at: ctx.timestamp,
    });

    if let (Some(team), Some(slot)) = (team, slot) {
        let mut world = load_world(ctx)?;
        set_owner(ctx, &mut world, team, slot, Some(owner_id), Some(&display));
    } else {
        let world = load_world(ctx)?;
        sync_frame(ctx, &world);
    }

    Ok(())
}

/// Update the local display name, including the name of the controlled player.
#[reducer]
pub fn set_name(ctx: &ReducerContext, name: String) -> Result<(), String> {
    let identity = ctx.sender();
    let Some(mut participant) = ctx.db.participant().identity().find(identity) else {
        return Ok(());
    };
    participant.name = clean_name(&name);
    ctx.db.participant().identity().update(participant.clone());

    if !participant.spectator {
        if let (Some(team), Some(slot)) =
            (team_from_row(participant.team.as_deref()), participant.slot)
        {
            let mut world = load_world(ctx)?;
            set_owner(
                ctx,
                &mut world,
                team,
                slot,
                Some(participant.owner_id),
                Some(&participant.name),
            );
        }
    }
    Ok(())
}

/// Latest input for the caller. The client sends this at 15-20 Hz, not once per
/// rendered frame. `data` is an `InputFrame` JSON object.
#[reducer]
pub fn set_input(ctx: &ReducerContext, seq: u64, data: String) -> Result<(), String> {
    let identity = ctx.sender();
    let Some(participant) = ctx.db.participant().identity().find(identity) else {
        return Ok(());
    };
    if participant.spectator {
        return Ok(());
    }

    if data.len() > 4096 {
        return Err("input frame too large".to_string());
    }
    let input: InputFrame =
        serde_json::from_str(&data).map_err(|error| format!("invalid input frame: {error}"))?;

    if let Some(mut row) = ctx.db.player_input().identity().find(identity) {
        if seq <= row.seq {
            return Ok(());
        }
        // The real client sends every 50 ms; reject abusive transaction spam
        // without dropping a normal input update.
        let since_last = ctx
            .timestamp
            .duration_since(row.updated_at)
            .map(|age| age.as_secs_f64())
            .unwrap_or(0.0);
        if since_last < 0.008 {
            return Ok(());
        }
        row.seq = seq;
        row.owner_id = participant.owner_id;
        row.data = serde_json::to_string(&input).map_err(|error| error.to_string())?;
        row.updated_at = ctx.timestamp;
        ctx.db.player_input().identity().update(row);
    }
    Ok(())
}

/// Start a fresh match. Any joined player may ask; the server ignores the
/// request while a set is in progress.
#[reducer]
pub fn start_match(ctx: &ReducerContext) -> Result<(), String> {
    let identity = ctx.sender();
    let Some(participant) = ctx.db.participant().identity().find(identity) else {
        return Ok(());
    };
    if participant.spectator {
        return Ok(());
    }

    let mut world = load_world(ctx)?;
    if matches!(
        world.phase.id,
        Phase::Playing | Phase::Countdown | Phase::SetOver
    ) {
        return Ok(());
    }
    flow::send(&mut world, Trigger::Start);
    save_world(ctx, &world);
    sync_frame(ctx, &world);
    Ok(())
}

/// Leave the arena. The player slot is handed back to the AI.
#[reducer]
pub fn leave(ctx: &ReducerContext) {
    if let Some(participant) = ctx.db.participant().identity().find(ctx.sender()) {
        if !participant.spectator {
            if let (Some(team), Some(slot)) =
                (team_from_row(participant.team.as_deref()), participant.slot)
            {
                if let Ok(mut world) = load_world(ctx) {
                    set_owner(ctx, &mut world, team, slot, None, None);
                }
            }
        }
        let _ = ctx.db.participant().identity().delete(participant.identity);
        let _ = ctx.db.player_input().identity().delete(ctx.sender());

        // If that was the last human, do not leave a frozen mid-match arena
        // behind for the next person who joins.
        let remaining = ctx
            .db
            .participant()
            .iter()
            .filter(|row| !row.spectator)
            .count();
        if remaining == 0 {
            if let Ok(mut world) = load_world(ctx) {
                if world.phase.id != Phase::Menu {
                    flow::send(&mut world, Trigger::Menu);
                    game::tick_with_inputs(&mut world, TICK_SECONDS, &[]);
                    save_world(ctx, &world);
                    sync_frame(ctx, &world);
                }
            }
        }
    }
}

#[reducer(client_disconnected)]
pub fn client_disconnected(ctx: &ReducerContext) {
    leave(ctx);
}

// ------------------------------------------------------------------------ tick

#[reducer]
pub fn tick(ctx: &ReducerContext, _timer: TickTimer) {
    // Do not open a transaction, load the world or write a frame while nobody
    // is actually playing. The database can then idle at zero cost.
    let active_players = ctx
        .db
        .participant()
        .iter()
        .filter(|row| !row.spectator)
        .count();
    if active_players == 0 {
        return;
    }

    let Ok(mut world) = load_world(ctx) else {
        return;
    };

    // Lobby and results screens are static. Avoid writing a frame and a
    // fresh world every 50 ms until somebody asks to start or leaves.
    if matches!(
        world.phase.id,
        Phase::Menu | Phase::MatchOver | Phase::Paused
    ) && world.pending.is_empty()
    {
        return;
    }

    let mut inputs: Vec<(dodgeball_sim::ecs::Entity, InputFrame)> = Vec::new();
    let mut clear_edges: Vec<Identity> = Vec::new();

    for row in ctx.db.player_input().iter() {
        let Ok(mut input) = serde_json::from_str::<InputFrame>(&row.data) else {
            continue;
        };

        // A client that has stopped sending input must not keep charging or
        // moving forever.
        let stale = ctx
            .timestamp
            .duration_since(row.updated_at)
            .map(|age| age.as_secs_f64() > 1.25)
            .unwrap_or(false);
        if stale {
            input = InputFrame::default();
        }

        if let Some(entity) = world.player_by_owner(row.owner_id) {
            let had_edge = input.dash
                || input.catch
                || input.right_pressed
                || input.touch_dash
                || input.touch_catch;
            if had_edge {
                clear_edges.push(row.identity);
            }
            inputs.push((entity, input));
        }
    }

    let humans = world
        .players
        .iter()
        .filter(|(_, player)| player.tag.is_human)
        .count();
    if humans == 0 {
        if world.phase.id != Phase::Menu {
            flow::send(&mut world, Trigger::Menu);
            game::tick_with_inputs(&mut world, TICK_SECONDS, &[]);
            save_world(ctx, &world);
            sync_frame(ctx, &world);
        }
        return;
    }

    let mut state = ctx
        .db
        .server_state()
        .id()
        .find(STATE_ID)
        .unwrap_or(ServerState {
            id: STATE_ID,
            next_owner: 1,
            tick: 0,
        });
    state.tick = state.tick.saturating_add(1);
    write_server_state(ctx, &state);

    game::tick_with_inputs(&mut world, TICK_SECONDS, &inputs);

    // One-shot input is consumed exactly once. The client's next regular input
    // update will set the edge flags again only if the key was pressed again.
    for identity in clear_edges {
        if let Some(mut row) = ctx.db.player_input().identity().find(identity) {
            if let Ok(mut input) = serde_json::from_str::<InputFrame>(&row.data) {
                input.dash = false;
                input.catch = false;
                input.right_pressed = false;
                input.touch_dash = false;
                input.touch_catch = false;
                if let Ok(serialized) = serde_json::to_string(&input) {
                    row.data = serialized;
                    ctx.db.player_input().identity().update(row);
                }
            }
        }
    }

    for event in std::mem::take(&mut world.events) {
        if let Ok(data) = serde_json::to_string(&event) {
            let _ = ctx.db.game_event().insert(GameEvent { data });
        }
    }

    save_world(ctx, &world);
    write_frame(ctx, &world, state.tick, true);
}
