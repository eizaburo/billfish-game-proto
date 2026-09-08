import type { Boat } from '../data/equipment';
import type { LurePlacement, RodStatus } from '../game/sim';
import type { Vec } from '../game/util';

/**
 * 船の描画。ローカル座標は +x が船首、+y が右舷。単位は画面px（船は実寸ではなく見やすい大きさ）。
 */
export interface BoatGeom {
  /** 全長 px */
  L: number;
  /** 全幅 px */
  B: number;
}

export function boatGeom(boat: Boat): BoatGeom {
  switch (boat.id) {
    case 'skiff':
      return { L: 24, B: 9.5 };
    case 'sportfisher':
      return { L: 42, B: 14 };
    default:
      return { L: 34, B: 10.5 };
  }
}

/** 竿受けの位置と竿先の向き。線が出る位置（アウトリガー先端など）も返す */
export interface RodPose {
  holder: Vec;
  tip: Vec;
  /** 釣り糸が出る点（アウトリガー使用時は先端） */
  lineFrom: Vec;
  viaOutrigger: boolean;
}

export function outriggerTip(g: BoatGeom, side: -1 | 1): Vec {
  return { x: -g.L * 0.32, y: side * g.B * 1.9 };
}

export function rodPose(boat: Boat, g: BoatGeom, p: LurePlacement): RodPose {
  const stern = -g.L / 2;
  const rodLen = g.L * 0.34;
  let holder: Vec;
  let ang: number; // 竿の向き（ローカル、後方=π）
  switch (p.slot) {
    case 'short':
      holder = { x: stern + 3, y: p.side * (g.B / 2 - 1) };
      ang = Math.PI - p.side * 0.55;
      break;
    case 'long':
      holder = { x: stern + g.L * 0.28, y: p.side * (g.B / 2 - 0.5) };
      ang = Math.PI - p.side * 1.15;
      break;
    default:
      holder = { x: stern + 1.5, y: 0 };
      ang = Math.PI;
  }
  const tip = { x: holder.x + Math.cos(ang) * rodLen, y: holder.y + Math.sin(ang) * rodLen };
  const viaOutrigger = boat.id === 'sportfisher' && p.slot === 'long' && p.side !== 0;
  const lineFrom = viaOutrigger ? outriggerTip(g, p.side as -1 | 1) : tip;
  return { holder, tip, lineFrom, viaOutrigger };
}

/** 船体の輪郭。船種で船首の尖り・最大幅の位置・船尾の絞りが違う */
function hullPath(ctx: CanvasRenderingContext2D, boat: Boat, g: BoatGeom, inset = 0): void {
  const L = g.L - inset * 2;
  const B = g.B - inset * 2;
  const bow = L / 2;
  const stern = -L / 2;
  // 船首の鋭さ（大きいほど細長い）、最大幅の位置、船尾の絞り
  const sharp = boat.id === 'charter' ? 0.34 : boat.id === 'sportfisher' ? 0.3 : 0.26;
  const beamAt = boat.id === 'charter' ? -0.05 : 0.0;
  const tuck = boat.id === 'sportfisher' ? 0.9 : boat.id === 'charter' ? 0.86 : 0.94;
  ctx.beginPath();
  ctx.moveTo(bow, 0);
  ctx.bezierCurveTo(bow - L * sharp * 0.35, -B * 0.22, bow - L * sharp, -B * 0.48, L * beamAt, -B / 2);
  ctx.quadraticCurveTo(stern + L * 0.12, -B * 0.5, stern + L * 0.03, -B * 0.5 * tuck);
  ctx.quadraticCurveTo(stern, -B * 0.5 * tuck, stern, -B * 0.5 * tuck + 0.8);
  ctx.lineTo(stern, B * 0.5 * tuck - 0.8);
  ctx.quadraticCurveTo(stern, B * 0.5 * tuck, stern + L * 0.03, B * 0.5 * tuck);
  ctx.quadraticCurveTo(stern + L * 0.12, B * 0.5, L * beamAt, B / 2);
  ctx.bezierCurveTo(bow - L * sharp, B * 0.48, bow - L * sharp * 0.35, B * 0.22, bow, 0);
  ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 塗り＋縁取りの箱 */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = '#8895a3'): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

/** 窓の列（横方向 n 枚） */
function windowRow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, n: number): void {
  ctx.fillStyle = '#1c3149';
  const gap = 0.5;
  for (let i = 0; i < n; i++) ctx.fillRect(x + (w / n) * i + gap / 2, y, w / n - gap, h);
}

