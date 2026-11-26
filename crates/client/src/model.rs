//! Client-side snapshot model: placeholder frame, interpolation and local
//! `isYou` decoration.

use std::collections::HashMap;

use bevy::prelude::*;
use dodgeball_sim::snapshot::{Frame, TeamLists};
use dodgeball_sim::types::{DifficultyId, Phase, Team};

use crate::consts::{UI_H, UI_W};

pub const INTERP_DELAY: f64 = 0.090;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectionState {
    Connecting,
    Online,
    Offline,
    Spectating,
    Error,
}

impl ConnectionState {
    pub fn label(self) -> &'static str {
        match self {
            Self::Connecting => "CONNECTING",
            Self::Online => "CONNECTED",
            Self::Offline => "OFFLINE",
            Self::Spectating => "SPECTATING",
            Self::Error => "ERROR",
        }
    }
}

#[derive(Resource)]
pub struct ClientState {
    pub player_name: String,
    pub muted: bool,
    pub autostart: bool,
    pub uri: String,
    pub database: String,
    pub connection: ConnectionState,
    pub local_owner: Option<u64>,
    pub spectator: bool,
    pub slot: Option<u8>,
    pub samples: Vec<FrameSample>,
    pub latest: Option<Frame>,
    pub placeholder: Frame,
    pub view: Frame,
    pub editing_name: bool,
    pub name_draft: String,
    /// In-progress IME composition, displayed after the draft until committed.
    pub name_preedit: String,
    pub screen: UiScreen,
    pub show_touch: bool,
    pub portrait: bool,
}

#[derive(Clone)]
pub struct FrameSample {
    pub at: f64,
    pub tick: u64,
    pub frame: Frame,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UiScreen {
    None,
    Menu,
    Pause,
    Results,
    Rules,
}

impl ClientState {
    pub fn new(
        player_name: String,
        muted: bool,
        autostart: bool,
        uri: String,
        database: String,
    ) -> Self {
        let player_name = clean_name(&player_name);
        let placeholder = empty_frame(&player_name, 5);
        Self {
            player_name,
            uri,
            database,
            muted,
            autostart,
            connection: ConnectionState::Connecting,
            local_owner: None,
            spectator: false,
            slot: None,
            samples: Vec::new(),
            latest: None,
            placeholder: placeholder.clone(),
            view: placeholder,
            editing_name: false,
            name_draft: String::new(),
            name_preedit: String::new(),
            screen: UiScreen::Menu,
            show_touch: false,
            portrait: false,
        }
    }

    pub fn push_frame(&mut self, frame: Frame, at: f64, tick: u64) {
        self.samples.push(FrameSample { at, tick, frame });
        while self.samples.len() > 8 {
            self.samples.remove(0);
        }
        if let Some(sample) = self.samples.last() {
            self.latest = Some(sample.frame.clone());
        }
    }

    pub fn target_at(&self, now: f64) -> f64 {
        now - INTERP_DELAY
    }

    pub fn build_view(&self, now: f64) -> Frame {
        if self.samples.is_empty() {
            return self.decorate(self.placeholder.clone());
        }
        if self.samples.len() == 1 {
            return self.decorate(self.samples[0].frame.clone());
        }
        let target = self.target_at(now);
        let mut index = None;
        for i in 0..self.samples.len() - 1 {
            if self.samples[i].at <= target && target <= self.samples[i + 1].at {
                index = Some(i);
                break;
            }
        }
        let frame = match index {
            Some(i) => {
                let a = &self.samples[i];
                let b = &self.samples[i + 1];
                let span = (b.at - a.at).max(0.001);
                let t = ((target - a.at) / span).clamp(0.0, 1.0);
                blend(&a.frame, &b.frame, t)
            }
            None => {
                let first = &self.samples[0];
                let last = self.samples.last().unwrap();
                if target < first.at {
                    first.frame.clone()
                } else {
                    extrapolate(last.frame.clone(), target - last.at)
                }
            }
        };
        self.decorate(frame)
    }

    pub fn decorate(&self, mut frame: Frame) -> Frame {
        let my_id = self.local_owner.and_then(|owner| {
            frame
                .players
                .iter()
                .find(|player| player.tag.owner == Some(owner))
                .map(|player| player.id)
        });
        for player in &mut frame.players {
            player.tag.is_you = my_id == Some(player.id);
        }
        for list in [&mut frame.roster.blue, &mut frame.roster.red] {
            for entry in list {
                entry.you = my_id == Some(entry.id);
            }
        }
        frame.lineup.custom_name = self.player_name.clone();
        frame
    }

