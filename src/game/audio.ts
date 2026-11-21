// Tiny WebAudio synth: every sound is generated at runtime, so the game ships
// with zero audio assets.

interface ToneOptions {
  freq?: number;
  end?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  attack?: number;
}

interface HissOptions {
  dur?: number;
  gain?: number;
  freq?: number;
  q?: number;
  delay?: number;
  type?: BiquadFilterType;
  sweep?: number | null;
}

const MASTER_VOLUME = 0.42;

type AudioContextCtor = typeof AudioContext;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  private init(): void {
    if (this.ctx) return;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.6);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  resume(): void {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, t, 0.02);
    }
  }

  private get ready(): boolean {
    return !!this.ctx && !!this.master && !!this.noise && !this.muted;
  }

  private tone({
    freq = 440,
    end = freq,
    dur = 0.15,
    type = 'sine',
    gain = 0.3,
    delay = 0,
    attack = 0.006,
  }: ToneOptions): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const master = this.master!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private hiss({
    dur = 0.2,
    gain = 0.25,
    freq = 1200,
    q = 0.9,
    delay = 0,
    type = 'bandpass',
    sweep = null,
  }: HissOptions): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const master = this.master!;
    const noise = this.noise!;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    if (sweep != null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

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

export const sfx = new Sfx();
