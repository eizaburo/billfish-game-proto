/** 開発用: 全魚種の描画を並べて確認する（/preview.html） */
import { BOATS } from './data/equipment';
import { SPECIES } from './data/species';
import type { LurePlacement, RodStatus } from './game/sim';
import { boatGeom, drawBoatBody, drawRods } from './render/boat';
import { drawFishSide, drawFishTop } from './render/fish';

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.height = 1250;

/** 本数ごとのルアー配置（sim.ts と同じ規則） */
function layoutFor(n: number, wide: number): LurePlacement[] {
  const short = (side: -1 | 1): LurePlacement => ({ back: 200, lateral: 45 * side * wide, slot: 'short', side });
  const long = (side: -1 | 1): LurePlacement => ({ back: 300, lateral: 85 * side * wide, slot: 'long', side });
  const center = (back: number): LurePlacement => ({ back, lateral: 0, slot: 'center', side: 0 });
  if (n === 1) return [center(220)];
  if (n === 2) return [short(-1), short(1)];
  if (n === 3) return [short(-1), short(1), center(310)];
  if (n === 4) return [short(-1), short(1), long(-1), long(1)];
  return [short(-1), short(1), long(-1), long(1), center(340)];
}
const ctx = canvas.getContext('2d')!;
let t = 0;

function frame(): void {
  t += 1 / 60;
  ctx.fillStyle = '#164c78';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '13px sans-serif';
  SPECIES.forEach((sp, i) => {
    const y = 80 + i * 145;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${sp.nameJa} / ${sp.nameEn}`, 16, y - 50);
    // 上から: 水面・中層・深場
    [0, 0.45, 0.9].forEach((depth, k) => {
      ctx.save();
      ctx.translate(120 + k * 190, y);
      drawFishTop(ctx, sp, { L: 150, phase: t * 10, swim: 1, depth, excited: k === 0 });
      ctx.restore();
    });
    // 横から: 静止・ジャンプ中（反り）
    ctx.save();
    ctx.translate(800, y);
    drawFishSide(ctx, sp, { L: 170, phase: t * 10, excited: false, arch: 0 });
    ctx.restore();
    ctx.save();
    ctx.translate(1060, y);
    ctx.rotate(-0.35);
    drawFishSide(ctx, sp, { L: 170, phase: t * 10, excited: true, arch: 0.8 });
    ctx.restore();
  });
  // 船: 3種 × (曳航中 / ファイト中) を拡大表示
  BOATS.forEach((boat, i) => {
    const g = boatGeom(boat);
    const n = boat.maxRods;
    const wide = boat.id === 'sportfisher' ? 1.4 : 1;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${boat.name}（竿${n}本）`, 16, 930 + i * 105);
    for (const fighting of [false, true]) {
      ctx.save();
      ctx.translate(fighting ? 760 : 300, 960 + i * 105);
      ctx.scale(4.2, 4.2);
      ctx.rotate(0);
      drawBoatBody(ctx, boat, g, { speedKt: fighting ? 0 : 7, t, fighting });
      const statuses: RodStatus[] = Array.from({ length: n }, (_, k) => (fighting ? (k === 0 ? 'hooked' : 'retrieved') : 'out'));
      drawRods(ctx, boat, g, layoutFor(n, wide), statuses, fighting);
      ctx.restore();
    }
  });
  requestAnimationFrame(frame);
}
frame();