    pub fn local_player(&self) -> Option<&dodgeball_sim::snapshot::PlayerOut> {
        self.view.players.iter().find(|player| player.tag.is_you)
    }
}

pub fn clean_name(name: &str) -> String {
    let cleaned: String = name.trim().split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned: String = cleaned
        .chars()
        .filter(|character| !character.is_control())
        .take(dodgeball_sim::constants::PLAYER_NAME_MAX)
        .collect();
    if cleaned.is_empty() {
        dodgeball_sim::constants::DEFAULT_CUSTOM_NAME.to_string()
    } else {
        cleaned
    }
}

pub fn empty_frame(name: &str, slot: usize) -> Frame {
    Frame {
        phase: Phase::Menu,
        phase_elapsed: 0.0,
        time: 0.0,
        clock: dodgeball_sim::snapshot::ClockOut { sim: 0.0 },
        feedback: dodgeball_sim::snapshot::FeedbackOut {
            shake: 0.0,
            flash: 0.0,
            slowmo: 0.0,
        },
        score: dodgeball_sim::types::Score::default(),
        set: 1,
        difficulty: dodgeball_sim::snapshot::DifficultyOut {
            id: DifficultyId::Pro,
            label: "Pro".to_string(),
        },
        lineup: dodgeball_sim::snapshot::LineupOut {
            human_slot: slot,
            custom_name: name.to_string(),
        },
        last_set_winner: None,
        match_winner: None,
        roster: TeamLists {
            blue: Vec::new(),
            red: Vec::new(),
        },
        out_queue: TeamLists {
            blue: Vec::new(),
            red: Vec::new(),
        },
        shot: dodgeball_sim::snapshot::ShotOut {
            team: None,
            time_left: 10.0,
        },
        sudden_death: false,
        rush_active: false,
        set_elapsed: 0.0,
        players: Vec::new(),
        balls: Vec::new(),
        particles: Vec::new(),
        floaters: Vec::new(),
        glasses: Vec::new(),
    }
}

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Extrapolate briefly past the newest snapshot when a packet is late. This
/// keeps fast balls and moving players from visibly freezing, but the horizon
/// is deliberately short so we never drift around court collisions for long.
fn extrapolate(mut frame: Frame, ahead: f64) -> Frame {
    let ahead = ahead.clamp(0.0, 0.12);
    if ahead <= 0.0 {
        return frame;
    }
    for player in &mut frame.players {
        if player.condition.alive {
            player.transform.x += player.transform.vx * ahead;
            player.transform.y += player.transform.vy * ahead;
        }
    }
    for ball in &mut frame.balls {
        if ball.state.live {
            ball.transform.x += ball.transform.vx * ahead;
            ball.transform.y += ball.transform.vy * ahead;
        }
    }
    frame
}

pub fn blend(from: &Frame, to: &Frame, t: f64) -> Frame {
    let previous_players: HashMap<u32, _> = from
        .players
        .iter()
        .map(|player| (player.id, player))
        .collect();
    let previous_balls: HashMap<u32, _> = from.balls.iter().map(|ball| (ball.id, ball)).collect();

    let mut out = to.clone();
    out.clock.sim = lerp(from.clock.sim, to.clock.sim, t);
    out.feedback.shake = lerp(from.feedback.shake, to.feedback.shake, t);
    out.feedback.flash = lerp(from.feedback.flash, to.feedback.flash, t);
    out.feedback.slowmo = to.feedback.slowmo;
    for player in &mut out.players {
        if let Some(previous) = previous_players.get(&player.id) {
            player.transform.x = lerp(previous.transform.x, player.transform.x, t);
            player.transform.y = lerp(previous.transform.y, player.transform.y, t);
            player.transform.vx = lerp(previous.transform.vx, player.transform.vx, t);
            player.transform.vy = lerp(previous.transform.vy, player.transform.vy, t);
        }
    }
    for ball in &mut out.balls {
        if let Some(previous) = previous_balls.get(&ball.id) {
            ball.transform.x = lerp(previous.transform.x, ball.transform.x, t);
            ball.transform.y = lerp(previous.transform.y, ball.transform.y, t);
            ball.transform.vx = lerp(previous.transform.vx, ball.transform.vx, t);
            ball.transform.vy = lerp(previous.transform.vy, ball.transform.vy, t);
        }
    }
    out
}

/// World-space conversion: the simulation uses screen coordinates with +Y
/// down; Bevy 2D uses +Y up. The camera is centred on the 1280x720 court.
pub fn world_pos(x: f64, y: f64) -> Vec2 {
    Vec2::new(x as f32, UI_H - y as f32)
}

pub fn design_to_world(x: f32, y: f32) -> Vec2 {
    Vec2::new(x - UI_W * 0.5, UI_H * 0.5 - y)
}

pub fn frame_phase_label(phase: Phase) -> &'static str {
    match phase {
        Phase::Menu => "MENU",
        Phase::Countdown => "COUNTDOWN",
        Phase::Playing => "PLAYING",
        Phase::SetOver => "SET OVER",
        Phase::MatchOver => "MATCH OVER",
        Phase::Paused => "PAUSED",
    }
}

pub fn team_lists(frame: &Frame, team: Team) -> &Vec<dodgeball_sim::snapshot::HudPlayerOut> {
    match team {
        Team::Blue => &frame.roster.blue,
        Team::Red => &frame.roster.red,
    }
}

#[derive(Resource, Clone)]
pub struct ViewFrame(pub Frame);

#[cfg(test)]
mod tests {
    use super::*;
    use dodgeball_sim::snapshot::{
        ActionOut, BallOut, BallStateOut, BallTagOut, CarryOut, ConditionOut, CooldownsOut,
        HeldOut, PlayerOut, PlayerTagOut, StatsOut, TrailOut, TransformOut,
    };

