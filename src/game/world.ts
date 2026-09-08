import type { SpeciesId } from '../data/species';
import { clamp, rand, segDist, type Vec } from './util';

/** マップサイズ（m）。y=0 が海岸線、y=WORLD_H が最も沖 */
export const WORLD_W = 12000;
export const WORLD_H = 8000;

/** 潮目（潮境の帯） */
export interface CurrentLine {
  pts: Vec[];
  /** 帯の半幅 m */
  width: number;
  /** 魚影への寄与 */
  strength: number;
  driftY: number;
  phase: number;
}

/** 鳥山（鳥が集まるベイトボール） */
export interface BirdFlock {
  pos: Vec;
  vel: Vec;
  radius: number;
  life: number;
  maxLife: number;
  /** 立ち上がり・消滅のフェード込み 0..1 */
  intensity: number;
  birdCount: number;
  seed: number;
}

/** 水面を背びれと尾で切って泳ぐカジキ（テーリング）。演出用 */
export interface Sighting {
  pos: Vec;
  heading: number;
  speciesId: SpeciesId;
  life: number;
  maxLife: number;
  phase: number;
  /** 見た目の大きさ係数 */
  size: number;
}

export class World {
  currents: CurrentLine[] = [];
  flocks: BirdFlock[] = [];
  sightings: Sighting[] = [];
  /** 黒潮の基本流れ m/s（東北東向き ≒1.2kt） */
  baseCurrent: Vec = { x: 0.55, y: 0.22 };
  time = 0;

  constructor() {
    const rows = [0.28, 0.55, 0.8];
    for (const r of rows) {
      const baseY = WORLD_H * r + rand(-300, 300);
      const amp = rand(350, 700);
      const period = rand(2800, 5200);
      const phase = rand(0, Math.PI * 2);
      const pts: Vec[] = [];
      for (let x = -500; x <= WORLD_W + 500; x += 250) {
        pts.push({ x, y: baseY + Math.sin((x / period) * Math.PI * 2 + phase) * amp });
      }
      this.currents.push({
        pts,
        width: rand(140, 240),
        strength: rand(0.5, 0.85),
        driftY: rand(-0.06, 0.06),
        phase,
      });
    }
    for (let i = 0; i < 3; i++) {
      const f = this.spawnFlock();
      f.life = rand(0.3, 0.9) * f.maxLife;
      this.flocks.push(f);
    }
  }

  spawnFlock(): BirdFlock {
    let pos: Vec;
    if (Math.random() < 0.65) {
      // 潮目の近くに湧きやすい
      const c = this.currents[Math.floor(Math.random() * this.currents.length)];
      const p = c.pts[Math.floor(Math.random() * c.pts.length)];
      pos = { x: clamp(p.x + rand(-400, 400), 300, WORLD_W - 300), y: clamp(p.y + rand(-400, 400), 400, WORLD_H - 300) };
    } else {
      pos = { x: rand(300, WORLD_W - 300), y: rand(400, WORLD_H - 300) };
    }
    const ang = rand(0, Math.PI * 2);
    const sp = rand(0.3, 0.9);
    const maxLife = rand(900, 2400);
    return {
      pos,
      vel: { x: Math.cos(ang) * sp, y: Math.sin(ang) * sp },
      radius: rand(100, 190),
      life: maxLife,
      maxLife,
      intensity: 0,
      birdCount: 6 + Math.floor(rand(0, 8)),
      seed: rand(0, 1000),
    };
  }

  update(dtGame: number): void {
    this.time += dtGame;
    for (const c of this.currents) {
      for (const p of c.pts) p.y += c.driftY * dtGame;
      const first = c.pts[0].y;
      if (first < 600 || first > WORLD_H - 600) c.driftY = -c.driftY;
    }
    for (let i = 0; i < this.flocks.length; i++) {
      const f = this.flocks[i];
      f.pos.x += f.vel.x * dtGame;
      f.pos.y += f.vel.y * dtGame;
      f.life -= dtGame;
      const age = f.maxLife - f.life;
      const fadeIn = clamp(age / 180, 0, 1);
      const fadeOut = clamp(f.life / 240, 0, 1);
      f.intensity = Math.min(fadeIn, fadeOut);
      const out = f.pos.x < -200 || f.pos.x > WORLD_W + 200 || f.pos.y < 200 || f.pos.y > WORLD_H + 200;
      if (f.life <= 0 || out) this.flocks[i] = this.spawnFlock();
    }
  }

  /** テーリングする魚の移動。湧きはゲーム側（魚種の重みが必要）で行う */
  updateSightings(dtGame: number, boat: Vec): void {
    for (let i = this.sightings.length - 1; i >= 0; i--) {
      const sg = this.sightings[i];
      sg.life -= dtGame;
      sg.heading += (Math.random() - 0.5) * 0.4 * dtGame * 0.05;
      const sp = 1.1;
      sg.pos.x += (Math.cos(sg.heading) * sp + this.baseCurrent.x) * dtGame;
      sg.pos.y += (Math.sin(sg.heading) * sp + this.baseCurrent.y) * dtGame;
      sg.phase += dtGame * 0.12;
      const far = Math.hypot(sg.pos.x - boat.x, sg.pos.y - boat.y) > 3500;
      if (sg.life <= 0 || far) this.sightings.splice(i, 1);
    }
  }

  nearestCurrentDist(p: Vec): number {
    let best = Infinity;
    for (const c of this.currents) {
      for (let i = 0; i < c.pts.length - 1; i++) {
        const d = segDist(p, c.pts[i], c.pts[i + 1]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  nearestFlock(p: Vec): { flock: BirdFlock; d: number } | null {
    let best: { flock: BirdFlock; d: number } | null = null;
    for (const f of this.flocks) {
      if (f.intensity < 0.1) continue;
      const d = Math.hypot(p.x - f.pos.x, p.y - f.pos.y);
      if (!best || d < best.d) best = { flock: f, d };
    }
    return best;
  }

  /** その地点の魚影密度（基礎 0.2、潮目で最大 +0.85、鳥山で最大 +1.6） */
  densityAt(p: Vec): number {
    let d = 0.2;
    for (const c of this.currents) {
      let best = Infinity;
      for (let i = 0; i < c.pts.length - 1; i++) {
        const dd = segDist(p, c.pts[i], c.pts[i + 1]);
        if (dd < best) best = dd;
      }
      const sigma = c.width * 1.2;
      d += c.strength * Math.exp(-(best * best) / (2 * sigma * sigma));
    }
    for (const f of this.flocks) {
      const dd = Math.hypot(p.x - f.pos.x, p.y - f.pos.y);
      const sigma = f.radius * 1.1;
      d += 1.6 * f.intensity * Math.exp(-(dd * dd) / (2 * sigma * sigma));
    }
    return d;
  }
}
