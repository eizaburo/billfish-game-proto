import type { TackleConfig } from '../data/equipment';
import { SPECIES, type Species } from '../data/species';
import { Fight, type FightResult, type LossReason } from './fight';
import { clamp, dist, KT_TO_MPS, normalizeAngle, pickWeighted, type Vec } from './util';
import { World, WORLD_H, WORLD_W } from './world';

export const DAY_START = 5 * 3600;
export const DAY_END = 17 * 3600;

export interface Input {
  /** -1..1 左右 */
  turn: number;
  /** -1..1 スロットル増減 */
  throttleDelta: number;
  /** 巻いているか */
  reel: boolean;
  /** -1..1 ドラグ増減 */
  dragDelta: number;
}

export interface Catch {
  species: Species;
  weightKg: number;
  time: number;
  fightSec: number;
}

export type LogKind = 'info' | 'hit' | 'catch' | 'lost' | 'warn';
export interface LogEntry {
  time: number;
  text: string;
  kind: LogKind;
}

export type RodStatus = 'out' | 'hooked' | 'retrieved';

/** ルアー1本の配置 */
export interface LurePlacement {
  /** 船から後ろ何m */
  back: number;
  /** 左右何m（正が右舷） */
  lateral: number;
  slot: 'short' | 'long' | 'center';
  side: -1 | 0 | 1;
}

/** 効果音などが拾う単発イベント */
export type GameEvent = 'hit' | 'miss' | 'jump' | 'thrash' | 'landed' | 'break' | 'spooled' | 'pulled' | 'hookoffJump';

/** ファイト終了直後の演出状態（数秒間） */
export interface FightEnding {
  result: FightResult;
  reason: LossReason | null;
  species: Species;
  weightKg: number;
  /** 魚の位置と向き（逃げていく／船横に浮く） */
  pos: Vec;
  angle: number;
  /** 終了時の糸の長さ */
  lineOut: number;
  /** 空中で外れたか */
  jumping: boolean;
  timer: number;
  duration: number;
  swimPhase: number;
  /** 魚の描画サイズ px */
  L: number;
}

export class Game {
  world = new World();
  pos: Vec = { x: WORLD_W * 0.2, y: 1000 };
  heading = Math.PI / 2; // 沖向き
  speedKt = 0;
  throttle = 0;
  waypoint: Vec | null = null;
  time = DAY_START;
  rods: RodStatus[];
  fight: Fight | null = null;
  ending: FightEnding | null = null;
  catches: Catch[] = [];
  log: LogEntry[] = [];
  events: GameEvent[] = [];
  score = 0;
  ended = false;
  wake: Vec[] = [];
  /** 各竿のルアーの実座標（船の航跡に沿って追従） */
  lures: Vec[] = [];
  /** 各ルアーの引き波 */
  lureTrails: Vec[][] = [];
  /** ヒット直後の演出タイマー（画面の揺れなど） */
  hitTimer = 0;
  strikes = 0;
  misses = 0;
  lost = 0;
  private wakeTimer = 0;
  private limitWarned = false;
  private lastFlockHint = 0;

  constructor(public tackle: TackleConfig) {
    this.rods = Array.from({ length: tackle.rodCount }, () => 'out' as RodStatus);
    this.lureTrails = this.rods.map(() => []);
    this.lures = this.rods.map(() => ({ x: this.pos.x, y: this.pos.y }));
    this.addLog(`${tackle.boat.name}で出港。${tackle.lure.name}を${tackle.rodCount}本流します。`, 'info');
    this.addLog('潮目（白い帯）や鳥山を探して船を流そう。', 'info');
  }

  get timeScale(): number {
    return this.fight || this.ending ? 10 : 60;
  }

  get maxY(): number {
    return WORLD_H * this.tackle.boat.offshoreLimit;
  }

  get offshoreFrac(): number {
    return this.pos.y / WORLD_H;
  }

  get hour(): number {
    return this.time / 3600;
  }

  get isDawnDusk(): boolean {
    return this.hour < 7 || this.hour >= 15.5;
  }

  densityHere(): number {
    return this.world.densityAt(this.pos);
  }

  timeFactor(): number {
    const h = this.hour;
    if (h < 8) return 1.3;
    if (h < 10) return 1.1;
    if (h < 14) return 0.75;
    if (h < 16) return 1.0;
    return 1.2;
  }