    fn client_state() -> ClientState {
        ClientState::new(
            "Player".to_string(),
            false,
            false,
            "uri".into(),
            "db".into(),
        )
    }

    fn player(id: u32, x: f64, y: f64) -> PlayerOut {
        PlayerOut {
            id,
            last_input_seq: 0,
            transform: TransformOut {
                x,
                y,
                vx: 1.0,
                vy: 2.0,
                radius: 20.0,
                facing: 0.0,
            },
            tag: PlayerTagOut {
                name: format!("P{id}"),
                number: id,
                team: Team::Blue,
                slot: id as usize,
                owner: Some(1),
                is_human: true,
                is_you: false,
                glasses: false,
            },
            condition: ConditionOut {
                alive: true,
                has_glasses: true,
                entering_time: 0.0,
                hit_flash: 0.0,
                out_at: 0.0,
                out_x: 0.0,
                out_y: 0.0,
            },
            carry: CarryOut { ball: None },
            action: ActionOut {
                charge: 0.0,
                charging: false,
                dash_time: 0.0,
                dash_cd: 0.0,
                dash_x: 0.0,
                dash_y: 0.0,
            },
            cooldowns: CooldownsOut {
                catch_window: 0.0,
                catch_cd: 0.0,
                throw_cd: 0.0,
                pickup_cd: 0.0,
            },
            trail: TrailOut { points: Vec::new() },
            stats: StatsOut {
                throws: 0,
                catches: 0,
                outs: 0,
            },
        }
    }

    fn ball(id: u32, x: f64, y: f64) -> BallOut {
        BallOut {
            id,
            transform: TransformOut {
                x,
                y,
                vx: 3.0,
                vy: 4.0,
                radius: 10.0,
                facing: 0.0,
            },
            tag: BallTagOut {
                spin: 0.0,
                spin_v: 0.0,
                bob: 0.0,
                age: 0.0,
            },
            state: BallStateOut {
                live: true,
                armed: true,
                rush: false,
                can_out: true,
                team: Some(Team::Blue),
                touched: false,
                valid_attempt: true,
                warning_issued: false,
            },
            held: HeldOut { by: None },
            trail: TrailOut { points: Vec::new() },
        }
    }

    #[test]
    fn clean_name_trims_collapses_controls_and_limits() {
        assert_eq!(clean_name("  Wayne   Son "), "Wayne Son");
        assert_eq!(clean_name("a\u{0}b\nc"), "ab c");
        assert_eq!(
            clean_name("   "),
            dodgeball_sim::constants::DEFAULT_CUSTOM_NAME
        );
        let long = "x".repeat(dodgeball_sim::constants::PLAYER_NAME_MAX + 10);
        assert_eq!(
            clean_name(&long).chars().count(),
            dodgeball_sim::constants::PLAYER_NAME_MAX
        );
    }

    #[test]
    fn blend_interpolates_matching_players_and_balls() {
        let mut from = empty_frame("Player", 0);
        from.players.push(player(1, 0.0, 0.0));
        from.balls.push(ball(1, 0.0, 0.0));

        let mut to = empty_frame("Player", 0);
        to.players.push(player(1, 10.0, 20.0));
        to.balls.push(ball(1, 30.0, 40.0));

        let blended = blend(&from, &to, 0.25);
        assert!((blended.players[0].transform.x - 2.5).abs() < 1e-9);
        assert!((blended.players[0].transform.y - 5.0).abs() < 1e-9);
        assert!((blended.players[0].transform.vx - 1.0).abs() < 1e-9);
        assert!((blended.balls[0].transform.x - 7.5).abs() < 1e-9);
        assert!((blended.balls[0].transform.y - 10.0).abs() < 1e-9);
    }

    #[test]
    fn build_view_interpolates_and_extrapolates() {
        let mut state = client_state();

        let mut first = empty_frame("Player", 0);
        first.players.push(player(1, 0.0, 0.0));
        let mut second = empty_frame("Player", 0);
        second.players.push(player(1, 100.0, 0.0));

        state.push_frame(first, 0.0, 1);
        state.push_frame(second, 1.0, 2);

        // target = now - INTERP_DELAY
        let view = state.build_view(0.59);
        assert!((view.players[0].transform.x - 50.0).abs() < 1e-9);

        let extrapolated = state.build_view(1.09 + 0.05);
        assert!((extrapolated.players[0].transform.x - 100.05).abs() < 1e-9);
    }

    #[test]
    fn decorate_marks_the_local_owner() {
        let mut state = client_state();
        state.local_owner = Some(7);
        let mut frame = empty_frame("Player", 0);
        let mut me = player(3, 0.0, 0.0);
        me.tag.owner = Some(7);
        frame.players.push(me);
        frame.players.push(player(4, 0.0, 0.0));

        let decorated = state.decorate(frame);
        assert!(decorated.players[0].tag.is_you);
        assert!(!decorated.players[1].tag.is_you);
        assert_eq!(decorated.lineup.custom_name, "Player");
    }
}
