use crate::ecs::Entity;
use crate::types::{Difficulty, Team};

#[derive(Clone, Copy, Debug, Default)]
pub struct Pos {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Transform {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub facing: f64,
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize)]
pub struct TrailPoint {
    pub x: f64,
    pub y: f64,
    pub a: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Trail {
    pub points: Vec<TrailPoint>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PlayerStats {
    pub throws: u32,
    pub catches: u32,
    pub outs: u32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Intent {
    pub mx: f64,
    pub my: f64,
    pub aim: f64,
    pub charge: bool,
    pub release: bool,
    pub dash: bool,
    pub catch: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Condition {
    pub alive: bool,
    pub has_glasses: bool,
    pub entering_time: f64,
    pub hit_flash: f64,
    pub out_at: f64,
    pub out_x: f64,
    pub out_y: f64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Action {
    pub charge: f64,
    pub charging: bool,
    pub dash_time: f64,
    pub dash_cd: f64,
    pub dash_x: f64,
    pub dash_y: f64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Cooldowns {
    pub catch_window: f64,
    pub catch_cd: f64,
    pub throw_cd: f64,
    pub pickup_cd: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Brain {
    pub diff: Option<Difficulty>,
    pub seek: Option<Entity>,
    pub target: Option<Entity>,
    pub target_timer: f64,
    pub aim_timer: f64,
    pub aim_error: f64,
    pub release_delay: f64,
    pub catch_ball: Option<Entity>,
    pub will_catch: bool,
    pub strafe: f64,
    pub strafe_timer: f64,
    pub phase: f64,
    pub anchor_x: f64,
    pub anchor_y: f64,
    pub anchor_timer: f64,
}

impl Default for Brain {
    fn default() -> Self {
        Self {
            diff: None,
            seek: None,
            target: None,
            target_timer: 0.0,
            aim_timer: 0.0,
            aim_error: 0.0,
            release_delay: 0.0,
            catch_ball: None,
            will_catch: false,
            strafe: 1.0,
            strafe_timer: 0.0,
            phase: 0.0,
            anchor_x: 0.0,
            anchor_y: 0.0,
            anchor_timer: 0.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct PlayerTag {
    pub name: String,
    pub number: u32,
    pub team: Team,
    pub slot: usize,
    pub is_human: bool,
    pub glasses: bool,
}

/// One player. In the TypeScript build this was ten separate components; the
/// component set is fixed per entity kind, so Rust keeps it as one owned value
/// and the ECS still stores and queries players as entities.
#[derive(Clone, Debug)]
pub struct Player {
    pub transform: Transform,
    pub tag: PlayerTag,
    pub condition: Condition,
    pub carry: Option<Entity>,
    pub action: Action,
    pub cooldowns: Cooldowns,
    pub intent: Intent,
    pub brain: Brain,
    pub trail: Trail,
    pub stats: PlayerStats,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct BallTag {
    pub spin: f64,
    pub spin_v: f64,
    pub bob: f64,
    pub age: f64,
}

/// The ball lifecycle: rush -> armed -> in flight -> dead or held.
#[derive(Clone, Debug, Default)]
pub struct BallState {
    pub live: bool,
    pub armed: bool,
    pub rush: bool,
    pub can_out: bool,
    pub team: Option<Team>,
    pub thrower: Option<Entity>,
    pub thrower_team: Option<Team>,
    pub touched: bool,
    pub valid_attempt: bool,
    pub warning_issued: bool,
    pub ignore: Option<Entity>,
    pub ignore_time: f64,
    pub bounces: u32,
    pub pickup_cd: f64,
    pub release_positions: Vec<Pos>,
}

#[derive(Clone, Debug, Default)]
pub struct Ball {
    pub transform: Transform,
    pub tag: BallTag,
    pub state: BallState,
    pub held_by: Option<Entity>,
    pub trail: Trail,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParticleKind {
    Spark,
    Dust,
    Ring,
    Confetti,
}

impl ParticleKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ParticleKind::Spark => "spark",
            ParticleKind::Dust => "dust",
            ParticleKind::Ring => "ring",
            ParticleKind::Confetti => "confetti",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Particle {
    pub transform: Transform,
    pub life: f64,
    pub max: f64,
    pub size: f64,
    pub color: String,
    pub drag: f64,
    pub kind: ParticleKind,
    pub spin: f64,
    pub spin_v: f64,
}

#[derive(Clone, Debug)]
pub struct Floater {
    pub transform: Transform,
    pub text: String,
    pub color: String,
    pub life: f64,
    pub max: f64,
    pub size: Option<f64>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Glasses {
    pub transform: Transform,
    pub rot: f64,
    pub spin: f64,
}