  /** 曳航速度がルアーに合っているか 0..1 */
  speedFactor(): number {
    const { lure } = this.tackle;
    const s = this.speedKt;
    if (s >= lure.minSpeedKt && s <= lure.maxSpeedKt) return 1;
    const diff = s < lure.minSpeedKt ? lure.minSpeedKt - s : s - lure.maxSpeedKt;
    return Math.exp(-(diff * diff) / (2 * 1.2 * 1.2));
  }

  /** 種ごとのヒット重み（省略時は現在地） */
  speciesWeights(yFrac = this.offshoreFrac): number[] {
    const yf = yFrac;
    const { lure } = this.tackle;
    return SPECIES.map((s) => {
      const [a, b] = s.zone;
      let fit = 1;
      if (yf < a || yf > b) {
        const d = yf < a ? a - yf : yf - b;
        fit = Math.exp(-(d * d) / (2 * 0.12 * 0.12));
      }
      const dd = this.isDawnDusk ? s.dawnDusk : 1;
      return s.rarity * fit * lure.speciesFactor[s.id] * dd;
    });
  }

  setWaypoint(p: Vec): void {
    this.waypoint = { x: clamp(p.x, 0, WORLD_W), y: clamp(p.y, 80, WORLD_H) };
    if (this.throttle < 0.05 && !this.fight) this.throttle = 0.5;
  }

  /** 溜まったイベントを取り出してクリア */
  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  addLog(text: string, kind: LogKind): void {
    this.log.push({ time: this.time, text, kind });
    if (this.log.length > 60) this.log.shift();
  }

  update(dt: number, input: Input): void {
    if (this.ended) return;
    const dtGame = dt * this.timeScale;
    this.time += dtGame;
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.world.update(dtGame);
    this.world.updateSightings(dtGame, this.pos);
    this.updateBoat(dt, dtGame, input);
    this.spawnSightings(dt);
    if (this.fight) this.updateFight(dt, input);
    else if (this.ending) this.updateEnding(dt);
    else this.checkStrikes(dt);
    this.hints(dt);
    if (this.time >= DAY_END && !this.fight) {
      this.ended = true;
      this.addLog('日没。帰港します。', 'info');
    }
  }

  private updateBoat(dt: number, dtGame: number, input: Input): void {
    const { boat } = this.tackle;
    if (!this.fight && !this.ending) this.throttle = clamp(this.throttle + input.throttleDelta * 0.5 * dt, 0, 1);
    const targetKt = this.fight || this.ending ? 0 : this.throttle * boat.maxSpeedKt;
    this.speedKt += clamp(targetKt - this.speedKt, -5 * dt, 3.5 * dt);

    let turn = input.turn;
    if (turn !== 0) {
      this.waypoint = null;
    } else if (this.waypoint && !this.fight) {
      const desired = Math.atan2(this.waypoint.y - this.pos.y, this.waypoint.x - this.pos.x);
      turn = clamp(normalizeAngle(desired - this.heading) * 3, -1, 1);
      if (dist(this.pos, this.waypoint) < 120) this.waypoint = null;
    }
    const turnRate = 0.35 + 0.9 * Math.min(1, this.speedKt / 6);
    this.heading = normalizeAngle(this.heading + turn * turnRate * dt);

    const mps = this.speedKt * KT_TO_MPS;
    const cur = this.world.baseCurrent;
    this.pos.x += (Math.cos(this.heading) * mps + cur.x) * dtGame;
    this.pos.y += (Math.sin(this.heading) * mps + cur.y) * dtGame;

    if (this.pos.y > this.maxY) {
      this.pos.y = this.maxY;
      if (!this.limitWarned) {
        this.addLog(`${boat.name}ではこれ以上沖に出られません。`, 'warn');
        this.limitWarned = true;
      }
    } else if (this.pos.y < this.maxY - 300) {
      this.limitWarned = false;
    }
    this.pos.x = clamp(this.pos.x, 0, WORLD_W);
    this.pos.y = clamp(this.pos.y, 80, WORLD_H);

    this.wakeTimer += dt;
    const tick = this.wakeTimer > 0.07;
    if (tick) {
      this.wakeTimer = 0;
      if (this.speedKt > 0.3) {
        this.wake.push({ x: this.pos.x, y: this.pos.y });
        if (this.wake.length > 70) this.wake.shift();
      } else if (this.wake.length) {
        this.wake.shift();
      }
    }
    this.updateLures(tick);
  }

