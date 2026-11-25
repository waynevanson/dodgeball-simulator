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
    pub screen: UiScreen,
    pub show_touch: bool,
    pub portrait: bool,
    pub dirty_settings: bool,
}

#[derive(Clone)]
pub struct FrameSample {
    pub at: f64,
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
            screen: UiScreen::Menu,
            show_touch: false,
            portrait: false,
            dirty_settings: false,
        }
    }

    pub fn push_frame(&mut self, frame: Frame, at: f64) {
        self.samples.push(FrameSample { at, frame });
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
                    last.frame.clone()
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
