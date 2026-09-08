import type { Game, GameEvent } from '../game/sim';

/** 1mの糸が出る間に鳴るラチェットのクリック数 */
const CLICKS_PER_M = 14;
/** これ以上速いとクリックが連続音として鳴る上限（回/秒） */
const MAX_CLICK_RATE = 230;
/** この速さ（回/秒）から唸り（スクリーム）が乗り始める */
const SCREAM_FROM = 35;

/**
 * Web Audio API による効果音。音声ファイルは使わず全て合成。
 * 主役はドラグのクリッカー: 糸が出る速さに比例してラチェット音が鳴り、
 * 大物が走ると悲鳴のような連続音になる。
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private clickBuf: AudioBuffer | null = null;
  private reelBuf: AudioBuffer | null = null;
  private nextClick = 0;
  private nextReel = 0;
  private wasFighting = false;
  /** 高速時に乗る連続的な唸り。2つのノコギリ波を少しずらして機械的なうねりを出す */
  private screamOsc: OscillatorNode[] = [];
  private screamFilter: BiquadFilterNode | null = null;
  private screamGain: GainNode | null = null;
  muted = false;

  constructor() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.clickBuf = this.renderClick(this.ctx, 0.03, [2600, 3900, 5200], 0.006, 1.0);
    this.reelBuf = this.renderClick(this.ctx, 0.025, [900, 1500, 2300], 0.007, 0.5);

    this.screamGain = this.ctx.createGain();
    this.screamGain.gain.value = 0;
    this.screamFilter = this.ctx.createBiquadFilter();
    this.screamFilter.type = 'bandpass';
    this.screamFilter.frequency.value = 1400;
    this.screamFilter.Q.value = 2.5;
    this.screamFilter.connect(this.screamGain).connect(this.master);
    for (const detune of [0, 9]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 900 + detune;
      osc.connect(this.screamFilter);
      osc.start();
      this.screamOsc.push(osc);
    }
  }

  get available(): boolean {
    return this.ctx !== null;
  }

  /** ブラウザの自動再生制限を解除（ユーザー操作の中で呼ぶ） */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  /** 金属的な短いクリック音を1回分レンダリング */
  private renderClick(ctx: AudioContext, dur: number, partials: number[], decay: number, level: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let v = 0;
      for (let k = 0; k < partials.length; k++) {
        v += Math.sin(2 * Math.PI * partials[k] * t) * Math.exp(-t / (decay * (1 - k * 0.2))) / (k + 1);
      }
      // 立ち上がりの微小なノイズ（叩いた感じ）
      if (t < 0.002) v += (Math.random() * 2 - 1) * 0.6 * (1 - t / 0.002);
      d[i] = v * level * 0.5;
    }
    return buf;
  }

  private play(buf: AudioBuffer, t: number, gain: number, rate = 1): void {
    if (!this.ctx || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(t);
  }

  /** 毎フレーム呼ぶ。ファイト状態からドラグ音・リール音をスケジュールする */
  update(game: Game): void {
    if (!this.ctx || !this.clickBuf || !this.reelBuf) return;
    for (const ev of game.drainEvents()) this.onEvent(ev);

    const f = game.fight;
    const now = this.ctx.currentTime;
    const horizon = now + 0.12;

    if (f && !this.wasFighting) this.nextClick = 0;
    this.wasFighting = !!f;

    // ドラグクリッカー: 糸が出る速さに比例
    const rate = f ? Math.min(MAX_CLICK_RATE, f.outRate * CLICKS_PER_M) : 0;
    if (rate > 0.5) {
      if (this.nextClick < now - 0.05) this.nextClick = now;
      while (this.nextClick < horizon) {
        // 速いほど少し高く・大きく
        const speed = rate / MAX_CLICK_RATE;
        this.play(this.clickBuf, this.nextClick, 0.6 + speed * 0.6, 0.85 + speed * 0.6 + Math.random() * 0.04);
        this.nextClick += 1 / rate;
      }
    }

    // スクリーム: 速い時だけ乗る高い唸り。速さで音程と音量が上がる
    if (this.screamGain && this.screamFilter) {
      const k = Math.min(1, Math.max(0, (rate - SCREAM_FROM) / (MAX_CLICK_RATE - SCREAM_FROM)));
      const level = Math.pow(k, 1.4) * 0.5;
      this.screamGain.gain.setTargetAtTime(level, now, level > this.screamGain.gain.value ? 0.04 : 0.12);
      const freq = 750 + k * 1500 + (f ? Math.sin(f.elapsed * 9) * 25 : 0);
      this.screamOsc[0].frequency.setTargetAtTime(freq, now, 0.06);
      this.screamOsc[1].frequency.setTargetAtTime(freq * 1.012 + 6, now, 0.06);
      this.screamFilter.frequency.setTargetAtTime(freq * 1.6, now, 0.06);
    }

    // リールの巻き音: 控えめな低いカチカチ
    const reelRate = f && f.reeling && f.inRate > 0.05 ? Math.min(40, 4 + f.inRate * 3) : 0;
    if (reelRate > 0) {
      if (this.nextReel < now - 0.05) this.nextReel = now;
      while (this.nextReel < horizon) {
        this.play(this.reelBuf, this.nextReel, 0.25, 0.95 + Math.random() * 0.1);
        this.nextReel += 1 / reelRate;
      }
    }
  }

  private onEvent(ev: GameEvent): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (ev) {
      case 'hit':
        // 竿が叩かれる音 + 即座に立ち上がるクリッカーの悲鳴
        this.thump(t, 220, 55, 0.3, 1.1);
        this.splash(t + 0.02, 0.2, 0.5);
        for (let i = 0; i < 40; i++) {
          const p = i / 40;
          this.play(this.clickBuf!, t + 0.03 + i * (0.02 - p * 0.013), 0.7 + p * 0.5, 1.0 + p * 0.5);
        }
        break;
      case 'miss':
        this.splash(t, 0.12, 0.35);
        break;
      case 'jump':
        this.splash(t, 0.35, 0.6);
        break;
      case 'thrash':
        this.splash(t, 0.3, 0.7);
        this.thump(t, 140, 70, 0.15, 0.6);
        break;
      case 'break':
        this.snap(t);
        this.whip(t + 0.03);
        break;
      case 'hookoffJump':
        // 空中で外れる: 水しぶき + 金具が飛ぶ高い「チン」
        this.splash(t, 0.4, 0.7);
        this.ping(t + 0.05);
        this.thump(t + 0.1, 150, 60, 0.25, 0.5);
        break;
      case 'spooled':
      case 'pulled':
        this.thump(t, 120, 40, 0.35, 0.8);
        break;
      case 'landed':
        this.chime(t);
        break;
    }
  }

  /** 低い「ドン」 */
  private thump(t: number, f0: number, f1: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** 水しぶき（ローパスしたノイズ） */
  private splash(t: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - p, 1.5) * Math.min(1, p * 20);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + dur);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(lp).connect(g).connect(this.master!);
    src.start(t);
  }

  /** 切れた糸が空を切る「シュッ」 */
  private whip(t: number): void {
    const ctx = this.ctx!;
    const dur = 0.22;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * p) * Math.pow(1 - p, 0.6);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(4500, t + dur * 0.5);
    bp.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = ctx.createGain();
    g.gain.value = 0.7;
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t);
  }

  /** 金具が弾ける「チン」 */
  private ping(t: number): void {
    const ctx = this.ctx!;
    for (const [f, a] of [
      [3200, 0.35],
      [4800, 0.2],
      [6900, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  /** ラインブレイクの「パン」 */
  private snap(t: number): void {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * 0.09);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.15));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = 1.0;
    src.connect(hp).connect(g).connect(this.master!);
    src.start(t);
    this.thump(t + 0.02, 90, 50, 0.25, 0.5);
  }

  /** キャッチの短いファンファーレ */
  private chime(t: number): void {
    const ctx = this.ctx!;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      const t0 = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(g).connect(this.master!);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  }
}
