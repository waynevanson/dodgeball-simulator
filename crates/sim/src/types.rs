use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Team {
    Blue,
    Red,
}

impl Team {
    pub const ALL: [Team; 2] = [Team::Blue, Team::Red];

    pub fn index(self) -> usize {
        match self {
            Team::Blue => 0,
            Team::Red => 1,
        }
    }

    pub fn other(self) -> Team {
        match self {
            Team::Blue => Team::Red,
            Team::Red => Team::Blue,
        }
    }

    pub fn parse(value: &str) -> Team {
        match value {
            "red" => Team::Red,
            _ => Team::Blue,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DifficultyId {
    Rookie,
    Pro,
    Allstar,
}

impl DifficultyId {
    pub fn parse(value: &str) -> DifficultyId {
        match value {
            "rookie" => DifficultyId::Rookie,
            "allstar" => DifficultyId::Allstar,
            _ => DifficultyId::Pro,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            DifficultyId::Rookie => "Rookie",
            DifficultyId::Pro => "Pro",
            DifficultyId::Allstar => "All-Star",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Difficulty {
    pub id: DifficultyId,
    pub reaction: f64,
    pub aim_error: f64,
    pub catch_chance: f64,
    pub dodge: f64,
    pub speed: f64,
    pub dash_chance: f64,
    pub throw_delay: f64,
    pub lead: f64,
    pub want_catch: f64,
}

pub const ROOKIE: Difficulty = Difficulty {
    id: DifficultyId::Rookie,
    reaction: 0.46,
    aim_error: 0.2,
    catch_chance: 0.12,
    dodge: 0.5,
    speed: 0.86,
    dash_chance: 0.15,
    throw_delay: 0.5,
    lead: 0.35,
    want_catch: 0.55,
};

pub const PRO: Difficulty = Difficulty {
    id: DifficultyId::Pro,
    reaction: 0.27,
    aim_error: 0.11,
    catch_chance: 0.34,
    dodge: 0.82,
    speed: 0.95,
    dash_chance: 0.45,
    throw_delay: 0.28,
    lead: 0.62,
    want_catch: 0.7,
};

pub const ALLSTAR: Difficulty = Difficulty {
    id: DifficultyId::Allstar,
    reaction: 0.15,
    aim_error: 0.055,
    catch_chance: 0.55,
    dodge: 0.97,
    speed: 1.0,
    dash_chance: 0.72,
    throw_delay: 0.15,
    lead: 0.85,
    want_catch: 0.9,
};

pub fn difficulty(id: DifficultyId) -> Difficulty {
    match id {
        DifficultyId::Rookie => ROOKIE,
        DifficultyId::Pro => PRO,
        DifficultyId::Allstar => ALLSTAR,
    }
}

/// Top-level phase, owned by the `phase` resource and advanced by the flow table.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Menu,
    Countdown,
    Playing,
    SetOver,
    MatchOver,
    Paused,
}

impl Phase {
    pub fn parse(value: &str) -> Phase {
        match value {
            "countdown" => Phase::Countdown,
            "playing" => Phase::Playing,
            "setover" => Phase::SetOver,
            "matchover" => Phase::MatchOver,
            "paused" => Phase::Paused,
            _ => Phase::Menu,
        }
    }
}

/// Queued flow events. `send` pushes; the flow system drains.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Trigger {
    Start,
    Pause,
    Resume,
    Menu,
    CountdownDone,
    SetOver,
    SetBreakDone,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Score {
    pub blue: u32,
    pub red: u32,
}

impl Score {
    pub fn get(self, team: Team) -> u32 {
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

/// Sounds are emitted by the simulation and consumed by the TypeScript layer,
/// so the Rust core never touches WebAudio.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "value")]
pub enum SfxEvent {
    Throw(f64),
    Hit,
    Headshot,
    Catch,
    Block,
    Pickup,
    Bounce(f64),
    Dash,
    CatchStart,
    Beep(bool),
    Whistle,
    RoundWin,
    RoundLose,
    MatchWin,
    MatchLose,
    Ui,
}
