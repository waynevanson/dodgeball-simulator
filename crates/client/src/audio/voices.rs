//! Every game sound, expressed on top of the offline synth.

use super::synth::{Clip, FilterKind, Hiss, Tone, Waveform};

/// Number of pre-rendered loudness variants for parameterised sounds.
pub const THROW_STEPS: usize = 4;
pub const BOUNCE_STEPS: usize = 4;

pub fn throw_ball(power: f32) -> Vec<u8> {
    let power = power.clamp(0.0, 1.0);
    let mut clip = Clip::new();
    clip.hiss(Hiss {
        dur: 0.16 + power * 0.08,
        gain: 0.16 + power * 0.12,
        freq: 2200.0,
        q: 0.7,
        sweep: Some(420.0),
        ..Hiss::default()
    });
    clip.tone(Tone {
        freq: 220.0 + power * 120.0,
        end: 90.0,
        dur: 0.12,
        wave: Waveform::Triangle,
        gain: 0.12,
        ..Tone::default()
    });
    clip.into_wav()
}

pub fn hit() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: 180.0,
        end: 48.0,
        dur: 0.28,
        wave: Waveform::Square,
        gain: 0.3,
        ..Tone::default()
    });
    clip.hiss(Hiss {
        dur: 0.16,
        gain: 0.35,
        freq: 900.0,
        q: 0.6,
        kind: FilterKind::Lowpass,
        sweep: Some(200.0),
        ..Hiss::default()
    });
    clip.into_wav()
}

/// Norris loses his glasses: a pained synth scream. The browser layer adds the
/// spoken "HEADSHOT" call on top of this clip.
pub fn headshot() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: 180.0,
        end: 48.0,
        dur: 0.28,
        wave: Waveform::Square,
        gain: 0.3,
        ..Tone::default()
    });
    clip.hiss(Hiss {
        dur: 0.16,
        gain: 0.35,
        freq: 900.0,
        q: 0.6,
        kind: FilterKind::Lowpass,
        sweep: Some(200.0),
        ..Hiss::default()
    });
    clip.tone(Tone {
        freq: 1180.0,
        end: 340.0,
        dur: 0.62,
        wave: Waveform::Sawtooth,
        gain: 0.19,
        ..Tone::default()
    });
    clip.tone(Tone {
        freq: 760.0,
        end: 260.0,
        dur: 0.58,
        wave: Waveform::Square,
        gain: 0.09,
        delay: 0.03,
        ..Tone::default()
    });
    clip.hiss(Hiss {
        dur: 0.55,
        gain: 0.16,
        freq: 2100.0,
        sweep: Some(480.0),
        q: 1.1,
        ..Hiss::default()
    });
    clip.into_wav()
}

pub fn catch_ball() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: 620.0,
        end: 660.0,
        dur: 0.07,
        wave: Waveform::Triangle,
        gain: 0.22,
        ..Tone::default()
    });
    clip.tone(Tone {
        freq: 880.0,
        end: 1320.0,
        dur: 0.16,
        wave: Waveform::Triangle,
        gain: 0.22,
        delay: 0.06,
        ..Tone::default()
    });
    clip.into_wav()
}

pub fn block() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: 140.0,
        end: 90.0,
        dur: 0.12,
        wave: Waveform::Square,
        gain: 0.22,
        ..Tone::default()
    });
    clip.hiss(Hiss {
        dur: 0.1,
        gain: 0.2,
        freq: 500.0,
        q: 0.8,
        ..Hiss::default()
    });
    clip.into_wav()
}

pub fn pickup() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: 520.0,
        end: 700.0,
        dur: 0.07,
        wave: Waveform::Sine,
        gain: 0.13,
        ..Tone::default()
    });
    clip.into_wav()
}

pub fn bounce(speed: f32) -> Vec<u8> {
    let speed = speed.clamp(0.0, 1.0);
    let mut clip = Clip::new();
    clip.hiss(Hiss {
        dur: 0.05,
        gain: 0.05 + speed * 0.1,
        freq: 700.0 + speed * 500.0,
        q: 1.4,
        ..Hiss::default()
    });
    clip.into_wav()
}

pub fn dash() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.hiss(Hiss {
        dur: 0.15,
        gain: 0.12,
        freq: 1400.0,
        q: 0.8,
        sweep: Some(260.0),
        ..Hiss::default()
    });
    clip.into_wav()
}

