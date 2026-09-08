import type { TackleConfig } from '../data/equipment';
import type { Species } from '../data/species';
import { clamp, normalizeAngle, rand } from './util';

export type FightResult = 'landed' | 'break' | 'spooled' | 'pulled';

/**
 * 走りの種類
 * - first: ヒット直後の全力疾走
 * - second: 最初の休みの後の強い走り（ほぼ必ず来る）
 * - normal: 通常の走り。疲れると弱くなる
 * - boatShy: 船際まで寄せたところで船を見て走る
 * - charge: 船に向かって走る。糸がふけるので巻かないとフックが外れる
 * - dive: 深く突っ込む。糸はあまり出ないが重い
 */
export type RunKind = 'first' | 'second' | 'normal' | 'boatShy' | 'charge' | 'dive';

/** 負けた理由（演出・ログ用） */
export type LossReason = 'shock' | 'chafe' | 'jumpBreak' | 'jumpShake' | 'slack' | 'chargeSlack' | 'boatside' | 'spooled';

/**
 * ファイトのシミュレーション。
 * - 魚の引き(pull) > ドラグ なら糸が出る。テンションはドラグ値。
 * - 巻いているとき pull < ドラグ なら糸が戻る。
 * - 走っている最中の衝撃を含めたテンションがライン強度を超えると切れる。
 * - テンションが抜けるとフックが外れる危険。
 */
/** 走りの種類ごとの引きの倍率 */
const RUN_BOOST: Record<RunKind, number> = {
  first: 2.2,
  second: 1.5,
  normal: 1.0,
  boatShy: 1.5,
  charge: 0,
  dive: 1.2,
};

export class Fight {
  stamina = 1;
  lineOut: number;
  dragKg: number;
  tension = 0;
  effTension = 0;
  pull = 0;
  running = true;
  runIntensity = 1;
  runTimer: number;
  jumpTimer = 0;
  elapsed = 0;
  fishAngle: number;
  targetAngle: number;
  /** HUD/ログ用の単発イベント */
  event: string | null = null;
  /** 糸が出ている速さ m/s（ドラグ音用） */
  outRate = 0;
  /** 糸を巻き取っている速さ m/s */
  inRate = 0;
  reeling = false;
  /** 魚の深さ 0(水面)..1(深い) */
  depth = 0.15;
  /** 泳ぎのアニメーション位相（尾振り） */
  swimPhase = 0;
  /** 連続ジャンプまでの待ち */
  private nextJumpIn = 0;
  /** 現在（または直前）の走りの種類 */
  runKind: RunKind = 'first';
  /** 走った回数（ファーストラン含む） */
  runCount = 1;
  /** 今の走りで出された糸の量 */
  runMeters = 0;
  /** 走りが終わったときに立つ（ログ用: 種類と距離） */
  runEnded: { kind: RunKind; meters: number } | null = null;
  /** 船に向かって走る速さ m/s */
  private chargeSpeed = 0;
  /** 負けたときの理由 */
  lossReason: LossReason | null = null;

  get firstRun(): boolean {
    return this.running && this.runKind === 'first';
  }

  constructor(
    public species: Species,
    public weightKg: number,
    private tackle: TackleConfig,
    boatHeading: number,
  ) {
    this.lineOut = rand(50, 90);
    // ストライクドラグ: 掛けた直後は弱め（ライン強度の約1/3）。走りが止まったら締めていく
    this.dragKg = Math.min(tackle.reel.maxDragKg, tackle.line.strengthKg * 0.35);
    this.fishAngle = boatHeading + Math.PI + rand(-0.5, 0.5);
    this.targetAngle = this.fishAngle + rand(-0.6, 0.6);
    // ファーストラン: 長く、全力で走る
    this.runIntensity = rand(1.25, 1.55);
    this.runTimer = 4.5 + Math.sqrt(weightKg) * 0.38 + rand(0, 1.5);
  }

  get lineStrength(): number {
    return this.tackle.line.strengthKg;
  }

  get capacity(): number {
    return this.tackle.reel.capacityM;
  }

  /** ドラグの安全上限（衝撃込みで切れない値） */
  get safeDrag(): number {
    return this.lineStrength / 1.35;
  }

  private startJump(): void {
    this.jumpTimer = 0.9;
    this.nextJumpIn = 0;
    this.event = 'jump';
  }

