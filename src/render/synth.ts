import { CONFIG } from '../config.js';

/**
 * All CRUNCHER audio is synthesised here with WebAudio: no samples, no files,
 * no network. A tiny look-ahead step sequencer plays a bass-heavy synthwave
 * loop whose layers react to game intensity; SFX are one-shot voices.
 */
export type MusicMode = 'menu' | 'game' | 'boss' | 'off';

const A_MINOR = [57, 60, 64, 67, 69, 72, 76, 79]; // arp pool
const BASS_PROG = [45, 45, 41, 41, 43, 43, 40, 40]; // A F G E (per half-bar)
const BOSS_PROG = [40, 40, 41, 41, 38, 38, 39, 39]; // darker

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Synth {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noise!: AudioBuffer;
  private mode: MusicMode = 'off';
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 0..1 intensity from combo; adds layers. */
  intensity = 0;
  volume: number = CONFIG.audio.masterDefault;
  music = 0.7;
  /** Listeners for the beat (visual pulse). */
  onBeat: ((strength: number) => void) | null = null;

  /** Must be called from a user gesture (or XR session start). */
  unlock(): void {
    if (!this.ctx) {
      const AC = (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
      if (!AC) return;
      this.buildGraph(new AC({ latencyHint: 'interactive' }));
    }
    const ctx = this.ctx as AudioContext;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  private buildGraph(ctx: BaseAudioContext): void {
    this.ctx = ctx as AudioContext;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.comp);
    this.sfxBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  /**
   * QA: render `seconds` of music in a mode (plus a burst of hit SFX) offline.
   * Used by the bot to check loudness/bass and export a preview WAV.
   */
  async renderPreview(seconds: number, mode: MusicMode, intensity = 0.6): Promise<AudioBuffer> {
    const saved = { ctx: this.ctx, comp: this.comp, master: this.master, musicBus: this.musicBus, sfxBus: this.sfxBus, noise: this.noise, mode: this.mode, intensity: this.intensity, step: this.step };
    const off = new OfflineAudioContext(1, Math.ceil(44100 * seconds), 44100);
    this.buildGraph(off);
    this.mode = mode;
    this.intensity = intensity;
    const stepDur = 60 / this.bpm / 4;
    let t = 0.02;
    const beat = this.onBeat;
    this.onBeat = null;
    for (let step = 0; t < seconds - 0.1; step++, t += stepDur) this.playStep(step % 64, t, stepDur);
    this.onBeat = beat;
    const buf = await off.startRendering();
    Object.assign(this, saved);
    return buf;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volume;
    this.musicBus.gain.value = this.music * 0.85;
    this.sfxBus.gain.value = 0.9;
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.ctx) this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
  }

  get bpm(): number {
    return this.mode === 'boss' ? CONFIG.audio.bossBpm : CONFIG.audio.bpm;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.mode === 'off') return;
    const stepDur = 60 / this.bpm / 4;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + CONFIG.audio.lookAhead) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number, dur: number): void {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const menu = this.mode === 'menu';
    const boss = this.mode === 'boss';
    const prog = boss ? BOSS_PROG : BASS_PROG;
    const root = prog[(bar * 2 + (s16 >= 8 ? 1 : 0)) % prog.length] as number;
    // Kick: four on the floor (not in menu).
    if (!menu && s16 % 4 === 0) {
      this.kick(t, s16 === 0 ? 1 : 0.85);
      if (this.onBeat) {
        const delay = Math.max(0, (t - (this.ctx as AudioContext).currentTime) * 1000);
        setTimeout(() => this.onBeat?.(s16 === 0 ? 1 : 0.6), delay);
      }
    }
    // Clap on 2 and 4.
    if (!menu && (s16 === 4 || s16 === 12)) this.clap(t);
    // Hats on offbeats when intense.
    if (!menu && this.intensity > 0.25 && s16 % 2 === 1) this.hat(t, 0.25 + this.intensity * 0.25);
    // Offbeat bass (8ths).
    if (s16 % 2 === 1 || menu) {
      if (!menu || s16 % 4 === 0) this.bass(t, mtof(root - 12 + (s16 % 4 === 3 ? 12 : 0)), dur * 1.6, menu ? 0.25 : 0.5);
    }
    // Arp.
    if (s16 % (this.intensity > 0.5 || boss ? 1 : 2) === 0) {
      const note = A_MINOR[(step * 3 + bar) % A_MINOR.length] as number;
      this.pluck(t, mtof(note + (boss ? -2 : 0) + (root - 45)), dur * 0.9, menu ? 0.06 : 0.07 + this.intensity * 0.04);
    }
    // Pad swell at bar start.
    if (s16 === 0) this.pad(t, mtof(root + 12), dur * 16, menu ? 0.06 : 0.04);
  }

  // ------------------------------------------------------------ voices
  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private kick(t: number, v: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.002, 0.9 * v, 0.28);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.35);
  }

  private noiseVoice(t: number, bus: GainNode, type: BiquadFilterType, freq: number, q: number, peak: number, dec: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.002, peak, dec);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dec + 0.05);
  }

  private clap(t: number): void {
    this.noiseVoice(t, this.musicBus, 'bandpass', 1400, 1.2, 0.35, 0.16);
  }

  private hat(t: number, v: number): void {
    this.noiseVoice(t, this.musicBus, 'highpass', 7500, 0.7, v * 0.4, 0.05);
  }

  private bass(t: number, f: number, d: number, v: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = f / 2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(900 + this.intensity * 900, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + d);
    const g = ctx.createGain();
    this.env(g, t, 0.004, v, d);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.musicBus);
    o.start(t);
    o2.start(t);
    o.stop(t + d + 0.05);
    o2.stop(t + d + 0.05);
  }

  private pluck(t: number, f: number, d: number, v: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + d);
    const g = ctx.createGain();
    this.env(g, t, 0.003, v, d);
    o.connect(lp).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + d + 0.05);
  }

  private pad(t: number, f: number, d: number, v: number): void {
    const ctx = this.ctx as AudioContext;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + d * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + d);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    for (const det of [-8, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + d + 0.05);
    }
    lp.connect(g).connect(this.musicBus);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.003, peak, dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ SFX
  /** Correct smash: sub thump + bright chime that climbs with combo. */
  sfxHit(combo: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 180, 45, 0.18, 0.9);
    this.noiseVoice(t, this.sfxBus, 'bandpass', 2400, 0.8, 0.35, 0.08);
    const n = A_MINOR[Math.min(A_MINOR.length - 1, Math.floor(combo / 2))] as number;
    this.tone('triangle', mtof(n + 12), mtof(n + 12), 0.22, 0.25, 0.01);
    this.tone('square', mtof(n + 19), mtof(n + 19), 0.12, 0.08, 0.04);
  }

  sfxWrong(): void {
    if (!this.ctx) return;
    this.tone('square', 220, 70, 0.32, 0.3);
    this.tone('sawtooth', 233, 60, 0.3, 0.2);
    this.noiseVoice(this.ctx.currentTime, this.sfxBus, 'lowpass', 900, 1, 0.25, 0.2);
  }

  sfxDamage(): void {
    if (!this.ctx) return;
    this.tone('sine', 120, 30, 0.45, 1);
    this.noiseVoice(this.ctx.currentTime, this.sfxBus, 'lowpass', 400, 1, 0.5, 0.35);
  }

  sfxBugPunch(): void {
    this.tone('triangle', 300, 900, 0.12, 0.4);
    this.tone('sine', 140, 50, 0.15, 0.6);
  }

  sfxCombo(tier: number): void {
    for (let i = 0; i < 3; i++) this.tone('square', mtof(69 + tier * 2 + i * 4), mtof(69 + tier * 2 + i * 4), 0.1, 0.12, i * 0.06);
  }

  sfxClear(): void {
    [69, 72, 76, 81, 84].forEach((n, i) => this.tone('square', mtof(n), mtof(n), 0.16, 0.15, i * 0.07));
  }

  sfxButton(): void {
    this.tone('square', 880, 1320, 0.06, 0.15);
    this.tone('sine', 160, 60, 0.1, 0.5);
  }

  sfxBossShout(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(150, t + 0.15);
    o.frequency.linearRampToValueAtTime(90, t + 0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1200, t + 0.2);
    f.frequency.linearRampToValueAtTime(500, t + 0.5);
    const g = ctx.createGain();
    this.env(g, t, 0.02, 0.6, 0.5);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.6);
  }

  sfxSlowmo(on: boolean): void {
    this.tone('sawtooth', on ? 600 : 120, on ? 80 : 600, 0.5, 0.2);
  }

  sfxHeal(): void {
    [76, 79, 84].forEach((n, i) => this.tone('sine', mtof(n), mtof(n), 0.2, 0.2, i * 0.08));
  }

  sfxGameOver(): void {
    [64, 62, 60, 55].forEach((n, i) => this.tone('square', mtof(n), mtof(n - 1), 0.3, 0.15, i * 0.18));
  }

  /** Short pitched pop for chain detonations; pitch walks up. */
  private popStep = 0;
  sfxPop(): void {
    this.popStep = (this.popStep + 1) % 8;
    const f = mtof(72 + this.popStep * 2);
    this.tone('square', f, f * 0.5, 0.07, 0.12);
    this.tone('sine', 140, 50, 0.08, 0.3);
  }

  /** Blaster zap: bright downward laser chirp. */
  sfxZap(): void {
    this.tone('sawtooth', 1800, 240, 0.09, 0.12);
    this.tone('square', 900, 120, 0.06, 0.06);
  }

  sfxSixSeven(): void {
    [79, 81, 79, 81].forEach((n, i) => this.tone('square', mtof(n), mtof(n), 0.1, 0.15, i * 0.12));
  }
}
