//! SpacetimeDB transport. The renderer never talks to the SDK directly; it
//! consumes the `ClientState` snapshot resource.

use bevy::prelude::*;

#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct NetSet;
use bevy_stdb::prelude::*;
use dodgeball_bindings::{
    ensure_tick, join, set_input, set_name, start_match, DbConnection, FrameState,
    FrameStateTableAccessor, GameEvent, GameEventTableAccessor, Participant,
    ParticipantTableAccessor, RemoteModule,
};
use dodgeball_sim::resources::InputFrame;
use dodgeball_sim::types::SfxEvent;

use crate::audio::SoundBank;

use crate::input::InputState;
use crate::model::{ClientState, ConnectionState};
use crate::platform;
use crate::predict::Prediction;

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum SubKey {
    Frames,
    Participants,
    Events,
}

#[derive(Resource, Default)]
pub struct ArenaSession {
    pub connected: bool,
    pub joined: bool,
    pub seq: u64,
    pub last_input_at: f64,
}

pub struct NetConfig {
    pub uri: String,
    pub database: String,
    pub token: Option<String>,
}

pub fn add_network(app: &mut App, config: NetConfig) {
    let mut plugin = StdbPlugin::<DbConnection, RemoteModule>::default()
        .with_database_name(config.database)
        .with_uri(config.uri)
        .with_reconnect(StdbReconnectOptions::default())
        .with_subscriptions::<SubKey>()
        .add_table::<FrameStateTableAccessor>()
        .add_table::<ParticipantTableAccessor>()
        .add_event_table::<GameEventTableAccessor>()
        .with_eager_connection();

    if let Some(token) = config.token {
        plugin = plugin.with_token(token);
    }

    #[cfg(target_arch = "wasm32")]
    let plugin = plugin.with_background_driver(DbConnection::run_background_task);
    #[cfg(not(target_arch = "wasm32"))]
    let plugin = plugin.with_background_driver(DbConnection::run_threaded);

    app.add_plugins(plugin);
    app.configure_sets(Update, NetSet);
    app.init_resource::<ArenaSession>();
    app.add_systems(
        Update,
        (
            on_connected,
            on_disconnected,
            on_connect_error,
            join_after_connect,
            read_participants,
            read_deleted_participants,
            read_frames,
            read_game_events,
            log_subscriptions,
        )
            .in_set(NetSet),
    );
}

fn on_connected(
    mut connected: ReadStdbConnectedMessage,
    mut subs: ResMut<StdbSubscriptions<SubKey, RemoteModule>>,
    mut state: ResMut<ClientState>,
    mut session: ResMut<ArenaSession>,
) {
    for message in connected.read() {
        debug!("SpacetimeDB connected");
        state.connection = ConnectionState::Online;
        session.connected = true;
        platform::save_token(&state.uri, &state.database, &message.access_token);
        subs.subscribe_sql(SubKey::Frames, "SELECT * FROM frame_state");
        subs.subscribe_sql(SubKey::Participants, "SELECT * FROM participant");
        subs.subscribe_sql(SubKey::Events, "SELECT * FROM game_event");
    }
}

fn on_disconnected(
    mut disconnected: ReadStdbDisconnectedMessage,
    mut state: ResMut<ClientState>,
    mut session: ResMut<ArenaSession>,
) {
    for message in disconnected.read() {
        if !message.was_requested() {
            state.connection = ConnectionState::Offline;
        }
        session.connected = false;
        session.joined = false;
    }
}

fn on_connect_error(
    mut errors: ReadStdbConnectErrorMessage,
    mut state: ResMut<ClientState>,
    mut session: ResMut<ArenaSession>,
) {
    for _ in errors.read() {
        state.connection = ConnectionState::Error;
        session.connected = false;
        session.joined = false;
    }
}

fn join_after_connect(
    connection: Option<Res<StdbConnection<DbConnection>>>,
    mut session: ResMut<ArenaSession>,
    state: Res<ClientState>,
) {
    let Some(connection) = connection else {
        return;
    };
    if !session.connected || session.joined || connection.try_identity().is_none() {
        return;
    }
    if let Err(error) = connection.reducers().ensure_tick_then(|_ctx, result| {
        debug!("ensure_tick result: {result:?}");
    }) {
        warn!("ensure_tick failed: {error}");
    }
    debug!("joining arena as {}", state.player_name);
    let autostart = state.autostart;
    if let Err(error) =
        connection
            .reducers()
            .join_then(state.player_name.clone(), move |ctx, result| {
                debug!("join result: {result:?}");
                if autostart && matches!(&result, Ok(Ok(()))) {
                    debug!("autostarting match");
                    match ctx.reducers.start_match() {
                        Ok(()) => debug!("autostart reducer sent"),
                        Err(error) => warn!("autostart failed: {error}"),
                    }
                }
            })
    {
        warn!("join failed: {error}");
        return;
    }
    session.joined = true;
}