  update(dt: number, reeling: boolean, dragDelta: number): FightResult | null {
    this.event = null;
    this.runEnded = null;
    this.elapsed += dt;
    const W = this.weightKg;
    const { reel } = this.tackle;

    this.dragKg = clamp(this.dragKg + dragDelta * 4 * dt, 1, reel.maxDragKg);

    // 走る / 休む
    this.runTimer -= dt;
    const wasJumping = this.jumpTimer > 0;
    if (this.running) {
      if (this.runTimer <= 0) {
        this.running = false;
        this.runEnded = { kind: this.runKind, meters: this.runMeters };
        this.runTimer = rand(3, 8) + (1 - this.stamina) * 6;
        if (this.runKind === 'first') this.runTimer = rand(2.5, 4.5); // セカンドランは間を置かずに来る
      } else if (this.jumpTimer <= 0 && this.depth < 0.3) {
        // 連続ジャンプ（グレイハウンディング）か、ランダムな単発ジャンプ
        if (this.nextJumpIn > 0) {
          this.nextJumpIn -= dt;
          if (this.nextJumpIn <= 0) this.startJump();
        } else if (Math.random() < this.species.jumpy * 0.3 * dt) {
          this.startJump();
        }
      }
    } else if (this.runTimer <= 0 && this.stamina > 0.08) {
      this.startRun(this.chooseRun());
    } else if (Math.random() < 0.4 * dt) {
      // 休んでいる間も少し向きを変える
      this.targetAngle = this.fishAngle + rand(-0.5, 0.5);
    }
    this.jumpTimer -= dt;
    if (wasJumping && this.jumpTimer <= 0) {
      // 空中で頭を振ってフックを外す。糸がふけていると特に外れやすく、張っていれば外れにくい
      const slackNow = this.tension < W * 0.06;
      const shake = 0.03 * (0.5 + this.species.jumpy) * (slackNow ? 3 : reeling ? 0.7 : 1.1);
      if (Math.random() < shake) return this.lose('jumpShake', 'pulled');
      // 着水時に糸の上に落ちる・吻に擦れる: テンションが高いと切れることがある
      if (this.effTension > this.lineStrength * 0.85 && Math.random() < 0.04) return this.lose('jumpBreak', 'break');
      if (this.running && Math.random() < this.species.jumpy * 0.7) this.nextJumpIn = rand(0.2, 0.45);
    }
    const da = normalizeAngle(this.targetAngle - this.fishAngle);
    this.fishAngle += clamp(da, -1, 1) * 1.2 * dt;

    // 深さ: 走るときは水面近く（突っ込みは深く）、休むと種の性質と疲れに応じて潜る
    const targetDepth = this.running
      ? this.runKind === 'dive'
        ? 0.95
        : 0.08
      : this.species.dive * (0.35 + 0.5 * (1 - this.stamina)) * (this.lineOut < 40 ? 0.3 : 1);
    this.depth += clamp(targetDepth - this.depth, -0.25 * dt, 0.18 * dt);
    this.swimPhase += dt * (this.jumpTimer > 0 ? 22 : this.running ? 13 + 5 * this.runIntensity : 4.5);

    // 引きの力
    const basePull = this.species.power * W * 0.09 * (0.3 + 0.7 * this.stamina);
    const noise = 1 + 0.08 * Math.sin(this.elapsed * 6.3) * Math.random();
    // 走りの種類ごとの倍率。魚の遊泳速度の上限で糸の出る速さは頭打ち
    const runBoost = this.running ? RUN_BOOST[this.runKind] : 1;
    const charging = this.running && this.runKind === 'charge';
    const pull = charging ? 0 : basePull * (this.running ? (1 + 2.0 * this.runIntensity) * runBoost : 1) * noise;
    this.pull = pull;

    let tension: number;
    this.reeling = reeling;
    this.outRate = 0;
    this.inRate = 0;
    if (charging) {
      // 船に向かって来る: 糸がふける。巻いていれば張りを保てる
      this.lineOut = Math.max(15, this.lineOut - this.chargeSpeed * dt);
      this.runMeters += this.chargeSpeed * dt;
      if (reeling) {
        this.inRate = reel.retrieveMps * 3;
        this.lineOut = Math.max(15, this.lineOut - this.inRate * dt);
        tension = Math.min(this.dragKg, W * 0.085);
      } else {
        tension = 0;
      }
      if (this.lineOut <= 15) this.runTimer = 0; // 船まで来たら終わり
    } else if (pull > this.dragKg) {
      tension = this.dragKg;
      const outFactor = this.running && this.runKind === 'dive' ? 0.25 : 0.45;
      this.outRate = Math.min(30, (pull - this.dragKg) * outFactor);
      this.lineOut += this.outRate * dt;
      if (this.running) this.runMeters += this.outRate * dt;
    } else if (reeling) {
      tension = Math.min(this.dragKg, pull + W * 0.08);
      // 深く潜った魚は持ち上げる分だけ巻きが重い
      this.inRate = reel.retrieveMps * 3 * (1 - pull / this.dragKg) * (1 - 0.4 * this.depth);
      this.lineOut -= this.inRate * dt;
    } else {
      tension = pull;
    }
    this.tension = tension;

    // ラインブレイク（走りの衝撃込み）
    const shock = this.running ? 1 + 0.35 * Math.min(1, this.runIntensity) : 1.05;
    this.effTension = tension * shock;
    if (this.effTension > this.lineStrength) return this.lose('shock', 'break');
    // 限界近くで長く張り続けると擦れて切れることがある
    if (this.effTension > this.lineStrength * 0.92 && Math.random() < 0.006 * dt) return this.lose('chafe', 'break');

    // 糸切れ・スプール空
    if (this.lineOut >= this.capacity) return this.lose('spooled', 'spooled');

    // テンション抜けでフックアウト（船に向かって走られている間は特に危ない）
    const slack = tension < W * 0.06;
    if (slack && Math.random() < (charging ? 0.35 : 0.08) * dt) return this.lose(charging ? 'chargeSlack' : 'slack', 'pulled');
    if (this.jumpTimer > 0 && slack && Math.random() < 0.6 * dt) return this.lose('jumpShake', 'pulled');
    // 船際で元気なまま暴れると、口切れで外れることがある
    if (this.lineOut < 25 && this.stamina > 0.35 && this.running && Math.random() < 0.03 * dt) {
      return this.lose('boatside', 'pulled');
    }

    // 体力
    this.stamina -= (tension / (W * 0.35)) * 0.025 * dt;
    // 全力で走ると魚自身も消耗する
    if (this.running) this.stamina -= 0.006 * this.runIntensity * (this.runKind === 'first' ? 1.8 : 1) * dt;
    if (tension < W * 0.05) this.stamina += 0.008 * dt;
    this.stamina = clamp(this.stamina, 0, 1);

    // 取り込み
    if (this.lineOut <= 8) {
      if (this.stamina > 0.5) {
        // 元気な魚は船際で暴れて走る
        this.lineOut = 40;
        this.startRun('boatShy');
        this.event = 'thrash';
        return null;
      }
      return 'landed';
    }
    return null;
  }