  /**
   * ルアーの配置（船から後ろ何m、左右何m。lateral 正が右舷）。
   * 1本: 中央 / 2本: 左右 / 3本: 左右＋中央ロング / 4本: ショート左右＋ロング左右 / 5本: 4本＋中央ロング
   */
  lureLayout(i: number): LurePlacement {
    const n = this.rods.length;
    const wide = this.tackle.boat.id === 'sportfisher' ? 1.4 : 1;
    const short = (side: -1 | 1): LurePlacement => ({ back: 200, lateral: 45 * side * wide, slot: 'short', side });
    const long = (side: -1 | 1): LurePlacement => ({ back: 300, lateral: 85 * side * wide, slot: 'long', side });
    const center = (back: number): LurePlacement => ({ back, lateral: 0, slot: 'center', side: 0 });
    let layout: LurePlacement[];
    switch (n) {
      case 1:
        layout = [center(260)];
        break;
      case 2:
        layout = [short(-1), short(1)];
        break;
      case 3:
        layout = [short(-1), short(1), center(360)];
        break;
      case 4:
        layout = [short(-1), short(1), long(-1), long(1)];
        break;
      default:
        layout = [short(-1), short(1), long(-1), long(1), center(400)];
    }
    return layout[i] ?? center(300);
  }

  /** 航跡をたどって、船から path 距離 back の地点に lateral だけ横にずらした座標 */
  private pointOnWake(back: number, lateral: number): Vec {
    let remaining = back;
    let prev: Vec = this.pos;
    let dir: Vec = { x: Math.cos(this.heading), y: Math.sin(this.heading) };
    for (let i = this.wake.length - 1; i >= 0; i--) {
      const p = this.wake[i];
      const seg = dist(prev, p);
      if (seg < 1e-3) continue;
      dir = { x: (prev.x - p.x) / seg, y: (prev.y - p.y) / seg };
      if (seg >= remaining) {
        const t = remaining / seg;
        const pt = { x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t };
        return { x: pt.x - dir.y * lateral, y: pt.y + dir.x * lateral };
      }
      remaining -= seg;
      prev = p;
    }
    // 航跡が足りない分は最後の進行方向にまっすぐ延長
    return { x: prev.x - dir.x * remaining - dir.y * lateral, y: prev.y - dir.y * remaining + dir.x * lateral };
  }

  private updateLures(tick: boolean): void {
    for (let i = 0; i < this.rods.length; i++) {
      const { back, lateral } = this.lureLayout(i);
      this.lures[i] = this.pointOnWake(back, lateral);
      if (!tick) continue;
      const trail = this.lureTrails[i];
      if (this.rods[i] === 'out' && this.speedKt > 0.3) {
        trail.push({ x: this.lures[i].x, y: this.lures[i].y });
        if (trail.length > 32) trail.shift();
      } else if (trail.length) {
        trail.shift();
      }
    }
  }

  private checkStrikes(dt: number): void {
    const sf = this.speedFactor();
    if (sf < 0.02) return;
    const density = this.densityHere();
    const weights = this.speciesWeights();
    const total = weights.reduce((s, w) => s + w, 0);
    const { line, boat } = this.tackle;
    const perRod = 0.005 * density * sf * line.strikeFactor * this.timeFactor() * boat.rodEfficiency * total;
    for (let i = 0; i < this.rods.length; i++) {
      if (this.rods[i] !== 'out') continue;
      if (Math.random() < perRod * dt) {
        this.onStrike(i, weights);
        break;
      }
    }
  }

  private onStrike(rodIndex: number, weights: number[]): void {
    this.strikes++;
    const s = pickWeighted(SPECIES, weights);
    const w = s.minKg + (s.maxKg - s.minKg) * Math.pow(Math.random(), 1.8);
    const hookChance = this.tackle.lure.id === 'livebait' ? 0.8 : 0.72;
    if (Math.random() > hookChance) {
      this.misses++;
      this.events.push('miss');
      this.addLog(`${rodIndex + 1}番竿にヒット！ …乗らなかった（${s.nameJa}らしき魚影）`, 'hit');
      return;
    }
    this.rods = this.rods.map((_, i) => (i === rodIndex ? 'hooked' : 'retrieved'));
    this.lureTrails = this.rods.map(() => []);
    this.fight = new Fight(s, w, this.tackle, this.heading);
    this.events.push('hit');
    this.hitTimer = 1.2;
    const est = Math.round(w / 10) * 10;
    this.addLog(`${rodIndex + 1}番竿にヒット！！ ${s.nameJa} 推定${est}kg級が走る！他の竿を回収してファイト開始。`, 'hit');
  }