/** 弧を描く風防 */
function windshield(ctx: CanvasRenderingContext2D, x: number, r: number, width: number): void {
  ctx.strokeStyle = '#1c3149';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x - r * 0.55, 0, r, -Math.PI * 0.42, Math.PI * 0.42);
  ctx.stroke();
}

/** 乗員（上から: 肩と頭） */
function person(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, shirt: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.2, 2.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(0.35, 0, 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f4f2'; // 帽子
  ctx.beginPath();
  ctx.arc(0.25, 0, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 竿受けの列 */
function holders(ctx: CanvasRenderingContext2D, xs: number[], y: number): void {
  ctx.fillStyle = '#c7ced6';
  ctx.strokeStyle = '#55636f';
  ctx.lineWidth = 0.4;
  for (const x of xs) {
    ctx.beginPath();
    ctx.arc(x, y, 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** 船首のレール（縁に沿った細い線） */
function bowRail(ctx: CanvasRenderingContext2D, boat: Boat, g: BoatGeom, fromX: number): void {
  ctx.save();
  // fromX より船首側だけ描く
  ctx.beginPath();
  ctx.rect(fromX, -g.B, g.L, g.B * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(80,95,110,0.9)';
  ctx.lineWidth = 0.55;
  hullPath(ctx, boat, g, 0.9);
  ctx.stroke();
  ctx.restore();
}

export interface BoatDrawOpts {
  speedKt: number;
  t: number;
  fighting: boolean;
}

/** 船体と上部構造 */
export function drawBoatBody(ctx: CanvasRenderingContext2D, boat: Boat, g: BoatGeom, o: BoatDrawOpts): void {
  const { L, B } = g;
  const stern = -L / 2;

  // 船尾のプロップウォッシュ
  if (o.speedKt > 1) {
    const k = Math.min(1, o.speedKt / 12);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.3 * k})`;
    for (let i = 0; i < 6; i++) {
      const px = stern - 2 - i * 3.2 - ((o.t * 40 + i * 5) % 3.2);
      const py = Math.sin(o.t * 12 + i * 2.1) * B * 0.28;
      ctx.beginPath();
      ctx.arc(px, py, 1.0 + i * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 影
  ctx.save();
  ctx.translate(1.5, 2);
  hullPath(ctx, boat, g);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  ctx.restore();

  // 船体（ガンネル）: 白い船体に濃紺のライン
  hullPath(ctx, boat, g);
  ctx.fillStyle = '#f7f7f5';
  ctx.fill();
  ctx.strokeStyle = boat.id === 'charter' ? '#2f4a66' : '#1e3a5f';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  // 甲板
  hullPath(ctx, boat, g, 1.4);
  ctx.fillStyle = boat.id === 'skiff' ? '#e3e7ea' : '#e2d6b8';
  ctx.fill();

  switch (boat.id) {
    case 'skiff':
      drawSkiff(ctx, boat, g, o);
      break;
    case 'sportfisher':
      drawSportfisher(ctx, boat, g, o);
      break;
    default:
      drawCharter(ctx, boat, g, o);
  }
}

/** 小型ボート: Tトップ付きセンターコンソール */
function drawSkiff(ctx: CanvasRenderingContext2D, boat: Boat, g: BoatGeom, o: BoatDrawOpts): void {
  const { L, B } = g;
  const stern = -L / 2;
  // 船首キャスティングデッキ
  box(ctx, L * 0.14, -B * 0.34, L * 0.3, B * 0.68, 1.6, '#eef0f2');
  box(ctx, L * 0.22, -B * 0.17, L * 0.14, B * 0.34, 0.8, '#f6f6f5'); // ハッチ
  bowRail(ctx, boat, g, L * 0.1);
  // 船尾: イケスとベンチ
  box(ctx, stern + 1.6, -B * 0.36, L * 0.09, B * 0.3, 0.6, '#6fb7d6');
  box(ctx, stern + 1.6, B * 0.06, L * 0.09, B * 0.3, 0.6, '#6fb7d6');
  // リーニングポスト
  box(ctx, -L * 0.2, -B * 0.16, L * 0.06, B * 0.32, 0.5, '#c8d0d8');
  // 乗員（操船）
  person(ctx, -L * 0.13, 0, 0, '#3b7dd8');
  // センターコンソール
  box(ctx, -L * 0.1, -B * 0.2, L * 0.18, B * 0.4, 1, '#f2f3f1');
  windshield(ctx, L * 0.1, B * 0.2, 1.1);
  // Tトップ（半透明の天蓋 + 4本の脚）
  ctx.fillStyle = '#4a5f75';
  for (const [x, y] of [
    [-L * 0.14, -B * 0.24],
    [-L * 0.14, B * 0.24],
    [L * 0.06, -B * 0.24],
    [L * 0.06, B * 0.24],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  roundRect(ctx, -L * 0.2, -B * 0.32, L * 0.32, B * 0.64, 2);
  ctx.fillStyle = 'rgba(30,58,95,0.55)';
  ctx.fill();
  ctx.strokeStyle = '#d8dde2';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // Tトップ後端のロケットランチャー
  ctx.fillStyle = '#c7ced6';
  for (const y of [-B * 0.2, -B * 0.07, B * 0.07, B * 0.2]) {
    ctx.beginPath();
    ctx.arc(-L * 0.19, y, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // 船外機
  box(ctx, stern - 5, -2.4, 6, 4.8, 1.3, '#2d3e50', '#1d2a38');
  ctx.fillStyle = '#4a5f75';
  ctx.fillRect(stern - 4.4, -1.5, 3.4, 3);
  ctx.fillStyle = '#9fb3c8';
  ctx.fillRect(stern - 1.4, -1.0, 1.2, 2.0);
  void o;
}

/** 遊漁船: 前寄りの操舵室＋ブリッジ、後部デッキにオーニングとイケス、両舷にずらりと竿受け */
function drawCharter(ctx: CanvasRenderingContext2D, boat: Boat, g: BoatGeom, o: BoatDrawOpts): void {
  const { L, B } = g;
  const stern = -L / 2;
  // 船首: アンカーウインチ・ハッチ・レール
  box(ctx, L * 0.3, -B * 0.16, L * 0.1, B * 0.32, 0.8, '#eeeeeb');
  ctx.fillStyle = '#7d8a99';
  ctx.fillRect(L * 0.44, -0.9, 2.2, 1.8);
  bowRail(ctx, boat, g, L * 0.2);
  // 後部デッキ: イケス（2つ）と生け簀の水
  box(ctx, -L * 0.34, -B * 0.3, L * 0.12, B * 0.22, 0.6, '#6fb7d6');
  box(ctx, -L * 0.34, B * 0.08, L * 0.12, B * 0.22, 0.6, '#6fb7d6');
  // 乗員: 後部デッキのアングラー（船尾を向く）
  person(ctx, stern + L * 0.1, -B * 0.16, Math.PI, '#e0592a');
  if (!o.fighting) person(ctx, stern + L * 0.22, B * 0.2, Math.PI * 0.6, '#3b7dd8');
  // 両舷の竿受け
  const xs = [-L * 0.46, -L * 0.38, -L * 0.3, -L * 0.22, -L * 0.14, -L * 0.06];
  holders(ctx, xs, -(B / 2 - 0.9));
  holders(ctx, xs, B / 2 - 0.9);
  // オーニング（後部デッキの日除け）: 半透明の幌と4本の支柱
  ctx.fillStyle = '#55636f';
  for (const [x, y] of [
    [-L * 0.4, -B * 0.36],
    [-L * 0.4, B * 0.36],
    [-L * 0.06, -B * 0.36],
    [-L * 0.06, B * 0.36],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  roundRect(ctx, -L * 0.42, -B * 0.4, L * 0.38, B * 0.8, 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,175,190,0.9)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // 操舵室
  const cx = -L * 0.03;
  const cw = L * 0.3;
  box(ctx, cx, -B * 0.37, cw, B * 0.74, 1.6, '#f4f4f2');
  windowRow(ctx, cx + 2, -B * 0.37, cw - 4, 1.2, 4);
  windowRow(ctx, cx + 2, B * 0.37 - 1.2, cw - 4, 1.2, 4);
  windshield(ctx, cx + cw, B * 0.3, 1.2);
  // 乗員: 操舵室のキャプテン
  person(ctx, cx + cw * 0.55, 0, 0, '#f4f4f2');
  // ブリッジ（上部操舵席）とレーダー・マスト
  box(ctx, cx + cw * 0.2, -B * 0.24, cw * 0.5, B * 0.48, 1.2, '#eceeee');
  ctx.fillStyle = '#d8dde2';
  ctx.strokeStyle = '#8895a3';
  ctx.beginPath();
  ctx.ellipse(cx + cw * 0.45, -B * 0.05, 1.6, 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#55636f';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx + cw * 0.45, 0);
  ctx.lineTo(cx + cw * 0.45, B * 0.12);
  ctx.moveTo(cx + cw * 0.3, -B * 0.14);
  ctx.lineTo(cx + cw * 0.3, -B * 0.55);
  ctx.stroke();
  ctx.fillStyle = '#ff7043';
  ctx.beginPath();
  ctx.arc(cx + cw * 0.3, -B * 0.55, 0.9, 0, Math.PI * 2);
  ctx.fill();
}

/** スポーツフィッシャー: 広いコックピット、サロン、フライブリッジ＋ハードトップ、タワー、アウトリガー */
function drawSportfisher(ctx: CanvasRenderingContext2D, boat: Boat, g: BoatGeom, o: BoatDrawOpts): void {
  const { L, B } = g;
  const stern = -L / 2;
  const houseX = -L * 0.22;
  const houseW = L * 0.36;

  // アウトリガー（ハードトップの脇から。ファイト中は畳む）とハリヤード
  for (const side of [-1, 1] as const) {
    const base = { x: houseX + houseW * 0.55, y: side * (B * 0.34) };
    const tip = o.fighting ? { x: L * 0.3, y: side * (B / 2 + 1.5) } : outriggerTip(g, side);
    ctx.strokeStyle = '#d8dde2';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    if (!o.fighting) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(stern + 3, side * (B / 2 - 1));
      ctx.stroke();
    }
    ctx.fillStyle = '#ff7043';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // コックピット: 床、カバリングボード（チーク）、トランサムドア
  ctx.fillStyle = '#d5d9dd';
  ctx.fillRect(stern + 1.2, -B * 0.4, L * 0.28, B * 0.8);
  ctx.fillStyle = '#b98b4e';
  ctx.fillRect(stern + 1.2, -B * 0.47, L * 0.28, B * 0.07);
  ctx.fillRect(stern + 1.2, B * 0.4, L * 0.28, B * 0.07);
  ctx.fillRect(stern, -B * 0.42, 1.4, B * 0.84);
  ctx.fillStyle = '#8fa0b2';
  ctx.fillRect(stern, B * 0.12, 1.4, B * 0.2); // トランサムドア
  // ファイティングチェア（台座・座面・背もたれ・フットレスト）
  const chx = stern + L * 0.13;
  ctx.fillStyle = '#7d8a99';
  ctx.beginPath();
  ctx.arc(chx, 0, 1.3, 0, Math.PI * 2);
  ctx.fill();
  box(ctx, chx - 1.6, -2.1, 3.4, 4.2, 0.9, '#f4f4f2', '#7d8a99');
  ctx.fillStyle = '#e3b04b';
  ctx.fillRect(chx + 1.4, -2.3, 0.9, 4.6);
  ctx.fillRect(chx - 3.6, -1.1, 2.0, 2.2);
  // メザニン（コックピット前方のベンチ）とクーラー
  box(ctx, stern + L * 0.23, -B * 0.34, L * 0.05, B * 0.68, 0.6, '#c8d0d8');
  // 乗員: ファイト中はアングラーが椅子に、通常はメイトがコックピットに
  if (o.fighting) person(ctx, chx, 0, Math.PI, '#e0592a');
  else person(ctx, stern + L * 0.19, B * 0.22, Math.PI * 0.8, '#e0592a');

  // サロン（キャビン）
  box(ctx, houseX, -B * 0.4, houseW, B * 0.8, 2.2, '#f4f4f2');
  windowRow(ctx, houseX + 2, -B * 0.4, houseW - 4, 1.4, 4);
  windowRow(ctx, houseX + 2, B * 0.4 - 1.4, houseW - 4, 1.4, 4);
  // フライブリッジ
  const fbX = houseX + houseW * 0.2;
  const fbW = houseW * 0.7;
  box(ctx, fbX, -B * 0.3, fbW, B * 0.6, 2, '#e9ecee');
  // ヘルム席のキャプテン
  person(ctx, fbX + fbW * 0.62, 0, 0, '#f4f4f2');
  windshield(ctx, fbX + fbW, B * 0.24, 1.3);
  // ハードトップ（半透明で下が透ける）＋ロケットランチャー
  roundRect(ctx, fbX - 1, -B * 0.34, fbW + 1, B * 0.68, 2.4);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  ctx.strokeStyle = '#c3cbd3';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = '#c7ced6';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(fbX - 0.4, -B * 0.25 + (B * 0.5 * i) / 5, 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // レーダー・アンテナ
  ctx.fillStyle = '#d8dde2';
  ctx.strokeStyle = '#8895a3';
  ctx.beginPath();
  ctx.ellipse(fbX + fbW * 0.35, -B * 0.14, 1.7, 1.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#55636f';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(fbX + fbW * 0.35, B * 0.1);
  ctx.lineTo(fbX + fbW * 0.35, B * 0.5);
  ctx.moveTo(fbX + fbW * 0.15, B * 0.05);
  ctx.lineTo(fbX + fbW * 0.15, B * 0.42);
  ctx.stroke();
  // タワー: 4本の脚と上部の小さな見張り台
  ctx.strokeStyle = '#8fa0b2';
  ctx.lineWidth = 0.55;
  const tx = fbX + fbW * 0.5;
  for (const [x, y] of [
    [fbX + 1, -B * 0.3],
    [fbX + 1, B * 0.3],
    [fbX + fbW - 1, -B * 0.3],
    [fbX + fbW - 1, B * 0.3],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, 0);
    ctx.stroke();
  }
  box(ctx, tx - 1.8, -1.3, 3.6, 2.6, 0.6, 'rgba(255,255,255,0.85)', '#8fa0b2');

  // 船首デッキ: ハッチ、クリート、パルピット、レール
  box(ctx, L * 0.2, -B * 0.19, L * 0.12, B * 0.38, 1.1, '#f0f0ee');
  ctx.fillStyle = '#7d8a99';
  ctx.fillRect(L * 0.42, -0.9, 3.2, 1.8);
  for (const y of [-B * 0.36, B * 0.36]) ctx.fillRect(L * 0.3, y - 0.5, 2.2, 1);
  bowRail(ctx, boat, g, L * 0.16);
}

/** 竿（竿受けから後方外側へ）とリール */
export function drawRods(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  g: BoatGeom,
  placements: LurePlacement[],
  statuses: RodStatus[],
  fighting: boolean,
): void {
  placements.forEach((p, i) => {
    const pose = rodPose(boat, g, p);
    const st = statuses[i];
    const hooked = st === 'hooked';
    // ファイト中: 掛かった竿は船尾中央に立てて曲げる。他は畳む
    let holder = pose.holder;
    let tip = pose.tip;
    if (fighting) {
      if (hooked) {
        holder = { x: -g.L / 2 + g.L * 0.2, y: 0 };
        tip = { x: -g.L / 2 - g.L * 0.22, y: 0 };
      } else {
        tip = { x: holder.x + g.L * 0.16, y: holder.y * 0.9 };
      }
    }
    ctx.lineCap = 'round';
    // 竿の曲がり: 掛かっているときは大きく
    const bend = hooked ? 0.35 : st === 'out' ? 0.12 : 0.03;
    const mx = (holder.x + tip.x) / 2;
    const my = (holder.y + tip.y) / 2;
    const dx = tip.x - holder.x;
    const dy = tip.y - holder.y;
    // 曲がりは竿の外側（右舷竿は右へ、左舷竿は左へ）。中央竿はまっすぐ
    const side = fighting && hooked ? 0 : p.side;
    const cpx = mx + dx * 0.1;
    const cpy = my + dy * 0.1 + bend * 4 * side;
    // バット（太い）→ ティップ（細い）
    ctx.strokeStyle = hooked ? '#ffb74d' : '#2b2f36';
    ctx.lineWidth = hooked ? 2.0 : 1.5;
    ctx.beginPath();
    ctx.moveTo(holder.x, holder.y);
    ctx.lineTo(holder.x + dx * 0.3, holder.y + dy * 0.3);
    ctx.stroke();
    ctx.lineWidth = hooked ? 1.2 : 0.8;
    ctx.beginPath();
    ctx.moveTo(holder.x + dx * 0.3, holder.y + dy * 0.3);
    ctx.quadraticCurveTo(cpx, cpy, tip.x, tip.y);
    ctx.stroke();
    // 両軸リール（小さな箱）
    ctx.save();
    ctx.translate(holder.x + dx * 0.18, holder.y + dy * 0.18);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = hooked ? '#ffd54f' : '#c9a24a';
    ctx.fillRect(-1.1, -1.0, 2.2, 2.0);
    ctx.fillStyle = '#5a4a1f';
    ctx.fillRect(-0.4, -1.4, 0.8, 0.5);
    ctx.restore();
  });
}