pub fn catch_start() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: 320.0,
        end: 420.0,
        dur: 0.05,
        wave: Waveform::Sine,
        gain: 0.06,
        ..Tone::default()
    });
    clip.into_wav()
}

pub fn beep(final_beep: bool) -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: if final_beep { 900.0 } else { 560.0 },
        dur: if final_beep { 0.24 } else { 0.1 },
        wave: Waveform::Square,
        gain: if final_beep { 0.16 } else { 0.1 },
        ..Tone::default()
    });
    clip.into_wav()
}

pub fn whistle() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: 2100.0,
        end: 2400.0,
        dur: 0.16,
        wave: Waveform::Sine,
        gain: 0.1,
        ..Tone::default()
    });
    clip.tone(Tone {
        freq: 2400.0,
        end: 2100.0,
        dur: 0.14,
        wave: Waveform::Sine,
        gain: 0.08,
        delay: 0.16,
        ..Tone::default()
    });
    clip.into_wav()
}

pub fn round_win() -> Vec<u8> {
    arpeggio(
        &[523.0, 659.0, 784.0, 1046.0],
        0.2,
        0.075,
        Waveform::Triangle,
        0.15,
        None,
    )
}

pub fn round_lose() -> Vec<u8> {
    arpeggio(
        &[392.0, 330.0, 262.0],
        0.25,
        0.1,
        Waveform::Sawtooth,
        0.09,
        None,
    )
}

pub fn match_win() -> Vec<u8> {
    arpeggio(
        &[523.0, 659.0, 784.0, 1046.0, 1318.0],
        0.34,
        0.1,
        Waveform::Triangle,
        0.16,
        Some(Hiss {
            dur: 0.9,
            gain: 0.1,
            freq: 3000.0,
            q: 0.6,
            delay: 0.1,
            ..Hiss::default()
        }),
    )
}

pub fn match_lose() -> Vec<u8> {
    arpeggio(
        &[392.0, 349.0, 311.0, 233.0],
        0.4,
        0.13,
        Waveform::Sine,
        0.12,
        None,
    )
}

pub fn ui() -> Vec<u8> {
    let mut clip = Clip::new();
    clip.tone(Tone {
        freq: 660.0,
        end: 880.0,
        dur: 0.06,
        wave: Waveform::Sine,
        gain: 0.08,
        ..Tone::default()
    });
    clip.into_wav()
}

fn arpeggio(
    freqs: &[f32],
    dur: f32,
    step: f32,
    wave: Waveform,
    gain: f32,
    tail: Option<Hiss>,
) -> Vec<u8> {
    let mut clip = Clip::new();
    for (index, &freq) in freqs.iter().enumerate() {
        clip.tone(Tone {
            freq,
            end: freq,
            dur,
            wave,
            gain,
            delay: index as f32 * step,
            ..Tone::default()
        });
    }
    if let Some(hiss) = tail {
        clip.hiss(hiss);
    }
    clip.into_wav()
}

/// Pre-render the parameterised sounds across their useful range.
pub fn throw_variants() -> Vec<Vec<u8>> {
    levels(THROW_STEPS, throw_ball)
}

pub fn bounce_variants() -> Vec<Vec<u8>> {
    levels(BOUNCE_STEPS, bounce)
}

fn levels(steps: usize, mut render: impl FnMut(f32) -> Vec<u8>) -> Vec<Vec<u8>> {
    let divisor = steps.saturating_sub(1).max(1) as f32;
    (0..steps)
        .map(|index| render(index as f32 / divisor))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_voice_produces_a_wav() {
        let clips = vec![
            throw_ball(0.5),
            hit(),
            headshot(),
            catch_ball(),
            block(),
            pickup(),
            bounce(0.7),
            dash(),
            catch_start(),
            beep(false),
            beep(true),
            whistle(),
            round_win(),
            round_lose(),
            match_win(),
            match_lose(),
            ui(),
        ];
        for wav in clips {
            assert!(wav.starts_with(b"RIFF"));
            assert!(wav.len() > 44);
        }
        assert_eq!(throw_variants().len(), THROW_STEPS);
        assert_eq!(bounce_variants().len(), BOUNCE_STEPS);
    }
}