  private updateFight(dt: number, input: Input): void {
    const f = this.fight!;
    const res = f.update(dt, input.reel, input.dragDelta);
    if (f.runEnded) {
      const m = Math.round(f.runEnded.meters / 10) * 10;
      const names: Record<string, string> = { first: 'ファーストラン', second: 'セカンドラン', boatShy: '船際の走り', dive: '突っ込み', normal: '走り' };
      if (f.runEnded.kind === 'charge') this.addLog('止まった。糸ふけを取れ。', 'info');
      else if (m >= 20) this.addLog(`${names[f.runEnded.kind]}で${m}m 出された。`, 'info');
      if (f.runEnded.kind === 'first' && f.dragKg < f.safeDrag * 0.6) {
        this.addLog('走りが止まった。ドラグを少し締めて巻こう（白いマーカーが上限）。', 'info');
      }
    }
    if (f.event === 'run') {
      switch (f.runKind) {
        case 'second':
          this.addLog('セカンドラン！また走った！', 'hit');
          break;
        case 'boatShy':
          this.addLog('船を見て走った！', 'warn');
          break;
        case 'charge':
          this.addLog('船に向かって突っ込んでくる！巻いて糸ふけを取れ！', 'warn');
          break;
        case 'dive':
          this.addLog('深く突っ込んだ…重い。', 'info');
          break;
        default:
          this.addLog(`${f.runCount}回目の走り。`, 'info');
      }
    }
    if (f.event === 'jump') {
      this.events.push('jump');
      this.addLog(`${f.species.nameJa}がジャンプ！`, 'info');
    }
    if (f.event === 'thrash') {
      this.events.push('thrash');
      this.addLog('船際で暴れて走られた！まだ元気だ。', 'warn');
    }
    if (f.event === 'run' && f.runKind === 'second') this.events.push('hit');
    if (!res) return;
    const jumping = f.jumpTimer > 0 || f.lossReason === 'jumpShake' || f.lossReason === 'jumpBreak';
    this.events.push(res === 'pulled' && jumping ? 'hookoffJump' : res);
    const name = f.species.nameJa;
    const kg = Math.round(f.weightKg);
    const reasonText: Record<LossReason, string> = {
      shock: 'ドラグが強すぎた。',
      chafe: '限界近くで張り続けて擦れた。',
      jumpBreak: 'ジャンプの着水で糸が切れた。',
      jumpShake: 'ジャンプで頭を振られて外された。',
      slack: 'テンションが抜けた。',
      chargeSlack: '船に向かって走られ、糸ふけで外れた。',
      boatside: '船際で暴れて口切れ。',
      spooled: '止められなかった。',
    };
    const why = f.lossReason ? reasonText[f.lossReason] : '';
    switch (res) {
      case 'landed':
        this.catches.push({ species: f.species, weightKg: f.weightKg, time: this.time, fightSec: f.elapsed });
        this.score += Math.round(f.weightKg * f.species.scoreMul);
        this.addLog(`${name} ${kg}kg をキャッチ！（${Math.round(f.elapsed)}秒）`, 'catch');
        break;
      case 'break':
        this.lost++;
        this.addLog(`ラインブレイク！ ${name}（約${kg}kg）に切られた。${why}`, 'lost');
        break;
      case 'spooled':
        this.lost++;
        this.addLog(`糸を全部出された… ${name}（約${kg}kg）を${why}`, 'lost');
        break;
      case 'pulled':
        this.lost++;
        this.addLog(`フックアウト！ ${name}（約${kg}kg）。${why}`, 'lost');
        break;
    }
    const fishPos = { x: this.pos.x + Math.cos(f.fishAngle) * f.lineOut, y: this.pos.y + Math.sin(f.fishAngle) * f.lineOut };
    this.ending = {
      result: res,
      reason: f.lossReason,
      species: f.species,
      weightKg: f.weightKg,
      pos: fishPos,
      angle: f.fishAngle,
      lineOut: f.lineOut,
      jumping,
      timer: 0,
      duration: res === 'landed' ? 3.2 : 3.0,
      swimPhase: f.swimPhase,
      L: 44 + Math.sqrt(f.weightKg) * 3,
    };
    this.fight = null;
  }