  private lose(reason: LossReason, result: FightResult): FightResult {
    this.lossReason = reason;
    return result;
  }

  /** 次の走りの種類を決める */
  private chooseRun(): RunKind {
    if (this.runCount === 1) return 'second';
    const r = Math.random();
    if (this.lineOut < 70 && this.stamina > 0.3 && r < 0.7) return 'boatShy';
    if (r < 0.22 * (0.4 + this.stamina)) return 'charge';
    if (this.species.dive > 0.45 && Math.random() < 0.45) return 'dive';
    return 'normal';
  }

  private startRun(kind: RunKind): void {
    this.running = true;
    this.runKind = kind;
    this.runCount++;
    this.runMeters = 0;
    const W = this.weightKg;
    const s = this.stamina;
    switch (kind) {
      case 'second':
        this.runIntensity = rand(1.0, 1.25);
        this.runTimer = 3.5 + Math.sqrt(W) * 0.25 + rand(0, 1);
        this.targetAngle = this.fishAngle + (Math.random() < 0.5 ? -1 : 1) * rand(0.9, 1.7);
        break;
      case 'boatShy':
        this.runIntensity = rand(0.9, 1.2);
        this.runTimer = rand(2.5, 4.5);
        this.targetAngle = this.fishAngle + rand(-0.8, 0.8);
        break;
      case 'charge':
        this.runIntensity = 0.6;
        this.chargeSpeed = 6 + rand(0, 6) * s;
        this.runTimer = rand(2, 4);
        break;
      case 'dive':
        this.runIntensity = rand(0.7, 1.0) * (0.4 + 0.6 * s);
        this.runTimer = rand(4, 7);
        this.targetAngle = this.fishAngle + rand(-0.4, 0.4);
        break;
      default:
        this.runIntensity = rand(0.5, 1.0) * (0.3 + 0.7 * s);
        this.runTimer = rand(2, 6) * (0.4 + 0.6 * s);
        this.targetAngle = this.fishAngle + rand(-1.3, 1.3);
    }
    this.event = 'run';
  }
}
