import { Synth } from './synth';

/** Every game sound, expressed on top of the synth engine. */
export class Sfx extends Synth {
  // ------------------------------------------------------------------ events

  throwBall(power = 0.5): void {
    this.hiss({
      dur: 0.16 + power * 0.08,
      gain: 0.16 + power * 0.12,
      freq: 2200,
      sweep: 420,
      q: 0.7,
    });
    this.tone({ freq: 220 + power * 120, end: 90, dur: 0.12, type: 'triangle', gain: 0.12 });
  }

  hit(): void {
    this.tone({ freq: 180, end: 48, dur: 0.28, type: 'square', gain: 0.3 });
    this.hiss({ dur: 0.16, gain: 0.35, freq: 900, q: 0.6, type: 'lowpass', sweep: 200 });
  }

  /** Norris loses his glasses: a pained synth scream plus the call. */
  headshot(): void {
    this.hit();
    this.tone({ freq: 1180, end: 340, dur: 0.62, type: 'sawtooth', gain: 0.19 });
    this.tone({ freq: 760, end: 260, dur: 0.58, type: 'square', gain: 0.09, delay: 0.03 });
    this.hiss({ dur: 0.55, gain: 0.16, freq: 2100, sweep: 480, q: 1.1 });

    if (this.muted) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const utterance = new SpeechSynthesisUtterance('HEADSHOT');
      utterance.pitch = 2;
      utterance.rate = 1.1;
      utterance.volume = 0.9;
      synth.cancel();
      synth.speak(utterance);
    } catch {
      /* speech synthesis is optional */
    }
  }

  catchBall(): void {
    this.tone({ freq: 620, end: 660, dur: 0.07, type: 'triangle', gain: 0.22 });
    this.tone({ freq: 880, end: 1320, dur: 0.16, type: 'triangle', gain: 0.22, delay: 0.06 });
  }

  block(): void {
    this.tone({ freq: 140, end: 90, dur: 0.12, type: 'square', gain: 0.22 });
    this.hiss({ dur: 0.1, gain: 0.2, freq: 500, q: 0.8 });
  }

  pickup(): void {
    this.tone({ freq: 520, end: 700, dur: 0.07, type: 'sine', gain: 0.13 });
  }

  bounce(speed = 1): void {
    const s = Math.min(1, speed);
    this.hiss({ dur: 0.05, gain: 0.05 + s * 0.1, freq: 700 + s * 500, q: 1.4 });
  }

  dash(): void {
    this.hiss({ dur: 0.15, gain: 0.12, freq: 1400, sweep: 260, q: 0.8 });
  }

  catchStart(): void {
    this.tone({ freq: 320, end: 420, dur: 0.05, type: 'sine', gain: 0.06 });
  }

  beep(final = false): void {
    this.tone({
      freq: final ? 900 : 560,
      dur: final ? 0.24 : 0.1,
      type: 'square',
      gain: final ? 0.16 : 0.1,
    });
  }

  whistle(): void {
    this.tone({ freq: 2100, end: 2400, dur: 0.16, type: 'sine', gain: 0.1 });
    this.tone({ freq: 2400, end: 2100, dur: 0.14, type: 'sine', gain: 0.08, delay: 0.16 });
  }

  roundWin(): void {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.15, delay: i * 0.075 }),
    );
  }

  roundLose(): void {
    [392, 330, 262].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.25, type: 'sawtooth', gain: 0.09, delay: i * 0.1 }),
    );
  }

  matchWin(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.34, type: 'triangle', gain: 0.16, delay: i * 0.1 }),
    );
    this.hiss({ dur: 0.9, gain: 0.1, freq: 3000, q: 0.6, delay: 0.1 });
  }

  matchLose(): void {
    [392, 349, 311, 233].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.4, type: 'sine', gain: 0.12, delay: i * 0.13 }),
    );
  }

  ui(): void {
    this.tone({ freq: 660, end: 880, dur: 0.06, type: 'sine', gain: 0.08 });
  }
}
