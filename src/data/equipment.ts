import type { SpeciesId } from './species';

export interface Boat {
  id: string;
  name: string;
  desc: string;
  maxSpeedKt: number;
  maxRods: number;
  /** 到達できる沖の限界（0..1、マップ縦方向の割合） */
  offshoreLimit: number;
  /** 竿ごとの効率（アウトリガーなどで仕掛けが広がると高い） */
  rodEfficiency: number;
  /** 描画サイズ倍率 */
  visualScale: number;
}

export const BOATS: Boat[] = [
  {
    id: 'skiff',
    name: '小型ボート',
    desc: '小回りは利くが遅く、沖の黒潮本流までは出られない。竿2本まで。',
    maxSpeedKt: 9,
    maxRods: 2,
    offshoreLimit: 0.45,
    rodEfficiency: 0.9,
    visualScale: 0.8,
  },
  {
    id: 'charter',
    name: '遊漁船',
    desc: '標準的な乗合船。竿4本まで。かなり沖まで出られる。',
    maxSpeedKt: 14,
    maxRods: 4,
    offshoreLimit: 0.85,
    rodEfficiency: 1.0,
    visualScale: 1.0,
  },
  {
    id: 'sportfisher',
    name: 'スポーツフィッシャー',
    desc: '高速で最も沖まで到達。アウトリガーで竿5本を広く展開できる。',
    maxSpeedKt: 22,
    maxRods: 5,
    offshoreLimit: 1.0,
    rodEfficiency: 1.15,
    visualScale: 1.2,
  },
];

export interface Reel {
  id: string;
  name: string;
  classLb: number;
  maxDragKg: number;
  capacityM: number;
  /** 巻き取り速度 m/s（負荷なし時の基礎値） */
  retrieveMps: number;
}

export const REELS: Reel[] = [
  { id: 'r30', name: '30lbクラス', classLb: 30, maxDragKg: 8, capacityM: 550, retrieveMps: 2.2 },
  { id: 'r50', name: '50lbクラス', classLb: 50, maxDragKg: 14, capacityM: 750, retrieveMps: 2.0 },
  { id: 'r80', name: '80lbクラス', classLb: 80, maxDragKg: 24, capacityM: 900, retrieveMps: 1.8 },
  { id: 'r130', name: '130lbクラス', classLb: 130, maxDragKg: 40, capacityM: 1000, retrieveMps: 1.5 },
];

export interface Line {
  id: string;
  name: string;
  lb: number;
  strengthKg: number;
  /** 太いと見切られやすい: ヒット率の倍率 */
  strikeFactor: number;
}

export const LINES: Line[] = [
  { id: 'l30', name: '30lb（細い）', lb: 30, strengthKg: 13.6, strikeFactor: 1.0 },
  { id: 'l50', name: '50lb', lb: 50, strengthKg: 22.7, strikeFactor: 0.9 },
  { id: 'l80', name: '80lb', lb: 80, strengthKg: 36.3, strikeFactor: 0.78 },
  { id: 'l130', name: '130lb（太い）', lb: 130, strengthKg: 59.0, strikeFactor: 0.62 },
];

export interface Lure {
  id: string;
  name: string;
  desc: string;
  /** 有効な曳航速度（kt） */
  minSpeedKt: number;
  maxSpeedKt: number;
  speciesFactor: Record<SpeciesId, number>;
}

export const LURES: Lure[] = [
  {
    id: 'skirted',
    name: 'スカートルアー',
    desc: '万能型。5〜9ktで曳く。マカジキ・バショウカジキに強い。',
    minSpeedKt: 5,
    maxSpeedKt: 9,
    speciesFactor: { sailfish: 1.0, striped: 1.2, blue: 0.9, black: 0.6, swordfish: 0.2, spearfish: 1.0 },
  },
  {
    id: 'kona',
    name: 'コナヘッド（大型）',
    desc: '大型カジキ狙いの大きなルアー。6〜10ktで曳く。小物は寄りにくい。',
    minSpeedKt: 6,
    maxSpeedKt: 10,
    speciesFactor: { sailfish: 0.4, striped: 0.7, blue: 1.4, black: 1.1, swordfish: 0.2, spearfish: 0.3 },
  },
  {
    id: 'yumizuno',
    name: '弓角',
    desc: '小さな和製ルアー。速く曳ける（6〜11kt）。バショウカジキ・フウライカジキ向き。',
    minSpeedKt: 6,
    maxSpeedKt: 11,
    speciesFactor: { sailfish: 1.4, striped: 0.9, blue: 0.3, black: 0.2, swordfish: 0.1, spearfish: 1.4 },
  },
  {
    id: 'livebait',
    name: '生き餌（ムロアジ）',
    desc: 'ゆっくり流す（〜4.5kt）。スロットルを落として潮に乗せると効く。大物に強い。',
    minSpeedKt: 0.8,
    maxSpeedKt: 4.5,
    speciesFactor: { sailfish: 1.1, striped: 1.3, blue: 1.2, black: 1.5, swordfish: 1.0, spearfish: 0.6 },
  },
];

export interface TackleConfig {
  boat: Boat;
  rodCount: number;
  reel: Reel;
  line: Line;
  lure: Lure;
}

export const boatById = (id: string): Boat => BOATS.find((b) => b.id === id)!;
export const reelById = (id: string): Reel => REELS.find((r) => r.id === id)!;
export const lineById = (id: string): Line => LINES.find((l) => l.id === id)!;
export const lureById = (id: string): Lure => LURES.find((l) => l.id === id)!;

/** タックルの組み合わせに対する注意点 */
export function tackleWarnings(t: TackleConfig): string[] {
  const w: string[] = [];
  const safeDrag = t.line.strengthKg / 1.35;
  if (t.reel.maxDragKg > safeDrag) {
    w.push(
      `リールの最大ドラグ(${t.reel.maxDragKg}kg)がライン強度を超えています。ファイト中はドラグを約${safeDrag.toFixed(1)}kg以下に。`,
    );
  }
  if (t.line.lb > t.reel.classLb) {
    w.push('リールのクラスよりラインが太いです。糸巻き量が減り、ヒット率も下がります。');
  }
  if (t.lure.id === 'livebait') {
    w.push('生き餌は低速で流す釣りです。スロットルをほぼ0にして潮に乗せてください。');
  }
  if (t.boat.offshoreLimit < 0.6) {
    w.push('この船は沖の黒潮本流まで出られません。クロカジキ・シロカジキは狙いにくいです。');
  }
  return w;
}
