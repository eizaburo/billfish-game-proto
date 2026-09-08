import { speciesById } from '../data/species';
import type { Game } from '../game/sim';
import { boatGeom, drawBoatBody, drawRods, rodPose } from './boat';
import { drawFishSide, drawFishTop } from './fish';
import { clamp, lerp, type Vec } from '../game/util';
import { WORLD_H, WORLD_W } from '../game/world';

const SHORE = { r: 40, g: 150, b: 175 };
const DEEP = { r: 6, g: 34, b: 80 };

function seaColor(yFrac: number): string {
  const t = clamp(yFrac, 0, 1);
  const r = Math.round(lerp(SHORE.r, DEEP.r, t));
  const g = Math.round(lerp(SHORE.g, DEEP.g, t));
  const b = Math.round(lerp(SHORE.b, DEEP.b, t));
  return `rgb(${r},${g},${b})`;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  scale = 0.32;
  camera: Vec = { x: 0, y: 0 };
  private t = 0;
  private initialized = false;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement!);
    this.resize();
  }

  private resize(): void {
    const parent = this.canvas.parentElement!;
    this.dpr = window.devicePixelRatio || 1;
    this.w = parent.clientWidth;
    this.h = parent.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(this.w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.h * this.dpr));
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  screenToWorld(sx: number, sy: number): Vec {
    return { x: this.camera.x + (sx - this.w / 2) / this.scale, y: this.camera.y + (sy - this.h / 2) / this.scale };
  }

  private toScreen(p: Vec): Vec {
    return { x: (p.x - this.camera.x) * this.scale + this.w / 2, y: (p.y - this.camera.y) * this.scale + this.h / 2 };
  }

  render(game: Game, dt: number): void {
    this.t += dt;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // カメラ
    let targetScale = 0.32;
    let targetCam: Vec = game.pos;
    if (game.fight) {
      const f = game.fight;
      const fishPos = this.fishPos(game);
      targetCam = { x: (game.pos.x + fishPos.x) / 2, y: (game.pos.y + fishPos.y) / 2 };
      targetScale = clamp((Math.min(this.w, this.h) * 0.36) / Math.max(60, f.lineOut), 0.25, 0.9);
    } else if (game.ending) {
      const e = game.ending;
      const d = Math.hypot(e.pos.x - game.pos.x, e.pos.y - game.pos.y);
      targetCam = { x: (game.pos.x + e.pos.x) / 2, y: (game.pos.y + e.pos.y) / 2 };
      targetScale = clamp((Math.min(this.w, this.h) * 0.36) / Math.max(60, d), 0.25, 0.9);
    }
    if (!this.initialized) {
      this.camera = { ...targetCam };
      this.initialized = true;
    }
    const k = 1 - Math.exp(-dt * 3);
    this.camera.x = lerp(this.camera.x, targetCam.x, k);
    this.camera.y = lerp(this.camera.y, targetCam.y, k);
    this.scale = lerp(this.scale, targetScale, k);
    // ヒット直後の揺れ
    if (game.hitTimer > 0) {
      const amp = (game.hitTimer / 1.2) * 14 / this.scale;
      this.camera.x += (Math.random() - 0.5) * amp;
      this.camera.y += (Math.random() - 0.5) * amp;
    }

    this.drawSea(game);
    this.drawGrid();
    this.drawCurrents(game);
    this.drawOffshoreLimit(game);
    this.drawFlocks(game);
    this.drawWaypoint(game);
    this.drawSightings(game);
    this.drawWake(game);
    if (!game.fight && !game.ending) this.drawLures(game);
    if (game.fight) this.drawFight(game);
    if (game.ending) this.drawEnding(game);
    this.drawBoat(game);
    this.drawMinimap(game);
  }

  private fishPos(game: Game): Vec {
    const f = game.fight!;
    return { x: game.pos.x + Math.cos(f.fishAngle) * f.lineOut, y: game.pos.y + Math.sin(f.fishAngle) * f.lineOut };
  }

  private drawSea(game: Game): void {
    const ctx = this.ctx;
    const top = this.screenToWorld(0, 0).y;
    const bottom = this.screenToWorld(0, this.h).y;
    const grad = ctx.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, seaColor(top / WORLD_H));
    grad.addColorStop(1, seaColor(bottom / WORLD_H));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);

    // 夕方は少しオレンジがかる
    const h = game.hour;
    let tint = 0;
    if (h < 6.5) tint = (6.5 - h) / 1.5;
    if (h > 15.5) tint = (h - 15.5) / 1.5;
    if (tint > 0) {
      ctx.fillStyle = `rgba(255,140,60,${0.18 * clamp(tint, 0, 1)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // 海岸（y<0）
    if (top < 0) {
      const shoreY = this.toScreen({ x: 0, y: 0 }).y;
      const sandY = this.toScreen({ x: 0, y: -150 }).y;
      ctx.fillStyle = '#e2d3a1';
      ctx.fillRect(0, Math.max(0, sandY), this.w, shoreY - Math.max(0, sandY));
      ctx.fillStyle = '#5f8f47';
      ctx.fillRect(0, 0, this.w, Math.max(0, sandY));
      // 波打ち際
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= this.w; x += 8) {
        const y = shoreY + Math.sin(x * 0.05 + this.t * 2) * 2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const step = 1000;
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.w, this.h);
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
      const sx = this.toScreen({ x, y: 0 }).x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.h);
      ctx.stroke();
    }
    for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) {
      const sy = this.toScreen({ x: 0, y }).y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(this.w, sy);
      ctx.stroke();
    }
  }

  private drawCurrents(game: Game): void {
    const ctx = this.ctx;
    for (const c of game.world.currents) {
      const pts = c.pts.map((p) => this.toScreen(p));
      // 帯
      ctx.strokeStyle = 'rgba(160,220,255,0.10)';
      ctx.lineWidth = c.width * 2 * this.scale;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      // 潮目の泡のライン
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 10]);
      ctx.lineDashOffset = -this.t * 25 - c.phase * 10;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      // 漂流物
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < c.pts.length; i += 2) {
        const p = pts[i];
        const ox = Math.sin(i * 3.1 + c.phase) * c.width * 0.6 * this.scale;
        const oy = Math.cos(i * 2.3 + c.phase) * c.width * 0.6 * this.scale;
        if (p.x < -20 || p.x > this.w + 20 || p.y < -20 || p.y > this.h + 20) continue;
        ctx.fillRect(p.x + ox, p.y + oy, 2, 2);
      }
    }
  }

  private drawOffshoreLimit(game: Game): void {
    if (game.tackle.boat.offshoreLimit >= 1) return;
    const y = this.toScreen({ x: 0, y: game.maxY }).y;
    if (y < 0 || y > this.h) return;
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,90,90,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,120,120,0.9)';
    ctx.font = '12px sans-serif';
    ctx.fillText('この船の航行限界', 12, y - 6);
  }

  private drawFlocks(game: Game): void {
    const ctx = this.ctx;
    for (const f of game.world.flocks) {
      if (f.intensity <= 0.02) continue;
      const c = this.toScreen(f.pos);
      const r = f.radius * this.scale;
      if (c.x < -r * 2 || c.x > this.w + r * 2 || c.y < -r * 2 || c.y > this.h + r * 2) continue;
      const a = f.intensity;
      // ナブラ（ベイトの波紋）
      ctx.fillStyle = `rgba(255,255,255,${0.10 * a})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const ph = (this.t * 1.5 + i * 0.37 + f.seed) % 1;
        const ang = i * 2.39996 + f.seed;
        const rr = r * 0.7 * Math.sqrt(((i * 0.618) + f.seed) % 1);
        const px = c.x + Math.cos(ang) * rr;
        const py = c.y + Math.sin(ang) * rr;
        ctx.globalAlpha = (1 - ph) * a;
        ctx.beginPath();
        ctx.arc(px, py, 2 + ph * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 鳥
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * a})`;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < f.birdCount; i++) {
        const ang = this.t * (0.8 + (i % 3) * 0.25) + (i * Math.PI * 2) / f.birdCount + f.seed;
        const rr = r * (0.5 + 0.7 * (((i * 0.37) + f.seed) % 1));
        const bx = c.x + Math.cos(ang) * rr;
        const by = c.y + Math.sin(ang) * rr * 0.6 - 6;
        const flap = Math.sin(this.t * 10 + i) * 2;
        ctx.beginPath();
        ctx.moveTo(bx - 5, by + flap);
        ctx.lineTo(bx, by - 1);
        ctx.lineTo(bx + 5, by + flap);
        ctx.stroke();
      }
    }
  }

  private drawWaypoint(game: Game): void {
    if (!game.waypoint) return;
    const p = this.toScreen(game.waypoint);
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,230,90,0.9)';
    ctx.lineWidth = 2;
    const pulse = 8 + Math.sin(this.t * 4) * 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y);
    ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12);
    ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
    // 進路
    const b = this.toScreen(game.pos);
    ctx.strokeStyle = 'rgba(255,230,90,0.35)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawWake(game: Game): void {
    if (game.wake.length < 2) return;
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    for (let i = 1; i < game.wake.length; i++) {
      const a = this.toScreen(game.wake[i - 1]);
      const b = this.toScreen(game.wake[i]);
      const f = i / game.wake.length;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * f})`;
      ctx.lineWidth = 2 + 6 * f;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  /** 船の描画倍率（ファイト中は少し大きく） */
  private boatScale(game: Game): number {
    return game.fight || game.ending ? 1.3 : 1;
  }

  /** 船のローカル座標（+x 船首, +y 右舷, px）→ スクリーン座標 */
  private boatLocalToScreen(game: Game, lx: number, ly: number): Vec {
    const s = this.boatScale(game);
    const c = Math.cos(game.heading);
    const sn = Math.sin(game.heading);
    const p = this.toScreen(game.pos);
    return { x: p.x + (lx * c - ly * sn) * s, y: p.y + (lx * sn + ly * c) * s };
  }

  /** 釣り糸が出る点（竿先、またはアウトリガー先端）のスクリーン座標 */
  private rodTip(game: Game, i: number): Vec {
    const pose = rodPose(game.tackle.boat, boatGeom(game.tackle.boat), game.lureLayout(i));
    return this.boatLocalToScreen(game, pose.lineFrom.x, pose.lineFrom.y);
  }

  /** ルアーの引き波・ライン・ルアー本体 */
  private drawLures(game: Game): void {
    const ctx = this.ctx;
    const active = game.speedFactor() > 0.02;
    ctx.lineCap = 'round';
    for (let i = 0; i < game.rods.length; i++) {
      const trail = game.lureTrails[i];
      // 引き波: 細く白い、少しゆらぐ線
      for (let k = 1; k < trail.length; k++) {
        const a = this.toScreen(trail[k - 1]);
        const b = this.toScreen(trail[k]);
        const f = k / trail.length;
        ctx.strokeStyle = `rgba(255,255,255,${0.45 * f})`;
        ctx.lineWidth = 0.6 + 1.6 * f;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      if (!active) continue;
      const lure = this.toScreen(game.lures[i]);
      const tip = this.rodTip(game, i);
      const bob = Math.sin(this.t * 7 + i * 1.7) * 1.5;
      // ライン
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo((tip.x + lure.x) / 2, (tip.y + lure.y) / 2 + 4, lure.x, lure.y + bob);
      ctx.stroke();
      // 水面を跳ねる飛沫
      if (game.speedKt > 3) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(lure.x, lure.y + bob, 3.5 + Math.sin(this.t * 9 + i) * 1.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      // ルアー本体
      ctx.fillStyle = game.rods[i] === 'out' ? '#ffd54f' : '#999';
      ctx.beginPath();
      ctx.arc(lure.x, lure.y + bob, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBoat(game: Game): void {
    const ctx = this.ctx;
    const p = this.toScreen(game.pos);
    const boat = game.tackle.boat;
    const g = boatGeom(boat);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(game.heading);
    ctx.scale(this.boatScale(game), this.boatScale(game));
    drawBoatBody(ctx, boat, g, { speedKt: game.speedKt, t: this.t, fighting: !!game.fight });
    const placements = game.rods.map((_, i) => game.lureLayout(i));
    drawRods(ctx, boat, g, placements, game.rods, !!game.fight);
    ctx.restore();
  }

  private drawFight(game: Game): void {
    const f = game.fight!;
    const ctx = this.ctx;
    // 糸は船尾中央に立てた竿の先から
    const g = boatGeom(game.tackle.boat);
    const b = this.boatLocalToScreen(game, -g.L / 2 - g.L * 0.22, 0);
    const fp = this.toScreen(this.fishPos(game));

    // ライン（テンションで色）
    const r = f.effTension / f.lineStrength;
    const color = r < 0.6 ? `rgb(120,220,140)` : r < 0.85 ? `rgb(255,210,80)` : `rgb(255,80,80)`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    // たるみ表現
    const sag = f.tension < f.weightKg * 0.06 ? 25 : 0;
    ctx.quadraticCurveTo((b.x + fp.x) / 2, (b.y + fp.y) / 2 + sag, fp.x, fp.y);
    ctx.stroke();

    // 魚
    const jumping = f.jumpTimer > 0;
    const L = 44 + Math.sqrt(f.weightKg) * 3;
    const excited = f.running || jumping;

    // 水面近くを泳ぐときは背びれと尾が水面を切る引き波
    if (!jumping && f.depth < 0.25 && (f.running || f.stamina > 0.2)) {
      const k = 1 - f.depth / 0.25;
      ctx.save();
      ctx.translate(fp.x, fp.y);
      ctx.rotate(f.fishAngle);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * k})`;
      ctx.lineWidth = 1;
      const len = L * (f.running ? 1.6 : 0.9);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(L * 0.15, 0);
        ctx.quadraticCurveTo(-L * 0.4, side * L * 0.1, -len, side * L * 0.28);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (jumping) {
      const k = 1 - f.jumpTimer / 0.9; // 0→1
      const h = Math.sin(Math.PI * k); // 高さ
      // 水面の影
      ctx.save();
      ctx.translate(fp.x, fp.y);
      ctx.rotate(f.fishAngle);
      ctx.fillStyle = `rgba(0,0,0,${0.25 * h})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.45, L * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 飛沫（出る時と入る時）
      const splashK = k < 0.3 ? k / 0.3 : k > 0.7 ? (1 - k) / 0.3 : 0;
      if (splashK > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * splashK})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, L * (0.3 + (1 - splashK) * 0.5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + k * 3;
          const r0 = L * 0.25;
          const r1 = L * (0.45 + (1 - splashK) * 0.4);
          ctx.beginPath();
          ctx.moveTo(fp.x + Math.cos(a) * r0, fp.y + Math.sin(a) * r0);
          ctx.lineTo(fp.x + Math.cos(a) * r1, fp.y + Math.sin(a) * r1);
          ctx.stroke();
        }
      }
      // 空中の魚: 横から見た全身。高さに応じて大きく、上に持ち上げる
      ctx.save();
      ctx.translate(fp.x, fp.y - h * L * 0.45);
      ctx.rotate(f.fishAngle);
      // 進行方向が画面左向きなら背が上になるよう反転
      if (Math.cos(f.fishAngle) < 0) ctx.scale(1, -1);
      ctx.scale(1 + 0.35 * h, 1 + 0.35 * h);
      drawFishSide(ctx, f.species, { L, phase: f.swimPhase, excited: true, arch: Math.sin(Math.PI * k) * 0.8 });
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(fp.x, fp.y);
      ctx.rotate(f.fishAngle);
      const shrink = 1 - 0.25 * f.depth;
      ctx.scale(shrink, shrink);
      drawFishTop(ctx, f.species, {
        L,
        phase: f.swimPhase,
        swim: f.running ? 1 : 0.35,
        depth: f.depth,
        excited,
      });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** ファイト終了直後の演出: 切れた糸、飛ぶルアー、逃げる魚、船横に浮く魚 */
  private drawEnding(game: Game): void {
    const e = game.ending!;
    const ctx = this.ctx;
    const g = boatGeom(game.tackle.boat);
    const tip = this.boatLocalToScreen(game, -g.L / 2 - g.L * 0.22, 0);
    const fp = this.toScreen(e.pos);
    const t = e.timer;
    const L = e.L;

    if (e.result === 'landed') {
      // 船横に浮く魚（水面、ゆっくり尾を振る）と波紋
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * Math.max(0, 1 - (t % 1.2) / 1.2)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, L * 0.3 + (t % 1.2) * L * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.translate(fp.x, fp.y);
      ctx.rotate(e.angle);
      drawFishTop(ctx, e.species, { L, phase: e.swimPhase, swim: 0.2, depth: 0, excited: true });
      ctx.restore();
      // 糸は張ったまま
      ctx.strokeStyle = 'rgba(200,255,210,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(fp.x, fp.y);
      ctx.stroke();
      return;
    }

    const fade = clamp(1 - (t - 0.8) / (e.duration - 0.8), 0, 1);
    const inAir = e.jumping && t < 0.6;

    // 逃げる魚
    ctx.save();
    ctx.translate(fp.x, fp.y);
    if (inAir) {
      // 空中で頭を振る → 着水
      const k = t / 0.6;
      const h = Math.sin(Math.PI * Math.min(1, k * 0.9 + 0.35));
      ctx.translate(0, -h * L * 0.35);
      ctx.rotate(e.angle + Math.sin(t * 40) * 0.25 * (1 - k));
      if (Math.cos(e.angle) < 0) ctx.scale(1, -1);
      ctx.scale(1.3, 1.3);
      drawFishSide(ctx, e.species, { L, phase: e.swimPhase, excited: true, arch: 0.5 * (1 - k) });
    } else {
      ctx.rotate(e.angle);
      ctx.globalAlpha = fade;
      const depth = clamp((t - (e.jumping ? 0.6 : 0)) / 2.2, 0, 0.9);
      drawFishTop(ctx, e.species, { L, phase: e.swimPhase, swim: 1, depth, excited: false });
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // 着水の飛沫
    if (e.jumping && t >= 0.5 && t < 1.1) {
      const k = (t - 0.5) / 0.6;
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, L * (0.3 + k * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 糸とルアー
    if (e.result === 'break') {
      // 切れた糸が船側に跳ね返り、垂れる
      const k = clamp(t / 0.7, 0, 1);
      const end = { x: fp.x + (tip.x - fp.x) * k, y: fp.y + (tip.y - fp.y) * k };
      const mx = (tip.x + end.x) / 2;
      const my = (tip.y + end.y) / 2;
      const wob = Math.sin(t * 25) * 30 * (1 - k);
      ctx.strokeStyle = `rgba(255,120,120,${0.9 - 0.5 * k})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.bezierCurveTo(mx + wob, my + 20 + wob, end.x - wob, end.y + 40 * (1 - k), end.x, end.y);
      ctx.stroke();
      // 魚側に残った切れ端
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * fade})`;
      ctx.beginPath();
      ctx.moveTo(fp.x, fp.y);
      ctx.lineTo(fp.x - Math.cos(e.angle) * L * 0.6 + Math.sin(t * 9) * 8, fp.y - Math.sin(e.angle) * L * 0.6 + 12);
      ctx.stroke();
    } else if (e.result === 'pulled') {
      // 外れたルアーが弧を描いて飛び、糸がふけて垂れる
      const k = clamp(t / 1.4, 0, 1);
      const fly = e.jumping ? 1.6 : 0.8;
      const lure = {
        x: fp.x + (tip.x - fp.x) * k * 0.55 + Math.cos(e.angle + 2.2) * L * 0.6 * k,
        y: fp.y + (tip.y - fp.y) * k * 0.55 - Math.sin(Math.PI * k) * L * fly + Math.sin(e.angle + 2.2) * L * 0.6 * k,
      };
      ctx.strokeStyle = `rgba(255,255,255,${0.75 - 0.4 * k})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo((tip.x + lure.x) / 2, (tip.y + lure.y) / 2 + 30 * k, lure.x, lure.y);
      ctx.stroke();
      // ルアー本体（回転しながら飛ぶ）
      ctx.save();
      ctx.translate(lure.x, lure.y);
      ctx.rotate(t * 12);
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(9, 0);
      ctx.arc(9, 2.5, 2.5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.restore();
    } else if (e.result === 'spooled') {
      // 糸の端が竿先から抜けて魚と一緒に飛んでいく
      const k = clamp(t / 1.0, 0, 1);
      const start = { x: tip.x + (fp.x - tip.x) * k * 0.9, y: tip.y + (fp.y - tip.y) * k * 0.9 };
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y + Math.sin(t * 20) * 6 * k);
      ctx.lineTo(fp.x, fp.y);
      ctx.stroke();
    }
  }

  /** 潮目や鳥山の近くで水面を切って泳ぐカジキ */
  private drawSightings(game: Game): void {
    const ctx = this.ctx;
    for (const sg of game.world.sightings) {
      const p = this.toScreen(sg.pos);
      if (p.x < -80 || p.x > this.w + 80 || p.y < -80 || p.y > this.h + 80) continue;
      const sp = speciesById(sg.speciesId);
      const L = (26 + Math.sqrt(sp.maxKg) * 1.1) * sg.size;
      const age = sg.maxLife - sg.life;
      const fade = Math.min(1, age / 120, sg.life / 150);
      ctx.save();
      ctx.globalAlpha = 0.9 * fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(sg.heading);
      // 背びれと尾の引き波
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(L * 0.1, 0);
        ctx.quadraticCurveTo(-L * 0.4, side * L * 0.08, -L * 1.1, side * L * 0.22);
        ctx.stroke();
      }
      drawFishTop(ctx, sp, { L, phase: sg.phase * 8, swim: 0.5, depth: 0.12, excited: false });
      ctx.restore();
    }
  }

  private drawMinimap(game: Game): void {
    const ctx = this.ctx;
    const mw = 220;
    const mh = (mw * WORLD_H) / WORLD_W;
    const ox = this.w - mw - 12;
    const oy = 12;
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
    const grad = ctx.createLinearGradient(0, oy, 0, oy + mh);
    grad.addColorStop(0, seaColor(0));
    grad.addColorStop(1, seaColor(1));
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, mw, mh);
    ctx.beginPath();
    ctx.rect(ox, oy, mw, mh);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    for (const c of game.world.currents) {
      ctx.beginPath();
      c.pts.forEach((p, i) => {
        const x = ox + p.x * sx;
        const y = oy + p.y * sy;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    for (const f of game.world.flocks) {
      if (f.intensity < 0.1) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.9 * f.intensity})`;
      ctx.beginPath();
      ctx.arc(ox + f.pos.x * sx, oy + f.pos.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (game.tackle.boat.offshoreLimit < 1) {
      const y = oy + game.maxY * sy;
      ctx.strokeStyle = 'rgba(255,90,90,0.8)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + mw, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (game.waypoint) {
      ctx.strokeStyle = 'rgba(255,230,90,0.9)';
      const x = ox + game.waypoint.x * sx;
      const y = oy + game.waypoint.y * sy;
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
    }
    // 自船
    const bx = ox + game.pos.x * sx;
    const by = oy + game.pos.y * sy;
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.moveTo(bx + Math.cos(game.heading) * 6, by + Math.sin(game.heading) * 6);
    ctx.lineTo(bx + Math.cos(game.heading + 2.5) * 4, by + Math.sin(game.heading + 2.5) * 4);
    ctx.lineTo(bx + Math.cos(game.heading - 2.5) * 4, by + Math.sin(game.heading - 2.5) * 4);
    ctx.closePath();
    ctx.fill();
    // 現在の表示範囲
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.w, this.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + tl.x * sx, oy + tl.y * sy, (br.x - tl.x) * sx, (br.y - tl.y) * sy);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px sans-serif';
    ctx.fillText('岸', ox + 4, oy + 12);
    ctx.fillText('沖', ox + 4, oy + mh - 5);
  }
}
