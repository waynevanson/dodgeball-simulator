use crate::components::Player;
use crate::constants::{ATTACK_DIST, COURT, RUSH_CROSS};
use crate::types::Team;
use crate::world::World;

pub mod ball;
pub mod contacts;
pub mod intents;
pub mod loop_;
pub mod out;
pub mod player;
pub mod rules;
pub mod throwing;

pub struct Bounds {
    pub min_x: f64,
    pub max_x: f64,
}

pub fn bounds(world: &World, team: Team) -> Bounds {
    if !world.rush.active {
        return halves(team);
    }
    // Rule 13.6.2: you may touch or cross the centre line during the rush.
    match team {
        Team::Blue => Bounds { min_x: COURT.x, max_x: COURT.cx + RUSH_CROSS },
        Team::Red => Bounds { min_x: COURT.cx - RUSH_CROSS, max_x: COURT.right },
    }
}

/// Court halves, ignoring the opening-rush leeway.
pub fn halves(team: Team) -> Bounds {
    match team {
        Team::Blue => Bounds { min_x: COURT.x, max_x: COURT.cx - 2.0 },
        Team::Red => Bounds { min_x: COURT.cx + 2.0, max_x: COURT.right },
    }
}

pub fn attack_line_x(team: Team) -> f64 {
    match team {
        Team::Blue => COURT.cx - ATTACK_DIST,
        Team::Red => COURT.cx + ATTACK_DIST,
    }
}

/// Rule 13.7.1: a rushed ball arms once it fully crosses the attack line.
pub fn behind_attack_line(player: &Player) -> bool {
    match player.tag.team {
        Team::Blue => player.transform.x < attack_line_x(Team::Blue),
        Team::Red => player.transform.x > attack_line_x(Team::Red),
    }
}

pub fn is_opponent_side(team: Team, x: f64) -> bool {
    match team {
        Team::Blue => x > COURT.cx,
        Team::Red => x < COURT.cx,
    }
}