  /** 終了演出: 逃げる魚を進め、終わったら竿を戻す */
  private updateEnding(dt: number): void {
    const e = this.ending!;
    e.timer += dt;
    if (e.result === 'landed') {
      // 船の横に浮かせる
      const side = Math.sign(Math.sin(e.angle - this.heading)) || 1;
      const target = {
        x: this.pos.x + Math.cos(this.heading) * -8 + Math.cos(this.heading + Math.PI / 2) * side * 22,
        y: this.pos.y + Math.sin(this.heading) * -8 + Math.sin(this.heading + Math.PI / 2) * side * 22,
      };
      const k = 1 - Math.exp(-dt * 3);
      e.pos.x += (target.x - e.pos.x) * k;
      e.pos.y += (target.y - e.pos.y) * k;
      e.angle = this.heading;
      e.swimPhase += dt * 3;
    } else {
      // 空中で外れた場合は最初の0.6秒はその場（着水演出）、その後泳いで逃げる
      const go = e.jumping ? Math.max(0, e.timer - 0.6) : e.timer;
      const speed = go > 0 ? 14 : 0;
      e.pos.x += Math.cos(e.angle) * speed * dt;
      e.pos.y += Math.sin(e.angle) * speed * dt;
      e.swimPhase += dt * (go > 0 ? 14 : 20);
    }
    if (e.timer >= e.duration) {
      this.ending = null;
      this.rods = this.rods.map(() => 'out');
    }
  }

  /** 魚影の濃い場所に、水面を切って泳ぐカジキを演出として湧かせる */
  private spawnSightings(dt: number): void {
    const w = this.world;
    if (w.sightings.length >= 4 || Math.random() > 1.0 * dt) return;
    // 候補地点: 近くの鳥山の周り / 近くの潮目の上 / 完全ランダム
    let p: Vec;
    const roll = Math.random();
    const nearFlocks = w.flocks.filter((f) => f.intensity > 0.3 && dist(f.pos, this.pos) < 2600);
    if (roll < 0.5 && nearFlocks.length) {
      const f = nearFlocks[Math.floor(Math.random() * nearFlocks.length)];
      const a = Math.random() * Math.PI * 2;
      const r = f.radius * (0.5 + Math.random() * 1.5);
      p = { x: f.pos.x + Math.cos(a) * r, y: f.pos.y + Math.sin(a) * r };
    } else if (roll < 0.85) {
      const c = w.currents[Math.floor(Math.random() * w.currents.length)];
      const near = c.pts.filter((q) => dist(q, this.pos) < 2200);
      if (!near.length) return;
      const q = near[Math.floor(Math.random() * near.length)];
      p = { x: q.x + (Math.random() - 0.5) * 400, y: q.y + (Math.random() - 0.5) * c.width * 2 };
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = 250 + Math.random() * 1600;
      p = { x: this.pos.x + Math.cos(a) * r, y: this.pos.y + Math.sin(a) * r };
    }
    if (p.x < 0 || p.x > WORLD_W || p.y < 200 || p.y > WORLD_H) return;
    if (dist(p, this.pos) < 150) return;
    const density = w.densityAt(p);
    if (density < 0.45 || Math.random() > density * 0.5) return;
    const weights = this.speciesWeights(p.y / WORLD_H);
    const sp = pickWeighted(SPECIES, weights);
    const maxLife = 500 + Math.random() * 900;
    w.sightings.push({
      pos: p,
      heading: Math.random() * Math.PI * 2,
      speciesId: sp.id,
      life: maxLife,
      maxLife,
      phase: Math.random() * 10,
      size: 0.8 + Math.random() * 0.5,
    });
  }

  private hints(dt: number): void {
    this.lastFlockHint -= dt;
    if (this.lastFlockHint > 0 || this.fight) return;
    const nf = this.world.nearestFlock(this.pos);
    if (nf && nf.d < 1500 && nf.d > 400) {
      const ang = Math.atan2(nf.flock.pos.y - this.pos.y, nf.flock.pos.x - this.pos.x);
      const rel = normalizeAngle(ang - this.heading);
      const side = Math.abs(rel) < 0.4 ? '前方' : rel > 0 ? '右' : '左';
      this.addLog(`${side}${Math.round(nf.d / 100) * 100}m に鳥山！`, 'info');
      this.lastFlockHint = 25;
    }
  }
}
