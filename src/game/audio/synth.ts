// Tiny WebAudio synth: every sound is generated at runtime, so the game ships
// with zero audio assets.

export interface ToneOptions {
  freq?: number;
  end?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  attack?: number;
}

export interface HissOptions {
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


export class Synth {

  protected ctx: AudioContext | null = null;
  protected master: GainNode | null = null;
  protected noise: AudioBuffer | null = null;
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

  protected tone({
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

  protected hiss({
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
}
