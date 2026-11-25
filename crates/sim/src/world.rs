use crate::components::{Ball, Floater, Glasses, Particle, Player};
use crate::constants::{CUSTOM_SLOT, DEFAULT_CUSTOM_NAME};
use crate::ecs::{Entity, EntityAllocator, SparseSet};
use crate::game::spawn::{apply_difficulty, set_lineup, spawn_match};
use crate::resources::*;
use crate::rng::Rng;
use crate::types::{DifficultyId, Phase, Score, SfxEvent, Team};

/// Per-player claim on a loose ball, rebuilt every frame for the AI.
pub type Claims = Vec<(Entity, Entity)>;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct World {
    pub entities: EntityAllocator,

    pub players: SparseSet<Player>,
    pub balls: SparseSet<Ball>,
    pub particles: SparseSet<Particle>,
    pub floaters: SparseSet<Floater>,
    pub glasses: SparseSet<Glasses>,

    pub clock: Clock,
    pub feedback: Feedback,
    pub set: SetState,
    pub rush: Rush,
    pub shot: Shot,
    pub queues: Queues,
    pub warnings: Warnings,
    pub lineup: Lineup,
    pub last_throw: LastThrow,
    pub last_set: LastSet,

    pub phase: PhaseState,
    pub match_state: MatchState,
    pub pending: Vec<crate::types::Trigger>,

    pub rng: Rng,
    /// Sound events are transient and are drained into the database's event
    /// table before the server persists the world.
    #[serde(skip)]
    pub events: Vec<SfxEvent>,
    pub claims: Claims,
    /// Generated red-team names are presentation-only and are rebuilt when a
    /// fresh match starts. The server rehydrates `World` every tick, so it is
    /// not worth carrying this across the database boundary.
    #[serde(skip)]
    pub red_roster: Vec<crate::constants::RosterEntry>,
    pub time: f64,
}

impl World {
    /// An empty world with only the resources needed by a local client-side
    /// prediction pass. It has no players, balls or presentation state.
    pub fn empty(seed: u64) -> Self {
        Self {
            entities: EntityAllocator::new(),
            players: SparseSet::new(),
            balls: SparseSet::new(),
            particles: SparseSet::new(),
            floaters: SparseSet::new(),
            glasses: SparseSet::new(),
            clock: Clock::default(),
            feedback: Feedback::default(),
            set: SetState {
                resolved: true,
                ..SetState::default()
            },
            rush: Rush::default(),
            shot: Shot::default(),
            queues: Queues::default(),
            warnings: Warnings::default(),
            lineup: Lineup {
                human_slot: CUSTOM_SLOT,
                custom_name: DEFAULT_CUSTOM_NAME.to_string(),
            },
            last_throw: LastThrow::default(),
            last_set: LastSet::default(),
            phase: PhaseState::default(),
            match_state: MatchState::default(),
            pending: Vec::new(),
            rng: Rng::new(seed),
            events: Vec::new(),
            claims: Vec::new(),
            red_roster: Vec::new(),
            time: 0.0,
        }
    }

    pub fn new(seed: u64, difficulty: DifficultyId, human_slot: usize, custom_name: &str) -> Self {
        let mut world = Self {
            entities: EntityAllocator::new(),
            players: SparseSet::new(),
            balls: SparseSet::new(),
            particles: SparseSet::new(),
            floaters: SparseSet::new(),
            glasses: SparseSet::new(),
            clock: Clock::default(),
            feedback: Feedback::default(),
            set: SetState {
                resolved: true,
                ..SetState::default()
            },
            rush: Rush::default(),
            shot: Shot::default(),
            queues: Queues::default(),
            warnings: Warnings::default(),
            lineup: Lineup {
                human_slot: CUSTOM_SLOT,
                custom_name: DEFAULT_CUSTOM_NAME.to_string(),
            },
            last_throw: LastThrow::default(),
            last_set: LastSet::default(),
            phase: PhaseState::default(),
            match_state: MatchState {
                difficulty,
                ..MatchState::default()
            },
            pending: Vec::new(),
            rng: Rng::new(seed),
            events: Vec::new(),
            claims: Vec::new(),
            red_roster: Vec::new(),
            time: 0.0,
        };

        spawn_match(&mut world);
        set_lineup(&mut world, human_slot, custom_name);
        apply_difficulty(&mut world);
        world
    }