fn read_frames(
    mut frames: ReadInsertUpdateMessage<FrameState>,
    mut state: ResMut<ClientState>,
    time: Res<Time>,
) {
    let now = time.elapsed_secs_f64();
    let mut newest = None;
    for message in frames.read() {
        newest = Some((message.new.json.clone(), message.new.tick));
    }
    let Some((json, tick)) = newest else {
        return;
    };
    if std::env::var_os("DODGEBALL_LOG_FRAMES").is_some() {
        debug!("frame {tick}");
    }
    match serde_json::from_str(&json) {
        Ok(frame) => {
            state.push_frame(frame, now, tick);
            if state.connection == ConnectionState::Connecting {
                state.connection = if state.spectator {
                    ConnectionState::Spectating
                } else {
                    ConnectionState::Online
                };
            }
        }
        Err(error) => warn!("invalid frame snapshot: {error}"),
    }
}

fn read_participants(
    mut participants: ReadInsertUpdateMessage<Participant>,
    connection: Option<Res<StdbConnection<DbConnection>>>,
    mut state: ResMut<ClientState>,
) {
    let Some(connection) = connection else {
        return;
    };
    let Some(identity) = connection.try_identity() else {
        return;
    };
    for message in participants.read() {
        let row = message.new;
        if row.identity == identity {
            state.local_owner = Some(row.owner_id);
            state.spectator = row.spectator;
            state.slot = row.slot;
            state.player_name = row.name.clone();
            state.connection = if row.spectator {
                ConnectionState::Spectating
            } else {
                ConnectionState::Online
            };
        }
    }
}

fn read_deleted_participants(
    mut participants: ReadDeleteMessage<Participant>,
    connection: Option<Res<StdbConnection<DbConnection>>>,
    mut state: ResMut<ClientState>,
) {
    let Some(connection) = connection else {
        return;
    };
    let Some(identity) = connection.try_identity() else {
        return;
    };
    for message in participants.read() {
        if message.row.identity == identity {
            state.local_owner = None;
            state.spectator = true;
        }
    }
}

fn log_subscriptions(
    mut applied: ReadStdbSubscriptionAppliedMessage<SubKey>,
    mut errors: ReadStdbSubscriptionErrorMessage<SubKey>,
) {
    for message in applied.read() {
        debug!("subscription applied: {:?}", message.key);
    }
    for message in errors.read() {
        warn!("subscription failed: {:?}: {}", message.key, message.err);
    }
}

fn read_game_events(
    mut events: ReadInsertMessage<GameEvent>,
    state: Res<ClientState>,
    bank: Res<SoundBank>,
    mut commands: Commands,
) {
    for event in events.read() {
        if std::env::var_os("DODGEBALL_LOG_EVENTS").is_some() {
            debug!("game event: {}", event.row.data);
        }
        match serde_json::from_str::<SfxEvent>(&event.row.data) {
            Ok(sfx) => bank.play(&mut commands, state.muted, sfx),
            Err(error) => debug!("unrecognised game event {}: {error}", event.row.data),
        }
    }
}

pub fn send_input(
    connection: Option<Res<StdbConnection<DbConnection>>>,
    mut input: ResMut<InputState>,
    state: Res<ClientState>,
    mut session: ResMut<ArenaSession>,
    mut prediction: ResMut<Prediction>,
    time: Res<Time>,
) {
    let Some(connection) = connection else {
        return;
    };
    if !session.joined || state.spectator {
        return;
    }
    let now = time.elapsed_secs_f64();
    if now - session.last_input_at < 0.05 {
        return;
    }
    session.last_input_at = now;
    session.seq = session.seq.wrapping_add(1);
    let frame: InputFrame = input.build_frame(&state);
    let data = match serde_json::to_string(&frame) {
        Ok(data) => data,
        Err(error) => {
            warn!("input serialization failed: {error}");
            return;
        }
    };
    if let Err(error) = connection.reducers().set_input(session.seq, data) {
        warn!("set_input failed: {error}");
        return;
    }
    prediction.push_input(session.seq, frame);
    input.mark_sent();
}

pub fn request_start_match(connection: Option<&StdbConnection<DbConnection>>) {
    if let Some(connection) = connection {
        if let Err(error) = connection.reducers().start_match() {
            warn!("start_match failed: {error}");
        }
    }
}

pub fn request_set_name(connection: Option<&StdbConnection<DbConnection>>, name: &str) {
    if let Some(connection) = connection {
        if let Err(error) = connection.reducers().set_name(name.to_string()) {
            warn!("set_name failed: {error}");
        }
    }
}
