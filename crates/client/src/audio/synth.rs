//! Tiny offline synthesizer used to generate every sound at startup.
//!
//! The old TypeScript client built its sounds with WebAudio oscillators and
//! filters. This module renders the same voices into mono 16-bit WAV buffers so
//! the shared Bevy client ships with zero audio assets and works on both
//! native and wasm targets.

/// Sample rate used by every generated clip.
pub const SAMPLE_RATE: u32 = 44_100;
const SAMPLE_RATE_F32: f32 = SAMPLE_RATE as f32;
/// Master gain the WebAudio synth applied on top of each voice.
pub const MASTER_VOLUME: f32 = 0.42;
const EPSILON: f32 = 0.0001;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Waveform {
    Sine,
    Square,
    Sawtooth,
    Triangle,
}

#[derive(Clone, Copy, Debug)]
pub struct Tone {
    /// Starting frequency in hertz.
    pub freq: f32,
    /// Frequency the oscillator ramps to over `dur`; equal to `freq` for a flat
    /// tone.
    pub end: f32,
    /// Total duration in seconds.
    pub dur: f32,
    pub wave: Waveform,
    /// Peak gain before the master volume.
    pub gain: f32,
    /// Start offset in seconds.
    pub delay: f32,
    /// Exponential attack in seconds.
    pub attack: f32,
}

