use serde::{Deserialize, Serialize};

use crate::components::*;
use crate::types::{DifficultyId, Phase, Score, Team};
use crate::world::World;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamLists<T> {
    pub blue: Vec<T>,
    pub red: Vec<T>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformOut {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub radius: f64,
    pub facing: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrailOut {
    pub points: Vec<TrailPoint>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerTagOut {
    pub name: String,
    pub number: u32,
    pub team: Team,
    pub slot: usize,
    pub owner: Option<u64>,
    pub is_human: bool,
    /// Presentation-only "this is the local player's character" flag. The
    /// online bridge sets it from the local participant's owner id.
    pub is_you: bool,
    pub glasses: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionOut {
    pub alive: bool,
    pub has_glasses: bool,
    pub entering_time: f64,
    pub hit_flash: f64,
    pub out_at: f64,
    pub out_x: f64,
    pub out_y: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CarryOut {
    pub ball: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionOut {
    pub charge: f64,
    pub charging: bool,
    pub dash_time: f64,
    pub dash_cd: f64,
    pub dash_x: f64,
    pub dash_y: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CooldownsOut {
    pub catch_window: f64,
    pub catch_cd: f64,
    pub throw_cd: f64,
    pub pickup_cd: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOut {
    pub throws: u32,
    pub catches: u32,
    pub outs: u32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerOut {
    pub id: u32,
    pub transform: TransformOut,
    pub tag: PlayerTagOut,
    pub condition: ConditionOut,
    pub carry: CarryOut,
    pub action: ActionOut,
    pub cooldowns: CooldownsOut,
    pub trail: TrailOut,
    pub stats: StatsOut,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallTagOut {
    pub spin: f64,
    pub spin_v: f64,
    pub bob: f64,
    pub age: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallStateOut {
    pub live: bool,
    pub armed: bool,
    pub rush: bool,
    pub can_out: bool,
    pub team: Option<Team>,
    pub touched: bool,
    pub valid_attempt: bool,
    pub warning_issued: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldOut {
    pub by: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallOut {
    pub id: u32,
    pub transform: TransformOut,
    pub tag: BallTagOut,
    pub state: BallStateOut,
    pub held: HeldOut,
    pub trail: TrailOut,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleOut {
    pub x: f64,
    pub y: f64,
    pub size: f64,
    pub color: String,
    pub life: f64,
    pub max: f64,
    #[serde(rename = "type")]
    pub kind: String,
    pub spin: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FloaterOut {
    pub x: f64,
    pub y: f64,
    pub text: String,
    pub color: String,
    pub life: f64,
    pub max: f64,
    pub size: Option<f64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlassesOut {
    pub x: f64,
    pub y: f64,
    pub rot: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudPlayerOut {
    pub id: u32,
    pub number: u32,
    pub alive: bool,
    pub human: bool,
    pub you: bool,
    pub entering: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyOut {
    pub id: DifficultyId,
    pub label: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShotOut {
    pub team: Option<Team>,
    pub time_left: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineupOut {
    pub human_slot: usize,
    pub custom_name: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockOut {
    pub sim: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackOut {
    pub shake: f64,
    pub flash: f64,
    pub slowmo: f64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub phase: Phase,
    pub phase_elapsed: f64,
    pub time: f64,
    pub clock: ClockOut,
    pub feedback: FeedbackOut,
    pub score: Score,
    pub set: u32,
    pub difficulty: DifficultyOut,
    pub lineup: LineupOut,
    pub last_set_winner: Option<Team>,
    pub match_winner: Option<Team>,
    pub roster: TeamLists<HudPlayerOut>,
    pub out_queue: TeamLists<HudPlayerOut>,
    pub shot: ShotOut,
    pub sudden_death: bool,
    pub rush_active: bool,
    pub set_elapsed: f64,
    pub players: Vec<PlayerOut>,
    pub balls: Vec<BallOut>,
    pub particles: Vec<ParticleOut>,
    pub floaters: Vec<FloaterOut>,
    pub glasses: Vec<GlassesOut>,
}

fn transform_out(transform: &Transform) -> TransformOut {
    TransformOut {
        x: transform.x,
        y: transform.y,
        vx: transform.vx,
        vy: transform.vy,
        radius: transform.radius,
        facing: transform.facing,
    }
}

fn trail_out(trail: &Trail) -> TrailOut {
    TrailOut {
        points: trail.points.clone(),
    }
}

fn audit_player(world: &World, entity: crate::ecs::Entity) -> Option<HudPlayerOut> {
    world.player(entity).map(|player| HudPlayerOut {
        id: entity.index(),
        number: player.tag.number,
        alive: player.condition.alive,
        human: player.tag.is_human,
        you: player.tag.is_human,
        entering: player.condition.entering_time > 0.0,
    })
}

impl World {
    pub fn frame(&self) -> Frame {
        let mut roster: TeamLists<HudPlayerOut> = TeamLists {
            blue: Vec::new(),
            red: Vec::new(),
        };
        for (entity, player) in self.players.iter() {
            let hud = HudPlayerOut {
                id: entity.index(),
                number: player.tag.number,
                alive: player.condition.alive,
                human: player.tag.is_human,
                you: player.tag.is_human,
                entering: player.condition.entering_time > 0.0,
            };
            match player.tag.team {
                Team::Blue => roster.blue.push(hud),
                Team::Red => roster.red.push(hud),
            }
        }

        let out_queue = TeamLists {
            blue: self
                .queues
                .blue
                .iter()
                .filter_map(|entity| audit_player(self, *entity))
                .collect(),
            red: self
                .queues
                .red
                .iter()
                .filter_map(|entity| audit_player(self, *entity))
                .collect(),
        };

        let players: Vec<PlayerOut> = self
            .players
            .iter()
            .map(|(entity, player)| PlayerOut {
                id: entity.index(),
                transform: transform_out(&player.transform),
                tag: PlayerTagOut {
                    name: player.tag.name.clone(),
                    number: player.tag.number,
                    team: player.tag.team,
                    slot: player.tag.slot,
                    owner: player.tag.owner,
                    is_human: player.tag.is_human,
                    is_you: player.tag.is_human,
                    glasses: player.tag.glasses,
                },
                condition: ConditionOut {
                    alive: player.condition.alive,
                    has_glasses: player.condition.has_glasses,
                    entering_time: player.condition.entering_time,
                    hit_flash: player.condition.hit_flash,
                    out_at: player.condition.out_at,
                    out_x: player.condition.out_x,
                    out_y: player.condition.out_y,
                },
                carry: CarryOut {
                    ball: player.carry.map(|ball| ball.index()),
                },
                action: ActionOut {
                    charge: player.action.charge,
                    charging: player.action.charging,
                    dash_time: player.action.dash_time,
                    dash_cd: player.action.dash_cd,
                    dash_x: player.action.dash_x,
                    dash_y: player.action.dash_y,
                },
                cooldowns: CooldownsOut {
                    catch_window: player.cooldowns.catch_window,
                    catch_cd: player.cooldowns.catch_cd,
                    throw_cd: player.cooldowns.throw_cd,
                    pickup_cd: player.cooldowns.pickup_cd,
                },
                trail: trail_out(&player.trail),
                stats: StatsOut {
                    throws: player.stats.throws,
                    catches: player.stats.catches,
                    outs: player.stats.outs,
                },
            })
            .collect();

        let balls: Vec<BallOut> = self
            .balls
            .iter()
            .map(|(entity, ball)| BallOut {
                id: entity.index(),
                transform: transform_out(&ball.transform),
                tag: BallTagOut {
                    spin: ball.tag.spin,
                    spin_v: ball.tag.spin_v,
                    bob: ball.tag.bob,
                    age: ball.tag.age,
                },
                state: BallStateOut {
                    live: ball.state.live,
                    armed: ball.state.armed,
                    rush: ball.state.rush,
                    can_out: ball.state.can_out,
                    team: ball.state.team,
                    touched: ball.state.touched,
                    valid_attempt: ball.state.valid_attempt,
                    warning_issued: ball.state.warning_issued,
                },
                held: HeldOut {
                    by: ball.held_by.map(|holder| holder.index()),
                },
                trail: trail_out(&ball.trail),
            })
            .collect();

        let particles = self
            .particles
            .iter()
            .map(|(_, particle)| ParticleOut {
                x: particle.transform.x,
                y: particle.transform.y,
                size: particle.size,
                color: particle.color.clone(),
                life: particle.life,
                max: particle.max,
                kind: particle.kind.as_str().to_string(),
                spin: particle.spin,
            })
            .collect();

        let floaters = self
            .floaters
            .iter()
            .map(|(_, floater)| FloaterOut {
                x: floater.transform.x,
                y: floater.transform.y,
                text: floater.text.clone(),
                color: floater.color.clone(),
                life: floater.life,
                max: floater.max,
                size: floater.size,
            })
            .collect();

        let glasses = self
            .glasses
            .iter()
            .map(|(_, item)| GlassesOut {
                x: item.transform.x,
                y: item.transform.y,
                rot: item.rot,
            })
            .collect();

        Frame {
            phase: self.phase.id,
            phase_elapsed: self.phase.elapsed,
            time: self.time,
            clock: ClockOut {
                sim: self.clock.sim,
            },
            feedback: FeedbackOut {
                shake: self.feedback.shake,
                flash: self.feedback.flash,
                slowmo: self.feedback.slowmo,
            },
            score: self.match_state.score,
            set: self.match_state.set,
            difficulty: DifficultyOut {
                id: self.match_state.difficulty,
                label: self.match_state.difficulty.label().to_string(),
            },
            lineup: LineupOut {
                human_slot: self.lineup.human_slot,
                custom_name: self.lineup.custom_name.clone(),
            },
            last_set_winner: self.match_state.last_set_winner,
            match_winner: self.match_state.match_winner,
            roster,
            out_queue,
            shot: ShotOut {
                team: self.shot.team,
                time_left: self.shot.clock,
            },
            sudden_death: self.set.sudden_death,
            rush_active: self.rush.active,
            set_elapsed: self.set.elapsed,
            players,
            balls,
            particles,
            floaters,
            glasses,
        }
    }
}
