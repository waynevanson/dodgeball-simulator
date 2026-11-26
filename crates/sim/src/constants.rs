//! Every physical constant the rules depend on, in the same 1280x720 logical
//! space the renderer uses.


pub const VIEW_W: f64 = 1280.0;
pub const VIEW_H: f64 = 720.0;

pub struct Court {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub right: f64,
    pub bottom: f64,
    pub cx: f64,
    pub cy: f64,
}

/// Playing court: 18m x 9m (VDL Rule 1.1) mapped onto 1196 x 544 px.
pub const COURT: Court = Court {
    x: 42.0,
    y: 116.0,
    w: 1196.0,
    h: 544.0,
    right: 1238.0,
    bottom: 660.0,
    cx: 640.0,
    cy: 388.0,
};

pub const PX_PER_METRE: f64 = COURT.w / 18.0;

pub const PLAYER_RADIUS: f64 = 17.0;
pub const BALL_RADIUS: f64 = 10.0;

/// Rule 1.3.4: attack line exactly 3m from the centre line (~199px).
pub const ATTACK_DIST: f64 = 199.0;
/// Rule 12.1.2: balls 1.5m apart on the centre line (~100px).
pub const BALL_MARK_SPACING: f64 = 100.0;
/// Rule 16.1: a valid attempt passes within 1m (~66px).
pub const NEAR_MISS: f64 = 66.0;
pub const RUSH_CROSS: f64 = 26.0;

pub const ROSTER: usize = 6;
pub const PLAYER_NAME_MAX: usize = 12;
pub const DEFAULT_CUSTOM_NAME: &str = "Crispy";
pub const CUSTOM_SLOT: usize = ROSTER - 1;

pub const WINS_NEEDED: u32 = 3;
pub const BALL_COUNT: usize = 6;
pub const SHOT_CLOCK: f64 = 10.0;
pub const SHOT_CLOCK_WARN: f64 = 5.0;
pub const SUDDEN_DEATH_AFTER: f64 = 120.0;
pub const ENTER_GRACE: f64 = 0.7;
pub const COUNTDOWN_MS: f64 = 3100.0;
pub const SET_BREAK_MS: f64 = 3000.0;
pub const COUNTDOWN_SECONDS: f64 = COUNTDOWN_MS / 1000.0;

pub struct Physics {
    pub speed: f64,
    pub dash_speed: f64,
    pub dash_time: f64,
    pub dash_cd: f64,
    pub charge_time: f64,
    pub throw_min: f64,
    pub throw_max: f64,
    pub throw_cd: f64,
    pub catch_window: f64,
    pub catch_cd: f64,
    pub ball_drag: f64,
    pub ball_drag_free: f64,
    pub ball_live_speed: f64,
    pub wall_damp: f64,
    pub block_retain: f64,
    pub block_min_speed: f64,
}

pub const PHYS: Physics = Physics {
    speed: 270.0,
    dash_speed: 790.0,
    dash_time: 0.16,
    dash_cd: 1.05,
    charge_time: 0.6,
    throw_min: 540.0,
    throw_max: 1330.0,
    throw_cd: 0.26,
    catch_window: 0.32,
    catch_cd: 0.95,
    ball_drag: 1.0,
    ball_drag_free: 2.4,
    ball_live_speed: 320.0,
    wall_damp: 0.3,
    block_retain: 0.8,
    block_min_speed: 380.0,
};

pub struct RosterEntry {
    pub name: &'static str,
    pub number: u32,
    pub human: bool,
    pub glasses: bool,
}

pub const BLUE_LINEUP: [RosterEntry; ROSTER] = [
    RosterEntry { name: "Norris", number: 1, human: false, glasses: true },
    RosterEntry { name: "Wayne", number: 2, human: false, glasses: false },
    RosterEntry { name: "Alex", number: 3, human: false, glasses: false },
    RosterEntry { name: "Alycia", number: 4, human: false, glasses: false },
    RosterEntry { name: "Kurt", number: 5, human: false, glasses: false },
    RosterEntry { name: DEFAULT_CUSTOM_NAME, number: 6, human: false, glasses: false },
];

pub const RED_NAMES: [&str; 20] = [
    "Jordan", "Maya", "Ethan", "Priya", "Lucas", "Chloe", "Marcus", "Sofia", "Noah", "Grace",
    "Liam", "Amara", "Oliver", "Nina", "Caleb", "Ruby", "Theo", "Isla", "Isaac", "Tara",
];

/// Team palette for the few effects the simulation itself paints.
pub fn team_main(team: crate::types::Team) -> &'static str {
    match team {
        crate::types::Team::Blue => "#5b93ff",
        crate::types::Team::Red => "#ff5f73",
    }
}

pub fn team_light(team: crate::types::Team) -> &'static str {
    match team {
        crate::types::Team::Blue => "#c3d5ff",
        crate::types::Team::Red => "#ffc2ca",
    }
}

pub const CONFETTI_COLORS: [&str; 6] =
    ["#5b93ff", "#ff5f73", "#fbbf24", "#7dd3fc", "#f472b6", "#a3e635"];

pub const MAX_PARTICLES: usize = 700;
pub const MAX_FLOATERS: usize = 30;
