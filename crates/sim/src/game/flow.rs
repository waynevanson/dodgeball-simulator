use crate::constants::{COUNTDOWN_MS, COUNTDOWN_SECONDS, SET_BREAK_MS, WINS_NEEDED};
use crate::game::effects::{celebrate, punch};
use crate::game::spawn::{start_set, to_menu};
use crate::types::{Phase, SfxEvent, Trigger};
use crate::world::World;

pub fn send(world: &mut World, trigger: Trigger) {
    world.pending.push(trigger);
}

/// Drain queued triggers, then poll time-based transitions. One transition's
/// consequences may queue another, so the loop keeps a small budget per frame.
pub fn flow_step(world: &mut World, dt: f64) {
    let mut polled = false;

    for _ in 0..16 {
        if world.pending.is_empty() {
            if polled {
                break;
            }
            polled = true;
            poll(world, dt);
            if world.pending.is_empty() {
                break;
            }
        }

        let trigger = world.pending.remove(0);
        apply(world, trigger);
    }
}

fn poll(world: &mut World, dt: f64) {
    match world.phase.id {
        Phase::Countdown => {
            world.phase.elapsed += dt;
            // Count-in: one beep per whole second left on the clock. The second
            // boundary is crossed here, so the cue is emitted here; nobody else
            // ever has to guess whether a beep has already played.
            let secs = (COUNTDOWN_SECONDS - world.phase.elapsed).ceil() as i32;
            if secs != world.phase.beep && (1..=3).contains(&secs) {
                world.phase.beep = secs;
                world.sfx(SfxEvent::Beep(secs == 1));
            }
            if world.phase.elapsed * 1000.0 >= COUNTDOWN_MS {
                world.pending.push(Trigger::CountdownDone);
            }
        }
        Phase::Playing => {
            world.phase.elapsed += dt;
            // The world resolved the set; claim the result on its behalf.
            if world.set.resolved {
                world.pending.push(Trigger::SetOver);
            }
        }
        Phase::SetOver => {
            world.phase.elapsed += dt;
            if world.phase.elapsed * 1000.0 >= SET_BREAK_MS {
                world.pending.push(Trigger::SetBreakDone);
            }
        }
        _ => {}
    }
}

fn apply(world: &mut World, trigger: Trigger) {
    let from = world.phase.id;
    let target: Option<Phase> = match (from, trigger) {
        (Phase::Menu, Trigger::Start) => Some(Phase::Countdown),
        (Phase::MatchOver, Trigger::Start) => Some(Phase::Countdown),
        (Phase::Countdown, Trigger::Start) => Some(Phase::Countdown),
        (Phase::Playing, Trigger::Start) => Some(Phase::Countdown),
        (Phase::Paused, Trigger::Start) => Some(Phase::Countdown),

        (Phase::Countdown, Trigger::Pause) => Some(Phase::Paused),
        (Phase::Playing, Trigger::Pause) => Some(Phase::Paused),
        (Phase::Paused, Trigger::Resume) => Some(world.phase.resume_from.unwrap_or(Phase::Playing)),

        (Phase::Countdown, Trigger::Menu) => Some(Phase::Menu),
        (Phase::Playing, Trigger::Menu) => Some(Phase::Menu),
        (Phase::Paused, Trigger::Menu) => Some(Phase::Menu),

        (Phase::Countdown, Trigger::CountdownDone) => Some(Phase::Playing),
        (Phase::Playing, Trigger::SetOver) => Some(Phase::SetOver),
        (Phase::SetOver, Trigger::SetBreakDone) => {
            if match_decided(world) {
                Some(Phase::MatchOver)
            } else {
                Some(Phase::Countdown)
            }
        }
        _ => None,
    };

    let Some(to) = target else { return };

    // Transition effects run before the entry action, in table order.
    match trigger {
        Trigger::Start => {
            world.match_state.score = crate::types::Score::default();
            world.match_state.set = 1;
            world.match_state.last_set_winner = None;
            world.match_state.match_winner = None;
        }
        Trigger::Pause => {
            world.phase.resume_from = Some(from);
        }
        Trigger::SetOver => award_set(world),
        Trigger::SetBreakDone => {
            if to == Phase::MatchOver {
                record_match_winner(world);
            } else {
                world.match_state.set += 1;
            }
        }
        _ => {}
    }

    if from == Phase::Paused && trigger == Trigger::Resume {
        world.phase.resume_from = None;
    }

    world.phase.id = to;
    world.phase.elapsed = 0.0;
    enter_phase(world, to);
}

fn match_decided(world: &World) -> bool {
    world.match_state.score.blue >= WINS_NEEDED || world.match_state.score.red >= WINS_NEEDED
}

/// Rule 10.2.2: a set is worth one point; a voided set awards none.
fn award_set(world: &mut World) {
    let winner = world.set.winner;
    if let Some(winner) = winner {
        world.match_state.score.add(winner);
    }
    world.match_state.last_set_winner = winner;
}

fn record_match_winner(world: &mut World) {
    let score = world.match_state.score;
    world.match_state.match_winner =
        Some(if score.blue > score.red { crate::types::Team::Blue } else { crate::types::Team::Red });
}

/// Entry actions live with the state, not with the presentation.
fn enter_phase(world: &mut World, phase: Phase) {
    match phase {
        Phase::Menu => {
            to_menu(world);
            world.match_state.last_set_winner = None;
            world.match_state.match_winner = None;
        }
        Phase::Countdown => {
            start_set(world);
            world.phase.beep = 99;
        }
        _ => {}
    }

    // Presentation-facing side effects (sound, shake, confetti) travel as
    // ordinary events so the client layer can play them.
    let (last_set_winner, match_winner, score) =
        (world.match_state.last_set_winner, world.match_state.match_winner, world.match_state.score);

    match phase {
        Phase::Playing => world.sfx(SfxEvent::Whistle),
        Phase::SetOver => {
            punch(world);
            match last_set_winner {
                Some(crate::types::Team::Blue) => world.sfx(SfxEvent::RoundWin),
                Some(crate::types::Team::Red) => world.sfx(SfxEvent::RoundLose),
                None => world.sfx(SfxEvent::Whistle),
            }
        }
        Phase::Paused => world.sfx(SfxEvent::Ui),
        Phase::MatchOver => {
            let winner = match_winner.unwrap_or(if score.blue > score.red {
                crate::types::Team::Blue
            } else {
                crate::types::Team::Red
            });
            celebrate(world, winner);
            world.sfx(if winner == crate::types::Team::Blue {
                SfxEvent::MatchWin
            } else {
                SfxEvent::MatchLose
            });
        }
        _ => {}
    }
}
