use serde::Deserialize;

use crate::types::{DifficultyId, Phase, Score, Team};

#[derive(Clone, Copy, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct Clock {
    pub sim: f64,
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct Feedback {
    pub shake: f64,
    pub flash: f64,
    pub slowmo: f64,
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct SetState {
    pub id: u32,
    pub resolved: bool,
    pub winner: Option<Team>,
    pub elapsed: f64,
    pub sudden_death: bool,
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct Rush {
    pub active: bool,
}

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub struct Shot {
    pub team: Option<Team>,
    pub clock: f64,
    pub beep: i32,
}

impl Default for Shot {
    fn default() -> Self {
        Self {
            team: None,
            clock: 10.0,
            beep: 99,
        }
    }
}

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct Queues {
    pub blue: Vec<crate::ecs::Entity>,
    pub red: Vec<crate::ecs::Entity>,
}

impl Queues {
    pub fn get(&self, team: Team) -> &Vec<crate::ecs::Entity> {
        match team {
            Team::Blue => &self.blue,
            Team::Red => &self.red,
        }
    }

    pub fn get_mut(&mut self, team: Team) -> &mut Vec<crate::ecs::Entity> {
        match team {
            Team::Blue => &mut self.blue,
            Team::Red => &mut self.red,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct Warnings {
    pub blue: u32,
    pub red: u32,
}

impl Warnings {
    pub fn get(&self, team: Team) -> u32 {
        match team {
            Team::Blue => self.blue,
            Team::Red => self.red,
        }
    }

    pub fn add(&mut self, team: Team) {
        match team {
            Team::Blue => self.blue += 1,
            Team::Red => self.red += 1,
        }
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Lineup {
    pub human_slot: usize,
    pub custom_name: String,
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct LastThrow {
    pub team: Option<Team>,
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct LastSet {
    pub winner: Option<Team>,
}

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub struct PhaseState {
    pub id: Phase,
    pub elapsed: f64,
    pub resume_from: Option<Phase>,
    /// Last count-in second already announced. Kept so the beep is emitted on
    /// the boundary where the clock is advanced, exactly once, instead of the
    /// presentation re-deriving the edge from `elapsed`.
    pub beep: i32,
}

impl Default for PhaseState {
    fn default() -> Self {
        Self {
            id: Phase::Menu,
            elapsed: 0.0,
            resume_from: None,
            beep: 99,
        }
    }
}

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub struct MatchState {
    pub difficulty: DifficultyId,
    pub score: Score,
    pub set: u32,
    pub last_set_winner: Option<Team>,
    pub match_winner: Option<Team>,
}

impl Default for MatchState {
    fn default() -> Self {
        Self {
            difficulty: DifficultyId::Pro,
            score: Score::default(),
            set: 1,
            last_set_winner: None,
            match_winner: None,
        }
    }
}

/// One frame of human input, assembled by the TypeScript input layer.
#[derive(Clone, Copy, Debug, Default, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct InputFrame {
    pub up: bool,
    pub down: bool,
    pub left: bool,
    pub right: bool,
    pub mouse_x: f64,
    pub mouse_y: f64,
    pub mouse_used: bool,
    pub left_down: bool,
    pub right_pressed: bool,
    pub dash: bool,
    pub catch: bool,
    pub touch: bool,
    pub touch_mx: f64,
    pub touch_my: f64,
    pub throw_down: bool,
    pub touch_dash: bool,
    pub touch_catch: bool,
}