    /// A world with no human-controlled players. The SpacetimeDB module starts
    /// every arena this way and attaches owners as clients join.
    pub fn new_headless(seed: u64, difficulty: DifficultyId) -> Self {
        let mut world = Self::new(seed, difficulty, CUSTOM_SLOT, DEFAULT_CUSTOM_NAME);
        for (_, player) in world.players.iter_mut() {
            player.tag.owner = None;
            player.tag.is_human = false;
        }
        apply_difficulty(&mut world);
        world
    }

    pub fn spawn(&mut self) -> Entity {
        self.entities.spawn()
    }

    pub fn despawn(&mut self, entity: Entity) {
        self.players.remove(entity);
        self.balls.remove(entity);
        self.particles.remove(entity);
        self.floaters.remove(entity);
        self.glasses.remove(entity);
        self.entities.despawn(entity);
    }

    pub fn player(&self, entity: Entity) -> Option<&Player> {
        self.players.get(entity)
    }

    pub fn player_mut(&mut self, entity: Entity) -> Option<&mut Player> {
        self.players.get_mut(entity)
    }

    pub fn ball(&self, entity: Entity) -> Option<&Ball> {
        self.balls.get(entity)
    }

    pub fn ball_mut(&mut self, entity: Entity) -> Option<&mut Ball> {
        self.balls.get_mut(entity)
    }

    pub fn players_vec(&self) -> Vec<Entity> {
        self.players.entities()
    }

    pub fn balls_vec(&self) -> Vec<Entity> {
        self.balls.entities()
    }

    pub fn alive_count(&self, team: Team) -> u32 {
        self.players
            .iter()
            .filter(|(_, player)| player.condition.alive && player.tag.team == team)
            .count() as u32
    }

    pub fn held_count(&self, team: Team) -> u32 {
        self.players
            .iter()
            .filter(|(_, player)| {
                player.condition.alive && player.tag.team == team && player.carry.is_some()
            })
            .count() as u32
    }

    pub fn human(&self) -> Option<(Entity, &Player)> {
        self.players.iter().find(|(_, player)| player.tag.is_human)
    }

    pub fn player_by_owner(&self, owner: u64) -> Option<Entity> {
        self.players
            .iter()
            .find(|(_, player)| player.tag.owner == Some(owner))
            .map(|(entity, _)| entity)
    }

    pub fn carried_ball(&self, player: Entity) -> Option<Entity> {
        self.players.get(player).and_then(|player| player.carry)
    }

    pub fn sfx(&mut self, event: SfxEvent) {
        self.events.push(event);
    }

    /// Rule 17.3: who holds the ball advantage right now.
    pub fn advantage_team(&self) -> Option<Team> {
        let held_blue = self.held_count(Team::Blue);
        let held_red = self.held_count(Team::Red);
        if held_blue + held_red == 0 {
            return None;
        }
        if held_blue != held_red {
            return Some(if held_blue > held_red {
                Team::Blue
            } else {
                Team::Red
            });
        }

        let alive_blue = self.alive_count(Team::Blue);
        let alive_red = self.alive_count(Team::Red);
        if alive_blue != alive_red {
            return Some(if alive_blue > alive_red {
                Team::Blue
            } else {
                Team::Red
            });
        }

        if let Some(team) = self.last_throw.team {
            return Some(team.other());
        }
        if let Some(team) = self.last_set.winner {
            return Some(team.other());
        }
        None
    }

    pub fn reset_shot_clock(&mut self) {
        self.shot.team = None;
        self.shot.clock = crate::constants::SHOT_CLOCK;
        self.shot.beep = 99;
    }

    pub fn score(&self) -> Score {
        self.match_state.score
    }

    /// Ball handle bits plus positions, handy for smoke tests and replays.
    pub fn ball_positions(&self) -> Vec<(u64, f64, f64)> {
        self.balls
            .iter()
            .map(|(entity, ball)| (entity.bits(), ball.transform.x, ball.transform.y))
            .collect()
    }

    /// Every `player.carry` and `ball.held_by` pair must agree.
    pub fn ball_owners_broken(&self) -> bool {
        let mut broken = false;
        for (ball_entity, ball) in self.balls.iter() {
            if let Some(holder) = ball.held_by {
                let carried = self
                    .players
                    .get(holder)
                    .map(|player| player.carry == Some(ball_entity))
                    .unwrap_or(false);
                broken |= !carried;
            }
        }
        for (player_entity, player) in self.players.iter() {
            if let Some(ball_entity) = player.carry {
                let held = self
                    .balls
                    .get(ball_entity)
                    .map(|ball| ball.held_by == Some(player_entity))
                    .unwrap_or(false);
                broken |= !held;
            }
        }
        broken
    }

    pub fn phase_id(&self) -> Phase {
        self.phase.id
    }
}
