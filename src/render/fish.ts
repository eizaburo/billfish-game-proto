import type { Species, SpeciesId } from '../data/species';

/** 種ごとの体型・配色 */
interface Look {
  /** 吻の長さ（全長比） */
  bill: number;
  /** 吻の太さ（全長比） */
  billW: number;
  dorsal: 'sail' | 'tall' | 'low' | 'crescent' | 'long';
  /** 背びれの高さ（全長比） */
  dorsalH: number;
  /** 横から見た体高の半分（全長比） */
  bodyH: number;
  /** 上から見た体幅の半分（全長比） */
  bodyW: number;
  back: string;
  flank: string;
  belly: string;
  fin: string;
  /** 縞の濃さ 0..1 */
  stripes: number;
  spots: boolean;
  pelvic: boolean;
}

const LOOKS: Record<SpeciesId, Look> = {
  sailfish: {
    bill: 0.22, billW: 0.012, dorsal: 'sail', dorsalH: 0.34, bodyH: 0.085, bodyW: 0.1,
    back: '#1b3f8c', flank: '#4d7fc2', belly: '#e8eef6', fin: '#2a4aa8', stripes: 0.6, spots: true, pelvic: true,
  },
  striped: {
    bill: 0.2, billW: 0.013, dorsal: 'tall', dorsalH: 0.24, bodyH: 0.095, bodyW: 0.085,
    back: '#233a78', flank: '#6f8fd0', belly: '#eef1f7', fin: '#2c3f80', stripes: 1.0, spots: false, pelvic: true,
  },
  blue: {
    bill: 0.18, billW: 0.016, dorsal: 'low', dorsalH: 0.15, bodyH: 0.11, bodyW: 0.0955,
    back: '#0a2a6e', flank: '#3f6cb8', belly: '#e6ecf4', fin: '#0f2f70', stripes: 0.35, spots: false, pelvic: true,
  },
  black: {
    bill: 0.15, billW: 0.017, dorsal: 'low', dorsalH: 0.12, bodyH: 0.12, bodyW: 0.11,
    back: '#1e2b38', flank: '#586c80', belly: '#e9ecef', fin: '#1a252f', stripes: 0.12, spots: false, pelvic: true,
  },
  swordfish: {
    bill: 0.3, billW: 0.03, dorsal: 'crescent', dorsalH: 0.22, bodyH: 0.1, bodyW: 0.07,
    back: '#3a3448', flank: '#7a6f8a', belly: '#e3dfe8', fin: '#2e2a3a', stripes: 0, spots: false, pelvic: false,
  },
  spearfish: {
    bill: 0.1, billW: 0.01, dorsal: 'long', dorsalH: 0.17, bodyH: 0.075, bodyW: 0.068,
    back: '#1d6b74', flank: '#4fa3aa', belly: '#eaf3f3', fin: '#1a5a66', stripes: 0.3, spots: false, pelvic: true,
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 色 a を色 b に t だけ寄せる */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bb = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bb})`;
}

const WATER = '#164c78';

/** 体の太さの分布。u=0 尾柄、u=1 吻の根元。肩(u≈0.65)が最も太い */
function girth(u: number): number {
  return Math.pow(Math.sin(Math.PI * Math.pow(u, 1.6)), 0.9);
}

export interface TopViewOpts {
  /** 全長 px */
  L: number;
  /** 尾振りの位相 */
  phase: number;
  /** 尾振りの大きさ 0..1 */
  swim: number;
  /** 深さ 0..1。深いほど水色に沈んで薄くなる */
  depth: number;
  /** 興奮して縞が浮き出る */
  excited: boolean;
}

/**
 * 上から見たカジキ。ローカル座標で +x が頭。原点は体の中心付近。
 */
export function drawFishTop(ctx: CanvasRenderingContext2D, species: Species, o: TopViewOpts): void {
  const look = LOOKS[species.id];
  const { L } = o;
  const d = Math.min(1, o.depth);
  const back = mix(look.back, WATER, d * 0.75);
  const fin = mix(look.fin, WATER, d * 0.75);
  const alpha = 1 - 0.6 * d;

  const xt = -L * 0.5 + L * 0.12; // 尾柄（尾びれの付け根）
  const xh = L * 0.5 - look.bill * L; // 吻の根元
  const N = 26;
  const amp = L * (0.012 + 0.03 * o.swim);
  const centre: { x: number; y: number }[] = [];
  const half: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = xt + (xh - xt) * u;
    const w = Math.max(L * look.bodyW * girth(u), L * 0.012);
    const off = amp * Math.sin(x / (L * 0.22) - o.phase) * Math.pow(1 - u, 1.6);
    centre.push({ x, y: off });
    half.push(w);
  }

  ctx.save();
  ctx.globalAlpha *= alpha;
  if ('filter' in ctx && d > 0.2) ctx.filter = `blur(${(d * 1.6).toFixed(1)}px)`;

  // 尾びれ（上から見ると細いV）
  const tailAng = Math.atan2(centre[1].y - centre[0].y, centre[1].x - centre[0].x);
  ctx.save();
  ctx.translate(centre[0].x, centre[0].y);
  ctx.rotate(tailAng);
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(0, -L * 0.02);
  ctx.lineTo(-L * 0.13, -L * 0.085);
  ctx.lineTo(-L * 0.1, 0);
  ctx.lineTo(-L * 0.13, L * 0.085);
  ctx.lineTo(0, L * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 胸びれ（肩から後ろ斜めに開く）
  const is = Math.round(N * 0.7);
  const ps = centre[is];
  const ws = half[is];
  ctx.fillStyle = fin;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(ps.x, ps.y + side * ws * 0.6);
    ctx.quadraticCurveTo(ps.x - L * 0.07, ps.y + side * (ws + L * 0.07), ps.x - L * 0.17, ps.y + side * (ws + L * 0.085));
    ctx.quadraticCurveTo(ps.x - L * 0.09, ps.y + side * (ws + L * 0.02), ps.x - L * 0.06, ps.y + side * ws * 0.9);
    ctx.closePath();
    ctx.fill();
  }

  // 体
  ctx.beginPath();
  for (let i = 0; i <= N; i++) ctx.lineTo(centre[i].x, centre[i].y - half[i]);
  for (let i = N; i >= 0; i--) ctx.lineTo(centre[i].x, centre[i].y + half[i]);
  ctx.closePath();
  ctx.fillStyle = back;
  ctx.fill();
  // 脇腹の銀色の照り返し
  ctx.strokeStyle = `rgba(255,255,255,${0.16 * (1 - d)})`;
  ctx.lineWidth = Math.max(0.6, L * 0.01);
  ctx.stroke();
  // 背の稜線（背びれは畳まれて線に見える）
  ctx.strokeStyle = `rgba(150,200,255,${0.4 * (1 - d)})`;
  ctx.lineWidth = Math.max(0.8, L * 0.012);
  ctx.beginPath();
  for (let i = Math.round(N * 0.3); i <= Math.round(N * 0.9); i++) ctx.lineTo(centre[i].x, centre[i].y);
  ctx.stroke();
  // 縞
  if (look.stripes > 0) {
    const a = look.stripes * (o.excited ? 0.85 : 0.35) * (1 - d);
    ctx.strokeStyle = `rgba(170,215,255,${a})`;
    ctx.lineWidth = Math.max(0.8, L * 0.012);
    for (let i = Math.round(N * 0.22); i <= Math.round(N * 0.86); i += 2) {
      const c = centre[i];
      const w = half[i] * 0.62;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - w);
      ctx.lineTo(c.x, c.y + w);
      ctx.stroke();
    }
  }

  // 吻
  const hx = centre[N].x;
  const hy = centre[N].y;
  ctx.fillStyle = mix('#2b3a4a', WATER, d * 0.75);
  ctx.beginPath();
  ctx.moveTo(hx, hy - L * look.billW);
  ctx.lineTo(L * 0.5, hy);
  ctx.lineTo(hx, hy + L * look.billW);
  ctx.closePath();
  ctx.fill();

  // 目
  const ie = Math.round(N * 0.93);
  ctx.fillStyle = `rgba(0,0,0,${0.7 * (1 - d)})`;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(centre[ie].x, centre[ie].y + side * half[ie] * 0.75, Math.max(0.6, L * 0.012), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface SideViewOpts {
  L: number;
  phase: number;
  excited: boolean;
  /** 体の反り（ジャンプ中） -1..1 */
  arch: number;
}

/**
 * 横から見たカジキ（ジャンプ用）。+x が頭、-y が背。
 */
export function drawFishSide(ctx: CanvasRenderingContext2D, species: Species, o: SideViewOpts): void {
  const look = LOOKS[species.id];
  const { L } = o;
  const H = L * look.bodyH;
  const xt = -L * 0.5 + L * 0.14;
  const xh = L * 0.5 - look.bill * L;
  const N = 28;
  const ux = (u: number) => xt + (xh - xt) * u;
  const archY = (x: number) => o.arch * L * 0.12 * Math.pow(x / L, 2) * Math.sign(x);
  const backY = (u: number) => -H * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.35)), 0.85) + archY(ux(u));
  const bellyY = (u: number) => H * 1.05 * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.15)), 0.9) + archY(ux(u));

  ctx.save();

  // 尾びれ（三日月）
  const ty = archY(xt);
  ctx.fillStyle = look.fin;
  ctx.beginPath();
  ctx.moveTo(xt + L * 0.02, ty - H * 0.35);
  ctx.quadraticCurveTo(xt - L * 0.05, ty - L * 0.12, xt - L * 0.15, ty - L * 0.19);
  ctx.quadraticCurveTo(xt - L * 0.09, ty - L * 0.06, xt - L * 0.07, ty);
  ctx.quadraticCurveTo(xt - L * 0.09, ty + L * 0.06, xt - L * 0.15, ty + L * 0.19);
  ctx.quadraticCurveTo(xt - L * 0.05, ty + L * 0.12, xt + L * 0.02, ty + H * 0.35);
  ctx.closePath();
  ctx.fill();

  // 背びれ
  ctx.fillStyle = look.fin;
  ctx.beginPath();
  const dh = L * look.dorsalH;
  switch (look.dorsal) {
    case 'sail': {
      ctx.moveTo(ux(0.3), backY(0.3));
      ctx.quadraticCurveTo(ux(0.45), backY(0.45) - dh * 1.15, ux(0.65), backY(0.65) - dh);
      ctx.quadraticCurveTo(ux(0.82), backY(0.82) - dh * 0.75, ux(0.9), backY(0.9));
      break;
    }
    case 'tall': {
      ctx.moveTo(ux(0.42), backY(0.42));
      ctx.quadraticCurveTo(ux(0.7), backY(0.7) - dh * 0.25, ux(0.8), backY(0.8) - dh);
      ctx.lineTo(ux(0.86), backY(0.86));
      break;
    }
    case 'low': {
      ctx.moveTo(ux(0.45), backY(0.45));
      ctx.quadraticCurveTo(ux(0.7), backY(0.7) - dh * 0.2, ux(0.79), backY(0.79) - dh);
      ctx.lineTo(ux(0.85), backY(0.85));
      break;
    }
    case 'crescent': {
      ctx.moveTo(ux(0.68), backY(0.68));
      ctx.quadraticCurveTo(ux(0.74), backY(0.74) - dh * 0.5, ux(0.74), backY(0.74) - dh);
      ctx.quadraticCurveTo(ux(0.83), backY(0.83) - dh * 0.5, ux(0.88), backY(0.88));
      break;
    }
    case 'long': {
      ctx.moveTo(ux(0.3), backY(0.3));
      ctx.quadraticCurveTo(ux(0.5), backY(0.5) - dh * 1.1, ux(0.75), backY(0.75) - dh * 0.9);
      ctx.lineTo(ux(0.86), backY(0.86));
      break;
    }
  }
  ctx.closePath();
  ctx.fill();
  if (look.spots) {
    ctx.fillStyle = 'rgba(10,15,40,0.55)';
    for (let i = 0; i < 14; i++) {
      const u = 0.36 + ((i * 0.618) % 1) * 0.5;
      const k = 0.25 + ((i * 0.377) % 1) * 0.55;
      ctx.beginPath();
      ctx.arc(ux(u), backY(u) - dh * k * Math.sin(Math.PI * (u - 0.3) / 0.6), L * 0.01, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 第二背びれ・臀びれ
  ctx.beginPath();
  ctx.moveTo(ux(0.1), backY(0.1));
  ctx.lineTo(ux(0.17), backY(0.17) - H * 0.35);
  ctx.lineTo(ux(0.2), backY(0.2));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ux(0.25), bellyY(0.25));
  ctx.lineTo(ux(0.3), bellyY(0.3) + H * 0.55);
  ctx.lineTo(ux(0.36), bellyY(0.36));
  ctx.closePath();
  ctx.fill();

  // 体（背→脇→腹のグラデーション）
  ctx.beginPath();
  for (let i = 0; i <= N; i++) ctx.lineTo(ux(i / N), backY(i / N));
  for (let i = N; i >= 0; i--) ctx.lineTo(ux(i / N), bellyY(i / N));
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, -H + archY(0), 0, H * 1.05 + archY(0));
  grad.addColorStop(0, look.back);
  grad.addColorStop(0.5, look.flank);
  grad.addColorStop(0.7, look.belly);
  grad.addColorStop(1, look.belly);
  ctx.fillStyle = grad;
  ctx.fill();
  // 縞
  if (look.stripes > 0) {
    ctx.strokeStyle = `rgba(150,205,255,${look.stripes * (o.excited ? 0.9 : 0.45)})`;
    ctx.lineWidth = Math.max(0.8, L * 0.011);
    for (let u = 0.2; u <= 0.86; u += 0.062) {
      ctx.beginPath();
      ctx.moveTo(ux(u), backY(u) + H * 0.1);
      ctx.lineTo(ux(u) - L * 0.01, (backY(u) + bellyY(u)) / 2 + H * 0.35);
      ctx.stroke();
    }
  }
  // 鰓
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = Math.max(0.8, L * 0.008);
  ctx.beginPath();
  ctx.moveTo(ux(0.86), backY(0.86) + H * 0.2);
  ctx.quadraticCurveTo(ux(0.83), (backY(0.86) + bellyY(0.86)) / 2, ux(0.87), bellyY(0.86) - H * 0.1);
  ctx.stroke();

  // 胸びれ（鎌形）・腹びれ
  ctx.fillStyle = look.fin;
  ctx.beginPath();
  ctx.moveTo(ux(0.74), bellyY(0.74) - H * 0.6);
  ctx.quadraticCurveTo(ux(0.62), bellyY(0.62) + H * 0.3, ux(0.5), bellyY(0.5) + H * 0.7);
  ctx.quadraticCurveTo(ux(0.62), bellyY(0.62) - H * 0.1, ux(0.7), bellyY(0.7) - H * 0.35);
  ctx.closePath();
  ctx.fill();
  if (look.pelvic) {
    ctx.strokeStyle = look.fin;
    ctx.lineWidth = Math.max(0.8, L * 0.008);
    ctx.beginPath();
    ctx.moveTo(ux(0.68), bellyY(0.68));
    ctx.lineTo(ux(0.52), bellyY(0.52) + H * 0.75);
    ctx.stroke();
  }

  // 吻と下顎
  const hx = ux(1);
  const hy = (backY(1) + bellyY(1)) / 2;
  ctx.fillStyle = '#2b3a4a';
  ctx.beginPath();
  ctx.moveTo(hx - L * 0.02, hy - H * 0.45);
  ctx.lineTo(L * 0.5, hy - H * 0.3 + archY(L * 0.5));
  ctx.lineTo(hx - L * 0.02, hy - H * 0.45 + L * look.billW * 2.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2b3a4a';
  ctx.lineWidth = Math.max(0.8, L * 0.008);
  ctx.beginPath();
  ctx.moveTo(hx - L * 0.02, hy + H * 0.1);
  ctx.lineTo(hx + L * 0.06, hy - H * 0.1);
  ctx.stroke();

  // 目
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ux(0.93), backY(0.93) + H * 0.45, Math.max(1, H * 0.2), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0a14';
  ctx.beginPath();
  ctx.arc(ux(0.93), backY(0.93) + H * 0.45, Math.max(0.6, H * 0.12), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
