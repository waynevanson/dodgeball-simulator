//! Generated sound effects and their mapping from simulation events.
//!
//! The simulation emits [`SfxEvent`]s; this module owns the pre-rendered WAV
//! clips and spawns a short-lived [`AudioPlayer`] for each one. All clips are
//! synthesised at startup (see [`synth`]), so no audio files are shipped.

pub mod synth;
pub mod voices;

use std::time::{Duration, Instant};

use bevy::audio::{AudioPlayer, AudioSource, PlaybackSettings};
use bevy::prelude::*;
use dodgeball_sim::types::SfxEvent;

/// Longest generated clip is the match-win jingle (~1.3 s).
const MAX_CLIP_LIFETIME: Duration = Duration::from_secs(4);

/// Attached to every one-shot so it is cleaned up even when no audio device is
/// available and Bevy's `DESPAWN` playback mode never sees a sink.
#[derive(Component)]
pub(crate) struct SfxLifetime(Instant);

/// Pre-rendered clips for every simulation sound.
#[derive(Resource)]
pub struct SoundBank {
    throw: Vec<Handle<AudioSource>>,
    bounce: Vec<Handle<AudioSource>>,
    beep: [Handle<AudioSource>; 2],
    hit: Handle<AudioSource>,
    headshot: Handle<AudioSource>,
    catch: Handle<AudioSource>,
    block: Handle<AudioSource>,
    pickup: Handle<AudioSource>,
    dash: Handle<AudioSource>,
    catch_start: Handle<AudioSource>,
    whistle: Handle<AudioSource>,
    round_win: Handle<AudioSource>,
    round_lose: Handle<AudioSource>,
    match_win: Handle<AudioSource>,
    match_lose: Handle<AudioSource>,
    ui: Handle<AudioSource>,
}

/// Render every clip into the asset store. Runs once at startup.
pub fn setup_audio(mut commands: Commands, mut sources: ResMut<Assets<AudioSource>>) {
    let mut insert = |bytes: Vec<u8>| -> Handle<AudioSource> {
        sources.add(AudioSource {
            bytes: bytes.into(),
        })
    };
    let bank = SoundBank {
        throw: voices::throw_variants()
            .into_iter()
            .map(&mut insert)
            .collect(),
        bounce: voices::bounce_variants()
            .into_iter()
            .map(&mut insert)
            .collect(),
        beep: [insert(voices::beep(false)), insert(voices::beep(true))],
        hit: insert(voices::hit()),
        headshot: insert(voices::headshot()),
        catch: insert(voices::catch_ball()),
        block: insert(voices::block()),
        pickup: insert(voices::pickup()),
        dash: insert(voices::dash()),
        catch_start: insert(voices::catch_start()),
        whistle: insert(voices::whistle()),
        round_win: insert(voices::round_win()),
        round_lose: insert(voices::round_lose()),
        match_win: insert(voices::match_win()),
        match_lose: insert(voices::match_lose()),
        ui: insert(voices::ui()),
    };
    commands.insert_resource(bank);
}

impl SoundBank {
    /// Play the sound for a simulation event. Muted clients skip the work
    /// entirely, including the spoken headshot call.
    pub fn play(&self, commands: &mut Commands, muted: bool, event: SfxEvent) {
        if muted {
            return;
        }
        match event {
            SfxEvent::Throw(power) => {
                self.emit(commands, &self.throw[level(power, self.throw.len())])
            }
            SfxEvent::Hit => self.emit(commands, &self.hit),
            SfxEvent::Headshot => {
                self.emit(commands, &self.headshot);
                speak_headshot();
            }
            SfxEvent::Catch => self.emit(commands, &self.catch),
            SfxEvent::Block => self.emit(commands, &self.block),
            SfxEvent::Pickup => self.emit(commands, &self.pickup),
            SfxEvent::Bounce(speed) => {
                self.emit(commands, &self.bounce[level(speed, self.bounce.len())])
            }
            SfxEvent::Dash => self.emit(commands, &self.dash),
            SfxEvent::CatchStart => self.emit(commands, &self.catch_start),
            SfxEvent::Beep(final_beep) => self.emit(commands, &self.beep[usize::from(final_beep)]),
            SfxEvent::Whistle => self.emit(commands, &self.whistle),
            SfxEvent::RoundWin => self.emit(commands, &self.round_win),
            SfxEvent::RoundLose => self.emit(commands, &self.round_lose),
            SfxEvent::MatchWin => self.emit(commands, &self.match_win),
            SfxEvent::MatchLose => self.emit(commands, &self.match_lose),
            SfxEvent::Ui => self.emit(commands, &self.ui),
        }
    }

    fn emit(&self, commands: &mut Commands, clip: &Handle<AudioSource>) {
        commands.spawn((
            AudioPlayer::new(clip.clone()),
            PlaybackSettings::DESPAWN,
            SfxLifetime(Instant::now()),
        ));
    }
}

/// Remove sounds that could not play because the audio device was missing.
pub(crate) fn cleanup_stale_sfx(mut commands: Commands, sounds: Query<(Entity, &SfxLifetime)>) {
    for (entity, lifetime) in &sounds {
        if lifetime.0.elapsed() > MAX_CLIP_LIFETIME {
            commands.entity(entity).despawn();
        }
    }
}

/// Map a 0..=1 parameter onto one of the pre-rendered variants.
fn level(value: f64, steps: usize) -> usize {
    if steps <= 1 {
        return 0;
    }
    let value = value.clamp(0.0, 1.0) as f32;
    ((value * (steps - 1) as f32).round() as usize).min(steps - 1)
}

/// Reproduce the old browser "HEADSHOT" call. Native builds have no speech
/// synthesis, so the synth scream is the whole effect there.
#[cfg(target_arch = "wasm32")]
fn speak_headshot() {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Ok(synthesis) = window.speech_synthesis() else {
        return;
    };
    let Ok(utterance) = web_sys::SpeechSynthesisUtterance::new_with_text("HEADSHOT") else {
        return;
    };
    utterance.set_pitch(2.0);
    utterance.set_rate(1.1);
    utterance.set_volume(0.9);
    synthesis.cancel();
    synthesis.speak(&utterance);
}

#[cfg(not(target_arch = "wasm32"))]
fn speak_headshot() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_event_json_maps_to_sfx() {
        let throw: SfxEvent = serde_json::from_str(r#"{"type":"throw","value":0.75}"#).unwrap();
        assert!(matches!(throw, SfxEvent::Throw(power) if (power - 0.75).abs() < 1e-9));
        let beep: SfxEvent = serde_json::from_str(r#"{"type":"beep","value":true}"#).unwrap();
        assert!(matches!(beep, SfxEvent::Beep(true)));
        let hit: SfxEvent = serde_json::from_str(r#"{"type":"hit"}"#).unwrap();
        assert!(matches!(hit, SfxEvent::Hit));
    }

    #[test]
    fn parameters_pick_a_bounded_variant() {
        assert_eq!(level(0.0, 4), 0);
        assert_eq!(level(0.4, 4), 1);
        assert_eq!(level(0.8, 4), 2);
        assert_eq!(level(1.0, 4), 3);
        assert_eq!(level(-2.0, 4), 0);
        assert_eq!(level(9.0, 4), 3);
        assert_eq!(level(0.9, 1), 0);
    }
}