impl Default for Tone {
    fn default() -> Self {
        Self {
            freq: 440.0,
            end: 440.0,
            dur: 0.15,
            wave: Waveform::Sine,
            gain: 0.3,
            delay: 0.0,
            attack: 0.006,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FilterKind {
    Bandpass,
    Lowpass,
}

#[derive(Clone, Copy, Debug)]
pub struct Hiss {
    /// Total duration in seconds.
    pub dur: f32,
    /// Peak gain before the master volume.
    pub gain: f32,
    /// Filter cutoff in hertz.
    pub freq: f32,
    /// Biquad Q.
    pub q: f32,
    /// Start offset in seconds.
    pub delay: f32,
    pub kind: FilterKind,
    /// Optional cutoff the filter sweeps to over `dur`.
    pub sweep: Option<f32>,
}

impl Default for Hiss {
    fn default() -> Self {
        Self {
            dur: 0.2,
            gain: 0.25,
            freq: 1200.0,
            q: 0.9,
            delay: 0.0,
            kind: FilterKind::Bandpass,
            sweep: None,
        }
    }
}

/// A mono float clip that voices are mixed into.
#[derive(Default)]
pub struct Clip {
    samples: Vec<f32>,
}

impl Clip {
    pub fn new() -> Self {
        Self::default()
    }

    /// Mix a single oscillator voice into the clip.
    pub fn tone(&mut self, tone: Tone) {
        let start = (tone.delay.max(0.0) * SAMPLE_RATE_F32) as usize;
        let len = (tone.dur.max(0.0) * SAMPLE_RATE_F32) as usize;
        self.ensure(start + len);

        let mut phase = 0.0f32;
        for i in 0..len {
            let time = i as f32 / SAMPLE_RATE_F32;
            let freq = ramp(tone.freq, tone.end, time, tone.dur);
            phase = (phase + freq / SAMPLE_RATE_F32).fract();
            let value = oscillate(tone.wave, phase);
            self.add(
                start + i,
                value * envelope(time, tone.dur, tone.attack, tone.gain),
            );
        }
    }

    /// Mix a single filtered-noise voice into the clip.
    pub fn hiss(&mut self, hiss: Hiss) {
        let start = (hiss.delay.max(0.0) * SAMPLE_RATE_F32) as usize;
        let len = (hiss.dur.max(0.0) * SAMPLE_RATE_F32) as usize;
        self.ensure(start + len);

        let (mut x1, mut x2, mut y1, mut y2) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
        for i in 0..len {
            let time = i as f32 / SAMPLE_RATE_F32;
            let cutoff = match hiss.sweep {
                Some(sweep) => ramp(hiss.freq, sweep, time, hiss.dur),
                None => hiss.freq,
            };
            let (b0, b1, b2, a1, a2) = coefficients(hiss.kind, cutoff, hiss.q);
            let x0 = fastrand::f32() * 2.0 - 1.0;
            let y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1;
            x1 = x0;
            y2 = y1;
            y1 = y0;
            self.add(start + i, y0 * envelope(time, hiss.dur, 0.0, hiss.gain));
        }
    }

    /// Encode the mixed clip as a mono 16-bit WAV.
    pub fn into_wav(self) -> Vec<u8> {
        encode_wav(&self.samples)
    }

    pub fn samples(&self) -> &[f32] {
        &self.samples
    }

    fn ensure(&mut self, len: usize) {
        if self.samples.len() < len {
            self.samples.resize(len, 0.0);
        }
    }

    fn add(&mut self, index: usize, value: f32) {
        if let Some(sample) = self.samples.get_mut(index) {
            *sample += value;
        }
    }
}

fn ramp(start: f32, end: f32, time: f32, dur: f32) -> f32 {
    if start <= 0.0 || end <= 0.0 || start == end || dur <= 0.0 {
        return start.max(0.0);
    }
    start * (end / start).powf((time / dur).clamp(0.0, 1.0))
}

fn oscillate(wave: Waveform, phase: f32) -> f32 {
    match wave {
        Waveform::Sine => (phase * std::f32::consts::TAU).sin(),
        Waveform::Square => {
            if phase < 0.5 {
                1.0
            } else {
                -1.0
            }
        }
        Waveform::Sawtooth => phase * 2.0 - 1.0,
        Waveform::Triangle => 4.0 * (phase - 0.5).abs() - 1.0,
    }
}

/// Matches the WebAudio envelope: exponential attack, exponential decay to
/// silence, with no tail after `dur`.
fn envelope(time: f32, dur: f32, attack: f32, gain: f32) -> f32 {
    if time >= dur || gain <= 0.0 {
        return 0.0;
    }
    if attack > 0.0 && time < attack {
        EPSILON * (gain / EPSILON).powf(time / attack)
    } else {
        let remaining = (dur - attack).max(1e-6);
        gain * (EPSILON / gain).powf(((time - attack) / remaining).clamp(0.0, 1.0))
    }
}

/// RBJ biquad coefficients, matching WebAudio's bandpass/lowpass shapes.
/// Returns `(b0, b1, b2, a1, a2)` with `a0` normalised out.
fn coefficients(kind: FilterKind, freq: f32, q: f32) -> (f32, f32, f32, f32, f32) {
    let freq = freq.clamp(20.0, SAMPLE_RATE_F32 * 0.45);
    let q = q.max(0.05);
    let w0 = std::f32::consts::TAU * freq / SAMPLE_RATE_F32;
    let cos = w0.cos();
    let alpha = w0.sin() / (2.0 * q);
    let a0 = 1.0 + alpha;
    match kind {
        FilterKind::Bandpass => (
            alpha / a0,
            0.0,
            -alpha / a0,
            -2.0 * cos / a0,
            (1.0 - alpha) / a0,
        ),
        FilterKind::Lowpass => {
            let b0 = (1.0 - cos) / 2.0 / a0;
            let b1 = (1.0 - cos) / a0;
            (b0, b1, b0, -2.0 * cos / a0, (1.0 - alpha) / a0)
        }
    }
}

fn encode_wav(samples: &[f32]) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    out.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes()); // byte rate
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for &sample in samples {
        let value = (sample * MASTER_VOLUME).clamp(-1.0, 1.0);
        let pcm = (value * i16::MAX as f32) as i16;
        out.extend_from_slice(&pcm.to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_header_describes_mono_16_bit_pcm() {
        let clip = {
            let mut clip = Clip::new();
            clip.tone(Tone::default());
            clip
        };
        let frames = clip.samples().len();
        let wav = clip.into_wav();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(
            u32::from_le_bytes(wav[24..28].try_into().unwrap()),
            SAMPLE_RATE
        );
        assert_eq!(u16::from_le_bytes(wav[22..24].try_into().unwrap()), 1);
        assert_eq!(u16::from_le_bytes(wav[34..36].try_into().unwrap()), 16);
        assert_eq!(wav.len(), 44 + frames * 2);
        assert_eq!(
            u32::from_le_bytes(wav[40..44].try_into().unwrap()) as usize,
            frames * 2
        );
    }

    #[test]
    fn generated_samples_are_finite_and_clipped() {
        let mut clip = Clip::new();
        clip.tone(Tone::default());
        clip.hiss(Hiss::default());
        clip.tone(Tone {
            freq: 220.0,
            end: 90.0,
            dur: 0.12,
            wave: Waveform::Triangle,
            gain: 0.12,
            delay: 0.01,
            attack: 0.004,
        });
        for &sample in clip.samples() {
            assert!(sample.is_finite(), "non-finite sample: {sample}");
            assert!(sample.abs() <= 4.0, "unexpected sample: {sample}");
        }
    }

    #[test]
    fn envelope_starts_and_ends_quietly() {
        assert!(envelope(0.0, 0.2, 0.01, 0.3) <= EPSILON + 1e-6);
        assert!(envelope(0.2, 0.2, 0.01, 0.3) == 0.0);
        let peak = envelope(0.01, 0.2, 0.01, 0.3);
        assert!((peak - 0.3).abs() < 1e-4, "peak was {peak}");
    }
}
